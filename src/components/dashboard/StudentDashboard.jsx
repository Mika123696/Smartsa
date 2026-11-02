import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { ROLES } from '../../constants/roles';
import { getClassAttendance, recordMeetingAttendance } from '../../services/attendanceService';
import { DEMO_SUBJECTS } from '../../services/mockData';
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
  ChevronRight,
  UserCheck,
  Award,
} from 'lucide-react';

export default function StudentDashboard({ onNavigateTab, onSelectActivity }) {
  const { userProfile, currentUser, role, isDemoMode } = useAuth();
  const { t, language } = useLanguage();

  // State Modals Interaktif
  const [isLainnyaOpen, setIsLainnyaOpen] = useState(false);
  const [isUjianModalOpen, setIsUjianModalOpen] = useState(false);
  const [scanModalSubject, setScanModalSubject] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // State Modal Timer Sesi Fokus (Pomodoro 25 Menit)
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(1500); // 25 menit
  const [focusActive, setFocusActive] = useState(false);

  // State Progres Riwayat Kehadiran Semester (+6% per scan)
  const [semesterAttendance, setSemesterAttendance] = useState(() => {
    const pbo = getClassAttendance('subj_pbo');
    const pwmb = getClassAttendance('subj_pwmb');
    const totalAttended = pbo.attendedOrders.length + pwmb.attendedOrders.length;
    const totalProg = Math.min(100, Math.max(pbo.progress, totalAttended * 6));
    return {
      progress: totalProg,
      attended: totalAttended,
    };
  });

  useEffect(() => {
    const update = () => {
      const pbo = getClassAttendance('subj_pbo');
      const pwmb = getClassAttendance('subj_pwmb');
      const totalAttended = pbo.attendedOrders.length + pwmb.attendedOrders.length;
      const totalProg = Math.min(100, Math.max(pbo.progress, totalAttended * 6));
      setSemesterAttendance({
        progress: totalProg,
        attended: totalAttended,
      });
    };
    window.addEventListener('smartsa_attendance_updated', update);
    return () => window.removeEventListener('smartsa_attendance_updated', update);
  }, []);

  // Toggle Focus Timer
  const toggleFocusTimer = () => setFocusActive(!focusActive);
  const resetFocusTimer = () => {
    setFocusActive(false);
    setFocusSeconds(1500);
  };
  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Sapaan Berdasarkan Waktu Lokal
  const getTimeGreeting = () => {
    const hour = new Date().getHours();
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

  // Data Profil Pengguna Sinkron Dinamis 100% dengan Halaman Profil
  const activeDisplayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    (isDemoMode ? 'Mahasiswa Demo' : 'Ralfky Ardan');

  const firstName = activeDisplayName.trim().split(' ')[0] || activeDisplayName;
  const fullName = activeDisplayName.toUpperCase();

  const activeNim =
    userProfile?.nim ||
    userProfile?.nidn ||
    userProfile?.nip ||
    (isDemoMode ? '25050974001' : '25050974168');

  const userPhoto =
    userProfile?.photoURL ||
    currentUser?.photoURL ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';

  const activeInstitution =
    userProfile?.institution || 'Universitas Negeri Surabaya';

  const roleLabel = role === ROLES.LECTURER ? 'Dosen' : 'Mahasiswa';

  // Handler Trigger Barcode Scan (+6%)
  const handleTriggerBarcodeScan = () => {
    if (!scanModalSubject) return;
    setIsScanning(true);
    setTimeout(() => {
      const res = recordMeetingAttendance(
        scanModalSubject.id,
        1,
        `Pertemuan 01: ${scanModalSubject.title}`,
        `${scanModalSubject.code}-BARCODE-2026`
      );
      setScanResult(res);
      setIsScanning(false);
    }, 1200);
  };

  // =========================================================================
  // 6 MENU LAYANAN AKADEMIK SESUAI KETENTUAN USER:
  // 1. KRS (tetap ada) -> navigasi ke Materi/KRS
  // 2. KHS diubah menjadi "Materi" -> navigasi ke Materi
  // 3. Jadwal Kuliah digabung Kelas -> "Jadwal Kuliah & Kelas" -> navigasi ke Kelas
  // 4. TEP diubah menjadi "Ujian UTS & UAS" -> membuka modal / navigasi Ujian
  // 5. Jadwal UAS diubah menjadi "Ruang Diskusi" -> navigasi ke Ruang Diskusi
  // 6. Lainnya -> membuka Smartsa Hub (AI Assistant, Pomodoro, Profil)
  // (Status Mhs dan Aktivitas Mhs dihapus dari daftar)
  // =========================================================================
  const academicServices = [
    {
      id: 'krs',
      label: 'KRS',
      sublabel: 'Rencana Studi',
      icon: FileText,
      iconColor: 'text-blue-400',
      bgColor: 'bg-[#182334] border-[#25364e] hover:border-blue-400/80',
      action: () => onNavigateTab('materi'),
    },
    {
      id: 'materi',
      label: 'Materi',
      sublabel: 'Modul Kuliah',
      icon: BookOpen,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-[#13281e] border-[#1d3d2e] hover:border-emerald-400/80',
      action: () => onNavigateTab('materi'),
    },
    {
      id: 'jadwal_kelas',
      label: 'Jadwal Kuliah & Kelas',
      sublabel: 'Sesi & Presensi',
      icon: Clock,
      iconColor: 'text-[#00e5ff]',
      bgColor: 'bg-[#122436] border-[#1b3a56] hover:border-[#00e5ff]/80',
      action: () => onNavigateTab('kelas'),
    },
    {
      id: 'ujian',
      label: 'Ujian UTS & UAS',
      sublabel: 'Evaluasi & Nilai',
      icon: FileCheck,
      iconColor: 'text-[#f59e0b]',
      bgColor: 'bg-[#291f11] border-[#443219] hover:border-[#f59e0b]/80',
      action: () => setIsUjianModalOpen(true),
    },
    {
      id: 'diskusi',
      label: 'Ruang Diskusi',
      sublabel: 'Forum Interaktif',
      icon: MessageSquare,
      iconColor: 'text-rose-400',
      bgColor: 'bg-[#2c1722] border-[#452233] hover:border-rose-400/80',
      action: () => onNavigateTab('diskusi'),
    },
    {
      id: 'lainnya',
      label: 'Lainnya',
      sublabel: 'Smartsa Hub',
      icon: Grid,
      iconColor: 'text-slate-300',
      bgColor: 'bg-[#1a2332] border-[#29374d] hover:border-slate-300/80',
      action: () => setIsLainnyaOpen(true),
    },
  ];

  return (
    <div className="space-y-4 pt-1 pb-6 font-sans">
      {/* ========================================================== */}
      {/* 1. KARTU HEADER & PROFIL PENGGUNA (Biru Royal Gradien)     */}
      {/* ========================================================== */}
      <div className="relative rounded-3xl p-5 sm:p-6 overflow-hidden shadow-xl bg-gradient-to-br from-[#0c2a5e] via-[#0e3575] to-[#071938] border border-[#1b3d6e]/50 text-white">
        {/* Dekorasi Wave Blur Latar Belakang */}
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-blue-400/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-3">
          {/* Sapaan, Nama Depan Besar, Nama Lengkap, Pill Status Peran */}
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

            {/* Pill Badge Role Mahasiswa / Dosen & NIM */}
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

          {/* Foto Profil Lingkaran Latar Merah & Border Ring Putih Bersih */}
          <div
            onClick={() => onNavigateTab('profil')}
            className="relative shrink-0 cursor-pointer group"
            title="Klik untuk membuka Profil Akun"
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
              title="Status: Online & Terautentikasi"
            />
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* 2. KARTU SEMESTER AKTIF & BEBAN SKS AKADEMIK               */}
      {/* ========================================================== */}
      <div className="bg-[#121822] rounded-2xl p-4 border border-[#1e2838] shadow-md text-slate-100 space-y-3">
        {/* Baris Atas: Semester Aktif */}
        <div className="flex items-center justify-between text-xs pb-3 border-b border-[#1e2838]">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <div className="p-1 rounded-md bg-[#162030] text-[#00e5ff] border border-[#00e5ff]/20">
              <Calendar className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium">Semester Aktif</span>
          </div>
          <span className="font-mono font-bold text-slate-200 text-xs bg-[#18212e] px-2.5 py-1 rounded-md border border-slate-700/60">
            2026/2027 Ganjil
          </span>
        </div>

        {/* Baris Bawah: Total SKS & Mata Kuliah */}
        <div className="grid grid-cols-2 gap-4">
          {/* Total SKS */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#162030] border border-slate-700/80 flex items-center justify-center text-blue-400 shrink-0">
              <GraduationCap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-xl font-black text-slate-100 leading-none">
                24
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                Total SKS
              </div>
            </div>
          </div>

          {/* Mata Kuliah */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#162030] border border-slate-700/80 flex items-center justify-center text-emerald-400 shrink-0">
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xl font-black text-slate-100 leading-none">
                10
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                Mata Kuliah
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* 3. LAYANAN AKADEMIK: GRID 6 MENU TERBARU & SEIMBANG       */}
      {/* ========================================================== */}
      <div className="bg-[#121822] rounded-2xl p-4 sm:p-5 border border-[#1e2838] shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 tracking-tight">
            Layanan Akademik
          </h2>
          <span className="text-[10px] font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/30">
            6 LAYANAN AKTIF
          </span>
        </div>

        {/* Grid 3 Kolom x 2 Baris yang Lega dan Rapi */}
        <div className="grid grid-cols-3 gap-y-4 gap-x-2.5 pt-1">
          {academicServices.map((svc) => {
            const Icon = svc.icon;
            return (
              <button
                key={svc.id}
                type="button"
                onClick={svc.action}
                className="flex flex-col items-center text-center group cursor-pointer focus:outline-none"
              >
                {/* Squircle Tile Icon */}
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-200 group-hover:scale-105 group-active:scale-95 shadow-sm ${svc.bgColor}`}
                >
                  <Icon className={`w-6 h-6 ${svc.iconColor}`} />
                </div>

                {/* Text Label */}
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white mt-2 leading-tight transition-colors line-clamp-2 max-w-[95px]">
                  {svc.label}
                </span>

                {/* Subtext kecil */}
                <span className="text-[9.5px] font-mono text-slate-400 group-hover:text-slate-300 mt-0.5 line-clamp-1">
                  {svc.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================== */}
      {/* 4. JADWAL KULIAH HARI INI & PRESENSI BARCODE LANGSUNG      */}
      {/* ========================================================== */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#f59e0b]" />
            <span>Jadwal Kuliah Hari Ini</span>
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('kelas')}
            className="text-[11px] font-bold text-[#f59e0b] hover:underline font-mono"
          >
            Lihat Semua Jadwal &rarr;
          </button>
        </div>

        {/* Kartu Mata Kuliah Sesuai Screenshot */}
        <div className="space-y-3">
          {DEMO_SUBJECTS.slice(0, 2).map((subj, idx) => {
            const isToday = idx === 0;
            return (
              <div
                key={subj.id}
                className="bg-[#121822] p-4 rounded-2xl border border-[#1e2838] hover:border-[#f59e0b]/50 shadow-md transition-all space-y-3 relative overflow-hidden"
              >
                <div
                  className={`absolute top-0 left-0 w-1.5 h-full ${
                    isToday ? 'bg-[#f59e0b]' : 'bg-[#1e2838]'
                  }`}
                />

                <div className="pl-1.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-300 bg-[#162030] px-2 py-0.5 rounded border border-[#232f42]">
                        3 SKS
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-sans">
                          <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                          <span>Selesai</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-100 mt-1 truncate">
                      {subj.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {subj.lecturer}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {subj.day}, {subj.time} • Ruang Lab Komputer 03
                    </p>
                  </div>
                </div>

                {/* Tombol Aksi Langsung: Presensi Barcode (+6%) & Materi */}
                <div className="pt-2 border-t border-[#1e2838] flex items-center justify-between gap-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setScanModalSubject(subj);
                      setScanResult(null);
                      setIsScanning(false);
                    }}
                    className="bg-[#182232] hover:bg-[#202d42] text-[#f59e0b] border border-[#f59e0b]/40 hover:border-[#f59e0b] px-3 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#f59e0b]" />
                    <span>Presensi Barcode (+6%)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateTab('materi')}
                    className="text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <span>Materi & Tugas</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================== */}
      {/* 5. TELEMETRI PROGRES KEHADIRAN SEMESTER (+6%/SCAN)         */}
      {/* ========================================================== */}
      <div className="bg-[#121822] p-4 rounded-2xl border border-[#1e2838] space-y-2.5 shadow-md">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#f59e0b]" />
            <span className="font-mono font-bold text-slate-200 text-[11px] uppercase tracking-wider">
              Akumulasi Kehadiran Semester
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/15 px-2 py-0.5 rounded border border-[#00e5ff]/30">
            {semesterAttendance.progress}% TERDATA (+6%/SCAN)
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="w-full bg-[#18212e] h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#00897b] to-[#00e5ff] h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${Math.max(6, semesterAttendance.progress)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>{semesterAttendance.attended} Pertemuan Hadir (+6% per scan)</span>
            <span>4 Mata Kuliah Aktif</span>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: UJIAN UTS & UAS (JADWAL & EVALUASI UJIAN)         */}
      {/* ========================================================== */}
      {isUjianModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-[#121822] w-full max-w-md rounded-2xl shadow-2xl border border-[#232f42] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-4 bg-[#161d2a] text-white flex items-center justify-between border-b border-[#232f42]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#f59e0b]/15 text-[#f59e0b]">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">
                    UJIAN TENGAH & AKHIR SEMESTER (UTS & UAS)
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Tahun Ajaran 2026/2027 Ganjil
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUjianModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Konten Modal */}
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Status Periode Ujian */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-3 rounded-xl bg-[#162030] border border-blue-500/30">
                  <span className="text-[10px] text-blue-400 block font-bold">UTS (Pekan 8-9)</span>
                  <span className="text-slate-100 font-bold block mt-0.5">17–28 Nov 2026</span>
                  <span className="text-[9px] text-emerald-400 mt-1 block">● Terjadwal</span>
                </div>
                <div className="p-3 rounded-xl bg-[#162030] border border-rose-500/30">
                  <span className="text-[10px] text-rose-400 block font-bold">UAS (Pekan 16)</span>
                  <span className="text-slate-100 font-bold block mt-0.5">05–16 Jan 2027</span>
                  <span className="text-[9px] text-amber-400 mt-1 block">● Persiapan</span>
                </div>
              </div>

              {/* Daftar Ujian & Evaluasi Aktif */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">
                  Ujian & Evaluasi Modul Aktif
                </h4>

                {/* Pretest */}
                <div className="p-3 rounded-xl bg-[#162030] border border-slate-700/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-900/40 px-1.5 py-0.2 rounded border border-blue-500/30">
                      PRETEST MODUL 01
                    </span>
                    <h5 className="text-xs font-bold text-slate-100 mt-1">
                      Konsep Dasar & Struktur GUI Visual
                    </h5>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Durasi: 30 Menit • Nilai: 88 / 100
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
                    Buka Hasil
                  </button>
                </div>

                {/* Posttest */}
                <div className="p-3 rounded-xl bg-[#162030] border border-[#f59e0b]/40 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-[#f59e0b] bg-[#f59e0b]/15 px-1.5 py-0.2 rounded border border-[#f59e0b]/30">
                      POSTTEST EVALUASI 01
                    </span>
                    <h5 className="text-xs font-bold text-slate-100 mt-1">
                      Uji Pemahaman Arsitektur & Event-Driven
                    </h5>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Durasi: 45 Menit • 20 Soal Pilihan Ganda
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
                    Mulai Ujian
                  </button>
                </div>
              </div>

              {/* Tombol Buka Jadwal Lengkap */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUjianModalOpen(false);
                    onNavigateTab('kelas');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-[#1c2432] hover:bg-[#253245] border border-slate-700 text-xs font-mono font-bold text-slate-200 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>Lihat Jadwal Kuliah & Ujian Lengkap</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: MENU LAYANAN LAINNYA (SMARTSA HUB)                */}
      {/* ========================================================== */}
      {isLainnyaOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-[#121822] w-full max-w-sm rounded-2xl shadow-2xl border border-[#232f42] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-[#161d2a] text-white flex items-center justify-between border-b border-[#232f42]">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-[#f59e0b]" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">
                  LAYANAN LENGKAP SMARTSA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLainnyaOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
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
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#18212e] hover:bg-[#202d40] border border-[#2b3a4f] text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/15 text-[#f59e0b] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">Smartsa AI Assistant</div>
                  <div className="text-[10px] text-slate-400">Tanya materi kuliah, debugging & diskusi cerdas</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLainnyaOpen(false);
                  setIsFocusOpen(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#18212e] hover:bg-[#202d40] border border-[#2b3a4f] text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#00e5ff]/15 text-[#00e5ff] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">Sesi Belajar Fokus</div>
                  <div className="text-[10px] text-slate-400">Timer Pomodoro 25 menit bebas distraksi</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLainnyaOpen(false);
                  onNavigateTab('profil');
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#18212e] hover:bg-[#202d40] border border-[#2b3a4f] text-slate-200 transition text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white">Profil & Status Akademik</div>
                  <div className="text-[10px] text-slate-400">NIM {activeNim} • {activeInstitution}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: SCAN BARCODE PRESENSI (+6%)                       */}
      {/* ========================================================== */}
      {scanModalSubject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono">
          <div className="bg-[#121822] w-full max-w-sm rounded-2xl shadow-2xl border border-slate-700 overflow-hidden relative">
            <div className="p-4 bg-[#162030] border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#f59e0b]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  PINDAI BARCODE PRESENSI
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScanModalSubject(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="p-3 bg-[#182232] rounded-xl border border-slate-700">
                <h4 className="text-xs font-bold text-white truncate font-sans">
                  {scanModalSubject.title}
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Pertemuan 01 • Kode: {scanModalSubject.code}-M01
                </p>
              </div>

              {/* Viewfinder Animasi Barcode */}
              <div className="w-48 h-48 mx-auto bg-black/60 rounded-2xl border-2 border-dashed border-[#f59e0b]/60 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent animate-pulse top-1/2" />
                <QrCode className="w-24 h-24 text-slate-400 opacity-60" />
                <span className="text-[9px] text-[#f59e0b] mt-2 font-mono">
                  ARAHKAN KE BARCODE KELAS
                </span>
              </div>

              {scanResult ? (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs text-left space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>PRESENSI BERHASIL DICATAT!</span>
                  </div>
                  <p className="text-[10px] text-emerald-200/90 font-sans">
                    Kehadiran Anda bertambah +6%. Riwayat semester terupdate secara instan.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={handleTriggerBarcodeScan}
                  className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black font-black text-xs py-2.5 rounded-xl transition shadow-md uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>MEMINDAI PRESENSI...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-3.5 h-3.5 text-black" />
                      <span>SIMULASI PINDAI BARCODE (+6%)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 4: SESI BELAJAR FOKUS (POMODORO 25 MENIT)           */}
      {/* ========================================================== */}
      {isFocusOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono">
          <div className="bg-[#161c24] w-full max-w-sm rounded-xl shadow-2xl border border-slate-700 overflow-hidden relative">
            <div className="p-4 bg-[#1b2330] border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f59e0b] uppercase">
                <Clock className="w-4 h-4 text-[#f59e0b]" />
                <span>SESI BELAJAR FOKUS (POMODORO)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsFocusOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="text-4xl font-black text-white font-mono tracking-widest drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                {formatTimer(focusSeconds)}
              </div>
              <p className="text-xs text-slate-400 font-sans">
                Fokus selama 25 menit tanpa distraksi untuk produktivitas maksimal.
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={toggleFocusTimer}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-black px-5 py-2.5 rounded-sm flex items-center gap-1.5 transition shadow-md uppercase tracking-wider cursor-pointer"
                >
                  {focusActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{focusActive ? 'JEDA' : 'MULAI'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetFocusTimer}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold p-2.5 rounded-sm transition cursor-pointer"
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
