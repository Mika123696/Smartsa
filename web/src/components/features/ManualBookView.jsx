import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  fetchManualBooks,
  createManualBook,
  deleteManualBook,
  normalizeHttpsImageUrl,
} from '../../services/lmsFirestoreService';
import { uploadMediaFile } from '../../services/cloudinaryService';
import { AccessibleDialog } from '../common/AccessibleDialog';
import {
  BookMarked,
  FileText,
  Upload,
  Plus,
  Trash2,
  ExternalLink,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Link as LinkIcon,
} from 'lucide-react';

function getSafeHttpsPdfUrl(rawUrl) {
  try {
    return normalizeHttpsImageUrl(rawUrl, 'URL PDF Manual Book');
  } catch {
    return '';
  }
}

export default function ManualBookView() {
  const { currentUser, userProfile, role } = useAuth();
  const { t, language } = useLanguage();
  const isEducatorOrAdmin = role === ROLES.LECTURER || role === ROLES.ADMIN;

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [feedback, setFeedback] = useState(null);

  // Form upload / metadata Manual Book PDF (Lecturer / Admin only)
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [pdfUrlInput, setPdfUrlInput] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState('');
  const [storageType, setStorageType] = useState('cloudinary');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [savingBook, setSavingBook] = useState(false);

  // Konfirmasi hapus via AccessibleDialog (tanpa window.confirm)
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchManualBooks();
      const loadedBooks = res.books || [];
      setBooks(loadedBooks);
      setSelectedBookId((prev) =>
        prev && loadedBooks.some((b) => b.id === prev) ? prev : loadedBooks[0]?.id || ''
      );
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Gagal memuat daftar Manual Book dari Firestore.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadBooks();
    });
    return () => {
      active = false;
    };
  }, [loadBooks, currentUser?.uid]);

  const handleUploadPdfFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isEducatorOrAdmin || uploadingPdf || savingBook) return;

    const isPdf =
      file.type === 'application/pdf' ||
      String(file.name || '')
        .toLowerCase()
        .endsWith('.pdf');
    if (!isPdf) {
      setFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Manual Book only supports PDF (.pdf) documents.'
            : 'Manual Book hanya mendukung dokumen PDF (.pdf).',
      });
      return;
    }

    setUploadingPdf(true);
    setFeedback(null);
    try {
      const uploadResult = await uploadMediaFile(file, 'document');
      if (uploadResult?.isLive && uploadResult.url) {
        const cleanUrl = normalizeHttpsImageUrl(uploadResult.url, 'URL PDF Manual Book');
        setPdfUrlInput(cleanUrl);
        setUploadedFileName(file.name);
        setUploadedFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
        setStorageType('cloudinary');
        if (!titleInput.trim()) {
          setTitleInput(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
        }
        setFeedback({
          type: 'success',
          text:
            language === 'en'
              ? `PDF "${file.name}" uploaded to Cloudinary CDN. Click Save Manual Book to publish.`
              : `PDF "${file.name}" berhasil diunggah ke Cloudinary CDN. Klik Simpan Manual Book untuk menerbitkan.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text:
            uploadResult?.note ||
            (language === 'en'
              ? 'Cloudinary upload is unavailable on the server. Paste a valid https:// PDF URL instead.'
              : 'Unggah Cloudinary tidak aktif di server. Tempelkan URL PDF berawalan https:// di bawah.'),
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Gagal mengunggah dokumen PDF Manual Book.',
      });
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSaveBook = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingBook || uploadingPdf) return;
    setFeedback(null);

    try {
      const cleanTitle = titleInput.trim();
      if (!cleanTitle) {
        setFeedback({
          type: 'error',
          text:
            language === 'en'
              ? 'Manual Book title is required.'
              : 'Judul Manual Book wajib diisi.',
        });
        return;
      }

      const safeUrl = normalizeHttpsImageUrl(
        pdfUrlInput.trim(),
        language === 'en' ? 'Manual Book PDF URL' : 'URL PDF Manual Book'
      );
      if (!safeUrl) {
        setFeedback({
          type: 'error',
          text:
            language === 'en'
              ? 'Upload a PDF file or enter a valid https:// PDF URL.'
              : 'Unggah berkas PDF atau masukkan URL PDF berawalan https:// terlebih dahulu.',
        });
        return;
      }

      setSavingBook(true);
      const created = await createManualBook({
        title: cleanTitle,
        description: descriptionInput.trim(),
        fileUrl: safeUrl,
        fileName: uploadedFileName || `${cleanTitle}.pdf`,
        fileSize: uploadedFileSize,
        storageType: pdfUrlInput.includes('res.cloudinary.com') ? storageType : 'external_url',
        uploadedByName:
          userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Dosen / Admin',
      });

      setBooks((prev) => [created, ...prev]);
      setSelectedBookId(created.id);
      setTitleInput('');
      setDescriptionInput('');
      setPdfUrlInput('');
      setUploadedFileName('');
      setUploadedFileSize('');
      setStorageType('cloudinary');
      setFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Manual Book "${created.title}" published successfully.`
            : `Manual Book "${created.title}" berhasil disimpan dan dipublikasikan.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan Manual Book ke Firestore.',
      });
    } finally {
      setSavingBook(false);
    }
  };

  const executeDeleteBook = async () => {
    if (!isEducatorOrAdmin || deleting || !deleteTarget?.id) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const targetId = deleteTarget.id;
      const targetTitle = deleteTarget.title || '';
      await deleteManualBook(targetId);
      setBooks((prev) => {
        const nextBooks = prev.filter((b) => b.id !== targetId);
        setSelectedBookId((prevSelected) =>
          prevSelected === targetId ? nextBooks[0]?.id || '' : prevSelected
        );
        return nextBooks;
      });
      setDeleteTarget(null);
      setFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Manual Book "${targetTitle}" deleted.`
            : `Manual Book "${targetTitle}" berhasil dihapus.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus Manual Book.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const activeBook = books.find((b) => b.id === selectedBookId) || books[0] || null;
  const safeActivePdfUrl = activeBook ? getSafeHttpsPdfUrl(activeBook.fileUrl) : '';

  return (
    <div className="space-y-5">
      <AccessibleDialog
        isOpen={Boolean(deleteTarget)}
        variant="danger"
        title={language === 'en' ? 'Delete Manual Book' : 'Hapus Manual Book'}
        message={
          deleteTarget
            ? language === 'en'
              ? `Remove Manual Book "${deleteTarget.title}" permanently from Firestore?`
              : `Hapus dokumen Manual Book "${deleteTarget.title}" secara permanen dari Firestore?`
            : ''
        }
        confirmLabel={language === 'en' ? 'Yes, Delete' : 'Ya, Hapus'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => void executeDeleteBook()}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Header Banner */}
      <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-[#f59e0b]/15 border border-amber-200 dark:border-[#f59e0b]/40 text-amber-600 dark:text-[#f59e0b] flex items-center justify-center shrink-0">
            <BookMarked className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider block">
              // GLOBAL MANUAL BOOK &amp; ACADEMIC GUIDES
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {language === 'en'
                ? 'Smartsa Official Manual Books (PDF)'
                : 'Manual Book & Panduan Resmi Smartsa (PDF)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEducatorOrAdmin
                ? language === 'en'
                  ? 'Upload official PDF guides via Cloudinary CDN so students and instructors can preview and download them.'
                  : 'Unggah dokumen PDF panduan resmi via Cloudinary CDN untuk dibaca dan diunduh seluruh pengguna Smartsa.'
                : language === 'en'
                  ? 'Browse, preview, and download official laboratory and academic manual books.'
                  : 'Baca pratinjau langsung atau unduh panduan praktikum dan buku manual akademik resmi Smartsa.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadBooks()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0e1522] hover:bg-slate-100 dark:hover:bg-[#192233] text-xs font-mono font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{language === 'en' ? 'Refresh' : 'Muat Ulang'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-mono flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Educator / Admin Upload Form */}
      {isEducatorOrAdmin && (
        <form
          onSubmit={handleSaveBook}
          className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-3.5 font-mono"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#1b263b]">
            <h3 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Add Global Manual Book (PDF)' : 'Tambah Manual Book Global (PDF)'}
            </h3>
            <label
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                uploadingPdf || savingBook
                  ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploadingPdf
                  ? language === 'en'
                    ? 'Uploading PDF...'
                    : 'Mengunggah PDF...'
                  : language === 'en'
                    ? 'Upload PDF via Cloudinary'
                    : 'Unggah PDF Cloudinary'}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                aria-label={language === 'en' ? 'Upload Manual Book PDF file' : 'Unggah berkas PDF Manual Book'}
                disabled={uploadingPdf || savingBook}
                onChange={(e) => void handleUploadPdfFile(e)}
                className="sr-only"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                {language === 'en' ? 'Manual Book Title' : 'Judul Manual Book'}
              </label>
              <input
                type="text"
                required
                aria-label={language === 'en' ? 'Manual Book title' : 'Judul Manual Book'}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Contoh: Panduan Penggunaan Smartsa LMS 2026"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-sky-600 dark:text-[#00e5ff]" />
                <span>
                  {language === 'en'
                    ? 'HTTPS PDF URL (Auto-filled after Cloudinary upload)'
                    : 'URL PDF https:// (Terisi otomatis saat unggah Cloudinary)'}
                </span>
              </label>
              <input
                type="text"
                inputMode="url"
                required
                aria-label={language === 'en' ? 'Manual Book PDF URL' : 'URL PDF Manual Book'}
                value={pdfUrlInput}
                onChange={(e) => setPdfUrlInput(e.target.value)}
                placeholder="https://res.cloudinary.com/.../manual-book.pdf"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                {language === 'en' ? 'Short Description (Optional)' : 'Deskripsi Singkat (Opsional)'}
              </label>
              <input
                type="text"
                aria-label={language === 'en' ? 'Manual Book description' : 'Deskripsi Manual Book'}
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder="Panduan fitur presensi QR, pengumpulan tugas, dan evaluasi."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={savingBook || uploadingPdf}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-5 py-2.5 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              <BookMarked className="w-4 h-4" />
              <span>
                {savingBook
                  ? language === 'en'
                    ? 'Saving...'
                    : 'Menyimpan...'
                  : language === 'en'
                    ? 'Save Manual Book'
                    : 'Simpan Manual Book'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Library List + Safe Inline PDF Preview */}
      {loading ? (
        <div className="bg-white dark:bg-[#121822] p-10 rounded-xl border border-slate-200 dark:border-[#232f42] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
          {language === 'en' ? 'Loading Manual Books...' : 'Memuat Manual Book dari Cloud Firestore...'}
        </div>
      ) : books.length === 0 ? (
        <div className="bg-white dark:bg-[#121822] p-10 rounded-xl border border-dashed border-slate-300 dark:border-[#232f42] text-center space-y-2">
          <FileText className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {language === 'en'
              ? 'No Manual Books Published Yet'
              : 'Belum Ada Manual Book yang Tersedia'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {isEducatorOrAdmin
              ? language === 'en'
                ? 'Upload a PDF file or add an https:// PDF URL using the form above.'
                : 'Unggah berkas PDF melalui Cloudinary atau masukkan URL PDF https:// di formulir atas.'
              : language === 'en'
                ? 'Lecturers or administrators have not published a Manual Book PDF yet.'
                : 'Dosen atau admin belum mempublikasikan dokumen Manual Book PDF.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Sidebar Daftar Buku */}
          <div className="lg:col-span-5 space-y-2.5">
            {books.map((book) => {
              const safeUrl = getSafeHttpsPdfUrl(book.fileUrl);
              const isSelected = activeBook?.id === book.id;
              return (
                <div
                  key={book.id}
                  className={`p-4 rounded-xl border transition ${
                    isSelected
                      ? 'bg-amber-50/70 dark:bg-[#1a2232] border-amber-400 dark:border-[#f59e0b]'
                      : 'bg-white dark:bg-[#121822] border-slate-200 dark:border-[#232f42] hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBookId(book.id)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-600 dark:text-[#f59e0b] shrink-0" />
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                          {book.title}
                        </span>
                      </div>
                      {book.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                          {book.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        <span>{book.uploadedByName}</span>
                        {book.fileSize && <span>• {book.fileSize}</span>}
                        {book.createdAtLabel && <span>• {book.createdAtLabel}</span>}
                      </div>
                    </button>

                    {isEducatorOrAdmin && (
                      <button
                        type="button"
                        aria-label={`Hapus Manual Book ${book.title}`}
                        onClick={() => setDeleteTarget(book)}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 transition shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {safeUrl && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-slate-200/80 dark:border-[#232f42] font-mono">
                      <button
                        type="button"
                        onClick={() => setSelectedBookId(book.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 dark:bg-[#0e1522] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
                      >
                        {language === 'en' ? 'Preview' : 'Pratinjau'}
                      </button>
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-[#f59e0b] border border-amber-300 dark:border-[#f59e0b]/40 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{language === 'en' ? 'Open' : 'Buka'}</span>
                      </a>
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={book.fileName || undefined}
                        className="text-[11px] font-bold px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>{language === 'en' ? 'Download' : 'Unduh'}</span>
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-7 bg-white dark:bg-[#121822] p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-[#1b263b]">
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] uppercase block">
                  // PDF VIEWER
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {activeBook?.title}
                </h3>
              </div>
              {safeActivePdfUrl && (
                <div className="flex items-center gap-2 font-mono">
                  <a
                    href={safeActivePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0e1522] text-xs font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{language === 'en' ? 'OPEN TAB' : 'BUKA PDF'}</span>
                  </a>
                  <a
                    href={safeActivePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={activeBook?.fileName || undefined}
                    className="px-3 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{language === 'en' ? 'DOWNLOAD PDF' : 'UNDUH PDF'}</span>
                  </a>
                </div>
              )}
            </div>

            {safeActivePdfUrl ? (
              <iframe
                title={`Manual Book PDF: ${activeBook?.title || 'Dokumen PDF'}`}
                src={safeActivePdfUrl}
                className="w-full h-[520px] rounded-lg border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#070b12]"
              />
            ) : (
              <div className="p-8 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs font-mono text-rose-600 dark:text-rose-400">
                {language === 'en'
                  ? 'Blocked unsafe PDF URL. Only verified https:// URLs can be previewed.'
                  : 'Tautan PDF tidak valid atau diblokir demi keamanan. Hanya URL https:// yang diizinkan.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
