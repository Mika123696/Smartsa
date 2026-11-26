/**
 * Helper serialisasi dua arah antara Quill Delta JSON (`{ ops: [...] }`)
 * dan teks Markdown terstruktur untuk editor materi pertemuan Smartsa LMS.
 */

export function isSafeMaterialUrl(rawUrl, requireHttps = false) {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s|[<>]/.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return false;
    return requireHttps
      ? parsed.protocol === 'https:'
      : parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function serializeDeltaRunText(text, attrs = {}) {
  if (!text) return '';
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const lead = match ? match[1] : '';
  const core = match ? match[2] : text;
  const trail = match ? match[3] : '';
  if (!core) return text;

  let wrapped = core;
  if (attrs.code) {
    wrapped = wrapped.includes('`') ? `\`\` ${wrapped} \`\`` : `\`${wrapped}\``;
  }
  if (attrs.bold && attrs.italic) {
    wrapped = `***${wrapped}***`;
  } else if (attrs.bold) {
    wrapped = `**${wrapped}**`;
  } else if (attrs.italic) {
    wrapped = `*${wrapped}*`;
  }
  if (attrs.strike) {
    wrapped = `~~${wrapped}~~`;
  }
  if (attrs.underline) {
    wrapped = `++${wrapped}++`;
  }
  if (attrs.link && isSafeMaterialUrl(attrs.link, false)) {
    wrapped = `[${wrapped}](${attrs.link.trim()})`;
  }
  return `${lead}${wrapped}${trail}`;
}

export function deltaToEditableText(delta) {
  let normalizedDelta = delta;
  if (typeof delta === 'string') {
    try {
      normalizedDelta = JSON.parse(delta);
    } catch {
      return delta;
    }
  }
  if (Array.isArray(normalizedDelta)) {
    normalizedDelta = { ops: normalizedDelta };
  }
  if (!normalizedDelta || !Array.isArray(normalizedDelta.ops)) return '';

  const structuredLines = [];
  let currentRuns = [];
  let pendingImage = null;

  const flushPendingImage = () => {
    if (!pendingImage) return;
    if (isSafeMaterialUrl(pendingImage.url, true)) {
      structuredLines.push({
        type: 'image',
        url: pendingImage.url.trim(),
        alt: pendingImage.alt || 'Ilustrasi modul',
      });
    }
    pendingImage = null;
  };

  for (const op of normalizedDelta.ops) {
    if (op?.insert && typeof op.insert === 'object') {
      if (typeof op.insert.image === 'string') {
        if (currentRuns.length > 0) {
          structuredLines.push({ type: 'line', runs: currentRuns, attrs: {} });
          currentRuns = [];
        }
        flushPendingImage();
        const rawAlt = typeof op.attributes?.alt === 'string' ? op.attributes.alt : '';
        pendingImage = { url: op.insert.image, alt: rawAlt };
      }
      continue;
    }

    if (typeof op?.insert !== 'string') continue;

    let str = op.insert;
    if (pendingImage) {
      if (str.startsWith('\n')) {
        flushPendingImage();
        str = str.slice(1);
        if (!str) continue;
      } else {
        flushPendingImage();
      }
    }

    const parts = str.split('\n');
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].length > 0) {
        currentRuns.push({
          text: parts[i],
          attributes: op.attributes || {},
        });
      }
      if (i < parts.length - 1) {
        structuredLines.push({
          type: 'line',
          runs: currentRuns,
          attrs: op.attributes || {},
        });
        currentRuns = [];
      }
    }
  }

  flushPendingImage();
  if (currentRuns.length > 0) {
    structuredLines.push({ type: 'line', runs: currentRuns, attrs: {} });
  }

  const output = [];
  let inCodeBlock = false;
  let orderedCounter = 0;

  for (const entry of structuredLines) {
    if (entry.type === 'image') {
      if (inCodeBlock) {
        output.push('```');
        inCodeBlock = false;
      }
      orderedCounter = 0;
      const safeAlt = entry.alt.replace(/[[()\r\n\]]/g, '').trim() || 'Ilustrasi modul';
      output.push(`![${safeAlt}](${entry.url})`);
      continue;
    }

    const attrs = entry.attrs || {};
    if (attrs['code-block']) {
      orderedCounter = 0;
      if (!inCodeBlock) {
        output.push('```');
        inCodeBlock = true;
      }
      output.push(entry.runs.map((r) => r.text).join(''));
      continue;
    }

    if (inCodeBlock) {
      output.push('```');
      inCodeBlock = false;
    }

    const serializedText = entry.runs
      .map((r) => serializeDeltaRunText(r.text, r.attributes))
      .join('');

    if (attrs.list === 'ordered') {
      orderedCounter += 1;
      output.push(`${orderedCounter}. ${serializedText.trim()}`);
      continue;
    }

    orderedCounter = 0;

    if (attrs.list === 'bullet') {
      output.push(`- ${serializedText.trim()}`);
    } else if (attrs.header === 1) {
      output.push(`# ${serializedText.trim()}`);
    } else if (attrs.header === 2) {
      output.push(`## ${serializedText.trim()}`);
    } else if (attrs.header === 3) {
      output.push(`### ${serializedText.trim()}`);
    } else if (attrs.header) {
      output.push(`# ${serializedText.trim()}`);
    } else if (attrs.blockquote) {
      output.push(`> ${serializedText.trim()}`);
    } else {
      output.push(serializedText.trimEnd());
    }
  }

  if (inCodeBlock) {
    output.push('```');
  }

  return output.join('\n');
}

function mergeInlineAttrs(baseAttrs, extraAttrs) {
  const merged = { ...baseAttrs, ...extraAttrs };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function appendDeltaTextOp(ops, insertText, attrs) {
  if (!insertText) return;
  const normalizedAttrs = attrs && Object.keys(attrs).length > 0 ? attrs : undefined;
  const prev = ops[ops.length - 1];
  const prevAttrs = prev?.attributes;
  const sameAttrs =
    !prevAttrs && !normalizedAttrs
      ? true
      : Boolean(
          prevAttrs &&
            normalizedAttrs &&
            Object.keys(prevAttrs).length === Object.keys(normalizedAttrs).length &&
            Object.keys(prevAttrs).every((k) => prevAttrs[k] === normalizedAttrs[k])
        );
  if (prev && typeof prev.insert === 'string' && sameAttrs) {
    prev.insert += insertText;
  } else if (normalizedAttrs) {
    ops.push({ insert: insertText, attributes: normalizedAttrs });
  } else {
    ops.push({ insert: insertText });
  }
}

function findClosingInlineDelimiter(text, fromIndex, delimiter) {
  let searchFrom = fromIndex;
  while (searchFrom < text.length) {
    const closeIdx = text.indexOf(delimiter, searchFrom);
    if (closeIdx === -1) return -1;
    // Saat delimiter `**` bertemu penutup gabungan `***` (dari bold + nested italic),
    // biarkan `*` terdalam tetap menjadi penutup italic dan `**` penutup berada di indeks +1.
    if (delimiter === '**' && text.startsWith('***', closeIdx) && closeIdx > fromIndex) {
      const shiftedInner = text.slice(fromIndex, closeIdx + 1);
      if (shiftedInner.length > 0 && !/^\s/.test(shiftedInner) && !/\s$/.test(shiftedInner)) {
        return closeIdx + 1;
      }
    }
    const inner = text.slice(fromIndex, closeIdx);
    if (inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner)) {
      if (delimiter === '*' && (text[closeIdx + 1] === '*' || text[closeIdx - 1] === '*')) {
        searchFrom = closeIdx + 1;
        continue;
      }
      return closeIdx;
    }
    searchFrom = closeIdx + delimiter.length;
  }
  return -1;
}

function parseInlineMarkdownToOps(text, inheritedAttrs = {}, depth = 0) {
  const ops = [];
  if (!text) return ops;
  if (depth >= 6) {
    appendDeltaTextOp(ops, text, inheritedAttrs);
    return ops;
  }

  let plainStart = 0;
  let i = 0;

  const flushPlain = (endIdx) => {
    if (endIdx > plainStart) {
      appendDeltaTextOp(ops, text.slice(plainStart, endIdx), inheritedAttrs);
    }
  };

  while (i < text.length) {
    if (text.startsWith('``', i)) {
      const closeIdx = text.indexOf('``', i + 2);
      if (closeIdx > i + 2) {
        let codeInner = text.slice(i + 2, closeIdx);
        if (codeInner.startsWith(' ') && codeInner.endsWith(' ') && codeInner.length > 2) {
          codeInner = codeInner.slice(1, -1);
        }
        flushPlain(i);
        appendDeltaTextOp(ops, codeInner, mergeInlineAttrs(inheritedAttrs, { code: true }));
        i = closeIdx + 2;
        plainStart = i;
        continue;
      }
    }

    if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx > i + 1) {
        const codeInner = text.slice(i + 1, closeIdx);
        flushPlain(i);
        appendDeltaTextOp(ops, codeInner, mergeInlineAttrs(inheritedAttrs, { code: true }));
        i = closeIdx + 1;
        plainStart = i;
        continue;
      }
    }

    if (text[i] === '[' && !inheritedAttrs.link) {
      const midIdx = text.indexOf('](', i + 1);
      if (midIdx > i + 1) {
        const endParenIdx = text.indexOf(')', midIdx + 2);
        if (endParenIdx > midIdx + 2) {
          const linkLabel = text.slice(i + 1, midIdx);
          const candidateUrl = text.slice(midIdx + 2, endParenIdx).trim();
          if (linkLabel && !linkLabel.includes('[') && isSafeMaterialUrl(candidateUrl, false)) {
            flushPlain(i);
            const childOps = parseInlineMarkdownToOps(
              linkLabel,
              mergeInlineAttrs(inheritedAttrs, { link: candidateUrl }),
              depth + 1
            );
            for (const childOp of childOps) {
              appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
            }
            i = endParenIdx + 1;
            plainStart = i;
            continue;
          }
        }
      }
    }

    if (text.startsWith('***', i)) {
      const closeIdx = findClosingInlineDelimiter(text, i + 3, '***');
      if (closeIdx > i + 3) {
        flushPlain(i);
        const childOps = parseInlineMarkdownToOps(
          text.slice(i + 3, closeIdx),
          mergeInlineAttrs(inheritedAttrs, { bold: true, italic: true }),
          depth + 1
        );
        for (const childOp of childOps) {
          appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
        }
        i = closeIdx + 3;
        plainStart = i;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      const closeIdx = findClosingInlineDelimiter(text, i + 2, '**');
      if (closeIdx > i + 2) {
        flushPlain(i);
        const childOps = parseInlineMarkdownToOps(
          text.slice(i + 2, closeIdx),
          mergeInlineAttrs(inheritedAttrs, { bold: true }),
          depth + 1
        );
        for (const childOp of childOps) {
          appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
        }
        i = closeIdx + 2;
        plainStart = i;
        continue;
      }
    }

    if (text[i] === '*' && text[i + 1] !== '*') {
      const closeIdx = findClosingInlineDelimiter(text, i + 1, '*');
      if (closeIdx > i + 1) {
        flushPlain(i);
        const childOps = parseInlineMarkdownToOps(
          text.slice(i + 1, closeIdx),
          mergeInlineAttrs(inheritedAttrs, { italic: true }),
          depth + 1
        );
        for (const childOp of childOps) {
          appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
        }
        i = closeIdx + 1;
        plainStart = i;
        continue;
      }
    }

    if (text.startsWith('~~', i)) {
      const closeIdx = findClosingInlineDelimiter(text, i + 2, '~~');
      if (closeIdx > i + 2) {
        flushPlain(i);
        const childOps = parseInlineMarkdownToOps(
          text.slice(i + 2, closeIdx),
          mergeInlineAttrs(inheritedAttrs, { strike: true }),
          depth + 1
        );
        for (const childOp of childOps) {
          appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
        }
        i = closeIdx + 2;
        plainStart = i;
        continue;
      }
    }

    if (text.startsWith('++', i)) {
      const closeIdx = findClosingInlineDelimiter(text, i + 2, '++');
      if (closeIdx > i + 2) {
        flushPlain(i);
        const childOps = parseInlineMarkdownToOps(
          text.slice(i + 2, closeIdx),
          mergeInlineAttrs(inheritedAttrs, { underline: true }),
          depth + 1
        );
        for (const childOp of childOps) {
          appendDeltaTextOp(ops, childOp.insert, childOp.attributes);
        }
        i = closeIdx + 2;
        plainStart = i;
        continue;
      }
    }

    i += 1;
  }

  flushPlain(text.length);
  return ops;
}

export function plainTextToDelta(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const nonEmpty = lines.some((l) => l.trim().length > 0);
  if (!nonEmpty) return null;

  const ops = [];
  let inCodeBlock = false;

  const pushFormattedLine = (contentText, blockAttrs = null) => {
    const inlineOps = parseInlineMarkdownToOps(contentText);
    if (!blockAttrs && inlineOps.length === 1 && !inlineOps[0].attributes) {
      ops.push({ insert: `${inlineOps[0].insert}\n` });
      return;
    }
    for (const inlineOp of inlineOps) {
      ops.push(inlineOp);
    }
    ops.push(blockAttrs ? { insert: '\n', attributes: blockAttrs } : { insert: '\n' });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      if (line.length > 0) {
        ops.push({ insert: line });
      }
      ops.push({ insert: '\n', attributes: { 'code-block': true } });
      continue;
    }

    if (!trimmed) {
      ops.push({ insert: '\n' });
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (imageMatch && isSafeMaterialUrl(imageMatch[2], true)) {
      const cleanAlt = imageMatch[1].trim();
      const imageOp = { insert: { image: imageMatch[2].trim() } };
      if (cleanAlt && cleanAlt !== 'Ilustrasi modul') {
        imageOp.attributes = { alt: cleanAlt };
      }
      ops.push(imageOp);
      ops.push({ insert: '\n' });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      pushFormattedLine(trimmed.slice(4).trim(), { header: 3 });
    } else if (trimmed.startsWith('## ')) {
      pushFormattedLine(trimmed.slice(3).trim(), { header: 2 });
    } else if (trimmed.startsWith('# ')) {
      pushFormattedLine(trimmed.slice(2).trim(), { header: 1 });
    } else if (trimmed.startsWith('> ') || trimmed === '>') {
      pushFormattedLine(trimmed.slice(1).trimStart(), { blockquote: true });
    } else if (/^[-*]\s+(.+)$/.test(trimmed)) {
      pushFormattedLine(trimmed.replace(/^[-*]\s+/, ''), { list: 'bullet' });
    } else if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      pushFormattedLine(trimmed.replace(/^\d+\.\s+/, ''), { list: 'ordered' });
    } else {
      pushFormattedLine(trimmed, null);
    }
  }

  return ops.length > 0 ? { ops } : null;
}
