import { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  ArrowRight,
  HardDrive,
} from 'lucide-react';
import { useLanguage } from '../../context/useLanguage';
import { fetchPublicClasses } from '../../services/lmsFirestoreService';
import { DEMO_CLASSES } from '../../services/mockData';

export default function LandingPage({
  onGoToDashboard,
  onGoToCatalog,
  onOpenAuth,
  onSelectClass,
}) {
  const { t, language } = useLanguage();
  const [featuredClasses, setFeaturedClasses] = useState(DEMO_CLASSES.slice(0, 3));

  useEffect(() => {
    let mounted = true;
    fetchPublicClasses().then((res) => {
      if (!mounted) return;
      if (res?.classes?.length) {
        setFeaturedClasses(res.classes.slice(0, 3));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCatalogNav = onGoToCatalog || onGoToDashboard;

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white pt-16 pb-24 px-4 sm:px-6 lg:px-8 rounded-b-3xl shadow-xl">
        <div className="max-w-5xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs px-4 py-1.5 rounded-full font-medium shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>{t('public_hero_badge')}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            {t('public_hero_title_1')} <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-sky-300 to-indigo-400">
              Smartsa LMS
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed">
            {t('public_hero_desc')}
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={onGoToDashboard}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-sm font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
            >
              <span>{t('public_explore_dashboard')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenAuth}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-sm font-semibold px-6 py-3.5 rounded-xl transition"
            >
              {t('public_login_btn')}
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-blue-600 dark:text-amber-400 uppercase tracking-wider">
            {t('public_features_tag')}
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {t('public_features_title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
            {t('public_features_sub')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {language === 'en' ? 'Scaffolded Learning Flow' : 'Alur Pembelajaran Bertingkat'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'en'
                ? 'Core materials unlock after completing diagnostic pretests, ensuring conceptual readiness before advanced topics.'
                : 'Materi inti baru terbuka setelah pretest diagnostik diselesaikan. Menjamin kesiapan kompetensi sebelum mempelajari materi tingkat lanjut.'}
            </p>
          </div>

          <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {language === 'en' ? 'Pedagogical AI & Exam Safe' : 'AI Pedagogis & Exam Safe'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'en'
                ? 'Powered by Google Gemini for Learning & Teaching Assistants with automatic exam lockout protection during active assessments.'
                : 'Didukung Google Gemini untuk Learning & Teaching Assistant. Dilengkapi proteksi penguncian otomatis (exam lockout) selama evaluasi aktif.'}
            </p>
          </div>

          <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs hover:shadow-md transition space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {language === 'en' ? 'Firestore Cache & Offline PDF' : 'Cache Firestore & Offline PDF'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {language === 'en'
                ? 'Structured Delta modules and lab manual PDFs can be cached locally for uninterrupted study without constant connectivity.'
                : 'Modul teks Delta terstruktur dan panduan praktikum (Manual Book PDF) dapat diakses andal tanpa ketergantungan sinyal.'}
            </p>
          </div>
        </div>
      </section>

      {/* Featured Courses Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8 gap-3">
          <div>
            <span className="text-xs font-bold text-blue-600 dark:text-amber-400 uppercase tracking-wider">
              {t('public_catalog_tag')}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {t('public_catalog_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCatalogNav}
            className="text-xs font-semibold text-blue-600 dark:text-amber-400 hover:underline flex items-center gap-1 shrink-0"
          >
            {t('public_view_all_classes')} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredClasses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => onSelectClass(cls)}
              className="text-left bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
            >
              <div className="relative h-40 w-full overflow-hidden">
                <img
                  src={cls.coverImage}
                  alt={cls.name || cls.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-xs text-white text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                  {cls.code}
                </span>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between w-full">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-amber-400 uppercase tracking-wider">
                    {cls.category}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-amber-400 transition">
                    {cls.name || cls.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {cls.description}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232f42] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span className="truncate">{cls.instructor || cls.lecturer}</span>
                  <span className="font-semibold text-blue-600 dark:text-amber-400 shrink-0">
                    {t('public_open_syllabus')} &rarr;
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-100/70 dark:bg-[#0d1117] py-14 px-4 sm:px-6 lg:px-8 border-y border-slate-200 dark:border-[#232b38]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-bold text-blue-600 dark:text-amber-400 uppercase tracking-wider">
              {language === 'en' ? 'Learning Flow' : 'Alur Belajar'}
            </span>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {language === 'en' ? '4 Simple Steps to Start' : '4 Langkah Mudah Memulai'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '1',
                title: language === 'en' ? 'Register Account' : 'Registrasi Akun',
                desc:
                  language === 'en'
                    ? 'Sign up via email, Google, or GitHub using Firebase Auth.'
                    : 'Daftar dengan email, Google, atau GitHub melalui Firebase Auth.',
              },
              {
                num: '2',
                title: language === 'en' ? 'Join with Code' : 'Gabung dengan Kode',
                desc:
                  language === 'en'
                    ? 'Enter the 6-character class code provided by your lecturer.'
                    : 'Masukkan 6-karakter kode kelas yang diberikan oleh dosen/guru.',
              },
              {
                num: '3',
                title: language === 'en' ? 'Pretest & Modules' : 'Pretest & Modul',
                desc:
                  language === 'en'
                    ? 'Complete diagnostic assessments to unlock Delta text, video, and PDFs.'
                    : 'Selesaikan asesmen diagnostik untuk membuka teks, video, dan PDF.',
              },
              {
                num: '4',
                title: language === 'en' ? 'Tasks & Post-Test' : 'Tugas & Post-Test',
                desc:
                  language === 'en'
                    ? 'Submit assignment reports and complete final evaluations.'
                    : 'Unggah laporan tugas praktikum dan selesaikan evaluasi akhir.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] text-center space-y-2"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 dark:bg-[#f59e0b] text-white dark:text-black font-bold text-xs flex items-center justify-center mx-auto">
                  {step.num}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{step.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
