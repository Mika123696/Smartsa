import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { ROLES } from '../../constants/roles';
import { DEMO_CLASSES } from '../../services/mockData';
import {
  Search,
  Plus,
  BookOpen,
  Users,
  KeyRound,
  X,
} from 'lucide-react';

export default function ClassesView({ onSelectClass }) {
  const { role } = useAuth();
  const { t, language } = useLanguage();
  const [classes, setClasses] = useState(DEMO_CLASSES);
  const [searchTerm, setSearchTerm] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassCategory, setNewClassCategory] = useState('Teknologi Informasi');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [feedback, setFeedback] = useState(null);

  const filteredClasses = classes.filter(
    (cls) =>
      cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.instructor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleJoinClass = (e) => {
    e.preventDefault();
    setFeedback(null);
    const code = classCodeInput.trim().toUpperCase();

    if (code.length < 5) {
      setFeedback({ type: 'error', text: 'Kode kelas harus terdiri dari 6 karakter alfanumerik.' });
      return;
    }

    const foundClass = classes.find((c) => c.code.toUpperCase() === code);
    if (foundClass) {
      setFeedback({
        type: 'success',
        text: `Berhasil bergabung ke dalam kelas "${foundClass.name}"!`,
      });
      setTimeout(() => {
        setIsJoinModalOpen(false);
        setClassCodeInput('');
        onSelectClass(foundClass);
      }, 1200);
    } else {
      setFeedback({
        type: 'error',
        text: 'Kode kelas tidak valid atau kelas tidak aktif. Pastikan kode yang diberikan dosen/guru benar.',
      });
    }
  };

  const handleCreateClass = (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    const generatedCode = 'CLS' + Math.floor(100 + Math.random() * 900);
    const newClassObj = {
      id: `cls_${Date.now()}`,
      name: newClassName.trim(),
      code: generatedCode,
      description: newClassDesc.trim() || 'Kelas pembelajaran interaktif Smartsa LMS.',
      instructor: 'Anda (Pendidik Terdaftar)',
      category: newClassCategory,
      level: 'Menengah',
      coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
      enrolledCount: 0,
      maxStudents: 50,
      progress: 0,
      meetingsCount: 0,
      completedMeetings: 0,
      isPublic: false,
      meetings: [],
    };

    setClasses([newClassObj, ...classes]);
    setIsCreateModalOpen(false);
    setNewClassName('');
    setNewClassDesc('');
    alert(`Kelas berhasil dibuat! Kode kelas Anda: ${generatedCode}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={language === 'en' ? 'Search by course name, topic, or instructor...' : 'Cari berdasarkan nama kelas, topik, atau pengajar...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto justify-end">
          {role === ROLES.STUDENT ? (
            <button
              onClick={() => {
                setFeedback(null);
                setIsJoinModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {language === 'en' ? 'Join with Code' : 'Gabung dengan Kode'}
            </button>
          ) : (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Create New Class' : 'Buat Kelas Baru'}
            </button>
          )}
        </div>
      </div>

      {/* Class Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClasses.map((cls) => (
          <div
            key={cls.id}
            onClick={() => onSelectClass(cls)}
            className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
          >
            <div className="relative h-36 overflow-hidden">
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
                <h4 className="text-base font-bold text-slate-900 mt-1 line-clamp-1 group-hover:text-blue-600 transition">
                  {cls.name}
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cls.description}</p>
                <p className="text-xs font-medium text-slate-700 mt-2">Pendidik: {cls.instructor}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {cls.enrolledCount} Peserta
                </span>
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  {cls.meetingsCount} Pertemuan
                </span>
                <span className="text-blue-600 font-semibold group-hover:underline">Buka Silabus &rarr;</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Gabung Kelas dengan Kode */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold">Gabung Kelas</h3>
              </div>
              <button
                onClick={() => setIsJoinModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinClass} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Masukkan 6 karakter kode alfanumerik yang dibagikan oleh guru atau dosen pengampu mata kuliah Anda.
              </p>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Kelas Unik</label>
                <input
                  type="text"
                  maxLength={8}
                  required
                  placeholder="Contoh: RPL78A"
                  value={classCodeInput}
                  onChange={(e) => setClassCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 text-center text-lg font-mono font-bold tracking-widest uppercase border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500">
                💡 <strong>Tips Audit:</strong> Gunakan kode demo <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-bold text-slate-800">RPL78A</code> atau <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-bold text-slate-800">PBD99B</code>.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                >
                  Verifikasi & Gabung
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat Kelas Baru (Guru/Dosen) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-300" />
                <h3 className="text-base font-bold">Buat Ruang Kelas Baru</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mata Kuliah / Pelajaran</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pemrograman Mobile dengan Flutter"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori Keilmuan</label>
                <select
                  value={newClassCategory}
                  onChange={(e) => setNewClassCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="Teknologi Informasi">Teknologi Informasi</option>
                  <option value="Ilmu Komputer">Ilmu Komputer</option>
                  <option value="Sistem Informasi">Sistem Informasi</option>
                  <option value="Kecerdasan Buatan">Kecerdasan Buatan</option>
                  <option value="Sains & Matematika">Sains & Matematika</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Silabus</label>
                <textarea
                  rows="3"
                  placeholder="Jelaskan capaian pembelajaran dan kompetensi yang ditargetkan..."
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                >
                  Terbitkan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}