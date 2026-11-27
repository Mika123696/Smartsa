/// Model satu soal hasil parsing format Aiken.
class AikenQuestion {
  const AikenQuestion({
    required this.id,
    required this.question,
    required this.options,
    required this.answerIdx,
    required this.answerLetter,
  });

  final String id;
  final String question;
  final List<String> options;
  final int answerIdx;
  final String answerLetter;
}

/// Laporan kesalahan per baris ketika mem-parsing teks format Aiken.
class AikenParseError {
  const AikenParseError({
    required this.line,
    required this.message,
  });

  final int line;
  final String message;
}

/// Hasil parsing dokumen soal format Aiken.
class AikenParseResult {
  const AikenParseResult({
    required this.questions,
    required this.answerKey,
    required this.errors,
  });

  final List<AikenQuestion> questions;
  final Map<String, int> answerKey;
  final List<AikenParseError> errors;
}

class _OptionDraft {
  _OptionDraft({required this.letter, required this.text});

  final String letter;
  String text;
}

class _QuestionBlockDraft {
  _QuestionBlockDraft({required this.startLine}) : lastLine = startLine;

  final int startLine;
  int lastLine;
  final List<String> stemLines = <String>[];
  final List<_OptionDraft> options = <_OptionDraft>[];
  bool hasOptionOrderError = false;
  int? optionOrderErrorLine;
  int? answerLine;
  String answerValue = '';
}

class _ParsedBlockResult {
  const _ParsedBlockResult({
    required this.question,
    required this.options,
    required this.answerIdx,
    required this.answerLetter,
  });

  final String question;
  final List<String> options;
  final int answerIdx;
  final String answerLetter;
}

/// Parser & validator format soal pilihan ganda standar Aiken (port 1:1 `aikenParser.js`).
///
/// Mendukung pemisah baris `\r\n` dan `\n`, awalan opsi `A. ` atau `A) ` (2–6 opsi),
/// serta baris `ANSWER: X` (case-insensitive) dengan pelaporan nomor baris error.
class AikenParser {
  const AikenParser._();

  static const String sampleTemplate = '''
Prinsip enkapsulasi dalam OOP bertujuan untuk?
A. Menghapus seluruh konstruktor kelas
B. Menyembunyikan detail implementasi internal dan menjaga validitas state objek
C. Menjalankan kode secara sinkron tanpa thread
D. Menggandakan seluruh baris kode pada subclass
E. Membatasi penggunaan interface publik
ANSWER: B''';

  static final RegExp _optionLineRegex = RegExp(r'^([A-Fa-f])[.)]\s+(.+)$');
  static final RegExp _emptyOptionRegex = RegExp(r'^([A-Fa-f])[.)]\s*$');
  static final RegExp _answerLineRegex = RegExp(
    r'^ANSWER\s*:\s*(.*)$',
    caseSensitive: false,
  );
  static final RegExp _singleLetterRegex = RegExp(r'^[A-F]$');

  static AikenParseResult parse(
    String rawText, {
    String idPrefix = 'q',
    int startIndex = 1,
  }) {
    final safePrefix = idPrefix.trim().isEmpty ? 'q' : idPrefix.trim();
    final safeStartIndex = startIndex < 1 ? 1 : startIndex;

    if (rawText.trim().isEmpty) {
      return const AikenParseResult(
        questions: <AikenQuestion>[],
        answerKey: <String, int>{},
        errors: <AikenParseError>[
          AikenParseError(
            line: 1,
            message: 'Baris 1: Teks format Aiken masih kosong.',
          ),
        ],
      );
    }

    final normalizedLines =
        rawText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    final parsedBlocks = <_ParsedBlockResult>[];
    final errors = <AikenParseError>[];
    _QuestionBlockDraft? currentBlock;

    for (var i = 0; i < normalizedLines.length; i++) {
      final lineNo = i + 1;
      final trimmed = normalizedLines[i].trim();

      if (trimmed.isEmpty) {
        if (currentBlock != null) {
          _flushBlock(currentBlock, parsedBlocks, errors);
          currentBlock = null;
        }
        continue;
      }

      final answerMatch = _answerLineRegex.firstMatch(trimmed);
      if (answerMatch != null) {
        if (currentBlock == null) {
          errors.add(
            AikenParseError(
              line: lineNo,
              message:
                  'Baris $lineNo: Baris ANSWER ditemukan tanpa pertanyaan maupun opsi sebelumnya.',
            ),
          );
          continue;
        }
        currentBlock.answerLine = lineNo;
        currentBlock.answerValue = (answerMatch.group(1) ?? '').trim();
        currentBlock.lastLine = lineNo;
        _flushBlock(currentBlock, parsedBlocks, errors);
        currentBlock = null;
        continue;
      }

      currentBlock ??= _QuestionBlockDraft(startLine: lineNo);
      currentBlock.lastLine = lineNo;

      final optionMatch = _optionLineRegex.firstMatch(trimmed);
      final emptyOptionMatch =
          optionMatch == null ? _emptyOptionRegex.firstMatch(trimmed) : null;

      if (optionMatch != null || emptyOptionMatch != null) {
        final letter =
            ((optionMatch?.group(1) ?? emptyOptionMatch?.group(1)) ?? '')
                .toUpperCase();
        final optionText = (optionMatch?.group(2) ?? '').trim();
        final expectedLetter = String.fromCharCode(
          65 + currentBlock.options.length,
        );

        if (currentBlock.options.length >= 6 || letter != expectedLetter) {
          currentBlock.hasOptionOrderError = true;
          currentBlock.optionOrderErrorLine ??= lineNo;
        }
        if (optionText.isEmpty) {
          errors.add(
            AikenParseError(
              line: lineNo,
              message:
                  'Baris $lineNo: Teks untuk opsi $letter tidak boleh kosong.',
            ),
          );
          currentBlock.hasOptionOrderError = true;
          currentBlock.optionOrderErrorLine ??= lineNo;
        }
        currentBlock.options.add(_OptionDraft(letter: letter, text: optionText));
      } else if (currentBlock.options.isNotEmpty) {
        final prev = currentBlock.options.last;
        prev.text = '${prev.text} $trimmed'.trim();
      } else {
        currentBlock.stemLines.add(trimmed);
      }
    }

    if (currentBlock != null) {
      _flushBlock(currentBlock, parsedBlocks, errors);
    }

    final questions = <AikenQuestion>[];
    final answerKey = <String, int>{};

    for (var idx = 0; idx < parsedBlocks.length; idx++) {
      final item = parsedBlocks[idx];
      final qId = '$safePrefix${safeStartIndex + idx}';
      questions.add(
        AikenQuestion(
          id: qId,
          question: item.question,
          options: item.options,
          answerIdx: item.answerIdx,
          answerLetter: item.answerLetter,
        ),
      );
      answerKey[qId] = item.answerIdx;
    }

    return AikenParseResult(
      questions: questions,
      answerKey: answerKey,
      errors: errors,
    );
  }

  static void _flushBlock(
    _QuestionBlockDraft block,
    List<_ParsedBlockResult> results,
    List<AikenParseError> errors,
  ) {
    final hasAnyContent =
        block.stemLines.isNotEmpty ||
        block.options.isNotEmpty ||
        block.answerLine != null;
    if (!hasAnyContent) return;

    final blockLine = block.startLine;
    final stemText = block.stemLines.join(' ').trim();

    if (stemText.isEmpty) {
      errors.add(
        AikenParseError(
          line: blockLine,
          message: 'Baris $blockLine: Teks pertanyaan tidak boleh kosong.',
        ),
      );
      return;
    }

    if (block.hasOptionOrderError) {
      final errLine = block.optionOrderErrorLine ?? blockLine;
      errors.add(
        AikenParseError(
          line: errLine,
          message:
              'Baris $errLine: Urutan huruf opsi harus berurutan mulai dari A (A–F).',
        ),
      );
      return;
    }

    if (block.options.length < 2 || block.options.length > 6) {
      errors.add(
        AikenParseError(
          line: blockLine,
          message:
              'Baris $blockLine: Setiap soal harus memiliki 2 hingga 6 opsi jawaban (ditemukan ${block.options.length} opsi).',
        ),
      );
      return;
    }

    if (block.answerLine == null) {
      final snippet = stemText.length > 40 ? stemText.substring(0, 40) : stemText;
      errors.add(
        AikenParseError(
          line: block.lastLine,
          message:
              'Baris ${block.lastLine}: Soal "$snippet" tidak memiliki baris ANSWER: X.',
        ),
      );
      return;
    }

    final rawLetter = block.answerValue.trim().toUpperCase();
    if (!_singleLetterRegex.hasMatch(rawLetter)) {
      errors.add(
        AikenParseError(
          line: block.answerLine!,
          message:
              'Baris ${block.answerLine}: Nilai ANSWER "${block.answerValue}" tidak valid (harus berupa huruf opsi A–F).',
        ),
      );
      return;
    }

    final resolvedIdx = rawLetter.codeUnitAt(0) - 65;
    if (resolvedIdx < 0 || resolvedIdx >= block.options.length) {
      final maxLetter = String.fromCharCode(64 + block.options.length);
      errors.add(
        AikenParseError(
          line: block.answerLine!,
          message:
              'Baris ${block.answerLine}: Huruf ANSWER "$rawLetter" tidak tersedia dalam daftar opsi (opsi tersedia: A–$maxLetter).',
        ),
      );
      return;
    }

    results.add(
      _ParsedBlockResult(
        question: stemText,
        options: block.options.map((o) => o.text).toList(growable: false),
        answerIdx: resolvedIdx,
        answerLetter: rawLetter,
      ),
    );
  }
}
