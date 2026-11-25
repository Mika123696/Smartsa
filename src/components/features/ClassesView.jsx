import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  fetchClassesForUser,
  fetchJoinedMemberships,
  createClassInFirestore,
  joinClassWithToken,
} from '../../services/lmsFirestoreService';
import SafeImage from '../common/SafeImage';
import {
  Search,
  Plus,
  BookOpen,
  Users,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export default function ClassesView({
  onSelectClass,
  requestedModal,
  onClearRequestedModal,
  onMembershipChanged,
  onClassCreated,
}) {
  const { role, currentUser, userProfile } = useAuth();
  const { t, language } = useLanguage();
  const [classes, setClasses] = useState([]);
  const [joinedIds, setJoinedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState('demo');
  const [searchTerm, setSearchTerm] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassCategory, setNewClassCategory] = useState('Teknologi Informasi');
  const [newClassDay, setNewClassDay] = useState('');
  const [newClassTime, setNewClassTime] = useState('');
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [bannerFeedback, setBannerFeedback] = useState(null);
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadClassesData = useCallback(async () => {
    const reqId = ++loadReqIdRef.current;
    setLoading(true);
    try {
      if (!currentUser?.uid) {
        if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
        setClasses([]);
        setDataSource('demo');
        setJoinedIds(new Set());
        setFeedback(null);
        setBannerFeedback(null);
        setIsJoinModalOpen(false);
        setIsCreateModalOpen(false);
        return;
      }

      const [classRes, memberships] = await Promise.all([
        fetchClassesForUser({ uid: currentUser.uid, role }),
        fetchJoinedMemberships(currentUser.uid),
      ]);
      if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
      setClasses(classRes.classes || []);
      setDataSource(classRes.source || 'demo');
      setJoinedIds(new Set(memberships.map((m) => m.classId)));
      setFeedback(null);
      setBannerFeedback(null);
      setIsJoinModalOpen(false);
      setIsCreateModalOpen(false);
      setSearchTerm('');
    } finally {
      if (mountedRef.current && reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentUser?.uid, role]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (mountedRef.current) void loadClassesData();
    });
  }, [loadClassesData]);

  useEffect(() => {
    if (!requestedModal) return;
    Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      if (requestedModal === 'join') {
        setFeedback(null);
        setIsJoinModalOpen(true);
      } else if (requestedModal === 'create') {
        setIsCreateModalOpen(true);
      }
      onClearRequestedModal?.();
    });
  }, [requestedModal, onClearRequestedModal]);

  useEffect(() => {
    if (!isJoinModalOpen && !isCreateModalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsJoinModalOpen(false);
        setIsCreateModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isJoinModalOpen, isCreateModalOpen]);

  const filteredClasses = classes.filter(
    (cls) =>
      (cls.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cls.instructor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cls.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cls.code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleJoinClass = async (e) => {
    e.preventDefault();
    setFeedback(null);
    const code = classCodeInput.trim().toUpperCase();

    if (code.length < 4) {
      setFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Class code must be at least 4 alphanumeric characters.'
            : 'Kode kelas minimal terdiri dari 4 karakter alfanumerik.',
      });
      return;
    }

    setJoining(true);
    try {
      const data = await joinClassWithToken(code);
      const joinedClass = data.classData;
      if (joinedClass) {
        setClasses((prev) =>
          prev.some((c) => c.id === joinedClass.id)
            ? prev.map((c) => (c.id === joinedClass.id ? { ...c, ...joinedClass } : c))
            : [joinedClass, ...prev]
        );
        setJoinedIds((prev) => new Set([...prev, joinedClass.id]));
        onMembershipChanged?.(joinedClass.id, joinedClass);
      }

      setFeedback({
        type: 'success',
        text: data.note
          ? data.note
          : data.alreadyMember
          ? language === 'en'
            ? `You are already enrolled in "${joinedClass?.name || code}".`
            : `Anda sudah terdaftar di kelas "${joinedClass?.name || code}".`
          : language === 'en'
          ? `Successfully joined "${joinedClass?.name || code}"!`
          : `Berhasil bergabung ke dalam kelas "${joinedClass?.name || code}"!`,
      });

      setTimeout(() => {
        setIsJoinModalOpen(false);
        setClassCodeInput('');
        if (joinedClass) onSelectClass(joinedClass);
      }, 1000);
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err.message ||
          (language === 'en'
            ? 'Invalid class code or failed to join class.'
            : 'Kode kelas tidak valid atau gagal bergabung ke kelas.'),
      });
    } finally {
      setJoining(false);
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim() || creating) return;

    setCreating(true);
    setBannerFeedback(null);
    try {
      const newClassObj = await createClassInFirestore({
        name: newClassName.trim(),
        category: newClassCategory,
        description: newClassDesc.trim(),
        day: newClassDay,
        time: newClassTime.trim(),
        code: newClassCode.trim(),
        instructorName: userProfile?.displayName || currentUser?.displayName || 'Pendidik Terdaftar',
      });
      setClasses((prev) => [newClassObj, ...prev]);
      onClassCreated?.(newClassObj);
      setIsCreateModalOpen(false);
      setNewClassName('');
      setNewClassDesc('');
      setNewClassDay('');
      setNewClassTime('');
      setNewClassCode('');
      setBannerFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Class "${newClassObj.name}" published! Code: ${newClassObj.code}`
            : `Kelas "${newClassObj.name}" berhasil diterbitkan! Kode kelas: ${newClassObj.code}`,
      });
    } catch (err) {
      setBannerFeedback({
        type: 'error',
        text:
          err.message ||
          (language === 'en' ? 'Failed to publish new class to Firestore.' : 'Gagal menerbitkan kelas baru ke Firestore.'),
      });
    } finally {
      setCreating(false);
    }
  };

  const isEducatorOrAdmin = role === ROLES.LECTURER || role === ROLES.ADMIN;

  return (
    <div className="space-y-6">
      {/* Role-aware Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
            {role === ROLES.ADMIN
              ? language === 'en'
                ? 'Class Catalog Management'
                : 'Manajemen Katalog Kelas'
              : role === ROLES.LECTURER
                ? language === 'en'
                  ? 'Taught & Managed Classes'
                  : 'Kelas Ampuan & Pengelolaan'
                : language === 'en'
                  ? 'My Classes & Catalog'
                  : 'Kelas Saya & Katalog'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isEducatorOrAdmin
              ? language === 'en'
                ? 'Create new classes, open meeting modules, manage attendance sessions, and grade student work.'
                : 'Buat kelas baru, kelola pertemuan 1–16, buka sesi presensi, dan nilai tugas mahasiswa.'
              : language === 'en'
                ? 'Join a class with its enrollment code or preview the syllabus before joining.'
                : 'Gabung kelas menggunakan kode kelas atau lihat pratinjau silabus sebelum mendaftar.'}
          </p>
        </div>
      </div>

      {/* Header Controls */}
      <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              language === 'en'
                ? 'Search by course name, topic, or instructor...'
                : 'Cari berdasarkan nama kelas, topik, atau pengajar...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:border-blue-500 dark:focus:border-[#f59e0b] text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#18212e] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {dataSource === 'firestore' ? 'FIRESTORE LIVE' : 'MODE DEMO'}
          </span>
          {role === ROLES.STUDENT ? (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setIsJoinModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {t('classes_join_code')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              {t('classes_create_new')}
            </button>
          )}
        </div>
      </div>

      {bannerFeedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
            bannerFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
          }`}
        >
          {bannerFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{bannerFeedback.text}</span>
        </div>
      )}

      {/* Class Cards Grid / Loading / Empty State */}
      {loading ? (
        <div className="bg-white dark:bg-[#121822] p-10 rounded-2xl border border-slate-200 dark:border-[#232f42] text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
          {language === 'en' ? 'Loading class list from Cloud Firestore...' : 'Memuat daftar kelas dari Cloud Firestore...'}
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="bg-white dark:bg-[#121822] p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {classes.length === 0
              ? language === 'en' ? 'No Classes in Cloud Firestore Yet' : 'Belum Ada Kelas di Cloud Firestore'
              : language === 'en' ? 'No Classes Match Your Search' : 'Tidak Ada Kelas yang Cocok dengan Pencarian'}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {classes.length === 0
              ? language === 'en'
                ? 'The classes collection is empty. Run `node scripts/seed-firestore.mjs` or create a new class as a lecturer.'
                : 'Koleksi classes masih kosong. Jalankan skrip `node scripts/seed-firestore.mjs` atau buat kelas baru sebagai dosen.'
              : language === 'en'
              ? 'Try another keyword or join a class using its unique enrollment code.'
              : 'Coba ubah kata kunci pencarian Anda atau gabung kelas menggunakan kode kelas.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map((cls) => {
            const isJoined = joinedIds.has(cls.id);
            const isOwner = Boolean(currentUser?.uid && cls.lecturerId === currentUser.uid);
            return (
              <div
                key={cls.id}
                onClick={() => onSelectClass(cls)}
                className="bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-[#f59e0b]/60 transition cursor-pointer flex flex-col justify-between group"
              >
                <div className="relative h-36 overflow-hidden">
                  <SafeImage
                    src={cls.coverImage}
                    alt={cls.name}
                    fallbackLabel={cls.code || cls.name}
                    variant="cover"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-xs text-white text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                    {language === 'en' ? 'Code' : 'Kode'}: {cls.code}
                  </span>
                  {isEducatorOrAdmin ? (
                    <span className="absolute top-3 left-3 bg-indigo-600/90 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                      {isOwner
                        ? language === 'en'
                          ? 'INSTRUCTOR'
                          : 'PENGAMPU'
                        : role === ROLES.ADMIN
                          ? 'ADMIN ACCESS'
                          : language === 'en'
                            ? 'MANAGED'
                            : 'KELOLA'}
                    </span>
                  ) : isJoined ? (
                    <span className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                      {language === 'en' ? 'ENROLLED' : 'TERGABUNG'} ✓
                    </span>
                  ) : null}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-[#f59e0b] uppercase tracking-wider">
                      {cls.category}
                    </span>
                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-[#f59e0b] transition">
                      {cls.name}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {cls.description || (language === 'en' ? 'No syllabus description yet.' : 'Belum ada deskripsi silabus.')}
                    </p>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-2">
                      {language === 'en' ? 'Educator' : 'Pendidik'}: {cls.instructor}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232f42] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {cls.enrolledCount} {language === 'en' ? 'Members' : 'Peserta'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      {cls.meetingsCount} {language === 'en' ? 'Meetings' : 'Pertemuan'}
                    </span>
                    <span className="text-blue-600 dark:text-[#f59e0b] font-semibold group-hover:underline">
                      {isEducatorOrAdmin
                        ? language === 'en'
                          ? 'Manage Class'
                          : 'Kelola Kelas'
                        : isJoined
                          ? language === 'en'
                            ? 'Open Class'
                            : 'Buka Kelas'
                          : t('public_open_syllabus')}{' '}
                      &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Gabung Kelas dengan Kode */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-class-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden text-slate-900 dark:text-slate-100"
          >
            <div className="bg-slate-900 dark:bg-[#161d2a] text-white p-5 flex items-center justify-between border-b border-slate-800 dark:border-[#232f42]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-400 dark:text-[#f59e0b]" />
                <h3 id="join-class-modal-title" className="text-base font-bold">
                  {language === 'en' ? 'Join Class' : 'Gabung Kelas'}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setIsJoinModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJoinClass} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {language === 'en'
                  ? 'Enter the alphanumeric class code shared by your lecturer.'
                  : 'Masukkan kode alfanumerik yang dibagikan oleh guru atau dosen pengampu mata kuliah Anda.'}
              </p>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Unique Class Code' : 'Kode Kelas Unik'}
                </label>
                <input
                  type="text"
                  maxLength={8}
                  required
                  placeholder={language === 'en' ? 'e.g. CLS101' : 'Contoh: CLS101'}
                  value={classCodeInput}
                  onChange={(e) => setClassCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 text-center text-lg font-mono font-bold tracking-widest uppercase border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0b0f17] rounded-xl focus:outline-none focus:border-blue-500 dark:focus:border-[#f59e0b] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#0e1522] border border-slate-200 dark:border-[#232f42] rounded-xl text-[11px] text-slate-500 dark:text-slate-400">
                <strong>Tips:</strong>{' '}
                {language === 'en'
                  ? 'Ask your course lecturer for the unique 4–8 character class enrollment code.'
                  : 'Minta kode kelas unik (4–8 karakter) yang dibagikan oleh dosen pengampu kelas Anda.'}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  {t('dialog_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={joining}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {joining
                    ? language === 'en' ? 'Verifying...' : 'Memverifikasi...'
                    : language === 'en' ? 'Verify & Join' : 'Verifikasi & Gabung'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat Kelas Baru (Guru/Dosen) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-class-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden text-slate-900 dark:text-slate-100"
          >
            <div className="bg-indigo-900 dark:bg-[#161d2a] text-white p-5 flex items-center justify-between border-b border-indigo-800 dark:border-[#232f42]">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-300" />
                <h3 id="create-class-modal-title" className="text-base font-bold">
                  {language === 'en' ? 'Create New Class Room' : 'Buat Ruang Kelas Baru'}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Course / Subject Name' : 'Nama Mata Kuliah / Pelajaran'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={language === 'en' ? 'e.g. Mobile Development with Flutter' : 'Contoh: Pemrograman Mobile dengan Flutter'}
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Subject Category' : 'Kategori Keilmuan'}
                </label>
                <select
                  value={newClassCategory}
                  onChange={(e) => setNewClassCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                >
                  <option value="Teknologi Informasi">Teknologi Informasi</option>
                  <option value="Ilmu Komputer">Ilmu Komputer</option>
                  <option value="Sistem Informasi">Sistem Informasi</option>
                  <option value="Kecerdasan Buatan">Kecerdasan Buatan</option>
                  <option value="Sains & Matematika">Sains & Matematika</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Schedule Day (Optional)' : 'Hari Kuliah (Opsional)'}
                  </label>
                  <select
                    value={newClassDay}
                    onChange={(e) => setNewClassDay(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                  >
                    <option value="">{language === 'en' ? '-- Not set --' : '-- Belum diatur --'}</option>
                    <option value="Senin">Senin</option>
                    <option value="Selasa">Selasa</option>
                    <option value="Rabu">Rabu</option>
                    <option value="Kamis">Kamis</option>
                    <option value="Jumat">Jumat</option>
                    <option value="Sabtu">Sabtu</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Time (Optional)' : 'Jam (Opsional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="08.00–10.30"
                    value={newClassTime}
                    onChange={(e) => setNewClassTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Custom Code (Optional)' : 'Kode Kelas (Opsional)'}
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder={language === 'en' ? 'Auto if blank' : 'Otomatis jika kosong'}
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono uppercase bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Syllabus Description (Optional)' : 'Deskripsi Silabus (Opsional)'}
                </label>
                <textarea
                  rows="3"
                  placeholder={
                    language === 'en'
                      ? 'Describe learning outcomes and target competencies...'
                      : 'Jelaskan capaian pembelajaran dan kompetensi yang ditargetkan...'
                  }
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  {t('dialog_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {creating
                    ? language === 'en' ? 'Publishing...' : 'Menerbitkan...'
                    : language === 'en' ? 'Publish Class' : 'Terbitkan Kelas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
