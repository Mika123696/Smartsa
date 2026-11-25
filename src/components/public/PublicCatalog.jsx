import { useState, useEffect, useMemo } from 'react';
import { Search, Users } from 'lucide-react';
import { useLanguage } from '../../context/useLanguage';
import { fetchPublicClasses } from '../../services/lmsFirestoreService';
import SafeImage from '../common/SafeImage';

export default function PublicCatalog({ onSelectClass }) {
  const { t, language } = useLanguage();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  useEffect(() => {
    let mounted = true;
    fetchPublicClasses()
      .then((res) => {
        if (!mounted) return;
        setClasses(res?.classes || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const categories = useMemo(() => {
    const uniqueCats = Array.from(new Set(classes.map((c) => c.category).filter(Boolean)));
    return ['ALL', ...uniqueCats];
  }, [classes]);

  const filtered = classes.filter((c) => {
    const name = (c.name || c.title || '').toLowerCase();
    const desc = (c.description || '').toLowerCase();
    const instructor = (c.instructor || c.lecturer || '').toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchSearch = name.includes(q) || desc.includes(q) || instructor.includes(q);
    const matchCat = selectedCategory === 'ALL' || c.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('public_catalog_page_title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t('public_catalog_page_sub')}
        </p>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('public_search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-[#232f42] rounded-xl focus:outline-none focus:border-blue-500 dark:focus:border-[#f59e0b]"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                selectedCategory === cat
                  ? 'bg-blue-600 dark:bg-[#f59e0b] text-white dark:text-black'
                  : 'bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {cat === 'ALL' ? t('public_category_all') : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Course Cards Grid */}
      {loading ? (
        <div className="text-center py-12 text-xs font-mono text-slate-500 dark:text-slate-400">
          {language === 'en' ? 'Loading public course catalog...' : 'Memuat katalog kelas publik...'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#121822] rounded-2xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
          {classes.length === 0
            ? language === 'en'
              ? 'No public classes are available at the moment.'
              : 'Belum ada kelas publik yang tersedia saat ini.'
            : language === 'en'
              ? 'No courses match your search filter.'
              : 'Tidak ada kelas yang cocok dengan filter pencarian Anda.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => onSelectClass(cls)}
              className="text-left bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
            >
              <div className="relative h-40 w-full overflow-hidden">
                <SafeImage
                  src={cls.coverImage}
                  alt={cls.name || cls.title}
                  fallbackLabel={cls.code || cls.name || cls.title}
                  variant="cover"
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
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-2">
                    {cls.instructor || cls.lecturer}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232f42] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {cls.enrolledCount || 0} {language === 'en' ? 'Learners' : 'Peserta'}
                  </span>
                  <span className="font-semibold text-blue-600 dark:text-amber-400 group-hover:underline">
                    {t('public_open_syllabus')} &rarr;
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
