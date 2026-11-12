import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import { auth } from '../../firebase';
import { setLocalExamSession } from '../../services/aiService';
import {
  fetchAssignmentsWithUserSubmissions,
  fetchClassExamAttempt,
  fetchClassExamAttempts,
  fetchClassSubmissionsForGrading,
  fetchInstructorAnswerKey,
  gradeSubmissionInFirestore,
  joinClassWithToken,
  submitAssignmentToFirestore,
  cancelSubmissionInFirestore,
  updateClassMeetingsInFirestore,
} from '../../services/lmsFirestoreService';
import {
  closeAttendanceSession,
  fetchMeetingAttendees,
  getClassAttendanceSession,
  openAttendanceSession,
} from '../../services/attendanceService';
import { uploadMediaFile, isValidExternalUrl } from '../../services/cloudinaryService';
import DeltaContentRenderer from '../common/DeltaContentRenderer';
import { AccessibleDialog } from '../common/AccessibleDialog';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lock,
  Unlock,
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
  QrCode,
  Users,
  Award,
  KeyRound,
  Edit3,
  Save,
  RefreshCw,
  BarChart3,
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

function computeLocalDevScore(answersMap) {
  if (import.meta.env.DEV) {
    const devOnlyKey = { q1: 1, q2: 2, q3: 1, q4: 1 };
    const qIds = Object.keys(devOnlyKey);
    let correct = 0;
    for (const qId of qIds) {
      if (answersMap?.[qId] === devOnlyKey[qId]) correct += 1;
    }
    return Math.round((correct / qIds.length) * 100);
  }
  return 0;
}

function buildFallbackMeetingsList(classData) {
  if (Array.isArray(classData?.meetings) && classData.meetings.length > 0) {
    return classData.meetings;
  }
  return Array.from({ length: 16 }, (_, i) => {
    const order = i + 1;
    return {
      id: `${classData?.id || 'cls'}_m${order}`,
      order,
      title: `Pertemuan ${order < 10 ? `0${order}` : order}: Topik Pembelajaran ${order}`,
      date: `${classData?.day || 'Senin'}, ${classData?.time || '08.00–10.30'}`,
      status: order <= 3 ? 'in_progress' : 'locked',
      pretestDone: false,
      posttestDone: false,
    };
  });
}

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
  isMember,
  onMembershipChanged,
  onClassUpdated,
  onBack,
  onNavigateAI,
  onExamStateChange,
}) {
  const { currentUser, userProfile, role } = useAuth();
  const { t, language } = useLanguage();

  const isEducatorOrAdmin = role === ROLES.LECTURER || role === ROLES.ADMIN;
  const isPreviewMode = Boolean(currentUser && role === ROLES.STUDENT && isMember === false);

  const [activeTab, setActiveTab] = useState('meetings');
  const [meetingsList, setMeetingsList] = useState(() => buildFallbackMeetingsList(classData));
  const [selectedMeeting, setSelectedMeeting] = useState(
    () => buildFallbackMeetingsList(classData)[0] || null
  );

  // Syllabus Preview Join State
  const [joiningClass, setJoiningClass] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);

  // Instructor Meetings Editor State
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editMeetingTitle, setEditMeetingTitle] = useState('');
  const [editMeetingDate, setEditMeetingDate] = useState('');
  const [savingMeetings, setSavingMeetings] = useState(false);
  const [meetingsFeedback, setMeetingsFeedback] = useState(null);

  // Instructor Attendance State
  const [attSession, setAttSession] = useState(null);
  const [attMeetingNo, setAttMeetingNo] = useState(1);
  const [attDurationMins, setAttDurationMins] = useState(15);
  const [attCustomCode, setAttCustomCode] = useState('');
  const [attLoading, setAttLoading] = useState(false);
  const [attFeedback, setAttFeedback] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [attendeesFilterMeeting, setAttendeesFilterMeeting] = useState('');

  // Instructor Submissions Grading State
  const [classSubmissions, setClassSubmissions] = useState([]);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradeInputs, setGradeInputs] = useState({});
  const [feedbackInputs, setFeedbackInputs] = useState({});
  const [gradingId, setGradingId] = useState(null);
  const [gradingNotice, setGradingNotice] = useState(null);

  // Instructor Exam Keys & Analytics State
  const [evalKeyType, setEvalKeyType] = useState('pretest');
  const [instructorKeyMap, setInstructorKeyMap] = useState(null);
  const [instructorKeySource, setInstructorKeySource] = useState('');
  const [classExamAttempts, setClassExamAttempts] = useState([]);
  const [evalAnalyticsLoading, setEvalAnalyticsLoading] = useState(false);
  const [evalAnalyticsError, setEvalAnalyticsError] = useState('');

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
    const nextMeetings = buildFallbackMeetingsList(classData);
    setMeetingsList(nextMeetings);
    setSelectedMeeting(nextMeetings[0] || null);
  }, [classData]);

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

  const loadInstructorAttendance = useCallback(
    async (meetingFilter = attendeesFilterMeeting) => {
      if (!classData?.id) return;
      setAttLoading(true);
      try {
        const [sess, list] = await Promise.all([
          getClassAttendanceSession(classData.id),
          fetchMeetingAttendees(classData.id, meetingFilter ? Number(meetingFilter) : null),
        ]);
        setAttSession(sess);
        setAttendees(list);
      } finally {
        setAttLoading(false);
      }
    },
    [classData?.id, attendeesFilterMeeting]
  );

  const loadInstructorGrading = useCallback(async () => {
    if (!classData?.id) return;
    setGradingLoading(true);
    try {
      const subs = await fetchClassSubmissionsForGrading(classData.id);
      setClassSubmissions(subs);
      const initialGrades = {};
      const initialFeedbacks = {};
      subs.forEach((s) => {
        initialGrades[s.id] = typeof s.grade === 'number' ? String(s.grade) : '';
        initialFeedbacks[s.id] = s.feedback || '';
      });
      setGradeInputs(initialGrades);
      setFeedbackInputs(initialFeedbacks);
    } finally {
      setGradingLoading(false);
    }
  }, [classData?.id]);

  const loadInstructorEvalAnalytics = useCallback(
    async (targetExamType = evalKeyType) => {
      if (!classData?.id) return;
      setEvalAnalyticsLoading(true);
      setEvalAnalyticsError('');
      try {
        const [keyRes, attempts] = await Promise.all([
          fetchInstructorAnswerKey({ classId: classData.id, examType: targetExamType }),
          fetchClassExamAttempts(classData.id),
        ]);
        setInstructorKeyMap(keyRes.answerKey || {});
        setInstructorKeySource(keyRes.source || 'server');
        setClassExamAttempts(attempts || []);
      } catch (err) {
        setEvalAnalyticsError(err.message || 'Gagal memuat kunci evaluasi dan statistik kelas.');
      } finally {
        setEvalAnalyticsLoading(false);
      }
    },
    [classData?.id, evalKeyType]
  );

  useEffect(() => {
    if (!isEducatorOrAdmin) return;
    if (activeTab === 'attendance') {
      void loadInstructorAttendance();
    } else if (activeTab === 'grading') {
      void loadInstructorGrading();
    } else if (activeTab === 'exam_insights') {
      void loadInstructorEvalAnalytics(evalKeyType);
    }
  }, [
    isEducatorOrAdmin,
    activeTab,
    evalKeyType,
    loadInstructorAttendance,
    loadInstructorGrading,
    loadInstructorEvalAnalytics,
  ]);

  const examQuestions = EXAM_QUESTIONS;

  const submitExamToServer = async (answersToGrade, typeToGrade) => {
    examEndTimeRef.current = null;
    const targetClassId = classIdRef.current;

    if (!auth?.currentUser) {
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

    if (auth?.currentUser) {
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

  const handleJoinFromPreview = async () => {
    if (!classData?.code || joiningClass) return;
    setJoiningClass(true);
    setJoinFeedback(null);
    try {
      const res = await joinClassWithToken(classData.code);
      const joinedClass = res.classData || classData;
      onMembershipChanged?.(joinedClass.id || classData.id, joinedClass);
      setJoinFeedback({
        type: 'success',
        text:
          language === 'en'
            ? 'Successfully joined this class! Full modules are now unlocked.'
            : 'Berhasil bergabung ke kelas! Seluruh modul pembelajaran kini terbuka.',
      });
    } catch (err) {
      setJoinFeedback({
        type: 'error',
        text: err.message || 'Gagal bergabung ke kelas.',
      });
    } finally {
      setJoiningClass(false);
    }
  };

  const handleToggleMeetingLock = async (targetMeeting) => {
    if (!isEducatorOrAdmin || savingMeetings) return;
    const nextStatus = targetMeeting.status === 'locked' ? 'in_progress' : 'locked';
    const nextMeetings = meetingsList.map((m) =>
      m.id === targetMeeting.id ? { ...m, status: nextStatus } : m
    );
    setMeetingsList(nextMeetings);
    setSavingMeetings(true);
    setMeetingsFeedback(null);
    try {
      await updateClassMeetingsInFirestore(classData.id, nextMeetings);
      onClassUpdated?.({ ...classData, meetings: nextMeetings });
      setMeetingsFeedback({
        type: 'success',
        text:
          nextStatus === 'locked'
            ? `Pertemuan ${targetMeeting.order} dikunci untuk mahasiswa.`
            : `Pertemuan ${targetMeeting.order} dibuka untuk mahasiswa.`,
      });
    } catch (err) {
      setMeetingsFeedback({
        type: 'error',
        text: err.message || 'Gagal memperbarui status pertemuan.',
      });
    } finally {
      setSavingMeetings(false);
    }
  };

  const handleStartEditMeeting = (meet) => {
    setEditingMeetingId(meet.id);
    setEditMeetingTitle(meet.title || '');
    setEditMeetingDate(meet.date || '');
  };

  const handleSaveMeetingEdit = async (targetMeeting) => {
    if (!isEducatorOrAdmin || savingMeetings) return;
    const cleanTitle = editMeetingTitle.trim() || targetMeeting.title;
    const cleanDate = editMeetingDate.trim() || targetMeeting.date;
    const nextMeetings = meetingsList.map((m) =>
      m.id === targetMeeting.id ? { ...m, title: cleanTitle, date: cleanDate } : m
    );
    setMeetingsList(nextMeetings);
    setEditingMeetingId(null);
    setSavingMeetings(true);
    setMeetingsFeedback(null);
    try {
      await updateClassMeetingsInFirestore(classData.id, nextMeetings);
      onClassUpdated?.({ ...classData, meetings: nextMeetings });
      if (selectedMeeting?.id === targetMeeting.id) {
        setSelectedMeeting({ ...targetMeeting, title: cleanTitle, date: cleanDate });
      }
      setMeetingsFeedback({
        type: 'success',
        text: `Pertemuan ${targetMeeting.order} berhasil disimpan ke Firestore.`,
      });
    } catch (err) {
      setMeetingsFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan perubahan pertemuan.',
      });
    } finally {
      setSavingMeetings(false);
    }
  };

  const handleOpenAttendance = async (e) => {
    e.preventDefault();
    if (!classData?.id || attLoading) return;
    setAttLoading(true);
    setAttFeedback(null);
    try {
      const opened = await openAttendanceSession({
        classId: classData.id,
        classCode: classData.code || 'CLS',
        meetingNo: attMeetingNo,
        durationMinutes: attDurationMins,
        customCode: attCustomCode,
      });
      setAttSession(opened);
      setAttCustomCode('');
      setAttFeedback({
        type: 'success',
        text: `Sesi presensi Pertemuan ${opened.meetingNo} dibuka (Kode: ${opened.sessionCode}).`,
      });
      const list = await fetchMeetingAttendees(
        classData.id,
        attendeesFilterMeeting ? Number(attendeesFilterMeeting) : null
      );
      setAttendees(list);
    } catch (err) {
      setAttFeedback({
        type: 'error',
        text: err.message || 'Gagal membuka sesi presensi.',
      });
    } finally {
      setAttLoading(false);
    }
  };

  const handleCloseAttendance = async () => {
    if (!classData?.id || attLoading) return;
    setAttLoading(true);
    setAttFeedback(null);
    try {
      await closeAttendanceSession(classData.id);
      setAttSession(null);
      setAttFeedback({
        type: 'success',
        text: 'Sesi presensi kelas telah ditutup.',
      });
    } catch (err) {
      setAttFeedback({
        type: 'error',
        text: err.message || 'Gagal menutup sesi presensi.',
      });
    } finally {
      setAttLoading(false);
    }
  };

  const handleSaveSubmissionGrade = async (sub) => {
    const rawGrade = gradeInputs[sub.id];
    const numericGrade = Number(rawGrade);
    if (rawGrade === '' || Number.isNaN(numericGrade) || numericGrade < 0 || numericGrade > 100) {
      setGradingNotice({
        type: 'error',
        text: 'Masukkan nilai angka yang valid antara 0 hingga 100.',
      });
      return;
    }

    setGradingId(sub.id);
    setGradingNotice(null);
    try {
      const fbText = feedbackInputs[sub.id] || '';
      await gradeSubmissionInFirestore({
        submissionId: sub.submissionId || sub.id,
        grade: numericGrade,
        feedback: fbText,
      });
      setClassSubmissions((prev) =>
        prev.map((item) =>
          item.id === sub.id
            ? { ...item, grade: numericGrade, feedback: fbText, status: 'graded' }
            : item
        )
      );
      setGradingNotice({
        type: 'success',
        text: `Nilai ${numericGrade} untuk ${sub.studentName} berhasil disimpan.`,
      });
    } catch (err) {
      setGradingNotice({
        type: 'error',
        text: err.message || 'Gagal menyimpan nilai tugas.',
      });
    } finally {
      setGradingId(null);
    }
  };

  const tabsToRender = isEducatorOrAdmin
    ? [
        { id: 'meetings', icon: BookOpen, label: language === 'en' ? 'SYLLABUS & EDIT' : 'SILABUS & KELOLA' },
        { id: 'material', icon: FileText, label: language === 'en' ? 'READING' : 'DELTA JSON' },
        { id: 'video', icon: PlayCircle, label: 'VIDEO CDN' },
        { id: 'pdf', icon: Download, label: 'MANUAL BOOK' },
        { id: 'attendance', icon: QrCode, label: language === 'en' ? 'QR ATTENDANCE' : 'PRESENSI QR' },
        { id: 'grading', icon: Award, label: language === 'en' ? 'GRADING' : 'NILAI TUGAS' },
        {
          id: 'exam_insights',
          icon: KeyRound,
          label: language === 'en' ? 'EVAL KEYS & STATS' : 'KUNCI & STATISTIK',
        },
      ]
    : [
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
      ];

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

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:opacity-80 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === 'en' ? '// RETURN TO MODULE DIRECTORY' : '// KEMBALI KE DIREKTORI MODUL'}
          </button>

          {isEducatorOrAdmin && (
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40">
              {role === ROLES.ADMIN
                ? 'MODE ADMINISTRATOR // FULL ACCESS'
                : 'MODE INSTRUKTUR // KELOLA KELAS'}
            </span>
          )}
          {isPreviewMode && (
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40">
              {language === 'en' ? 'SYLLABUS PREVIEW' : 'PRATINJAU SILABUS'}
            </span>
          )}
        </div>

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

        {/* Tab Navigation (hidden in Syllabus Preview Mode for non-enrolled signed-in students) */}
        {!isPreviewMode && (
          <div className="flex flex-wrap gap-1.5 mt-5 pt-3 border-t border-slate-200 dark:border-[#1b263b] font-mono">
            {tabsToRender.map((tabItem) => {
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
        )}
      </div>

      {/* SYLLABUS PREVIEW MODE (Signed-in Student NOT Enrolled) */}
      {isPreviewMode && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-amber-50 via-white to-sky-50 dark:from-[#1b160c] dark:via-[#121822] dark:to-[#0f1a29] p-5 rounded-xl border border-amber-300 dark:border-[#f59e0b]/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
                // {language === 'en' ? 'SYLLABUS PREVIEW MODE' : 'MODE PRATINJAU SILABUS'}
              </span>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {language === 'en'
                  ? 'You are viewing the public syllabus outline'
                  : 'Anda sedang melihat pratinjau silabus kelas ini'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {language === 'en'
                  ? 'Join this class to unlock Delta JSON modules, video streams, pretest/post-test, attendance QR, and task submissions.'
                  : 'Gabung kelas ini untuk membuka akses penuh materi Delta JSON, video pembelajaran, presensi QR, pretest/post-test, dan pengumpulan tugas.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleJoinFromPreview}
              disabled={joiningClass}
              className="shrink-0 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-5 py-2.5 rounded-lg shadow-md transition flex items-center gap-2 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {joiningClass
                ? language === 'en'
                  ? 'JOINING...'
                  : 'MEMPROSES...'
                : language === 'en'
                  ? 'Join This Class'
                  : 'Gabung Kelas Ini'}
            </button>
          </div>

          {joinFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                joinFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {joinFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{joinFeedback.text}</span>
            </div>
          )}

          <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1b263b] pb-3">
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span>
                  {language === 'en'
                    ? '// READ-ONLY SYLLABUS OUTLINE (16 SESSIONS)'
                    : '// RANGKAIAN SILABUS PERTEMUAN (1–16)'}
                </span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {meetingsList.length} {language === 'en' ? 'SESSIONS' : 'PERTEMUAN'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {meetingsList.map((meet) => (
                <div
                  key={meet.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-[#1b2538] bg-slate-50 dark:bg-[#0b101a] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-xs bg-slate-200 dark:bg-[#1e293d] text-slate-700 dark:text-slate-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {meet.order < 10 ? `0${meet.order}` : meet.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                        {meet.title}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        {meet.date}
                      </p>
                    </div>
                  </div>
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Syllabus Meetings (Active Member / Demo / Educator / Admin) */}
      {!isPreviewMode && activeTab === 'meetings' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
              <span>
                {isEducatorOrAdmin
                  ? language === 'en'
                    ? '// MANAGE CLASS SESSIONS (1–16)'
                    : '// KELOLA PERTEMUAN & SILABUS (1–16)'
                  : language === 'en'
                    ? '// CLASS SESSIONS & SYLLABUS'
                    : '// DAFTAR PERTEMUAN KELAS'}
              </span>
            </h3>
            <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
              {meetingsList.length} {language === 'en' ? 'SESSIONS' : 'PERTEMUAN'}
            </span>
          </div>

          {meetingsFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                meetingsFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {meetingsFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{meetingsFeedback.text}</span>
            </div>
          )}

          <div className="space-y-2.5">
            {meetingsList.map((meet) => {
              const isCurrent = meet.status === 'in_progress';
              const isLockedForStudent = !isEducatorOrAdmin && meet.status === 'locked';
              const isEditingThis = editingMeetingId === meet.id;
              return (
                <div
                  key={meet.id}
                  className={`p-3.5 rounded-lg border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-amber-400 dark:border-[#f59e0b]/50 bg-amber-50/60 dark:bg-[#172133]'
                      : 'border-slate-200 dark:border-[#1b2538] bg-slate-50 dark:bg-[#0b101a]'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-xs flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isCurrent
                          ? 'bg-[#f59e0b] text-black'
                          : 'bg-slate-200 dark:bg-[#1e293d] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {meet.order < 10 ? `0${meet.order}` : meet.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditingThis ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editMeetingTitle}
                            onChange={(e) => setEditMeetingTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded border border-amber-400 bg-white dark:bg-[#070b12] text-slate-900 dark:text-slate-100"
                            placeholder="Judul Pertemuan"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={editMeetingDate}
                              onChange={(e) => setEditMeetingDate(e.target.value)}
                              className="flex-1 min-w-[160px] px-2.5 py-1 text-[11px] font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#070b12] text-slate-800 dark:text-slate-200"
                              placeholder="Jadwal Pertemuan"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveMeetingEdit(meet)}
                              disabled={savingMeetings}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono font-bold px-2.5 py-1 rounded flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              {language === 'en' ? 'Save' : 'Simpan'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMeetingId(null)}
                              className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-mono font-bold px-2.5 py-1 rounded"
                            >
                              {t('dialog_cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                            {meet.title}
                          </h4>
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {language === 'en' ? 'Schedule' : 'Jadwal'}: {meet.date}
                          </p>
                        </>
                      )}

                      {!isEducatorOrAdmin ? (
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
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 font-mono">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-xs border font-bold ${
                              meet.status === 'locked'
                                ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                                : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {meet.status === 'locked'
                              ? language === 'en'
                                ? 'LOCKED FOR STUDENTS'
                                : 'TERKUNCI BAGI MAHASISWA'
                              : language === 'en'
                                ? 'OPEN FOR STUDENTS'
                                : 'TERBUKA BAGI MAHASISWA'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-center font-mono">
                    {isEducatorOrAdmin && !isEditingThis && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleMeetingLock(meet)}
                          disabled={savingMeetings}
                          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xs border transition flex items-center gap-1 ${
                            meet.status === 'locked'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40 hover:bg-emerald-100'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/40 hover:bg-amber-100'
                          }`}
                        >
                          {meet.status === 'locked' ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              {language === 'en' ? 'Open' : 'Buka'}
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              {language === 'en' ? 'Lock' : 'Kunci'}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditMeeting(meet)}
                          className="bg-white dark:bg-[#1c2432] hover:bg-slate-100 dark:hover:bg-[#253245] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[10px] font-bold px-2.5 py-1.5 rounded-xs transition flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          {language === 'en' ? 'Edit' : 'Ubah'}
                        </button>
                      </>
                    )}

                    {isLockedForStudent ? (
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
      {!isPreviewMode && activeTab === 'material' && (
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
      {!isPreviewMode && activeTab === 'video' && (
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
      {!isPreviewMode && activeTab === 'pdf' && (
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

      {/* TAB: Pretest & Post-Test (Student Only, never shown to Lecturer/Admin) */}
      {!isPreviewMode && !isEducatorOrAdmin && activeTab === 'exam' && (
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

      {/* TAB: Task Submissions (Student) */}
      {!isPreviewMode && !isEducatorOrAdmin && activeTab === 'tasks' && (
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase ${
                              isDone
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40'
                            }`}
                          >
                            {isDone ? 'TELAH DIKUMPULKAN ✓' : 'BELUM MENGUMPULKAN'}
                          </span>
                          {typeof task.grade === 'number' && (
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40">
                              NILAI: {task.grade}/100
                            </span>
                          )}
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
                        {task.feedback && (
                          <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 mt-1.5">
                            Catatan Dosen: {task.feedback}
                          </p>
                        )}
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

      {/* INSTRUCTOR / ADMIN TAB: QR Attendance Control & Attendees */}
      {!isPreviewMode && isEducatorOrAdmin && activeTab === 'attendance' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
                <QrCode className="w-4 h-4" />
                <span>
                  {language === 'en'
                    ? '// CLASS ATTENDANCE SESSION & ATTENDEES'
                    : '// SESI PRESENSI QR & DAFTAR HADIR'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Open or close a meeting attendance session and verify live Firestore check-ins.'
                  : 'Buka atau tutup kode sesi presensi pertemuan dan pantau mahasiswa yang telah hadir.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInstructorAttendance()}
              disabled={attLoading}
              className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-xs bg-slate-100 dark:bg-[#1c2432] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-[#253245]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${attLoading ? 'animate-spin' : ''}`} />
              {language === 'en' ? 'Refresh' : 'Muat Ulang'}
            </button>
          </div>

          {attFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                attFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {attFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{attFeedback.text}</span>
            </div>
          )}

          {/* Active Session Banner OR Open Session Form */}
          {attSession?.isOpen ? (
            <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 font-mono">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                  ● {language === 'en' ? 'ATTENDANCE SESSION OPEN' : 'SESI PRESENSI SEDANG AKTIF'} —{' '}
                  {language === 'en' ? 'MEETING' : 'PERTEMUAN'} {attSession.meetingNo}
                </span>
                <div className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 dark:text-white">
                  {attSession.sessionCode}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {language === 'en' ? 'Expires at' : 'Berakhir pada'}:{' '}
                  {attSession.expiresAt
                    ? new Date(attSession.expiresAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '-'}{' '}
                  WIB
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAttendance}
                disabled={attLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold px-4 py-2 rounded-lg shadow-sm transition shrink-0"
              >
                {language === 'en' ? 'CLOSE SESSION' : 'TUTUP SESI PRESENSI'}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleOpenAttendance}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] grid grid-cols-1 sm:grid-cols-4 gap-3 items-end font-mono"
            >
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Meeting (1–16)' : 'Pertemuan (1–16)'}
                </label>
                <select
                  value={attMeetingNo}
                  onChange={(e) => setAttMeetingNo(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                >
                  {meetingsList.map((m) => (
                    <option key={m.id} value={m.order}>
                      Pertemuan {m.order < 10 ? `0${m.order}` : m.order}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Duration (Mins)' : 'Durasi (Menit)'}
                </label>
                <select
                  value={attDurationMins}
                  onChange={(e) => setAttDurationMins(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                >
                  <option value={10}>10 Menit</option>
                  <option value={15}>15 Menit</option>
                  <option value={30}>30 Menit</option>
                  <option value={60}>60 Menit</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Custom Code (Optional)' : 'Kode Kustom (Opsional)'}
                </label>
                <input
                  type="text"
                  value={attCustomCode}
                  onChange={(e) => setAttCustomCode(e.target.value.toUpperCase())}
                  placeholder="Otomatis jika kosong"
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={attLoading}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-4 h-4" />
                {language === 'en' ? 'OPEN QR SESSION' : 'BUKA SESI QR'}
              </button>
            </form>
          )}

          {/* Attendees List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-600 dark:text-[#00e5ff]" />
                {language === 'en' ? 'Checked-In Students' : 'Daftar Mahasiswa Hadir'} ({attendees.length})
              </h4>
              <select
                value={attendeesFilterMeeting}
                onChange={(e) => {
                  const val = e.target.value;
                  setAttendeesFilterMeeting(val);
                  void loadInstructorAttendance(val);
                }}
                className="px-2.5 py-1 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0a0f18] text-slate-800 dark:text-slate-200"
              >
                <option value="">{language === 'en' ? 'All Meetings' : 'Semua Pertemuan'}</option>
                {meetingsList.map((m) => (
                  <option key={m.id} value={m.order}>
                    Pertemuan {m.order}
                  </option>
                ))}
              </select>
            </div>

            {attendees.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs font-mono text-slate-500 dark:text-slate-400">
                {language === 'en'
                  ? 'No attendance records found for this filter.'
                  : 'Belum ada catatan presensi mahasiswa untuk filter ini.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-[#0a0f18] text-slate-500 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-[#232f42]">
                    <tr>
                      <th className="py-2.5 px-3">{language === 'en' ? 'Student' : 'Mahasiswa'}</th>
                      <th className="py-2.5 px-3">{language === 'en' ? 'Meeting' : 'Pertemuan'}</th>
                      <th className="py-2.5 px-3">{language === 'en' ? 'Code' : 'Kode'}</th>
                      <th className="py-2.5 px-3">{language === 'en' ? 'Time' : 'Waktu'}</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1e2a3f]">
                    {attendees.map((att) => (
                      <tr key={att.id}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {att.studentName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                          P{att.meetingNo}
                        </td>
                        <td className="py-2.5 px-3 text-amber-700 dark:text-[#f59e0b]">
                          {att.sessionCode}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                          {att.timestampLabel}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40">
                            {att.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSTRUCTOR / ADMIN TAB: Submissions Grading */}
      {!isPreviewMode && isEducatorOrAdmin && activeTab === 'grading' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                <span>
                  {language === 'en'
                    ? '// CLASS SUBMISSIONS & GRADING'
                    : '// PENILAIAN TUGAS MAHASISWA'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Review student submissions in this class and save 0–100 grades + feedback.'
                  : 'Tinjau pengumpulan tugas mahasiswa pada kelas ini dan simpan nilai (0–100) beserta umpan balik.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadInstructorGrading()}
              disabled={gradingLoading}
              className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-xs bg-slate-100 dark:bg-[#1c2432] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gradingLoading ? 'animate-spin' : ''}`} />
              {language === 'en' ? 'Refresh' : 'Muat Ulang'}
            </button>
          </div>

          {gradingNotice && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                gradingNotice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {gradingNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{gradingNotice.text}</span>
            </div>
          )}

          {gradingLoading ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              Memuat daftar pengumpulan tugas...
            </div>
          ) : classSubmissions.length === 0 ? (
            <div className="py-8 text-center bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs font-mono text-slate-500 dark:text-slate-400">
              {language === 'en'
                ? 'No student submissions recorded in Firestore for this class yet.'
                : 'Belum ada pengumpulan tugas mahasiswa pada kelas ini di Firestore.'}
            </div>
          ) : (
            <div className="space-y-3">
              {classSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#0a0f18] space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {sub.studentName}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs border ${
                            sub.status === 'graded'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/40'
                          }`}
                        >
                          {sub.status === 'graded' ? `DINILAI (${sub.grade})` : 'MENUNGGU NILAI'}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                        {sub.assignment} • {sub.submittedAt}
                      </p>
                      {sub.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Catatan: {sub.notes}
                        </p>
                      )}
                    </div>
                    {sub.fileUrl && (
                      <a
                        href={sub.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono font-bold text-blue-600 dark:text-[#00e5ff] hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {sub.fileName || 'Buka Berkas'}
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center pt-2 border-t border-slate-200 dark:border-[#1b263b] font-mono">
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={gradeInputs[sub.id] ?? ''}
                        onChange={(e) =>
                          setGradeInputs((prev) => ({ ...prev, [sub.id]: e.target.value }))
                        }
                        placeholder="0–100"
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        value={feedbackInputs[sub.id] ?? ''}
                        onChange={(e) =>
                          setFeedbackInputs((prev) => ({ ...prev, [sub.id]: e.target.value }))
                        }
                        placeholder={
                          language === 'en'
                            ? 'Optional feedback for student...'
                            : 'Umpan balik / catatan dosen (opsional)...'
                        }
                        className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveSubmissionGrade(sub)}
                        disabled={gradingId === sub.id}
                        className="w-full sm:w-auto bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3.5 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {gradingId === sub.id
                          ? language === 'en'
                            ? 'Saving...'
                            : 'Menyimpan...'
                          : language === 'en'
                            ? 'Save Grade'
                            : 'Simpan Nilai'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INSTRUCTOR / ADMIN TAB: Server-Fetched Reference Keys & Class Exam Statistics */}
      {!isPreviewMode && isEducatorOrAdmin && activeTab === 'exam_insights' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                <span>
                  {language === 'en'
                    ? '// EVALUATION REFERENCE KEYS & EXAM STATISTICS'
                    : '// KUNCI EVALUASI SERVER & STATISTIK UJIAN KELAS'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Reference keys are retrieved exclusively from /api/grade for authorized instructors/admins.'
                  : 'Kunci jawaban referensi diambil langsung dari server /api/grade khusus Dosen & Admin.'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              {['pretest', 'posttest'].map((et) => (
                <button
                  key={et}
                  type="button"
                  onClick={() => setEvalKeyType(et)}
                  className={`px-3 py-1.5 rounded-xs text-[10px] font-bold uppercase border transition ${
                    evalKeyType === et
                      ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                      : 'bg-slate-100 dark:bg-[#1c2432] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {et}
                </button>
              ))}
            </div>
          </div>

          {evalAnalyticsError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{evalAnalyticsError}</span>
            </div>
          )}

          {/* Class Exam Statistics Summary */}
          {(() => {
            const scoredAttempts = classExamAttempts.filter((a) => typeof a.score === 'number');
            const avgScore =
              scoredAttempts.length > 0
                ? Math.round(
                    scoredAttempts.reduce((acc, a) => acc + a.score, 0) / scoredAttempts.length
                  )
                : 0;
            const passedCount = scoredAttempts.filter((a) => a.score >= 75).length;
            return (
              <div className="grid grid-cols-3 gap-3 font-mono">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f]">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    TOTAL PESERTA UJIAN
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {classExamAttempts.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f]">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    RATA-RATA SKOR
                  </span>
                  <span className="text-lg font-black text-amber-600 dark:text-[#f59e0b]">
                    {avgScore} / 100
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f]">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    LULUS (≥ 75)
                  </span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {passedCount} / {scoredAttempts.length}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Server Reference Answer Keys */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
                {language === 'en' ? 'Reference Answer Key' : 'Kunci Jawaban Referensi'} (
                {evalKeyType.toUpperCase()})
              </h4>
              {instructorKeySource && (
                <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-sky-200 dark:border-[#00e5ff]/30">
                  SOURCE: {instructorKeySource.toUpperCase()}
                </span>
              )}
            </div>

            {evalAnalyticsLoading ? (
              <div className="py-6 text-center text-xs font-mono text-slate-400">
                Memuat kunci evaluasi dari server...
              </div>
            ) : (
              <div className="space-y-2.5">
                {examQuestions.map((q, idx) => {
                  const refOptionIdx = instructorKeyMap?.[q.id];
                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-lg border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#0a0f18] space-y-2"
                    >
                      <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                        [SOAL 0{idx + 1}] {q.question}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {q.options.map((opt, optIdx) => {
                          const isRefAnswer = refOptionIdx === optIdx;
                          return (
                            <div
                              key={optIdx}
                              className={`p-2 rounded text-[11px] font-mono border ${
                                isRefAnswer
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300 font-bold'
                                  : 'bg-white dark:bg-[#121822] border-slate-200 dark:border-[#1e2a3f] text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {isRefAnswer ? '✓ ' : ''}
                              {opt}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Student Exam Attempts List */}
          {classExamAttempts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                {language === 'en' ? 'Recent Class Attempts' : 'Riwayat Evaluasi Mahasiswa'}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-[#0a0f18] text-slate-500 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-[#232f42]">
                    <tr>
                      <th className="py-2 px-3">UID / Mahasiswa</th>
                      <th className="py-2 px-3">Tipe</th>
                      <th className="py-2 px-3">Skor</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1e2a3f]">
                    {classExamAttempts.map((att) => (
                      <tr key={att.id}>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                          {att.uid || att.id}
                        </td>
                        <td className="py-2 px-3 uppercase text-slate-600 dark:text-slate-400">
                          {att.examType || 'pretest'}
                        </td>
                        <td className="py-2 px-3 font-bold text-amber-600 dark:text-[#f59e0b]">
                          {typeof att.score === 'number' ? `${att.score} / 100` : '-'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-xs text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {att.examActive ? 'SEDANG UJIAN' : 'SELESAI'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
