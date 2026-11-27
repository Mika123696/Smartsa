import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  fetchClassesForUser,
  fetchSubmissionsForLecturerClasses,
  gradeSubmissionInFirestore,
  createAssignmentInFirestore,
  normalizeHttpsImageUrl,
} from '../../services/lmsFirestoreService';
import {
  openAttendanceSession,
  closeAttendanceSession,
} from '../../services/attendanceService';
import {
  uploadMediaFile,
  isValidExternalUrl,
  MATERIAL_ALLOWED_ACCEPT,
} from '../../services/cloudinaryService';
import AttendanceQrModal from '../common/AttendanceQrModal';
import {
  BookOpen,
  Users,
  Award,
  Sparkles,
  Plus,
  CheckCircle,
  FileCheck,
  Send,
  QrCode,
  AlertCircle,
  X,
  Upload,
  Paperclip,
} from 'lucide-react';

export default function TeacherDashboard({ onSelectClass, onNavigateView, onOpenCreateClass }) {
  const { userProfile, currentUser, role } = useAuth();
  const { t, language } = useLanguage();

  const [classes, setClasses] = useState([]);
  const [submissionsQueue, setSubmissionsQueue] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [renderNowMs, setRenderNowMs] = useState(() => Date.now());
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [grading, setGrading] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null);

  // State Pengelola Sesi Presensi Dinamis 2 Arah (Pertemuan 1–16)
  const [attClassId, setAttClassId] = useState('');
  const [attMeetingNo, setAttMeetingNo] = useState(1);
  const [attDuration, setAttDuration] = useState(15);
  const [attCustomCode, setAttCustomCode] = useState('');
  const [attLoading, setAttLoading] = useState(false);

  // State Pembuatan Tugas Pertemuan Baru
  const [taskClassId, setTaskClassId] = useState('');
  const [taskMeetingNo, setTaskMeetingNo] = useState(1);
  const [taskType, setTaskType] = useState('individu');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('2026-12-15T23:59');
  const [taskNote, setTaskNote] = useState('');
  const [taskAttachmentUrl, setTaskAttachmentUrl] = useState('');
  const [taskAttachmentName, setTaskAttachmentName] = useState('');
  const [taskAttachmentSize, setTaskAttachmentSize] = useState('');
  const [uploadingTaskAttachment, setUploadingTaskAttachment] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const loadReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDashboardData = useCallback(async () => {
    const reqId = ++loadReqIdRef.current;
    setLoadingData(true);
    try {
      if (!currentUser?.uid) {
        if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
        setClasses([]);
        setSubmissionsQueue([]);
        setAttClassId('');
        setTaskClassId('');
        setSelectedSubmission(null);
        setStatusBanner(null);
        return;
      }

      const classRes = await fetchClassesForUser({ uid: currentUser.uid, role });
      if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
      const loadedClasses = classRes.classes || [];
      setClasses(loadedClasses);
      setAttClassId((prev) =>
        prev && loadedClasses.some((c) => c.id === prev) ? prev : loadedClasses[0]?.id || ''
      );
      setTaskClassId((prev) =>
        prev && loadedClasses.some((c) => c.id === prev) ? prev : loadedClasses[0]?.id || ''
      );

      const ownedClassIds = loadedClasses.map((c) => c.id).filter(Boolean);
      const subs = await fetchSubmissionsForLecturerClasses(ownedClassIds);
      if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
      setSubmissionsQueue(subs);
      setRenderNowMs(Date.now());
    } finally {
      if (mountedRef.current && reqId === loadReqIdRef.current) {
        setLoadingData(false);
      }
    }
  }, [currentUser?.uid, role]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (mountedRef.current) void loadDashboardData();
    });
  }, [loadDashboardData]);

  useEffect(() => {
    if (!selectedSubmission) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedSubmission(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSubmission]);

  const selectedAttClass = classes.find((c) => c.id === attClassId) || null;
  const attClassMeetings = Array.isArray(selectedAttClass?.meetings) ? selectedAttClass.meetings : [];
  const effectiveAttMeetingNo =
    attClassMeetings.length > 0
      ? attClassMeetings.some((m) => Number(m.order) === Number(attMeetingNo))
        ? Number(attMeetingNo)
        : Number(attClassMeetings[0].order)
      : Number(attMeetingNo || 1);

  const selectedTaskClass = classes.find((c) => c.id === taskClassId) || null;
  const taskClassMeetings = Array.isArray(selectedTaskClass?.meetings) ? selectedTaskClass.meetings : [];
  const effectiveTaskMeetingNo =
    taskClassMeetings.length > 0
      ? taskClassMeetings.some((m) => Number(m.order) === Number(taskMeetingNo))
        ? Number(taskMeetingNo)
        : Number(taskClassMeetings[0].order)
      : Number(taskMeetingNo || 1);

  const activeAttSession = selectedAttClass?.activeAttendanceSession || null;
  const isSessionActive = Boolean(
    activeAttSession?.isOpen && (!activeAttSession.expiresAt || activeAttSession.expiresAt > renderNowMs)
  );

  const handleOpenAttendanceSession = async (e) => {
    e.preventDefault();
    if (!selectedAttClass || attLoading || attClassMeetings.length === 0) return;
    setAttLoading(true);
    setStatusBanner(null);

    try {
      const session = await openAttendanceSession({
        classId: selectedAttClass.id,
        classCode: selectedAttClass.code,
        meetingNo: effectiveAttMeetingNo,
        durationMinutes: attDuration,
        customCode: attCustomCode,
      });

      setClasses((prev) =>
        prev.map((c) =>
          c.id === selectedAttClass.id ? { ...c, activeAttendanceSession: session } : c
        )
      );
      setAttCustomCode('');
      setStatusBanner({
        type: 'success',
        text:
          language === 'en'
            ? `Attendance session for Meeting ${session.meetingNo} opened for ${selectedAttClass.code}! Session Code: ${session.sessionCode}`
            : `Sesi presensi Pertemuan ${session.meetingNo} dibuka untuk ${selectedAttClass.code}! Kode Sesi: ${session.sessionCode}`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err.message || (language === 'en' ? 'Failed to open attendance session.' : 'Gagal membuka sesi presensi di Firestore.'),
      });
    } finally {
      setAttLoading(false);
    }
  };

  const handleCloseAttendanceSession = async () => {
    if (!selectedAttClass || attLoading) return;
    setAttLoading(true);
    setStatusBanner(null);

    try {
      await closeAttendanceSession(selectedAttClass.id);
      setClasses((prev) =>
        prev.map((c) =>
          c.id === selectedAttClass.id ? { ...c, activeAttendanceSession: null } : c
        )
      );
      setStatusBanner({
        type: 'success',
        text:
          language === 'en'
            ? `Attendance session for class ${selectedAttClass.code} has been closed.`
            : `Sesi presensi untuk kelas ${selectedAttClass.code} telah ditutup.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err.message || (language === 'en' ? 'Failed to close attendance session.' : 'Gagal menutup sesi presensi.'),
      });
    } finally {
      setAttLoading(false);
    }
  };

  const handleGradeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSubmission || !gradeInput || grading) return;
    setGrading(true);
    setStatusBanner(null);

    try {
      if (currentUser) {
        await gradeSubmissionInFirestore({
          submissionId: selectedSubmission.id,
          grade: gradeInput,
          feedback: feedbackInput,
        });
      }

      setSubmissionsQueue((prev) =>
        prev.filter((sub) => sub.id !== selectedSubmission.id)
      );
      setStatusBanner({
        type: 'success',
        text:
          language === 'en'
            ? `Score ${gradeInput} for ${selectedSubmission.studentName} published to Firestore!`
            : `Nilai ${gradeInput} untuk ${selectedSubmission.studentName} berhasil diterbitkan ke Firestore!`,
      });
      setSelectedSubmission(null);
      setGradeInput('');
      setFeedbackInput('');
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err.message || (language === 'en' ? 'Failed to save grade to Firestore.' : 'Gagal menyimpan nilai ke Firestore.'),
      });
    } finally {
      setGrading(false);
    }
  };

  const handleUploadDashboardTaskAttachment = async (file) => {
    if (!file || uploadingTaskAttachment) return;
    setUploadingTaskAttachment(true);
    setStatusBanner(null);
    try {
      const uploadResult = await uploadMediaFile(file, 'document');
      if (uploadResult?.isLive && uploadResult.url) {
        const cleanUrl = normalizeHttpsImageUrl(
          uploadResult.url,
          language === 'en' ? 'Assignment attachment URL' : 'URL lampiran tugas'
        );
        setTaskAttachmentUrl(cleanUrl);
        setTaskAttachmentName(file.name);
        setTaskAttachmentSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
        setStatusBanner({
          type: 'success',
          text:
            language === 'en'
              ? `Instruction file "${file.name}" uploaded to Cloudinary.`
              : `Lampiran instruksi "${file.name}" berhasil diunggah ke Cloudinary.`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          text:
            uploadResult?.note ||
            (language === 'en'
              ? 'Cloudinary upload is unavailable for task attachment.'
              : 'Unggah Cloudinary tidak tersedia untuk lampiran tugas.'),
        });
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Gagal mengunggah lampiran instruksi tugas.',
      });
    } finally {
      setUploadingTaskAttachment(false);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!taskClassId || !taskTitle.trim() || creatingTask || taskClassMeetings.length === 0) return;
    setCreatingTask(true);
    setStatusBanner(null);

    try {
      const targetClass = classes.find((c) => c.id === taskClassId);
      const created = await createAssignmentInFirestore({
        classId: taskClassId,
        meetingNo: effectiveTaskMeetingNo,
        title: taskTitle.trim(),
        subject: targetClass?.name || 'Mata Kuliah Smartsa',
        subjectCode: targetClass?.code || 'CLS',
        taskType,
        attachmentUrl: taskAttachmentUrl.trim(),
        attachmentName: taskAttachmentName.trim(),
        attachmentSize: taskAttachmentSize.trim(),
        deadline: taskDeadline,
        note: taskNote.trim(),
      });
      setTaskTitle('');
      setTaskNote('');
      setTaskType('individu');
      setTaskAttachmentUrl('');
      setTaskAttachmentName('');
      setTaskAttachmentSize('');
      setStatusBanner({
        type: 'success',
        text:
          language === 'en'
            ? `Assignment "${created.title}" published for Meeting ${created.meetingNo} (${created.subjectCode}).`
            : `Tugas "${created.title}" berhasil diterbitkan untuk Pertemuan ${created.meetingNo} (${created.subjectCode}).`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Gagal menerbitkan tugas pertemuan.',
      });
    } finally {
      setCreatingTask(false);
    }
  };

  const totalEnrolled = classes.reduce((acc, c) => acc + Number(c.enrolledCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs px-3 py-1 rounded-full mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            {language === 'en'
              ? `Educator Management Hub (${role === ROLES.LECTURER ? 'Lecturer' : 'Educator'})`
              : `Panel Manajemen Pengajar (${role === ROLES.LECTURER ? 'Dosen' : 'Pendidik'})`}
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {language === 'en'
              ? `Welcome, ${userProfile?.displayName || 'Educator'}!`
              : `Selamat Datang, ${userProfile?.displayName || 'Bapak/Ibu Pendidik'}!`}
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
            {language === 'en'
              ? 'Manage lecture courses, open timed attendance sessions per class meeting, evaluate student submissions in Firestore, and utilize AI Teaching Assistant.'
              : 'Kelola kelas perkuliahan, buka sesi presensi dinamis sesuai pertemuan kelas, nilai tugas mahasiswa di Cloud Firestore, serta gunakan Teaching Assistant AI.'}
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={onOpenCreateClass}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {language === 'en' ? 'Create New Class' : 'Buat Kelas Baru'}
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('ai-assistant')}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              {language === 'en' ? 'Teaching Assistant AI (Generate Questions)' : 'Teaching Assistant AI (Generate Soal)'}
            </button>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* Metrics Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{language === 'en' ? 'Active Classes' : 'Kelas Aktif'}</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {classes.length} {language === 'en' ? 'Classes' : 'Kelas'}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {currentUser ? (language === 'en' ? 'Firestore Synced' : 'Tersinkron Firestore') : (language === 'en' ? 'Demo Mode' : 'Mode Demo')}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{language === 'en' ? 'Total Students' : 'Total Mahasiswa'}</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {totalEnrolled} {language === 'en' ? 'Students' : 'Mahasiswa'}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            ● {language === 'en' ? 'Enrolled in Classes' : 'Terdaftar di Kelas'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{language === 'en' ? 'Needs Grading' : 'Tugas Perlu Dinilai'}</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {submissionsQueue.length} {language === 'en' ? 'Submissions' : 'Pengumpulan'}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 inline-block">
            {language === 'en' ? 'Awaiting Rubric Review' : 'Menunggu Ulasan Rubrik'}
          </span>
        </div>

        <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium">{language === 'en' ? 'Attendance Sessions' : 'Sesi Presensi'}</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {classes.filter((c) => c.activeAttendanceSession?.isOpen).length} {language === 'en' ? 'Open' : 'Terbuka'}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 inline-block">
            {language === 'en' ? '2-Way Validation' : 'Validasi 2 Arah'}
          </span>
        </div>
      </div>

      {/* KONTROL SESI PRESENSI DINAMIS 2 ARAH (PERTEMUAN 1–16) */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {t('teacher_open_attendance')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {language === 'en'
                ? 'Open a timed attendance session on the Firestore class document so students can self-verify.'
                : 'Buka sesi presensi berbatas waktu pada dokumen kelas Firestore agar mahasiswa dapat melakukan presensi mandiri.'}
            </p>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="p-4 bg-slate-50 dark:bg-[#0e1522] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
            {language === 'en'
              ? 'No classes available yet. Run seed-firestore.mjs or create a class first.'
              : 'Belum ada kelas tersedia. Jalankan seed-firestore.mjs atau buat kelas terlebih dahulu.'}
          </div>
        ) : (
          <form onSubmit={handleOpenAttendanceSession} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-900 dark:text-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Select Class' : 'Pilih Kelas'}
                </label>
                <select
                  value={attClassId}
                  onChange={(e) => setAttClassId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.code} — {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Meeting' : 'Pertemuan'}
                  </label>
                  <select
                    aria-label={language === 'en' ? 'Select attendance meeting' : 'Pilih pertemuan sesi presensi'}
                    value={attClassMeetings.length > 0 ? effectiveAttMeetingNo : ''}
                    onChange={(e) => setAttMeetingNo(Number(e.target.value))}
                    disabled={attClassMeetings.length === 0}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    {attClassMeetings.length === 0 ? (
                      <option value="">
                        {language === 'en'
                          ? 'No meetings configured yet'
                          : 'Belum ada pertemuan di kelas ini'}
                      </option>
                    ) : (
                      attClassMeetings.map((m) => {
                        const orderNo = Number(m.order || 1);
                        return (
                          <option key={m.id || orderNo} value={orderNo}>
                            P{orderNo < 10 ? `0${orderNo}` : orderNo}: {m.title}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {language === 'en' ? 'Duration' : 'Durasi'}
                  </label>
                  <select
                    value={attDuration}
                    onChange={(e) => setAttDuration(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value={5}>{language === 'en' ? '5 Minutes' : '5 Menit'}</option>
                    <option value={15}>{language === 'en' ? '15 Minutes' : '15 Menit'}</option>
                    <option value={30}>{language === 'en' ? '30 Minutes' : '30 Menit'}</option>
                    <option value={60}>{language === 'en' ? '60 Minutes' : '60 Menit'}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en'
                    ? 'Optional Session Code (leave blank to auto-generate)'
                    : 'Kode Sesi Opsional (kosongkan untuk acak otomatis)'}
                </label>
                <input
                  type="text"
                  maxLength={24}
                  placeholder={`Contoh: ${selectedAttClass?.code || 'CLS101'}-M0${effectiveAttMeetingNo}-8821`}
                  value={attCustomCode}
                  onChange={(e) => setAttCustomCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={attLoading || !selectedAttClass || attClassMeetings.length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50 shrink-0"
              >
                {attLoading
                  ? language === 'en' ? 'Saving Session...' : 'Menyimpan Sesi...'
                  : language === 'en' ? 'Open Attendance Session' : 'Buka Sesi Presensi'}
              </button>
            </div>

            {isSessionActive && activeAttSession && (
              <AttendanceQrModal
                session={activeAttSession}
                classCode={selectedAttClass?.code || ''}
                className={selectedAttClass?.name || ''}
                onCloseSession={handleCloseAttendanceSession}
                closing={attLoading}
              />
            )}
          </form>
        )}
      </div>

      {/* TERBITKAN TUGAS PERTEMUAN BARU */}
      {classes.length > 0 && (
        <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {language === 'en' ? 'Publish Meeting Assignment' : 'Terbitkan Tugas Pertemuan Baru'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {language === 'en'
                ? 'Create a meeting-scoped assignment directly in Firestore assignments collection.'
                : 'Buat penugasan terikat ke pertemuan tertentu langsung ke koleksi Firestore assignments.'}
            </p>
          </div>

          <form onSubmit={handleCreateAssignment} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Class' : 'Kelas'}
                </label>
                <select
                  value={taskClassId}
                  onChange={(e) => setTaskClassId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.code} — {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Meeting' : 'Pertemuan'}
                </label>
                <select
                  aria-label={language === 'en' ? 'Select assignment meeting' : 'Pilih pertemuan tugas'}
                  value={taskClassMeetings.length > 0 ? effectiveTaskMeetingNo : ''}
                  onChange={(e) => setTaskMeetingNo(Number(e.target.value))}
                  disabled={taskClassMeetings.length === 0}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 disabled:opacity-50"
                >
                  {taskClassMeetings.length === 0 ? (
                    <option value="">
                      {language === 'en'
                        ? 'No meetings configured yet'
                        : 'Belum ada pertemuan di kelas ini'}
                    </option>
                  ) : (
                    taskClassMeetings.map((m) => {
                      const orderNo = Number(m.order || 1);
                      return (
                        <option key={m.id || orderNo} value={orderNo}>
                          P{orderNo < 10 ? `0${orderNo}` : orderNo}: {m.title}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Task Type' : 'Tipe Tugas'}
                </label>
                <select
                  aria-label={language === 'en' ? 'Select assignment task type' : 'Pilih tipe tugas'}
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                >
                  <option value="individu">{language === 'en' ? 'Individual' : 'Individu'}</option>
                  <option value="kelompok">{language === 'en' ? 'Group' : 'Kelompok'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Deadline' : 'Tenggat'}
                </label>
                <input
                  type="datetime-local"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Assignment Title' : 'Judul Tugas'}
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Contoh: Tugas Praktikum 02 — Inheritance"
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Notes / Instructions' : 'Instruksi Singkat'}
                </label>
                <input
                  type="text"
                  value={taskNote}
                  onChange={(e) => setTaskNote(e.target.value)}
                  placeholder="Format PDF/DOCX/ZIP atau catatan kelompok..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={
                  creatingTask ||
                  uploadingTaskAttachment ||
                  !taskTitle.trim() ||
                  taskClassMeetings.length === 0
                }
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {creatingTask
                  ? language === 'en' ? 'Publishing...' : 'Menerbitkan...'
                  : language === 'en' ? 'Publish Assignment' : 'Terbitkan Tugas'}
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0e1522] border border-slate-200 dark:border-[#232f42] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {taskAttachmentName
                    ? `${taskAttachmentName}${taskAttachmentSize ? ` (${taskAttachmentSize})` : ''}`
                    : language === 'en'
                      ? 'Optional instruction file attachment (Cloudinary)'
                      : 'Lampiran berkas instruksi tugas opsional (Cloudinary)'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {taskAttachmentUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskAttachmentUrl('');
                      setTaskAttachmentName('');
                      setTaskAttachmentSize('');
                    }}
                    className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[11px] font-semibold"
                  >
                    {language === 'en' ? 'Clear' : 'Hapus'}
                  </button>
                )}
                <label className="cursor-pointer px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-[11px] font-semibold inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  {uploadingTaskAttachment
                    ? language === 'en'
                      ? 'Uploading...'
                      : 'Mengunggah...'
                    : language === 'en'
                      ? 'Attach File'
                      : 'Unggah Lampiran'}
                  <input
                    type="file"
                    accept={MATERIAL_ALLOWED_ACCEPT}
                    disabled={uploadingTaskAttachment || creatingTask}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadDashboardTaskAttachment(f);
                      e.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Classes Managed List */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('teacher_managed_classes')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Click a class to manage meeting syllabi, quizzes, and task submissions.'
                : 'Klik kelas untuk mengelola silabus pertemuan, soal, dan pengumpulan tugas.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCreateClass}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            + {language === 'en' ? 'Create Class' : 'Buat Kelas'}
          </button>
        </div>

        {loadingData ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
            {language === 'en' ? 'Loading classes from Cloud Firestore...' : 'Memuat kelas dari Cloud Firestore...'}
          </div>
        ) : classes.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 dark:bg-[#0e1522] rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'The classes collection is empty. Click + Create Class or run the seed script.'
              : 'Koleksi classes masih kosong. Klik + Buat Kelas atau jalankan skrip seed.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.slice(0, 4).map((cls) => (
              <div
                key={cls.id}
                onClick={() => onSelectClass(cls)}
                className="p-4 border border-slate-200 dark:border-[#232f42] bg-white dark:bg-[#161d2a] rounded-xl hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{cls.category}</span>
                    <span className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                      {language === 'en' ? 'Code' : 'Kode'}: {cls.code}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2">{cls.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{cls.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#232f42] flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    {cls.enrolledCount} {language === 'en' ? 'Students' : 'Mahasiswa'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    {cls.meetingsCount} {language === 'en' ? 'Meetings' : 'Pertemuan'}
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                    {language === 'en' ? 'Manage' : 'Kelola'} &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Antrian Penilaian Tugas Mahasiswa */}
      <div className="bg-white dark:bg-[#121822] p-6 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('teacher_grading_queue')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Evaluate assignment submissions from Firestore submissions collection.'
                : 'Evaluasi pengumpulan tugas dari koleksi Firestore submissions.'}
            </p>
          </div>
        </div>

        {submissionsQueue.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 dark:bg-[#0e1522] rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {language === 'en' ? 'All Submissions Graded!' : 'Semua Tugas Telah Dinilai!'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {language === 'en'
                ? 'No pending assignment submissions awaiting review.'
                : 'Tidak ada pengumpulan tugas yang menunggu ulasan saat ini.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#161d2a] text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-[#232f42]">
                <tr>
                  <th className="py-3 px-4">{language === 'en' ? 'Student' : 'Pengirim / Mahasiswa'}</th>
                  <th className="py-3 px-4">{language === 'en' ? 'Assignment' : 'Judul Penugasan'}</th>
                  <th className="py-3 px-4">{language === 'en' ? 'Submitted At' : 'Waktu Submit'}</th>
                  <th className="py-3 px-4 text-right">{language === 'en' ? 'Action' : 'Aksi'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232f42]">
                {submissionsQueue.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-[#161d2a] transition">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      <div>{sub.studentName}</div>
                      {sub.groupName && (
                        <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                          Kelompok: {sub.groupName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{sub.assignment}</span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase border ${
                            sub.taskType === 'kelompok' || sub.groupName
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {sub.taskType === 'kelompok' || sub.groupName ? 'KELOMPOK' : 'INDIVIDU'}
                        </span>
                      </div>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400">{sub.class}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{sub.submittedAt}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSubmission(sub)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition"
                      >
                        {language === 'en' ? 'Grade' : 'Beri Nilai'}
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
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grading-modal-title"
            className="bg-white dark:bg-[#121822] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-[#232f42] overflow-hidden text-slate-900 dark:text-slate-100"
          >
            <div className="bg-indigo-900 dark:bg-[#161d2a] text-white p-5 flex items-start justify-between border-b border-indigo-800 dark:border-[#232f42]">
              <div>
                <h3 id="grading-modal-title" className="text-base font-bold">
                  {language === 'en' ? 'Evaluate Assignment Score' : 'Evaluasi Nilai Tugas'}
                </h3>
                <p className="text-xs text-indigo-200 dark:text-slate-400 mt-0.5">
                  {selectedSubmission.studentName} — {selectedSubmission.assignment}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('dialog_cancel')}
                onClick={() => setSelectedSubmission(null)}
                className="text-indigo-200 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleGradeSubmit} className="p-6 space-y-4">
              {selectedSubmission.groupName && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-500/40 text-xs font-mono space-y-1">
                  <div className="font-bold text-indigo-800 dark:text-indigo-200">
                    {language === 'en' ? 'Group:' : 'Kelompok:'} {selectedSubmission.groupName}
                  </div>
                  {Array.isArray(selectedSubmission.groupMembers) &&
                    selectedSubmission.groupMembers.length > 0 && (
                      <div className="text-[11px] text-indigo-700 dark:text-indigo-300">
                        {language === 'en' ? 'Members:' : 'Anggota:'}{' '}
                        {selectedSubmission.groupMembers.join(' • ')}
                      </div>
                    )}
                </div>
              )}
              {selectedSubmission.fileUrl && (
                <div className="p-3 bg-slate-50 dark:bg-[#0e1522] rounded-lg border border-slate-200 dark:border-[#232f42] text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    {language === 'en' ? 'Submitted File / Link:' : 'Berkas / Tautan Pengumpulan:'}
                  </span>
                  {isValidExternalUrl(selectedSubmission.fileUrl) ? (
                    <a
                      href={selectedSubmission.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline break-all font-mono"
                    >
                      {selectedSubmission.fileName || selectedSubmission.fileUrl}
                    </a>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-mono">
                      {language === 'en' ? 'Invalid / unsafe URL blocked' : 'Tautan tidak valid / diblokir'}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Numeric Score (0 - 100)' : 'Nilai Numerik (0 - 100)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  placeholder={language === 'en' ? 'Example: 88' : 'Contoh: 88'}
                  value={gradeInput}
                  onChange={(e) => setGradeInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'en' ? 'Educator Feedback Notes' : 'Catatan Umpan Balik Pendidik'}
                </label>
                <textarea
                  rows="3"
                  placeholder={language === 'en' ? 'Write evaluation notes or revision feedback...' : 'Ketik catatan evaluasi atau revisi untuk mahasiswa...'}
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  {t('dialog_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={grading}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {grading
                    ? language === 'en' ? 'Saving...' : 'Menyimpan...'
                    : language === 'en' ? 'Save & Publish Score' : 'Simpan & Terbitkan Nilai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
