import React from 'react';

function renderInlineFormatting(text) {
  if (!text) return null;
  // Parse **bold**, *italic*, and `code` tokens safely as React elements
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[#0a1220] border border-[#22334d] text-[#00e5ff] font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export default function RichNoteRenderer({ content }) {
  if (!content || !content.trim()) {
    return <p className="text-xs text-slate-500 italic">Tidak ada isi catatan materi.</p>;
  }

  const lines = content.split('\n');

  return (
    <div className="space-y-2 text-xs sm:text-[13px] text-slate-300 leading-relaxed font-sans">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();

        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />;
        }

        if (line.startsWith('### ')) {
          return (
            <h5 key={idx} className="text-xs font-bold text-[#00e5ff] font-mono uppercase tracking-wide pt-1">
              {renderInlineFormatting(line.slice(4))}
            </h5>
          );
        }

        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="text-sm font-bold text-[#f59e0b] font-mono pt-1.5 border-b border-[#1e293b] pb-1">
              {renderInlineFormatting(line.slice(3))}
            </h4>
          );
        }

        if (line.startsWith('# ')) {
          return (
            <h3 key={idx} className="text-base font-extrabold text-white pt-1.5">
              {renderInlineFormatting(line.slice(2))}
            </h3>
          );
        }

        if (line.startsWith('> ')) {
          return (
            <div
              key={idx}
              className="bg-[#162032] border-l-2 border-[#f59e0b] px-3 py-2 rounded-r-md text-xs text-amber-100/90"
            >
              {renderInlineFormatting(line.slice(2))}
            </div>
          );
        }

        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#f59e0b] font-bold mt-0.5">•</span>
              <span className="flex-1">{renderInlineFormatting(line.slice(2))}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}
