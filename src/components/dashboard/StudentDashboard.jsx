import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  getClassAttendanceSession,
  getSemesterAttendanceSummary,
  recordMeetingAttendance,
} from '../../services/attendanceService';
import { fetchClasses, fetchUserExamAttempts } from '../../services/lmsFirestoreService';
import {
  Calendar,
  GraduationCap,
  BookOpen,
  FileText,
  Clock,
  MessageSquare,
  Grid,
  FileCheck,
  QrCode,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  X,
  Check,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  UserCheck,
} from 'lucide-react';

export default function StudentDashboard({ onNavigateTab, onSelectActivity }) {
  const { userProfile, currentUser, role, isDemoMode } = useAuth();
  const { t, language, getRoleLabel } = useLanguage();

  // State Data Firestore
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [examAttempts, setExamAttempts] = useState([]);

  // State Modals Interaktif
  const [isLainnyaOpen, setIsLainnyaOpen] = useState(false);
  const [isUjianModalOpen, setIsUjianModalOpen] = useState(false);
  const [scanModalSubject, setScanModalSubject] = useState(null);
  const [activeSessionInfo, setActiveSessionInfo] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // State Modal Timer Sesi Fokus (Pomodoro 25 Menit)
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(1500);
  const [focusActive, setFocusActive] = useState(false);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  // State Progres Riwayat Kehadiran Semester (+6% per scan, dimuat async dari Firestore)
  const [semesterAttendance, setSemesterAttendance] = useState({
    progress: 0,
    attended: 0,
  });

  useEffect(() => {
    const hourInterval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(hourInterval);
  }, []);

  useEffect(() => {
    if (!focusActive) return;
    const interval = setInterval(() => {
      setFocusSeconds((prev) => {
        if (prev <= 1) {
          setFocusActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [focusActive]);

  // Escape handler for open modals
  useEffect(() => {
    if (!isUjianModalOpen && !isLainnyaOpen && !scanModalSubject && !isFocusOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsUjianModalOpen(false);
        setIsLainnyaOpen(false);
        setScanModalSubject(null);
        setIsFocusOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isUjianModalOpen, isLainnyaOpen, scanModalSubject, isFocusOpen]);

  const loadDashboardData = async () => {
    setLoadingClasses(true);
    try {
      const [classRes, summary, attempts] = await Promise.all([
        fetchClasses(),
        getSemesterAttendanceSummary(currentUser?.uid),
        currentUser ? fetchUserExamAttempts(currentUser.uid) : Promise.resolve([]),
      ]);
      setClasses(classRes.classes || []);
      setSemesterAttendance(summary || { progress: 0, attended: 0 });
      setExamAttempts(attempts || []);
    } finally {
      setLoadingClasses(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
    const handleAttendanceUpdate = () => {
      void getSemesterAttendanceSummary(currentUser?.uid).then((summary) => {
        if (summary) setSemesterAttendance(summary);
      });
      void fetchClasses().then((res) => {
        setClasses(res.classes || []);
      });
    };
    window.addEventListener('smartsa_attendance_updated', handleAttendanceUpdate);
    return () => window.removeEventListener('smartsa_attendance_updated', handleAttendanceUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  const toggleFocusTimer = () => {
    if (!focusActive && focusSeconds === 0) {
      setFocusSeconds(1500);
    }
    setFocusActive((prev) => !prev);
  };
  const resetFocusTimer = () => {
    setFocusActive(false);
    setFocusSeconds(1500);
  };
  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeGreeting = () => {
    const hour = currentHour;
    if (language === 'en') {
      if (hour >= 4 && hour < 12) return 'Good Morning';
      if (hour >= 12 && hour < 17) return 'Good Afternoon';
      return 'Good Evening';
    }
    if (hour >= 4 && hour < 11) return 'Selamat Pagi';
    if (hour >= 11 && hour < 15) return 'Selamat Siang';
    if (hour >= 15 && hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const activeDisplayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    (isDemoMode ? t('demo_student_name') : t('default_user_name'));

  const firstName = activeDisplayName.trim().split(' ')[0] || activeDisplayName;
  const fullName = activeDisplayName.toUpperCase();

  const activeNim =
    userProfile?.nim ||
    userProfile?.nidn ||
    userProfile?.nip ||
    (isDemoMode ? '25050974001' : t('not_set'));

  const userPhoto =
    userProfile?.photoURL ||
    currentUser?.photoURL ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';

  const activeInstitution =
    userProfile?.institution || 'Universitas Negeri Surabaya';

  const roleLabel = getRoleLabel(role);

  const handleOpenScanModal = async (subj) => {
    setScanModalSubject(subj);
    setScanResult(null);
    setIsScanning(false);
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

  const handleTriggerBarcodeScan = async (e) => {
    if (e) e.preventDefault();
    if (!scanModalSubject || isScanning) return;

    setIsScanning(true);
    try {
      const res = await recordMeetingAttendance({
        classId: scanModalSubject.id,
        meetingNo: activeSessionInfo?.meetingNo || 1,
        meetingTitle: activeSessionInfo?.meetingNo
          ? `Pertemuan ${activeSessionInfo.meetingNo < 10 ? `0${activeSessionInfo.meetingNo}` : activeSessionInfo.meetingNo}: ${scanModalSubject.title}`
          : `Pertemuan 01: ${scanModalSubject.title}`,
        sessionCode: sessionCodeInput || activeSessionInfo?.sessionCode || '',
      });
      setScanResult(res);
    } catch (err) {
      setScanResult({
        success: false,
        message: err.message || (language === 'en' ? 'Failed to record attendance.' : 'Gagal mencatat presensi ke Firestore.'),
      });
    } finally {
      setIsScanning(false);
    }
  };

  const latestPretest = examAttempts.find((a) => a.examType === 'pretest' && typeof a.score === 'number');
  const latestPosttest = examAttempts.find((a) => a.examType === 'posttest' && typeof a.score === 'number');

  const academicServices = [
    {
      id: 'krs',
      label: 'KRS',
      sublabel: language === 'en' ? 'Study Plan' : 'Rencana Studi',
      icon: FileText,
      iconColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-[#182334] border-blue-200 dark:border-[#25364e] hover:border-blue-400',
      action: () => onNavigateTab('materi'),
    },
    {
      id: 'materi',
      label: language === 'en' ? 'Materials' : 'Materi',
      sublabel: language === 'en' ? 'Course Modules' : 'Modul Kuliah',
      icon: BookOpen,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-[#13281e] border-emerald-200 dark:border-[#1d3d2e] hover:border-emerald-400',
      action: () => onNavigateTab('materi'),
    },
    {
      id: 'jadwal_kelas',
      label: language === 'en' ? 'Schedule & Classes' : 'Jadwal Kuliah & Kelas',
      sublabel: language === 'en' ? 'Sessions & Attendance' : 'Sesi & Presensi',
      icon: Clock,
      iconColor: 'text-sky-600 dark:text-[#00e5ff]',
      bgColor: 'bg-sky-50 dark:bg-[#122436] border-sky-200 dark:border-[#1b3a56] hover:border-sky-400',
      action: () => onNavigateTab('kelas'),
    },
    {
      id: 'ujian',
      label: language === 'en' ? 'Mid & Final Exams' : 'Ujian UTS & UAS',
      sublabel: language === 'en' ? 'Evaluations & Scores' : 'Evaluasi & Nilai',
      icon: FileCheck,
      iconColor: 'text-amber-600 dark:text-[#f59e0b]',
      bgColor: 'bg-amber-50 dark:bg-[#291f11] border-amber-200 dark:border-[#443219] hover:border-amber-400',
      action: () => setIsUjianModalOpen(true),
    },
    {
      id: 'diskusi',
      label: language === 'en' ? 'Discussion Room' : 'Ruang Diskusi',
      sublabel: language === 'en' ? 'Interactive Forum' : 'Forum Interaktif',
      icon: MessageSquare,
      iconColor: 'text-rose-600 dark:text-rose-400',
      bgColor: 'bg-rose-50 dark:bg-[#2c1722] border-rose-200 dark:border-[#452233] hover:border-rose-400',
      action: () => onNavigateTab('diskusi'),
    },
    {
      id: 'lainnya',
      label: language === 'en' ? 'More' : 'Lainnya',
      sublabel: 'Smartsa Hub',
      icon: Grid,
      iconColor: 'text-slate-600 dark:text-slate-300',
      bgColor: 'bg-slate-100 dark:bg-[#1a2332] border-slate-200 dark:border-[#29374d] hover:border-slate-400',
      action: () => setIsLainnyaOpen(true),
    },
  ];

  const todayClasses = classes.slice(0, 2);

  return (
    <div className="space-y-4 pt-1 pb-6 font-sans">
      {/* 1. KARTU HEADER & PROFIL PENGGUNA (Biru Royal Gradien) */}
      <div className="relative rounded-3xl p-5 sm:p-6 overflow-hidden shadow-xl bg-gradient-to-br from-[#0c2a5e] via-[#0e3575] to-[#071938] border border-[#1b3d6e]/50 text-white">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-blue-400/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-xs sm:text-sm text-blue-200/90 font-medium block">
              {getTimeGreeting()}
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight truncate">
              {firstName}
            </h1>
            <p className="text-[11px] font-mono tracking-wider uppercase text-blue-200/80 font-bold truncate">
              {fullName}
            </p>

            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-[#0e274d]/90 border border-blue-400/30 text-blue-100 text-xs font-semibold px-3.5 py-1 rounded-full shadow-inner">
                <GraduationCap className="w-3.5 h-3.5 text-blue-300" />
                <span>{roleLabel}</span>
              </span>

              <span className="text-[10px] font-mono text-blue-200/80 border border-blue-400/20 bg-blue-900/40 px-2.5 py-0.5 rounded-full">
                {role === ROLES.LECTURER ? 'NIDN' : 'NIM'}: {activeNim}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('profil')}
            className="relative shrink-0 cursor-pointer group focus:outline-none"
            title={language === 'en' ? 'Open Account Profile' : 'Klik untuk membuka Profil Akun'}
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 bg-red-600 ring-2 ring-white shadow-xl group-hover:scale-105 transition-transform overflow-hidden flex items-center justify-center">
              <img
                src={userPhoto}
                alt={fullName}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <span
              className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0c2a5e] rounded-full"
              title="Status: Online"
            />
          </button>
        </div>
      </div>

      {/* 2. KARTU SEMESTER AKTIF & BEBAN SKS AKADEMIK */}
      <div className="bg-white dark:bg-[#121822] rounded-2xl p-4 border border-slate-200 dark:border-[#1e2838] shadow-xs dark:shadow-md text-slate-900 dark:text-slate-100 space-y-3">
        <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100 dark:border-[#1e2838]">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
            <div className="p-1 rounded-md bg-sky-50 dark:bg-[#162030] text-sky-600 dark:text-[#00e5ff] border border-sky-200 dark:border-[#00e5ff]/20">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">
              {language === 'en' ? 'Active Semester' : 'Semester Aktif'}
            </span>
          </div>
          <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-xs bg-slate-100 dark:bg-[#18212e] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700/60">
            2026/2027 {language === 'en' ? 'Odd' : 'Ganjil'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-[#162030] border border-blue-200 dark:border-slate-700/80 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-slate-100 leading-none">
                {classes.length * 3 || 18}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                {language === 'en' ? 'Total Credits' : 'Total SKS'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-[#162030] border border-emerald-200 dark:border-slate-700/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-black text-slate-900 dark:text-slate-100 leading-none">
                {classes.length}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                {language === 'en' ? 'Courses' : 'Mata Kuliah'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LAYANAN AKADEMIK: GRID 6 MENU */}
      <div className="bg-white dark:bg-[#121822] rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-[#1e2838] shadow-xs dark:shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {language === 'en' ? 'Academic Services' : 'Layanan Akademik'}
          </h2>
          <span className="text-[10px] font-mono text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-amber-200 dark:border-[#f59e0b]/30">
            {language === 'en' ? '6 ACTIVE SERVICES' : '6 LAYANAN AKTIF'}
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-y-4 gap-x-2.5 pt-1">
          {academicServices.map((svc) => {
            const Icon = svc.icon;
            return (
              <button
                key={svc.id}
                type="button"
                onClick={svc.action}
                className="flex flex-col items-center text-center group cursor-pointer focus:outline-none"
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-200 group-hover:scale-105 group-active:scale-95 shadow-xs ${svc.bgColor}`}
                >
                  <Icon className={`w-6 h-6 ${svc.iconColor}`} />
                </div>

                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mt-2 leading-tight transition-colors line-clamp-2 max-w-[95px]">
                  {svc.label}
                </span>

                <span className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 mt-0.5 line-clamp-1">
                  {svc.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. JADWAL KULIAH HARI INI & PRESENSI 2 ARAH LANGSUNG */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
            <span>{language === 'en' ? "Today's Lecture Schedule" : 'Jadwal Kuliah Hari Ini'}</span>
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('kelas')}
            className="text-[11px] font-bold text-amber-600 dark:text-[#f59e0b] hover:underline font-mono"
          >
            {language === 'en' ? 'View All Schedules' : 'Lihat Semua Jadwal'} &rarr;
          </button>
        </div>

        {loadingClasses ? (
          <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#1e2838] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
            {language === 'en' ? 'Loading schedule from Firestore...' : 'Memuat jadwal perkuliahan dari Firestore...'}
          </div>
        ) : todayClasses.length === 0 ? (
          <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-dashed border-slate-300 dark:border-[#2b3a4f] text-center space-y-2">
            <Calendar className="w-7 h-7 text-amber-500 mx-auto" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {language === 'en' ? 'No Enrolled Classes Yet' : 'Belum Ada Kelas Terdaftar'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Join a class using a class code or seed sample data.'
                : 'Gabung kelas dengan kode atau jalankan seed-firestore.mjs.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {todayClasses.map((subj) => {
              const sess = subj.activeAttendanceSession;
              const sessionOpen = Boolean(
                sess?.isOpen && (!sess.expiresAt || sess.expiresAt > Date.now())
              );

              return (
                <div
                  key={subj.id}
                  className="bg-white dark:bg-[#121822] p-4 rounded-2xl border border-slate-200 dark:border-[#1e2838] hover:border-amber-400 dark:hover:border-[#f59e0b]/50 shadow-xs dark:shadow-md transition-all space-y-3 relative overflow-hidden"
                >
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full ${
                      sessionOpen ? 'bg-emerald-500' : 'bg-[#f59e0b]'
                    }`}
                  />

                  <div className="pl-1.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#162030] px-2 py-0.5 rounded border border-slate-200 dark:border-[#232f42]">
                          {subj.code} • 3 SKS
                        </span>
                        {sessionOpen ? (
                          <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-sans">
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                            <span>
                              {language === 'en' ? `Session M${sess.meetingNo} Open` : `Sesi P${sess.meetingNo} Dibuka`}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#162030] border border-slate-200 dark:border-[#232f42] px-2 py-0.5 rounded-full">
                            {language === 'en' ? 'Scheduled' : 'Terjadwal'}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">
                        {subj.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {subj.lecturer}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {subj.day}, {subj.time} • {language === 'en' ? 'Computer Lab 03' : 'Ruang Lab Komputer 03'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-[#1e2838] flex items-center justify-between gap-2 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => handleOpenScanModal(subj)}
                      className="bg-amber-50 dark:bg-[#182232] hover:bg-amber-100 dark:hover:bg-[#202d42] text-amber-700 dark:text-[#f59e0b] border border-amber-300 dark:border-[#f59e0b]/40 hover:border-amber-500 dark:hover:border-[#f59e0b] px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-[#f59e0b]" />
                      <span>{language === 'en' ? 'Check-in (+6%)' : 'Presensi Sesi (+6%)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigateTab('materi')}
                      className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>{language === 'en' ? 'Materials & Tasks' : 'Materi & Tugas'}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. TELEMETRI PROGRES KEHADIRAN SEMESTER (+6%/SCAN) */}
      <div className="bg-white dark:bg-[#121822] p-4 rounded-2xl border border-slate-200 dark:border-[#1e2838] space-y-2.5 shadow-xs dark:shadow-md">
        <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider">
              {language === 'en' ? 'Semester Attendance Accumulation' : 'Akumulasi Kehadiran Semester'}
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/15 px-2 py-0.5 rounded border border-sky-200 dark:border-[#00e5ff]/30">
            {semesterAttendance.progress}% {language === 'en' ? 'RECORDED (+6%/SESSION)' : 'TERDATA (+6%/SESI)'}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="w-full bg-slate-200 dark:bg-[#18212e] h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#00897b] to-[#00e5ff] h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${Math.max(4, semesterAttendance.progress)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>
              {semesterAttendance.attended} {language === 'en' ? 'Meetings Attended (+6% per session)' : 'Pertemuan Hadir (+6% per sesi)'}
            </span>
            <span>
              {classes.length} {language === 'en' ? 'Active Courses' : 'Mata Kuliah Aktif'}
            </span>
          </div>
        </div>
      </div>

      {/* MODAL 1: UJIAN UTS & UAS */}
      {isUjianModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ujian-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#161d2a] text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-[#232f42]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-[#f59e0b]/15 text-amber-600 dark:text-[#f59e0b]">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="ujian-modal-title" className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                    {language === 'en' ? 'MIDTERM & FINAL EXAMS (UTS & UAS)' : 'UJIAN TENGAH & AKHIR SEMESTER (UTS & UAS)'}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {language === 'en' ? 'Academic Year 2026/2027 Odd' : 'Tahun Ajaran 2026/2027 Ganjil'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setIsUjianModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-[#162030] border border-blue-200 dark:border-blue-500/30">
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 block font-bold">UTS (Week 8-9)</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold block mt-0.5">17–28 Nov 2026</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-1 block">● {language === 'en' ? 'Scheduled' : 'Terjadwal'}</span>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-[#162030] border border-rose-200 dark:border-rose-500/30">
                  <span className="text-[10px] text-rose-600 dark:text-rose-400 block font-bold">UAS (Week 16)</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold block mt-0.5">05–16 Jan 2027</span>
                  <span className="text-[9px] text-amber-600 dark:text-amber-400 mt-1 block">● {language === 'en' ? 'Upcoming' : 'Persiapan'}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono uppercase tracking-wider">
                  {language === 'en' ? 'Active Module Assessments' : 'Ujian & Evaluasi Modul Aktif'}
                </h4>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#162030] border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-500/30">
                      PRETEST MODUL 01
                    </span>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                      Konsep Dasar & Clean Architecture
                    </h5>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      15 {language === 'en' ? 'Mins' : 'Menit'} •{' '}
                      {latestPretest
                        ? `${language === 'en' ? 'Last Score' : 'Nilai Terakhir'}: ${latestPretest.score} / 100`
                        : language === 'en' ? 'Not attempted yet' : 'Belum dikerjakan'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUjianModalOpen(false);
                      onSelectActivity('pretest');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10px] font-bold shrink-0 cursor-pointer transition shadow-xs"
                  >
                    {latestPretest ? (language === 'en' ? 'View Result' : 'Buka Hasil') : (language === 'en' ? 'Start Exam' : 'Buka Ujian')}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-[#162030] border border-amber-300 dark:border-[#f59e0b]/40 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] bg-amber-100 dark:bg-[#f59e0b]/15 px-1.5 py-0.5 rounded border border-amber-300 dark:border-[#f59e0b]/30">
                      POSTTEST EVALUASI 01
                    </span>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                      Evaluasi Firestore & Keamanan API
                    </h5>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      15 {language === 'en' ? 'Mins' : 'Menit'} •{' '}
                      {latestPosttest
                        ? `${language === 'en' ? 'Last Score' : 'Nilai Terakhir'}: ${latestPosttest.score} / 100`
                        : language === 'en' ? '4 Multiple Choice' : '4 Soal Pilihan Ganda'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUjianModalOpen(false);
                      onSelectActivity('posttest');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black font-mono text-[10px] font-bold shrink-0 cursor-pointer transition shadow-xs"
                  >
                    {language === 'en' ? 'Start Exam' : 'Mulai Ujian'}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUjianModalOpen(false);
                    onNavigateTab('kelas');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-[#f59e0b]" />
                  <span>{language === 'en' ? 'View Full Lecture & Exam Schedule' : 'Lihat Jadwal Kuliah & Ujian Lengkap'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MENU LAYANAN LAINNYA (SMARTSA HUB) */}
      {isLainnyaOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hub-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#161d2a] text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-[#232f42]">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-amber-600 dark:text-[#f59e0b]" />
                <h3 id="hub-modal-title" className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                  {language === 'en' ? 'SMARTSA SERVICES HUB' : 'LAYANAN LENGKAP SMARTSA'}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setIsLainnyaOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsLainnyaOpen(false);
                  onNavigateTab('ai');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#18212e] hover:bg-slate-100 dark:hover:bg-[#202d40] border border-slate-200 dark:border-[#2b3a4f] text-slate-800 dark:text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-[#f59e0b]/15 text-amber-600 dark:text-[#f59e0b] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Smartsa AI Assistant</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {language === 'en' ? 'Local Assistant Mode & exam protection' : 'Mode Asisten Lokal & proteksi sesi ujian'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLainnyaOpen(false);
                  setIsFocusOpen(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#18212e] hover:bg-slate-100 dark:hover:bg-[#202d40] border border-slate-200 dark:border-[#2b3a4f] text-slate-800 dark:text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-[#00e5ff]/15 text-sky-600 dark:text-[#00e5ff] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {language === 'en' ? 'Focus Study Session' : 'Sesi Belajar Fokus'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {language === 'en' ? '25-minute distraction-free Pomodoro timer' : 'Timer Pomodoro 25 menit bebas distraksi'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLainnyaOpen(false);
                  onNavigateTab('profil');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#18212e] hover:bg-slate-100 dark:hover:bg-[#202d40] border border-slate-200 dark:border-[#2b3a4f] text-slate-800 dark:text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {language === 'en' ? 'Profile & Academic Status' : 'Profil & Status Akademik'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">NIM {activeNim} • {activeInstitution}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRESENSI DINAMIS 2 ARAH (+6%) */}
      {scanModalSubject && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden relative"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#162030] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-900 dark:text-white">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
                <span id="scan-modal-title" className="text-xs font-bold uppercase tracking-wider">
                  {language === 'en' ? 'MEETING ATTENDANCE' : 'PRESENSI SESI PERTEMUAN'}
                </span>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setScanModalSubject(null)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-[#182232] rounded-xl border border-slate-200 dark:border-slate-700">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate font-sans">
                  {scanModalSubject.title}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'en' ? 'Class Code' : 'Kode Kelas'}: {scanModalSubject.code}
                </p>
              </div>

              {sessionLoading ? (
                <div className="py-6 text-xs text-slate-500 dark:text-slate-400">
                  {language === 'en' ? 'Checking lecturer attendance session...' : 'Memeriksa sesi presensi dosen di Firestore...'}
                </div>
              ) : scanResult ? (
                <div
                  className={`p-3 rounded-xl text-xs text-left space-y-1 border ${
                    scanResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {scanResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span>
                      {scanResult.success
                        ? language === 'en' ? 'ATTENDANCE RECORDED!' : 'PRESENSI BERHASIL DICATAT!'
                        : language === 'en' ? 'ATTENDANCE REJECTED' : 'PRESENSI DITOLAK'}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans">{scanResult.message}</p>
                </div>
              ) : (
                <form onSubmit={handleTriggerBarcodeScan} className="space-y-3 text-left">
                  {currentUser && (!activeSessionInfo || !activeSessionInfo.isOpen) ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 rounded-xl text-[11px] font-sans text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        {language === 'en'
                          ? 'The lecturer has not opened an active attendance session for this class yet.'
                          : 'Dosen belum membuka sesi presensi aktif untuk kelas ini. Minta dosen membuka sesi dari Dashboard Pengajar.'}
                      </span>
                    </div>
                  ) : activeSessionInfo?.isOpen ? (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300 space-y-0.5">
                      <div className="font-bold">
                        ● {language === 'en' ? 'SESSION OPEN — MEETING' : 'SESI TERBUKA — PERTEMUAN'}{' '}
                        {activeSessionInfo.meetingNo < 10 ? `0${activeSessionInfo.meetingNo}` : activeSessionInfo.meetingNo}
                      </div>
                      {activeSessionInfo.expiresAt && (
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-200/80">
                          {language === 'en' ? 'Valid until' : 'Berlaku hingga'}{' '}
                          {new Date(activeSessionInfo.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="w-36 h-36 mx-auto bg-slate-900 dark:bg-black/60 rounded-2xl border-2 border-dashed border-[#f59e0b]/60 flex flex-col items-center justify-center p-3 relative overflow-hidden">
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent animate-pulse top-1/2" />
                    <QrCode className="w-16 h-16 text-slate-300 dark:text-slate-400 opacity-70" />
                    <span className="text-[9px] text-[#f59e0b] mt-2">
                      {currentUser ? (language === 'en' ? 'VERIFY SESSION CODE' : 'VERIFIKASI KODE SESI') : 'MODE PRESENSI DEMO'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-600 dark:text-slate-300 mb-1">
                      {language === 'en' ? 'Lecturer Session Code' : 'Kode Sesi Dosen'}{' '}
                      {currentUser ? (language === 'en' ? '(Required)' : '(Wajib)') : '(Opsional Demo)'}
                    </label>
                    <input
                      type="text"
                      required={Boolean(currentUser)}
                      placeholder={`Contoh: ${scanModalSubject.code}-M01-1234`}
                      value={sessionCodeInput}
                      onChange={(e) => setSessionCodeInput(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-center font-mono text-sm font-bold uppercase bg-slate-50 dark:bg-[#0a0f18] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-[#f59e0b]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isScanning || (Boolean(currentUser) && !activeSessionInfo?.isOpen)}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-black text-xs py-2.5 rounded-xl transition shadow-md uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>{language === 'en' ? 'VERIFYING...' : 'MEMVERIFIKASI...'}</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-3.5 h-3.5 text-black" />
                        <span>{language === 'en' ? 'RECORD ATTENDANCE (+6%)' : 'CATAT PRESENSI (+6%)'}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SESI BELAJAR FOKUS (POMODORO 25 MENIT) */}
      {isFocusOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="focus-modal-title"
            className="bg-white dark:bg-[#161c24] w-full max-w-sm rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden relative"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#1b2330] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-slate-900 dark:text-white">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-[#f59e0b] uppercase">
                <Clock className="w-4 h-4" />
                <span id="focus-modal-title">{t('focus_timer_title')}</span>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setIsFocusOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-widest">
                {formatTimer(focusSeconds)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                {t('focus_timer_desc')}
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={toggleFocusTimer}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-black px-5 py-2.5 rounded-sm flex items-center gap-1.5 transition shadow-md uppercase tracking-wider cursor-pointer"
                >
                  {focusActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{focusActive ? t('focus_pause') : t('focus_start')}</span>
                </button>
                <button
                  type="button"
                  onClick={resetFocusTimer}
                  className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold p-2.5 rounded-sm transition cursor-pointer"
                  title="Reset Timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
