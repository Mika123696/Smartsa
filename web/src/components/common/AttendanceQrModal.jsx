import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/useLanguage';
import { buildAttendanceQrPayload } from '../../services/attendanceService';
import { Clock, Maximize2, X, XCircle, QrCode, Copy, Check } from 'lucide-react';

function formatCountdown(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '00:00';
  const totalSec = Math.floor(remainingMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

/**
 * Menampilkan QR Code visual sesi presensi (hasil `qrcode.toDataURL`),
 * countdown sisa waktu, tombol salin kode, tombol tutup sesi, dan Mode Proyektor (Layar Penuh).
 */
export default function AttendanceQrModal({
  session,
  classCode = '',
  className = '',
  onCloseSession,
  closing = false,
}) {
  const { language } = useLanguage();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [projectorOpen, setProjectorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const sessionCode = String(session?.sessionCode || '').trim().toUpperCase();
  const qrPayload = buildAttendanceQrPayload(sessionCode);

  useEffect(() => {
    let active = true;
    if (!qrPayload) return undefined;

    import('qrcode')
      .then((mod) => {
        const api = mod?.default || mod;
        return api.toDataURL(qrPayload, {
          width: 360,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#0b0f17', light: '#ffffff' },
        });
      })
      .then((dataUrl) => {
        if (!active) return;
        setQrDataUrl(dataUrl);
        setQrError('');
      })
      .catch((err) => {
        if (!active) return;
        setQrDataUrl('');
        setQrError(err?.message || 'Gagal merender gambar QR Code.');
      });

    return () => {
      active = false;
    };
  }, [qrPayload]);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.expiresAt]);

  if (!session?.isOpen || !sessionCode) return null;

  const expiresAtMs = Number(session.expiresAt || 0);
  const remainingMs = expiresAtMs > 0 ? Math.max(0, expiresAtMs - nowMs) : null;
  const isExpired = expiresAtMs > 0 && remainingMs <= 0;

  const handleCopyCode = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(sessionCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };

  return (
    <>
      <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
          {/* Visual QR Card */}
          <div className="w-36 h-36 rounded-xl bg-white p-2 border-2 border-emerald-300 dark:border-emerald-500/50 shadow-sm flex items-center justify-center shrink-0 mx-auto sm:mx-0">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code Presensi ${sessionCode}`}
                className="w-full h-full object-contain rounded"
              />
            ) : qrError ? (
              <div className="text-center text-[10px] font-mono text-rose-600 p-1">
                <QrCode className="w-7 h-7 mx-auto mb-1 text-slate-400" />
                <span>{sessionCode}</span>
              </div>
            ) : (
              <div className="text-center text-[10px] font-mono text-slate-500 flex flex-col items-center gap-1">
                <QrCode className="w-7 h-7 text-amber-500 animate-pulse" />
                <span>QR...</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5 font-mono min-w-0">
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase block">
              ● {language === 'en' ? 'ATTENDANCE SESSION OPEN' : 'SESI PRESENSI SEDANG AKTIF'} —{' '}
              {language === 'en' ? 'MEETING' : 'PERTEMUAN'}{' '}
              {Number(session.meetingNo) < 10 ? `0${session.meetingNo}` : session.meetingNo}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 dark:text-white break-all">
                {sessionCode}
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label={language === 'en' ? 'Copy session code' : 'Salin kode sesi'}
                className="px-2 py-1 rounded border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-[#0e1522] text-[10px] font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? (language === 'en' ? 'Copied' : 'Tersalin') : language === 'en' ? 'Copy' : 'Salin'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
              {remainingMs !== null && (
                <span
                  className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded border ${
                    isExpired
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
                      : 'bg-white dark:bg-[#0b0f17] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>
                    {language === 'en' ? 'Remaining:' : 'Sisa waktu:'}{' '}
                    {isExpired ? (language === 'en' ? 'Expired' : 'Kedaluwarsa') : formatCountdown(remainingMs)}
                  </span>
                </span>
              )}
              {expiresAtMs > 0 && (
                <span>
                  ({language === 'en' ? 'Until' : 'Hingga'}{' '}
                  {new Date(expiresAtMs).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  WIB)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-col gap-2 shrink-0 font-mono">
          <button
            type="button"
            onClick={() => setProjectorOpen(true)}
            className="bg-slate-900 dark:bg-[#f59e0b] hover:bg-slate-800 dark:hover:bg-[#d97706] text-white dark:text-black text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition inline-flex items-center justify-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'Projector Mode' : 'Mode Proyektor (Layar Penuh)'}</span>
          </button>

          {typeof onCloseSession === 'function' && (
            <button
              type="button"
              onClick={onCloseSession}
              disabled={closing}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-sm transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'CLOSE SESSION' : 'TUTUP SESI PRESENSI'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Proyektor (Layar Penuh) */}
      {projectorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="projector-qr-title"
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
        >
          <div className="w-full max-w-2xl bg-[#0e1522] border border-amber-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl relative">
            <button
              type="button"
              aria-label={language === 'en' ? 'Close Projector Mode' : 'Tutup Mode Proyektor'}
              onClick={() => setProjectorOpen(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1 font-mono">
              <span className="text-xs font-bold text-[#f59e0b] uppercase tracking-widest block">
                {classCode ? `${classCode} • ` : ''}
                {language === 'en' ? 'ATTENDANCE QR PROJECTOR' : 'PROYEKTOR QR PRESENSI KULIAH'}
              </span>
              <h3 id="projector-qr-title" className="text-lg sm:text-xl font-bold text-white">
                {className ? `${className} — ` : ''}
                {language === 'en' ? 'Meeting' : 'Pertemuan'} {session.meetingNo}
              </h3>
            </div>

            <div className="w-64 h-64 sm:w-80 sm:h-80 mx-auto bg-white p-4 rounded-2xl border-4 border-[#f59e0b] shadow-2xl flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Proyektor ${sessionCode}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="font-mono text-slate-800 font-bold text-lg">{sessionCode}</div>
              )}
            </div>

            <div className="space-y-2 font-mono">
              <p className="text-xs text-slate-400 uppercase tracking-wider">
                {language === 'en' ? 'OR ENTER SESSION CODE MANUALLY:' : 'ATAU MASUKKAN KODE SESI MANUAL:'}
              </p>
              <div className="inline-block px-6 py-2.5 rounded-xl bg-black/60 border border-slate-700 text-2xl sm:text-4xl font-black tracking-[0.18em] text-[#f59e0b]">
                {sessionCode}
              </div>
              {remainingMs !== null && (
                <p className="text-sm font-bold text-emerald-400">
                  {language === 'en' ? 'Time remaining:' : 'Sisa waktu sesi:'}{' '}
                  {isExpired ? (language === 'en' ? 'Expired' : 'Kedaluwarsa') : formatCountdown(remainingMs)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2 font-mono">
              <button
                type="button"
                onClick={() => setProjectorOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold transition"
              >
                {language === 'en' ? 'Exit Projector' : 'Tutup Proyektor'}
              </button>
              {typeof onCloseSession === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    setProjectorOpen(false);
                    onCloseSession();
                  }}
                  disabled={closing}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {language === 'en' ? 'Close Attendance Session' : 'Tutup Sesi Presensi'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
