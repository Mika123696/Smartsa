import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { fetchPublicClasses } from '../../services/lmsFirestoreService';
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
  const { language } = useLanguage();
  const [openCourses, setOpenCourses] = useState(DEMO_CLASSES);

  useEffect(() => {
    let mounted = true;
    fetchPublicClasses().then((res) => {
      if (!mounted) return;
      if (res?.classes?.length) {
        setOpenCourses(res.classes);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs px-3 py-1 rounded-full mb-3">
            <Compass className="w-3.5 h-3.5" />
            {language === 'en'
              ? 'Self-Paced & Community Learning'
              : 'Pembelajaran Mandiri & Komunitas'}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {language === 'en'
              ? `Welcome, ${userProfile?.displayName || 'Learner'}!`
              : `Selamat Datang, ${userProfile?.displayName || 'Sahabat Pembelajar'}!`}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
            {language === 'en'
              ? 'Browse free public courses, read structured learning modules, and consult concepts interactively with Learning Assistant AI.'
              : 'Jelajahi kursus publik gratis, baca modul terstruktur, dan konsultasikan konsep pemrograman secara interaktif dengan Learning Assistant AI.'}
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={() => onNavigateView('classes-all')}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xl shadow-md transition"
            >
              {language === 'en' ? 'Explore Open Catalog' : 'Jelajahi Katalog Terbuka'}
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('ai')}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {language === 'en' ? 'Ask Learning Assistant' : 'Tanya Learning Assistant'}
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">
              {language === 'en' ? 'Joined Courses' : 'Kursus Diikuti'}
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {openCourses.length}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {language === 'en' ? 'Self-Paced Access' : 'Akses Mandiri'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">
              {language === 'en' ? 'Saved Modules' : 'Materi Disimpan'}
            </span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
              <Bookmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">4</div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            {language === 'en' ? 'Ready Offline' : 'Siap Akses Offline'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">
              {language === 'en' ? 'Study Hours' : 'Jam Belajar'}
            </span>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">8.5h</div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {language === 'en' ? 'Current Month' : 'Bulan Berjalan'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">AI Token</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">20 / 20</div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            {language === 'en' ? 'Available' : 'Kuota Tersedia'}
          </span>
        </div>
      </div>

      {/* Open Courses */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {language === 'en' ? 'Featured Open Courses' : 'Kursus Terbuka Pilihan'}
          </h3>
          <button
            type="button"
            onClick={() => onNavigateView('classes-all')}
            className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
          >
            {language === 'en' ? 'View All' : 'Lihat Semua'} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {openCourses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => onSelectClass(cls)}
              className="text-left bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
            >
              <div className="relative h-32 w-full overflow-hidden">
                <img
                  src={cls.coverImage}
                  alt={cls.name || cls.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-2.5 right-2.5 bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                  {language === 'en' ? 'Open' : 'Terbuka'}
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between w-full">
                <div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    {cls.category}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
                    {cls.name || cls.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {cls.description}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232f42] flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <span>{language === 'en' ? 'Start Learning' : 'Mulai Belajar Sekarang'}</span>
                  <span>&rarr;</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
