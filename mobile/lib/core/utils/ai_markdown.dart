/// Utilitas pra-pemrosesan respons Markdown dari AI Smartsa LMS.
///
/// Mengonversi simbol LaTeX ringan di luar fenced code block (` ```...``` ` /
/// ` ~~~...~~~ `) dan inline code (`` `...` ``) menjadi karakter Unicode bersih.
class AiMarkdownHelper {
  const AiMarkdownHelper._();

  static final List<(RegExp, String)> _latexReplacements = <(RegExp, String)>[
    (RegExp(r'\\leftrightarrow\b'), '↔'),
    (RegExp(r'\\(?:rightarrow|to|Rightarrow)\b'), '→'),
    (RegExp(r'\\(?:leftarrow|Leftarrow)\b'), '←'),
    (RegExp(r'\\(?:geq|ge)\b'), '≥'),
    (RegExp(r'\\(?:leq|le)\b'), '≤'),
    (RegExp(r'\\neq\b'), '≠'),
    (RegExp(r'\\times\b'), '×'),
    (RegExp(r'\\approx\b'), '≈'),
  ];

  static final RegExp _fencedBlockRegex = RegExp(
    r'(```[\s\S]*?```|~~~[\s\S]*?~~~)',
  );

  static final RegExp _inlineCodeRegex = RegExp(r'(`[^`\n]+`)');

  static final RegExp _inlineDollarOperatorRegex = RegExp(
    r'\$\s*([^$\n]*?\\(?:leftrightarrow|rightarrow|to|Rightarrow|leftarrow|Leftarrow|geq|ge|leq|le|neq|times|approx)\b[^$\n]*?)\s*\$',
  );

  static final RegExp _standaloneDollarGlyphRegex = RegExp(
    r'\$\s*([→←↔≥≤≠×≈])\s*\$',
  );

  static String _replaceLatexInSegment(String segment) {
    var result = segment.replaceAllMapped(_inlineDollarOperatorRegex, (match) {
      var inner = match.group(1) ?? '';
      for (final (pattern, glyph) in _latexReplacements) {
        inner = inner.replaceAll(pattern, glyph);
      }
      return inner.trim();
    });

    for (final (pattern, glyph) in _latexReplacements) {
      result = result.replaceAll(pattern, glyph);
    }

    return result.replaceAllMapped(
      _standaloneDollarGlyphRegex,
      (match) => match.group(1) ?? '',
    );
  }

  /// Menormalisasi teks Markdown AI agar simbol LaTeX ringan tampil rapi sebagai
  /// Unicode tanpa merusak potongan kode program.
  static String normalizeAiMarkdownText(String? rawContent) {
    if (rawContent == null || rawContent.isEmpty) return '';

    final out = StringBuffer();
    var lastEnd = 0;

    for (final fencedMatch in _fencedBlockRegex.allMatches(rawContent)) {
      if (fencedMatch.start > lastEnd) {
        out.write(
          _processNonFencedSegment(
            rawContent.substring(lastEnd, fencedMatch.start),
          ),
        );
      }
      out.write(fencedMatch.group(0));
      lastEnd = fencedMatch.end;
    }

    if (lastEnd < rawContent.length) {
      out.write(_processNonFencedSegment(rawContent.substring(lastEnd)));
    }

    return out.toString();
  }

  static String _processNonFencedSegment(String segment) {
    final out = StringBuffer();
    var lastEnd = 0;

    for (final inlineMatch in _inlineCodeRegex.allMatches(segment)) {
      if (inlineMatch.start > lastEnd) {
        out.write(
          _replaceLatexInSegment(
            segment.substring(lastEnd, inlineMatch.start),
          ),
        );
      }
      out.write(inlineMatch.group(0));
      lastEnd = inlineMatch.end;
    }

    if (lastEnd < segment.length) {
      out.write(_replaceLatexInSegment(segment.substring(lastEnd)));
    }

    return out.toString();
  }
}
