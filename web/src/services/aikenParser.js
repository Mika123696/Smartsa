/**
 * Parser & Validator Format Soal Pilihan Ganda Standar Aiken
 * Mendukung pemisah baris \r\n dan \n, awalan opsi "A. " atau "A) " (2–6 opsi),
 * serta baris "ANSWER: X" (case-insensitive) dengan pelaporan nomor baris error.
 */

const OPTION_LINE_REGEX = /^([A-Fa-f])[.)]\s+(.+)$/;
const ANSWER_LINE_REGEX = /^ANSWER\s*:\s*(.*)$/i;

function flushQuestionBlock(block, results, errors) {
  if (!block) return;
  const hasAnyContent =
    block.stemLines.length > 0 || block.options.length > 0 || block.answerLine !== null;
  if (!hasAnyContent) return;

  const blockLine = block.startLine;
  const stemText = block.stemLines.join(' ').trim();

  if (!stemText) {
    errors.push({
      line: blockLine,
      message: `Baris ${blockLine}: Teks pertanyaan tidak boleh kosong.`,
    });
    return;
  }

  if (block.hasOptionOrderError) {
    errors.push({
      line: block.optionOrderErrorLine || blockLine,
      message: `Baris ${block.optionOrderErrorLine || blockLine}: Urutan huruf opsi harus berurutan mulai dari A (A–F).`,
    });
    return;
  }

  if (block.options.length < 2 || block.options.length > 6) {
    errors.push({
      line: blockLine,
      message: `Baris ${blockLine}: Setiap soal harus memiliki 2 hingga 6 opsi jawaban (ditemukan ${block.options.length} opsi).`,
    });
    return;
  }

  if (block.answerLine === null) {
    errors.push({
      line: block.lastLine,
      message: `Baris ${block.lastLine}: Soal "${stemText.slice(0, 40)}" tidak memiliki baris ANSWER: X.`,
    });
    return;
  }

  const rawLetter = String(block.answerValue || '').trim().toUpperCase();
  if (!/^[A-F]$/.test(rawLetter)) {
    errors.push({
      line: block.answerLine,
      message: `Baris ${block.answerLine}: Nilai ANSWER "${block.answerValue}" tidak valid (harus berupa huruf opsi A–F).`,
    });
    return;
  }

  const resolvedIdx = rawLetter.charCodeAt(0) - 65;
  if (resolvedIdx < 0 || resolvedIdx >= block.options.length) {
    const maxLetter = String.fromCharCode(64 + block.options.length);
    errors.push({
      line: block.answerLine,
      message: `Baris ${block.answerLine}: Huruf ANSWER "${rawLetter}" tidak tersedia dalam daftar opsi (opsi tersedia: A–${maxLetter}).`,
    });
    return;
  }

  results.push({
    question: stemText,
    options: block.options.map((o) => o.text),
    answerIdx: resolvedIdx,
    answerLetter: rawLetter,
    startLine: blockLine,
  });
}

function createEmptyBlock(startLine) {
  return {
    startLine,
    lastLine: startLine,
    stemLines: [],
    options: [],
    hasOptionOrderError: false,
    optionOrderErrorLine: null,
    answerLine: null,
    answerValue: '',
  };
}

/**
 * Mem-parsing teks format Aiken menjadi daftar soal tervalidasi + laporan error per baris.
 * @param {string} rawText
 * @param {{ idPrefix?: string, startIndex?: number }} [config]
 * @returns {{ questions: Array<{id: string, question: string, options: string[], answerIdx: number, answerLetter: string}>, answerKey: Record<string, number>, errors: Array<{line: number, message: string}> }}
 */
export function parseAikenQuestions(rawText, config = {}) {
  const idPrefix = String(config?.idPrefix || 'q').trim() || 'q';
  const startIndex = Math.max(1, Number(config?.startIndex) || 1);

  if (typeof rawText !== 'string' || !rawText.trim()) {
    return {
      questions: [],
      answerKey: {},
      errors: [{ line: 1, message: 'Baris 1: Teks format Aiken masih kosong.' }],
    };
  }

  const normalizedLines = rawText.replace(/\r\n?/g, '\n').split('\n');
  const parsedBlocks = [];
  const errors = [];
  let currentBlock = null;

  for (let i = 0; i < normalizedLines.length; i += 1) {
    const lineNo = i + 1;
    const trimmed = normalizedLines[i].trim();

    if (!trimmed) {
      if (currentBlock) {
        flushQuestionBlock(currentBlock, parsedBlocks, errors);
        currentBlock = null;
      }
      continue;
    }

    const answerMatch = trimmed.match(ANSWER_LINE_REGEX);
    if (answerMatch) {
      if (!currentBlock) {
        errors.push({
          line: lineNo,
          message: `Baris ${lineNo}: Baris ANSWER ditemukan tanpa pertanyaan maupun opsi sebelumnya.`,
        });
        continue;
      }
      currentBlock.answerLine = lineNo;
      currentBlock.answerValue = String(answerMatch[1] || '').trim();
      currentBlock.lastLine = lineNo;
      flushQuestionBlock(currentBlock, parsedBlocks, errors);
      currentBlock = null;
      continue;
    }

    if (!currentBlock) {
      currentBlock = createEmptyBlock(lineNo);
    }
    currentBlock.lastLine = lineNo;

    const optionMatch = trimmed.match(OPTION_LINE_REGEX);
    if (optionMatch) {
      const letter = optionMatch[1].toUpperCase();
      const optionText = optionMatch[2].trim();
      const expectedLetter = String.fromCharCode(65 + currentBlock.options.length);

      if (currentBlock.options.length >= 6 || letter !== expectedLetter) {
        currentBlock.hasOptionOrderError = true;
        if (!currentBlock.optionOrderErrorLine) {
          currentBlock.optionOrderErrorLine = lineNo;
        }
      }
      if (!optionText) {
        errors.push({
          line: lineNo,
          message: `Baris ${lineNo}: Teks untuk opsi ${letter} tidak boleh kosong.`,
        });
        currentBlock.hasOptionOrderError = true;
        if (!currentBlock.optionOrderErrorLine) {
          currentBlock.optionOrderErrorLine = lineNo;
        }
      }
      currentBlock.options.push({ letter, text: optionText });
    } else if (currentBlock.options.length > 0) {
      // Lanjutan baris teks pada opsi aktif (bukan baris baru pertanyaan)
      const prevIdx = currentBlock.options.length - 1;
      currentBlock.options[prevIdx] = {
        ...currentBlock.options[prevIdx],
        text: `${currentBlock.options[prevIdx].text} ${trimmed}`.trim(),
      };
    } else {
      currentBlock.stemLines.push(trimmed);
    }
  }

  if (currentBlock) {
    flushQuestionBlock(currentBlock, parsedBlocks, errors);
  }

  const questions = [];
  const answerKey = {};
  parsedBlocks.forEach((item, idx) => {
    const qId = `${idPrefix}${startIndex + idx}`;
    questions.push({
      id: qId,
      question: item.question,
      options: item.options,
      answerIdx: item.answerIdx,
      answerLetter: item.answerLetter,
    });
    answerKey[qId] = item.answerIdx;
  });

  return { questions, answerKey, errors };
}

export const AIKEN_SAMPLE_TEMPLATE = [
  'Prinsip enkapsulasi dalam OOP bertujuan untuk?',
  'A. Menghapus seluruh konstruktor kelas',
  'B. Menyembunyikan detail implementasi internal dan menjaga validitas state objek',
  'C. Menjalankan kode secara sinkron tanpa thread',
  'D. Menggandakan seluruh baris kode pada subclass',
  'E. Membatasi penggunaan interface publik',
  'ANSWER: B',
].join('\n');
