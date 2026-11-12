import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT_DIR = resolve(process.cwd());
const SRC_DIR = join(ROOT_DIR, 'src');

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(js|jsx|ts|tsx)$/i.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('Static Security & Firestore Rules Audit', () => {
  it('locks exam_keys collection strictly in firestore.rules (allow read, write: if false;)', () => {
    const rules = readFileSync(join(ROOT_DIR, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/match\s+\/exam_keys\/\{classId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
  });

  it('prevents client users from modifying role, nim, nidn, or password in firestore.rules', () => {
    const rules = readFileSync(join(ROOT_DIR, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/hasAny\(\['role',\s*'nim',\s*'nidn',\s*'password'\]\)/);
    expect(rules).toMatch(/!\('password'\s+in\s+request\.resource\.data\)/);
  });

  it('ensures src/ contains zero references to correctIndex, firebase-admin, window.alert, or window.confirm', () => {
    const srcFiles = collectSourceFiles(SRC_DIR);
    expect(srcFiles.length).toBeGreaterThan(0);

    const forbiddenPatterns = [
      { label: 'correctIndex', regex: /\bcorrectIndex\b/ },
      { label: 'firebase-admin', regex: /firebase-admin/ },
      { label: 'window.alert', regex: /\bwindow\.alert\b/ },
      { label: 'window.confirm', regex: /\bwindow\.confirm\b/ },
      { label: 'dangerouslySetInnerHTML', regex: /dangerouslySetInnerHTML/ },
    ];

    const violations = [];
    for (const filePath of srcFiles) {
      const content = stripComments(readFileSync(filePath, 'utf8'));
      for (const { label, regex } of forbiddenPatterns) {
        if (regex.test(content)) {
          violations.push(`${filePath}: matched forbidden pattern ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('ensures src/firebase.js contains zero hardcoded pinteru-30b26 fallback project IDs', () => {
    const firebaseClient = readFileSync(join(SRC_DIR, 'firebase.js'), 'utf8');
    expect(firebaseClient).not.toContain('pinteru-30b26');
    expect(firebaseClient).toContain('persistentLocalCache');
    expect(firebaseClient).toContain('persistentMultipleTabManager');
  });
});
