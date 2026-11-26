import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import { auth } from '../../firebase';
import { setLocalExamSession } from '../../services/aiService';
import {
  archiveMeetingExamByInstructor,
  fetchAssignmentsWithUserSubmissions,
  fetchClassExamAttempts,
  fetchClassMembers,
  fetchClassSubmissionsForGrading,
  fetchInstructorAnswerKey,
  fetchLearningProgressByClass,
  fetchMeetingExam,
  fetchUserClassExamAttempts,
  createAssignmentInFirestore,
  updateAssignmentInFirestore,
  deleteAssignmentInFirestore,
  deleteMeetingExamByInstructor,
  gradeSubmissionInFirestore,
  joinClassWithToken,
  saveMeetingExamByInstructor,
  submitAssignmentToFirestore,
  cancelSubmissionInFirestore,
  normalizeHttpsImageUrl,
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
import {
  uploadMediaFile,
  isValidExternalUrl,
  detectMaterialFileType,
  MATERIAL_ALLOWED_ACCEPT,
  SUBMISSION_ALLOWED_ACCEPT,
} from '../../services/cloudinaryService';
import DeltaContentRenderer from '../common/DeltaContentRenderer';
import CoverImageField from '../common/CoverImageField';
import SafeImage from '../common/SafeImage';
import AttendanceQrModal from '../common/AttendanceQrModal';
import { AccessibleDialog } from '../common/AccessibleDialog';
import {
  parseAikenQuestions,
  AIKEN_SAMPLE_TEMPLATE,
} from '../../services/aikenParser';
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
  Eye,
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
  Image as ImageIcon,
  Paperclip,
} from 'lucide-react';

const DEFAULT_EXAM_DURATION_MINUTES = 15;

function parseExamTimestampMs(rawValue) {
  if (!rawValue) return null;
  if (typeof rawValue?.toMillis === 'function') {
    const ms = rawValue.toMillis();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : null;
  }
  const parsed = Date.parse(String(rawValue));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toDateTimeLocalInputValue(rawValue) {
  const ms = parseExamTimestampMs(rawValue);
  if (!ms) return '';
  const dt = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function getExamDraftStorageKey(classId, meetingNo, examType, uid) {
  const cleanClassId = String(classId || '').trim();
  const cleanUid = String(uid || '').trim();
  if (!cleanClassId || !cleanUid) return '';
  const safeType = examType === 'posttest' ? 'posttest' : 'pretest';
  return `smartsa_exam_draft_${cleanClassId}_m${Number(meetingNo || 1)}_${safeType}_${cleanUid}`;
}

function readExamDraftAnswers(storageKey) {
  if (!storageKey || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeExamDraftAnswers(storageKey, answers) {
  if (!storageKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(answers || {}));
  } catch {
    // ignore storage quota errors
  }
}

function clearExamDraftAnswers(storageKey) {
  if (!storageKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore storage errors
  }
}

function resolveAttemptStudentDisplay(attempt, memberByUid) {
  const uid = String(attempt?.uid || '').trim();
  const member = uid && memberByUid ? memberByUid.get(uid) || null : null;
  const rawAttemptName = String(attempt?.studentName || '').trim();
  const validAttemptName = rawAttemptName && rawAttemptName !== 'Mahasiswa' ? rawAttemptName : '';
  const memberName = String(
    member?.studentName || member?.displayName || member?.name || ''
  ).trim();
  const validMemberName = memberName && memberName !== 'Mahasiswa' ? memberName : '';
  const email = String(attempt?.studentEmail || member?.email || '').trim();
  const displayName = validAttemptName || validMemberName || email || uid || attempt?.id || 'Mahasiswa';
  return {
    uid: uid || attempt?.id || '',
    displayName,
    email,
  };
}

function createEmptyExamQuestion(nextIndex = 1) {
  return {
    id: `q${nextIndex}`,
    question: '',
    options: ['', '', '', '', ''],
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

    if (parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com')) {
      const vid = parsed.searchParams.get('v');
      if (vid) return { kind: 'iframe', src: `https://www.youtube.com/embed/${vid}` };
      if (parsed.pathname.startsWith('/embed/')) {
        return { kind: 'iframe', src: `https://www.youtube.com${parsed.pathname}` };
      }
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch?.[1]) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${shortsMatch[1]}` };
      }
      const liveMatch = parsed.pathname.match(/^\/live\/([^/?#]+)/);
      if (liveMatch?.[1]) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${liveMatch[1]}` };
      }
    }
    if (parsed.hostname === 'youtu.be') {
      const vid = parsed.pathname.split('/').filter(Boolean)[0];
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

function getSafeHttpFileUrl(rawUrl) {
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
  initialMeetingNo = null,
  initialTab = null,
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

  const [activeTab, setActiveTab] = useState(() =>
    initialTab && ['meetings', 'exam', 'tasks', 'discussion'].includes(initialTab)
      ? initialTab
      : 'meetings'
  );
  const [meetingsList, setMeetingsList] = useState(() => getClassMeetingsList(classData));
  const [selectedMeeting, setSelectedMeeting] = useState(() => {
    const list = getClassMeetingsList(classData);
    if (initialMeetingNo) {
      const matched = list.find((m) => Number(m.order || 1) === Number(initialMeetingNo));
      if (matched) return matched;
    }
    return list[0] || null;
  });

  // Syllabus Preview Join State
  const [joiningClass, setJoiningClass] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);

  // Instructor Class Info Edit State
  const [isEditingClassInfo, setIsEditingClassInfo] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editClassDesc, setEditClassDesc] = useState('');
  const [editClassDay, setEditClassDay] = useState('');
  const [editClassTime, setEditClassTime] = useState('');
  const [editClassCoverImage, setEditClassCoverImage] = useState('');
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
  const [gradingMeetingFilter, setGradingMeetingFilter] = useState('all');
  const [gradingAssignmentFilter, setGradingAssignmentFilter] = useState('all');

  // Instructor Task Creation, Edit & Delete State
  const [newTaskMeetingNo, setNewTaskMeetingNo] = useState(1);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState('individu');
  const [newTaskDeadline, setNewTaskDeadline] = useState('2026-12-15T23:59');
  const [newTaskNote, setNewTaskNote] = useState('');
  const [newTaskAttachmentUrl, setNewTaskAttachmentUrl] = useState('');
  const [newTaskAttachmentName, setNewTaskAttachmentName] = useState('');
  const [newTaskAttachmentSize, setNewTaskAttachmentSize] = useState('');
  const [uploadingTaskAttachment, setUploadingTaskAttachment] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [createTaskNotice, setCreateTaskNotice] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [uploadingEditTaskAttachment, setUploadingEditTaskAttachment] = useState(false);
  const [savingAssignmentEdit, setSavingAssignmentEdit] = useState(false);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] = useState(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  // Instructor Per-Meeting Material Files & Video CRUD State
  const [materialTitleInput, setMaterialTitleInput] = useState('');
  const [materialDescInput, setMaterialDescInput] = useState('');
  const [materialFileUrlInput, setMaterialFileUrlInput] = useState('');
  const [materialFileNameInput, setMaterialFileNameInput] = useState('');
  const [materialFileTypeInput, setMaterialFileTypeInput] = useState('file');
  const [materialMimeTypeInput, setMaterialMimeTypeInput] = useState('');
  const [materialFileSizeInput, setMaterialFileSizeInput] = useState('');
  const [materialStorageTypeInput, setMaterialStorageTypeInput] = useState('cloudinary');
  const [uploadingMaterialFile, setUploadingMaterialFile] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialFeedback, setMaterialFeedback] = useState(null);
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState(null);
  const [previewMaterialFile, setPreviewMaterialFile] = useState(null);

  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState(null);

  // Instructor Exam Keys, Questions CRUD & Analytics State
  const [evalKeyType, setEvalKeyType] = useState('pretest');
  const [instructorKeyMap, setInstructorKeyMap] = useState(null);
  const [instructorKeySource, setInstructorKeySource] = useState('');
  const [classExamAttempts, setClassExamAttempts] = useState([]);
  const [classMembersList, setClassMembersList] = useState([]);
  const [evalAnalyticsLoading, setEvalAnalyticsLoading] = useState(false);
  const [evalAnalyticsError, setEvalAnalyticsError] = useState('');
  const [showExamEditor, setShowExamEditor] = useState(false);
  const [examEditorMode, setExamEditorMode] = useState('visual');
  const [aikenInput, setAikenInput] = useState('');
  const [examDraftTitle, setExamDraftTitle] = useState('');
  const [examDraftStatus, setExamDraftStatus] = useState('published');
  const [examDraftDurationMinutes, setExamDraftDurationMinutes] = useState(
    DEFAULT_EXAM_DURATION_MINUTES
  );
  const [examDraftDeadline, setExamDraftDeadline] = useState('');
  const [examDraftQuestions, setExamDraftQuestions] = useState([]);
  const [examDraftAnswerKey, setExamDraftAnswerKey] = useState({});
  const [savingExam, setSavingExam] = useState(false);
  const [archivingExam, setArchivingExam] = useState(false);
  const [deletingExam, setDeletingExam] = useState(false);
  const [confirmDeleteExam, setConfirmDeleteExam] = useState(false);
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
  const [examTimer, setExamTimer] = useState(DEFAULT_EXAM_DURATION_MINUTES * 60);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [examScore, setExamScore] = useState(null);
  const [examSubmitting, setExamSubmitting] = useState(false);
  const [examError, setExamError] = useState(null);
  const [examNote, setExamNote] = useState('');

  const examEndTimeRef = useRef(null);
  const selectedAnswersRef = useRef({});
  const examTypeRef = useRef('pretest');
  const recoveredAttemptIdRef = useRef('');
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
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupMembersInput, setGroupMembersInput] = useState('');
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
      setActiveTab(
        initialTab && ['meetings', 'exam', 'tasks', 'discussion'].includes(initialTab)
          ? initialTab
          : 'meetings'
      );
      setProgressFeedback(null);
      setExamActive(false);
      setExamFinished(false);
      setExamScore(null);
      setExamError(null);
      setExamNote('');
      setSelectedAnswers({});
      recoveredAttemptIdRef.current = '';
      setClassMembersList([]);
      setConfirmDeleteExam(false);
      setShowExamEditor(false);
      setExamEditorMode('visual');
      setAikenInput('');
      setExamDraftStatus('published');
      setExamDraftDurationMinutes(DEFAULT_EXAM_DURATION_MINUTES);
      setExamDraftDeadline('');
      setGradingMeetingFilter('all');
      setGradingAssignmentFilter('all');
      setEditingAssignment(null);
      setDeleteAssignmentTarget(null);
      setTaskFeedback(null);
      setCreateTaskNotice(null);
      setAttFeedback(null);
      setGradingNotice(null);
      setEditingMeetingId(null);
      setExamSaveFeedback(null);
      setMaterialFeedback(null);
      setDeleteMaterialTarget(null);
      setPreviewMaterialFile(null);
      setVideoFeedback(null);
      const initialMatched = initialMeetingNo
        ? nextMeetings.find((m) => Number(m.order || 1) === Number(initialMeetingNo))
        : null;
      setSelectedMeeting(initialMatched || nextMeetings[0] || null);
      return;
    }
    setSelectedMeeting((prev) => {
      if (initialMeetingNo) {
        const matched = nextMeetings.find((m) => Number(m.order || 1) === Number(initialMeetingNo));
        if (matched) return matched;
      }
      if (prev && nextMeetings.some((m) => m.id === prev.id)) {
        return nextMeetings.find((m) => m.id === prev.id) || nextMeetings[0] || null;
      }
      return nextMeetings[0] || null;
    });
  }, [classData, initialMeetingNo, initialTab]);

  useEffect(() => {
    if (initialTab && ['meetings', 'exam', 'tasks', 'discussion'].includes(initialTab)) {
      setActiveTab(initialTab);
    }
    if (initialMeetingNo && meetingsList.length > 0) {
      const matched = meetingsList.find((m) => Number(m.order || 1) === Number(initialMeetingNo));
      if (matched) {
        setSelectedMeeting(matched);
      }
    }
  }, [initialTab, initialMeetingNo, meetingsList]);

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
        if (currentUser && targetClassId && !isPreviewMode) {
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
  }, [classData?.id, classData?.name, currentUser, isPreviewMode]);

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
      const [subs, members, taskRes] = await Promise.all([
        fetchClassSubmissionsForGrading(targetClassId),
        fetchClassMembers(targetClassId),
        fetchAssignmentsWithUserSubmissions({ classId: targetClassId }),
      ]);
      if (!mountedRef.current || reqId !== gradingReqIdRef.current || classIdRef.current !== targetClassId) {
        return;
      }
      setClassSubmissions(subs || []);
      setClassMembersList(members || []);
      setTaskSubmissions(taskRes?.assignments || []);
      const initialGrades = {};
      const initialFeedbacks = {};
      (subs || []).forEach((s) => {
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
    if (!classData?.id || meetingsList.length === 0 || isPreviewMode) {
      setMeetingExams({ pretest: null, posttest: null });
      return;
    }
    void loadMeetingExams(classData.id, currentMeetingNo);
  }, [classData?.id, currentMeetingNo, currentUser, meetingsList.length, isPreviewMode, loadMeetingExams]);

  useEffect(() => {
    setMaterialTitleInput('');
    setMaterialDescInput('');
    setMaterialFileUrlInput('');
    setMaterialFileNameInput('');
    setMaterialFileTypeInput('file');
    setMaterialMimeTypeInput('');
    setMaterialFileSizeInput('');
    setMaterialStorageTypeInput('cloudinary');
    setMaterialFeedback(null);
    setDeleteMaterialTarget(null);
    setPreviewMaterialFile(null);
    setVideoUrlInput(selectedMeeting?.videoUrl ?? '');
    setVideoFeedback(null);
  }, [selectedMeeting?.id, selectedMeeting?.videoUrl]);

  const loadInstructorEvalAnalytics = useCallback(
    async (targetExamType = evalKeyType, targetMeetingNo = currentMeetingNo) => {
      if (!classData?.id) return;
      const reqId = ++evalReqIdRef.current;
      const targetClassId = classData.id;
      setEvalAnalyticsLoading(true);
      setEvalAnalyticsError('');
      try {
        const [keyRes, examRes, attempts, members] = await Promise.all([
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
          fetchClassMembers(targetClassId),
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
        setClassMembersList(members || []);

        setExamDraftStatus(loadedExam?.status || 'published');
        setExamDraftDurationMinutes(
          Number(loadedExam?.durationMinutes) || DEFAULT_EXAM_DURATION_MINUTES
        );
        setExamDraftDeadline(toDateTimeLocalInputValue(loadedExam?.deadline));

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
              options: Array.isArray(q.options) ? [...q.options] : ['', '', '', '', ''],
            }))
          );
          setExamDraftAnswerKey({ ...loadedKeyMap });
          setShowExamEditor(false);
          setExamEditorMode('visual');
        } else {
          setExamDraftTitle(
            `${targetExamType === 'posttest' ? 'Post-test' : 'Pretest'} Pertemuan ${targetMeetingNo}`
          );
          setExamDraftQuestions([createEmptyExamQuestion(1)]);
          setExamDraftAnswerKey({ q1: 0 });
          setShowExamEditor(true);
          setExamEditorMode('visual');
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
        const activeUid = auth.currentUser?.uid || currentUser?.uid || '';
        clearExamDraftAnswers(
          getExamDraftStorageKey(targetClassId, targetMeetingNo, typeToGrade, activeUid)
        );
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
      const fallbackMinutes =
        Number(activeStudentExam?.durationMinutes) > 0
          ? Number(activeStudentExam.durationMinutes)
          : DEFAULT_EXAM_DURATION_MINUTES;
      examEndTimeRef.current = Date.now() + fallbackMinutes * 60 * 1000;
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

  useEffect(() => {
    if (isEducatorOrAdmin || isPreviewMode || examActive || examFinished || !classData?.id) {
      return;
    }
    const activeUid = currentUser?.uid || auth?.currentUser?.uid || '';
    if (!activeUid || !Array.isArray(userExamAttempts) || userExamAttempts.length === 0) {
      return;
    }

    const activeAttempt = userExamAttempts.find((attempt) => {
      const isInProgress =
        attempt?.status === 'in_progress' ||
        (attempt?.examActive === true && attempt?.status !== 'submitted');
      if (!isInProgress) return false;
      const expiresAtMs = parseExamTimestampMs(attempt?.examExpiresAt ?? attempt?.expiresAt);
      return expiresAtMs !== null && expiresAtMs > Date.now();
    });
    if (!activeAttempt) return;

    const targetMeetingNo = Number(activeAttempt.meetingNo || 1);
    const targetType = activeAttempt.examType === 'posttest' ? 'posttest' : 'pretest';
    const resolvedAttemptId =
      activeAttempt.id ||
      activeAttempt.attemptId ||
      `${classData.id}_m${targetMeetingNo}_${targetType}_${activeUid}`;

    if (recoveredAttemptIdRef.current === resolvedAttemptId) return;

    if (targetMeetingNo !== currentMeetingNo) {
      const targetMeeting = meetingsList.find(
        (m) => Number(m.order || 1) === targetMeetingNo
      );
      if (targetMeeting) {
        setSelectedMeeting(targetMeeting);
      }
      return;
    }

    const targetExam = meetingExams[targetType];
    if (!targetExam || !Array.isArray(targetExam.questions) || targetExam.questions.length === 0) {
      return;
    }
    if (String(targetExam.status || 'published').trim().toLowerCase() !== 'published') {
      return;
    }

    const expiresAtMs = parseExamTimestampMs(
      activeAttempt.examExpiresAt ?? activeAttempt.expiresAt
    );
    if (!expiresAtMs || expiresAtMs <= Date.now()) return;

    const remainingSecs = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
    const draftKey = getExamDraftStorageKey(classData.id, targetMeetingNo, targetType, activeUid);
    const restoredAnswers = readExamDraftAnswers(draftKey);

    recoveredAttemptIdRef.current = resolvedAttemptId;
    meetingNoRef.current = targetMeetingNo;
    examEndTimeRef.current = expiresAtMs;
    selectedAnswersRef.current = restoredAnswers;
    examTypeRef.current = targetType;

    setExamType(targetType);
    setExamTimer(remainingSecs);
    setSelectedAnswers(restoredAnswers);
    setExamFinished(false);
    setExamScore(null);
    setExamError(null);
    setExamActive(true);
    setActiveTab('exam');

    setLocalExamSession({
      classId: classData.id,
      meetingNo: targetMeetingNo,
      examType: targetType,
      active: true,
      durationMs: remainingSecs * 1000,
    });
  }, [
    isEducatorOrAdmin,
    isPreviewMode,
    examActive,
    examFinished,
    classData?.id,
    currentUser?.uid,
    userExamAttempts,
    currentMeetingNo,
    meetingsList,
    meetingExams,
  ]);

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

    const targetExamStatus = String(targetExam.status || 'published').trim().toLowerCase();
    if (targetExamStatus === 'draft') {
      setExamError(
        language === 'en'
          ? 'This assessment is still in draft mode and has not been published by the lecturer.'
          : 'Evaluasi ini masih berstatus draft dan belum dipublikasikan oleh dosen.'
      );
      return;
    }
    if (targetExamStatus === 'archived') {
      setExamError(
        language === 'en'
          ? 'This assessment has been archived and is closed for submissions.'
          : 'Evaluasi ini telah diarsipkan dan tidak lagi menerima pengerjaan.'
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
    if (type === 'posttest' && cycle.posttestDone) {
      setExamError(
        language === 'en'
          ? 'Post-test for this meeting is already completed and locked.'
          : 'Post-test pertemuan ini sudah selesai dikumpulkan dan dikunci.'
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

    let startData = null;
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
      if (!isJson) {
        setExamError(
          language === 'en'
            ? 'Server assessment endpoint /api/grade is unavailable in this environment.'
            : 'Endpoint evaluasi server /api/grade tidak aktif di lingkungan ini.'
        );
        return;
      }
      startData = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && startData?.code === 'EXAM_ALREADY_SUBMITTED') {
          upsertLocalAttempt({
            ...startData,
            meetingNo: startData.meetingNo || targetMeetingNo,
            examType: startData.examType || type,
          });
        }
        setExamError(startData?.error || 'Gagal memulai sesi evaluasi di server.');
        return;
      }
    } catch (err) {
      setExamError(err.message || 'Gagal memulai sesi evaluasi di server.');
      return;
    }

    const fallbackMinutes =
      Number(targetExam?.durationMinutes) > 0
        ? Number(targetExam.durationMinutes)
        : DEFAULT_EXAM_DURATION_MINUTES;
    const serverExpiresAtMs = parseExamTimestampMs(startData?.examExpiresAt ?? startData?.expiresAt);
    const nowMs = Date.now();
    const resolvedEndTimeMs =
      serverExpiresAtMs !== null ? serverExpiresAtMs : nowMs + fallbackMinutes * 60 * 1000;
    const resolvedRemainingSeconds = Math.max(0, Math.ceil((resolvedEndTimeMs - nowMs) / 1000));
    const activeUid = auth.currentUser?.uid || currentUser?.uid || '';
    const draftKey = getExamDraftStorageKey(targetClassId, targetMeetingNo, type, activeUid);
    const restoredDraftAnswers = startData?.resumed ? readExamDraftAnswers(draftKey) : {};

    recoveredAttemptIdRef.current =
      startData?.attemptId || `${targetClassId}_m${targetMeetingNo}_${type}_${activeUid}`;
    meetingNoRef.current = targetMeetingNo;
    examEndTimeRef.current = resolvedEndTimeMs;
    selectedAnswersRef.current = restoredDraftAnswers;
    examTypeRef.current = type;

    setExamType(type);
    setExamActive(true);
    setExamTimer(resolvedRemainingSeconds);
    setExamFinished(false);
    setExamScore(null);
    setSelectedAnswers(restoredDraftAnswers);
    setActiveTab('exam');

    setLocalExamSession({
      classId: targetClassId,
      meetingNo: targetMeetingNo,
      examType: type,
      active: true,
      durationMs: Math.max(1000, resolvedRemainingSeconds * 1000),
    });
  };

  const handleAnswerSelect = (qId, optionIdx) => {
    setSelectedAnswers((prev) => {
      const next = { ...prev, [qId]: optionIdx };
      selectedAnswersRef.current = next;
      const activeUid = auth?.currentUser?.uid || currentUser?.uid || '';
      const draftKey = getExamDraftStorageKey(
        classIdRef.current,
        meetingNoRef.current,
        examTypeRef.current,
        activeUid
      );
      if (draftKey) {
        writeExamDraftAnswers(draftKey, next);
      }
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

  const handleUploadMaterialFileToCloudinary = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isEducatorOrAdmin || savingMaterial || uploadingMaterialFile) return;

    setUploadingMaterialFile(true);
    setMaterialFeedback(null);
    try {
      const uploadResult = await uploadMediaFile(file, 'document');
      if (uploadResult?.isLive && uploadResult.url) {
        const cleanUrl = normalizeHttpsImageUrl(
          uploadResult.url,
          language === 'en' ? 'Material file URL' : 'URL berkas materi'
        );
        const detectedType = detectMaterialFileType(file.name, file.type);
        setMaterialFileUrlInput(cleanUrl);
        setMaterialFileNameInput(file.name);
        setMaterialFileTypeInput(detectedType);
        setMaterialMimeTypeInput(file.type || '');
        setMaterialFileSizeInput(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
        setMaterialStorageTypeInput('cloudinary');
        if (!materialTitleInput.trim()) {
          setMaterialTitleInput(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
        }
        setMaterialFeedback({
          type: 'success',
          text:
            language === 'en'
              ? `File "${file.name}" uploaded to Cloudinary CDN. Click Save Material File to publish.`
              : `Berkas "${file.name}" berhasil diunggah ke Cloudinary CDN. Klik Simpan Materi File untuk menambahkan ke pertemuan.`,
        });
      } else {
        setMaterialFeedback({
          type: 'error',
          text:
            uploadResult?.note ||
            (language === 'en'
              ? 'Cloudinary upload is not active on the server. Paste a valid https:// file URL below.'
              : 'Unggah Cloudinary tidak aktif di server; tempelkan tautan berkas https:// di kolom URL.'),
        });
      }
    } catch (err) {
      setMaterialFeedback({
        type: 'error',
        text:
          err.message ||
          (language === 'en' ? 'Failed to upload material file.' : 'Gagal mengunggah berkas materi.'),
      });
    } finally {
      setUploadingMaterialFile(false);
    }
  };

  const handleAddMaterialFile = async (e) => {
    e.preventDefault();
    if (
      !isEducatorOrAdmin ||
      !selectedMeeting ||
      savingMaterial ||
      uploadingMaterialFile ||
      !classData?.id
    ) {
      return;
    }

    const cleanTitle = materialTitleInput.trim();
    if (!cleanTitle) {
      setMaterialFeedback({
        type: 'error',
        text: language === 'en' ? 'Material title is required.' : 'Judul materi wajib diisi.',
      });
      return;
    }

    let cleanUrl = '';
    try {
      cleanUrl = normalizeHttpsImageUrl(
        materialFileUrlInput.trim(),
        language === 'en' ? 'Material file URL' : 'URL berkas materi'
      );
    } catch (err) {
      setMaterialFeedback({ type: 'error', text: err.message });
      return;
    }

    if (!cleanUrl) {
      setMaterialFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Upload a material file or enter a valid https:// file URL.'
            : 'Unggah berkas materi atau masukkan URL berkas berawalan https:// terlebih dahulu.',
      });
      return;
    }

    setSavingMaterial(true);
    setMaterialFeedback(null);
    try {
      const existingFiles = Array.isArray(selectedMeeting.materialFiles)
        ? selectedMeeting.materialFiles
        : [];
      const resolvedFileName =
        materialFileNameInput.trim() || cleanUrl.split('/').pop()?.split('?')[0] || cleanTitle;
      const resolvedFileType =
        materialFileTypeInput && materialFileTypeInput !== 'file'
          ? materialFileTypeInput
          : detectMaterialFileType(resolvedFileName, materialMimeTypeInput);

      const newFileEntry = {
        id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: cleanTitle,
        description: materialDescInput.trim(),
        fileUrl: cleanUrl,
        fileName: resolvedFileName,
        fileType: resolvedFileType,
        mimeType: materialMimeTypeInput || '',
        fileSize: materialFileSizeInput || '',
        storageType: cleanUrl.includes('res.cloudinary.com')
          ? materialStorageTypeInput
          : 'external_url',
        uploadedAt: new Date().toISOString(),
      };

      const nextMaterialFiles = [...existingFiles, newFileEntry];
      await saveMeetingContentPatch(selectedMeeting, { materialFiles: nextMaterialFiles });

      setMaterialTitleInput('');
      setMaterialDescInput('');
      setMaterialFileUrlInput('');
      setMaterialFileNameInput('');
      setMaterialFileTypeInput('file');
      setMaterialMimeTypeInput('');
      setMaterialFileSizeInput('');
      setMaterialStorageTypeInput('cloudinary');
      setPreviewMaterialFile(newFileEntry);
      setMaterialFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Material "${newFileEntry.title}" added to Meeting ${selectedMeeting.order}.`
            : `Materi "${newFileEntry.title}" berhasil ditambahkan ke Pertemuan ${selectedMeeting.order}.`,
      });
    } catch (err) {
      setMaterialFeedback({
        type: 'error',
        text: err.message || 'Gagal menyimpan materi file pertemuan.',
      });
    } finally {
      setSavingMaterial(false);
    }
  };

  const executeDeleteMaterialFile = async () => {
    if (
      !isEducatorOrAdmin ||
      !selectedMeeting ||
      savingMaterial ||
      !deleteMaterialTarget?.id ||
      !classData?.id
    ) {
      return;
    }
    setSavingMaterial(true);
    setMaterialFeedback(null);
    try {
      const targetId = deleteMaterialTarget.id;
      const targetTitle = deleteMaterialTarget.title || deleteMaterialTarget.fileName || '';
      const existingFiles = Array.isArray(selectedMeeting.materialFiles)
        ? selectedMeeting.materialFiles
        : [];
      const nextMaterialFiles = existingFiles.filter((f) => f.id !== targetId);
      await saveMeetingContentPatch(selectedMeeting, { materialFiles: nextMaterialFiles });
      setDeleteMaterialTarget(null);
      setPreviewMaterialFile((prev) => (prev?.id === targetId ? null : prev));
      setMaterialFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `Material "${targetTitle}" removed.`
            : `Materi "${targetTitle}" berhasil dihapus dari pertemuan.`,
      });
    } catch (err) {
      setMaterialFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus berkas materi pertemuan.',
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
        const nextOpts = [...(q.options || ['', '', '', '', ''])];
        nextOpts[optIdx] = value;
        return { ...q, options: nextOpts };
      })
    );
  };

  const handleAddDraftOption = (qId) => {
    setExamDraftQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const currentOpts = Array.isArray(q.options) ? q.options : ['', ''];
        if (currentOpts.length >= 6) return q;
        return { ...q, options: [...currentOpts, ''] };
      })
    );
  };

  const handleRemoveDraftOption = (qId, optIdx) => {
    const targetQuestion = examDraftQuestions.find((q) => q.id === qId);
    const currentLen = Array.isArray(targetQuestion?.options) ? targetQuestion.options.length : 0;
    if (currentLen <= 2) return;
    const nextLen = currentLen - 1;

    setExamDraftQuestions((prev) =>
      prev.map((q) =>
        q.id === qId && Array.isArray(q.options) && q.options.length > 2
          ? { ...q, options: q.options.filter((_, idx) => idx !== optIdx) }
          : q
      )
    );
    setExamDraftAnswerKey((prev) => {
      const prevIdx = Number(prev?.[qId] ?? 0);
      const shiftedIdx = prevIdx === optIdx ? 0 : prevIdx > optIdx ? prevIdx - 1 : prevIdx;
      return {
        ...prev,
        [qId]: Math.max(0, Math.min(nextLen - 1, shiftedIdx)),
      };
    });
  };

  const handleUpdateDraftAnswerKey = (qId, optionIdx) => {
    setExamDraftAnswerKey((prev) => ({
      ...prev,
      [qId]: Number(optionIdx),
    }));
  };

  const handleUploadAikenTxtFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      setAikenInput(content);
      setExamSaveFeedback(null);
    } catch (err) {
      setExamSaveFeedback({
        type: 'error',
        text: err?.message || 'Gagal membaca isi berkas teks Aiken (.txt).',
      });
    }
  };

  const handleApplyAikenImport = (mode = 'append') => {
    const usedNums = examDraftQuestions.map(
      (q) => Number(String(q.id || '').replace(/\D+/g, '')) || 0
    );
    const maxNum = usedNums.length > 0 ? Math.max(...usedNums) : examDraftQuestions.length;
    const startIndex = mode === 'replace' ? 1 : maxNum + 1;
    const parsed = parseAikenQuestions(aikenInput, { startIndex });

    if (parsed.questions.length === 0) {
      setExamSaveFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'No valid Aiken questions found to import.'
            : 'Tidak ada soal format Aiken valid yang dapat diimpor.',
      });
      return;
    }

    const sanitizedDrafts = parsed.questions.map((item) => ({
      id: item.id,
      question: item.question,
      options: [...item.options],
    }));

    if (mode === 'replace') {
      setExamDraftQuestions(sanitizedDrafts);
      setExamDraftAnswerKey({ ...parsed.answerKey });
    } else {
      setExamDraftQuestions((prev) => [...prev, ...sanitizedDrafts]);
      setExamDraftAnswerKey((prev) => ({ ...prev, ...parsed.answerKey }));
    }

    setAikenInput('');
    setExamEditorMode('visual');
    setExamSaveFeedback({
      type: 'success',
      text:
        language === 'en'
          ? `Imported ${sanitizedDrafts.length} questions from Aiken format into draft. Click Save Questions & Keys to publish.`
          : `Berhasil mengimpor ${sanitizedDrafts.length} soal format Aiken ke draf. Klik Simpan Soal & Kunci ke Server untuk mempublikasikan.`,
    });
  };

  const handleSaveMeetingExam = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingExam || !classData?.id || !selectedMeeting) return;

    const cleanStatus = ['published', 'draft', 'archived'].includes(
      String(examDraftStatus || '').trim().toLowerCase()
    )
      ? String(examDraftStatus).trim().toLowerCase()
      : 'published';

    const parsedDuration = Number(examDraftDurationMinutes);
    if (!Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 180) {
      setExamSaveFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Duration must be a whole number between 1 and 180 minutes.'
            : 'Durasi ujian harus berupa bilangan bulat antara 1 hingga 180 menit.',
      });
      return;
    }

    let deadlineIso = null;
    const rawDeadline = String(examDraftDeadline || '').trim();
    if (rawDeadline) {
      const parsedDeadlineMs = Date.parse(rawDeadline);
      if (Number.isNaN(parsedDeadlineMs)) {
        setExamSaveFeedback({
          type: 'error',
          text:
            language === 'en'
              ? 'Deadline date/time format is invalid.'
              : 'Format batas waktu (deadline) evaluasi tidak valid.',
        });
        return;
      }
      deadlineIso = new Date(parsedDeadlineMs).toISOString();
    }

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
      if (!q.question || q.options.length < 2 || q.options.length > 6 || q.options.some((opt) => !opt)) {
        setExamSaveFeedback({
          type: 'error',
          text:
            language === 'en'
              ? `Question ${i + 1} requires question text and 2 to 6 non-empty options.`
              : `Soal ${i + 1} wajib memiliki teks pertanyaan dan 2–6 opsi terisi.`,
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
        status: cleanStatus,
        durationMinutes: parsedDuration,
        deadline: deadlineIso,
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

  const handleArchiveMeetingExam = async () => {
    if (!isEducatorOrAdmin || archivingExam || !classData?.id || !selectedMeeting) return;
    setArchivingExam(true);
    setExamSaveFeedback(null);
    try {
      await archiveMeetingExamByInstructor({
        classId: classData.id,
        meetingNo: currentMeetingNo,
        examType: evalKeyType,
      });
      setExamDraftStatus('archived');
      await loadInstructorEvalAnalytics(evalKeyType, currentMeetingNo);
      setExamSaveFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `${evalKeyType.toUpperCase()} for Meeting ${currentMeetingNo} archived.`
            : `Evaluasi ${evalKeyType.toUpperCase()} Pertemuan ${currentMeetingNo} berhasil diarsipkan.`,
      });
    } catch (err) {
      setExamSaveFeedback({
        type: 'error',
        text: err.message || 'Gagal mengarsipkan evaluasi.',
      });
    } finally {
      setArchivingExam(false);
    }
  };

  const executeDeleteMeetingExam = async () => {
    if (!isEducatorOrAdmin || deletingExam || !classData?.id || !selectedMeeting) return;
    setDeletingExam(true);
    setExamSaveFeedback(null);
    try {
      await deleteMeetingExamByInstructor({
        classId: classData.id,
        meetingNo: currentMeetingNo,
        examType: evalKeyType,
      });
      setConfirmDeleteExam(false);
      setShowExamEditor(false);
      await loadInstructorEvalAnalytics(evalKeyType, currentMeetingNo);
      setExamSaveFeedback({
        type: 'success',
        text:
          language === 'en'
            ? `${evalKeyType.toUpperCase()} for Meeting ${currentMeetingNo} deleted from server.`
            : `Evaluasi ${evalKeyType.toUpperCase()} Pertemuan ${currentMeetingNo} berhasil dihapus.`,
      });
    } catch (err) {
      setExamSaveFeedback({
        type: 'error',
        text: err.message || 'Gagal menghapus evaluasi.',
      });
    } finally {
      setDeletingExam(false);
    }
  };

  const handleTaskFileSubmit = async (e) => {
    e.preventDefault();
    if (!activeTaskModal || isUploading) return;
    if (typeof activeTaskModal.grade === 'number') {
      setTaskFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'This assignment has already been graded by the lecturer and is locked.'
            : 'Tugas ini sudah dinilai oleh dosen dan dikunci.',
      });
      return;
    }

    const activeTaskType = activeTaskModal.taskType === 'kelompok' ? 'kelompok' : 'individu';
    const cleanGroupName = groupNameInput.trim();
    const parsedGroupMembers = groupMembersInput
      .split(/[\r\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (activeTaskType === 'kelompok') {
      if (!cleanGroupName) {
        setTaskFeedback({
          type: 'error',
          text:
            language === 'en'
              ? 'Group name is required for group assignments.'
              : 'Nama Kelompok wajib diisi untuk tugas kelompok.',
        });
        return;
      }
      if (parsedGroupMembers.length === 0) {
        setTaskFeedback({
          type: 'error',
          text:
            language === 'en'
              ? 'List at least one group member (Name / Student ID).'
              : 'Daftar anggota kelompok (Nama / NIM) wajib diisi minimal 1 anggota.',
        });
        return;
      }
    }

    const cleanExternalUrl = externalUrlInput.trim();
    if (cleanExternalUrl && !isValidExternalUrl(cleanExternalUrl)) {
      setTaskFeedback({
        type: 'error',
        text: 'Tautan URL eksternal tidak valid. Harus diawali https:// atau http://',
      });
      return;
    }

    if (!uploadedFile && !cleanExternalUrl && !activeTaskModal.submittedFile?.url) {
      setTaskFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Upload a file via Cloudinary or enter an external https:// submission URL first.'
            : 'Pilih berkas dokumen atau masukkan tautan URL eksternal tugas terlebih dahulu!',
      });
      return;
    }

    setIsUploading(true);
    setTaskFeedback(null);

    try {
      let fileName = activeTaskModal.submittedFile?.name || '';
      let fileSize = activeTaskModal.submittedFile?.size || '';
      let fileUrl = activeTaskModal.submittedFile?.url || '';
      let storageType = activeTaskModal.submittedFile?.storageType || 'external_url';
      let extraNote = '';

      if (uploadedFile) {
        const uploadResult = isEducatorOrAdmin
          ? await uploadMediaFile(uploadedFile, 'document')
          : await uploadMediaFile(uploadedFile, 'submission', {
              classId: classData?.id || activeTaskModal.classId || '',
              assignmentId: activeTaskModal.id,
            });
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
      } else if (cleanExternalUrl) {
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
          taskType: activeTaskType,
          groupName: cleanGroupName,
          groupMembers: parsedGroupMembers,
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
                groupName: activeTaskType === 'kelompok' ? cleanGroupName : '',
                groupMembers: activeTaskType === 'kelompok' ? parsedGroupMembers : [],
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
        setGroupNameInput('');
        setGroupMembersInput('');
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
    const targetTask = taskSubmissions.find((tItem) => tItem.id === taskId);
    if (typeof targetTask?.grade === 'number') {
      setTaskFeedback({
        type: 'error',
        text:
          language === 'en'
            ? 'Graded submissions cannot be withdrawn.'
            : 'Pengumpulan yang sudah dinilai dosen tidak dapat dihapus atau ditarik kembali.',
      });
      setWithdrawConfirmTaskId(null);
      return;
    }
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

  const handleUploadTaskAttachmentFile = async (file, targetMode = 'create') => {
    if (!file || !isEducatorOrAdmin) return;
    if (targetMode === 'edit') {
      setUploadingEditTaskAttachment(true);
    } else {
      setUploadingTaskAttachment(true);
    }
    setCreateTaskNotice(null);
    try {
      const uploadResult = await uploadMediaFile(file, 'document');
      if (uploadResult?.isLive && uploadResult.url) {
        const cleanUrl = normalizeHttpsImageUrl(
          uploadResult.url,
          language === 'en' ? 'Assignment attachment URL' : 'URL lampiran tugas'
        );
        const sizeLabel = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        if (targetMode === 'edit') {
          setEditingAssignment((prev) =>
            prev
              ? {
                  ...prev,
                  attachmentUrl: cleanUrl,
                  attachmentName: file.name,
                  attachmentSize: sizeLabel,
                }
              : prev
          );
        } else {
          setNewTaskAttachmentUrl(cleanUrl);
          setNewTaskAttachmentName(file.name);
          setNewTaskAttachmentSize(sizeLabel);
        }
        setCreateTaskNotice({
          type: 'success',
          text:
            language === 'en'
              ? `Instruction file "${file.name}" attached via Cloudinary.`
              : `Lampiran instruksi "${file.name}" berhasil diunggah ke Cloudinary.`,
        });
      } else {
        setCreateTaskNotice({
          type: 'error',
          text:
            uploadResult?.note ||
            (language === 'en'
              ? 'Cloudinary upload is unavailable for task attachment.'
              : 'Unggah Cloudinary tidak tersedia untuk lampiran tugas.'),
        });
      }
    } catch (err) {
      setCreateTaskNotice({
        type: 'error',
        text: err.message || 'Gagal mengunggah lampiran instruksi tugas.',
      });
    } finally {
      if (targetMode === 'edit') {
        setUploadingEditTaskAttachment(false);
      } else {
        setUploadingTaskAttachment(false);
      }
    }
  };

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
        taskType: newTaskType,
        attachmentUrl: newTaskAttachmentUrl.trim(),
        attachmentName: newTaskAttachmentName.trim(),
        attachmentSize: newTaskAttachmentSize.trim(),
        deadline: newTaskDeadline,
        note: newTaskNote.trim(),
      });
      setTaskSubmissions((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskNote('');
      setNewTaskType('individu');
      setNewTaskAttachmentUrl('');
      setNewTaskAttachmentName('');
      setNewTaskAttachmentSize('');
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

  const handleOpenEditAssignment = (task) => {
    if (!task) return;
    setEditingAssignment({
      id: task.id,
      title: task.title || '',
      meetingNo: Number(task.meetingNo || 1),
      taskType: task.taskType === 'kelompok' ? 'kelompok' : 'individu',
      attachmentUrl: task.attachmentUrl || '',
      attachmentName: task.attachmentName || '',
      attachmentSize: task.attachmentSize || '',
      deadline: toDateTimeLocalInputValue(task.rawDeadline || task.deadline),
      note: task.note || '',
    });
    setCreateTaskNotice(null);
  };

  const handleSaveAssignmentEdit = async (e) => {
    e.preventDefault();
    if (!isEducatorOrAdmin || savingAssignmentEdit || !editingAssignment?.id) return;
    if (!editingAssignment.title.trim()) {
      setCreateTaskNotice({
        type: 'error',
        text: language === 'en' ? 'Task title is required.' : 'Judul tugas wajib diisi.',
      });
      return;
    }

    setSavingAssignmentEdit(true);
    setCreateTaskNotice(null);
    try {
      const updated = await updateAssignmentInFirestore(editingAssignment.id, {
        title: editingAssignment.title.trim(),
        meetingNo: Number(editingAssignment.meetingNo || 1),
        taskType: editingAssignment.taskType === 'kelompok' ? 'kelompok' : 'individu',
        attachmentUrl: editingAssignment.attachmentUrl || '',
        attachmentName: editingAssignment.attachmentName || '',
        attachmentSize: editingAssignment.attachmentSize || '',
        deadline: editingAssignment.deadline,
        note: editingAssignment.note,
      });
      setTaskSubmissions((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      setClassSubmissions((prev) =>
        prev.map((sub) =>
          sub.assignmentId === updated.id
            ? { ...sub, assignment: updated.title, meetingNo: updated.meetingNo }
            : sub
        )
      );
      setEditingAssignment(null);
      setCreateTaskNotice({
        type: 'success',
        text:
          language === 'en'
            ? `Task "${updated.title}" updated.`
            : `Tugas "${updated.title}" berhasil diperbarui.`,
      });
    } catch (err) {
      setCreateTaskNotice({
        type: 'error',
        text: err.message || 'Gagal memperbarui tugas pertemuan.',
      });
    } finally {
      setSavingAssignmentEdit(false);
    }
  };

  const executeDeleteAssignment = async () => {
    if (!isEducatorOrAdmin || deletingAssignment || !deleteAssignmentTarget?.id) return;
    setDeletingAssignment(true);
    setCreateTaskNotice(null);
    try {
      const deletedId = deleteAssignmentTarget.id;
      const deletedTitle = deleteAssignmentTarget.title || '';
      await deleteAssignmentInFirestore(deletedId);
      setTaskSubmissions((prev) => prev.filter((item) => item.id !== deletedId));
      setGradingAssignmentFilter((prev) => (prev === deletedId ? 'all' : prev));
      setDeleteAssignmentTarget(null);
      setCreateTaskNotice({
        type: 'success',
        text:
          language === 'en'
            ? `Task "${deletedTitle}" deleted from Firestore.`
            : `Tugas "${deletedTitle}" berhasil dihapus dari Firestore.`,
      });
    } catch (err) {
      setCreateTaskNotice({
        type: 'error',
        text: err.message || 'Gagal menghapus tugas dari Firestore.',
      });
    } finally {
      setDeletingAssignment(false);
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
    setEditClassCoverImage(classData?.coverImage || '');
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

    let cleanCoverImage = '';
    try {
      cleanCoverImage = normalizeHttpsImageUrl(
        editClassCoverImage,
        language === 'en' ? 'Class cover URL' : 'URL cover kelas'
      );
    } catch (err) {
      setClassInfoFeedback({
        type: 'error',
        text: err.message,
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
        coverImage: cleanCoverImage,
      });
      const resolvedCover =
        typeof updated.coverImage === 'string' ? updated.coverImage : cleanCoverImage;
      onClassUpdated?.({
        ...classData,
        name: updated.name || cleanName,
        title: updated.title || cleanName,
        description: typeof updated.description === 'string' ? updated.description : editClassDesc.trim(),
        day: typeof updated.day === 'string' ? updated.day : editClassDay,
        time: typeof updated.time === 'string' ? updated.time : editClassTime.trim(),
        coverImage: resolvedCover,
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
        { id: 'material', icon: FileText, label: language === 'en' ? 'MATERIALS' : 'MATERI FILE' },
        { id: 'video', icon: PlayCircle, label: 'VIDEO CDN' },
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
        { id: 'material', icon: FileText, label: language === 'en' ? 'MATERIALS' : 'MATERI FILE' },
        { id: 'video', icon: PlayCircle, label: 'VIDEO CDN' },
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
    setDeleteMaterialTarget(null);
    setPreviewMaterialFile(null);
    setVideoFeedback(null);
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

      <AccessibleDialog
        isOpen={confirmDeleteExam}
        variant="danger"
        title={language === 'en' ? 'Delete Evaluation' : 'Hapus Evaluasi'}
        message={
          language === 'en'
            ? `Delete ${evalKeyType.toUpperCase()} for Meeting ${currentMeetingNo}? Questions and server reference keys will be removed.`
            : `Hapus ${evalKeyType.toUpperCase()} pada Pertemuan ${currentMeetingNo}? Soal dan kunci jawaban server akan dihapus permanen.`
        }
        confirmLabel={language === 'en' ? 'Yes, Delete Exam' : 'Ya, Hapus Evaluasi'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => void executeDeleteMeetingExam()}
        onClose={() => setConfirmDeleteExam(false)}
      />

      <AccessibleDialog
        isOpen={Boolean(deleteMaterialTarget)}
        variant="danger"
        title={language === 'en' ? 'Delete Material File' : 'Hapus Materi File'}
        message={
          deleteMaterialTarget
            ? language === 'en'
              ? `Remove material file "${deleteMaterialTarget.title || deleteMaterialTarget.fileName}" from Meeting ${selectedMeeting?.order || 1}?`
              : `Hapus berkas materi "${deleteMaterialTarget.title || deleteMaterialTarget.fileName}" dari Pertemuan ${selectedMeeting?.order || 1}?`
            : ''
        }
        confirmLabel={language === 'en' ? 'Yes, Delete Material' : 'Ya, Hapus Materi'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => void executeDeleteMaterialFile()}
        onClose={() => setDeleteMaterialTarget(null)}
      />

      <AccessibleDialog
        isOpen={Boolean(deleteAssignmentTarget)}
        variant="danger"
        title={language === 'en' ? 'Delete Assignment' : 'Hapus Tugas Pertemuan'}
        message={
          deleteAssignmentTarget
            ? language === 'en'
              ? `Delete assignment "${deleteAssignmentTarget.title}" (Meeting ${deleteAssignmentTarget.meetingNo || 1}) from Firestore?`
              : `Hapus tugas "${deleteAssignmentTarget.title}" (Pertemuan ${deleteAssignmentTarget.meetingNo || 1}) dari Firestore?`
            : ''
        }
        confirmLabel={language === 'en' ? 'Yes, Delete Task' : 'Ya, Hapus Tugas'}
        cancelLabel={t('dialog_cancel')}
        onConfirm={() => void executeDeleteAssignment()}
        onClose={() => setDeleteAssignmentTarget(null)}
      />

      {editingAssignment && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-200 dark:border-[#1b263b] flex items-center justify-between bg-slate-50 dark:bg-[#090d16]">
              <h3 className="text-sm font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                {language === 'en' ? '// Edit Assignment' : '// Ubah Tugas Pertemuan'}
              </h3>
              <button
                type="button"
                aria-label={language === 'en' ? 'Close edit dialog' : 'Tutup modal ubah tugas'}
                onClick={() => setEditingAssignment(null)}
                className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAssignmentEdit} className="p-4 space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Assignment Title' : 'Judul Tugas'}
                </label>
                <input
                  type="text"
                  required
                  aria-label={language === 'en' ? 'Edit assignment title' : 'Edit judul tugas'}
                  value={editingAssignment.title}
                  onChange={(e) =>
                    setEditingAssignment((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Meeting' : 'Pertemuan'}
                  </label>
                  <select
                    aria-label={language === 'en' ? 'Edit assignment meeting' : 'Edit pertemuan tugas'}
                    value={editingAssignment.meetingNo}
                    onChange={(e) =>
                      setEditingAssignment((prev) => ({
                        ...prev,
                        meetingNo: Number(e.target.value),
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                  >
                    {(meetingsList.length > 0
                      ? meetingsList
                      : [{ order: editingAssignment.meetingNo || 1, title: '' }]
                    ).map((m) => (
                      <option key={m.id || m.order} value={Number(m.order || 1)}>
                        P{String(Number(m.order || 1)).padStart(2, '0')}
                        {m.title ? `: ${m.title}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Task Type' : 'Tipe Tugas'}
                  </label>
                  <select
                    aria-label={language === 'en' ? 'Edit assignment task type' : 'Edit tipe tugas'}
                    value={editingAssignment.taskType || 'individu'}
                    onChange={(e) =>
                      setEditingAssignment((prev) => ({ ...prev, taskType: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                  >
                    <option value="individu">{language === 'en' ? 'Individual' : 'Individu'}</option>
                    <option value="kelompok">{language === 'en' ? 'Group' : 'Kelompok'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Deadline' : 'Tenggat Waktu'}
                </label>
                <input
                  type="datetime-local"
                  aria-label={language === 'en' ? 'Edit assignment deadline' : 'Edit tenggat tugas'}
                  value={editingAssignment.deadline}
                  onChange={(e) =>
                    setEditingAssignment((prev) => ({ ...prev, deadline: e.target.value }))
                  }
                  className="w-full px-2.5 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Description / Instructions' : 'Deskripsi / Instruksi'}
                </label>
                <textarea
                  rows="3"
                  aria-label={language === 'en' ? 'Edit assignment description' : 'Edit deskripsi tugas'}
                  value={editingAssignment.note}
                  onChange={(e) =>
                    setEditingAssignment((prev) => ({ ...prev, note: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase flex items-center gap-1">
                    <Paperclip className="w-3 h-3 text-amber-500" />
                    {language === 'en' ? 'Instruction File (Optional)' : 'Lampiran Instruksi (Opsional)'}
                  </span>
                  <label className="cursor-pointer px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-[10px] font-bold inline-flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    {uploadingEditTaskAttachment
                      ? language === 'en'
                        ? 'Uploading...'
                        : 'Mengunggah...'
                      : language === 'en'
                        ? 'Upload File'
                        : 'Unggah File'}
                    <input
                      type="file"
                      accept={MATERIAL_ALLOWED_ACCEPT}
                      disabled={uploadingEditTaskAttachment}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadTaskAttachmentFile(file, 'edit');
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    placeholder="https://.../instruksi-tugas.pdf"
                    value={editingAssignment.attachmentUrl || ''}
                    onChange={(e) =>
                      setEditingAssignment((prev) => ({ ...prev, attachmentUrl: e.target.value }))
                    }
                    className="flex-1 px-2 py-1 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                  {editingAssignment.attachmentUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingAssignment((prev) => ({
                          ...prev,
                          attachmentUrl: '',
                          attachmentName: '',
                          attachmentSize: '',
                        }))
                      }
                      className="px-2 py-1 text-[10px] rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40"
                    >
                      {language === 'en' ? 'Clear' : 'Hapus'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#1b263b]">
                <button
                  type="button"
                  onClick={() => setEditingAssignment(null)}
                  className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {t('dialog_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={savingAssignmentEdit || uploadingEditTaskAttachment || !editingAssignment.title.trim()}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold px-4 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingAssignmentEdit
                    ? language === 'en'
                      ? 'Saving...'
                      : 'Menyimpan...'
                    : language === 'en'
                      ? 'Save Changes'
                      : 'Simpan Perubahan Tugas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] relative overflow-hidden shadow-md text-slate-900 dark:text-slate-100">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#f59e0b]" />

        {classData?.coverImage && (() => {
          try {
            const safeHeaderCover = normalizeHttpsImageUrl(classData.coverImage, 'URL cover kelas');
            if (!safeHeaderCover) return null;
            return (
              <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 dark:border-[#232f42] h-32 sm:h-40 bg-slate-100 dark:bg-[#0b0f17]">
                <SafeImage
                  src={safeHeaderCover}
                  alt={classData.name || classData.title}
                  fallbackLabel={classData.code || classData.category}
                  variant="cover"
                  className="w-full h-full object-cover"
                />
              </div>
            );
          } catch {
            return null;
          }
        })()}

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
            role={classInfoFeedback.type === 'error' ? 'alert' : undefined}
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
            <CoverImageField
              value={editClassCoverImage}
              onChange={(val) => {
                setClassInfoFeedback(null);
                setEditClassCoverImage(val);
              }}
              disabled={savingClassInfo}
              language={language}
              fallbackLabel={classData?.code || editClassName || 'SMARTSA'}
              previewAlt={editClassName || classData?.name || 'Preview Cover Kelas'}
              compact
            />
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

      {/* TAB: Meeting Course Material Files (Cloudinary + Legacy Delta Read-Only Fallback) */}
      {!isPreviewMode && activeTab === 'material' && (() => {
        const currentMaterialFiles = Array.isArray(selectedMeeting?.materialFiles)
          ? selectedMeeting.materialFiles
          : [];
        const activeDeltaContent = selectedMeeting
          ? selectedMeeting.deltaContent || null
          : classData?.deltaContent || null;
        const hasLegacyDelta = Boolean(
          Array.isArray(activeDeltaContent?.ops) && activeDeltaContent.ops.length > 0
        );

        return (
        <div className="bg-white dark:bg-[#121822] p-5 sm:p-6 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#1b263b]">
            <div>
              <span className="text-[9px] font-mono font-bold text-sky-700 dark:text-[#00e5ff] uppercase tracking-wider">
                // COURSE MATERIALS REPOSITORY (CLOUDINARY CDN)
              </span>
              <h3 className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {selectedMeeting
                  ? `P${selectedMeeting.order < 10 ? `0${selectedMeeting.order}` : selectedMeeting.order}: ${selectedMeeting.title}`
                  : language === 'en'
                    ? 'No Meeting Selected'
                    : 'Belum Ada Pertemuan'}
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

          {renderEducatorMeetingToolbar('educator-material-meeting')}

          {isEducatorOrAdmin && selectedMeeting && (
            <form
              onSubmit={handleAddMaterialFile}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-3 font-mono"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                    {language === 'en'
                      ? `Upload Material File for Meeting ${selectedMeeting.order}`
                      : `Tambah Materi File Pertemuan ${selectedMeeting.order}`}
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {language === 'en'
                      ? 'Supports PDF, PPTX, DOCX, ZIP, and images (PNG/JPG/WEBP).'
                      : 'Mendukung PDF, PPTX, DOCX, ZIP, dan gambar (PNG/JPG/WEBP).'}
                  </p>
                </div>

                <label
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded border transition cursor-pointer ${
                    savingMaterial || uploadingMaterialFile
                      ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                      : 'bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {uploadingMaterialFile
                      ? language === 'en'
                        ? 'Uploading...'
                        : 'Mengunggah...'
                      : language === 'en'
                        ? 'Upload via Cloudinary'
                        : 'Unggah Berkas Cloudinary'}
                  </span>
                  <input
                    type="file"
                    accept={MATERIAL_ALLOWED_ACCEPT}
                    aria-label={language === 'en' ? 'Upload meeting material file' : 'Unggah berkas materi pertemuan'}
                    disabled={savingMaterial || uploadingMaterialFile}
                    onChange={(e) => void handleUploadMaterialFileToCloudinary(e)}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Material Title' : 'Judul Materi File'}
                  </label>
                  <input
                    type="text"
                    required
                    aria-label={language === 'en' ? 'Material file title' : 'Judul berkas materi'}
                    disabled={savingMaterial || uploadingMaterialFile}
                    value={materialTitleInput}
                    onChange={(e) => setMaterialTitleInput(e.target.value)}
                    placeholder="Contoh: Slide Kuliah 01 — Pengantar"
                    className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'File URL (https://)' : 'URL Berkas Materi (https://)'}
                  </label>
                  <input
                    type="text"
                    inputMode="url"
                    required
                    aria-label={language === 'en' ? 'Material file URL (https://)' : 'URL berkas materi (https://)'}
                    disabled={savingMaterial || uploadingMaterialFile}
                    value={materialFileUrlInput}
                    onChange={(e) => setMaterialFileUrlInput(e.target.value)}
                    placeholder="https://res.cloudinary.com/.../modul.pdf"
                    className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Short Description (Optional)' : 'Deskripsi Singkat (Opsional)'}
                  </label>
                  <input
                    type="text"
                    aria-label={language === 'en' ? 'Material file description' : 'Deskripsi berkas materi'}
                    disabled={savingMaterial || uploadingMaterialFile}
                    value={materialDescInput}
                    onChange={(e) => setMaterialDescInput(e.target.value)}
                    placeholder="Catatan ringkas isi modul atau slide presentasi..."
                    className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingMaterial || uploadingMaterialFile}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingMaterial
                      ? language === 'en'
                        ? 'Saving...'
                        : 'Menyimpan...'
                      : language === 'en'
                        ? 'Save Material File'
                        : 'Simpan Materi File'}
                  </span>
                </button>
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

          {currentMaterialFiles.length > 0 ? (
            <div className="space-y-2.5">
              {currentMaterialFiles.map((fileItem) => {
                const safeItemUrl = getSafeHttpFileUrl(fileItem.fileUrl);
                const fileKind =
                  fileItem.fileType || detectMaterialFileType(fileItem.fileName, fileItem.mimeType);
                const isPreviewable = fileKind === 'image' || fileKind === 'pdf';
                const isSelectedPreview = previewMaterialFile?.id === fileItem.id;
                return (
                  <div
                    key={fileItem.id || fileItem.fileUrl}
                    className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelectedPreview
                        ? 'bg-amber-50/70 dark:bg-[#1a2232] border-amber-400 dark:border-[#f59e0b]'
                        : 'bg-slate-50 dark:bg-[#0a0f18] border-slate-200 dark:border-[#1e2a3f]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#121822] border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                        {fileKind === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-sky-600 dark:text-[#00e5ff]" />
                        ) : (
                          <FileText className="w-4 h-4 text-amber-600 dark:text-[#f59e0b]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            {fileItem.title || fileItem.fileName}
                          </span>
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {String(fileKind || 'file').toUpperCase()}
                          </span>
                        </div>
                        {fileItem.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            {fileItem.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {fileItem.fileName && <span>{fileItem.fileName}</span>}
                          {fileItem.fileSize && <span>• {fileItem.fileSize}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 font-mono shrink-0">
                      {safeItemUrl && isPreviewable && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewMaterialFile((prev) =>
                              prev?.id === fileItem.id ? null : fileItem
                            )
                          }
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {isSelectedPreview
                              ? language === 'en'
                                ? 'Hide'
                                : 'Tutup'
                              : language === 'en'
                                ? 'Preview'
                                : 'Pratinjau'}
                          </span>
                        </button>
                      )}
                      {safeItemUrl && (
                        <a
                          href={safeItemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={fileItem.fileName || undefined}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded bg-[#f59e0b] hover:bg-[#d97706] text-black inline-flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{language === 'en' ? 'Download' : 'Unduh'}</span>
                        </a>
                      )}
                      {isEducatorOrAdmin && (
                        <button
                          type="button"
                          aria-label={`Hapus Materi ${fileItem.title || fileItem.fileName}`}
                          onClick={() => setDeleteMaterialTarget(fileItem)}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{language === 'en' ? 'Delete' : 'Hapus'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !hasLegacyDelta ? (
            <div className="border border-dashed border-slate-300 dark:border-[#1e2a3f] rounded-lg p-8 text-center bg-slate-50 dark:bg-[#070b12] font-mono space-y-1.5">
              <FileText className="w-9 h-9 text-amber-500 mx-auto" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-200">
                {language === 'en'
                  ? 'No material files uploaded for this meeting yet.'
                  : 'Belum ada materi file untuk pertemuan ini.'}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isEducatorOrAdmin
                  ? language === 'en'
                    ? 'Upload PDF, PPTX, DOCX, ZIP, or images via Cloudinary above.'
                    : 'Unggah berkas PDF, PPTX, DOCX, ZIP, atau gambar via formulir Cloudinary di atas.'
                  : language === 'en'
                    ? 'Your lecturer has not uploaded files for this meeting yet.'
                    : 'Dosen pengampu belum mengunggah berkas materi untuk pertemuan ini.'}
              </p>
            </div>
          ) : null}

          {previewMaterialFile && (() => {
            const safePreviewUrl = getSafeHttpFileUrl(previewMaterialFile.fileUrl);
            const previewKind =
              previewMaterialFile.fileType ||
              detectMaterialFileType(previewMaterialFile.fileName, previewMaterialFile.mimeType);
            if (!safePreviewUrl) return null;
            return (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#070b12] border border-slate-200 dark:border-[#1e2a3f] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                    {language === 'en' ? 'Preview:' : 'Pratinjau:'}{' '}
                    {previewMaterialFile.title || previewMaterialFile.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewMaterialFile(null)}
                    className="px-2 py-1 text-[11px] font-mono rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    {language === 'en' ? 'Close' : 'Tutup'}
                  </button>
                </div>
                {previewKind === 'image' ? (
                  <img
                    src={safePreviewUrl}
                    alt={previewMaterialFile.title || previewMaterialFile.fileName || 'Materi Gambar'}
                    className="max-h-96 rounded-lg border border-slate-200 dark:border-slate-700 object-contain mx-auto bg-white dark:bg-[#121822]"
                  />
                ) : previewKind === 'pdf' ? (
                  <iframe
                    title={`Pratinjau PDF ${previewMaterialFile.title || previewMaterialFile.fileName}`}
                    src={safePreviewUrl}
                    className="w-full h-96 rounded-lg border border-slate-200 dark:border-[#1e2a3f] bg-white"
                  />
                ) : null}
              </div>
            );
          })()}

          {hasLegacyDelta && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#1b263b]">
              <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase block">
                // {language === 'en' ? 'LEGACY TEXT MATERIAL (READ-ONLY)' : 'CATATAN TEKS MODUL (ARSIP READ-ONLY)'}
              </span>
              <DeltaContentRenderer
                delta={activeDeltaContent}
                fallbackText={selectedMeeting ? '' : classData?.description || ''}
                emptyMessage=""
              />
            </div>
          )}

          {!isEducatorOrAdmin && selectedMeeting && (
            <div className="pt-4 border-t border-slate-200 dark:border-[#1b263b] flex flex-wrap items-center justify-between gap-3 font-mono">
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {activeCycle.materialDone
                  ? language === 'en'
                    ? `Course materials for Meeting ${currentMeetingNo} completed.`
                    : `Materi Pertemuan ${currentMeetingNo} telah selesai dipelajari.`
                  : language === 'en'
                    ? 'Mark this material completed to progress toward Post-test.'
                    : 'Tandai materi selesai setelah mempelajari berkas untuk membuka syarat Post-test.'}
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
        );
      })()}

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
                {(() => {
                  const configuredMinutes =
                    meetingExams.pretest?.durationMinutes ||
                    meetingExams.posttest?.durationMinutes ||
                    DEFAULT_EXAM_DURATION_MINUTES;
                  return language === 'en'
                    ? `Assessment duration is ${configuredMinutes} minutes with active session logging in Firestore.`
                    : `Evaluasi memiliki durasi ${configuredMinutes} menit dengan pencatatan sesi aktif di Firestore (exam_attempts).`;
                })()}
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

              {(() => {
                const pretestStatus = String(meetingExams.pretest?.status || 'published')
                  .trim()
                  .toLowerCase();
                const posttestStatus = String(meetingExams.posttest?.status || 'published')
                  .trim()
                  .toLowerCase();
                const hasPretestQuestions = Boolean(meetingExams.pretest?.questions?.length);
                const hasPosttestQuestions = Boolean(meetingExams.posttest?.questions?.length);
                const pretestPublished = hasPretestQuestions && pretestStatus === 'published';
                const posttestPublished = hasPosttestQuestions && posttestStatus === 'published';
                const pretestDisabled =
                  activeCycle.pretestDone || !pretestPublished || !selectedMeeting;
                const posttestDisabled =
                  activeCycle.posttestDone ||
                  !activeCycle.canStartPosttest ||
                  !posttestPublished ||
                  !selectedMeeting;

                const statusNotices = [];
                if (hasPretestQuestions && pretestStatus !== 'published') {
                  statusNotices.push(
                    pretestStatus === 'draft'
                      ? language === 'en'
                        ? 'Pretest is currently in draft mode.'
                        : 'Pretest saat ini berstatus draft dan belum dibuka oleh dosen.'
                      : language === 'en'
                        ? 'Pretest has been archived by the lecturer.'
                        : 'Pretest telah diarsipkan oleh dosen.'
                  );
                }
                if (hasPosttestQuestions && posttestStatus !== 'published') {
                  statusNotices.push(
                    posttestStatus === 'draft'
                      ? language === 'en'
                        ? 'Post-test is currently in draft mode.'
                        : 'Post-test saat ini berstatus draft dan belum dibuka oleh dosen.'
                      : language === 'en'
                        ? 'Post-test has been archived by the lecturer.'
                        : 'Post-test telah diarsipkan oleh dosen.'
                  );
                }

                return (
                  <div className="space-y-2.5 pt-2">
                    {statusNotices.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-[11px] text-left space-y-0.5">
                        {statusNotices.map((msg, idx) => (
                          <div key={idx}>{msg}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap justify-center gap-2.5">
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
                        ) : pretestStatus === 'draft' ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            {language === 'en' ? 'PRETEST IN DRAFT' : 'PRETEST MASIH DRAFT'}
                          </>
                        ) : pretestStatus === 'archived' ? (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            {language === 'en' ? 'PRETEST ARCHIVED' : 'PRETEST DIARSIPKAN'}
                          </>
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
                        {activeCycle.posttestDone
                          ? language === 'en'
                            ? `POST-TEST COMPLETED (${activeCycle.posttestAttempt?.score})`
                            : `POST-TEST SELESAI (SKOR: ${activeCycle.posttestAttempt?.score})`
                          : !hasPosttestQuestions
                            ? language === 'en'
                              ? 'POST-TEST UNAVAILABLE'
                              : 'POST-TEST BELUM TERSEDIA'
                            : posttestStatus === 'draft'
                              ? language === 'en'
                                ? 'POST-TEST IN DRAFT'
                                : 'POST-TEST MASIH DRAFT'
                              : posttestStatus === 'archived'
                                ? language === 'en'
                                  ? 'POST-TEST ARCHIVED'
                                  : 'POST-TEST DIARSIPKAN'
                                : language === 'en'
                                  ? 'START POST-TEST'
                                  : 'MULAI POST-TEST'}
                      </button>
                    </div>
                  </div>
                );
              })()}
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
                  <span className="text-[10px] text-slate-400">
                    DURASI: {activeStudentExam?.durationMinutes || DEFAULT_EXAM_DURATION_MINUTES} MNT
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
                              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase border ${
                                task.taskType === 'kelompok'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {task.taskType === 'kelompok' ? 'KELOMPOK' : 'INDIVIDU'}
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
                        {task.attachmentUrl && getSafeHttpFileUrl(task.attachmentUrl) && (
                          <a
                            href={getSafeHttpFileUrl(task.attachmentUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={task.attachmentName || undefined}
                            className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] hover:underline"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{task.attachmentName || 'Unduh Lampiran Instruksi'}</span>
                          </a>
                        )}
                        {task.groupName && (
                          <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 mt-1">
                            Kelompok: <strong>{task.groupName}</strong>
                            {Array.isArray(task.groupMembers) && task.groupMembers.length > 0
                              ? ` (${task.groupMembers.join(', ')})`
                              : ''}
                          </p>
                        )}
                        {task.feedback && (
                          <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 mt-1.5">
                            Catatan Dosen: {task.feedback}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 font-mono">
                        {isDone ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTaskModal(task);
                                setUploadedFile(null);
                                setExternalUrlInput(task.externalUrl || task.submittedFile?.url || '');
                                setTaskNotes(task.notes || '');
                                setGroupNameInput(task.groupName || '');
                                setGroupMembersInput(
                                  Array.isArray(task.groupMembers)
                                    ? task.groupMembers.join('\n')
                                    : task.groupMembers || ''
                                );
                                setTaskFeedback(null);
                              }}
                              className="bg-slate-100 dark:bg-[#1c2432] hover:bg-slate-200 dark:hover:bg-[#253245] text-slate-700 dark:text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-xs border border-slate-300 dark:border-slate-600 transition flex items-center gap-1 uppercase"
                            >
                              <Eye className="w-3 h-3" />
                              {language === 'en' ? 'Task Details' : 'Detail Tugas'}
                            </button>
                            {typeof task.grade !== 'number' && (
                              <button
                                type="button"
                                onClick={() => setWithdrawConfirmTaskId(task.id)}
                                className="bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold px-3 py-1.5 rounded-xs border border-rose-200 dark:border-rose-500/40 transition flex items-center gap-1 uppercase"
                              >
                                <Trash2 className="w-3 h-3" />
                                {t('task_reupload_btn')}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTaskModal(task);
                              setUploadedFile(null);
                              setExternalUrlInput(task.externalUrl || '');
                              setTaskNotes(task.notes || '');
                              setGroupNameInput(task.groupName || '');
                              setGroupMembersInput(
                                Array.isArray(task.groupMembers)
                                  ? task.groupMembers.join('\n')
                                  : task.groupMembers || ''
                              );
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

          {/* Active Session QR Card & Projector Modal OR Open Session Form */}
          {attSession?.isOpen ? (
            <AttendanceQrModal
              session={attSession}
              classCode={classData?.code || ''}
              className={classData?.name || classData?.title || ''}
              onCloseSession={handleCloseAttendance}
              closing={attLoading}
            />
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

      {/* INSTRUCTOR / ADMIN TAB: Submissions Grading & Task Creation/Edit/Delete */}
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

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  Pertemuan
                </label>
                <select
                  aria-label={language === 'en' ? 'New assignment meeting' : 'Pertemuan tugas baru'}
                  value={meetingsList.length > 0 ? effectiveNewTaskMeetingNo : ''}
                  onChange={(e) => setNewTaskMeetingNo(Number(e.target.value))}
                  disabled={meetingsList.length === 0}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100 disabled:opacity-50"
                >
                  {meetingsList.length === 0 ? (
                    <option value="">
                      {language === 'en'
                        ? 'Add a meeting first'
                        : 'Tambahkan pertemuan dulu'}
                    </option>
                  ) : (
                    meetingsList.map((m) => {
                      const num = Number(m.order || 1);
                      return (
                        <option key={m.id || num} value={num}>
                          P{num < 10 ? `0${num}` : num}: {m.title}
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                  {language === 'en' ? 'Task Type' : 'Tipe Tugas'}
                </label>
                <select
                  aria-label={language === 'en' ? 'New assignment task type' : 'Tipe tugas baru'}
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                >
                  <option value="individu">{language === 'en' ? 'Individual' : 'Individu'}</option>
                  <option value="kelompok">{language === 'en' ? 'Group' : 'Kelompok'}</option>
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
                  placeholder="Format PDF/DOCX/ZIP atau catatan kelompok..."
                  className="w-full px-2.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={creatingTask || uploadingTaskAttachment || meetingsList.length === 0}
                className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creatingTask ? 'Menerbitkan...' : 'Terbitkan Tugas'}
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-[#121822] border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {newTaskAttachmentName
                    ? `${newTaskAttachmentName}${newTaskAttachmentSize ? ` (${newTaskAttachmentSize})` : ''}`
                    : language === 'en'
                      ? 'Optional instruction file attachment (Cloudinary)'
                      : 'Lampiran berkas instruksi tugas opsional (Cloudinary)'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {newTaskAttachmentUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewTaskAttachmentUrl('');
                      setNewTaskAttachmentName('');
                      setNewTaskAttachmentSize('');
                    }}
                    className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 text-[10px] font-bold"
                  >
                    {language === 'en' ? 'Clear' : 'Hapus'}
                  </button>
                )}
                <label className="cursor-pointer px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 text-[10px] font-bold inline-flex items-center gap-1">
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
                    aria-label={language === 'en' ? 'Upload assignment instruction attachment' : 'Unggah lampiran instruksi tugas'}
                    disabled={uploadingTaskAttachment || creatingTask}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadTaskAttachmentFile(f, 'create');
                      e.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </form>

          {(() => {
            const taskById = new Map((taskSubmissions || []).map((tItem) => [tItem.id, tItem]));
            const scopedTasks = (taskSubmissions || []).filter((tItem) =>
              gradingMeetingFilter === 'all'
                ? true
                : Number(tItem.meetingNo || 1) === Number(gradingMeetingFilter)
            );
            const activeAssignmentFilterValid =
              gradingAssignmentFilter !== 'all' &&
              scopedTasks.some((tItem) => tItem.id === gradingAssignmentFilter);
            const effectiveAssignmentFilter = activeAssignmentFilterValid
              ? gradingAssignmentFilter
              : 'all';

            const filteredSubmissions = (classSubmissions || []).filter((sub) => {
              const matchedTask = taskById.get(sub.assignmentId);
              const subMeetingNo = Number(sub.meetingNo || matchedTask?.meetingNo || 1);
              if (
                gradingMeetingFilter !== 'all' &&
                subMeetingNo !== Number(gradingMeetingFilter)
              ) {
                return false;
              }
              if (
                effectiveAssignmentFilter !== 'all' &&
                sub.assignmentId !== effectiveAssignmentFilter
              ) {
                return false;
              }
              return true;
            });

            const approvedStudents = (classMembersList || []).filter((m) => {
              const st = m?.status;
              const isApproved =
                st === undefined || st === null || st === '' || st === 'approved' || st === 'active';
              const isStudent = m?.role !== ROLES.LECTURER && m?.role !== ROLES.ADMIN;
              return isApproved && isStudent && Boolean(m?.uid);
            });

            const selectedMonitorTask =
              effectiveAssignmentFilter !== 'all'
                ? taskById.get(effectiveAssignmentFilter) || null
                : scopedTasks.find(
                    (tItem) => Number(tItem.meetingNo || 1) === Number(currentMeetingNo)
                  ) ||
                  scopedTasks[0] ||
                  null;

            const submittedUidsForTask = selectedMonitorTask
              ? new Set(
                  (classSubmissions || [])
                    .filter((s) => s.assignmentId === selectedMonitorTask.id)
                    .map((s) => s.uid)
                    .filter(Boolean)
                )
              : new Set();

            const unsubmittedStudents = selectedMonitorTask
              ? approvedStudents.filter((m) => !submittedUidsForTask.has(m.uid))
              : [];

            return (
              <>
                {/* Managed Assignments List (Edit / Delete) */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 uppercase">
                      {language === 'en'
                        ? '// PUBLISHED CLASS ASSIGNMENTS (EDIT / DELETE)'
                        : '// DAFTAR TUGAS PERTEMUAN (EDIT / HAPUS)'}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      {scopedTasks.length} {language === 'en' ? 'assignments' : 'tugas'}
                    </span>
                  </div>

                  {scopedTasks.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-dashed border-slate-200 dark:border-[#232f42] text-xs font-mono text-slate-500 dark:text-slate-400 text-center">
                      {language === 'en'
                        ? 'No assignments published for this filter yet.'
                        : 'Belum ada tugas yang diterbitkan untuk filter ini.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scopedTasks.map((taskItem) => (
                        <div
                          key={taskItem.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#0a0f18] flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff] border border-sky-200 dark:border-[#00e5ff]/30">
                                P{Number(taskItem.meetingNo || 1)}
                              </span>
                              <span
                                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase border ${
                                  taskItem.taskType === 'kelompok'
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {taskItem.taskType === 'kelompok' ? 'KELOMPOK' : 'INDIVIDU'}
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {taskItem.title}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {language === 'en' ? 'Deadline:' : 'Tenggat:'}{' '}
                              {taskItem.deadline || 'Sesuai jadwal'}
                              {taskItem.note ? ` • ${taskItem.note}` : ''}
                            </p>
                            {taskItem.attachmentUrl && getSafeHttpFileUrl(taskItem.attachmentUrl) && (
                              <a
                                href={getSafeHttpFileUrl(taskItem.attachmentUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] hover:underline"
                              >
                                <Paperclip className="w-3 h-3" />
                                <span>{taskItem.attachmentName || 'Lampiran Instruksi'}</span>
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono">
                            <button
                              type="button"
                              aria-label={`Edit Tugas ${taskItem.title}`}
                              onClick={() => handleOpenEditAssignment(taskItem)}
                              className="px-2.5 py-1 text-[10px] font-bold rounded border border-sky-300 dark:border-[#00e5ff]/40 bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff] flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              {language === 'en' ? 'Edit' : 'Edit Tugas'}
                            </button>
                            <button
                              type="button"
                              aria-label={`Hapus Tugas ${taskItem.title}`}
                              onClick={() => setDeleteAssignmentTarget(taskItem)}
                              className="px-2.5 py-1 text-[10px] font-bold rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              {language === 'en' ? 'Delete' : 'Hapus Tugas'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filter Header + Unsubmitted Members Monitoring */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1b263b] pb-3 pt-1">
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
                        ? 'Filter by meeting or task, track missing submissions, and save 0–100 grades + feedback.'
                        : 'Filter per pertemuan/tugas, pantau mahasiswa yang belum mengumpulkan, dan simpan nilai (0–100).'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <select
                      aria-label={
                        language === 'en' ? 'Filter grading by meeting' : 'Filter pertemuan penilaian'
                      }
                      value={gradingMeetingFilter}
                      onChange={(e) => {
                        setGradingMeetingFilter(e.target.value);
                        setGradingAssignmentFilter('all');
                      }}
                      className="px-2.5 py-1.5 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200"
                    >
                      <option value="all">
                        {language === 'en' ? 'All Meetings' : 'Semua Pertemuan'}
                      </option>
                      {meetingsList.map((m) => {
                        const ord = Number(m.order || 1);
                        return (
                          <option key={m.id || ord} value={String(ord)}>
                            P{ord < 10 ? `0${ord}` : ord}
                            {ord === currentMeetingNo ? ' (Aktif)' : ''}
                          </option>
                        );
                      })}
                    </select>

                    <select
                      aria-label={
                        language === 'en' ? 'Filter grading by assignment' : 'Filter tugas penilaian'
                      }
                      value={effectiveAssignmentFilter}
                      onChange={(e) => setGradingAssignmentFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-[11px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b0f17] text-slate-800 dark:text-slate-200 max-w-[220px]"
                    >
                      <option value="all">
                        {language === 'en' ? 'All Tasks' : 'Semua Tugas'}
                      </option>
                      {scopedTasks.map((tItem) => (
                        <option key={tItem.id} value={tItem.id}>
                          {tItem.title} (P{tItem.meetingNo || 1})
                        </option>
                      ))}
                    </select>

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
                </div>

                {selectedMonitorTask && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-2 font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-rose-500" />
                        {language === 'en'
                          ? `Unsubmitted Members — ${selectedMonitorTask.title}`
                          : `Belum Mengumpulkan — ${selectedMonitorTask.title}`}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-xs bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40">
                        {unsubmittedStudents.length}{' '}
                        {language === 'en' ? 'Not Submitted' : 'Belum Kumpul'}
                      </span>
                    </div>
                    {approvedStudents.length === 0 ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {language === 'en'
                          ? 'No approved student members recorded in this class yet.'
                          : 'Belum ada anggota mahasiswa aktif di kelas ini.'}
                      </p>
                    ) : unsubmittedStudents.length === 0 ? (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        {language === 'en'
                          ? 'All approved members have submitted this assignment!'
                          : 'Seluruh anggota aktif sudah mengumpulkan tugas ini.'}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {unsubmittedStudents.map((member) => (
                          <div
                            key={member.id || member.uid}
                            className="px-2.5 py-1 rounded border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-[#121822] text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                          >
                            <span className="font-bold">
                              {member.studentName || member.displayName || member.name || member.email || member.uid}
                            </span>
                            <span className="text-[9px] text-rose-600 dark:text-rose-400 uppercase">
                              Belum Mengumpulkan
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                ) : filteredSubmissions.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-dashed border-slate-200 dark:border-[#232f42] text-xs font-mono text-slate-500 dark:text-slate-400">
                    {language === 'en'
                      ? 'No student submissions match the selected filter.'
                      : 'Belum ada pengumpulan tugas mahasiswa untuk filter yang dipilih.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-[#1e2a3f] bg-slate-50 dark:bg-[#0a0f18] space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {sub.studentName}
                              </span>
                              <span
                                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase border ${
                                  sub.taskType === 'kelompok' || sub.groupName
                                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {sub.taskType === 'kelompok' || sub.groupName ? 'KELOMPOK' : 'INDIVIDU'}
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
                            {sub.groupName && (
                              <div className="mt-1.5 p-2 rounded bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-mono text-indigo-800 dark:text-indigo-200">
                                <div>
                                  <strong>{language === 'en' ? 'Group:' : 'Kelompok:'}</strong>{' '}
                                  {sub.groupName}
                                </div>
                                {Array.isArray(sub.groupMembers) && sub.groupMembers.length > 0 && (
                                  <div className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                                    <strong>{language === 'en' ? 'Members:' : 'Anggota:'}</strong>{' '}
                                    {sub.groupMembers.join(' • ')}
                                  </div>
                                )}
                              </div>
                            )}
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
              </>
            );
          })()}
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
                  aria-pressed={showExamEditor}
                  onClick={() => setShowExamEditor((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-xs text-[10px] font-bold uppercase border flex items-center gap-1 transition ${
                    showExamEditor
                      ? 'border-sky-500 dark:border-[#00e5ff] bg-sky-600 dark:bg-[#00e5ff] text-white dark:text-black shadow-xs'
                      : 'border-sky-300 dark:border-[#00e5ff]/40 bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff]'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  {showExamEditor
                    ? language === 'en'
                      ? 'Close Editor & View Summary'
                      : 'Tutup Editor & Lihat Rekap'
                    : language === 'en'
                      ? 'Create / Edit Exam'
                      : 'Buat / Edit Soal & Kunci'}
                </button>
              )}
              {selectedMeeting && instructorExamQuestions.length > 0 && (
                <>
                  {activeInstructorExam?.status !== 'archived' && (
                    <button
                      type="button"
                      disabled={archivingExam}
                      onClick={() => void handleArchiveMeetingExam()}
                      className="px-3 py-1.5 rounded-xs text-[10px] font-bold uppercase border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Lock className="w-3 h-3" />
                      {archivingExam
                        ? language === 'en'
                          ? 'Archiving...'
                          : 'Mengarsipkan...'
                        : language === 'en'
                          ? 'Archive Exam'
                          : 'Arsipkan Evaluasi'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={deletingExam}
                    onClick={() => setConfirmDeleteExam(true)}
                    className="px-3 py-1.5 rounded-xs text-[10px] font-bold uppercase border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    {language === 'en' ? 'Delete Exam' : 'Hapus Evaluasi'}
                  </button>
                </>
              )}
            </div>
          </div>

          {renderEducatorMeetingToolbar('educator-exam-meeting')}

          {selectedMeeting && activeInstructorExam && (() => {
            const activePointsPerQuestion =
              Number.isFinite(Number(activeInstructorExam.pointsPerQuestion)) &&
              Number(activeInstructorExam.pointsPerQuestion) > 0
                ? Number(activeInstructorExam.pointsPerQuestion)
                : instructorExamQuestions.length > 0
                  ? Number((100 / instructorExamQuestions.length).toFixed(2))
                  : 0;
            return (
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                <span
                  className={`px-2 py-0.5 rounded-xs font-bold uppercase border ${
                    activeInstructorExam.status === 'archived'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      : activeInstructorExam.status === 'draft'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40'
                  }`}
                >
                  STATUS: {String(activeInstructorExam.status || 'published').toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-xs font-bold bg-sky-50 dark:bg-[#00e5ff]/10 text-sky-700 dark:text-[#00e5ff] border border-sky-200 dark:border-[#00e5ff]/30">
                  DURASI: {activeInstructorExam.durationMinutes || DEFAULT_EXAM_DURATION_MINUTES} MENIT
                </span>
                <span className="px-2 py-0.5 rounded-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-[#f59e0b] border border-amber-200 dark:border-[#f59e0b]/40">
                  BOBOT: {activePointsPerQuestion} POIN/SOAL ({instructorExamQuestions.length} SOAL)
                </span>
                {activeInstructorExam.deadline && (
                  <span className="px-2 py-0.5 rounded-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                    DEADLINE: {new Date(activeInstructorExam.deadline).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
            );
          })()}

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

          {selectedMeeting && showExamEditor && (() => {
            const draftPointsPerQuestion =
              examDraftQuestions.length > 0
                ? Number((100 / examDraftQuestions.length).toFixed(2))
                : 0;
            const parsedAikenPreview =
              examEditorMode === 'aiken' ? parseAikenQuestions(aikenInput) : { questions: [], errors: [] };
            return (
            <form
              onSubmit={handleSaveMeetingExam}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f] space-y-4 font-mono"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#1b263b]">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-amber-700 dark:text-[#f59e0b] uppercase">
                    {language === 'en'
                      ? `Manage ${evalKeyType.toUpperCase()} Questions (Meeting ${currentMeetingNo})`
                      : `Kelola Soal & Kunci ${evalKeyType.toUpperCase()} — Pertemuan ${currentMeetingNo}`}
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 px-2 py-0.5 rounded inline-block">
                    {examDraftQuestions.length} Soal • {draftPointsPerQuestion} poin/soal (Total 100)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExamEditorMode('visual')}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded border transition ${
                      examEditorMode === 'visual'
                        ? 'bg-[#f59e0b] text-black border-[#f59e0b]'
                        : 'bg-white dark:bg-[#121822] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {language === 'en' ? 'Visual Editor' : 'Editor Visual'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamEditorMode('aiken')}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded border transition ${
                      examEditorMode === 'aiken'
                        ? 'bg-sky-600 dark:bg-[#00e5ff] text-white dark:text-black border-sky-600 dark:border-[#00e5ff]'
                        : 'bg-white dark:bg-[#121822] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {language === 'en' ? 'Import Aiken Format' : 'Import Format Aiken'}
                  </button>
                  {examEditorMode === 'visual' && (
                    <button
                      type="button"
                      onClick={handleAddDraftQuestion}
                      className="bg-slate-200 dark:bg-[#1c2432] hover:bg-slate-300 dark:hover:bg-[#253245] text-slate-800 dark:text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {language === 'en' ? 'Add Question' : 'Tambah Soal'}
                    </button>
                  )}
                </div>
              </div>

              {examEditorMode === 'aiken' ? (
                <div className="p-3.5 rounded-lg bg-white dark:bg-[#121822] border border-sky-200 dark:border-[#00e5ff]/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-sky-700 dark:text-[#00e5ff] uppercase block">
                        // {language === 'en' ? 'BULK IMPORT AIKEN FORMAT' : 'IMPOR MASSAL FORMAT AIKEN'}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {language === 'en'
                          ? 'Supports A. / A) options (2–6 options, default A–E) and ANSWER: X.'
                          : 'Mendukung opsi A. atau A) (2–6 opsi, default 5 opsi A–E) dan baris ANSWER: X.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAikenInput(AIKEN_SAMPLE_TEMPLATE)}
                        className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-[10px] font-bold text-slate-700 dark:text-slate-300"
                      >
                        {language === 'en' ? 'Load Sample' : 'Muat Contoh'}
                      </button>
                      <label className="cursor-pointer px-2.5 py-1 rounded border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-950/50 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        <span>{language === 'en' ? 'Upload .txt' : 'Unggah .txt'}</span>
                        <input
                          type="file"
                          accept=".txt,text/plain"
                          aria-label={language === 'en' ? 'Upload Aiken text file' : 'Unggah file teks Aiken'}
                          onChange={(e) => void handleUploadAikenTxtFile(e)}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <textarea
                    rows={8}
                    aria-label={language === 'en' ? 'Aiken format text input' : 'Teks soal format Aiken'}
                    value={aikenInput}
                    onChange={(e) => setAikenInput(e.target.value)}
                    placeholder={AIKEN_SAMPLE_TEMPLATE}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-bold text-emerald-700 dark:text-emerald-300">
                      {parsedAikenPreview.questions.length}{' '}
                      {language === 'en' ? 'valid questions parsed' : 'soal valid terdeteksi'}
                      {parsedAikenPreview.questions.length > 0 &&
                        ` • ${Number((100 / parsedAikenPreview.questions.length).toFixed(2))} poin/soal`}
                    </span>
                    {aikenInput.trim() && parsedAikenPreview.errors.length > 0 && (
                      <span className="font-bold text-rose-600 dark:text-rose-400">
                        {parsedAikenPreview.errors.length}{' '}
                        {language === 'en' ? 'format errors' : 'baris error'}
                      </span>
                    )}
                  </div>

                  {aikenInput.trim() && parsedAikenPreview.errors.length > 0 && (
                    <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-[11px] text-rose-700 dark:text-rose-300 space-y-1">
                      {parsedAikenPreview.errors.map((errItem, errIdx) => (
                        <div key={`${errItem.line}_${errIdx}`}>{errItem.message}</div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={parsedAikenPreview.questions.length === 0}
                      onClick={() => handleApplyAikenImport('append')}
                      className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40"
                    >
                      {language === 'en' ? 'Append to Questions' : 'Tambahkan ke Daftar Soal'}
                    </button>
                    <button
                      type="button"
                      disabled={parsedAikenPreview.questions.length === 0}
                      onClick={() => handleApplyAikenImport('replace')}
                      className="px-3.5 py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold disabled:opacity-40"
                    >
                      {language === 'en' ? 'Replace All Questions' : 'Ganti Semua Soal'}
                    </button>
                  </div>
                </div>
              ) : (
                <>

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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Publication Status' : 'Status Publikasi'}
                  </label>
                  <select
                    aria-label={language === 'en' ? 'Exam publication status' : 'Status evaluasi'}
                    value={examDraftStatus}
                    onChange={(e) => setExamDraftStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  >
                    <option value="published">
                      {language === 'en' ? 'Published (Open)' : 'Dipublikasikan (Published)'}
                    </option>
                    <option value="draft">
                      {language === 'en' ? 'Draft (Hidden)' : 'Draft (Belum Dibuka)'}
                    </option>
                    <option value="archived">
                      {language === 'en' ? 'Archived (Closed)' : 'Diarsipkan (Archived)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase">
                    {language === 'en' ? 'Duration (1-180 mins)' : 'Durasi (1–180 Menit)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    required
                    aria-label={language === 'en' ? 'Exam duration minutes' : 'Durasi ujian (menit)'}
                    value={examDraftDurationMinutes}
                    onChange={(e) => setExamDraftDurationMinutes(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                      {language === 'en' ? 'Deadline (Optional)' : 'Batas Waktu (Opsional)'}
                    </label>
                    {examDraftDeadline && (
                      <button
                        type="button"
                        onClick={() => setExamDraftDeadline('')}
                        className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        {language === 'en' ? 'Clear Deadline' : 'Hapus Deadline'}
                      </button>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    aria-label={language === 'en' ? 'Exam deadline' : 'Deadline evaluasi'}
                    value={examDraftDeadline}
                    onChange={(e) => setExamDraftDeadline(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {examDraftQuestions.map((q, qIdx) => {
                  const qOptions = Array.isArray(q.options) ? q.options : ['', ''];
                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-lg bg-white dark:bg-[#121822] border border-slate-200 dark:border-[#232f42] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-sky-700 dark:text-[#00e5ff]">
                          SOAL {qIdx + 1} ({q.id})
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={qOptions.length >= 6}
                            onClick={() => handleAddDraftOption(q.id)}
                            aria-label={`Tambah opsi Soal ${qIdx + 1}`}
                            className="text-sky-700 dark:text-[#00e5ff] hover:underline text-[11px] font-bold flex items-center gap-1 disabled:opacity-40"
                          >
                            <Plus className="w-3 h-3" />
                            {language === 'en' ? 'Add Option' : 'Tambah Opsi'} ({qOptions.length}/6)
                          </button>
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
                        {qOptions.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              required
                              aria-label={`Soal ${qIdx + 1} Opsi ${optIdx + 1}`}
                              value={opt}
                              onChange={(e) => handleUpdateDraftOption(q.id, optIdx, e.target.value)}
                              placeholder={`Opsi ${String.fromCharCode(65 + optIdx)}`}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f18] text-slate-900 dark:text-slate-100"
                            />
                            {qOptions.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftOption(q.id, optIdx)}
                                aria-label={`Hapus pilihan ${optIdx + 1} pertanyaan ${qIdx + 1}`}
                                title={language === 'en' ? 'Remove option' : 'Hapus opsi'}
                                className="p-1.5 rounded border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
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
                          {qOptions.map((_, optIdx) => (
                            <option key={optIdx} value={optIdx}>
                              Opsi {String.fromCharCode(65 + optIdx)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
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
                </>
              )}
            </form>
            );
          })()}

          {/* Class Exam Statistics Summary & Scoped Rekap */}
          {(() => {
            const memberByUid = new Map();
            (classMembersList || []).forEach((m) => {
              const memberUid = String(m?.uid || '').trim();
              if (memberUid) {
                memberByUid.set(memberUid, m);
              }
            });

            const meetingAttempts = classExamAttempts.filter(
              (a) => Number(a.meetingNo || 1) === Number(currentMeetingNo)
            );
            const scopedAttempts = meetingAttempts.filter(
              (a) => (a.examType === 'posttest' ? 'posttest' : 'pretest') === evalKeyType
            );
            const scoredAttempts = scopedAttempts.filter((a) => typeof a.score === 'number');
            const avgScore =
              scoredAttempts.length > 0
                ? Math.round(
                    scoredAttempts.reduce((acc, a) => acc + a.score, 0) / scoredAttempts.length
                  )
                : 0;
            const passedCount = scoredAttempts.filter((a) => a.score >= 75).length;

            const gainByUid = new Map();
            meetingAttempts.forEach((att) => {
              const identity = resolveAttemptStudentDisplay(att, memberByUid);
              const key = identity.uid;
              const existing = gainByUid.get(key) || {
                uid: key,
                displayName: identity.displayName,
                email: identity.email,
                pretestScore: null,
                posttestScore: null,
              };
              const type = att.examType === 'posttest' ? 'posttest' : 'pretest';
              if (typeof att.score === 'number') {
                if (type === 'pretest') {
                  existing.pretestScore = att.score;
                } else {
                  existing.posttestScore = att.score;
                }
              }
              if (identity.displayName && identity.displayName !== key) {
                existing.displayName = identity.displayName;
              }
              if (identity.email && !existing.email) {
                existing.email = identity.email;
              }
              gainByUid.set(key, existing);
            });
            const gainRows = Array.from(gainByUid.values()).map((row) => ({
              ...row,
              gainDelta:
                row.pretestScore !== null && row.posttestScore !== null
                  ? row.posttestScore - row.pretestScore
                  : null,
            }));

            return (
              <>
                <div className="grid grid-cols-3 gap-3 font-mono">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f]">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      TOTAL PESERTA UJIAN ({evalKeyType.toUpperCase()} • P{currentMeetingNo})
                    </span>
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {scopedAttempts.length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0a0f18] border border-slate-200 dark:border-[#1e2a3f]">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      RATA-RATA SKOR
                    </span>
                    <span className="text-lg font-black text-amber-600 dark:text-[#f59e0b] block">
                      {avgScore} / 100
                    </span>
                    {instructorExamQuestions.length > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        {(Number.isFinite(Number(activeInstructorExam?.pointsPerQuestion)) &&
                        Number(activeInstructorExam?.pointsPerQuestion) > 0
                          ? Number(activeInstructorExam.pointsPerQuestion)
                          : Number((100 / instructorExamQuestions.length).toFixed(2)))}{' '}
                        poin/soal ({instructorExamQuestions.length} soal)
                      </span>
                    )}
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

                {/* Per-Meeting Pretest vs Posttest Gain Summary Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {language === 'en'
                        ? `Pretest vs Post-test Gain Comparison (Meeting ${currentMeetingNo})`
                        : `Rekap Perbandingan Gain (Δ = Posttest - Pretest) — P${currentMeetingNo}`}
                    </span>
                  </h4>
                  {gainRows.length === 0 ? (
                    <div className="py-4 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-dashed border-slate-300 dark:border-[#1e2a3f]">
                      {language === 'en'
                        ? `No student Pretest/Post-test attempts recorded for Meeting ${currentMeetingNo} yet.`
                        : `Belum ada data evaluasi mahasiswa untuk Pertemuan ${currentMeetingNo}.`}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 dark:bg-[#0a0f18] text-slate-500 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-[#232f42]">
                          <tr>
                            <th className="py-2 px-3">Mahasiswa</th>
                            <th className="py-2 px-3">Pretest</th>
                            <th className="py-2 px-3">Post-test</th>
                            <th className="py-2 px-3">Gain (Δ)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#1e2a3f]">
                          {gainRows.map((row) => (
                            <tr key={`gain_${row.uid}`}>
                              <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                                <span className="font-bold block">{row.displayName}</span>
                                {row.email && row.email !== row.displayName && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {row.email}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-bold text-amber-600 dark:text-[#f59e0b]">
                                {row.pretestScore !== null ? `${row.pretestScore} / 100` : '—'}
                              </td>
                              <td className="py-2 px-3 font-bold text-sky-700 dark:text-[#00e5ff]">
                                {row.posttestScore !== null ? `${row.posttestScore} / 100` : '—'}
                              </td>
                              <td className="py-2 px-3 font-black">
                                {row.gainDelta !== null ? (
                                  <span
                                    className={
                                      row.gainDelta >= 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                    }
                                  >
                                    {row.gainDelta >= 0 ? `+${row.gainDelta}` : row.gainDelta}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Scoped Student Exam Attempts List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    {language === 'en'
                      ? `Class Attempts (${evalKeyType.toUpperCase()} — P${currentMeetingNo})`
                      : `Riwayat Evaluasi Mahasiswa (${evalKeyType.toUpperCase()} — P${currentMeetingNo})`}
                  </h4>
                  {scopedAttempts.length === 0 ? (
                    <div className="py-4 text-center text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-dashed border-slate-300 dark:border-[#1e2a3f]">
                      {language === 'en'
                        ? `No ${evalKeyType} attempts recorded for Meeting ${currentMeetingNo} yet.`
                        : `Belum ada riwayat peserta untuk ${evalKeyType.toUpperCase()} Pertemuan ${currentMeetingNo}.`}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 dark:bg-[#0a0f18] text-slate-500 dark:text-slate-400 uppercase text-[10px] border-b border-slate-200 dark:border-[#232f42]">
                          <tr>
                            <th className="py-2 px-3">Mahasiswa</th>
                            <th className="py-2 px-3">Pertemuan</th>
                            <th className="py-2 px-3">Tipe</th>
                            <th className="py-2 px-3">Skor</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#1e2a3f]">
                          {scopedAttempts.map((att) => {
                            const identity = resolveAttemptStudentDisplay(att, memberByUid);
                            return (
                              <tr key={att.id}>
                                <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                                  <span className="font-bold block">{identity.displayName}</span>
                                  {identity.email && identity.email !== identity.displayName && (
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {identity.email}
                                    </span>
                                  )}
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
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
      {activeTaskModal && (() => {
        const isActiveTaskGraded = typeof activeTaskModal.grade === 'number';
        return (
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
                  {isActiveTaskGraded
                    ? language === 'en'
                      ? '// GRADED ASSIGNMENT DETAILS'
                      : '// DETAIL TUGAS & HASIL PENILAIAN'
                    : language === 'en'
                      ? '// ASSIGNMENT SUBMISSION LINK'
                      : '// PENGUMPULAN TAUTAN TUGAS'}
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
              <div className="p-3 bg-slate-50 dark:bg-[#0a0f18] rounded-lg border border-slate-200 dark:border-[#232f42] text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase block">
                    PETUNJUK PENUGASAN:
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-xs uppercase border ${
                      activeTaskModal.taskType === 'kelompok'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/40'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {activeTaskModal.taskType === 'kelompok' ? 'TUGAS KELOMPOK' : 'TUGAS INDIVIDU'}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                  {activeTaskModal.note}
                </p>
                {activeTaskModal.attachmentUrl && getSafeHttpFileUrl(activeTaskModal.attachmentUrl) && (
                  <a
                    href={getSafeHttpFileUrl(activeTaskModal.attachmentUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={activeTaskModal.attachmentName || undefined}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-[#f59e0b]/40 text-[11px] font-mono font-bold text-amber-800 dark:text-[#f59e0b] hover:underline"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>{activeTaskModal.attachmentName || 'Unduh Lampiran Instruksi'}</span>
                  </a>
                )}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#192433]">
                  <span>Maks: {activeTaskModal.maxSize}</span>
                  <span className="text-amber-600 dark:text-[#f59e0b]">
                    Format: {activeTaskModal.allowedFormats}
                  </span>
                </div>
              </div>

              {isActiveTaskGraded && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-500/40 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between font-bold text-indigo-800 dark:text-indigo-200">
                    <span>{language === 'en' ? 'GRADED SCORE (LOCKED)' : 'NILAI TUGAS (TERKUNCI)'}</span>
                    <span>{activeTaskModal.grade} / 100</span>
                  </div>
                  {activeTaskModal.feedback && (
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                      {language === 'en' ? 'Feedback:' : 'Catatan Dosen:'} {activeTaskModal.feedback}
                    </p>
                  )}
                </div>
              )}

              {activeTaskModal.taskType === 'kelompok' && (
                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-500/40 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-indigo-900 dark:text-indigo-200 mb-1 uppercase">
                      {language === 'en' ? 'GROUP NAME' : 'NAMA KELOMPOK'}
                    </label>
                    <input
                      type="text"
                      required={!isActiveTaskGraded}
                      readOnly={isActiveTaskGraded}
                      disabled={isActiveTaskGraded}
                      aria-label={language === 'en' ? 'Group name' : 'Nama kelompok'}
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                      placeholder="Contoh: Kelompok 03 — Sistem Terdistribusi"
                      className="w-full p-2 bg-white dark:bg-[#070b12] border border-indigo-300 dark:border-indigo-700 rounded-md text-xs text-slate-900 dark:text-slate-100 disabled:opacity-70"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-indigo-900 dark:text-indigo-200 mb-1 uppercase">
                      {language === 'en'
                        ? 'GROUP MEMBERS (NAME / STUDENT ID)'
                        : 'DAFTAR ANGGOTA KELOMPOK (NAMA / NIM)'}
                    </label>
                    <textarea
                      rows="2"
                      required={!isActiveTaskGraded}
                      readOnly={isActiveTaskGraded}
                      disabled={isActiveTaskGraded}
                      aria-label={language === 'en' ? 'Group members list' : 'Daftar anggota kelompok'}
                      value={groupMembersInput}
                      onChange={(e) => setGroupMembersInput(e.target.value)}
                      placeholder="Andi Pratama (23051204001), Budi Santoso (23051204002)"
                      className="w-full p-2 bg-white dark:bg-[#070b12] border border-indigo-300 dark:border-indigo-700 rounded-md text-xs text-slate-900 dark:text-slate-100 disabled:opacity-70"
                    />
                  </div>
                </div>
              )}

              {!isActiveTaskGraded && (
                <div>
                  <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                    UNGGAH DOKUMEN VIA CLOUDINARY
                  </label>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#f59e0b] rounded-xl p-4 text-center bg-slate-50 dark:bg-[#0d121a] transition cursor-pointer relative group">
                    <input
                      type="file"
                      aria-label={language === 'en' ? 'Upload assignment submission file' : 'Unggah berkas pengumpulan tugas'}
                      accept={isEducatorOrAdmin ? MATERIAL_ALLOWED_ACCEPT : SUBMISSION_ALLOWED_ACCEPT}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setUploadedFile(f);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <FileUp className="w-7 h-7 text-[#f59e0b] mx-auto mb-1.5 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {uploadedFile ? uploadedFile.name : 'Klik atau seret file PDF / DOCX / ZIP / Gambar ke sini'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      {uploadedFile
                        ? `Ukuran: ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap diunggah ke Cloudinary`
                        : `Maksimal ukuran file: ${activeTaskModal.maxSize || '15 MB'}`}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-sky-600 dark:text-[#00e5ff]" />
                  <span>
                    {language === 'en'
                      ? 'EXTERNAL SUBMISSION URL (OPTIONAL IF FILE UPLOADED)'
                      : 'TAUTAN URL EKSTERNAL (OPSIONAL JIKA UNGGAH FILE)'}
                  </span>
                </label>
                <input
                  type="url"
                  required={!isActiveTaskGraded && !uploadedFile && !activeTaskModal.submittedFile?.url}
                  readOnly={isActiveTaskGraded}
                  disabled={isActiveTaskGraded}
                  value={externalUrlInput}
                  onChange={(e) => setExternalUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/... atau https://github.com/..."
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#00e5ff] font-mono disabled:opacity-70"
                />
                {!isActiveTaskGraded && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    {language === 'en'
                      ? 'Upload directly via Cloudinary above or share a Google Drive, GitHub, OneDrive, or Docs link.'
                      : 'Unggah berkas lewat Cloudinary di atas atau tempel tautan Google Drive, GitHub, OneDrive, atau Docs.'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase">
                  {language === 'en' ? 'ANSWER NOTES / SUMMARY (OPTIONAL)' : 'CATATAN JAWABAN / RINGKASAN (OPSIONAL)'}
                </label>
                <textarea
                  rows="2"
                  readOnly={isActiveTaskGraded}
                  disabled={isActiveTaskGraded}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Catatan pengerjaan atau tautan repositori..."
                  className="w-full p-2.5 bg-white dark:bg-[#070b12] border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] disabled:opacity-70"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTaskModal(null);
                    setUploadedFile(null);
                    setGroupNameInput('');
                    setGroupMembersInput('');
                    setTaskFeedback(null);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  {isActiveTaskGraded ? (language === 'en' ? 'Close' : 'Tutup') : t('dialog_cancel')}
                </button>
                {!isActiveTaskGraded && (
                  <button
                    type="submit"
                    disabled={
                      isUploading ||
                      (!uploadedFile && !externalUrlInput.trim() && !activeTaskModal.submittedFile?.url)
                    }
                    className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-sm transition flex items-center gap-1.5 uppercase shadow-md disabled:opacity-40"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {isUploading
                      ? language === 'en'
                        ? 'Submitting...'
                        : 'Mengirim...'
                      : language === 'en'
                        ? 'Submit Assignment'
                        : 'Kirim Pengumpulan Tugas'}
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
