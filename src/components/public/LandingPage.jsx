import {
  Sparkles,
  BookOpen,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { DEMO_CLASSES } from '../../services/mockData';

export default function LandingPage({ onGoToDashboard, onOpenAuth, onSelectClass }) {
  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white pt-16 pb-24 px-4 sm:px-6 lg:px-8 rounded-b-3xl">
        <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs px-4 py-1.5 rounded-full font-medium shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Platform Pembelajaran Digital Generasi Baru</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Belajar Lebih Terarah dengan <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
              Smartsa LMS
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Menghubungkan peserta didik, guru, dan dosen dalam ekosistem pembelajaran modern. Dilengkapi kurikulum bertingkat (*scaffolded learning*), asistensi AI yang aman, dan ketahanan akses *offline persistence*.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <button
              onClick={onGoToDashboard}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-3.5 rounded-xl shadow-lg shadow-blue-500/30 transition flex items-center gap-2"
            >
              <span>Jelajahi Dashboard LMS</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenAuth}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold px-6 py-3.5 rounded-xl transition"
            >
              Masuk / Registrasi Akun
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Fitur Unggulan</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            Dirancang untuk Pengalaman Belajar Terbaik
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            Inovasi fitur yang memadukan pedagogi akademik dan teknologi komputasi awan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Alur Pembelajaran Bertingkat</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Materi inti baru terbuka setelah pretest diagnostik diselesaikan. Menjamin kesiapan kompetensi sebelum mempelajari materi tingkat lanjut.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">AI Pedagogis & Exam Safe</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Didukung Google Gemini untuk Learning & Teaching Assistant. Dilengkapi proteksi penguncian otomatis (*exam lockout*) selama evaluasi aktif.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Cache Firestore & Offline PDF</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Modul teks dan panduan praktikum (Manual Book PDF) dapat disimpan langsung di memori gawai untuk diakses tanpa ketergantungan sinyal internet.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Courses Carousel / Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Katalog Terbuka</span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">Kelas Pilihan Terpopuler</h2>
          </div>
          <button
            onClick={onGoToDashboard}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            Lihat Semua Kelas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {DEMO_CLASSES.map((cls) => (
            <div
              key={cls.id}
              onClick={() => onSelectClass(cls)}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
            >
              <div className="relative h-40 overflow-hidden">
                <img
                  src={cls.coverImage}
                  alt={cls.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-xs text-white text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                  Kode: {cls.code}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                    {cls.category}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-1 line-clamp-1 group-hover:text-blue-600 transition">
                    {cls.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cls.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Pendidik: {cls.instructor}</span>
                  <span className="font-semibold text-blue-600">Buka Kelas &rarr;</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-100/60 py-14 px-4 sm:px-6 lg:px-8 border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Alur Belajar</span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">4 Langkah Mudah Memulai</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mx-auto">
                1
              </div>
              <h4 className="text-sm font-bold text-slate-900">Registrasi Akun</h4>
              <p className="text-xs text-slate-500">Daftar dengan email dan verifikasi tautan melalui Firebase Auth.</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mx-auto">
                2
              </div>
              <h4 className="text-sm font-bold text-slate-900">Gabung dengan Kode</h4>
              <p className="text-xs text-slate-500">Masukkan 6-karakter kode kelas yang diberikan oleh dosen/guru.</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mx-auto">
                3
              </div>
              <h4 className="text-sm font-bold text-slate-900">Pretest & Modul</h4>
              <p className="text-xs text-slate-500">Selesaikan asesmen diagnostik untuk membuka teks, video, dan PDF.</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center mx-auto">
                4
              </div>
              <h4 className="text-sm font-bold text-slate-900">Tugas & Post-Test</h4>
              <p className="text-xs text-slate-500">Unggah laporan proyek kelompok dan selesaikan evaluasi akhir.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

