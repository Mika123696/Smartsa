import React, { useState, useRef } from 'react';
import {
  FileUp,
  FileText,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  PenTool,
  Bold,
  Italic,
  Heading2,
  List,
  Code,
  Quote,
  Eye,
  Edit3,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import RichNoteRenderer from './RichNoteRenderer';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function MateriUpload({
  matkulId,
  matkulCode,
  matkulName,
  onSubmitMateri,
  onCancel,
}) {
  // Dual Mode Input: 'text' (Ketikan Materi) | 'pdf' (Upload Dokumen PDF)
  const [inputMode, setInputMode] = useState('text');
  const [pertemuan, setPertemuan] = useState(1);
  const [judul, setJudul] = useState('');
  const [deskripsi, setDeskripsi] = useState('');

  // State Mode Ketikan Materi
  const [kontenTeks, setKontenTeks] = useState('');
  const [isTextPreview, setIsTextPreview] = useState(false);
  const textareaRef = useRef(null);

  // State Mode Upload Dokumen PDF
  const [pdfFile, setPdfFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSizeLabel, setFileSizeLabel] = useState('');
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const fileInputRef = useRef(null);

  // Feedback State
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Sisip formatting ringkas ke textarea pada posisi kursor
  const applyFormatSnippet = (prefix, suffix = '', placeholder = 'teks') => {
    const el = textareaRef.current;
    if (!el) {
      setKontenTeks((prev) => `${prev}${prev ? '\n' : ''}${prefix}${placeholder}${suffix}`);
      return;
    }

    const start = el.selectionStart ?? kontenTeks.length;
    const end = el.selectionEnd ?? kontenTeks.length;
    const selectedText = kontenTeks.slice(start, end) || placeholder;
    const updated =
      kontenTeks.slice(0, start) +
      prefix +
      selectedText +
      suffix +
      kontenTeks.slice(end);

    setKontenTeks(updated);
    setIsTextPreview(false);

    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + prefix.length;
      const cursorEnd = cursorStart + selectedText.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  // Validasi Ketat File PDF (MIME application/pdf & Maks 10MB)
  const validateAndSetPdf = (file) => {
    if (!file) return;

    const isPdfMime = file.type === 'application/pdf';
    const isPdfExtension = file.name.toLowerCase().endsWith('.pdf');

    if (!isPdfMime || !isPdfExtension) {
      setErrorMessage(
        `Format file ditolak (${file.type || 'tidak dikenal'}). Wajib menggunakan dokumen PDF dengan MIME-type application/pdf.`
      );
      clearPdfSelection();
      return;
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      setErrorMessage(
        `Ukuran file "${file.name}" (${formatFileSize(file.size)}) melebihi batas maksimal 10 MB.`
      );
      clearPdfSelection();
      return;
    }

    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }

    const blobUrl = URL.createObjectURL(file);
    setErrorMessage('');
    setPdfFile(file);
    setFileName(file.name);
    setFileSizeLabel(formatFileSize(file.size));
    setPreviewBlobUrl(blobUrl);
  };

  const clearPdfSelection = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPdfFile(null);
    setFileName('');
    setFileSizeLabel('');
    setPreviewBlobUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetPdf(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      validateAndSetPdf(file);
    }
  };

  const handleModeSwitch = (nextMode) => {
    setInputMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!judul.trim()) {
      setErrorMessage('Judul materi wajib diisi.');
      return;
    }

    if (inputMode === 'text') {
      if (!kontenTeks.trim() || kontenTeks.trim().length < 10) {
        setErrorMessage('Isi ketikan materi minimal 10 karakter agar informatif untuk mahasiswa.');
        return;
      }
    } else if (inputMode === 'pdf') {
      if (!pdfFile) {
        setErrorMessage('Silakan pilih file dokumen PDF (maksimal 10 MB) terlebih dahulu.');
        return;
      }
      if (pdfFile.type !== 'application/pdf') {
        setErrorMessage('Validasi gagal: File harus bertipe MIME application/pdf.');
        return;
      }
      if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
        setErrorMessage('Validasi gagal: Ukuran dokumen PDF melebihi batas maksimal 10 MB.');
        return;
      }
    }

    const now = new Date();
    const materiData = {
      id: `mat_${Date.now()}`,
      matkulId: matkulId || 'general',
      matkulCode: matkulCode || '',
      pertemuan: Number(pertemuan),
      mode: inputMode,
      judul: judul.trim(),
      deskripsi:
        deskripsi.trim() ||
        (inputMode === 'text'
          ? 'Catatan perkuliahan langsung dari dosen pengampu.'
          : `Dokumen modul PDF (${fileSizeLabel}) untuk dipelajari mahasiswa.`),
      kontenTeks: inputMode === 'text' ? kontenTeks.trim() : '',
      fileName: inputMode === 'pdf' ? fileName : null,
      fileSize: inputMode === 'pdf' ? fileSizeLabel : null,
      fileMimeType: inputMode === 'pdf' ? pdfFile.type : null,
      pdfBlobUrl: inputMode === 'pdf' ? previewBlobUrl : null,
      createdAt: now.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      createdAtTime: now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    if (onSubmitMateri) {
      onSubmitMateri(materiData);
    }

    // Reset form (do NOT revoke previewBlobUrl here because published list holds it for preview)
    setJudul('');
    setDeskripsi('');
    setKontenTeks('');
    setIsTextPreview(false);
    setPdfFile(null);
    setFileName('');
    setFileSizeLabel('');
    setPreviewBlobUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setSuccessMessage(
      inputMode === 'text'
        ? 'Materi ketikan dosen berhasil dipublikasikan ke mata kuliah!'
        : 'Dokumen PDF berhasil divalidasi & dipublikasikan ke mata kuliah!'
    );

    setTimeout(() => {
      setSuccessMessage('');
    }, 3000);
  };

  return (
    <div className="w-full p-4 sm:p-5 bg-[#121822] text-slate-100 rounded-xl border border-[#232f42] shadow-xl relative overflow-hidden font-sans">
      {/* Decorative Top Accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#00e5ff] to-[#f59e0b]" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#1c2738]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/40 flex items-center justify-center shrink-0">
            {inputMode === 'text' ? (
              <PenTool className="w-4 h-4" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-mono font-bold text-[#00e5ff] uppercase tracking-wider block">
              // DUAL INPUT MATERI {matkulCode ? `• ${matkulCode}` : ''}
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate">
              Publikasikan Materi {matkulName ? `— ${matkulName}` : 'Perkuliahan'}
            </h3>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-[#182334] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            title="Tutup Form"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* PILIHAN MODE INPUT (Radio Button & Toggle) */}
      <div className="mb-4">
        <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
          Pilih Mode Input Materi
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label
            className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
              inputMode === 'text'
                ? 'bg-[#182436] border-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.12)]'
                : 'bg-[#0b1019] border-[#1f2c40] hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="materiInputMode"
              value="text"
              checked={inputMode === 'text'}
              onChange={() => handleModeSwitch('text')}
              className="mt-0.5 accent-[#00e5ff]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span className="text-xs font-bold text-slate-100">
                  Ketikan Materi Langsung
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Editor teks panjang + formatting ringkas untuk catatan langsung dari dosen.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
              inputMode === 'pdf'
                ? 'bg-[#221a0d] border-[#f59e0b] shadow-[0_0_12px_rgba(245,158,11,0.12)]'
                : 'bg-[#0b1019] border-[#1f2c40] hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="materiInputMode"
              value="pdf"
              checked={inputMode === 'pdf'}
              onChange={() => handleModeSwitch('pdf')}
              className="mt-0.5 accent-[#f59e0b]"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <FileUp className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span className="text-xs font-bold text-slate-100">
                  Upload Dokumen PDF
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Khusus MIME <code className="text-[#f59e0b]">application/pdf</code> • Maks 10 MB.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Alert Error */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Alert Sukses */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Pertemuan + Judul */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
              Pertemuan
            </label>
            <select
              value={pertemuan}
              onChange={(e) => setPertemuan(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-[#f59e0b] font-mono"
            >
              {Array.from({ length: 16 }, (_, idx) => idx + 1).map((num) => (
                <option key={num} value={num}>
                  Pertemuan {num < 10 ? `0${num}` : num}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
              Judul Materi <span className="text-[#f59e0b]">*</span>
            </label>
            <input
              type="text"
              value={judul}
              onChange={(e) => {
                setJudul(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder="Contoh: Pertemuan 03 - Arsitektur MVC & Clean Code"
              className="w-full px-3 py-2.5 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#f59e0b] transition"
            />
          </div>
        </div>

        {/* MODE A: KETIKAN MATERI (Rich Text / Textarea Panjang + Formatting Ringkas) */}
        {inputMode === 'text' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-[10px] font-mono font-bold text-slate-300 uppercase">
                Isi Catatan / Ketikan Materi <span className="text-[#00e5ff]">*</span>
              </label>

              <div className="flex items-center gap-1 bg-[#0a0f18] border border-slate-700 rounded-md p-0.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setIsTextPreview(false)}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                    !isTextPreview
                      ? 'bg-[#00e5ff] text-black font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  Tulis
                </button>
                <button
                  type="button"
                  onClick={() => setIsTextPreview(true)}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                    isTextPreview
                      ? 'bg-[#00e5ff] text-black font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  Pratinjau
                </button>
              </div>
            </div>

            {/* Formatting Toolbar Ringkas */}
            {!isTextPreview && (
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#0b111c] border border-[#223047] rounded-lg">
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('## ', '', 'Subjudul Bagian')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Sisipkan Subjudul"
                >
                  <Heading2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>Judul</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('**', '**', 'teks tebal')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Tebal"
                >
                  <Bold className="w-3.5 h-3.5 text-[#00e5ff]" />
                  <span>Bold</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('*', '*', 'teks miring')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Miring"
                >
                  <Italic className="w-3.5 h-3.5 text-[#00e5ff]" />
                  <span>Italic</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('\n- ', '', 'Poin pembahasan')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Daftar Poin"
                >
                  <List className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Poin</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('`', '`', 'kodeProgram()')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Kode Inline"
                >
                  <Code className="w-3.5 h-3.5 text-purple-400" />
                  <span>Kode</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatSnippet('\n> ', '', 'Catatan penting untuk mahasiswa')}
                  className="px-2 py-1 rounded bg-[#141e2e] hover:bg-[#1e2d44] text-slate-200 text-[11px] font-mono flex items-center gap-1 transition cursor-pointer"
                  title="Kotak Catatan"
                >
                  <Quote className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>Catatan</span>
                </button>
              </div>
            )}

            {isTextPreview ? (
              <div className="min-h-[180px] p-3.5 bg-[#090e17] border border-[#223047] rounded-lg">
                <RichNoteRenderer content={kontenTeks} />
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={kontenTeks}
                onChange={(e) => {
                  setKontenTeks(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder={`Tuliskan ringkasan teori, contoh kasus, atau instruksi pembelajaran untuk mahasiswa...\n\nContoh:\n## Konsep Utama\n- Gunakan **Enkapsulasi** untuk melindungi state objek.\n> Catatan: Pelajari studi kasus sebelum sesi diskusi.`}
                rows={7}
                className="w-full px-3.5 py-2.5 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#00e5ff] transition resize-y font-sans leading-relaxed"
              />
            )}

            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Mendukung format: ## Subjudul, **tebal**, *miring*, - daftar, `kode`, &gt; catatan</span>
              <span>{kontenTeks.length} karakter</span>
            </div>
          </div>
        )}

        {/* MODE B: UPLOAD DOKUMEN PDF (MIME application/pdf, Maks 10MB, Preview Nama File) */}
        {inputMode === 'pdf' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
                Upload Dokumen PDF <span className="text-[#f59e0b]">*</span>
              </label>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-700 hover:border-[#f59e0b] rounded-xl p-5 text-center bg-[#090e17] transition-all cursor-pointer relative group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="flex flex-col items-center pointer-events-none">
                  <div className="w-11 h-11 rounded-xl bg-[#22190c] border border-[#f59e0b]/40 text-[#f59e0b] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <FileUp className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-200">
                    {fileName ? fileName : 'Pilih dokumen PDF atau seret ke area ini'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">
                    Validasi: MIME <span className="text-[#f59e0b]">application/pdf</span> • Maksimal <span className="text-[#00e5ff]">10 MB</span>
                  </p>
                </div>
              </div>

              {/* Preview Nama File & Aksi PDF Terpilih */}
              {fileName && (
                <div className="mt-2.5 p-3 bg-emerald-950/35 border border-emerald-500/40 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-emerald-200 font-bold truncate">{fileName}</p>
                      <p className="text-[10px] text-emerald-400/90">
                        Ukuran: {fileSizeLabel} • MIME: {pdfFile?.type || 'application/pdf'} • Tervalidasi ✓
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {previewBlobUrl && (
                      <a
                        href={previewBlobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-[#142334] hover:bg-[#1c324a] text-[#00e5ff] border border-[#00e5ff]/40 text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Preview
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={clearPdfSelection}
                      className="p-1.5 rounded bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                      title="Hapus file terpilih"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1.5 uppercase">
                Catatan Singkat Dokumen (Opsional)
              </label>
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="Instruksi halaman yang perlu dibaca atau tugas bacaan terkait dokumen PDF ini..."
                rows={2}
                className="w-full px-3 py-2 bg-[#0a0f18] border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#f59e0b] transition resize-y"
              />
            </div>
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#1c2738]">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-white bg-[#162030] hover:bg-[#1e2a3f] transition cursor-pointer"
            >
              Batal
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>
              {inputMode === 'text' ? 'Publikasikan Ketikan' : 'Unggah Dokumen PDF'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

