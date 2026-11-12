import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { DEMO_CLASSES, DEMO_SUBJECTS, DEMO_COURSE_STUDENTS } from '../../services/mockData';
import {
  BookOpen,
  Users,
  Award,
  Sparkles,
  Plus,
  CheckCircle,
  FileCheck,
  Send,
  Bell,
  ChevronRight,
  Clock,
  GraduationCap,
} from 'lucide-react';

export default function TeacherDashboard({ onSelectClass, onNavigateView, onOpenCreateClass }) {
  const { userProfile, role } = useAuth();
  const { language } = useLanguage();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  // Notifikasi ringkas perkuliahan untuk Dosen
  const [notifications, setNotifications] = useState([
    {
      id: 'notif_dsn_1',
      title: '3 Pengumpulan Tugas Baru Menunggu Penilaian',
      detail: 'Mata Kuliah Pemrograman Berorientasi Objek & Basis Data.',
      time: '10 menit lalu',
      unread: true,
    },
    {
      id: 'notif_dsn_2',
      title: 'Sesi Perkuliahan Hari Ini: PBO101 (08.00–10.30)',
      detail: 'Klik kartu mata kuliah di bawah untuk membuka QR Presensi & Materi.',
      time: '1 jam lalu',
      unread: true,
    },
    {
      id: 'notif_dsn_3',
      title: 'Sinkronisasi 20 Mahasiswa Kelas TI-2025A/B Selesai',
      detail: 'Daftar hadir dan buku nilai siap dikelola per mata kuliah.',
      time: 'Kemarin',
      unread: false,
    },
  ]);

  // Daftar tugas yang menunggu dinilai oleh dosen
  const [submissionsQueue, setSubmissionsQueue] = useState([
    {
      id: 'sub_01',
      studentName: 'Ahmad Fauzi (Kelompok 01)',
      assignment: 'Laporan Desain Pola & Clean Architecture',
      class: 'Pemrograman Berorientasi Objek',
      submittedAt: 'Hari ini, 07:15 WIB',
      status: 'pending',
    },
    {
      id: 'sub_02',
      studentName: 'Dewi Lestari (Kelompok 02)',
      assignment: 'Laporan Desain Pola & Clean Architecture',
      class: 'Pemrograman Berorientasi Objek',
      submittedAt: 'Kemarin, 21:30 WIB',
      status: 'pending',
    },
    {
      id: 'sub_03',
      studentName: 'Rian Pratama (Kelompok 04)',
      assignment: 'Analisis Indexing Firestore NoSQL',
      class: 'Basis Data',
      submittedAt: '20 Okt 2026, 18:00 WIB',
      status: 'pending',
    },
  ]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleGradeSubmit = (e) => {
    e.preventDefault();
    if (!selectedSubmission || !gradeInput) return;

    setSubmissionsQueue((prev) =>
      prev.filter((sub) => sub.id !== selectedSubmission.id)
    );
    setSelectedSubmission(null);
    setGradeInput('');
    setFeedbackInput('');
    alert(`Nilai ${gradeInput} berhasil diterbitkan dan dicatat ke Gradebook!`);
  };

  // Hitung jumlah materi tersimpan di localStorage per matkul untuk ringkasan cepat
  const getSavedMaterialCount = (matkulId) => {
    try {
      const raw = localStorage.getItem(`smartsa_course_materials_${matkulId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {
      // ignore
    }
    return 2;
  };

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div className="space-y-5 font-sans">
      {/* Banner Ringkasan Dosen (Tanpa Form Input Materi Langsung) */}
      <div className="bg-[#121822] text-white p-5 rounded-xl border border-[#232f42] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#fbbf24] to-[#00e5ff]" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#f59e0b] uppercase tracking-wider">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>
              // PORTAL DOSEN • {role === 'admin' ? 'ADMINISTRATOR' : 'INSTRUKTUR PENGAMPU'}
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-black text-slate-100 mt-1.5">
            {language === 'en' ? 'Welcome,' : 'Selamat Datang,'}{' '}
            <span className="text-[#f59e0b]">{userProfile?.displayName || 'Dr. Andi Saputra'}</span>
          </h2>

          <p className="text-slate-400 text-xs mt-1 leading-relaxed">
            {language === 'en'
              ? 'Overview of your active courses, statistics, notifications, and grading queue. Click a course to publish materials, or open Classes for manual attendance & student rosters.'
              : 'Ringkasan perkuliahan semester aktif. Klik mata kuliah untuk mengelola materi & QR cepat, atau buka menu Kelas untuk presensi manual & daftar 20 mahasiswa.'}
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={onOpenCreateClass}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-3.5 py-2 rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'Manage All Classes' : 'Semua Kelas'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('ai-assistant')}
              className="bg-[#182334] hover:bg-[#22324a] text-[#00e5ff] border border-[#00e5ff]/30 text-xs font-mono font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'Teaching Assistant AI' : 'Teaching Assistant AI'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Statistik Singkat Perkuliahan */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-mono uppercase">Matkul Diampu</span>
            <div className="p-1.5 bg-[#0f2433] text-[#00e5ff] rounded-lg border border-[#00e5ff]/25">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-100 font-mono">
            {DEMO_CLASSES.length} Matkul
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Semester Ganjil 2026</span>
        </div>

        <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-mono uppercase">Peserta / Kelas</span>
            <div className="p-1.5 bg-[#1e1a0e] text-[#f59e0b] rounded-lg border border-[#f59e0b]/25">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-100 font-mono">
            {DEMO_COURSE_STUDENTS.length} Siswa
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 block">
            ● 100% Terverifikasi
          </span>
        </div>

        <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-mono uppercase">Perlu Dinilai</span>
            <div className="p-1.5 bg-amber-950/50 text-[#f59e0b] rounded-lg border border-[#f59e0b]/25">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-[#f59e0b] font-mono">
            {submissionsQueue.length} Tugas
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Antrian Evaluasi</span>
        </div>

        <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-mono uppercase">Rata-Rata</span>
            <div className="p-1.5 bg-emerald-950/50 text-emerald-400 rounded-lg border border-emerald-500/25">
              <Award className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono">86.4</div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Performa Kelas Baik</span>
        </div>
      </div>

      {/* Daftar Mata Kuliah yang Diampu (Navigasi ke /dosen/mata-kuliah/:matkulId) */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] space-y-3.5">
        <div className="flex items-center justify-between border-b border-[#1c2738] pb-2.5">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#f59e0b] uppercase block">
              // DAFTAR MATA KULIAH DIAMPU
            </span>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Pilih Mata Kuliah untuk Mengelola Perkuliahan
            </h3>
          </div>
        </div>

        <div className="space-y-2.5">
          {DEMO_CLASSES.map((cls) => {
            const subjMeta = DEMO_SUBJECTS.find((s) => s.id === cls.id);
            const matCount = getSavedMaterialCount(cls.id);

            return (
              <div
                key={cls.id}
                onClick={() => onSelectClass(cls)}
                className="p-3.5 rounded-xl bg-[#0b1019] border border-[#1f2c40] hover:border-[#f59e0b] transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30">
                      {cls.code}
                    </span>
                    {subjMeta && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {subjMeta.day}, {subjMeta.time}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-[#f59e0b] transition truncate">
                    {cls.name}
                  </h4>

                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-500" />
                      {DEMO_COURSE_STUDENTS.length} Mahasiswa
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-slate-500" />
                      {matCount} Materi • 16 Pertemuan
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-[#f59e0b] shrink-0">
                  <span className="hidden sm:inline">Kelola</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ringkasan Notifikasi Perkuliahan */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] space-y-3">
        <div className="flex items-center justify-between border-b border-[#1c2738] pb-2.5">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#00e5ff]" />
            <h3 className="text-xs font-mono font-bold text-slate-100 uppercase">
              Notifikasi Perkuliahan {unreadCount > 0 ? `(${unreadCount} Baru)` : ''}
            </h3>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[10px] font-mono text-[#00e5ff] hover:underline cursor-pointer"
            >
              Tandai Dibaca
            </button>
          )}
        </div>

        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-3 rounded-lg border text-xs ${
                n.unread
                  ? 'bg-[#111c2b] border-[#00e5ff]/35'
                  : 'bg-[#0b1019] border-[#1c2738]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-100 text-xs">{n.title}</p>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{n.time}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{n.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Antrian Penilaian Tugas Ringkas */}
      <div className="bg-[#121822] p-4 sm:p-5 rounded-xl border border-[#232f42] space-y-3">
        <div className="border-b border-[#1c2738] pb-2.5">
          <span className="text-[10px] font-mono font-bold text-[#f59e0b] uppercase block">
            // ANTRIAN PENILAIAN CEPAT
          </span>
          <h3 className="text-sm font-bold text-slate-100">
            Pengumpulan Tugas Mahasiswa
          </h3>
        </div>

        {submissionsQueue.length === 0 ? (
          <div className="text-center py-8 bg-[#0b1019] rounded-xl border border-dashed border-[#243247]">
            <CheckCircle className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-200">Semua Tugas Telah Dinilai!</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tidak ada pengumpulan tugas yang menunggu ulasan saat ini.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {submissionsQueue.map((sub) => (
              <div
                key={sub.id}
                className="p-3 rounded-lg bg-[#0b1019] border border-[#1f2c40] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">{sub.studentName}</p>
                  <p className="text-[11px] text-slate-300 truncate">{sub.assignment}</p>
                  <p className="text-[10px] font-mono text-[#00e5ff] mt-0.5">
                    {sub.class} • {sub.submittedAt}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSubmission(sub)}
                  className="px-3 py-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-mono font-bold shrink-0 cursor-pointer transition"
                >
                  Nilai
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Beri Nilai */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#121822] w-full max-w-md rounded-xl shadow-2xl border border-[#232f42] overflow-hidden text-slate-100">
            <div className="bg-[#161e2b] border-b border-[#1c2738] p-4">
              <span className="text-[9px] font-mono font-bold text-[#f59e0b] uppercase block">
                // EVALUASI RUBRIK TUGAS
              </span>
              <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                {selectedSubmission.studentName}
              </h3>
              <p className="text-[11px] text-slate-400">{selectedSubmission.assignment}</p>
            </div>

            <form onSubmit={handleGradeSubmit} className="p-4 space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                  Nilai Numerik (0 - 100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder="Contoh: 88"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0a0f18] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-300 mb-1 uppercase">
                  Catatan Umpan Balik
                </label>
                <textarea
                  rows="3"
                  placeholder="Ketik catatan evaluasi atau revisi untuk mahasiswa..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0a0f18] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2738]">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-3.5 py-2 text-xs font-mono text-slate-400 hover:text-white bg-[#162030] rounded-lg transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Simpan Nilai</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
