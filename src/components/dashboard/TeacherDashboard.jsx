import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { DEMO_CLASSES } from '../../services/mockData';
import {
  BookOpen,
  Users,
  Award,
  Sparkles,
  Plus,
  CheckCircle,
  FileCheck,
  Send,
} from 'lucide-react';

export default function TeacherDashboard({ onSelectClass, onNavigateView, onOpenCreateClass }) {
  const { userProfile, role } = useAuth();
  const { t, language } = useLanguage();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  // Daftar tugas yang menunggu dinilai oleh dosen/guru
  const [submissionsQueue, setSubmissionsQueue] = useState([
    {
      id: 'sub_01',
      studentName: 'Ahmad Faiz (Kelompok 01)',
      assignment: 'Laporan Desain Pola & Clean Architecture',
      class: 'Rekayasa Perangkat Lunak Lanjut',
      submittedAt: 'Hari ini, 07:15 WIB',
      fileUrl: 'https://cloudinary.com/sample_report.pdf',
      status: 'pending',
    },
    {
      id: 'sub_02',
      studentName: 'Dewi Lestari (Kelompok 02)',
      assignment: 'Laporan Desain Pola & Clean Architecture',
      class: 'Rekayasa Perangkat Lunak Lanjut',
      submittedAt: 'Kemarin, 21:30 WIB',
      fileUrl: 'https://cloudinary.com/sample_report2.pdf',
      status: 'pending',
    },
    {
      id: 'sub_03',
      studentName: 'Rian Pratama (Kelompok 04)',
      assignment: 'Analisis Indexing Firestore NoSQL',
      class: 'Pengembangan Basis Data Skala Besar',
      submittedAt: '20 Okt 2026, 18:00 WIB',
      fileUrl: 'https://cloudinary.com/sample_report3.pdf',
      status: 'pending',
    },
  ]);

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

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs px-3 py-1 rounded-full mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            {language === 'en'
              ? `Educator Management Hub (${role === 'lecturer' ? 'Lecturer' : 'Teacher'})`
              : `Panel Manajemen Pengajar (${role === 'lecturer' ? 'Dosen' : 'Guru'})`}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {language === 'en'
              ? `Welcome, ${userProfile?.displayName || 'Educator'}! 🎓`
              : `Selamat Datang, ${userProfile?.displayName || 'Bapak/Ibu Pendidik'}! 🎓`}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
            {language === 'en'
              ? 'Manage lecture courses, create syllabus and Delta JSON reading modules, organize study groups, and utilize AI Teaching Assistant.'
              : 'Kelola kelas perkuliahan, buat silabus dan materi teks Delta JSON, atur pembagian kelompok belajar, serta gunakan Teaching Assistant AI untuk draf bank soal.'}
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={onOpenCreateClass}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Create New Class' : 'Buat Kelas Baru'}
            </button>
            <button
              onClick={() => onNavigateView('ai-assistant')}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              {language === 'en' ? 'Teaching Assistant AI (Generate Questions)' : 'Teaching Assistant AI (Generate Soal)'}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Kelas Aktif</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">2 Kelas</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">2 Sesi Berjalan</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Mahasiswa</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">80 Mahasiswa</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">● 100% Terverifikasi</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tugas Perlu Dinilai</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{submissionsQueue.length} Pengumpulan</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Menunggu Ulasan Rubrik</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Rata-rata Kelas</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700">86.4 / 100</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">Performa Sangat Baik</span>
        </div>
      </div>

      {/* Classes Managed List */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Kelas yang Anda Kelola</h3>
            <p className="text-xs text-slate-500">Klik kelas untuk mengelola silabus pertemuan, soal, dan kelompok tugas.</p>
          </div>
          <button
            onClick={onOpenCreateClass}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            + Buat Kelas
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DEMO_CLASSES.slice(0, 2).map((cls) => (
            <div
              key={cls.id}
              onClick={() => onSelectClass(cls)}
              className="p-4 border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{cls.category}</span>
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                    Kode: {cls.code}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 mt-2">{cls.name}</h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cls.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {cls.enrolledCount} Mahasiswa
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  {cls.meetingsCount} Pertemuan
                </span>
                <span className="text-indigo-600 font-semibold hover:underline">Kelola &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Antrian Penilaian Tugas Mahasiswa */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Antrian Penilaian Tugas Kelompok</h3>
            <p className="text-xs text-slate-500">Evaluasi pengumpulan tugas mahasiswa dengan rubrik nilai numerik dan catatan feedback.</p>
          </div>
        </div>

        {submissionsQueue.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">Semua Tugas Telah Dinilai!</p>
            <p className="text-xs text-slate-500 mt-0.5">Tidak ada penugasan yang menunggu ulasan saat ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Pengirim / Kelompok</th>
                  <th className="py-3 px-4">Judul Penugasan</th>
                  <th className="py-3 px-4">Waktu Submit</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissionsQueue.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">{sub.studentName}</td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{sub.assignment}</div>
                      <span className="text-[10px] text-indigo-600">{sub.class}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{sub.submittedAt}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedSubmission(sub)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition"
                      >
                        Beri Nilai
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Beri Nilai */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-900 text-white p-5">
              <h3 className="text-base font-bold">Evaluasi Nilai Tugas</h3>
              <p className="text-xs text-indigo-200 mt-0.5">{selectedSubmission.studentName} — {selectedSubmission.assignment}</p>
            </div>
            <form onSubmit={handleGradeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nilai Numerik (0 - 100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder="Contoh: 88"
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Umpan Balik Pendidik</label>
                <textarea
                  rows="3"
                  placeholder="Ketik catatan evaluasi atau revisi untuk kelompok..."
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Simpan & Terbitkan Nilai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}