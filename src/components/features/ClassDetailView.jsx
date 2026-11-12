import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { auth } from '../../firebase';
import { setLocalExamSession } from '../../services/aiService';
import {
  fetchAssignmentsWithUserSubmissions,
  fetchClassExamAttempt,
  submitAssignmentToFirestore,
  cancelSubmissionInFirestore,
} from '../../services/lmsFirestoreService';
import { uploadMediaFile, isValidExternalUrl } from '../../services/cloudinaryService';
import DeltaContentRenderer from '../common/DeltaContentRenderer';
import { AccessibleDialog } from '../common/AccessibleDialog';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
  FileText,
  Download,
  AlertTriangle,
  Sparkles,
  HelpCircle,
  Clock,
  Upload,
  File,
  FileUp,
  X,
  Trash2,
  Link as LinkIcon,
  ExternalLink,
} from 'lucide-react';

const EXAM_QUESTIONS = [
  {
    id: 'q1',
    question:
      'Apa fungsi utama lapisan Repository dalam Clean Architecture pada arsitektur perangkat lunak modern?',
    options: [
      'Mengatur tampilan antarmuka pengguna pada komponen React/Flutter',
      'Menyediakan abstraksi akses data independen dari framework database atau API eksternal',
      'Menjalankan kompresi media gambar secara otomatis di Cloudinary',
      'Mengirimkan token verifikasi email OTP menggunakan Firebase Auth',
    ],
  },
  {
    id: 'q2',
    question:
      'Mengapa kunci jawaban pretest dan post-test dilarang keras disimpan pada dokumen Firestore sisi klien?',
    options: [
      'Karena Firestore tidak mendukung tipe data array pilihan ganda',
      'Karena akan memperlambat waktu rendering komponen antarmuka web',
      'Karena dapat diinspeksi oleh pengguna melalui network request atau local storage (risiko kebocoran ujian)',
      'Karena Firebase Admin SDK mewajibkan penyimpanan di file Excel',
    ],
  },
  {
    id: 'q3',
    question:
      'Kapan asisten kecerdasan buatan (Learning Assistant AI) wajib dikunci secara otomatis oleh sistem Smartsa LMS?',
    options: [
      'Saat kuota internet gawai pengguna di bawah 10%',
      'Saat pengguna sedang dalam sesi aktif mengerjakan ujian pretest atau post-test',
      'Hanya pada malam hari di luar jam perkuliahan',
      'Saat pengguna belum melakukan bookmark pada modul materi',
    ],
  },
  {
    id: 'q4',
    question:
      'Apa format penyimpanan materi teks yang digunakan pada Smartsa LMS untuk menghindari risiko serangan XSS?',
    options: [
      'Format HTML mentah dengan tag script aktif',
      'Format Delta JSON (flutter_quill / Quill standard)',
      'Format Dokumen Microsoft Word .docx terkompresi',
      'Format file teks biner tanpa pemformatan',
    ],
  },
];

const DEV_ANSWER_KEY = { q1: 1, q2: 2, q3: 1, q4: 1 };

function resolveSafeVideoSource(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

    if (parsed.hostname.includes('youtube.com')) {
      const vid = parsed.searchParams.get('v');
      if (vid) return { kind: 'iframe', src: `https://www.youtube.com/embed/${vid}` };
      if (parsed.pathname.startsWith('/embed/')) {
        return { kind: 'iframe', src: `https://www.youtube.com${parsed.pathname}` };
      }
    }
    if (parsed.hostname === 'youtu.be') {
      const vid = parsed.pathname.replace('/', '').trim();
      if (vid) return { kind: 'iframe', src: `https://www.youtube.com/embed/${vid}` };
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const vid = parsed.pathname.split('/').filter(Boolean).pop();
      if (vid) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vid}` };
    }
    return { kind: 'video', src: parsed.toString() };
  } catch {
    return null;
  }
}

function getSafePdfUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export default function ClassDetailView({
  classData,
  onBack,
  onNavigateAI,
  onExamStateChange,
}) {
  const { currentUser, userProfile } = useAuth();
  const { t, language } = useLanguage();

  const [activeTab, setActiveTab] = useState('meetings');
  const [selectedMeeting, setSelectedMeeting] = useState(classData?.meetings?.[0] || null);

  // Exam State
  const [examActive, setExamActive] = useState(false);
  const [examType, setExamType] = useState('pretest');
  const [examTimer, setExamTimer] = useState(900);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(null);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examError, setExamError] = useState(null);
  const [examNote, setExamNote] = useState('');
  const [lastAttempt, setLastAttempt] = useState(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [videoActivated, setVideoActivated] = useState(false);

  const examEndTimeRef = useRef(null);
  const selectedAnswersRef = useRef({});
  const examTypeRef = useRef('pretest');
  const classIdRef = useRef(classData?.id || 'subj_pbo');

  // Task Submission State
  const [taskSubmissions, setTaskSubmissions] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [externalUrlInput, setExternalUrlInput] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState(null);
  const [withdrawConfirmTaskId, setWithdrawConfirmTaskId] = useState(null);

  useEffect(() => {
    classIdRef.current = classData?.id || 'subj_pbo';
    setSelectedMeeting(classData?.meetings?.[0] || null);
  }, [classData?.id, classData?.meetings]);

  useEffect(() => {
    const isActiveSession = examActive && !examFinished;
    onExamStateChange?.(isActiveSession);
  }, [examActive, examFinished, onExamStateChange]);

  useEffect(() => {
    return () => {
      onExamStateChange?.(false);
    };
  }, [onExamStateChange]);

  useEffect(() => {
    let mounted = true;
    const loadClassExtras = async () => {
      setTasksLoading(true);
      try {
        if (currentUser && classData?.id) {
          const [taskRes, attempt] = await Promise.all([
            fetchAssignmentsWithUserSubmissions({ classId: classData.id }),
            fetchClassExamAttempt(classData.id, currentUser.uid),
          ]);
          if (!mounted) return;
          setTaskSubmissions(taskRes.assignments || []);
          setLastAttempt(attempt);
        } else {
          if (!mounted) return;
          setTaskSubmissions([
            {
              id: `demo_${classData?.id || 'subj_pbo'}_task01`,
              classId: classData?.id || 'subj_pbo',
              title: `Tugas Praktikum 01: ${classData?.name || 'Modul Kelas'}`,
              deadline: '20 Nov 2026, 23:59 WIB',
              isOverdue: false,
              status: 'pending',
              submittedFile: null,
              note: 'Susun laporan teknis atau tautan repositori proyek dalam format PDF / ZIP atau URL eksternal.',
              maxSize: '15 MB',
              allowedFormats: '.pdf, .zip, .docx',
            },
          ]);
          setLastAttempt(null);
        }
      } finally {
        if (mounted) setTasksLoading(false);
      }
    };

    void loadClassExtras();
    return () => {
      mounted = false;
    };
  }, [classData?.id, classData?.name, currentUser]);

  const examQuestions = EXAM_QUESTIONS;

  const computeLocalDevScore = (answersMap) => {
    const qIds = Object.keys(DEV_ANSWER_KEY);
    let correct = 0;
    for (const qId of qIds) {
      if (answersMap?.[qId] === DEV_ANSWER_KEY[qId]) correct += 1;
    }
    return Math.round((correct / qIds.length) * 100);
  };

  const submitExamToServer = async (answersToGrade, typeToGrade) => {
    examEndTimeRef.current = null;
    const targetClassId = classIdRef.current;

    if (!auth.currentUser) {
      const demoScore = computeLocalDevScore(answersToGrade);
      setLocalExamSession({ classId: targetClassId, examType: typeToGrade, active: false });
      setExamScore(demoScore);
      setExamNote(
        language === 'en'
          ? 'Demo Mode: Score calculated locally (sign in with Firebase to sync /api/grade).'
          : 'Mode Demo: Nilai disimulasikan di perangkat (masuk dengan Firebase untuk sinkronisasi /api/grade).'
      );
      setExamFinished(true);
      setExamActive(false);
      return;
    }

    setExamSubmitting(true);
    setExamError(null);
    setExamNote('');

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'submit',
          classId: targetClassId,
          examType: typeToGrade,
          answers: answersToGrade,
        }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gagal menilai lembar evaluasi di server.');
        }
        setLocalExamSession({ classId: targetClassId, examType: typeToGrade, active: false });
        setExamScore(data.score);
        setLastAttempt(data);
        setExamFinished(true);
        setExamActive(false);
        return;
      }

      const devScore = computeLocalDevScore(answersToGrade);
      setLocalExamSession({ classId: targetClassId, examType: typeToGrade, active: false });
      setExamScore(devScore);
      setExamNote(
        language === 'en'
          ? 'Local Dev Mode: /api/grade is active on Vercel deployment; score evaluated locally.'
          : 'Mode Dev Lokal: Endpoint /api/grade hanya aktif di Vercel deployment; skor dievaluasi secara lokal.'
      );
      setExamFinished(true);
      setExamActive(false);
    } catch (err) {
      setExamError(err.message || 'Gagal mengirim lembar ujian ke server.');
    } finally {
      setExamSubmitting(false);
    }
  };

  const handleExamSubmit = () => {
    if (examSubmitting) return;
    void submitExamToServer(selectedAnswers, examType);
  };

  useEffect(() => {
    if (!examActive || examFinished) return;

    if (!examEndTimeRef.current) {
      examEndTimeRef.current = Date.now() + 900 * 1000;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((examEndTimeRef.current - Date.now()) / 1000));
      setExamTimer(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        void submitExamToServer(selectedAnswersRef.current, examTypeRef.current);
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examActive, examFinished]);

  useEffect(() => {
    if (!examActive || examFinished) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [examActive, examFinished]);

  const handleStartExam = async (type) => {
    const targetClassId = classData?.id || 'subj_pbo';
    examEndTimeRef.current = Date.now() + 900 * 1000;
    selectedAnswersRef.current = {};
    examTypeRef.current = type;

    setExamType(type);
    setExamActive(true);
    setExamTimer(900);
    setExamFinished(false);
    setExamScore(null);
    setExamError(null);
    setExamNote('');
    setSelectedAnswers({});
    setActiveTab('exam');

    setLocalExamSession({
      classId: targetClassId,
      examType: type,
      active: true,
      durationMs: 900 * 1000,
    });

    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'start',
            classId: targetClassId,
            examType: type,
          }),
        });
        const isJson = res.headers.get('content-type')?.includes('application/json');
        if (isJson && !res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('[ClassDetailView] /api/grade start warning:', errData.error);
        }
      } catch (err) {
        console.warn('[ClassDetailView] Gagal sinkronisasi start exam ke server:', err.message);
      }
    }
  };

  const handleAnswerSelect = (qId, optionIdx) => {
    setSelectedAnswers((prev) => {
      const next = { ...prev, [qId]: optionIdx };
      selectedAnswersRef.current = next;
      return next;
    });
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const safePdfUrl = getSafePdfUrl(classData?.pdfUrl);
  const videoSource = resolveSafeVideoSource(classData?.videoUrl);

  const handleDownloadPdf = () => {
    if (safePdfUrl) {
      window.open(safePdfUrl, '_blank', 'noopener,noreferrer');
    } else {
      const summaryContent = [
        `SMARTSA LMS - MANUAL BOOK & RINGKASAN MODUL`,
        `Kelas: ${classData?.name || classData?.title || 'Smartsa Module'} (${classData?.code || '-'})`,
        `Instruktur: ${classData?.instructor || classData?.lecturer || '-'}`,
        ``,
        `Deskripsi:`,
        classData?.description || '-',
        ``,
        `Silabus Pertemuan:`,
        ...(classData?.meetings || []).map((m) => `- Pertemuan ${m.order}: ${m.title} (${m.date})`),
      ].join('\n');
      const blob = new Blob([summaryContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Manual_Book_${(classData?.code || 'Smartsa').replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3500);
  };

  const handleTaskFileSubmit = async (e) => {
    e.preventDefault();
    if (!activeTaskModal || isUploading) return;

    const cleanExternalUrl = externalUrlInput.trim();
    if (cleanExternalUrl && !isValidExternalUrl(cleanExternalUrl)) {
      setTaskFeedback({
        type: 'error',
        text: 'Tautan URL eksternal tidak valid. Harus diawali https:// atau http://',
      });
      return;
    }

    if (!uploadedFile && !cleanExternalUrl) {
      setTaskFeedback({
        type: 'error',
        text: 'Pilih berkas dokumen atau masukkan tautan URL eksternal tugas terlebih dahulu!',
      });
      return;
    }

    setIsUploading(true);
    setTaskFeedback(null);

    try {
      let fileName = '';
      let fileSize = '';
      let fileUrl = '';
      let storageType = 'external_url';
      let extraNote = '';

      if (uploadedFile) {
        const uploadResult = await uploadMediaFile(uploadedFile, 'document');
        fileName = uploadedFile.name;
        fileSize = `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`;

        if (uploadResult.isLive && uploadResult.url) {
          fileUrl = uploadResult.url;
          storageType = 'cloudinary';
          extraNote = uploadResult.note || '';
        } else if (uploadResult.requiresExternalUrl) {
          if (!isValidExternalUrl(cleanExternalUrl)) {
            setTaskFeedback({
              type: 'error',
              text: `${uploadResult.note} Masukkan tautan https:// pada kolom URL di bawah.`,
            });
            setIsUploading(false);
            return;
          }
          fileUrl = cleanExternalUrl;
          storageType = 'external_url';
          extraNote = 'Disimpan menggunakan tautan URL eksternal.';
        }
      } else {
        fileUrl = cleanExternalUrl;
        fileName = cleanExternalUrl;
        fileSize = 'Tautan Eksternal';
        storageType = 'external_url';
      }

      let submittedAtLabel = 'Baru saja (Demo)';
      if (currentUser) {
        const saved = await submitAssignmentToFirestore({
          assignmentId: activeTaskModal.id,
          classId: classData?.id || activeTaskModal.classId || '',
          assignmentTitle: activeTaskModal.title,
          className: classData?.name || classData?.title || '',
          studentName: userProfile?.displayName || currentUser.displayName || 'Mahasiswa',
          fileName,
          fileSize,
          fileUrl,
          externalUrl: cleanExternalUrl || fileUrl,
          storageType,
          notes: taskNotes.trim(),
        });
        submittedAtLabel = saved.submittedAtLabel;
      }

      const fileMeta = {
        name: fileName,
        size: fileSize,
        url: fileUrl,
        storageType,
        uploadedAt: submittedAtLabel,
      };

      setTaskSubmissions((prev) =>
        prev.map((task) =>
          task.id === activeTaskModal.id
            ? {
                ...task,
                status: 'submitted',
                submittedFile: fileMeta,
                submittedAt: submittedAtLabel,
                externalUrl: cleanExternalUrl || fileUrl,
                notes: taskNotes.trim(),
              }
            : task
        )
      );

      setTaskFeedback({
        type: 'success',
        text: `Pengumpulan "${fileMeta.name}" berhasil disimpan! ${extraNote}`.trim(),
      });

      setTimeout(() => {
        setActiveTaskModal(null);
        setUploadedFile(null);
        setExternalUrlInput('');
        setTaskNotes('');
        setTaskFeedback(null);
      }, 1300);
    } catch (err) {
      setTaskFeedback({
        type: 'error',
        text: err.message || 'Gagal mengirimkan pengumpulan tugas.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const executeCancelTask = async (taskId) => {
    try {
      if (currentUser) {
        await cancelSubmissionInFirestore(taskId);
      }
      setTaskSubmissions((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? { ...task, status: 'pending', submittedFile: null, externalUrl: '' }
            : task
        )
      );
    } catch (err) {
      setTaskFeedback({
        type: 'error',
        text: err.message || 'Gagal menarik pengumpulan tugas.',
      });
    } finally {
      setWithdrawConfirmTaskId(null);
    }
  };

  return (
    <div className="space-y-5">
      <AccessibleDialog
        isOpen={Boolean(withdrawConfirmTaskId)}
        variant="danger"
        title={t('dialog_confirm')}
        message={t('confirm_withdraw_task')}
        confirmLabel={t('dialog_confirm')}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => withdrawConfirmTaskId && executeCancelTask(withdrawConfirmTaskId)}
        onClose={() => setWithdrawConfirmTaskId(null)}
      />

      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] relative overflow-hidden shadow-md text-slate-900 dark:text-slate-100">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#f59e0b]" />

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:opacity-80 mb-3 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === 'en' ? '// RETURN TO MODULE DIRECTORY' : '// KEMBALI KE DIREKTORI MODUL'}
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs uppercase">
                {classData.category}
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#141d2c] border border-amber-200 dark:border-[#f59e0b]/30 px-2 py-0.5 rounded-xs">
                {language === 'en' ? 'CODE' : 'KODE'}: {classData.code}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-2 font-mono">
              {classData.name || classData.title}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-sans">
              {classData.description}
            </p>
          </div>

          <div className="text-left md:text-right pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-[#1c2638]">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
              {language === 'en' ? '// LEAD INSTRUCTOR' : '// INSTRUKTUR PENANGGUNG JAWAB'}
            </span>
            <span className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b]">
              {classData.instructor || classData.lecturer}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-1.5 mt-5 pt-3 border-t border-slate-200 dark:border-[#1b263b] font-mono">
          {[
            { id: 'meetings', icon: BookOpen, label: language === 'en' ? 'SYLLABUS' : 'SILABUS' },
            { id: 'material', icon: FileText, label: language === 'en' ? 'READING' : 'DELTA JSON' },
            { id: 'video', icon: PlayCircle, label: 'VIDEO CDN' },
            { id: 'pdf', icon: Download, label: 'MANUAL BOOK' },
            {
              id: 'exam',
              icon: HelpCircle,
              label: language === 'en' ? 'PRETEST & EXAM' : 'PRETEST & EVALUASI',
              danger: true,
            },
            {
              id: 'tasks',
              icon: Upload,
              label: language === 'en' ? 'TASKS SUBMISSION' : 'PENGUMPULAN TUGAS FILE',
            },
          ].map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = activeTab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setActiveTab(tabItem.id)}
                className={`px-3 py-1.5 rounded-xs text-[11px] font-bold transition flex items-center gap-1.5 ${
                  tabItem.danger
                    ? isActive
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-rose-50 dark:bg-[#1d1219] text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50'
                    : isActive
                    ? 'bg-[#f59e0b] text-black shadow-md'
                    : 'bg-slate-100 dark:bg-[#141c2b] text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-[#f59e0b] border border-slate-200 dark:border-[#212f45]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {tabItem.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB: Syllabus Meetings */}
      {activeTab === 'meetings' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
              <span>
                {language === 'en' ? '// CLASS SESSIONS & SYLLABUS' : '// DAFTAR PERTEMUAN KELAS'}
              </span>
            </h3>
            <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
              {classData.meetings?.length || 16} {language === 'en' ? 'SESSIONS' : 'PERTEMUAN'}
            </span>
          </div>

          <div className="space-y-2.5">
            {classData.meetings?.map((meet) => {
              const isCurrent = meet.status === 'in_progress';
              const isLocked = meet.status === 'locked';
              return (
                <div
                  key={meet.id}
                  className={`p-3.5 rounded-lg border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-amber-400 dark:border-[#f59e0b]/50 bg-amber-50/60 dark:bg-[#172133]'
                      : 'border-slate-200 dark:border-[#1b2538] bg-slate-50 dark:bg-[#0b101a]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-xs flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isCurrent
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-slate-200 dark:bg-[#1e293d] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {meet.order < 10 ? `0${meet.order}` : meet.order}
                    </div>
                    <div>
                      <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                        {meet.title}
                      </h4>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        {language === 'en' ? 'Schedule' : 'Jadwal'}: {meet.date}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2 font-mono">
                        <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                          {meet.pretestDone ? '✓ PRETEST SELESAI' : '✕ PRETEST BELUM'}
                        </span>
                        <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                          {meet.posttestDone ? '✓ POST-TEST SELESAI' : '✕ POST-TEST BELUM'}
                        </span>
                        {meet.score && (
                          <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-xs">
                            SKOR: {meet.score}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center font-mono">
                    {isLocked ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> {language === 'en' ? 'LOCKED' : 'TERKUNCI'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMeeting(meet);
                          setActiveTab('material');
                        }}
                        className="bg-white dark:bg-[#1c2432] hover:bg-slate-100 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-xs transition uppercase"
                      >
                        {language === 'en' ? 'Open Module' : 'Buka Modul'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: Delta JSON Reading Module (Pure React JSX, Zero dangerouslySetInnerHTML) */}
      {activeTab === 'material' && (
        <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#1b263b]">
            <div>
              <span className="text-[9px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] uppercase tracking-wider">
                // QUILL DELTA JSON PROTOCOL (PURE REACT RENDERER)
              </span>
              <h3 className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {selectedMeeting ? selectedMeeting.title : 'Pertemuan 01: Dasar Perangkat Lunak'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateAI?.()}
              className="bg-amber-50 dark:bg-[#172133] hover:bg-amber-100 dark:hover:bg-[#202f48] text-amber-800 dark:text-[#f59e0b] border border-amber-300 dark:border-[#f59e0b]/40 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-[#f59e0b]" />
              {language === 'en' ? 'AI CONSULT' : 'KONSULTASI AI'}
            </button>
          </div>

          <DeltaContentRenderer
            delta={selectedMeeting?.deltaContent || classData?.deltaContent}
            fallbackText={classData?.description || ''}
          />
        </div>
      )}

      {/* TAB: Video Learning Player */}
      {activeTab === 'video' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
              // VIDEO STREAM PLAYER
            </h3>
            <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff]">
              {videoSource?.kind === 'iframe' ? 'EMBEDDED STREAM' : 'HTML5 MEDIA PLAYER'}
            </span>
          </div>

          {videoSource ? (
            videoSource.kind === 'iframe' ? (
              <div className="aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e2a3f] bg-black">
                <iframe
                  title={classData?.name || 'Video Pembelajaran'}
                  src={videoSource.src}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e2a3f] bg-black">
                <video
                  controls
                  poster={classData?.coverImage}
                  src={videoSource.src}
                  className="w-full h-full object-contain"
                />
              </div>
            )
          ) : videoActivated ? (
            <div className="aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e2a3f] bg-black">
              <video
                controls
                autoPlay
                poster={classData?.coverImage}
                src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="aspect-video bg-slate-900 border border-slate-200 dark:border-[#1e2a3f] rounded-lg overflow-hidden relative flex items-center justify-center text-white">
              <div className="text-center p-6">
                <button
                  type="button"
                  onClick={() => setVideoActivated(true)}
                  aria-label={language === 'en' ? 'Play instructional video' : 'Putar video pembelajaran'}
                  className="mx-auto mb-3 inline-flex items-center justify-center rounded-full hover:scale-110 transition"
                >
                  <PlayCircle className="w-14 h-14 text-[#f59e0b] drop-shadow-md" />
                </button>
                <p className="text-xs sm:text-sm font-mono font-bold text-slate-100">
                  {selectedMeeting?.title || classData?.name || 'Video Pembelajaran Modul'}
                </p>
                <p className="text-[10px] font-mono text-slate-400 mt-1">
                  {language === 'en'
                    ? 'Click play to load adaptive HTML5 stream'
                    : 'Klik tombol putar untuk memuat pemutar video HTML5'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Manual Book PDF */}
      {activeTab === 'pdf' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
                // DOKUMEN PRAKTIKUM &amp; MANUAL BOOK (PDF)
              </h3>
              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {language === 'en'
                  ? 'Preview or download manual book for offline study.'
                  : 'Pratinjau atau unduh dokumen untuk akses offline tanpa koneksi internet.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {safePdfUrl && (
                <a
                  href={safePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {language === 'en' ? 'OPEN PDF' : 'BUKA PDF'}
                </a>
              )}
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {language === 'en' ? 'DOWNLOAD OFFLINE' : 'UNDUH OFFLINE'}
              </button>
            </div>
          </div>

          {downloadSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 rounded-xs text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              {language === 'en'
                ? 'Manual Book saved to your local downloads!'
                : 'Dokumen Manual Book berhasil diunduh ke penyimpanan perangkat Anda!'}
            </div>
          )}

          {safePdfUrl ? (
            <iframe
              title="Manual Book PDF Viewer"
              src={safePdfUrl}
              className="w-full h-96 rounded-lg border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#070b12]"
            />
          ) : (
            <div className="border border-slate-200 dark:border-[#1e2a3f] rounded-lg p-6 text-center bg-slate-50 dark:bg-[#070b12]">
              <FileText className="w-10 h-10 text-sky-600 dark:text-[#00e5ff] mx-auto mb-2" />
              <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-slate-200">
                Buku_Panduan_Praktikum_{classData?.code || 'Smartsa'}_2026.txt
              </h4>
              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                {language === 'en'
                  ? 'Click DOWNLOAD OFFLINE above to export the syllabus & study manual for offline reading.'
                  : 'Klik UNDUH OFFLINE di atas untuk mengekspor ringkasan silabus & panduan praktikum.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB: Pretest & Post-Test */}
      {activeTab === 'exam' && (
        <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          {!examActive && !examFinished && (
            <div className="text-center py-6 max-w-lg mx-auto space-y-3 font-mono">
              <div className="w-12 h-12 rounded-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                // {language === 'en' ? 'COMPETENCY EVALUATION SESSION' : 'SESI EVALUASI KOMPETENSI'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {language === 'en'
                  ? 'Assessment duration is 15 minutes with active session logging in Firestore.'
                  : 'Evaluasi memiliki durasi 15 menit dengan pencatatan sesi aktif di Firestore (exam_attempts).'}
                <strong className="text-rose-600 dark:text-rose-400 block mt-1.5">
                  ⚠️{' '}
                  {language === 'en'
                    ? 'SECURITY PROTOCOL: AI ASSISTANT IS LOCKED DURING ACTIVE EXAMS.'
                    : 'PROTOKOL KEAMANAN: AI ASSISTANT DIKUNCI SELAMA UJIAN UNTUK MENJAGA INTEGRITAS AKADEMIK.'}
                </strong>
              </p>

              {lastAttempt && typeof lastAttempt.score === 'number' && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-[#090d16] border border-emerald-200 dark:border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
                  {language === 'en' ? 'Last Attempt' : 'Riwayat Terakhir'} (
                  {lastAttempt.examType?.toUpperCase() || 'UJIAN'}):{' '}
                  <strong>{lastAttempt.score} / 100</strong>
                </div>
              )}

              <div className="flex justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleStartExam('pretest')}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xs shadow-md transition"
                >
                  {language === 'en' ? 'START PRETEST' : 'MULAI PRETEST'}
                </button>
                <button
                  type="button"
                  onClick={() => handleStartExam('posttest')}
                  className="bg-sky-600 dark:bg-[#00e5ff] hover:bg-sky-500 dark:hover:bg-[#33ebff] text-white dark:text-black text-xs font-bold px-4 py-2 rounded-xs shadow-md transition"
                >
                  {language === 'en' ? 'START POST-TEST' : 'MULAI POST-TEST'}
                </button>
              </div>
            </div>
          )}

          {examActive && (
            <div className="space-y-4 font-mono">
              <div className="bg-slate-900 dark:bg-[#090d16] border border-slate-700 dark:border-[#1e2a3f] text-white p-3.5 rounded-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-rose-400 uppercase">
                    {examType === 'pretest' ? '// PRETEST AKTIF' : '// POST-TEST AKTIF'}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-[10px] text-slate-400">LOCKOUT AI: AKTIF</span>
                </div>
                <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-600/50 px-2.5 py-1 rounded-xs text-rose-300 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  <span>
                    {language === 'en' ? 'TIME LEFT' : 'SISA WAKTU'}: {formatTimer(examTimer)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 rounded-xs text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span>
                  <strong>LOCKOUT ACTIVE:</strong>{' '}
                  {language === 'en'
                    ? 'Smartsa AI Assistant is automatically disabled during this exam.'
                    : 'Smartsa AI Assistant dinonaktifkan secara otomatis selama sesi ini berlangsung.'}
                </span>
              </div>

              <div className="space-y-4">
                {examQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-4 border border-slate-200 dark:border-[#1e2a3f] rounded-xs bg-slate-50 dark:bg-[#090d16] space-y-2.5"
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      [SOAL 0{idx + 1}] {q.question}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xs border text-xs cursor-pointer transition ${
                            selectedAnswers[q.id] === optIdx
                              ? 'bg-amber-50 dark:bg-[#152338] border-[#f59e0b] font-bold text-amber-800 dark:text-[#f59e0b]'
                              : 'bg-white dark:bg-[#0f1624] border-slate-200 dark:border-[#1e2a3f] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#141d2c]'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            checked={selectedAnswers[q.id] === optIdx}
                            onChange={() => handleAnswerSelect(q.id, optIdx)}
                            className="mt-0.5 accent-[#f59e0b]"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {examError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded-xs text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{examError}</span>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-[#1b263b]">
                <button
                  type="button"
                  onClick={handleExamSubmit}
                  disabled={examSubmitting}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-5 py-2.5 rounded-xs shadow-lg transition uppercase tracking-wider disabled:opacity-50"
                >
                  {examSubmitting
                    ? language === 'en'
                      ? 'VERIFYING SCORE...'
                      : 'MEMVERIFIKASI SKOR...'
                    : language === 'en'
                    ? 'SUBMIT EVALUATION'
                    : 'KIRIM LEMBAR EVALUASI'}
                </button>
              </div>
            </div>
          )}

          {examFinished && (
            <div className="text-center py-6 max-w-md mx-auto space-y-3 font-mono">
              <div className="w-14 h-14 rounded-xs bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                {examError ? '!' : '✓'}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {examError ? '// EVALUASI MEMBUTUHKAN OTENTIKASI' : '// EVALUASI BERHASIL DISERAHKAN'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {examError
                  ? examError
                  : examNote || (
                      <>
                        Lembar jawaban telah dievaluasi oleh endpoint backend{' '}
                        <code className="text-sky-600 dark:text-[#00e5ff]">/api/grade</code>.
                      </>
                    )}
              </p>
              {examScore !== null && (
                <div className="p-4 bg-slate-50 dark:bg-[#070b12] border border-slate-200 dark:border-[#1e2a3f] rounded-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    // SKOR KOMPETENSI
                  </span>
                  <span className="text-2xl font-black text-amber-600 dark:text-[#f59e0b] mt-1 block">
                    {examScore} / 100
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 inline-block">
                    STATUS: {examScore >= 75 ? 'KOMPETEN (PASS)' : 'PERLU PENDALAMAN MODUL'}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setExamFinished(false);
                  setActiveTab('meetings');
                }}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xs transition uppercase"
              >
                {language === 'en' ? 'RETURN TO SYLLABUS' : 'KEMBALI KE SILABUS'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Task Submissions */}
      {activeTab === 'tasks' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
                // PENGUMPULAN TUGAS FILE MODUL
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Submit lab reports via Cloudinary CDN or external URL to Firestore.'
                  : 'Kumpulkan laporan praktikum via Cloudinary CDN atau tautan URL eksternal ke Firestore.'}
              </p>
            </div>
            <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
              PORTAL TUGAS
            </span>
          </div>

          {tasksLoading ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              Memuat tugas kelas dari Cloud Firestore...
            </div>
          ) : taskSubmissions.length === 0 ? (
            <div className="py-8 text-center bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
              Belum ada tugas yang diterbitkan untuk kelas ini di Firestore.
            </div>
          ) : (
            <div className="space-y-3">
              {taskSubmissions.map((task) => {
                const isDone = task.status === 'submitted';
                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isDone
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/40'
                        : 'bg-slate-50 dark:bg-[#0a0f18] border-slate-200 dark:border-[#1e2a3f]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase ${
                              isDone
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                            }`}
                          >
                            {isDone ? 'TELAH DIKUMPULKAN ✓' : 'BELUM MENGUMPULKAN'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                            Tenggat:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">
                              {task.deadline}
                            </strong>
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1.5">
                          {task.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                          {task.note}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 font-mono">
                        {isDone ? (
                          <button
                            type="button"
                            onClick={() => setWithdrawConfirmTaskId(task.id)}
                            className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-3 py-1.5 rounded-xs border border-rose-200 dark:border-rose-500/40 transition flex items-center gap-1 uppercase"
                          >
                            <Trash2 className="w-3 h-3" />
                            {t('task_reupload_btn')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTaskModal(task);
                              setUploadedFile(null);
                              setExternalUrlInput(task.externalUrl || '');
                              setTaskNotes(task.notes || '');
                              setTaskFeedback(null);
                            }}
                            className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-3.5 py-1.5 rounded-xs transition flex items-center gap-1.5 uppercase shadow-md"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {t('task_submit_btn')}
                          </button>
                        )}
                      </div>
                    </div>

                    {isDone && task.submittedFile && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-500/20 flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300 bg-white dark:bg-[#070b12] p-2.5 rounded-xs gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <File className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                          {task.submittedFile.url ? (
                            <a
                              href={task.submittedFile.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-bold text-blue-600 dark:text-[#00e5ff] hover:underline"
                            >
                              {task.submittedFile.name}
                            </a>
                          ) : (
                            <span className="truncate font-bold text-slate-900 dark:text-slate-200">
                              {task.submittedFile.name}
                            </span>
                          )}
                          <span className="text-slate-400 text-[10px]">
                            ({task.submittedFile.size})
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                          {task.submittedFile.uploadedAt}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Task Upload Modal */}
      {activeTaskModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-detail-task-modal-title"
            className="bg-white dark:bg-[#12161f] w-full max-w-md rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden relative my-auto"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#161c24] border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-[#f59e0b] uppercase tracking-wider block">
                  // PENGUNGGAHAN BERKAS TUGAS
                </span>
                <h3
                  id="class-detail-task-modal-title"
                  className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate max-w-[280px]"
                >
                  {activeTaskModal.title}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Tutup modal tugas"
                onClick={() => {
                  setActiveTaskModal(null);
                  setUploadedFile(null);
                  setTaskFeedback(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {taskFeedback && (
              <div
                className={`m-4 p-3 rounded-md text-xs font-mono flex items-start gap-2 ${
                  taskFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40'
                }`}
              >
                {taskFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                )}
                <span>{taskFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleTaskFileSubmit} className="p-4 space-y-3.5">
              <div className="p-3 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-slate-200 dark:border-[#232f42] text-xs space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase block">
                  PETUNJUK PENUGASAN:
                </span>
                <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                  {activeTaskModal.note}
                </p>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#192433]">
                  <span>Maks: {activeTaskModal.maxSize}</span>
                  <span className="text-amber-600 dark:text-[#f59e0b]">
                    Format: {activeTaskModal.allowedFormats}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                  UNGGAH DOKUMEN VIA CLOUDINARY
                </label>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#f59e0b] rounded-xl p-4 text-center bg-slate-50 dark:bg-[#0d121a] transition cursor-pointer relative group">
                  <input
                    type="file"
                    accept={activeTaskModal.allowedFormats}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setUploadedFile(f);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <FileUp className="w-7 h-7 text-[#f59e0b] mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {uploadedFile ? uploadedFile.name : 'Klik atau seret file PDF / ZIP ke sini'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                    {uploadedFile
                      ? `Ukuran: ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap diunggah`
                      : `Maksimal ukuran file: ${activeTaskModal.maxSize}`}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-sky-600 dark:text-[#00e5ff]" />
                  <span>TAUTAN URL EKSTERNAL (FALLBACK / GITHUB / GDRIVE)</span>
                </label>
                <input
                  type="url"
                  value={externalUrlInput}
                  onChange={(e) => setExternalUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/... atau https://github.com/..."
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#00e5ff] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  CATATAN / RINGKASAN (OPSIONAL)
                </label>
                <textarea
                  rows="2"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Catatan pengerjaan atau tautan repositori..."
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTaskModal(null);
                    setUploadedFile(null);
                    setTaskFeedback(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  {t('dialog_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isUploading || (!uploadedFile && !externalUrlInput.trim())}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-sm transition flex items-center gap-1.5 uppercase shadow-md disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploading ? 'Mengunggah...' : 'Kirim Berkas Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
