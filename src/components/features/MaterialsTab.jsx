import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  Code2,
  Database,
  Smartphone,
  GitBranch,
  Palette,
  Layers,
  ChevronRight,
  Upload,
  FileCheck,
  FileUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  File,
  Eye,
  Trash2,
  FolderOpen,
  Link as LinkIcon,
} from 'lucide-react';
import {
  fetchClassesForUser,
  fetchAssignmentsWithUserSubmissions,
  fetchUserLearningProgress,
  submitAssignmentToFirestore,
  cancelSubmissionInFirestore,
} from '../../services/lmsFirestoreService';
import { uploadMediaFile, isValidExternalUrl } from '../../services/cloudinaryService';
import { AccessibleDialog } from '../common/AccessibleDialog';

export default function MaterialsTab({ onSelectSubject }) {
  const { currentUser, userProfile, role } = useAuth();
  const { t, language } = useLanguage();
  const isEducatorOrAdmin = role === ROLES.LECTURER || role === ROLES.ADMIN;

  const [activeSubTab, setActiveSubTab] = useState('materi');
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [learningProgress, setLearningProgress] = useState([]);
  const [meetingFilter, setMeetingFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modal pengumpulan tugas
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [externalUrlInput, setExternalUrlInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState(null);
  const [cancelTargetId, setCancelTargetId] = useState(null);

  const loadReqIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMaterialsAndTasks = useCallback(async () => {
    const reqId = ++loadReqIdRef.current;
    setLoading(true);
    try {
      if (!currentUser?.uid) {
        if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
        setClasses([]);
        setAssignments([]);
        setLearningProgress([]);
        setSelectedAssignment(null);
        setSelectedFile(null);
        setExternalUrlInput('');
        setNotesInput('');
        setSubmitFeedback(null);
        setCancelTargetId(null);
        setMeetingFilter('all');
        return;
      }

      const classRes = await fetchClassesForUser({ uid: currentUser.uid, role });
      if (!mountedRef.current || reqId !== loadReqIdRef.current) return;
      const loadedClasses = classRes.classes || [];
      setClasses(loadedClasses);

      const userClassIds = loadedClasses.map((c) => c.id).filter(Boolean);
      const [taskRes, progressRes] = await Promise.all([
        fetchAssignmentsWithUserSubmissions({ classIds: userClassIds }),
        userClassIds.length > 0 ? fetchUserLearningProgress(currentUser.uid) : Promise.resolve([]),
      ]);
      if (!mountedRef.current || reqId !== loadReqIdRef.current) return;

      const classIdSet = new Set(userClassIds);
      setAssignments(taskRes?.assignments || []);
      setLearningProgress((progressRes || []).filter((p) => classIdSet.has(p.classId)));
      setSelectedAssignment(null);
      setSelectedFile(null);
      setExternalUrlInput('');
      setNotesInput('');
      setSubmitFeedback(null);
      setCancelTargetId(null);
      setMeetingFilter('all');
    } finally {
      if (mountedRef.current && reqId === loadReqIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentUser?.uid, role]);

  useEffect(() => {
    Promise.resolve().then(() => {
      if (mountedRef.current) void loadMaterialsAndTasks();
    });
  }, [loadMaterialsAndTasks]);

  const getSubjectIcon = (iconType) => {
    switch (iconType) {
      case 'code':
        return Code2;
      case 'database':
        return Database;
      case 'mobile':
        return Smartphone;
      case 'git':
        return GitBranch;
      case 'palette':
        return Palette;
      case 'layers':
      default:
        return Layers;
    }
  };

  const handleOpenTaskModal = (asg) => {
    setSelectedAssignment(asg);
    setSelectedFile(null);
    setExternalUrlInput(asg.externalUrl || asg.submittedFile?.url || '');
    setNotesInput(asg.notes || '');
    setSubmitFeedback(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setSubmitFeedback({
          type: 'error',
          text: 'Ukuran file melebihi batas maksimal 25 MB!',
        });
        return;
      }
      setSelectedFile(file);
      setSubmitFeedback(null);
    }
  };

  const handleSubmitAssignment = async (e) => {
    e.preventDefault();
    if (!selectedAssignment || isSubmitting) return;
    if (typeof selectedAssignment.grade === 'number') {
      setSubmitFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'This assignment has already been graded by the lecturer and is locked.'
            : 'Tugas ini sudah dinilai oleh dosen dan dikunci.',
      });
      return;
    }

    const cleanExternalUrl = externalUrlInput.trim();
    if (cleanExternalUrl && !isValidExternalUrl(cleanExternalUrl)) {
      setSubmitFeedback({
        type: 'error',
        text: 'Tautan URL eksternal tidak valid. Harus diawali https:// atau http://',
      });
      return;
    }

    if (!isEducatorOrAdmin && !cleanExternalUrl && !selectedAssignment.submittedFile?.url) {
      setSubmitFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Enter a valid external URL (Google Drive / GitHub / OneDrive / Docs) to submit.'
            : 'Masukkan tautan URL eksternal yang valid (Google Drive / GitHub / OneDrive / Docs) terlebih dahulu!',
      });
      return;
    }

    if (!selectedFile && !cleanExternalUrl && !selectedAssignment.submittedFile) {
      setSubmitFeedback({
        type: 'error',
        text: 'Pilih berkas dokumen atau masukkan tautan URL eksternal tugas terlebih dahulu!',
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      let fileName = selectedAssignment.submittedFile?.name || '';
      let fileSize = selectedAssignment.submittedFile?.size || '';
      let fileUrl = selectedAssignment.submittedFile?.url || '';
      let storageType = 'external_url';
      let extraNote = '';

      if (selectedFile) {
        const uploadResult = await uploadMediaFile(selectedFile, 'document');
        fileName = selectedFile.name;
        fileSize = `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`;

        if (uploadResult.isLive && uploadResult.url) {
          fileUrl = uploadResult.url;
          storageType = 'cloudinary';
          extraNote = uploadResult.note || '';
        } else if (uploadResult.requiresExternalUrl) {
          if (!isValidExternalUrl(cleanExternalUrl)) {
            setSubmitFeedback({
              type: 'error',
              text: `${uploadResult.note} Masukkan tautan https:// pada kolom URL di bawah.`,
            });
            setIsSubmitting(false);
            return;
          }
          fileUrl = cleanExternalUrl;
          storageType = 'external_url';
          extraNote = 'Disimpan menggunakan tautan URL eksternal.';
        }
      } else if (cleanExternalUrl) {
        fileUrl = cleanExternalUrl;
        fileName = fileName || cleanExternalUrl;
        fileSize = fileSize || 'Tautan Eksternal';
        storageType = 'external_url';
      }

      let submittedAtLabel = 'Baru saja (Demo)';
      if (currentUser) {
        const saved = await submitAssignmentToFirestore({
          assignmentId: selectedAssignment.id,
          classId: selectedAssignment.classId,
          meetingNo: Number(selectedAssignment.meetingNo || 1),
          assignmentTitle: selectedAssignment.title,
          className: selectedAssignment.subject,
          studentName: userProfile?.displayName || currentUser.displayName || 'Mahasiswa',
          fileName,
          fileSize,
          fileUrl,
          externalUrl: cleanExternalUrl || fileUrl,
          storageType,
          notes: notesInput.trim(),
        });
        submittedAtLabel = saved.submittedAtLabel;
      }

      const fileData = {
        name: fileName || 'Tautan Tugas',
        size: fileSize || 'Tautan Eksternal',
        url: fileUrl,
        storageType,
        uploadedAt: submittedAtLabel,
      };

      setAssignments((prev) =>
        prev.map((asg) =>
          asg.id === selectedAssignment.id
            ? {
                ...asg,
                status: 'submitted',
                submittedFile: fileData,
                submittedAt: submittedAtLabel,
                externalUrl: cleanExternalUrl || fileUrl,
                notes: notesInput.trim(),
              }
            : asg
        )
      );

      setSubmitFeedback({
        type: 'success',
        text: `Pengumpulan "${fileData.name}" berhasil disimpan! ${extraNote}`.trim(),
      });

      setTimeout(() => {
        setSelectedAssignment(null);
        setSelectedFile(null);
        setExternalUrlInput('');
        setNotesInput('');
        setSubmitFeedback(null);
      }, 1300);
    } catch (err) {
      setSubmitFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan pengumpulan tugas.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeCancelSubmission = async (assignmentId) => {
    const targetAsg = assignments.find((a) => a.id === assignmentId);
    if (typeof targetAsg?.grade === 'number') {
      setSubmitFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Graded submissions cannot be withdrawn.'
            : 'Pengumpulan yang sudah dinilai dosen tidak dapat dihapus atau dibatalkan.',
      });
      setCancelTargetId(null);
      return;
    }
    try {
      if (currentUser) {
        await cancelSubmissionInFirestore(assignmentId);
      }
      setAssignments((prev) =>
        prev.map((asg) =>
          asg.id === assignmentId
            ? {
                ...asg,
                status: 'pending',
                submittedFile: null,
                submittedAt: null,
                externalUrl: '',
                grade: null,
              }
            : asg
        )
      );
      setSelectedAssignment(null);
    } catch (err) {
      setSubmitFeedback({
        type: 'error',
        text: err.message || 'Gagal menarik pengumpulan tugas dari Firestore.',
      });
    } finally {
      setCancelTargetId(null);
    }
  };

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;
  const submittedCount = assignments.filter((a) => a.status === 'submitted').length;

  return (
    <div className="space-y-5">
      <AccessibleDialog
        isOpen={Boolean(cancelTargetId)}
        variant="danger"
        title={t('dialog_confirm')}
        message={t('confirm_cancel_submission')}
        confirmLabel={t('dialog_confirm')}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => cancelTargetId && executeCancelSubmission(cancelTargetId)}
        onClose={() => setCancelTargetId(null)}
      />

      {/* Tactical Header */}
      <div className="border-b border-slate-200 dark:border-[#222d3d] pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-amber-600 dark:text-[#f59e0b] uppercase">
              <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-[#f59e0b]" />
              <span>{t('materials_repo_tag')}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-0.5 font-sans">
              {t('materials_title')}
            </h1>
          </div>
          <span className="text-[10px] font-mono font-bold bg-sky-50 dark:bg-[#141d2c] text-sky-700 dark:text-[#00e5ff] px-2.5 py-1 rounded-sm border border-sky-200 dark:border-[#00e5ff]/30">
            {classes.length} MODUL
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
          {t('materials_subtitle')}
        </p>

        {/* Sub-Tabs */}
        <div className="flex gap-2 mt-4 pt-1 font-mono">
          <button
            type="button"
            onClick={() => setActiveSubTab('materi')}
            className={`flex-1 py-2 text-xs font-bold rounded-sm transition flex items-center justify-center gap-1.5 ${
              activeSubTab === 'materi'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-slate-100 dark:bg-[#151c27] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232f42]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t('tab_modules')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tugas')}
            className={`flex-1 py-2 text-xs font-bold rounded-sm transition flex items-center justify-center gap-1.5 relative ${
              activeSubTab === 'tugas'
                ? 'bg-[#f59e0b] text-black shadow-md'
                : 'bg-slate-100 dark:bg-[#151c27] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#232f42]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t('tab_tasks')}</span>
            {pendingCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full font-mono">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: MODULES LIST */}
      {activeSubTab === 'materi' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white dark:bg-[#121822] p-8 rounded-xl border border-slate-200 dark:border-[#232f42] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Loading course modules from Cloud Firestore...'
                : 'Memuat modul mata kuliah dari Cloud Firestore...'}
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-white dark:bg-[#121822] p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#2b3a4f] text-center space-y-2">
              <Layers className="w-7 h-7 text-[#f59e0b] mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                Belum Ada Modul Mata Kuliah
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {language === 'en'
                  ? 'No courses available yet. Join or create a class from the Classes menu.'
                  : 'Belum ada mata kuliah tersedia. Gabung atau buat kelas melalui menu Daftar Kelas.'}
              </p>
            </div>
          ) : (
            classes.map((subj) => {
              const Icon = getSubjectIcon(subj.iconType);
              const totalMeetings =
                Array.isArray(subj.meetings) && subj.meetings.length > 0
                  ? subj.meetings.length
                  : Math.max(0, Number(subj.meetingsCount || 0));
              const completedMeetingSet = new Set();
              learningProgress.forEach((p) => {
                if (p.classId === subj.id && (p.materialCompleted || p.videoCompleted)) {
                  completedMeetingSet.add(Number(p.meetingNo || 1));
                }
              });
              const rawCompleted = currentUser
                ? completedMeetingSet.size
                : Number(subj.completedMeetings || subj.completedCount || 0);
              const completed = totalMeetings > 0 ? Math.min(totalMeetings, rawCompleted) : 0;
              const progressPct =
                totalMeetings > 0 ? Math.min(100, Math.round((completed / totalMeetings) * 100)) : 0;
              return (
                <button
                  key={subj.id}
                  type="button"
                  onClick={() => onSelectSubject(subj)}
                  className="w-full text-left bg-white dark:bg-[#121822] p-4 rounded-xl border border-slate-200 dark:border-[#232f42] hover:border-[#f59e0b] shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 dark:bg-[#1b263b] group-hover:bg-[#f59e0b] transition-colors" />

                  <div className="flex items-center gap-3.5 min-w-0 pl-1.5">
                    <div
                      className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700/60 ${subj.colorScheme.bg} ${subj.colorScheme.text}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-1.5 py-0.2 rounded-xs">
                          {subj.code}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {[subj.day, subj.time].filter(Boolean).join(', ') ||
                            (language === 'en' ? 'Schedule not set' : 'Jadwal belum diatur')}
                        </span>
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-amber-600 dark:group-hover:text-[#f59e0b] transition mt-0.5">
                        {subj.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-sans">
                        {totalMeetings} {language === 'en' ? 'meetings' : 'pertemuan'} •{' '}
                        {completed} {language === 'en' ? 'completed' : 'selesai'} ({progressPct}%)
                      </p>

                      <div className="w-36 sm:w-48 bg-slate-100 dark:bg-[#1a2332] h-1.5 rounded-full overflow-hidden mt-2">
                        <div
                          className="bg-[#00897b] h-full rounded-full transition-all"
                          style={{
                            width: `${progressPct}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-slate-400 group-hover:text-[#f59e0b] transition shrink-0 pr-1">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: ASSIGNMENTS */}
      {activeSubTab === 'tugas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 font-mono">
            <div className="bg-white dark:bg-[#121822] p-3 rounded-lg border border-slate-200 dark:border-[#232f42] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                  // {language === 'en' ? 'PENDING' : 'BELUM KUMPUL'}
                </span>
                <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  {pendingCount} {language === 'en' ? 'Tasks' : 'Tugas'}
                </div>
              </div>
              <Clock className="w-5 h-5 text-rose-500/80" />
            </div>

            <div className="bg-white dark:bg-[#121822] p-3 rounded-lg border border-slate-200 dark:border-[#232f42] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                  // {language === 'en' ? 'SUBMITTED' : 'TELAH DIKIRIM'}
                </span>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {submittedCount} {language === 'en' ? 'Tasks' : 'Tugas'}
                </div>
              </div>
              <FileCheck className="w-5 h-5 text-emerald-500/80" />
            </div>
          </div>

          {loading ? (
            <div className="bg-white dark:bg-[#121822] p-8 rounded-xl border border-slate-200 dark:border-[#232f42] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'Loading assignments from Cloud Firestore...'
                : 'Memuat daftar tugas dari Cloud Firestore...'}
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white dark:bg-[#121822] p-8 rounded-xl border border-dashed border-slate-300 dark:border-[#2b3a4f] text-center space-y-2">
              <FileCheck className="w-7 h-7 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                Belum Ada Tugas di Firestore
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Koleksi <code className="font-mono text-sky-600 dark:text-[#00e5ff]">assignments</code> masih kosong.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 font-mono">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                  {language === 'en' ? 'Filter by Meeting:' : 'Filter Pertemuan:'}
                </span>
                <select
                  aria-label={language === 'en' ? 'Filter assignments by meeting' : 'Filter tugas per pertemuan'}
                  value={meetingFilter}
                  onChange={(e) => setMeetingFilter(e.target.value)}
                  className="px-2.5 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-800 dark:text-slate-200"
                >
                  <option value="all">{language === 'en' ? 'All Meetings' : 'Semua Pertemuan'}</option>
                  {Array.from(
                    new Set(assignments.map((asg) => Number(asg.meetingNo || 1)))
                  )
                    .sort((a, b) => a - b)
                    .map((num) => (
                      <option key={num} value={String(num)}>
                        Pertemuan {num}
                      </option>
                    ))}
                </select>
              </div>
              {assignments
                .filter((asg) =>
                  meetingFilter === 'all'
                    ? true
                    : Number(asg.meetingNo || 1) === Number(meetingFilter)
                )
                .map((asg) => {
                const isSubmitted = asg.status === 'submitted';
                return (
                  <div
                    key={asg.id}
                    className={`bg-white dark:bg-[#121822] p-4 rounded-xl border transition-all relative overflow-hidden ${
                      isSubmitted
                        ? 'border-emerald-200 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/10'
                        : asg.isOverdue
                        ? 'border-rose-200 dark:border-rose-500/50 bg-rose-50/40 dark:bg-rose-950/10'
                        : 'border-slate-200 dark:border-[#232f42] hover:border-[#f59e0b]'
                    }`}
                  >
                    <div
                      className={`absolute top-0 left-0 w-1.5 h-full ${
                        isSubmitted
                          ? 'bg-emerald-500'
                          : asg.isOverdue
                          ? 'bg-rose-500'
                          : 'bg-[#f59e0b]'
                      }`}
                    />

                    <div className="pl-2 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
                            <span className="font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-1.5 py-0.2 rounded-xs">
                              {asg.subjectCode}
                            </span>
                            <span className="font-bold text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#f59e0b]/10 border border-amber-200 dark:border-[#f59e0b]/30 px-1.5 py-0.2 rounded-xs">
                              PERTEMUAN {Number(asg.meetingNo || 1)}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                              {asg.subject}
                            </span>
                          </div>
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 font-sans">
                            {asg.title}
                          </h3>
                        </div>

                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs shrink-0 uppercase tracking-wider ${
                            isSubmitted
                              ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                              : asg.isOverdue
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                              : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                          }`}
                        >
                          {isSubmitted ? 'SELESAI ✓' : asg.isOverdue ? 'TERLEWAT' : 'MENUNGGU'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-sans line-clamp-2">
                        {asg.note}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#1e2838] text-[10px] font-mono">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {t('deadline_label')}{' '}
                            <strong
                              className={
                                asg.isOverdue && !isSubmitted
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-800 dark:text-slate-300'
                              }
                            >
                              {asg.deadline}
                            </strong>
                          </span>
                        </div>

                        <span className="text-slate-500">
                          Format: {asg.allowedFormats} (Maks {asg.maxSize})
                        </span>
                      </div>

                      {isSubmitted && asg.submittedFile && (
                        <div className="p-2.5 bg-slate-50 dark:bg-[#0a0f18] rounded-md border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between gap-2 text-xs font-mono">
                          <div className="flex items-center gap-2 min-w-0">
                            <File className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              {asg.submittedFile.url ? (
                                <a
                                  href={asg.submittedFile.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] font-bold text-blue-600 dark:text-[#00e5ff] hover:underline truncate block"
                                >
                                  {asg.submittedFile.name}
                                </a>
                              ) : (
                                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {asg.submittedFile.name}
                                </p>
                              )}
                              <span className="text-[9px] text-slate-500 dark:text-slate-400">
                                {asg.submittedFile.size} • {asg.submittedFile.uploadedAt}
                              </span>
                            </div>
                          </div>

                          {asg.grade !== null && (
                            <div className="text-right shrink-0">
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 block">
                                NILAI
                              </span>
                              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                {asg.grade}/100
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-1 font-mono">
                        {isSubmitted ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenTaskModal(asg)}
                              className="bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-slate-700 dark:text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-sm border border-slate-300 dark:border-slate-600 transition flex items-center gap-1 uppercase"
                            >
                              <Eye className="w-3 h-3" />
                              {language === 'en' ? 'Task Details' : 'Detail Tugas'}
                            </button>
                            {typeof asg.grade !== 'number' && (
                              <button
                                type="button"
                                onClick={() => setCancelTargetId(asg.id)}
                                className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-2.5 py-1.5 rounded-sm border border-rose-200 dark:border-rose-500/40 transition flex items-center gap-1 uppercase"
                              >
                                <Trash2 className="w-3 h-3" />
                                {t('task_reupload_btn')}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenTaskModal(asg)}
                            className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-4 py-1.5 rounded-sm transition flex items-center gap-1.5 uppercase tracking-wide shadow-md"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {t('task_submit_btn')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TASK UPLOAD MODAL */}
      {selectedAssignment && (() => {
        const isSelectedTaskGraded = typeof selectedAssignment.grade === 'number';
        return (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="materials-task-modal-title"
            className="bg-white dark:bg-[#12161f] w-full max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden relative my-auto"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#f59e0b]" />

            <div className="p-4 bg-slate-50 dark:bg-[#161c24] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider block">
                  {isSelectedTaskGraded
                    ? language === 'en'
                      ? '// GRADED ASSIGNMENT DETAILS'
                      : '// DETAIL TUGAS & HASIL PENILAIAN'
                    : t('task_modal_tag')}
                </span>
                <h3
                  id="materials-task-modal-title"
                  className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate max-w-[280px]"
                >
                  {selectedAssignment.title}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Tutup modal pengumpulan tugas"
                onClick={() => {
                  setSelectedAssignment(null);
                  setSelectedFile(null);
                  setSubmitFeedback(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {submitFeedback && (
              <div
                className={`m-4 p-3 rounded-md text-xs font-mono flex items-start gap-2 ${
                  submitFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                }`}
              >
                {submitFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                )}
                <span>{submitFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAssignment} className="p-4 space-y-3.5">
              <div className="p-3 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-slate-200 dark:border-[#232f42] text-xs space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase block">
                  PETUNJUK PENUGASAN:
                </span>
                <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                  {selectedAssignment.note}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#192433]">
                  <span>Maks: {selectedAssignment.maxSize}</span>
                  <span className="text-amber-600 dark:text-[#f59e0b]">
                    Tenggat: {selectedAssignment.deadline}
                  </span>
                </div>
              </div>

              {isSelectedTaskGraded && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-500/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between font-bold text-indigo-800 dark:text-indigo-200">
                    <span>{language === 'en' ? 'GRADED SCORE (LOCKED)' : 'NILAI TUGAS (TERKUNCI)'}</span>
                    <span>{selectedAssignment.grade} / 100</span>
                  </div>
                  {selectedAssignment.feedback && (
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      {language === 'en' ? 'Feedback:' : 'Catatan Dosen:'} {selectedAssignment.feedback}
                    </p>
                  )}
                </div>
              )}

              {isEducatorOrAdmin && !isSelectedTaskGraded && (
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                    UNGGAH BERKAS VIA CLOUDINARY ({selectedAssignment.allowedFormats})
                  </label>

                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#f59e0b] rounded-xl p-4 text-center bg-slate-50 dark:bg-[#0d121a] transition cursor-pointer relative group">
                    <input
                      type="file"
                      accept={selectedAssignment.allowedFormats}
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <FileUp className="w-7 h-7 text-[#f59e0b] mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {selectedFile
                        ? selectedFile.name
                        : language === 'en'
                        ? 'Click or drag files here'
                        : 'Klik atau seret berkas ke sini'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      {selectedFile
                        ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap diunggah`
                        : `Mendukung ${selectedAssignment.allowedFormats}`}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-sky-600 dark:text-[#00e5ff]" />
                  <span>
                    {language === 'en'
                      ? 'EXTERNAL SUBMISSION URL (GOOGLE DRIVE / GITHUB / ONEDRIVE / DOCS)'
                      : 'TAUTAN URL EKSTERNAL (GOOGLE DRIVE / GITHUB / ONEDRIVE / DOCS)'}
                  </span>
                </label>
                <input
                  type="url"
                  required={!isEducatorOrAdmin && !isSelectedTaskGraded}
                  readOnly={isSelectedTaskGraded}
                  disabled={isSelectedTaskGraded}
                  value={externalUrlInput}
                  onChange={(e) => setExternalUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/... atau https://github.com/..."
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#00e5ff] font-mono disabled:opacity-70"
                />
                {!isEducatorOrAdmin && !isSelectedTaskGraded && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {language === 'en'
                      ? 'Attach an accessible Google Drive, GitHub, OneDrive, or Docs link.'
                      : 'Tempel tautan Google Drive, GitHub, OneDrive, atau Docs yang dapat diakses dosen.'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  {language === 'en' ? 'ANSWER NOTES (OPTIONAL)' : 'CATATAN JAWABAN (OPSIONAL)'}
                </label>
                <textarea
                  rows="2"
                  readOnly={isSelectedTaskGraded}
                  disabled={isSelectedTaskGraded}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder={
                    language === 'en'
                      ? 'Task summary or group notes...'
                      : 'Catatan kelompok atau ringkasan pengerjaan...'
                  }
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] disabled:opacity-70"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssignment(null);
                    setSelectedFile(null);
                    setSubmitFeedback(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  {isSelectedTaskGraded ? (language === 'en' ? 'Close' : 'Tutup') : t('cancel')}
                </button>
                {!isSelectedTaskGraded && (
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      (!isEducatorOrAdmin
                        ? !externalUrlInput.trim()
                        : !selectedFile &&
                          !externalUrlInput.trim() &&
                          !selectedAssignment.submittedFile)
                    }
                    className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-sm transition flex items-center gap-1.5 uppercase shadow-md disabled:opacity-40"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isSubmitting
                      ? language === 'en'
                        ? 'Submitting...'
                        : 'Mengirim...'
                      : t('task_turn_in_btn')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
