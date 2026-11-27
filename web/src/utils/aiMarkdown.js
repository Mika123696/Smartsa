const LATEX_OPERATOR_REPLACEMENTS = [
  [/\\leftrightarrow\b/g, '↔'],
  [/\\(?:rightarrow|to|Rightarrow)\b/g, '→'],
  [/\\(?:leftarrow|Leftarrow)\b/g, '←'],
  [/\\(?:geq|ge)\b/g, '≥'],
  [/\\(?:leq|le)\b/g, '≤'],
  [/\\neq\b/g, '≠'],
  [/\\times\b/g, '×'],
  [/\\approx\b/g, '≈'],
];

const INLINE_DOLLAR_OPERATOR_REGEX =
  /\$\s*([^$\n]*?\\(?:leftrightarrow|rightarrow|to|Rightarrow|leftarrow|Leftarrow|geq|ge|leq|le|neq|times|approx)\b[^$\n]*?)\s*\$/g;

const STANDALONE_DOLLAR_GLYPH_REGEX = /\$\s*([→←↔≥≤≠×≈])\s*\$/g;

function replaceLatexCommandsInSegment(segment) {
  let result = segment.replace(INLINE_DOLLAR_OPERATOR_REGEX, (_full, inner) => {
    let converted = inner;
    for (const [pattern, glyph] of LATEX_OPERATOR_REPLACEMENTS) {
      converted = converted.replace(pattern, glyph);
    }
    return converted.trim();
  });

  for (const [pattern, glyph] of LATEX_OPERATOR_REPLACEMENTS) {
    result = result.replace(pattern, glyph);
  }

  return result.replace(STANDALONE_DOLLAR_GLYPH_REGEX, '$1');
}

/**
 * Mengonversi simbol LaTeX umum menjadi karakter Unicode bersih di luar fenced/inline code block.
 */
export function normalizeAiMarkdownText(rawContent) {
  if (typeof rawContent !== 'string') return '';

  // Lindungi fenced code block (```...``` atau ~~~...~~~) agar isi kode tetap utuh.
  const fencedParts = rawContent.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);

  return fencedParts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;

      // Lindungi inline code (`...`) dari konversi simbol LaTeX.
      const inlineParts = part.split(/(`[^`\n]+`)/g);
      return inlineParts
        .map((segment, segIdx) =>
          segIdx % 2 === 1 ? segment : replaceLatexCommandsInSegment(segment)
        )
        .join('');
    })
    .join('');
}
