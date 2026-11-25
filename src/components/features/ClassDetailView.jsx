import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import { auth } from '../../firebase';
import { setLocalExamSession } from '../../services/aiService';
import {
  fetchAssignmentsWithUserSubmissions,
  fetchClassExamAttempts,
  fetchClassSubmissionsForGrading,
  fetchInstructorAnswerKey,
  fetchLearningProgressByClass,
  fetchMeetingExam,
  fetchUserClassExamAttempts,
  createAssignmentInFirestore,
  gradeSubmissionInFirestore,
  joinClassWithToken,
  saveMeetingExamByInstructor,
  submitAssignmentToFirestore,
  cancelSubmissionInFirestore,
  updateClassDetailsInFirestore,
  updateClassMeetingsInFirestore,
  upsertLearningProgress,
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
import DiscussionTab from './DiscussionTab';
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
  MessageSquare,
  Plus,
  TrendingUp,
} from 'lucide-react';

function deltaToEditableText(delta) {
  if (!delta || !Array.isArray(delta.ops)) return '';
  const chunks = [];
  let lineBuffer = '';
  for (const op of delta.ops) {
    if (typeof op?.insert !== 'string') continue;
    if (op.insert === '\n') {
      const cleanLine = lineBuffer.trim();
      if (cleanLine) {
        if (op.attributes?.header) {
          chunks.push(`# ${cleanLine}`);
        } else if (op.attributes?.list === 'bullet') {
          chunks.push(`- ${cleanLine}`);
        } else {
          chunks.push(cleanLine);
        }
      }
      lineBuffer = '';
    } else {
      lineBuffer += op.insert;
    }
  }
  if (lineBuffer.trim()) {
    chunks.push(lineBuffer.trim());
  }
  return chunks.join('\n');
}

function plainTextToDelta(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const nonEmpty = lines.some((l) => l.trim().length > 0);
  if (!nonEmpty) return null;

  const ops = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      ops.push({ insert: '\n' });
      continue;
    }
    if (trimmed.startsWith('# ')) {
      ops.push({ insert: trimmed.slice(2).trim(), attributes: { bold: true } });
      ops.push({ insert: '\n', attributes: { header: 2 } });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      ops.push({ insert: trimmed.slice(2).trim() });
      ops.push({ insert: '\n', attributes: { list: 'bullet' } });
    } else {
      ops.push({ insert: `${trimmed}\n` });
    }
  }
  return ops.length > 0 ? { ops } : null;
}

function createEmptyExamQuestion(nextIndex = 1) {
  return {
    id: `q${nextIndex}`,
    question: '',
    options: ['', '', '', ''],
  };
}

function getClassMeetingsList(classData) {
  return Array.isArray(classData?.meetings) ? classData.meetings : [];
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
  const [meetingsList, setMeetingsList] = useState(() => getClassMeetingsList(classData));
  const [selectedMeeting, setSelectedMeeting] = useState(
    () => getClassMeetingsList(classData)[0] || null
  );

  // Syllabus Preview Join State
  const [joiningClass, setJoiningClass] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);

  // Instructor Class Info Edit State
  const [isEditingClassInfo, setIsEditingClassInfo] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editClassDesc, setEditClassDesc] = useState('');
  const [editClassDay, setEditClassDay] = useState('');
  const [editClassTime, setEditClassTime] = useState('');
  const [savingClassInfo, setSavingClassInfo] = useState(false);
  const [classInfoFeedback, setClassInfoFeedback] = useState(null);

  // Instructor Meetings Editor State
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingStatus, setNewMeetingStatus] = useState('open');
  const [deleteMeetingTarget, setDeleteMeetingTarget] = useState(null);
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

  // Instructor Task Creation State
  const [newTaskMeetingNo, setNewTaskMeetingNo] = useState(1);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('2026-12-15T23:59');
  const [newTaskNote, setNewTaskNote] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const [createTaskNotice, setCreateTaskNotice] = useState(null);

  // Instructor Per-Meeting Material, Video & PDF CRUD State
  const [materialEditOpen, setMaterialEditOpen] = useState(false);
  const [materialTextInput, setMaterialTextInput] = useState('');
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialFeedback, setMaterialFeedback] = useState(null);

  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState(null);

  const [pdfUrlInput, setPdfUrlInput] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState(null);

  // Instructor Exam Keys, Questions CRUD & Analytics State
  const [evalKeyType, setEvalKeyType] = useState('pretest');
  const [instructorKeyMap, setInstructorKeyMap] = useState(null);
  const [instructorKeySource, setInstructorKeySource] = useState('');
  const [classExamAttempts, setClassExamAttempts] = useState([]);
  const [evalAnalyticsLoading, setEvalAnalyticsLoading] = useState(false);
  const [evalAnalyticsError, setEvalAnalyticsError] = useState('');
  const [showExamEditor, setShowExamEditor] = useState(false);
  const [examDraftTitle, setExamDraftTitle] = useState('');
  const [examDraftQuestions, setExamDraftQuestions] = useState([]);
  const [examDraftAnswerKey, setExamDraftAnswerKey] = useState({});
  const [savingExam, setSavingExam] = useState(false);
  const [examSaveFeedback, setExamSaveFeedback] = useState(null);

  // Dynamic Per-Meeting Exam Bank & Attempt State
  const [meetingExams, setMeetingExams] = useState({ pretest: null, posttest: null });
  const [meetingExamsLoading, setMeetingExamsLoading] = useState(false);
  const [learningProgressMap, setLearningProgressMap] = useState({});
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressFeedback, setProgressFeedback] = useState(null);
  const [userExamAttempts, setUserExamAttempts] = useState([]);
  const [examActive, setExamActive] = useState(false);
  const [examType, setExamType] = useState('pretest');
  const [examTimer, setExamTimer] = useState(900);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(null);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examError, setExamError] = useState(null);
  const [examNote, setExamNote] = useState('');

  const examEndTimeRef = useRef(null);
  const selectedAnswersRef = useRef({});
  const examTypeRef = useRef('pretest');
  const classIdRef = useRef(classData?.id || '');
  const meetingNoRef = useRef(1);
  const mountedRef = useRef(true);
  const attReqIdRef = useRef(0);
  const gradingReqIdRef = useRef(0);
  const examsReqIdRef = useRef(0);
  const evalReqIdRef = useRef(0);
  const prevClassIdRef = useRef(classData?.id || null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Task Submission State
  const [taskSubmissions, setTaskSubmissions] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskMeetingFilter, setTaskMeetingFilter] = useState('all');
  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [externalUrlInput, setExternalUrlInput] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState(null);
  const [withdrawConfirmTaskId, setWithdrawConfirmTaskId] = useState(null);

  const currentMeetingNo = Number(selectedMeeting?.order || 1);

  useEffect(() => {
    meetingNoRef.current = currentMeetingNo;
  }, [currentMeetingNo]);

  useEffect(() => {
    const nextClassId = classData?.id || '';
    const switchedClass = prevClassIdRef.current !== null && prevClassIdRef.current !== nextClassId;
    prevClassIdRef.current = nextClassId;
    classIdRef.current = nextClassId;
    const nextMeetings = getClassMeetingsList(classData);
    setMeetingsList(nextMeetings);
    if (switchedClass) {
      setActiveTab('meetings');
      setProgressFeedback(null);
      setExamActive(false);
      setExamFinished(false);
      setExamScore(null);
      setExamError(null);
      setExamNote('');
      setSelectedAnswers({});
      setTaskFeedback(null);
      setCreateTaskNotice(null);
      setAttFeedback(null);
      setGradingNotice(null);
      setEditingMeetingId(null);
      setExamSaveFeedback(null);
      setMaterialFeedback(null);
      setVideoFeedback(null);
      setPdfFeedback(null);
      setSelectedMeeting(nextMeetings[0] || null);
      return;
    }
    setSelectedMeeting((prev) => {
      if (prev && nextMeetings.some((m) => m.id === prev.id)) {
        return nextMeetings.find((m) => m.id === prev.id) || nextMeetings[0] || null;
      }
      return nextMeetings[0] || null;
    });
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

  const extrasReqIdRef = useRef(0);

  useEffect(() => {
    const reqId = ++extrasReqIdRef.current;
    const targetClassId = classData?.id || '';
    const loadClassExtras = async () => {
      setTasksLoading(true);
      try {
        if (currentUser && targetClassId) {
          const [taskRes, attempts, progressList] = await Promise.all([
            fetchAssignmentsWithUserSubmissions({ classId: targetClassId }),
            fetchUserClassExamAttempts(targetClassId, currentUser.uid),
            fetchLearningProgressByClass(targetClassId, currentUser.uid),
          ]);
          if (
            !mountedRef.current ||
            reqId !== extrasReqIdRef.current ||
            classIdRef.current !== targetClassId
          ) {
            return;
          }
          setTaskSubmissions(taskRes.assignments || []);
          setUserExamAttempts(attempts || []);
          const nextMap = {};
          (progressList || []).forEach((item) => {
            const mNo = Number(item.meetingNo || 1);
            nextMap[mNo] = {
              materialCompleted: Boolean(item.materialCompleted),
              videoCompleted: Boolean(item.videoCompleted),
            };
          });
          setLearningProgressMap(nextMap);
        } else {
          if (!mountedRef.current || reqId !== extrasReqIdRef.current) return;
          setTaskSubmissions([]);
          setUserExamAttempts([]);
          setLearningProgressMap({});
        }
      } finally {
        if (mountedRef.current && reqId === extrasReqIdRef.current) setTasksLoading(false);
      }
    };

    void loadClassExtras();
  }, [classData?.id, classData?.name, currentUser]);

  const loadInstructorAttendance = useCallback(
    async (meetingFilter = attendeesFilterMeeting) => {
      if (!classData?.id) return;
      const reqId = ++attReqIdRef.current;
      const targetClassId = classData.id;
      setAttLoading(true);
      try {
        const [sess, list] = await Promise.all([
          getClassAttendanceSession(targetClassId),
          fetchMeetingAttendees(targetClassId, meetingFilter ? Number(meetingFilter) : null),
        ]);
        if (!mountedRef.current || reqId !== attReqIdRef.current || classIdRef.current !== targetClassId) {
          return;
        }
        setAttSession(sess);
        setAttendees(list);
      } finally {
        if (mountedRef.current && reqId === attReqIdRef.current) {
          setAttLoading(false);
        }
      }
    },
    [classData?.id, attendeesFilterMeeting]
  );

  const loadInstructorGrading = useCallback(async () => {
    if (!classData?.id) return;
    const reqId = ++gradingReqIdRef.current;
    const targetClassId = classData.id;
    setGradingLoading(true);
    try {
      const subs = await fetchClassSubmissionsForGrading(targetClassId);
      if (!mountedRef.current || reqId !== gradingReqIdRef.current || classIdRef.current !== targetClassId) {
        return;
      }
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
      if (mountedRef.current && reqId === gradingReqIdRef.current) {
        setGradingLoading(false);
      }
    }
  }, [classData?.id]);

  const loadMeetingExams = useCallback(async (targetClassId, targetMeetingNo) => {
    if (!targetClassId || !targetMeetingNo) {
      setMeetingExams({ pretest: null, posttest: null });
      return { pretest: null, posttest: null };
    }
    const reqId = ++examsReqIdRef.current;
    setMeetingExamsLoading(true);
    try {
      const [preRes, postRes] = await Promise.all([
        fetchMeetingExam({ classId: targetClassId, meetingNo: targetMeetingNo, examType: 'pretest' }),
        fetchMeetingExam({ classId: targetClassId, meetingNo: targetMeetingNo, examType: 'posttest' }),
      ]);
      const nextExams = {
        pretest: preRes?.isConfigured ? preRes.exam : null,
        posttest: postRes?.isConfigured ? postRes.exam : null,
      };
      if (
        mountedRef.current &&
        reqId === examsReqIdRef.current &&
        classIdRef.current === targetClassId
      ) {
        setMeetingExams(nextExams);
      }
      return nextExams;
    } catch {
      if (mountedRef.current && reqId === examsReqIdRef.current) {
        setMeetingExams({ pretest: null, posttest: null });
      }
      return { pretest: null, posttest: null };
    } finally {
      if (mountedRef.current && reqId === examsReqIdRef.current) {
        setMeetingExamsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!classData?.id || meetingsList.length === 0) {
      setMeetingExams({ pretest: null, posttest: null });
      return;
    }
    void loadMeetingExams(classData.id, currentMeetingNo);
  }, [classData?.id, currentMeetingNo, currentUser, meetingsList.length, loadMeetingExams]);

  useEffect(() => {
    setMaterialTextInput(deltaToEditableText(selectedMeeting?.deltaContent));
    setMaterialEditOpen(false);
    setMaterialFeedback(null);
    setVideoUrlInput(selectedMeeting?.videoUrl ?? '');
    setVideoFeedback(null);
    setPdfUrlInput(selectedMeeting?.pdfUrl ?? '');
    setPdfFeedback(null);
  }, [selectedMeeting?.id, selectedMeeting?.deltaContent, selectedMeeting?.videoUrl, selectedMeeting?.pdfUrl]);

  const loadInstructorEvalAnalytics = useCallback(
    async (targetExamType = evalKeyType, targetMeetingNo = currentMeetingNo) => {
      if (!classData?.id) return;
      const reqId = ++evalReqIdRef.current;
      const targetClassId = classData.id;
      setEvalAnalyticsLoading(true);
      setEvalAnalyticsError('');
      try {
        const [keyRes, examRes, attempts] = await Promise.all([
          fetchInstructorAnswerKey({
            classId: targetClassId,
            meetingNo: targetMeetingNo,
            examType: targetExamType,
          }),
          fetchMeetingExam({
            classId: targetClassId,
            meetingNo: targetMeetingNo,
            examType: targetExamType,
          }),
          fetchClassExamAttempts(targetClassId),
        ]);
        if (!mountedRef.current || reqId !== evalReqIdRef.current || classIdRef.current !== targetClassId) {
          return;
        }
        const loadedKeyMap = keyRes.answerKey || {};
        const loadedExam = examRes?.isConfigured ? examRes.exam : null;
        setInstructorKeyMap(loadedKeyMap);
        setInstructorKeySource(keyRes.source || 'server');
        setMeetingExams((prev) => ({
          ...prev,
          [targetExamType]: loadedExam,
        }));
        setClassExamAttempts(attempts || []);

        const existingQuestions = Array.isArray(loadedExam?.questions) ? loadedExam.questions : [];
        if (existingQuestions.length > 0) {
          setExamDraftTitle(
            loadedExam.title ||
              `${targetExamType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${targetMeetingNo}`
          );
          setExamDraftQuestions(
            existingQuestions.map((q) => ({
              id: q.id,
              question: q.question || '',
              options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
            }))
          );
          setExamDraftAnswerKey({ ...loadedKeyMap });
        } else {
          setExamDraftTitle(
            `${targetExamType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${targetMeetingNo}`
          );
          setExamDraftQuestions([createEmptyExamQuestion(1)]);
          setExamDraftAnswerKey({ q1: 0 });
        }
      } catch (err) {
        if (mountedRef.current && reqId === evalReqIdRef.current) {
          setEvalAnalyticsError(err.message || 'Gagal memuat kunci evaluasi dan statistik kelas.');
        }
      } finally {
        if (mountedRef.current && reqId === evalReqIdRef.current) {
          setEvalAnalyticsLoading(false);
        }
      }
    },
    [classData?.id, evalKeyType, currentMeetingNo]
  );

  useEffect(() => {
    if (!isEducatorOrAdmin) return;
    if (activeTab === 'attendance') {
      void loadInstructorAttendance();
    } else if (activeTab === 'grading') {
      void loadInstructorGrading();
    } else if (activeTab === 'exam_insights') {
      void loadInstructorEvalAnalytics(evalKeyType, currentMeetingNo);
    }
  }, [
    isEducatorOrAdmin,
    activeTab,
    evalKeyType,
    currentMeetingNo,
    loadInstructorAttendance,
    loadInstructorGrading,
    loadInstructorEvalAnalytics,
  ]);

  const activeStudentExam = meetingExams[examType] || null;
  const activeInstructorExam = meetingExams[evalKeyType] || null;
  const examQuestions = Array.isArray(activeStudentExam?.questions)
    ? activeStudentExam.questions
    : [];
  const instructorExamQuestions = Array.isArray(activeInstructorExam?.questions)
    ? activeInstructorExam.questions
    : [];

  const getMeetingCycleStatus = useCallback(
    (mNo) => {
      const targetNo = Number(mNo || 1);
      const progress = learningProgressMap[targetNo] || {
        materialCompleted: false,
        videoCompleted: false,
      };
      const pretestAttempt =
        userExamAttempts.find(
          (a) =>
            Number(a.meetingNo || 1) === targetNo &&
            a.examType === 'pretest' &&
            (a.status === 'submitted' || typeof a.score === 'number')
        ) || null;
      const posttestAttempt =
        userExamAttempts.find(
          (a) =>
            Number(a.meetingNo || 1) === targetNo &&
            a.examType === 'posttest' &&
            (a.status === 'submitted' || typeof a.score === 'number')
        ) || null;
      const meetingTasks = taskSubmissions.filter(
        (task) => Number(task.meetingNo || 1) === targetNo
      );
      const hasTasks = meetingTasks.length > 0;
      const tasksCompletedCount = meetingTasks.filter((t) => t.status === 'submitted').length;
      const tasksAllDone = hasTasks && tasksCompletedCount === meetingTasks.length;

      const pretestDone = Boolean(pretestAttempt);
      const posttestDone = Boolean(posttestAttempt);
      const materialDone = Boolean(progress.materialCompleted);
      const videoDone = Boolean(progress.videoCompleted);
      const canStartPosttest = pretestDone && materialDone && videoDone;
      const gainDelta =
        pretestDone &&
        posttestDone &&
        typeof pretestAttempt?.score === 'number' &&
        typeof posttestAttempt?.score === 'number'
          ? posttestAttempt.score - pretestAttempt.score
          : null;

      return {
        meetingNo: targetNo,
        materialDone,
        videoDone,
        pretestDone,
        posttestDone,
        pretestAttempt,
        posttestAttempt,
        hasTasks,
        meetingTasks,
        tasksCompletedCount,
        tasksAllDone,
        canStartPosttest,
        gainDelta,
      };
    },
    [learningProgressMap, taskSubmissions, userExamAttempts]
  );

  const activeCycle = getMeetingCycleStatus(currentMeetingNo);

  const upsertLocalAttempt = (attemptObj) => {
    setUserExamAttempts((prev) => {
      const filtered = prev.filter(
        (a) =>
          !(
            Number(a.meetingNo || 1) === Number(attemptObj.meetingNo || 1) &&
            a.examType === attemptObj.examType
          )
      );
      return [attemptObj, ...filtered];
    });
  };

  const handleMarkProgress = async (field) => {
    if (isEducatorOrAdmin || progressSaving || !classData?.id) return;
    const targetNo = currentMeetingNo;
    const targetClassId = classData.id;
    setProgressSaving(true);
    setProgressFeedback(null);

    setLearningProgressMap((prev) => ({
      ...prev,
      [targetNo]: {
        materialCompleted: Boolean(prev[targetNo]?.materialCompleted),
        videoCompleted: Boolean(prev[targetNo]?.videoCompleted),
        [field]: true,
      },
    }));

    try {
      if (currentUser) {
        await upsertLearningProgress({
          classId: targetClassId,
          meetingNo: targetNo,
          [field]: true,
        });
      }
      setProgressFeedback({
        type: 'success',
        text:
          field === 'materialCompleted'
            ? language === 'en'
              ? `Meeting ${targetNo} reading material marked completed.`
              : `Materi Pertemuan ${targetNo} berhasil ditandai selesai.`
            : language === 'en'
            ? `Meeting ${targetNo} video marked completed.`
            : `Video Pertemuan ${targetNo} berhasil ditandai selesai.`,
      });
    } catch (err) {
      setProgressFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan progres belajar ke Firestore.',
      });
    } finally {
      setProgressSaving(false);
    }
  };

  const submitExamToServer = async (answersToGrade, typeToGrade) => {
    examEndTimeRef.current = null;
    const targetClassId = classIdRef.current;
    const targetMeetingNo = meetingNoRef.current || 1;

    if (!auth?.currentUser) {
      setLocalExamSession({
        classId: targetClassId,
        meetingNo: targetMeetingNo,
        examType: typeToGrade,
        active: false,
      });
      setExamError(
        language === 'en'
          ? 'Sign in with Firebase to submit assessments to /api/grade.'
          : 'Masuk dengan akun Firebase untuk menyerahkan lembar evaluasi ke server /api/grade.'
      );
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
          meetingNo: targetMeetingNo,
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
        setLocalExamSession({
          classId: targetClassId,
          meetingNo: targetMeetingNo,
          examType: typeToGrade,
          active: false,
        });
        setExamScore(data.score);
        upsertLocalAttempt({
          ...data,
          meetingNo: data.meetingNo || targetMeetingNo,
          examType: data.examType || typeToGrade,
        });
        setExamFinished(true);
        setExamActive(false);
        return;
      }

      throw new Error(
        language === 'en'
          ? 'Server assessment endpoint /api/grade is unavailable in this environment.'
          : 'Endpoint evaluasi server /api/grade tidak aktif di lingkungan ini.'
      );
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
    const cycle = getMeetingCycleStatus(currentMeetingNo);
    const targetExam = meetingExams[type];
    if (!targetExam || !Array.isArray(targetExam.questions) || targetExam.questions.length === 0) {
      setExamError(
        language === 'en'
          ? 'This assessment has not been configured by the lecturer yet.'
          : 'Evaluasi untuk pertemuan ini belum dibuat oleh dosen.'
      );
      return;
    }

    if (type === 'pretest' && cycle.pretestDone) {
      setExamError(
        language === 'en'
          ? 'Pretest for this meeting is already completed and locked as your diagnostic baseline.'
          : 'Pretest pertemuan ini sudah selesai dan dikunci sebagai skor baseline.'
      );
      return;
    }
    if (type === 'posttest' && !cycle.canStartPosttest) {
      setExamError(
        language === 'en'
          ? 'Complete Pretest, Reading Material, and Video for this meeting to unlock Posttest.'
          : 'Selesaikan Pretest, Materi, dan Video pertemuan ini untuk membuka Post-test.'
      );
      return;
    }
    if (!auth?.currentUser) {
      setExamError(
        language === 'en'
          ? 'Sign in with Firebase to start a verified exam session.'
          : 'Masuk dengan akun Firebase untuk memulai sesi ujian.'
      );
      return;
    }

    const targetClassId = classData?.id || '';
    const targetMeetingNo = currentMeetingNo;
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
          action: 'start',
          classId: targetClassId,
          meetingNo: targetMeetingNo,
          examType: type,
        }),
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (isJson && !res.ok) {
        const errData = await res.json().catch(() => ({}));
        setExamError(errData.error || 'Gagal memulai sesi evaluasi di server.');
        return;
      }
      if (!isJson) {
        setExamError(
          language === 'en'
            ? 'Server assessment endpoint /api/grade is unavailable in this environment.'
            : 'Endpoint evaluasi server /api/grade tidak aktif di lingkungan ini.'
        );
        return;
      }
    } catch (err) {
      setExamError(err.message || 'Gagal memulai sesi evaluasi di server.');
      return;
    }

    meetingNoRef.current = targetMeetingNo;
    examEndTimeRef.current = Date.now() + 900 * 1000;
    selectedAnswersRef.current = {};
    examTypeRef.current = type;

    setExamType(type);
    setExamActive(true);
    setExamTimer(900);
    setExamFinished(false);
    setExamScore(null);
    setSelectedAnswers({});
    setActiveTab('exam');

    setLocalExamSession({
      classId: targetClassId,
      meetingNo: targetMeetingNo,
      examType: type,
      active: true,
      durationMs: 900 * 1000,
    });
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

  const activeMeetingVideoUrl =
    selectedMeeting?.videoUrl !== undefined ? selectedMeeting.videoUrl : classData?.videoUrl || '';
  const activeMeetingPdfUrl =
    selectedMeeting?.pdfUrl !== undefined ? selectedMeeting.pdfUrl : classData?.pdfUrl || '';
  const safePdfUrl = getSafePdfUrl(activeMeetingPdfUrl);
  const videoSource = resolveSafeVideoSource(activeMeetingVideoUrl);

  const saveMeetingContentPatch = async (targetMeeting, patch) => {
    const nextMeetings = meetingsList.map((m) =>
      m.id === targetMeeting.id ? { ...m, ...patch } : m
    );
    const result = await updateClassMeetingsInFirestore(classData.id, nextMeetings);
    const savedMeetings = result.meetings || nextMeetings;
    setMeetingsList(savedMeetings);
    const updatedSelected = savedMeetings.find((m) => m.id === targetMeeting.id) || null;
    if (selectedMeeting?.id === targetMeeting.id && updatedSelected) {
      setSelectedMeeting(updatedSelected);
    }
    onClassUpdated?.({
      ...classData,
      meetings: savedMeetings,
      meetingsCount: result.meetingsCount ?? savedMeetings.length,
      materialsCount: result.materialsCount,
    });
    return result;
  };

  const handleSaveMeetingDelta = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || !selectedMeeting || savingMaterial || !classData?.id) return;
    const nextDelta = plainTextToDelta(materialTextInput);
    if (!nextDelta) {
      setMaterialFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Material text cannot be empty. Use Clear Material to remove.'
            : 'Teks materi tidak boleh kosong. Gunakan Hapus Materi untuk mengosongkan.',
      });
      return;
    }

    setSavingMaterial(true);
    setMaterialFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, { deltaContent: nextDelta });
      setMaterialEditOpen(false);
      setMaterialFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Reading material for Meeting ${selectedMeeting.order} saved.`
            : `Materi bacaan Pertemuan ${selectedMeeting.order} berhasil disimpan.`,
      });
    } catch (err) {
      setMaterialFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan materi pertemuan.',
      });
    } finally {
      setSavingMaterial(false);
    }
  };

  const handleClearMeetingDelta = async () => {
    if (!isEducatorOrAdmin || !selectedMeeting || savingMaterial || !classData?.id) return;
    setSavingMaterial(true);
    setMaterialFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, { deltaContent: null });
      setMaterialTextInput('');
      setMaterialEditOpen(false);
      setMaterialFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Reading material for Meeting ${selectedMeeting.order} cleared.`
            : `Materi bacaan Pertemuan ${selectedMeeting.order} telah dihapus.`,
      });
    } catch (err) {
      setMaterialFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus materi pertemuan.',
      });
    } finally {
      setSavingMaterial(false);
    }
  };

  const handleSaveMeetingVideo = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || !selectedMeeting || savingVideo || !classData?.id) return;
    const trimmed = videoUrlInput.trim();
    if (!trimmed) {
      setVideoFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Enter a valid https:// video URL or click Clear Video.'
            : 'Masukkan tautan video https:// yang valid atau klik Hapus Video.',
      });
      return;
    }
    if (!isValidExternalUrl(trimmed) || !resolveSafeVideoSource(trimmed)) {
      setVideoFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Invalid video URL. Only https:// or http:// URLs are allowed.'
            : 'URL video tidak valid. Hanya tautan https:// atau http:// yang diperbolehkan.',
      });
      return;
    }

    setSavingVideo(true);
    setVideoFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, {
        videoUrl: trimmed,
        hasVideo: true,
      });
      setVideoFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Video URL saved for Meeting ${selectedMeeting.order}.`
            : `Tautan video Pertemuan ${selectedMeeting.order} berhasil disimpan.`,
      });
    } catch (err) {
      setVideoFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan URL video pertemuan.',
      });
    } finally {
      setSavingVideo(false);
    }
  };

  const handleClearMeetingVideo = async () => {
    if (!isEducatorOrAdmin || !selectedMeeting || savingVideo || !classData?.id) return;
    setSavingVideo(true);
    setVideoFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, {
        videoUrl: '',
        hasVideo: false,
      });
      setVideoUrlInput('');
      setVideoFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Video removed from Meeting ${selectedMeeting.order}.`
            : `Video Pertemuan ${selectedMeeting.order} berhasil dihapus.`,
      });
    } catch (err) {
      setVideoFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus video pertemuan.',
      });
    } finally {
      setSavingVideo(false);
    }
  };

  const handleSaveMeetingPdf = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || !selectedMeeting || savingPdf || !classData?.id) return;
    const trimmed = pdfUrlInput.trim();
    if (!trimmed) {
      setPdfFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Enter a valid https:// PDF URL or upload a PDF document.'
            : 'Masukkan tautan PDF https:// atau unggah dokumen PDF terlebih dahulu.',
      });
      return;
    }
    if (!isValidExternalUrl(trimmed)) {
      setPdfFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Invalid PDF URL. Only https:// or http:// URLs are allowed.'
            : 'URL PDF tidak valid. Hanya tautan https:// atau http:// yang diperbolehkan.',
      });
      return;
    }

    setSavingPdf(true);
    setPdfFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, {
        pdfUrl: trimmed,
        hasPdf: true,
      });
      setPdfFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `PDF module saved for Meeting ${selectedMeeting.order}.`
            : `Modul PDF Pertemuan ${selectedMeeting.order} berhasil disimpan.`,
      });
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan URL PDF pertemuan.',
      });
    } finally {
      setSavingPdf(false);
    }
  };

  const handleUploadMeetingPdfFile = async (file) => {
    if (!file || !isEducatorOrAdmin || !selectedMeeting || pdfUploading || savingPdf || !classData?.id) {
      return;
    }
    setPdfUploading(true);
    setPdfFeedback(null);
    try {
      const uploadResult = await uploadMediaFile(file, 'document');
      if (uploadResult.isLive && uploadResult.url && isValidExternalUrl(uploadResult.url)) {
        setPdfUrlInput(uploadResult.url);
        await saveMeetingContentPatch(selectedMeeting, {
          pdfUrl: uploadResult.url,
          hasPdf: true,
        });
        setPdfFeedback({
          type: 'success',
          text:
            language === 'en'
              ? `PDF "${file.name}" uploaded and saved to Meeting ${selectedMeeting.order}.`
              : `PDF "${file.name}" berhasil diunggah dan disimpan ke Pertemuan ${selectedMeeting.order}.`,
        });
      } else {
        setPdfFeedback({
          type: 'error',
          text:
            uploadResult.note ||
            (language === 'en'
              ? 'Cloudinary upload is not active. Paste a valid https:// PDF URL below.'
              : 'Unggah Cloudinary tidak aktif; silakan tempel tautan PDF https:// di kolom URL.'),
        });
      }
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        text: err.message || 'Gagal mengunggah berkas PDF.',
      });
    } finally {
      setPdfUploading(false);
    }
  };

  const handleClearMeetingPdf = async () => {
    if (!isEducatorOrAdmin || !selectedMeeting || savingPdf || !classData?.id) return;
    setSavingPdf(true);
    setPdfFeedback(null);
    try {
      await saveMeetingContentPatch(selectedMeeting, {
        pdfUrl: '',
        hasPdf: false,
      });
      setPdfUrlInput('');
      setPdfFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `PDF module removed from Meeting ${selectedMeeting.order}.`
            : `Dokumen PDF Pertemuan ${selectedMeeting.order} telah dihapus.`,
      });
    } catch (err) {
      setPdfFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus dokumen PDF.',
      });
    } finally {
      setSavingPdf(false);
    }
  };

  const handleAddDraftQuestion = () => {
    setExamDraftQuestions((prev) => {
      const usedNums = prev.map((q) => Number(String(q.id || '').replace(/\D+/g, '')) || 0);
      const nextNum = (usedNums.length > 0 ? Math.max(...usedNums) : prev.length) + 1;
      const newQ = createEmptyExamQuestion(nextNum);
      setExamDraftAnswerKey((prevKey) => ({ ...prevKey, [newQ.id]: 0 }));
      return [...prev, newQ];
    });
  };

  const handleRemoveDraftQuestion = (qId) => {
    setExamDraftQuestions((prev) => prev.filter((q) => q.id !== qId));
    setExamDraftAnswerKey((prev) => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
  };

  const handleUpdateDraftQuestionText = (qId, text) => {
    setExamDraftQuestions((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, question: text } : q))
    );
  };

  const handleUpdateDraftOption = (qId, optIdx, value) => {
    setExamDraftQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const nextOpts = [...(q.options || ['', '', '', ''])];
        nextOpts[optIdx] = value;
        return { ...q, options: nextOpts };
      })
    );
  };

  const handleUpdateDraftAnswerKey = (qId, optionIdx) => {
    setExamDraftAnswerKey((prev) => ({
      ...prev,
      [qId]: Number(optionIdx),
    }));
  };

  const handleSaveMeetingExam = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingExam || !classData?.id || !selectedMeeting) return;

    const cleanQuestions = examDraftQuestions.map((q) => ({
      id: String(q.id || '').trim(),
      question: String(q.question || '').trim(),
      options: (Array.isArray(q.options) ? q.options : []).map((opt) => String(opt || '').trim()),
    }));

    if (cleanQuestions.length === 0) {
      setExamSaveFeedback({
        type: 'error',
        text: language === 'en' ? 'Add at least 1 question.' : 'Tambahkan minimal 1 soal evaluasi.',
      });
      return;
    }

    for (let i = 0; i < cleanQuestions.length; i += 1) {
      const q = cleanQuestions[i];
      if (!q.question || q.options.length < 2 || q.options.some((opt) => !opt)) {
        setExamSaveFeedback({
          type: 'error',
          text:
            language === 'en'
              ? `Question ${i + 1} requires question text and all non-empty options.`
              : `Soal ${i + 1} wajib memiliki teks pertanyaan dan seluruh opsi terisi.`,
        });
        return;
      }
      const selectedIdx = Number(examDraftAnswerKey?.[q.id]);
      if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= q.options.length) {
        setExamSaveFeedback({
          type: 'error',
          text:
            language === 'en'
              ? `Select a valid reference answer for Question ${i + 1}.`
              : `Pilih kunci jawaban referensi yang valid untuk Soal ${i + 1}.`,
        });
        return;
      }
    }

    const cleanAnswerKey = {};
    cleanQuestions.forEach((q) => {
      cleanAnswerKey[q.id] = Number(examDraftAnswerKey[q.id]);
    });

    setSavingExam(true);
    setExamSaveFeedback(null);
    try {
      await saveMeetingExamByInstructor({
        classId: classData.id,
        meetingNo: currentMeetingNo,
        examType: evalKeyType,
        title: examDraftTitle.trim(),
        questions: cleanQuestions,
        answerKey: cleanAnswerKey,
      });
      setShowExamEditor(false);
      await loadInstructorEvalAnalytics(evalKeyType, currentMeetingNo);
      setExamSaveFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `${evalKeyType.toUpperCase()} for Meeting ${currentMeetingNo} saved securely to server.`
            : `Soal & kunci ${evalKeyType.toUpperCase()} Pertemuan ${currentMeetingNo} berhasil disimpan ke server.`,
      });
    } catch (err) {
      setExamSaveFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan soal dan kunci evaluasi ke server.',
      });
    } finally {
      setSavingExam(false);
    }
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
          meetingNo: Number(activeTaskModal.meetingNo || currentMeetingNo || 1),
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

  const effectiveAttMeetingNo =
    meetingsList.length > 0
      ? meetingsList.some((m) => Number(m.order) === Number(attMeetingNo))
        ? Number(attMeetingNo)
        : Number(meetingsList[0].order)
      : Number(attMeetingNo || 1);

  const effectiveNewTaskMeetingNo =
    meetingsList.length > 0
      ? meetingsList.some((m) => Number(m.order) === Number(newTaskMeetingNo))
        ? Number(newTaskMeetingNo)
        : Number(meetingsList[0].order)
      : Number(newTaskMeetingNo || 1);

  const handleCreateMeetingTask = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || creatingTask) return;
    if (!newTaskTitle.trim()) {
      setCreateTaskNotice({
        type: 'error',
        text: language === 'en' ? 'Task title is required.' : 'Judul tugas wajib diisi.',
      });
      return;
    }

    if (!classData?.id) return;
    setCreatingTask(true);
    setCreateTaskNotice(null);
    try {
      const created = await createAssignmentInFirestore({
        classId: classData.id,
        meetingNo: effectiveNewTaskMeetingNo,
        title: newTaskTitle.trim(),
        subject: classData?.name || classData?.title || 'Mata Kuliah Smartsa',
        subjectCode: classData?.code || 'CLS',
        deadline: newTaskDeadline,
        note: newTaskNote.trim(),
      });
      setTaskSubmissions((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskNote('');
      setCreateTaskNotice({
        type: 'success',
        text:
          language === 'en'
            ? `Task "${created.title}" published for Meeting ${created.meetingNo}.`
            : `Tugas "${created.title}" berhasil diterbitkan untuk Pertemuan ${created.meetingNo}.`,
      });
    } catch (err) {
      setCreateTaskNotice({
        type: 'error',
        text: err.message || 'Gagal menerbitkan tugas pertemuan.',
      });
    } finally {
      setCreatingTask(false);
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

  const handleStartEditClassInfo = () => {
    setEditClassName(classData?.name || classData?.title || '');
    setEditClassDesc(classData?.description || '');
    setEditClassDay(classData?.day || '');
    setEditClassTime(classData?.time || '');
    setClassInfoFeedback(null);
    setIsEditingClassInfo(true);
  };

  const handleSaveClassInfo = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingClassInfo || !classData?.id) return;
    const cleanName = editClassName.trim();
    if (!cleanName) {
      setClassInfoFeedback({
        type: 'error',
        text: language === 'en' ? 'Class name cannot be empty.' : 'Nama kelas tidak boleh kosong.',
      });
      return;
    }

    setSavingClassInfo(true);
    setClassInfoFeedback(null);
    try {
      const updated = await updateClassDetailsInFirestore(classData.id, {
        name: cleanName,
        description: editClassDesc.trim(),
        day: editClassDay,
        time: editClassTime.trim(),
      });
      onClassUpdated?.({
        ...classData,
        name: updated.name || cleanName,
        title: updated.title || cleanName,
        description: typeof updated.description === 'string' ? updated.description : editClassDesc.trim(),
        day: typeof updated.day === 'string' ? updated.day : editClassDay,
        time: typeof updated.time === 'string' ? updated.time : editClassTime.trim(),
      });
      setIsEditingClassInfo(false);
      setClassInfoFeedback({
        type: 'success',
        text:
          language === 'en'
            ? 'Class information saved to Firestore.'
            : 'Informasi kelas berhasil diperbarui di Firestore.',
      });
    } catch (err) {
      setClassInfoFeedback({
        type: 'error',
        text: err.message || 'Gagal memperbarui informasi kelas.',
      });
    } finally {
      setSavingClassInfo(false);
    }
  };

  const handleAddMeeting = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingMeetings || !classData?.id) return;
    const cleanTitle = newMeetingTitle.trim();
    if (!cleanTitle) {
      setMeetingsFeedback({
        type: 'error',
        text: language === 'en' ? 'Meeting title is required.' : 'Judul pertemuan wajib diisi.',
      });
      return;
    }

    // Stabilitas meetingNo: selalu max(order) + 1 agar tidak bentrok dengan dokumen _m{order}_
    const maxOrder = meetingsList.reduce(
      (max, m) => Math.max(max, Number(m.order || 0)),
      0
    );
    const nextOrder = maxOrder + 1;
    const defaultSchedule = [classData?.day, classData?.time].filter(Boolean).join(', ');
    const newMeeting = {
      id: `${classData.id}_m${nextOrder}`,
      order: nextOrder,
      title: cleanTitle,
      date:
        newMeetingDate.trim() ||
        defaultSchedule ||
        (language === 'en' ? 'Schedule not set' : 'Jadwal belum diatur'),
      status: newMeetingStatus === 'locked' ? 'locked' : 'open',
      hasVideo: false,
      hasPdf: false,
    };

    const nextMeetings = [...meetingsList, newMeeting];
    const previousMeetings = meetingsList;
    setMeetingsList(nextMeetings);
    if (!selectedMeeting) {
      setSelectedMeeting(newMeeting);
    }
    setSavingMeetings(true);
    setMeetingsFeedback(null);
    try {
      await updateClassMeetingsInFirestore(classData.id, nextMeetings);
      onClassUpdated?.({
        ...classData,
        meetings: nextMeetings,
        meetingsCount: nextMeetings.length,
      });
      setNewMeetingTitle('');
      setNewMeetingDate('');
      setNewMeetingStatus('open');
      setMeetingsFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Meeting ${nextOrder} added (Total: ${nextMeetings.length}).`
            : `Pertemuan ${nextOrder} berhasil ditambahkan (Total: ${nextMeetings.length}).`,
      });
    } catch (err) {
      setMeetingsList(previousMeetings);
      setMeetingsFeedback({
        type: 'error',
        text: err.message || 'Gagal menambahkan pertemuan baru.',
      });
    } finally {
      setSavingMeetings(false);
    }
  };

  const executeDeleteMeeting = async (targetMeeting) => {
    if (!isEducatorOrAdmin || !targetMeeting || savingMeetings || !classData?.id) return;
    // Pertahankan nomor urut pertemuan tersisa (TANPA re-numbering) agar ID dokumen _m{order}_ tetap utuh
    const nextMeetings = meetingsList.filter((m) => m.id !== targetMeeting.id);
    const previousMeetings = meetingsList;
    setMeetingsList(nextMeetings);
    if (selectedMeeting?.id === targetMeeting.id) {
      setSelectedMeeting(nextMeetings[0] || null);
    }
    setSavingMeetings(true);
    setMeetingsFeedback(null);
    try {
      await updateClassMeetingsInFirestore(classData.id, nextMeetings);
      onClassUpdated?.({
        ...classData,
        meetings: nextMeetings,
        meetingsCount: nextMeetings.length,
      });
      setMeetingsFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Meeting ${targetMeeting.order} deleted. Remaining meeting numbers preserved.`
            : `Pertemuan ${targetMeeting.order} dihapus. Nomor urut pertemuan tersisa tetap dipertahankan.`,
      });
    } catch (err) {
      setMeetingsList(previousMeetings);
      setMeetingsFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus pertemuan.',
      });
    } finally {
      setSavingMeetings(false);
      setDeleteMeetingTarget(null);
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
      onClassUpdated?.({
        ...classData,
        meetings: nextMeetings,
        meetingsCount: nextMeetings.length,
      });
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
      onClassUpdated?.({
        ...classData,
        meetings: nextMeetings,
        meetingsCount: nextMeetings.length,
      });
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
        meetingNo: effectiveAttMeetingNo,
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
        {
          id: 'discussion',
          icon: MessageSquare,
          label: language === 'en' ? 'DISCUSSION' : 'DISKUSI',
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
        {
          id: 'discussion',
          icon: MessageSquare,
          label: language === 'en' ? 'DISCUSSION' : 'DISKUSI',
        },
      ];

  const handleSelectMeetingSafe = (targetMeeting) => {
    if (!targetMeeting || examActive) return;
    setSelectedMeeting(targetMeeting);
    setProgressFeedback(null);
    setExamFinished(false);
    setExamScore(null);
    setExamError(null);
    setExamNote('');
    setSelectedAnswers({});
    setTaskFeedback(null);
    setCreateTaskNotice(null);
    setAttFeedback(null);
    setGradingNotice(null);
    setEditingMeetingId(null);
    setExamSaveFeedback(null);
    setMaterialFeedback(null);
    setVideoFeedback(null);
    setPdfFeedback(null);
  };

  const renderEducatorMeetingToolbar = (labelId) => {
    if (!isEducatorOrAdmin) return null;
    if (meetingsList.length === 0) {
      return (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/40 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
          <span className="text-amber-800 dark:text-amber-300">
            {language === 'en'
              ? 'Create at least one meeting in Syllabus & Edit before configuring content for it.'
              : 'Buat pertemuan pertama di tab SILABUS & KELOLA sebelum mengisi konten pertemuan.'}
          </span>
          <button
            type="button"
            onClick={() => setActiveTab('meetings')}
            className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold px-3 py-1.5 rounded text-[11px]"
          >
            {language === 'en' ? 'Go to Syllabus' : 'Ke Tab Silabus'}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] font-mono">
        <label
          htmlFor={labelId}
          className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase"
        >
          {language === 'en' ? 'Active Meeting Target:' : 'Pertemuan Dikelola:'}
        </label>
        <select
          id={labelId}
          aria-label={language === 'en' ? 'Select target meeting' : 'Pilih pertemuan yang dikelola'}
          disabled={examActive}
          value={currentMeetingNo}
          onChange={(e) => {
            const target = meetingsList.find((m) => Number(m.order) === Number(e.target.value));
            if (target) handleSelectMeetingSafe(target);
          }}
          className="px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100 disabled:opacity-50"
        >
          {meetingsList.map((m) => (
            <option key={m.id} value={m.order}>
              P{m.order < 10 ? `0${m.order}` : m.order}: {m.title}
            </option>
          ))}
        </select>
      </div>
    );
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

      <AccessibleDialog
        isOpen={Boolean(deleteMeetingTarget)}
        variant="danger"
        title={language === 'en' ? 'Delete Meeting' : 'Hapus Pertemuan'}
        message={
          deleteMeetingTarget
            ? language === 'en'
              ? `Delete Meeting ${deleteMeetingTarget.order} ("${deleteMeetingTarget.title}")? Remaining meeting numbers will NOT be renumbered.`
              : `Hapus Pertemuan ${deleteMeetingTarget.order} ("${deleteMeetingTarget.title}")? Nomor urut pertemuan lain tidak akan diubah.`
            : ''
        }
        confirmLabel={language === 'en' ? 'Delete' : 'Hapus'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => deleteMeetingTarget && executeDeleteMeeting(deleteMeetingTarget)}
        onClose={() => setDeleteMeetingTarget(null)}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs uppercase">
                {classData.category}
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#141d2c] border border-amber-200 dark:border-[#f59e0b]/30 px-2 py-0.5 rounded-xs">
                {language === 'en' ? 'CODE' : 'KODE'}: {classData.code}
              </span>
              {(classData.day || classData.time) && (
                <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#18212e] border border-slate-200 dark:border-[#232f42] px-2 py-0.5 rounded-xs">
                  {[classData.day, classData.time].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 mt-2 font-mono">
              {classData.name || classData.title}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-sans">
              {classData.description || (
                <span className="italic opacity-75">
                  {language === 'en' ? 'No syllabus description yet.' : 'Belum ada deskripsi silabus.'}
                </span>
              )}
            </p>
          </div>

          <div className="text-left md:text-right pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-[#1c2638] space-y-1.5">
            <div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block">
                {language === 'en' ? '// LEAD INSTRUCTOR' : '// INSTRUKTUR PENANGGUNG JAWAB'}
              </span>
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b]">
                {classData.instructor || classData.lecturer}
              </span>
            </div>
            {isEducatorOrAdmin && !isEditingClassInfo && (
              <button
                type="button"
                onClick={handleStartEditClassInfo}
                className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#18212e] hover:bg-slate-100 dark:hover:bg-[#232f42] text-slate-700 dark:text-slate-200 transition"
              >
                <Edit3 className="w-3 h-3" />
                {language === 'en' ? 'Edit Class Info' : 'Ubah Info Kelas'}
              </button>
            )}
          </div>
        </div>

        {classInfoFeedback && (
          <div
            className={`mt-3 p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 border ${
              classInfoFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
            }`}
          >
            {classInfoFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{classInfoFeedback.text}</span>
          </div>
        )}

        {isEducatorOrAdmin && isEditingClassInfo && (
          <form
            onSubmit={handleSaveClassInfo}
            className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Class Name' : 'Nama Kelas'}
                </label>
                <input
                  type="text"
                  required
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Day' : 'Hari'}
                </label>
                <select
                  value={editClassDay}
                  onChange={(e) => setEditClassDay(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
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
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Time' : 'Jam'}
                </label>
                <input
                  type="text"
                  placeholder="08.00–10.30"
                  value={editClassTime}
                  onChange={(e) => setEditClassTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                {language === 'en' ? 'Description' : 'Deskripsi Silabus'}
              </label>
              <textarea
                rows="2"
                value={editClassDesc}
                onChange={(e) => setEditClassDesc(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingClassInfo(false)}
                className="px-3 py-1 text-[11px] font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {t('dialog_cancel')}
              </button>
              <button
                type="submit"
                disabled={savingClassInfo}
                className="px-3 py-1 text-[11px] font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {savingClassInfo
                  ? language === 'en' ? 'Saving...' : 'Menyimpan...'
                  : language === 'en' ? 'Save Info' : 'Simpan Info'}
              </button>
            </div>
          </form>
        )}

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

      {/* PER-MEETING LEARNING CYCLE STEPPER (Active Student View) */}
      {!isPreviewMode && !isEducatorOrAdmin && meetingsList.length === 0 && (
        <div className="bg-white dark:bg-[#121822] p-4 rounded-xl border border-dashed border-slate-300 dark:border-[#232f42] text-center text-xs font-mono text-slate-500 dark:text-slate-400">
          {language === 'en'
            ? 'No meetings have been added to this class yet. Please check back once your lecturer publishes the syllabus.'
            : 'Belum ada pertemuan di kelas ini. Siklus belajar akan muncul setelah dosen menambahkan pertemuan pertama.'}
        </div>
      )}

      {!isPreviewMode && !isEducatorOrAdmin && meetingsList.length > 0 && (
        <div className="bg-white dark:bg-[#121822] p-4 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] uppercase tracking-wider block">
                // {language === 'en' ? 'LEARNING CYCLE' : 'SIKLUS BELAJAR PERTEMUAN'} {currentMeetingNo < 10 ? `0${currentMeetingNo}` : currentMeetingNo}
              </span>
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {selectedMeeting?.title || `Pertemuan ${currentMeetingNo}`}
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <select
                aria-label={language === 'en' ? 'Select active meeting' : 'Pilih pertemuan aktif'}
                disabled={examActive}
                value={currentMeetingNo}
                onChange={(e) => {
                  const target = meetingsList.find((m) => Number(m.order) === Number(e.target.value));
                  if (target) handleSelectMeetingSafe(target);
                }}
                className="px-2.5 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-800 dark:text-slate-200 disabled:opacity-50"
              >
                {meetingsList.map((m) => (
                  <option key={m.id} value={m.order} disabled={!isEducatorOrAdmin && m.status === 'locked'}>
                    P{m.order < 10 ? `0${m.order}` : m.order}: {m.title}
                  </option>
                ))}
              </select>
              {activeCycle.gainDelta !== null && (
                <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Δ {activeCycle.gainDelta >= 0 ? `+${activeCycle.gainDelta}` : activeCycle.gainDelta}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[10px]">
            {[
              {
                key: 'pretest',
                step: '1. PRETEST',
                done: activeCycle.pretestDone,
                sub: activeCycle.pretestDone ? `Skor ${activeCycle.pretestAttempt?.score}` : 'Diagnostik Awal',
                tab: 'exam',
              },
              {
                key: 'material',
                step: '2. MATERI',
                done: activeCycle.materialDone,
                sub: activeCycle.materialDone ? 'Selesai Dibaca' : 'Baca Modul',
                tab: 'material',
              },
              {
                key: 'video',
                step: '3. VIDEO',
                done: activeCycle.videoDone,
                sub: activeCycle.videoDone ? 'Selesai Ditonton' : 'Tonton Video',
                tab: 'video',
              },
              {
                key: 'tasks',
                step: '4. TUGAS',
                done: activeCycle.tasksAllDone,
                sub: activeCycle.hasTasks
                  ? `${activeCycle.tasksCompletedCount}/${activeCycle.meetingTasks.length} Selesai`
                  : 'Opsional / Praktik',
                tab: 'tasks',
              },
              {
                key: 'posttest',
                step: '5. POST-TEST + DISKUSI',
                done: activeCycle.posttestDone,
                sub: activeCycle.posttestDone
                  ? `Skor ${activeCycle.posttestAttempt?.score}`
                  : activeCycle.canStartPosttest
                    ? 'Siap Dikerjakan'
                    : 'Terkunci',
                tab: activeCycle.posttestDone ? 'discussion' : 'exam',
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.tab)}
                className={`p-2.5 rounded-lg border text-left transition ${
                  item.done
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                    : activeTab === item.tab
                      ? 'bg-amber-50 dark:bg-[#172133] border-amber-400 dark:border-[#f59e0b]/60 text-amber-800 dark:text-[#f59e0b]'
                      : 'bg-slate-50 dark:bg-[#0a0f18] border-slate-200 dark:border-[#1e2a3f] text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-bold">
                  <span>{item.step}</span>
                  <span>{item.done ? '✓' : '○'}</span>
                </div>
                <span className="text-[9px] opacity-80 block mt-0.5 truncate">{item.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
                    ? '// READ-ONLY SYLLABUS OUTLINE'
                    : '// RANGKAIAN SILABUS PERTEMUAN'}
                </span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                {meetingsList.length} {language === 'en' ? 'SESSIONS' : 'PERTEMUAN'}
              </span>
            </div>

            {meetingsList.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 dark:bg-[#0b101a] rounded-lg border border-dashed border-slate-200 dark:border-[#1b2538] text-xs font-mono text-slate-500 dark:text-slate-400">
                {language === 'en'
                  ? 'No syllabus meetings have been published by the lecturer yet.'
                  : 'Dosen belum menambahkan pertemuan pada silabus kelas ini.'}
              </div>
            ) : (
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
            )}
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
                    ? '// MANAGE CLASS SESSIONS'
                    : '// KELOLA PERTEMUAN & SILABUS'
                  : language === 'en'
                    ? '// CLASS SESSIONS & SYLLABUS'
                    : '// DAFTAR PERTEMUAN KELAS'}
              </span>
            </h3>
            <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
              {meetingsList.length} {language === 'en' ? 'SESSIONS' : 'PERTEMUAN'}
            </span>
          </div>

          {isEducatorOrAdmin && (
            <form
              onSubmit={handleAddMeeting}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  {language === 'en' ? 'Add New Meeting' : 'Tambah Pertemuan Baru'}
                </h4>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {language === 'en' ? 'Next Meeting No:' : 'Nomor Berikutnya:'} P
                  {(() => {
                    const nextOrd =
                      meetingsList.reduce((max, m) => Math.max(max, Number(m.order || 0)), 0) + 1;
                    return nextOrd < 10 ? `0${nextOrd}` : nextOrd;
                  })()}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Meeting Title' : 'Judul Pertemuan'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    placeholder={
                      language === 'en'
                        ? 'e.g. Introduction & Course Contract'
                        : 'Contoh: Kontrak Kuliah & Pengenalan Konsep'
                    }
                    className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Schedule / Date (Optional)' : 'Jadwal / Tanggal (Opsional)'}
                  </label>
                  <input
                    type="text"
                    value={newMeetingDate}
                    onChange={(e) => setNewMeetingDate(e.target.value)}
                    placeholder={
                      [classData?.day, classData?.time].filter(Boolean).join(', ') ||
                      'Senin, 08.00–10.30'
                    }
                    className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    aria-label={language === 'en' ? 'Initial meeting status' : 'Status awal pertemuan'}
                    value={newMeetingStatus}
                    onChange={(e) => setNewMeetingStatus(e.target.value)}
                    className="px-2 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  >
                    <option value="open">{language === 'en' ? 'Open' : 'Terbuka'}</option>
                    <option value="locked">{language === 'en' ? 'Locked' : 'Terkunci'}</option>
                  </select>
                  <button
                    type="submit"
                    disabled={savingMeetings || !newMeetingTitle.trim()}
                    className="flex-1 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-2 rounded-lg transition flex items-center justify-center gap-1 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {savingMeetings
                      ? language === 'en' ? 'Adding...' : 'Menyimpan...'
                      : language === 'en' ? 'Add' : 'Tambah'}
                  </button>
                </div>
              </div>
            </form>
          )}

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

          {meetingsList.length === 0 ? (
            <div className="py-10 text-center bg-slate-50 dark:bg-[#0b101a] rounded-xl border border-dashed border-slate-300 dark:border-[#232f42] space-y-1.5 font-mono">
              <BookOpen className="w-7 h-7 text-amber-500 mx-auto" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {language === 'en' ? 'No Meetings Created Yet' : 'Belum Ada Pertemuan di Kelas Ini'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {isEducatorOrAdmin
                  ? language === 'en'
                    ? 'Use the "Add New Meeting" form above to create the first session for this class.'
                    : 'Gunakan formulir "Tambah Pertemuan Baru" di atas untuk menambahkan pertemuan pertama kelas ini.'
                  : language === 'en'
                    ? 'Your lecturer has not published any meeting sessions for this class yet.'
                    : 'Dosen pengampu belum menambahkan pertemuan pada kelas ini.'}
              </p>
            </div>
          ) : (
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
                        (() => {
                          const cycle = getMeetingCycleStatus(meet.order);
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 font-mono">
                              <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                                {cycle.pretestDone
                                  ? `✓ PRETEST (${cycle.pretestAttempt?.score ?? '-'})`
                                  : '✕ PRETEST'}
                              </span>
                              <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                                {cycle.materialDone ? '✓ MATERI' : '○ MATERI'}
                              </span>
                              <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                                {cycle.videoDone ? '✓ VIDEO' : '○ VIDEO'}
                              </span>
                              {cycle.hasTasks && (
                                <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                                  {cycle.tasksAllDone
                                    ? '✓ TUGAS'
                                    : `○ TUGAS (${cycle.tasksCompletedCount}/${cycle.meetingTasks.length})`}
                                </span>
                              )}
                              <span className="text-[9px] bg-white dark:bg-[#0d1421] border border-slate-200 dark:border-[#212f45] px-1.5 py-0.5 rounded-xs text-slate-700 dark:text-slate-300">
                                {cycle.posttestDone
                                  ? `✓ POST-TEST (${cycle.posttestAttempt?.score ?? '-'})`
                                  : '✕ POST-TEST'}
                              </span>
                              {cycle.gainDelta !== null && (
                                <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-xs">
                                  GAIN Δ: {cycle.gainDelta >= 0 ? `+${cycle.gainDelta}` : cycle.gainDelta}
                                </span>
                              )}
                            </div>
                          );
                        })()
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
                        <button
                          type="button"
                          onClick={() => setDeleteMeetingTarget(meet)}
                          disabled={savingMeetings}
                          aria-label={language === 'en' ? `Delete meeting ${meet.order}` : `Hapus pertemuan ${meet.order}`}
                          className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[10px] font-bold px-2.5 py-1.5 rounded-xs transition flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          {language === 'en' ? 'Delete' : 'Hapus'}
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
                        disabled={examActive}
                        onClick={() => {
                          handleSelectMeetingSafe(meet);
                          setActiveTab('material');
                        }}
                        className="bg-white dark:bg-[#1c2432] hover:bg-slate-100 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-xs transition uppercase disabled:opacity-50"
                      >
                        {language === 'en' ? 'Open Module' : 'Buka Modul'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          )}
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
                {selectedMeeting
                  ? `P${selectedMeeting.order < 10 ? `0${selectedMeeting.order}` : selectedMeeting.order}: ${selectedMeeting.title}`
                  : language === 'en'
                    ? 'No Meeting Selected'
                    : 'Belum Ada Pertemuan'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {isEducatorOrAdmin && selectedMeeting && (
                <button
                  type="button"
                  onClick={() => setMaterialEditOpen((prev) => !prev)}
                  className="bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {materialEditOpen
                    ? language === 'en'
                      ? 'Close Editor'
                      : 'Tutup Editor'
                    : language === 'en'
                      ? 'Edit Reading Material'
                      : 'Kelola Materi'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateAI?.()}
                className="bg-amber-50 dark:bg-[#172133] hover:bg-amber-100 dark:hover:bg-[#202f48] text-amber-800 dark:text-[#f59e0b] border border-amber-300 dark:border-[#f59e0b]/40 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-[#f59e0b]" />
                {language === 'en' ? 'AI CONSULT' : 'KONSULTASI AI'}
              </button>
            </div>
          </div>

          {renderEducatorMeetingToolbar('educator-material-meeting')}

          {isEducatorOrAdmin && selectedMeeting && (materialEditOpen || !selectedMeeting.deltaContent) && (
            <form
              onSubmit={handleSaveMeetingDelta}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                  {language === 'en'
                    ? `Manage Meeting ${selectedMeeting.order} Material`
                    : `Kelola Materi Pertemuan ${selectedMeeting.order}`}
                </h4>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {language === 'en'
                    ? 'Use "# " for headings and "- " for bullet lists.'
                    : 'Gunakan "# " untuk subbab dan "- " untuk daftar poin.'}
                </span>
              </div>
              <textarea
                rows={5}
                aria-label={language === 'en' ? 'Meeting reading material text' : 'Teks materi pertemuan'}
                value={materialTextInput}
                onChange={(e) => setMaterialTextInput(e.target.value)}
                placeholder={
                  language === 'en'
                    ? '# Topic Heading\nWrite structured reading material here...\n- Key takeaway 1'
                    : '# Judul Materi Pertemuan\nTuliskan pembahasan materi terstruktur di sini...\n- Poin penting 1'
                }
                className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingMaterial}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3.5 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingMaterial
                    ? language === 'en'
                      ? 'Saving...'
                      : 'Menyimpan...'
                    : language === 'en'
                      ? 'Save Material'
                      : 'Simpan Materi'}
                </button>
                {selectedMeeting.deltaContent && (
                  <button
                    type="button"
                    disabled={savingMaterial}
                    onClick={() => void handleClearMeetingDelta()}
                    className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Delete Material' : 'Hapus Materi'}
                  </button>
                )}
              </div>
            </form>
          )}

          {materialFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                materialFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {materialFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{materialFeedback.text}</span>
            </div>
          )}

          <DeltaContentRenderer
            delta={selectedMeeting ? selectedMeeting.deltaContent || null : classData?.deltaContent || null}
            fallbackText={selectedMeeting ? '' : classData?.description || ''}
            emptyMessage={
              language === 'en'
                ? 'No reading material has been added for this meeting yet.'
                : 'Belum ada materi bacaan untuk pertemuan ini.'
            }
          />

          {!isEducatorOrAdmin && selectedMeeting && (
            <div className="pt-4 border-t border-slate-200 dark:border-[#1b263b] flex flex-wrap items-center justify-between gap-3 font-mono">
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {activeCycle.materialDone
                  ? language === 'en'
                    ? `Reading material for Meeting ${currentMeetingNo} is completed.`
                    : `Materi Pertemuan ${currentMeetingNo} telah selesai dipelajari.`
                  : language === 'en'
                    ? `Mark this reading material completed to progress toward Post-test.`
                    : `Tandai materi selesai setelah membaca untuk membuka syarat Post-test.`}
              </div>
              <button
                type="button"
                onClick={() => void handleMarkProgress('materialCompleted')}
                disabled={progressSaving || activeCycle.materialDone}
                className={`text-xs font-bold px-4 py-2 rounded-xs transition flex items-center gap-1.5 ${
                  activeCycle.materialDone
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 cursor-default'
                    : 'bg-[#f59e0b] hover:bg-[#d97706] text-black shadow-md disabled:opacity-50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {activeCycle.materialDone
                  ? language === 'en'
                    ? 'Material Completed'
                    : 'Materi Selesai ✓'
                  : language === 'en'
                    ? 'Mark Material Completed'
                    : 'Tandai Materi Selesai'}
              </button>
            </div>
          )}

          {progressFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                progressFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{progressFeedback.text}</span>
            </div>
          )}
        </div>
      )}

      {/* TAB: Video Learning Player */}
      {!isPreviewMode && activeTab === 'video' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
              // VIDEO STREAM PLAYER —{' '}
              {selectedMeeting
                ? `PERTEMUAN ${currentMeetingNo < 10 ? `0${currentMeetingNo}` : currentMeetingNo}`
                : language === 'en'
                  ? 'NO MEETING SELECTED'
                  : 'BELUM ADA PERTEMUAN'}
            </h3>
            {videoSource && (
              <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff]">
                {videoSource.kind === 'iframe' ? 'EMBEDDED STREAM' : 'HTML5 MEDIA PLAYER'}
              </span>
            )}
          </div>

          {renderEducatorMeetingToolbar('educator-video-meeting')}

          {isEducatorOrAdmin && selectedMeeting && (
            <form
              onSubmit={handleSaveMeetingVideo}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
            >
              <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                {language === 'en'
                  ? `Set Video URL for Meeting ${selectedMeeting.order}`
                  : `Kelola Video Pembelajaran Pertemuan ${selectedMeeting.order}`}
              </h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  aria-label={language === 'en' ? 'Meeting video URL' : 'URL video pembelajaran pertemuan'}
                  value={videoUrlInput}
                  onChange={(e) => setVideoUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... atau https://.../video.mp4"
                  className="flex-1 px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={savingVideo}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3.5 py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingVideo
                    ? language === 'en'
                      ? 'Saving...'
                      : 'Menyimpan...'
                    : language === 'en'
                      ? 'Save Video'
                      : 'Simpan Video'}
                </button>
                {videoSource && (
                  <button
                    type="button"
                    disabled={savingVideo}
                    onClick={() => void handleClearMeetingVideo()}
                    className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Delete Video' : 'Hapus Video'}
                  </button>
                )}
              </div>
            </form>
          )}

          {videoFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                videoFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {videoFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{videoFeedback.text}</span>
            </div>
          )}

          {videoSource ? (
            videoSource.kind === 'iframe' ? (
              <div className="aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-[#1e2a3f] bg-black">
                <iframe
                  title={selectedMeeting?.title || classData?.name || 'Video Pembelajaran'}
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
                  onEnded={() => {
                    if (!isEducatorOrAdmin && !activeCycle.videoDone) {
                      void handleMarkProgress('videoCompleted');
                    }
                  }}
                  className="w-full h-full object-contain"
                />
              </div>
            )
          ) : (
            <div className="py-10 px-6 text-center bg-slate-50 dark:bg-[#0b101a] rounded-xl border border-dashed border-slate-300 dark:border-[#232f42] space-y-1.5 font-mono">
              <PlayCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {language === 'en'
                  ? 'No Instructional Video Available'
                  : 'Belum Ada Video Pembelajaran untuk Pertemuan Ini'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isEducatorOrAdmin
                  ? language === 'en'
                    ? 'Paste a YouTube, Vimeo, or HTTPS MP4 video URL in the form above.'
                    : 'Masukkan tautan video YouTube, Vimeo, atau file MP4 https:// melalui formulir di atas.'
                  : language === 'en'
                    ? 'The lecturer has not uploaded a video URL for this meeting yet.'
                    : 'Dosen belum menambahkan tautan video pembelajaran untuk pertemuan ini.'}
              </p>
            </div>
          )}

          {!isEducatorOrAdmin && selectedMeeting && (
            <div className="pt-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-wrap items-center justify-between gap-3 font-mono">
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {activeCycle.videoDone
                  ? language === 'en'
                    ? `Video for Meeting ${currentMeetingNo} is completed.`
                    : `Video Pertemuan ${currentMeetingNo} telah ditandai selesai.`
                  : language === 'en'
                    ? 'Watch the video until the end or click the button to mark it completed.'
                    : 'Tonton video hingga selesai atau klik tombol di kanan untuk menandai selesai.'}
              </div>
              <button
                type="button"
                onClick={() => void handleMarkProgress('videoCompleted')}
                disabled={progressSaving || activeCycle.videoDone}
                className={`text-xs font-bold px-4 py-2 rounded-xs transition flex items-center gap-1.5 ${
                  activeCycle.videoDone
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40 cursor-default'
                    : 'bg-[#f59e0b] hover:bg-[#d97706] text-black shadow-md disabled:opacity-50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {activeCycle.videoDone
                  ? language === 'en'
                    ? 'Video Completed'
                    : 'Video Selesai ✓'
                  : language === 'en'
                    ? 'Mark Video Completed'
                    : 'Tandai Video Selesai'}
              </button>
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
                  ? 'Preview or open external PDF module configured for this meeting.'
                  : 'Pratinjau atau buka dokumen PDF resmi yang ditambahkan dosen untuk pertemuan ini.'}
              </p>
            </div>
            {safePdfUrl && (
              <div className="flex items-center gap-2">
                <a
                  href={safePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {language === 'en' ? 'OPEN PDF' : 'BUKA PDF'}
                </a>
                <a
                  href={safePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-mono font-bold px-3 py-1.5 rounded-xs transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {language === 'en' ? 'DOWNLOAD PDF' : 'UNDUH PDF'}
                </a>
              </div>
            )}
          </div>

          {renderEducatorMeetingToolbar('educator-pdf-meeting')}

          {isEducatorOrAdmin && selectedMeeting && (
            <form
              onSubmit={handleSaveMeetingPdf}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                  {language === 'en'
                    ? `Manage PDF Module for Meeting ${selectedMeeting.order}`
                    : `Kelola Dokumen PDF Pertemuan ${selectedMeeting.order}`}
                </h4>
                <label className="cursor-pointer bg-slate-200 dark:bg-[#1c2432] hover:bg-slate-300 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  {pdfUploading
                    ? language === 'en'
                      ? 'Uploading...'
                      : 'Mengunggah...'
                    : language === 'en'
                      ? 'Upload PDF'
                      : 'Unggah Berkas PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={pdfUploading || savingPdf}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadMeetingPdfFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  aria-label={language === 'en' ? 'Meeting PDF URL' : 'URL PDF pertemuan'}
                  value={pdfUrlInput}
                  onChange={(e) => setPdfUrlInput(e.target.value)}
                  placeholder="https://.../manual-book-pertemuan.pdf"
                  className="flex-1 px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={savingPdf || pdfUploading}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3.5 py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingPdf
                    ? language === 'en'
                      ? 'Saving...'
                      : 'Menyimpan...'
                    : language === 'en'
                      ? 'Save PDF'
                      : 'Simpan PDF'}
                </button>
                {safePdfUrl && (
                  <button
                    type="button"
                    disabled={savingPdf || pdfUploading}
                    onClick={() => void handleClearMeetingPdf()}
                    className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Delete PDF' : 'Hapus PDF'}
                  </button>
                )}
              </div>
            </form>
          )}

          {pdfFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                pdfFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {pdfFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{pdfFeedback.text}</span>
            </div>
          )}

          {safePdfUrl ? (
            <iframe
              title="Manual Book PDF Viewer"
              src={safePdfUrl}
              className="w-full h-96 rounded-lg border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#070b12]"
            />
          ) : (
            <div className="border border-dashed border-slate-300 dark:border-[#1e2a3f] rounded-lg p-8 text-center bg-slate-50 dark:bg-[#070b12] font-mono space-y-1.5">
              <FileText className="w-9 h-9 text-amber-500 mx-auto" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">
                {language === 'en'
                  ? 'No PDF Document Available'
                  : 'Belum Ada Dokumen PDF untuk Pertemuan Ini'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isEducatorOrAdmin
                  ? language === 'en'
                    ? 'Upload a PDF file or save an https:// PDF URL using the form above.'
                    : 'Unggah berkas PDF atau simpan tautan PDF https:// melalui formulir di atas.'
                  : language === 'en'
                    ? 'Your lecturer has not attached a PDF manual book for this meeting yet.'
                    : 'Dosen pengampu belum menambahkan dokumen PDF untuk pertemuan ini.'}
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
              <span className="text-[10px] font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2.5 py-0.5 rounded-xs inline-block">
                {selectedMeeting
                  ? `PERTEMUAN ${currentMeetingNo < 10 ? `0${currentMeetingNo}` : currentMeetingNo}`
                  : language === 'en'
                    ? 'NO MEETING'
                    : 'BELUM ADA PERTEMUAN'}
              </span>
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

              {/* Pretest vs Posttest Learning Gain Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#090d16] border border-slate-200 dark:border-[#1e2a3f] text-left space-y-2.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  <span>// PRETEST VS POSTTEST GAIN (PERTEMUAN {currentMeetingNo})</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#212f45]">
                    <span className="text-[9px] text-slate-500 block">PRETEST BASELINE</span>
                    <span className="text-sm font-black text-amber-600 dark:text-[#f59e0b]">
                      {activeCycle.pretestDone ? `${activeCycle.pretestAttempt?.score ?? '-'}` : '—'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#212f45]">
                    <span className="text-[9px] text-slate-500 block">POST-TEST</span>
                    <span className="text-sm font-black text-sky-600 dark:text-[#00e5ff]">
                      {activeCycle.posttestDone ? `${activeCycle.posttestAttempt?.score ?? '-'}` : '—'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#212f45]">
                    <span className="text-[9px] text-slate-500 block">GAIN (Δ)</span>
                    <span
                      className={`text-sm font-black ${
                        activeCycle.gainDelta !== null && activeCycle.gainDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {activeCycle.gainDelta !== null
                        ? activeCycle.gainDelta >= 0
                          ? `+${activeCycle.gainDelta}`
                          : activeCycle.gainDelta
                        : '—'}
                    </span>
                  </div>
                </div>

                {!activeCycle.canStartPosttest && (
                  <div className="pt-2 border-t border-slate-200 dark:border-[#1b263b] text-[10px] text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="font-bold block text-amber-700 dark:text-[#f59e0b]">
                      SYARAT MEMBUKA POST-TEST:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <span>{activeCycle.pretestDone ? '✓' : '○'} Pretest</span>
                      <span>{activeCycle.materialDone ? '✓' : '○'} Materi</span>
                      <span>{activeCycle.videoDone ? '✓' : '○'} Video</span>
                    </div>
                  </div>
                )}
              </div>

              {!meetingExamsLoading && !meetingExams.pretest && !meetingExams.posttest && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0b101a] border border-dashed border-slate-300 dark:border-[#232f42] text-xs text-slate-600 dark:text-slate-400">
                  {language === 'en'
                    ? 'Evaluations for this meeting have not been configured by the lecturer yet.'
                    : 'Evaluasi untuk pertemuan ini belum dibuat oleh dosen.'}
                </div>
              )}

              {examError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 rounded-xs text-xs flex items-center gap-2 text-left">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{examError}</span>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                {(() => {
                  const hasPretestQuestions = Boolean(meetingExams.pretest?.questions?.length);
                  const hasPosttestQuestions = Boolean(meetingExams.posttest?.questions?.length);
                  const pretestDisabled =
                    activeCycle.pretestDone || !hasPretestQuestions || !selectedMeeting;
                  const posttestDisabled =
                    !activeCycle.canStartPosttest || !hasPosttestQuestions || !selectedMeeting;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleStartExam('pretest')}
                        disabled={pretestDisabled}
                        className={`text-xs font-bold px-4 py-2 rounded-xs shadow-md transition flex items-center gap-1.5 ${
                          pretestDisabled
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                            : 'bg-[#f59e0b] hover:bg-[#d97706] text-black'
                        }`}
                      >
                        {activeCycle.pretestDone ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            {language === 'en'
                              ? `PRETEST LOCKED (${activeCycle.pretestAttempt?.score})`
                              : `PRETEST SELESAI (BASELINE: ${activeCycle.pretestAttempt?.score})`}
                          </>
                        ) : !hasPretestQuestions ? (
                          language === 'en' ? 'PRETEST UNAVAILABLE' : 'PRETEST BELUM TERSEDIA'
                        ) : language === 'en' ? (
                          'START PRETEST'
                        ) : (
                          'MULAI PRETEST'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStartExam('posttest')}
                        disabled={posttestDisabled}
                        className={`text-xs font-bold px-4 py-2 rounded-xs shadow-md transition flex items-center gap-1.5 ${
                          !posttestDisabled
                            ? 'bg-sky-600 dark:bg-[#00e5ff] hover:bg-sky-500 dark:hover:bg-[#33ebff] text-white dark:text-black'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {posttestDisabled && <Lock className="w-3.5 h-3.5" />}
                        {!hasPosttestQuestions
                          ? language === 'en'
                            ? 'POST-TEST UNAVAILABLE'
                            : 'POST-TEST BELUM TERSEDIA'
                          : language === 'en'
                            ? 'START POST-TEST'
                            : 'MULAI POST-TEST'}
                      </button>
                    </>
                  );
                })()}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
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
            <div className="flex items-center gap-2 font-mono">
              <select
                aria-label={language === 'en' ? 'Filter tasks by meeting' : 'Filter tugas per pertemuan'}
                value={taskMeetingFilter}
                onChange={(e) => setTaskMeetingFilter(e.target.value)}
                className="px-2.5 py-1 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-800 dark:text-slate-200"
              >
                <option value="all">Semua Pertemuan</option>
                <option value={String(currentMeetingNo)}>
                  Pertemuan Aktif (P{currentMeetingNo})
                </option>
                {meetingsList.map((m) => (
                  <option key={m.id} value={String(m.order)}>
                    Pertemuan {m.order}
                  </option>
                ))}
              </select>
              <span className="text-[10px] font-bold text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-xs">
                PORTAL TUGAS
              </span>
            </div>
          </div>

          {tasksLoading ? (
            <div className="py-8 text-center text-xs font-mono text-slate-400">
              Memuat tugas kelas dari Cloud Firestore...
            </div>
          ) : (() => {
            const visibleTasks =
              taskMeetingFilter === 'all'
                ? taskSubmissions
                : taskSubmissions.filter(
                    (tItem) => Number(tItem.meetingNo || 1) === Number(taskMeetingFilter)
                  );
            if (visibleTasks.length === 0) {
              return (
                <div className="py-8 text-center bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs text-slate-500 dark:text-slate-400">
                  Belum ada tugas yang diterbitkan untuk filter pertemuan ini di Firestore.
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {visibleTasks.map((task) => {
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
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff] border border-sky-200 dark:border-[#00e5ff]/30">
                              PERTEMUAN {Number(task.meetingNo || 1)}
                            </span>
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
          );
          })()}
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
                  {language === 'en' ? 'Meeting' : 'Pertemuan'}
                </label>
                <select
                  value={effectiveAttMeetingNo}
                  onChange={(e) => setAttMeetingNo(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                >
                  {(meetingsList.length > 0
                    ? meetingsList.map((m) => m.order)
                    : Array.from({ length: 16 }, (_, idx) => idx + 1)
                  ).map((num) => (
                    <option key={num} value={num}>
                      Pertemuan {num < 10 ? `0${num}` : num}
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

      {/* INSTRUCTOR / ADMIN TAB: Submissions Grading & Task Creation */}
      {!isPreviewMode && isEducatorOrAdmin && activeTab === 'grading' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-5">
          {/* Create Meeting Task Form */}
          <form
            onSubmit={handleCreateMeetingTask}
            className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                {language === 'en' ? 'Publish New Meeting Task' : 'Terbitkan Tugas Pertemuan Baru'}
              </h4>
              <span className="text-[10px] text-slate-500">assignments (Firestore)</span>
            </div>

            {createTaskNotice && (
              <div
                className={`p-2.5 rounded text-xs flex items-center gap-2 border ${
                  createTaskNotice.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
                }`}
              >
                <span>{createTaskNotice.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  Pertemuan
                </label>
                <select
                  value={effectiveNewTaskMeetingNo}
                  onChange={(e) => setNewTaskMeetingNo(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                >
                  {(meetingsList.length > 0
                    ? meetingsList.map((m) => m.order)
                    : Array.from({ length: 16 }, (_, idx) => idx + 1)
                  ).map((num) => (
                    <option key={num} value={num}>
                      Pertemuan {num < 10 ? `0${num}` : num}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  Judul Tugas
                </label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Contoh: Tugas Praktikum 03 — Enkapsulasi State"
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  Tenggat Pengumpulan
                </label>
                <input
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  Instruksi Singkat
                </label>
                <input
                  type="text"
                  value={newTaskNote}
                  onChange={(e) => setNewTaskNote(e.target.value)}
                  placeholder="Format PDF/ZIP atau link GitHub..."
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={creatingTask}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creatingTask ? 'Menerbitkan...' : 'Terbitkan Tugas'}
              </button>
            </div>
          </form>

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

      {/* INSTRUCTOR / ADMIN TAB: Question CRUD, Server Reference Keys & Exam Statistics */}
      {!isPreviewMode && isEducatorOrAdmin && activeTab === 'exam_insights' && (
        <div className="bg-white dark:bg-[#121822] p-5 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                <span>
                  {language === 'en'
                    ? '// EVALUATION QUESTIONS CRUD, KEYS & STATS'
                    : '// KELOLA SOAL, KUNCI EVALUASI & STATISTIK KELAS'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {language === 'en'
                  ? 'Questions are stored in exams/{examId}; reference keys live server-only in /api/grade.'
                  : 'Soal disimpan tanpa kunci ke Firestore (exams), sementara kunci jawaban disimpan 100% server-side di /api/grade.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-mono">
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
              {selectedMeeting && (
                <button
                  type="button"
                  onClick={() => setShowExamEditor((prev) => !prev)}
                  className="px-3 py-1.5 rounded-xs text-[10px] font-bold uppercase border border-sky-300 dark:border-[#00e5ff]/40 bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff] flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  {showExamEditor
                    ? language === 'en'
                      ? 'Hide Exam Editor'
                      : 'Tutup Editor Soal'
                    : language === 'en'
                      ? 'Create / Edit Exam'
                      : 'Buat / Edit Soal & Kunci'}
                </button>
              )}
            </div>
          </div>

          {renderEducatorMeetingToolbar('educator-exam-meeting')}

          {examSaveFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 border ${
                examSaveFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/40'
              }`}
            >
              {examSaveFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{examSaveFeedback.text}</span>
            </div>
          )}

          {evalAnalyticsError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{evalAnalyticsError}</span>
            </div>
          )}

          {selectedMeeting && (showExamEditor || instructorExamQuestions.length === 0) && (
            <form
              onSubmit={handleSaveMeetingExam}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-4 font-mono"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                  {language === 'en'
                    ? `Manage ${evalKeyType.toUpperCase()} Questions (Meeting ${currentMeetingNo})`
                    : `Kelola Soal & Kunci ${evalKeyType.toUpperCase()} — Pertemuan ${currentMeetingNo}`}
                </h4>
                <button
                  type="button"
                  onClick={handleAddDraftQuestion}
                  className="bg-slate-200 dark:bg-[#1c2432] hover:bg-slate-300 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {language === 'en' ? 'Add Question' : 'Tambah Soal'}
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Assessment Title' : 'Judul Evaluasi'}
                </label>
                <input
                  type="text"
                  aria-label={language === 'en' ? 'Assessment title' : 'Judul evaluasi'}
                  value={examDraftTitle}
                  onChange={(e) => setExamDraftTitle(e.target.value)}
                  placeholder={`${evalKeyType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${currentMeetingNo}`}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-3">
                {examDraftQuestions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-lg bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-sky-700 dark:text-[#00e5ff]">
                        SOAL {qIdx + 1} ({q.id})
                      </span>
                      {examDraftQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftQuestion(q.id)}
                          aria-label={`Hapus Soal ${qIdx + 1}`}
                          className="text-rose-600 hover:text-rose-700 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {language === 'en' ? 'Remove' : 'Hapus'}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      aria-label={`Teks Soal ${qIdx + 1}`}
                      value={q.question}
                      onChange={(e) => handleUpdateDraftQuestionText(q.id, e.target.value)}
                      placeholder={
                        language === 'en' ? 'Enter question text...' : 'Tuliskan teks pertanyaan...'
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(q.options || []).map((opt, optIdx) => (
                        <input
                          key={optIdx}
                          type="text"
                          required
                          aria-label={`Soal ${qIdx + 1} Opsi ${optIdx + 1}`}
                          value={opt}
                          onChange={(e) => handleUpdateDraftOption(q.id, optIdx, e.target.value)}
                          placeholder={`Opsi ${String.fromCharCode(65 + optIdx)}`}
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                        {language === 'en' ? 'Server Reference Key:' : 'Kunci Jawaban Referensi:'}
                      </label>
                      <select
                        aria-label={`Kunci Jawaban Soal ${qIdx + 1}`}
                        value={examDraftAnswerKey?.[q.id] ?? 0}
                        onChange={(e) => handleUpdateDraftAnswerKey(q.id, e.target.value)}
                        className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
                      >
                        {(q.options || []).map((_, optIdx) => (
                          <option key={optIdx} value={optIdx}>
                            Opsi {String.fromCharCode(65 + optIdx)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingExam}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingExam
                    ? language === 'en'
                      ? 'Saving to Server...'
                      : 'Menyimpan ke Server...'
                    : language === 'en'
                      ? 'Save Questions & Keys'
                      : 'Simpan Soal & Kunci ke Server'}
                </button>
              </div>
            </form>
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
                {evalKeyType.toUpperCase()} — P{currentMeetingNo})
              </h4>
              {instructorKeySource && (
                <span className="text-[10px] font-mono text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 px-2 py-0.5 rounded border border-sky-200 dark:border-[#00e5ff]/30">
                  SOURCE: {instructorKeySource.toUpperCase()}
                </span>
              )}
            </div>

            {evalAnalyticsLoading ? (
              <div className="py-6 text-center text-xs font-mono text-slate-400">
                Memuat soal &amp; kunci evaluasi dari server...
              </div>
            ) : instructorExamQuestions.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-dashed border-slate-300 dark:border-[#1e2a3f]">
                {language === 'en'
                  ? `No ${evalKeyType} questions configured for Meeting ${currentMeetingNo} yet.`
                  : `Belum ada soal & kunci ${evalKeyType.toUpperCase()} untuk Pertemuan ${currentMeetingNo}. Gunakan editor di atas untuk menambahkan.`}
              </div>
            ) : (
              <div className="space-y-2.5">
                {instructorExamQuestions.map((q, idx) => {
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
                      <th className="py-2 px-3">Pertemuan</th>
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
                        <td className="py-2 px-3 text-sky-700 dark:text-[#00e5ff] font-bold">
                          P{att.meetingNo || 1}
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

      {/* TAB: Contextual Discussion per Class & Meeting */}
      {!isPreviewMode && activeTab === 'discussion' && classData?.id && (
        <DiscussionTab
          embedded
          classId={classData.id}
          classNameTitle={classData?.name || classData?.title || ''}
          meetingNo={currentMeetingNo}
          meetingTitle={selectedMeeting?.title || ''}
        />
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
