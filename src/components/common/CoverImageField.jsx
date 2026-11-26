import { useId, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import SafeImage from './SafeImage';
import {
  normalizeHttpsImageUrl,
  uploadHttpsImageToCloudinary,
} from '../../services/lmsFirestoreService';

/**
 * Kontrol terpadu URL cover kelas (`https://` atau kosong), pratinjau `<SafeImage />`,
 * unggah gambar via Cloudinary, serta tombol Hapus Cover.
 */
export default function CoverImageField({
  value = '',
  onChange,
  disabled = false,
  language = 'id',
  fallbackLabel = 'SMARTSA',
  previewAlt = 'Preview Cover Kelas',
  compact = false,
}) {
  const inputId = useId();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  let previewUrl = '';
  let validationError = '';
  if (typeof value === 'string' && value.trim()) {
    try {
      previewUrl = normalizeHttpsImageUrl(
        value,
        language === 'en' ? 'Class cover URL' : 'URL cover kelas'
      );
    } catch (err) {
      validationError = err.message;
      previewUrl = '';
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading || disabled) return;

    setUploading(true);
    setUploadStatus(null);
    try {
      const uploadedHttpsUrl = await uploadHttpsImageToCloudinary(
        file,
        language === 'en' ? 'Class cover image' : 'Gambar cover kelas'
      );
      onChange?.(uploadedHttpsUrl);
      setUploadStatus({
        type: 'success',
        text:
          language === 'en'
            ? 'Cover image uploaded to Cloudinary CDN.'
            : 'Cover kelas berhasil diunggah ke Cloudinary CDN.',
      });
    } catch (err) {
      setUploadStatus({
        type: 'error',
        text:
          err.message ||
          (language === 'en'
            ? 'Failed to upload class cover image.'
            : 'Gagal mengunggah gambar cover kelas.'),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClearCover = () => {
    if (disabled || uploading) return;
    setUploadStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onChange?.('');
  };

  const labelText = language === 'en' ? 'Class Cover Image (Optional)' : 'Cover Kelas (Opsional)';
  const urlAriaLabel = language === 'en' ? 'Class cover image URL' : 'URL cover kelas';
  const uploadAriaLabel =
    language === 'en' ? 'Upload class cover image' : 'Unggah gambar cover kelas';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className={`flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 ${
            compact ? 'text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400' : 'text-xs'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
          <span>{labelText}</span>
        </label>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {language === 'en' ? 'HTTPS URL or Cloudinary CDN' : 'URL https:// atau Cloudinary'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[128px_1fr] gap-3 items-start">
        <div className="relative h-20 w-full sm:w-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-[#0b0f17] shrink-0">
          <SafeImage
            src={previewUrl}
            alt={previewAlt}
            fallbackLabel={fallbackLabel}
            variant="cover"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="space-y-2 min-w-0">
          <input
            id={inputId}
            type="text"
            inputMode="url"
            aria-label={urlAriaLabel}
            disabled={disabled || uploading}
            placeholder="https://res.cloudinary.com/.../cover.jpg"
            value={value}
            onChange={(e) => {
              setUploadStatus(null);
              onChange?.(e.target.value);
            }}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100 disabled:opacity-60"
          />

          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                disabled || uploading
                  ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {uploading
                  ? language === 'en'
                    ? 'Uploading...'
                    : 'Mengunggah...'
                  : language === 'en'
                    ? 'Upload Cover'
                    : 'Unggah Cover'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label={uploadAriaLabel}
                disabled={disabled || uploading}
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={handleClearCover}
              disabled={disabled || uploading || !value}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'Remove Cover' : 'Hapus Cover'}</span>
            </button>
          </div>
        </div>
      </div>

      {validationError && (
        <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{validationError}</span>
        </p>
      )}

      {!validationError && uploadStatus && (
        <p
          className={`text-[11px] flex items-center gap-1 ${
            uploadStatus.type === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {uploadStatus.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{uploadStatus.text}</span>
        </p>
      )}
    </div>
  );
}
