import React, { useState, useEffect, useMemo } from 'react';
import {
  QrCode,
  RefreshCw,
  Power,
  Copy,
  Check,
  Clock,
} from 'lucide-react';
import {
  generateQrMatrix,
  getActiveQrSession,
  startQrSessionForCourse,
  stopQrSessionForCourse,
} from '../../services/dosenClassService';

export default function QrAttendanceWidget({ matkulId, matkulCode, selectedPertemuan, onOpenKelas }) {
  const [qrSession, setQrSession] = useState(() => getActiveQrSession(matkulId));
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    const active = getActiveQrSession(matkulId);
    return active ? Math.max(0, Math.floor((active.expiresAt - Date.now()) / 1000)) : 0;
  });
  const [copiedToken, setCopiedToken] = useState(false);

  // Sync across components when QR session changes
  useEffect(() => {
    const syncSession = () => {
      const active = getActiveQrSession(matkulId);
      setQrSession(active);
      setRemainingSeconds(
        active ? Math.max(0, Math.floor((active.expiresAt - Date.now()) / 1000)) : 0
      );
    };

    syncSession();
    window.addEventListener('smartsa_dosen_qr_updated', syncSession);
    return () => window.removeEventListener('smartsa_dosen_qr_updated', syncSession);
  }, [matkulId]);

  // Countdown tick
  useEffect(() => {
    if (!qrSession) return undefined;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((qrSession.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0) {
        stopQrSessionForCourse(matkulId);
        setQrSession(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [qrSession, matkulId]);

  const isSessionForSelectedMeeting =
    qrSession && Number(qrSession.pertemuan) === Number(selectedPertemuan);

  const qrMatrix = useMemo(() => {
    const seed = isSessionForSelectedMeeting
      ? `SMARTSA|${matkulId}|${qrSession.token}`
      : `SMARTSA|${matkulId}|P${selectedPertemuan}`;
    return generateQrMatrix(seed, 21);
  }, [matkulId, isSessionForSelectedMeeting, qrSession, selectedPertemuan]);

  const handleActivate = () => {
    const session = startQrSessionForCourse(matkulId, matkulCode, selectedPertemuan);
    setQrSession(session);
    setRemainingSeconds(900);
  };

  const handleStop = () => {
    stopQrSessionForCourse(matkulId);
    setQrSession(null);
    setRemainingSeconds(0);
  };

  const handleCopy = () => {
    if (!qrSession?.token) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(qrSession.token).catch(() => {});
    }
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 1800);
  };

  const formatCountdown = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const meetingPad = selectedPertemuan < 10 ? `0${selectedPertemuan}` : selectedPertemuan;

  return (
    <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2738] pb-2.5">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-[#00e5ff]" />
          <div>
            <h3 className="text-xs font-mono font-bold text-slate-100 uppercase">
              Generator QR Code Presensi (Pertemuan {meetingPad})
            </h3>
          </div>
        </div>

        {!isSessionForSelectedMeeting ? (
          <button
            type="button"
            onClick={handleActivate}
            className="px-3 py-1.5 rounded-lg bg-[#00e5ff] hover:bg-cyan-300 text-black text-[11px] font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Aktifkan QR Sesi</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleActivate}
              className="px-2.5 py-1.5 rounded-lg bg-[#182436] hover:bg-[#22334d] text-[#00e5ff] border border-[#00e5ff]/30 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
              title="Buat ulang token QR"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Power className="w-3 h-3" />
              <span>Tutup</span>
            </button>
          </div>
        )}
      </div>

      {isSessionForSelectedMeeting ? (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 bg-[#0a0f18] rounded-xl border border-[#00e5ff]/30">
          <div className="p-2.5 bg-white rounded-xl shadow-lg shrink-0">
            <svg
              width="124"
              height="124"
              viewBox="0 0 21 21"
              shapeRendering="crispEdges"
              aria-label="QR Code Presensi Kuliah"
            >
              <rect width="21" height="21" fill="#ffffff" />
              {qrMatrix.map((row, rIdx) =>
                row.map((cell, cIdx) =>
                  cell ? (
                    <rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx}
                      y={rIdx}
                      width="1"
                      height="1"
                      fill="#0d1117"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-left font-mono">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              SESI QR AKTIF • PERTEMUAN {meetingPad}
            </div>

            <p className="text-[11px] text-slate-300 font-sans">
              Mahasiswa dapat memindai QR Code ini atau memasukkan token presensi selama sesi berlangsung.
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <code className="px-2.5 py-1 rounded bg-[#141e2e] border border-[#243652] text-[#f59e0b] text-xs font-bold">
                {qrSession.token}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-[#182334] hover:bg-[#23324a] text-slate-200 border border-slate-700 text-[10px] flex items-center gap-1 cursor-pointer"
              >
                {copiedToken ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin Kode</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-[#00e5ff]">
              <Clock className="w-3.5 h-3.5" />
              <span>Sisa waktu berlaku: {formatCountdown(remainingSeconds)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#0a0f18] border border-dashed border-[#243247] text-center space-y-1.5">
          <p className="text-xs text-slate-300 font-medium">
            Sesi QR Code belum diaktifkan untuk Pertemuan {meetingPad}.
          </p>
          <p className="text-[11px] text-slate-500">
            Klik &ldquo;Aktifkan QR Sesi&rdquo; untuk menampilkan QR Code presensi cepat di kelas.
          </p>
        </div>
      )}

      {onOpenKelas && (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onOpenKelas}
            className="text-[11px] font-mono font-bold text-[#f59e0b] hover:text-[#fbbf24] hover:underline cursor-pointer"
          >
            Kelola Presensi Manual &amp; Daftar 20 Mahasiswa di Halaman Kelas &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
