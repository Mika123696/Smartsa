/**
 * Pure React JSX Quill Delta JSON Renderer (Zero dangerouslySetInnerHTML)
 * Mencegah Stored XSS dengan merender setiap op Delta sebagai elemen React terstruktur.
 */

import SafeImage from './SafeImage';

function isSafeHttpUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function renderInlineSegment(segment, key) {
  const { text, attributes = {} } = segment;
  let node = text;

  if (attributes.code) {
    node = (
      <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#0d1421] text-sky-700 dark:text-[#00e5ff] font-mono text-[11px] border border-slate-200 dark:border-[#212f45]">
        {node}
      </code>
    );
  }
  if (attributes.bold) {
    node = <strong className="font-bold text-slate-900 dark:text-slate-100">{node}</strong>;
  }
  if (attributes.italic) {
    node = <em className="italic">{node}</em>;
  }
  if (attributes.underline) {
    node = <span className="underline">{node}</span>;
  }
  if (attributes.strike) {
    node = <span className="line-through">{node}</span>;
  }
  if (attributes.link && isSafeHttpUrl(attributes.link)) {
    node = (
      <a
        href={attributes.link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-[#00e5ff] underline hover:opacity-80"
      >
        {node}
      </a>
    );
  }

  return <span key={key}>{node}</span>;
}

function parseDeltaOpsToLines(delta) {
  const ops = Array.isArray(delta?.ops)
    ? delta.ops
    : Array.isArray(delta)
    ? delta
    : null;

  if (!ops) return null;

  const lines = [];
  let currentRuns = [];

  for (const op of ops) {
    if (!op || op.insert === undefined || op.insert === null) continue;

    if (typeof op.insert === 'object') {
      if (op.insert.image && isSafeHttpUrl(op.insert.image)) {
        if (currentRuns.length > 0) {
          lines.push({ runs: currentRuns, blockAttrs: {} });
          currentRuns = [];
        }
        lines.push({ imageUrl: op.insert.image, blockAttrs: op.attributes || {} });
      }
      continue;
    }

    const str = String(op.insert);
    const parts = str.split('\n');

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.length > 0) {
        currentRuns.push({ text: part, attributes: op.attributes || {} });
      }
      if (i < parts.length - 1) {
        lines.push({
          runs: currentRuns,
          blockAttrs: op.attributes || {},
        });
        currentRuns = [];
      }
    }
  }

  if (currentRuns.length > 0) {
    lines.push({ runs: currentRuns, blockAttrs: {} });
  }

  return lines;
}

export default function DeltaContentRenderer({ delta, fallbackText = '', emptyMessage = '' }) {
  let normalizedDelta = delta;
  if (typeof delta === 'string') {
    try {
      const parsed = JSON.parse(delta);
      if (parsed && (Array.isArray(parsed.ops) || Array.isArray(parsed))) {
        normalizedDelta = parsed;
      }
    } catch {
      normalizedDelta = null;
    }
  }

  const lines = parseDeltaOpsToLines(normalizedDelta);

  const hasVisibleLineContent =
    Array.isArray(lines) &&
    lines.some(
      (line) =>
        Boolean(line.imageUrl) ||
        (Array.isArray(line.runs) && line.runs.some((r) => String(r.text || '').trim().length > 0))
    );

  if (!lines || lines.length === 0 || !hasVisibleLineContent) {
    if (typeof fallbackText === 'string' && fallbackText.trim()) {
      return (
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
          {fallbackText}
        </p>
      );
    }

    return (
      <div className="py-8 text-center bg-slate-50 dark:bg-[#0b101a] rounded-xl border border-dashed border-slate-200 dark:border-[#1e2a3f] text-xs font-mono text-slate-500 dark:text-slate-400">
        {emptyMessage || 'Belum ada materi bacaan yang ditambahkan untuk pertemuan ini.'}
      </div>
    );
  }

  // Group consecutive list items & code-block lines cleanly
  const blocks = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (line.imageUrl) {
      blocks.push({ type: 'image', imageUrl: line.imageUrl, key: `img_${idx}` });
      continue;
    }

    const attrs = line.blockAttrs || {};
    if (attrs.list === 'bullet' || attrs.list === 'ordered') {
      const listType = attrs.list;
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'list' && prev.listType === listType) {
        prev.items.push(line.runs);
      } else {
        blocks.push({ type: 'list', listType, items: [line.runs], key: `list_${idx}` });
      }
    } else if (attrs['code-block']) {
      const prev = blocks[blocks.length - 1];
      const codeText = line.runs.map((r) => r.text).join('');
      if (prev && prev.type === 'code-block') {
        prev.lines.push(codeText);
      } else {
        blocks.push({ type: 'code-block', lines: [codeText], key: `code_${idx}` });
      }
    } else if (attrs.header === 1) {
      blocks.push({ type: 'h1', runs: line.runs, key: `h1_${idx}` });
    } else if (attrs.header === 2) {
      blocks.push({ type: 'h2', runs: line.runs, key: `h2_${idx}` });
    } else if (attrs.header === 3) {
      blocks.push({ type: 'h3', runs: line.runs, key: `h3_${idx}` });
    } else if (attrs.blockquote) {
      blocks.push({ type: 'blockquote', runs: line.runs, key: `bq_${idx}` });
    } else {
      blocks.push({ type: 'p', runs: line.runs, key: `p_${idx}` });
    }
  }

  return (
    <div className="space-y-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {blocks.map((block) => {
        if (block.type === 'image') {
          return (
            <div key={block.key} className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-[#232f42]">
              <SafeImage
                src={block.imageUrl}
                alt="Ilustrasi modul pembelajaran"
                fallbackLabel="ILUSTRASI MODUL"
                variant="media"
                className="max-h-80 min-h-36 w-full object-cover"
              />
            </div>
          );
        }
        if (block.type === 'h1') {
          return (
            <h2 key={block.key} className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              {block.runs.map((r, i) => renderInlineSegment(r, i))}
            </h2>
          );
        }
        if (block.type === 'h2') {
          return (
            <h3 key={block.key} className="text-sm font-bold text-amber-700 dark:text-[#f59e0b] font-mono pt-1">
              {block.runs.map((r, i) => renderInlineSegment(r, i))}
            </h3>
          );
        }
        if (block.type === 'h3') {
          return (
            <h4 key={block.key} className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-200">
              {block.runs.map((r, i) => renderInlineSegment(r, i))}
            </h4>
          );
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={block.key}
              className="bg-amber-50 dark:bg-[#121b29] border-l-4 border-amber-500 dark:border-[#f59e0b] p-3 rounded-r-lg text-slate-700 dark:text-slate-300 text-xs font-mono"
            >
              {block.runs.map((r, i) => renderInlineSegment(r, i))}
            </blockquote>
          );
        }
        if (block.type === 'code-block') {
          return (
            <pre
              key={block.key}
              className="p-3.5 bg-slate-900 dark:bg-[#070b12] border border-slate-800 dark:border-[#1e2a3f] text-emerald-300 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed"
            >
              <code>{block.lines.join('\n')}</code>
            </pre>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.listType === 'ordered' ? 'ol' : 'ul';
          const listClass =
            block.listType === 'ordered'
              ? 'list-decimal pl-5 space-y-1.5'
              : 'list-disc pl-5 space-y-1.5';
          return (
            <ListTag key={block.key} className={listClass}>
              {block.items.map((runs, itemIdx) => (
                <li key={itemIdx}>{runs.map((r, i) => renderInlineSegment(r, i))}</li>
              ))}
            </ListTag>
          );
        }
        if (block.runs.length === 0) {
          return <div key={block.key} className="h-1" />;
        }
        return (
          <p key={block.key}>
            {block.runs.map((r, i) => renderInlineSegment(r, i))}
          </p>
        );
      })}
    </div>
  );
}
