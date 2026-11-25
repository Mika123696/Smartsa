import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import {
  QrCode,
  Clock,
  CheckCircle2,
  X,
  Camera,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { fetchClassesForUser } from '../../services/lmsFirestoreService';
import {
  getClassAttendance,
  getClassAttendanceSession,
  recordMeetingAttendance,
} from '../../services/attendanceService';

export default function ScheduleTab() {
  const { t, language } = useLanguage();
  const { currentUser, role } = useAuth();

  const currentKey = `${currentUser?.uid || 'demo'}_${role || 'student'}`;
  const [subjects, setSubjects] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [selectedQRSubject, setSelectedQRSubject] = useState(null);
  const [activeSessionInfo, setActiveSessionInfo] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [selectedHistorySubject, setSelectedHistorySubject] = useState(null);
  const [historyData, setHistoryData] = useState({ attendedOrders: [], progress: 0, history: [] });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [qrSubmitted, setQrSubmitted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);

  const reqIdRef = useRef(0);
  const loading = loadedKey !== currentKey;

  useEffect(() => {
    let mounted = true;
    const reqId = ++reqIdRef.current;

    const syncSubjects = async () => {
      try {
        const res = currentUser?.uid
          ? await fetchClassesForUser({ uid: currentUser.uid, role })
          : { classes: [] };
        if (!mounted || reqId !== reqIdRef.current) return;
        setSubjects(res.classes || []);
        setSelectedQRSubject(null);
        setSelectedHistorySubject(null);
        setSessionCodeInput('');
        setLastScanResult(null);
        setQrSubmitted(false);
      } finally {
        if (mounted && reqId === reqIdRef.current) setLoadedKey(currentKey);
      }
    };

    void syncSubjects();
    const handleUpdate = () => {
      void syncSubjects();
    };
    window.addEventListener('smartsa_attendance_updated', handleUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('smartsa_attendance_updated', handleUpdate);
    };
  }, [currentKey, currentUser?.uid, role]);

  useEffect(() => {
    if (!selectedQRSubject && !selectedHistorySubject) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedQRSubject(null);
        setSelectedHistorySubject(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedQRSubject, selectedHistorySubject]);

  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

  const getDayName = (d) => {
    switch (d) {
      case 'Senin':
        return t('day_monday');
      case 'Selasa':
        return t('day_tuesday');
      case 'Rabu':
        return t('day_wednesday');
      case 'Kamis':
        return t('day_thursday');
      case 'Jumat':
        return t('day_friday');
      default:
        return d;
    }
  };

  const handleOpenQR = async (subj) => {
    setSelectedQRSubject(subj);
    setQrSubmitted(false);
    setIsScanning(false);
    setLastScanResult(null);
    setSessionCodeInput('');
    setSessionLoading(true);

    try {
      const sess = await getClassAttendanceSession(subj.id);
      setActiveSessionInfo(sess);
      if (sess?.isOpen && !currentUser && sess.sessionCode) {
        setSessionCodeInput(sess.sessionCode);
      }
    } finally {
      setSessionLoading(false);
    }
  };

  const handleOpenHistory = async (subj) => {
    setSelectedHistorySubject(subj);
    setHistoryLoading(true);
    try {
      const data = await getClassAttendance(subj.id, currentUser?.uid);
      setHistoryData(data);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleTriggerScan = async (e) => {
    if (e) e.preventDefault();
    if (!selectedQRSubject || isScanning) return;

    setIsScanning(true);
    try {
      const res = await recordMeetingAttendance({
        classId: selectedQRSubject.id,
        meetingNo: activeSessionInfo?.meetingNo || 1,
        meetingTitle: activeSessionInfo?.meetingNo
          ? `Pertemuan ${activeSessionInfo.meetingNo < 10 ? `0${activeSessionInfo.meetingNo}` : activeSessionInfo.meetingNo}: ${selectedQRSubject.title}`
          : `Pertemuan 01: ${selectedQRSubject.title}`,
        sessionCode: sessionCodeInput || activeSessionInfo?.sessionCode || '',
      });
      setLastScanResult(res);
      setQrSubmitted(true);
    } catch (err) {
      setLastScanResult({
        success: false,
        message: err.message || (language === 'en' ? 'Failed to record attendance.' : 'Gagal mencatat presensi ke Firestore.'),
      });
      setQrSubmitted(true);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          {t('schedule_title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t('schedule_subtitle')}
        </p>
      </div>

      {/* Grouped by Days */}
      {loading ? (
        <div className="bg-white dark:bg-[#121822] p-8 rounded-2xl border border-slate-200 dark:border-[#232f42] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
          {language === 'en' ? 'Loading class schedule from Cloud Firestore...' : 'Memuat jadwal kelas dari Cloud Firestore...'}
        </div>
      ) : subjects.length === 0 ? (
        <div className="bg-white dark:bg-[#121822] p-8 rounded-2xl border border-dashed border-slate-300 dark:border-[#2b3a4f] text-center space-y-2">
          <Calendar className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {language === 'en' ? 'No Class Schedule in Firestore Yet' : 'Belum Ada Jadwal Kelas di Firestore'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {language === 'en'
              ? 'The classes collection is empty. Run the seed script or join a class created by a lecturer.'
              : 'Koleksi classes masih kosong. Jalankan skrip seeding atau gabung kelas yang telah dibuat dosen.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((day) => {
            const subjectsForDay = subjects.filter((s) => (s.day || 'Senin') === day);
            if (subjectsForDay.length === 0) return null;

            return (
              <div key={day} className="space-y-3">
                <h2 className="text-sm font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-2">
                  <span>{getDayName(day)}</span>
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {subjectsForDay.map((subj) => {
                    const sess = subj.activeAttendanceSession;
                    const sessionOpen = Boolean(
                      sess?.isOpen && (!sess.expiresAt || sess.expiresAt > Date.now())
                    );
                    return (
                      <div
                        key={subj.id}
                        className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs hover:border-amber-400 dark:hover:border-[#f59e0b]/40 transition-all space-y-3 text-slate-900 dark:text-slate-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {subj.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              {subj.lecturer}
                            </p>
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                              {subj.time}
                            </p>
                          </div>

                          {sessionOpen && (
                            <span className="text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 px-2 py-0.5 rounded shrink-0">
                              {language === 'en' ? 'SESSION M' : 'SESI P'}
                              {sess.meetingNo < 10 ? `0${sess.meetingNo}` : sess.meetingNo}{' '}
                              {language === 'en' ? 'OPEN' : 'DIBUKA'}
                            </span>
                          )}
                        </div>

                        <div className="pt-2 flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleOpenQR(subj)}
                            className="bg-amber-50 dark:bg-[#18212e] hover:bg-amber-100 dark:hover:bg-[#202d40] text-amber-700 dark:text-[#f59e0b] text-xs font-semibold px-3 py-2 rounded-xl border border-amber-200 dark:border-[#2b3a4f] transition flex items-center gap-1.5"
                          >
                            <QrCode className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
                            <span>{t('scan_qr_btn')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenHistory(subj)}
                            className="bg-slate-100 dark:bg-[#18212e] hover:bg-slate-200 dark:hover:bg-[#202d40] text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2b3a4f] transition flex items-center gap-1.5"
                          >
                            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span>{t('history_btn')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Spacer ekstra untuk mobile bottom nav */}
      <div className="h-20 md:hidden w-full" aria-hidden="true" />

      {/* Modal Presensi Dinamis 2 Arah */}
      {selectedQRSubject && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden text-slate-900 dark:text-slate-100"
          >
            <div className="bg-slate-50 dark:bg-[#161d2a] text-slate-900 dark:text-white p-5 flex items-center justify-between border-b border-slate-200 dark:border-[#232f42]">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-600 dark:text-[#f59e0b]" />
                <h3 id="qr-modal-title" className="text-base font-bold">
                  {t('qr_modal_title')}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setSelectedQRSubject(null)}
                className="text-slate-500 dark:text-white/80 hover:text-slate-900 dark:hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedQRSubject.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedQRSubject.lecturer}</p>
                <p className="text-xs font-mono text-amber-600 dark:text-[#f59e0b] font-semibold mt-1">
                  {getDayName(selectedQRSubject.day)}, {selectedQRSubject.time}
                </p>
              </div>

              {sessionLoading ? (
                <div className="py-6 text-xs font-mono text-slate-500 dark:text-slate-400">
                  {language === 'en' ? 'Checking lecturer attendance session...' : 'Memeriksa sesi presensi dosen di Firestore...'}
                </div>
              ) : !qrSubmitted ? (
                <form onSubmit={handleTriggerScan} className="space-y-4">
                  {currentUser && (!activeSessionInfo || !activeSessionInfo.isOpen) ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 text-left flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        {language === 'en'
                          ? 'The lecturer has not opened an active attendance session for this class.'
                          : 'Dosen belum membuka sesi presensi aktif untuk kelas ini. Minta dosen membuka sesi dari Dashboard Pengajar.'}
                      </span>
                    </div>
                  ) : activeSessionInfo?.isOpen ? (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 text-left space-y-1">
                      <div className="font-bold font-mono">
                        ● {language === 'en' ? 'SESSION OPEN — MEETING' : 'SESI TERBUKA — PERTEMUAN'}{' '}
                        {activeSessionInfo.meetingNo < 10 ? `0${activeSessionInfo.meetingNo}` : activeSessionInfo.meetingNo}
                      </div>
                      {activeSessionInfo.expiresAt && (
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-200/80">
                          {language === 'en' ? 'Valid until' : 'Berlaku sampai'}{' '}
                          {new Date(activeSessionInfo.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="w-40 h-40 mx-auto bg-slate-900 rounded-2xl relative overflow-hidden flex items-center justify-center border-4 border-[#f59e0b]/40">
                    <Camera className="w-10 h-10 text-slate-400" />
                    {isScanning && (
                      <div className="absolute inset-x-0 h-1 bg-[#f59e0b] shadow-[0_0_12px_#f59e0b] animate-bounce top-1/2"></div>
                    )}
                    <span className="absolute bottom-2 text-[10px] text-slate-300">
                      {currentUser ? (language === 'en' ? 'Enter Session Code' : 'Masukkan Kode Sesi Dosen') : t('qr_scanning')}
                    </span>
                  </div>

                  <div>
                    <label className="block text-left text-[11px] font-mono text-slate-600 dark:text-slate-300 mb-1">
                      {language === 'en' ? 'Attendance Session Code' : 'Kode Sesi Presensi'}{' '}
                      {currentUser ? (language === 'en' ? '(Required)' : '(Wajib)') : '(Opsional Demo)'}
                    </label>
                    <input
                      type="text"
                      required={Boolean(currentUser)}
                      placeholder={`Contoh: ${selectedQRSubject.code}-M01-1234`}
                      value={sessionCodeInput}
                      onChange={(e) => setSessionCodeInput(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-center font-mono text-sm font-bold uppercase bg-slate-50 dark:bg-[#0a0f18] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isScanning || (Boolean(currentUser) && !activeSessionInfo?.isOpen)}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold py-3 rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>
                      {isScanning
                        ? t('qr_scanning')
                        : language === 'en'
                        ? 'Verify & Record Attendance'
                        : 'Verifikasi & Catat Presensi'}
                    </span>
                  </button>
                </form>
              ) : (
                <div className="py-4 space-y-3 font-mono">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl font-bold shadow-lg border ${
                      lastScanResult?.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/40'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/40'
                    }`}
                  >
                    {lastScanResult?.success ? (
                      <CheckCircle2 className="w-10 h-10" />
                    ) : (
                      <AlertTriangle className="w-9 h-9" />
                    )}
                  </div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {lastScanResult?.success
                      ? t('qr_scanned_success')
                      : language === 'en'
                      ? 'Attendance Not Recorded'
                      : 'Presensi Tidak Tercatat'}
                  </h4>
                  <div
                    className={`p-2.5 bg-slate-50 dark:bg-[#0a111a] border rounded-lg text-xs space-y-1 ${
                      lastScanResult?.success ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-rose-200 dark:border-rose-500/30'
                    }`}
                  >
                    <p
                      className={
                        lastScanResult?.success
                          ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                          : 'text-rose-700 dark:text-rose-300 font-bold'
                      }
                    >
                      {lastScanResult?.message}
                    </p>
                    {lastScanResult?.success && (
                      <p className="text-[11px] text-sky-700 dark:text-[#00e5ff] font-bold">
                        +{lastScanResult?.addedPercent || 6}%{' '}
                        {language === 'en' ? 'HISTORY PROGRESS ADDED' : 'PROGRES RIWAYAT DITAMBAHKAN'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedQRSubject(null)}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold py-2.5 rounded-xl transition mt-2 uppercase shadow-md"
                  >
                    {t('dialog_ok')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Riwayat Presensi */}
      {selectedHistorySubject && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden text-slate-900 dark:text-slate-100 font-mono"
          >
            <div className="bg-slate-50 dark:bg-[#161d2a] p-4 flex items-center justify-between border-b border-slate-200 dark:border-[#232f42]">
              <div>
                <h3
                  id="history-modal-title"
                  className="text-sm font-bold text-amber-600 dark:text-[#f59e0b] flex items-center gap-1.5"
                >
                  <Clock className="w-4 h-4" />
                  <span>
                    {language === 'en' ? 'ATTENDANCE HISTORY (+6%/MEETING)' : 'RIWAYAT PRESENSI (+6%/PERTEMUAN)'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">{selectedHistorySubject.title}</p>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setSelectedHistorySubject(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-[#0a1019] border border-slate-200 dark:border-[#1d2738] rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase block">
                    {language === 'en' ? 'Progress Accumulated' : 'Akumulasi Progres'}
                  </span>
                  <span className="text-base font-black text-sky-600 dark:text-[#00e5ff]">{historyData.progress}%</span>
                </div>
                <span className="text-xs bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                  {historyData.attendedOrders.length} / 16 {language === 'en' ? 'Meetings' : 'Pertemuan Hadir'}
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {historyLoading ? (
                  <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-xs">
                    {language === 'en' ? 'Loading attendance history...' : 'Memuat riwayat presensi dari Firestore...'}
                  </div>
                ) : historyData.history.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    {language === 'en'
                      ? 'No attendance recorded for this course yet.'
                      : 'Belum ada presensi yang tercatat untuk mata kuliah ini.'}
                  </div>
                ) : (
                  historyData.history.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 bg-slate-50 dark:bg-[#0e1522] border border-emerald-200 dark:border-emerald-500/30 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">{h.meetingTitle}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{h.timestamp}</span>
                      </div>
                      <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/40">
                        +6% {language === 'en' ? 'Present' : 'Hadir'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#161d2a] border-t border-slate-200 dark:border-[#232f42] text-center">
              <button
                type="button"
                onClick={() => setSelectedHistorySubject(null)}
                className="text-xs font-bold text-amber-600 dark:text-[#f59e0b] hover:underline uppercase"
              >
                {language === 'en' ? 'Close History' : 'Tutup Riwayat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
