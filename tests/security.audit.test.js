import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  FORBIDDEN_COLLECTIONS,
  TARGET_COLLECTIONS,
  assertSafeCollection,
  parseCleanupFlags,
  planCleanupTargets,
} from '../scripts/cleanup-corrupt-data.mjs';

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

  it('ensures no module in src/ references mockData, GeneralDashboard, devOnlyKey, computeLocalDevScore, or hardcoded subj_pbo fallback', () => {
    expect(existsSync(join(SRC_DIR, 'components', 'dashboard', 'GeneralDashboard.jsx'))).toBe(false);
    expect(existsSync(join(SRC_DIR, 'services', 'mockData.js'))).toBe(false);

    const srcFiles = collectSourceFiles(SRC_DIR);
    const violations = [];

    for (const filePath of srcFiles) {
      const content = stripComments(readFileSync(filePath, 'utf8'));
      if (/services\/mockData|\bmockData\b/.test(content)) {
        violations.push(`${filePath}: imports or references mockData`);
      }
      if (/GeneralDashboard/.test(content)) {
        violations.push(`${filePath}: references removed GeneralDashboard`);
      }
      if (/devOnlyKey|computeLocalDevScore/.test(content)) {
        violations.push(`${filePath}: contains removed devOnlyKey/computeLocalDevScore`);
      }
      if (/subj_pbo/.test(content)) {
        violations.push(`${filePath}: contains hardcoded subj_pbo`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('enforces class ownership and membership isolation in firestore.rules and syncs firestore.indexes.json', () => {
    const rules = readFileSync(join(ROOT_DIR, 'firestore.rules'), 'utf8');
    expect(rules).not.toMatch(/match\s+\/classes\/\{classId\}[\s\S]*?allow\s+read:\s*if\s+isSignedIn\(\)\s*\|\|\s*resource\.data\.isPublic/);
    expect(rules).toMatch(/isClassMember\(classId,\s*request\.auth\.uid\)/);
    expect(rules).toMatch(/isClassLecturer\(resource\.data\.classId\)/);
    expect(rules).not.toMatch(/allow\s+create,\s*update,\s*delete:\s*if\s+isLecturerOrAdmin\(\);/);

    const indexes = JSON.parse(readFileSync(join(ROOT_DIR, 'firestore.indexes.json'), 'utf8'));
    const indexKeys = (indexes.indexes || []).map((idx) =>
      `${idx.collectionGroup}:${idx.fields.map((f) => f.fieldPath).join(',')}`
    );
    expect(indexKeys).toContain('submissions:classId,uid');
    expect(indexKeys).toContain('submissions:classId,submittedAt');
    expect(indexKeys).toContain('exam_attempts:classId,uid');
    expect(indexKeys).toContain('learning_progress:classId,uid');
    expect(indexKeys).not.toContain('submissions:assignmentId,submittedAt');

    const serviceCode = readFileSync(join(SRC_DIR, 'services', 'lmsFirestoreService.js'), 'utf8');
    expect(serviceCode).not.toMatch(/\bfetchClassExamAttempt\b/);
  });

  it('keeps scripts/cleanup-corrupt-data.mjs in dry-run mode by default and never touches users collection', () => {
    expect(parseCleanupFlags([])).toEqual({
      dryRun: true,
      execute: false,
      includeSeeded: false,
    });
    expect(parseCleanupFlags(['--dry-run'])).toEqual({
      dryRun: true,
      execute: false,
      includeSeeded: false,
    });
    expect(parseCleanupFlags(['--execute', '--include-seeded'])).toEqual({
      dryRun: false,
      execute: true,
      includeSeeded: true,
    });

    expect(FORBIDDEN_COLLECTIONS.has('users')).toBe(true);
    expect(TARGET_COLLECTIONS).not.toContain('users');
    expect(() => assertSafeCollection('users')).toThrow(/dilarang disentuh/i);
    expect(() => assertSafeCollection('unknown_collection')).toThrow();

    const sampleDb = {
      classes: [
        { id: 'cls_valid', data: { lecturerId: 'uid_dosen_real', meetings: [] } },
        { id: 'cls_missing_lec', data: { name: 'Tanpa Dosen' } },
        {
          id: 'cls_corrupt_16',
          data: {
            lecturerId: 'uid_dosen_real',
            meetings: Array.from({ length: 16 }, (_, idx) => ({
              order: idx + 1,
              title: `Modul Pembelajaran ${String(idx + 1).padStart(2, '0')}`,
            })),
          },
        },
        {
          id: 'subj_pbo',
          data: {
            lecturerId: 'uid_dosen_real',
            meetings: Array.from({ length: 16 }, (_, idx) => ({
              order: idx + 1,
              title: `Modul Pembelajaran ${String(idx + 1).padStart(2, '0')}`,
            })),
          },
        },
      ],
      assignments: [
        { id: 'asg_valid', data: { classId: 'cls_valid' } },
        { id: 'asg_01', data: { classId: 'subj_pbo' } },
        { id: 'asg_orphan', data: { classId: 'cls_corrupt_16' } },
      ],
      submissions: [
        { id: 'sub_valid', data: { classId: 'cls_valid' } },
        { id: 'sub_missing_cid', data: {} },
      ],
      exam_attempts: [
        { id: 'cls_valid_m1_pretest_uid1', data: { classId: 'cls_valid' } },
        { id: 'cls_valid_uid1', data: { classId: 'cls_valid' } },
      ],
      exam_keys: [
        { id: 'cls_valid', data: {} },
        { id: 'cls_corrupt_16', data: {} },
      ],
    };

    const defaultPlan = planCleanupTargets(sampleDb);
    expect(defaultPlan.survivingClassIds).toEqual(['cls_valid', 'subj_pbo']);
    expect(defaultPlan.targets.classes).toEqual([
      { id: 'cls_missing_lec', reason: 'missing_or_demo_lecturerId' },
      { id: 'cls_corrupt_16', reason: 'corrupt_autoseed_16_meetings' },
    ]);
    expect(defaultPlan.targets.assignments).toEqual([
      { id: 'asg_orphan', reason: 'orphan_classId_cls_corrupt_16' },
    ]);
    expect(defaultPlan.targets.submissions).toEqual([
      { id: 'sub_missing_cid', reason: 'missing_classId' },
    ]);
    expect(defaultPlan.targets.exam_attempts).toEqual([
      { id: 'cls_valid_uid1', reason: 'legacy_exam_attempt_id_without_meeting_type' },
    ]);
    expect(defaultPlan.targets.exam_keys).toEqual([
      { id: 'cls_corrupt_16', reason: 'orphan_exam_key_missing_parent_class' },
    ]);

    const includeSeededPlan = planCleanupTargets(sampleDb, { includeSeeded: true });
    expect(includeSeededPlan.survivingClassIds).toEqual(['cls_valid']);
    expect(includeSeededPlan.targets.classes.map((item) => item.id)).toContain('subj_pbo');
    expect(includeSeededPlan.targets.assignments.map((item) => item.id)).toContain('asg_01');
  });

  it('locks accountType and isInstitutional in firestore.rules and delegates user role bootstrap from AuthContext to /api/bootstrap', () => {
    const rules = readFileSync(join(ROOT_DIR, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/!\('accountType'\s+in\s+request\.resource\.data\)/);
    expect(rules).toMatch(/!\('isInstitutional'\s+in\s+request\.resource\.data\)/);
    expect(rules).toMatch(/hasAny\(\['accountType',\s*'isInstitutional'/);

    const authContextCode = readFileSync(join(SRC_DIR, 'context', 'AuthContext.jsx'), 'utf8');
    expect(authContextCode).toContain('/api/bootstrap');
    expect(authContextCode).not.toMatch(/smartsa\\\.edu|@smartsa\.edu/);
    expect(authContextCode).not.toMatch(/\bsyncInstitutionalUserDoc\b|\bresolveInstitutionalIdentity\b/);
  });

  it('locks rate_limits collection strictly and requires approved/active status in isClassMember in firestore.rules', () => {
    const rules = readFileSync(join(ROOT_DIR, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(
      /match\s+\/rate_limits\/\{rateLimitId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/
    );
    expect(rules).toMatch(/\.data\.get\('status',\s*'approved'\)\s+in\s+\['approved',\s*'active'\]/);
  });

  it('configures Vite /api local dev proxy and preserves single api/index.js serverless dispatcher with /api/ai intact', () => {
    const viteConfigCode = readFileSync(join(ROOT_DIR, 'vite.config.js'), 'utf8');
    expect(viteConfigCode).toContain('VITE_API_PROXY_TARGET');
    expect(viteConfigCode).toContain('http://localhost:3000');
    expect(viteConfigCode).toContain("'/api'");
    expect(viteConfigCode).toContain('changeOrigin: true');

    const apiEntries = readdirSync(join(ROOT_DIR, 'api'));
    expect(apiEntries).toEqual(['index.js']);

    const dispatcherCode = readFileSync(join(ROOT_DIR, 'api', 'index.js'), 'utf8');
    expect(dispatcherCode).toContain("pathname === '/api/ai'");
    expect(dispatcherCode).toContain('async function handleAi(');
  });
});
