import { useAuth } from '../../context/useAuth';
import { DEMO_CLASSES } from '../../services/mockData';
import {
  BookOpen,
  Sparkles,
  Bookmark,
  Award,
  ArrowRight,
  Compass,
} from 'lucide-react';

export default function GeneralDashboard({ onSelectClass, onNavigateView }) {
  const { userProfile } = useAuth();
  const openCourses = DEMO_CLASSES;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs px-3 py-1 rounded-full mb-3">
            <Compass className="w-3.5 h-3.5" />
            Pembelajaran Mandiri & Komunitas
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            Selamat Datang, {userProfile?.displayName || 'Sahabat Pembelajar'}! 🚀
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
            Jelajahi kursus publik gratis, baca modul berformat rich-text, dan konsultasikan konsep pemrograman secara interaktif dengan Learning Assistant AI.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              onClick={() => onNavigateView('classes')}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition"
            >
              Jelajahi Katalog Terbuka
            </button>
            <button
              onClick={() => onNavigateView('ai-assistant')}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Tanya Learning Assistant
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Kursus Diikuti</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">1 Kursus</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Akses Mandiri</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Materi Disimpan</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Bookmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600">4 Modul</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">Siap Akses Offline</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Jam Belajar</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-700">8.5 Jam</div>
          <span className="text-[11px] text-slate-500 mt-1 inline-block">Bulan Berjalan</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">AI Tutoring Token</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700">20 / 20</div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">Kuota Tersedia</span>
        </div>
      </div>

      {/* Kursus Terbuka Tersedia */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Kursus Terbuka Pilihan</h3>
          <button
            onClick={() => onNavigateView('classes')}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            Lihat Semua <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {openCourses.map((cls) => (
            <div
              key={cls.id}
              onClick={() => onSelectClass(cls)}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
            >
              <div className="relative h-32 overflow-hidden">
                <img
                  src={cls.coverImage}
                  alt={cls.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-2.5 right-2.5 bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                  Gratis
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                    {cls.category}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1 group-hover:text-amber-600 transition">
                    {cls.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cls.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-600">
                  <span>Mulai Belajar Sekarang</span>
                  <span>&rarr;</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
