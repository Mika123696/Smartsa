import { useState } from 'react';
import { Search, Users } from 'lucide-react';
import { DEMO_CLASSES } from '../../services/mockData';

export default function PublicCatalog({ onSelectClass }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');

  const categories = ['Semua', 'Ilmu Komputer', 'Teknologi Informasi', 'Kecerdasan Buatan'];

  const filtered = DEMO_CLASSES.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.instructor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = selectedCategory === 'Semua' || c.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Katalog Kelas Terbuka</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Jelajahi kursus dan modul pembelajaran yang dapat diakses secara publik dan mandiri.
        </p>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari topik atau nama dosen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Course Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((cls) => (
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
                <p className="text-xs font-medium text-slate-700 mt-2">Pendidik: {cls.instructor}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {cls.enrolledCount} Peserta
                </span>
                <span className="font-semibold text-blue-600 group-hover:underline">Buka Silabus &rarr;</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

