import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  QrCode,
  Clock,
  CheckCircle2,
  X,
  Camera,
  Barcode,
  TrendingUp,
} from 'lucide-react';
import { DEMO_SUBJECTS } from '../../services/mockData';
import { getClassAttendance, recordMeetingAttendance } from '../../services/attendanceService';

export default function ScheduleTab() {
  const { t } = useLanguage();
  const [selectedQRSubject, setSelectedQRSubject] = useState(null);
  const [selectedHistorySubject, setSelectedHistorySubject] = useState(null);
  const [qrScanned, setQrScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  // Pengelompokan Jadwal Berdasarkan Hari
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

  const getDayName = (d) => {
    switch (d) {
      case 'Senin': return t('day_monday');
      case 'Selasa': return t('day_tuesday');
      case 'Rabu': return t('day_wednesday');
      case 'Kamis': return t('day_thursday');
      case 'Jumat': return t('day_friday');
      default: return d;
    }
  };

  const handleOpenQR = (subj) => {
    setSelectedQRSubject(subj);
    setQrScanned(false);
    setIsScanning(false);
    setLastScanResult(null);
  };

  const handleTriggerScan = () => {
    if (!selectedQRSubject) return;
    setIsScanning(true);
    setTimeout(() => {
      const res = recordMeetingAttendance(
        selectedQRSubject.id,
        1,
        `Pertemuan 01: ${selectedQRSubject.title}`,
        `${selectedQRSubject.code}-M01-SCAN-1047`
      );
      setLastScanResult(res);
      setIsScanning(false);
      setQrScanned(true);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
          {t('schedule_title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {t('schedule_subtitle')}
        </p>
      </div>

      {/* Grouped by Days */}
      <div className="space-y-6">
        {days.map((day) => {
          const subjectsForDay = DEMO_SUBJECTS.filter((s) => s.day === day);
          if (subjectsForDay.length === 0) return null;

          return (
            <div key={day} className="space-y-3">
              <h2 className="text-sm font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-2">
                <span>{getDayName(day)}</span>
              </h2>

              <div className="space-y-3">
                {subjectsForDay.map((subj) => (
                  <div
                    key={subj.id}
                    className="bg-[#121822] p-5 rounded-2xl border border-[#232f42] shadow-xs hover:border-[#f59e0b]/40 transition-all space-y-3 text-slate-100"
                  >
                    {/* Course Title & Lecturer */}
                    <div>
                      <h3 className="text-base font-bold text-slate-100 leading-snug">
                        {subj.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        {subj.lecturer}
                      </p>
                      <p className="text-xs font-medium text-slate-300 mt-0.5">
                        {subj.time}
                      </p>
                    </div>

                    {/* Action Pills matching screenshots */}
                    <div className="pt-2 flex flex-wrap gap-2.5">
                      <button
                        onClick={() => handleOpenQR(subj)}
                        className="bg-[#18212e] hover:bg-[#202d40] text-[#f59e0b] text-xs font-semibold px-3 py-2 rounded-xl border border-[#2b3a4f] transition flex items-center gap-1.5"
                      >
                        <QrCode className="w-4 h-4 text-[#f59e0b]" />
                        <span>{t('scan_qr_btn')}</span>
                      </button>

                      <button
                        onClick={() => setSelectedHistorySubject(subj)}
                        className="bg-[#18212e] hover:bg-[#202d40] text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl border border-[#2b3a4f] transition flex items-center gap-1.5"
                      >
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>{t('history_btn')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Spacer ekstra di bagian bawah agar kartu hari terakhir (Jumat/Friday) bisa di-scroll jauh ke atas dan tidak tertutup navbar */}
      <div className="h-28 w-full" aria-hidden="true" />

      {/* Modal Presensi via QR */}
      {selectedQRSubject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#161d2a] text-white p-5 flex items-center justify-between border-b border-[#232f42]">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#f59e0b]" />
                <h3 className="text-base font-bold">{t('qr_modal_title')}</h3>
              </div>
              <button
                onClick={() => setSelectedQRSubject(null)}
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-100">{selectedQRSubject.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{selectedQRSubject.lecturer}</p>
                <p className="text-xs font-mono text-[#f59e0b] font-semibold mt-1">
                  {getDayName(selectedQRSubject.day)}, {selectedQRSubject.time}
                </p>
              </div>

              {!qrScanned ? (
                <div className="space-y-4">
                  {/* Simulated Scanner Viewport */}
                  <div className="w-52 h-52 mx-auto bg-slate-900 rounded-2xl relative overflow-hidden flex items-center justify-center border-4 border-[#f59e0b]/40">
                    <Camera className="w-12 h-12 text-slate-600" />
                    {isScanning && (
                      <div className="absolute inset-x-0 h-1 bg-[#f59e0b] shadow-[0_0_12px_#f59e0b] animate-bounce top-1/2"></div>
                    )}
                    <span className="absolute bottom-2 text-[10px] text-slate-400">
                      {t('qr_scanning')}
                    </span>
                  </div>

                  <button
                    onClick={handleTriggerScan}
                    disabled={isScanning}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold py-3 rounded-xl shadow-md transition disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{isScanning ? t('qr_scanning') : t('qr_scan_trigger')}</span>
                  </button>
                </div>
              ) : (
                <div className="py-4 space-y-3 font-mono">
                  <div className="w-16 h-16 bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-3xl font-bold shadow-lg">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="text-base font-bold text-slate-100">
                    {t('qr_scanned_success')}
                  </h4>
                  <div className="p-2.5 bg-[#0a111a] border border-emerald-500/30 rounded-lg text-xs space-y-1">
                    <p className="text-emerald-400 font-bold">
                      {lastScanResult?.message || 'Presensi Berhasil Dicatat!'}
                    </p>
                    <p className="text-[11px] text-[#00e5ff] font-bold">
                      +{lastScanResult?.addedPercent || 6}% PROGRES RIWAYAT DITAMBAHKAN
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedQRSubject(null)}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold py-2.5 rounded-xl transition mt-2 uppercase shadow-md"
                  >
                    OK / Selesai
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Riwayat Presensi */}
      {selectedHistorySubject && (() => {
        const historyData = getClassAttendance(selectedHistorySubject.id);
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[#121822] w-full max-w-md rounded-2xl shadow-2xl border border-[#232f42] overflow-hidden text-slate-100 font-mono">
              <div className="bg-[#161d2a] p-4 flex items-center justify-between border-b border-[#232f42]">
                <div>
                  <h3 className="text-sm font-bold text-[#f59e0b] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#f59e0b]" />
                    <span>RIWAYAT PRESENSI (+6%/PERTEMUAN)</span>
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-0.5">{selectedHistorySubject.title}</p>
                </div>
                <button
                  onClick={() => setSelectedHistorySubject(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* Progress Pill */}
                <div className="p-3 bg-[#0a1019] border border-[#1d2738] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Akumulasi Progres</span>
                    <span className="text-base font-black text-[#00e5ff]">{historyData.progress}%</span>
                  </div>
                  <span className="text-xs bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold px-2 py-0.5 rounded">
                    {historyData.attendedOrders.length} / 16 Pertemuan Hadir
                  </span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {historyData.history.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Belum ada presensi yang di-scan untuk mata kuliah ini.
                    </div>
                  ) : (
                    historyData.history.map((h) => (
                      <div
                        key={h.id}
                        className="p-2.5 bg-[#0e1522] border border-emerald-500/30 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-100 block">{h.meetingTitle}</span>
                          <span className="text-[10px] text-slate-400">{h.timestamp}</span>
                        </div>
                        <span className="bg-emerald-950 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-500/40">
                          +6% Hadir
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 bg-[#161d2a] border-t border-[#232f42] text-center">
                <button
                  onClick={() => setSelectedHistorySubject(null)}
                  className="text-xs font-bold text-[#f59e0b] hover:underline uppercase"
                >
                  Tutup Riwayat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
