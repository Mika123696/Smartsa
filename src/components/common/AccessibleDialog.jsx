import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/**
 * Dialog / Toast Aksesibel pengganti window.confirm() dan window.alert()
 * Memenuhi WCAG: role="dialog", aria-modal="true", aria-labelledby, dukungan Escape & auto-focus.
 */
export function AccessibleDialog({
  isOpen,
  title,
  message,
  variant = 'confirm', // 'confirm' | 'alert' | 'danger' | 'success'
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const descId = useId();
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevFocus = document.activeElement;
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 10);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        prevFocus.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAlertOnly = variant === 'alert' || variant === 'success';
  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a]">
          <div className="flex items-center gap-2.5">
            {variant === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : isDanger ? (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-amber-500 shrink-0" />
            )}
            <h2 id={titleId} className="text-sm font-bold tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <p id={descId} className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0f141e] border-t border-slate-200 dark:border-[#232f42] flex items-center justify-end gap-2">
          {!isAlertOnly && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => {
              if (onConfirm) {
                onConfirm();
              } else {
                onClose?.();
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : variant === 'success'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-[#f59e0b] hover:bg-[#d97706] text-black'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccessibleToast({ toast, onDismiss }) {
  if (!toast) return null;

  const isError = toast.type === 'error';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 md:bottom-6 right-4 z-[75] max-w-sm rounded-xl border px-4 py-3 shadow-xl flex items-start gap-2.5 text-xs ${
        isError
          ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
          : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
      }`}
    >
      {isError ? (
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
      ) : (
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
      )}
      <span className="flex-1 leading-relaxed font-medium">{toast.text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup notifikasi"
          className="text-current/70 hover:text-current p-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
