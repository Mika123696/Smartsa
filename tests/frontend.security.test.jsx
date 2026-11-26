import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const {
  mockAuthObj,
  mockDbObj,
  mockOnAuthStateChanged,
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockOnSnapshot,
  mockUpdateProfile,
  mockCollection,
  mockGetDocs,
  mockQuery,
  mockWhere,
  mockDocumentId,
  mockRunTransaction,
  mockAddDoc,
  mockDeleteDoc,
  mockQrToDataUrl,
  mockHtml5QrcodeStart,
  mockHtml5QrcodeStop,
  mockHtml5QrcodeClear,
  mockHtml5QrcodeScanFile,
  lastScannerOnSuccessRef,
} = vi.hoisted(() => ({
  mockAuthObj: { currentUser: null },
  mockDbObj: { name: 'mock-db' },
  mockOnAuthStateChanged: vi.fn(),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockOnSnapshot: vi.fn(() => () => {}),
  mockUpdateProfile: vi.fn(),
  mockCollection: vi.fn((_db, col) => ({ col })),
  mockGetDocs: vi.fn(async () => ({ docs: [] })),
  mockQuery: vi.fn((...args) => ({ type: 'query', args })),
  mockWhere: vi.fn((...args) => ({ type: 'where', args })),
  mockDocumentId: vi.fn(() => '__name__'),
  mockRunTransaction: vi.fn(),
  mockAddDoc: vi.fn(async () => ({ id: 'doc_new_mock' })),
  mockDeleteDoc: vi.fn(),
  mockQrToDataUrl: vi.fn(async (payload) => `data:image/png;base64,MOCK_QR_${encodeURIComponent(String(payload))}`),
  mockHtml5QrcodeStart: vi.fn(),
  mockHtml5QrcodeStop: vi.fn(async () => {}),
  mockHtml5QrcodeClear: vi.fn(async () => {}),
  mockHtml5QrcodeScanFile: vi.fn(async () => 'SMARTSA_QR:SCAN-FILE-999'),
  lastScannerOnSuccessRef: { current: null },
}));

vi.mock('../src/firebase', () => ({
  app: null,
  auth: mockAuthObj,
  db: mockDbObj,
  isFirebaseConfigured: true,
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  GithubAuthProvider: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateProfile: mockUpdateProfile,
  onAuthStateChanged: mockOnAuthStateChanged,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  collection: mockCollection,
  getDocs: mockGetDocs,
  onSnapshot: mockOnSnapshot,
  orderBy: vi.fn((...args) => ({ type: 'orderBy', args })),
  query: mockQuery,
  runTransaction: mockRunTransaction,
  updateDoc: mockUpdateDoc,
  where: mockWhere,
  documentId: mockDocumentId,
  addDoc: mockAddDoc,
  deleteDoc: mockDeleteDoc,
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: mockQrToDataUrl },
  toDataURL: mockQrToDataUrl,
}));

vi.mock('html5-qrcode', () => {
  class MockHtml5Qrcode {
    constructor(elementId) {
      this.elementId = elementId;
    }
    start(cameraConfig, config, onSuccess, onError) {
      lastScannerOnSuccessRef.current = onSuccess;
      return mockHtml5QrcodeStart(cameraConfig, config, onSuccess, onError);
    }
    stop() {
      return mockHtml5QrcodeStop();
    }
    clear() {
      return mockHtml5QrcodeClear();
    }
    scanFile(file, showImage) {
      return mockHtml5QrcodeScanFile(file, showImage);
    }
  }
  return { Html5Qrcode: MockHtml5Qrcode };
});

import DeltaContentRenderer from '../src/components/common/DeltaContentRenderer';
import AttendanceQrModal from '../src/components/common/AttendanceQrModal';
import QrScannerPanel from '../src/components/common/QrScannerPanel';
import App from '../src/App';
import SafeImage from '../src/components/common/SafeImage';
import Navbar from '../src/components/common/Navbar';
import Sidebar from '../src/components/common/Sidebar';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import { useAuth } from '../src/context/useAuth';
import AIAssistantView from '../src/components/features/AIAssistantView';
import ManualBookView from '../src/components/features/ManualBookView';
import ClassDetailView from '../src/components/features/ClassDetailView';
import {
  deltaToEditableText,
  plainTextToDelta,
} from '../src/services/deltaSerialization';
import ClassesView from '../src/components/features/ClassesView';
import DiscussionTab from '../src/components/features/DiscussionTab';
import MaterialsTab from '../src/components/features/MaterialsTab';
import ScheduleTab from '../src/components/features/ScheduleTab';
import ProfileView from '../src/components/features/ProfileView';
import LandingPage from '../src/components/public/LandingPage';
import PublicCatalog from '../src/components/public/PublicCatalog';
import AdminDashboard from '../src/components/dashboard/AdminDashboard';
import StudentDashboard from '../src/components/dashboard/StudentDashboard';
import TeacherDashboard from '../src/components/dashboard/TeacherDashboard';
import {
  addDiscussionReply,
  createClassInFirestore,
  deleteDiscussionReply,
  updateClassDetailsInFirestore,
  updateClassInfoInFirestore,
  editDiscussionReply,
  fetchAssignmentsWithUserSubmissions,
  fetchClasses,
  fetchClassesForUser,
  fetchLearningProgressByClass,
  fetchPublicClasses,
  fetchSubmissionsForLecturerClasses,
  fetchUserClassExamAttempts,
  normalizeClassDoc,
  toggleLikeDiscussion,
  updateDiscussionTopicContent,
  upsertLearningProgress,
} from '../src/services/lmsFirestoreService';
import {
  buildAttendanceQrPayload,
  clearDemoAttendanceStore,
  getSemesterAttendanceSummary,
  parseAttendanceQrPayload,
  recordMeetingAttendance,
} from '../src/services/attendanceService';
import { parseAikenQuestions } from '../src/services/aikenParser';
import { uploadMediaFile, uploadSubmissionFile } from '../src/services/cloudinaryService';
import { askAIAssistant, getActiveExamStatus, setLocalExamSession } from '../src/services/aiService';

describe('Frontend Security & UI Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthObj.currentUser = null;
    localStorage.clear();
    sessionStorage.clear();
    clearDemoAttendanceStore();
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
      window.scrollTo = vi.fn();
    }
    mockCollection.mockImplementation((_db, col) => ({ col }));
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockQuery.mockImplementation((...args) => ({ type: 'query', args }));
    mockWhere.mockImplementation((...args) => ({ type: 'where', args }));
    mockDocumentId.mockImplementation(() => '__name__');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sanitizes XSS payloads and blocks javascript: URLs in DeltaContentRenderer', () => {
    const maliciousDelta = {
      ops: [
        { insert: '<script>window.__xss=1</script><img src=x onerror=alert(1)>' },
        { insert: '\n' },
        { insert: 'Tautan Berbahaya', attributes: { link: 'javascript:alert(1)' } },
        { insert: ' ' },
        { insert: 'Tautan Aman', attributes: { link: 'https://smartsa.edu/docs' } },
        { insert: '\n' },
        { insert: { image: 'javascript:alert(2)' } },
        { insert: { image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400' } },
      ],
    };

    const { container } = render(<DeltaContentRenderer delta={maliciousDelta} />);

    // Raw HTML/script tags must render as harmless escaped text, never executable DOM elements
    expect(container.querySelector('script')).toBeNull();
    expect(window.__xss).toBeUndefined();
    expect(screen.getByText(/<script>window\.__xss=1<\/script>/)).toBeInTheDocument();

    // javascript: link must NOT become an anchor tag
    const dangerousText = screen.getByText('Tautan Berbahaya');
    expect(dangerousText.closest('a')).toBeNull();

    // Valid https: link renders safely with noopener noreferrer
    const safeLink = screen.getByText('Tautan Aman').closest('a');
    expect(safeLink).not.toBeNull();
    expect(safeLink).toHaveAttribute('href', 'https://smartsa.edu/docs');
    expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Only the safe https image renders (javascript: image is dropped)
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute(
      'src',
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400'
    );
  });

  it('renders lazy image and falls back cleanly to local initials/icon on error in SafeImage', () => {
    const { rerender } = render(
      <SafeImage
        src="https://example.com/broken-avatar.png"
        alt="Andi Saputra"
        fallbackLabel="Andi Saputra"
        variant="avatar"
        className="w-12 h-12"
      />
    );

    const img = screen.getByAltText('Andi Saputra');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');

    fireEvent.error(img);

    expect(screen.queryByAltText('Andi Saputra')).toBeNull();
    const fallbackAvatar = screen.getByRole('img', { name: 'Andi Saputra' });
    expect(fallbackAvatar).toHaveTextContent('AS');

    // Cover fallback when src fails
    rerender(
      <SafeImage
        src="https://example.com/broken-cover.jpg"
        alt="Pemrograman Web"
        fallbackLabel="PWPB303"
        variant="cover"
        className="w-full h-32"
      />
    );

    const coverImg = screen.getByAltText('Pemrograman Web');
    fireEvent.error(coverImg);
    expect(screen.getByRole('img', { name: 'Pemrograman Web' })).toHaveTextContent('PWPB303');
  });

  it('enforces field whitelist in AuthContext updateUserProfileData (blocks role, nim, password)', async () => {
    const fakeFirebaseUser = {
      uid: 'uid_student_1',
      email: 'mhs@unesa.ac.id',
      displayName: 'Mahasiswa Awal',
      emailVerified: true,
    };

    mockAuthObj.currentUser = fakeFirebaseUser;
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'uid_student_1',
        role: 'student',
        nim: '22051204001',
        institution: 'Universitas Negeri Surabaya',
      }),
    });
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSetDoc.mockResolvedValue(undefined);

    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(fakeFirebaseUser);
      return () => {};
    });

    function ProfileTester() {
      const { userProfile, role, isDemoMode, updateUserProfileData } = useAuth();
      return (
        <div>
          <span data-testid="role">{role}</span>
          <span data-testid="nim">{userProfile?.nim || ''}</span>
          <span data-testid="name">{userProfile?.displayName || ''}</span>
          <span data-testid="demo">{String(isDemoMode)}</span>
          <button
            type="button"
            onClick={() =>
              updateUserProfileData({
                displayName: 'Nama Baru Valid',
                institution: 'UNESA Surabaya',
                role: 'admin',
                nim: '999999999',
                password: 'injected-password',
                email: 'hacker@evil.test',
              })
            }
          >
            Update Profile
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <ProfileTester />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('demo')).toHaveTextContent('false');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Update Profile'));
    });

    expect(screen.getByTestId('name')).toHaveTextContent('Nama Baru Valid');
    expect(screen.getByTestId('role')).toHaveTextContent('student');
    expect(screen.getByTestId('nim')).toHaveTextContent('22051204001');

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, savedPayload] = mockSetDoc.mock.calls[0];
    expect(savedPayload).toMatchObject({
      displayName: 'Nama Baru Valid',
      institution: 'UNESA Surabaya',
    });
    expect(savedPayload).not.toHaveProperty('role');
    expect(savedPayload).not.toHaveProperty('nim');
    expect(savedPayload).not.toHaveProperty('password');
    expect(savedPayload).not.toHaveProperty('email');
  });

  it('auto-submits exam and clears exam lockout state when exam timer expires in ClassDetailView', async () => {
    const studentUser = {
      uid: 'uid_student_01',
      email: 'mhs@gmail.com',
      displayName: 'Mahasiswa Uji',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'mock-student-token'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_student_01') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_student_01', role: 'student', displayName: 'Mahasiswa Uji' }),
        };
      }
      if (ref?.path === 'exams/subj_pbo_m1_pretest') {
        return {
          exists: () => true,
          data: () => ({
            examId: 'subj_pbo_m1_pretest',
            classId: 'subj_pbo',
            meetingNo: 1,
            examType: 'pretest',
            questions: [
              { id: 'q1', question: 'Apa prinsip enkapsulasi?', options: ['A', 'B', 'C', 'D'] },
            ],
          }),
        };
      }
      return { exists: () => false };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, opts) => {
        const body = JSON.parse(opts?.body || '{}');
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () =>
            body.action === 'start'
              ? {
                  attemptId: 'subj_pbo_m1_pretest_uid_student_01',
                  meetingNo: 1,
                  examType: 'pretest',
                  status: 'in_progress',
                  examActive: true,
                }
              : {
                  attemptId: 'subj_pbo_m1_pretest_uid_student_01',
                  meetingNo: 1,
                  examType: 'pretest',
                  status: 'submitted',
                  examActive: false,
                  score: 100,
                },
        };
      })
    );

    const onExamStateChange = vi.fn();

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'subj_pbo',
              name: 'Pemrograman Berorientasi Objek',
              code: 'PBO101',
              meetings: [
                {
                  id: 'subj_pbo_m1',
                  order: 1,
                  title: 'Pertemuan 01: Pengantar OOP',
                  date: 'Senin, 08.00–10.30',
                  status: 'in_progress',
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
            onExamStateChange={onExamStateChange}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // Switch to Exam tab and wait until dynamic exam questions finish loading
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /MULAI PRETEST/i })).not.toBeDisabled();
    });

    vi.useFakeTimers();

    // Start Pretest
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MULAI PRETEST/i }));
    });

    expect(onExamStateChange).toHaveBeenCalledWith(true);
    expect(screen.getByText(/SISA WAKTU/i)).toBeInTheDocument();

    // Advance 15 minutes (900 seconds) so the exam timer expires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(902_000);
    });

    expect(screen.getByText(/EVALUASI BERHASIL DISERAHKAN/i)).toBeInTheDocument();
    expect(screen.getByText(/SKOR KOMPETENSI/i)).toBeInTheDocument();
    expect(onExamStateChange).toHaveBeenLastCalledWith(false);
  });

  it('synchronizes userProfile via POST /api/bootstrap with Bearer token and uses strictly read-only fallback without client setDoc role writes', async () => {
    const adminFirebaseUser = {
      uid: 'uid_admin_smartsa',
      email: 'admin@smartsa.edu',
      displayName: 'Admin Session',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'firebase-id-token-admin'),
    };

    const fetchBootstrapMock = vi.fn(async (url) => {
      if (url === '/api/bootstrap') {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            success: true,
            isNewUser: false,
            profile: {
              uid: 'uid_admin_smartsa',
              email: 'admin@smartsa.edu',
              displayName: 'Administrator Smartsa',
              role: 'admin',
              accountType: 'DOSEN',
              isInstitutional: true,
              nip: 'ADM-001',
              photoURL: null,
              emailVerified: true,
            },
          }),
        };
      }
      return { ok: false, headers: { get: () => 'application/json' }, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchBootstrapMock);

    mockAuthObj.currentUser = adminFirebaseUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(adminFirebaseUser);
      return () => {};
    });

    function AdminIdentityInspector() {
      const ctx = useAuth();
      return (
        <div>
          <span data-testid="admin-role">{ctx.role}</span>
          <span data-testid="admin-name">{ctx.userProfile?.displayName || ''}</span>
          <span data-testid="admin-account-type">{ctx.userProfile?.accountType || ''}</span>
          <span data-testid="admin-inst">{String(Boolean(ctx.userProfile?.isInstitutional))}</span>
          <span data-testid="admin-photo">{String(ctx.userProfile?.photoURL ?? null)}</span>
          <span data-testid="has-sim">{String('simulateDevRole' in ctx)}</span>
        </div>
      );
    }

    const { unmount } = render(
      <AuthProvider>
        <AdminIdentityInspector />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-role')).toHaveTextContent('admin');
    });

    expect(screen.getByTestId('admin-name')).toHaveTextContent('Administrator Smartsa');
    expect(screen.getByTestId('admin-account-type')).toHaveTextContent('DOSEN');
    expect(screen.getByTestId('admin-inst')).toHaveTextContent('true');
    expect(screen.getByTestId('admin-photo')).toHaveTextContent('null');
    expect(screen.getByTestId('has-sim')).toHaveTextContent('false');

    expect(fetchBootstrapMock).toHaveBeenCalledWith(
      '/api/bootstrap',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-id-token-admin',
        }),
      })
    );
    expect(mockSetDoc).not.toHaveBeenCalled();

    // Verify read-only fallback when /api/bootstrap fails: never writes role/domain from client
    unmount();
    vi.clearAllMocks();
    const fallbackUser = {
      uid: 'uid_fallback_student',
      email: 'dosen@smartsa.edu',
      displayName: 'Dosen Dev Offline',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-offline'),
    };
    mockAuthObj.currentUser = fallbackUser;
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network unavailable');
    }));
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(fallbackUser);
      return () => {};
    });

    render(
      <AuthProvider>
        <AdminIdentityInspector />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-name')).toHaveTextContent('Dosen Dev Offline');
    });
    // Without server /api/bootstrap or existing Firestore role, client NEVER elevates via @smartsa.edu regex
    expect(screen.getByTestId('admin-role')).toHaveTextContent('student');
    expect(screen.getByTestId('admin-account-type')).toHaveTextContent('UMUM');
    expect(mockGetDoc).toHaveBeenCalledWith({ path: 'users/uid_fallback_student' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('upsertLearningProgress preserves unspecified completion flags without overwriting', async () => {
    mockAuthObj.currentUser = { uid: 'uid_student_progress' };
    mockSetDoc.mockResolvedValue(undefined);

    await upsertLearningProgress({
      classId: 'subj_pbo',
      meetingNo: 3,
      materialCompleted: true,
    });

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, opts] = mockSetDoc.mock.calls[0];
    expect(ref).toEqual({ path: 'learning_progress/subj_pbo_m3_uid_student_progress' });
    expect(opts).toEqual({ merge: true });
    expect(payload).toMatchObject({
      progressId: 'subj_pbo_m3_uid_student_progress',
      classId: 'subj_pbo',
      meetingNo: 3,
      uid: 'uid_student_progress',
      materialCompleted: true,
    });
    expect(payload).not.toHaveProperty('videoCompleted');
  });

  it('gates Posttest behind Pretest + Materi + Video, locks Pretest baseline, and renders Gain Card in ClassDetailView', async () => {
    const studentUser = {
      uid: 'uid_student_02',
      email: 'mhs2@gmail.com',
      displayName: 'Mahasiswa Gain',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'mock-student-token-2'),
    };
    mockAuthObj.currentUser = studentUser;
    mockSetDoc.mockResolvedValue(undefined);
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_student_02') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_student_02', role: 'student', displayName: 'Mahasiswa Gain' }),
        };
      }
      if (ref?.path === 'exams/subj_pbo_m1_pretest') {
        return {
          exists: () => true,
          data: () => ({
            examId: 'subj_pbo_m1_pretest',
            classId: 'subj_pbo',
            meetingNo: 1,
            examType: 'pretest',
            questions: [{ id: 'q1', question: 'Pretest Q1?', options: ['A', 'B', 'C', 'D'] }],
          }),
        };
      }
      if (ref?.path === 'exams/subj_pbo_m1_posttest') {
        return {
          exists: () => true,
          data: () => ({
            examId: 'subj_pbo_m1_posttest',
            classId: 'subj_pbo',
            meetingNo: 1,
            examType: 'posttest',
            questions: [{ id: 'q1', question: 'Posttest Q1?', options: ['A', 'B', 'C', 'D'] }],
          }),
        };
      }
      return { exists: () => false };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, opts) => {
        const body = JSON.parse(opts?.body || '{}');
        const score = body.examType === 'posttest' ? 100 : 50;
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () =>
            body.action === 'start'
              ? {
                  attemptId: `subj_pbo_m1_${body.examType}_uid_student_02`,
                  meetingNo: 1,
                  examType: body.examType,
                  status: 'in_progress',
                  examActive: true,
                }
              : {
                  attemptId: `subj_pbo_m1_${body.examType}_uid_student_02`,
                  meetingNo: 1,
                  examType: body.examType,
                  status: 'submitted',
                  examActive: false,
                  score,
                },
        };
      })
    );

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'subj_pbo',
              name: 'Pemrograman Berorientasi Objek',
              code: 'PBO101',
              meetings: [
                {
                  id: 'subj_pbo_m1',
                  order: 1,
                  title: 'Pertemuan 01: Pengantar OOP',
                  date: 'Senin, 08.00–10.30',
                  status: 'in_progress',
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // 1. Go to Exam tab: wait for configured exams, Posttest must be locked initially
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /MULAI PRETEST/i })).not.toBeDisabled();
    });
    const posttestBtnInitial = screen.getByRole('button', { name: /MULAI POST-TEST/i });
    expect(posttestBtnInitial).toBeDisabled();
    expect(screen.getByText(/PRETEST VS POSTTEST GAIN/i)).toBeInTheDocument();

    // 2. Complete Pretest
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /MULAI PRETEST/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /KIRIM LEMBAR EVALUASI/i }));
    });
    expect(screen.getByText(/EVALUASI BERHASIL DISERAHKAN/i)).toBeInTheDocument();

    // Return to Syllabus, then check Exam: Pretest is locked as baseline & Posttest still gated
    fireEvent.click(screen.getByRole('button', { name: /KEMBALI KE SILABUS/i }));
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    expect(screen.getByRole('button', { name: /PRETEST SELESAI \(BASELINE/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /MULAI POST-TEST/i })).toBeDisabled();

    // 3. Complete Material and Video
    fireEvent.click(screen.getByRole('button', { name: /MATERI FILE/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tandai Materi Selesai/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /VIDEO CDN/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tandai Video Selesai/i }));
    });

    // 4. Posttest should now be unlocked
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    const unlockedPosttestBtn = screen.getByRole('button', { name: /MULAI POST-TEST/i });
    expect(unlockedPosttestBtn).not.toBeDisabled();

    // Complete Posttest and verify Gain Card displays delta (+50)
    await act(async () => {
      fireEvent.click(unlockedPosttestBtn);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /KIRIM LEMBAR EVALUASI/i }));
    });
    fireEvent.click(screen.getByRole('button', { name: /KEMBALI KE SILABUS/i }));
    expect(screen.getAllByText(/GAIN Δ/i).length).toBeGreaterThan(0);

    // 5. Posttest must be locked permanently after submission (matching Pretest lock)
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    const lockedPosttestBtn = screen.getByRole('button', { name: /POST-TEST SELESAI/i });
    expect(lockedPosttestBtn).toBeDisabled();
  });

  it('allows lecturer to toggle Jawaban Terverifikasi Dosen in contextual DiscussionTab', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_01',
      email: 'dosen@smartsa.edu',
      displayName: 'Dr. Andi Saputra',
      emailVerified: true,
    };

    mockAuthObj.currentUser = lecturerUser;
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'uid_dosen_01',
        email: 'dosen@smartsa.edu',
        displayName: 'Dr. Andi Saputra',
        role: 'lecturer',
      }),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });

    mockOnSnapshot.mockImplementation((_q, cb) => {
      cb({
        docs: [
          {
            id: 'disc_m1_01',
            data: () => ({
              classId: 'subj_pbo',
              meetingNo: 1,
              subject: 'Pemrograman Berorientasi Objek',
              author: 'Mahasiswa Demo',
              role: 'student',
              content: 'Mengapa enkapsulasi penting?',
              likes: 1,
              likedBy: [],
              timeLabel: '10:00 WIB',
              isVerifiedAnswer: false,
              verifiedBy: '',
              verifiedReplyId: '',
              replies: [
                {
                  id: 'rep_01',
                  author: 'Mahasiswa Lain',
                  role: 'student',
                  content: 'Untuk menjaga invarian state objek.',
                  time: '10:05 WIB',
                },
              ],
            }),
          },
        ],
      });
      return () => {};
    });

    render(
      <LanguageProvider>
        <AuthProvider>
          <DiscussionTab
            embedded
            classId="subj_pbo"
            classNameTitle="Pemrograman Berorientasi Objek"
            meetingNo={1}
            meetingTitle="Kontrak Kuliah"
          />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Mengapa enkapsulasi penting?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verifikasi Jawaban/i })).toBeInTheDocument();
    });

    const verifyBtn = screen.getByRole('button', { name: /Verifikasi Jawaban/i });
    await act(async () => {
      fireEvent.click(verifyBtn);
    });

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'discussions/disc_m1_01' },
      expect.objectContaining({
        isVerifiedAnswer: true,
        verifiedBy: 'uid_dosen_01',
        verifiedReplyId: 'rep_01',
      })
    );
  });

  it('creates 100% empty classes without auto-seeded fallback meetings or dummy materials', async () => {
    mockAuthObj.currentUser = { uid: 'uid_dosen_clean' };
    mockSetDoc.mockResolvedValue(undefined);

    const created = await createClassInFirestore({
      name: 'Sistem Terdistribusi',
      category: 'Ilmu Komputer',
      instructorName: 'Dr. Andi Saputra',
    });

    expect(created.meetings).toEqual([]);
    expect(created.meetingsCount).toBe(0);
    expect(created.materialsCount).toBe(0);
    expect(created.enrolledCount).toBe(0);
    expect(created.coverImage).toBe('');
    expect(created.videoUrl).toBe('');
    expect(created.pdfUrl).toBe('');
    expect(created.description).toBe('');

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [, savedPayload] = mockSetDoc.mock.calls[0];
    expect(savedPayload.meetings).toEqual([]);
    expect(savedPayload.meetingsCount).toBe(0);
    expect(savedPayload.materialsCount).toBe(0);

    const normalizedEmpty = normalizeClassDoc('cls_empty', {
      name: 'Kelas Kosong',
      meetings: [],
    });
    expect(normalizedEmpty.meetings).toEqual([]);
    expect(normalizedEmpty.meetingsCount).toBe(0);
    expect(normalizedEmpty.materialsCount).toBe(0);
  });

  it('renders empty state for new classes and preserves stable max(order)+1 meeting numbers on add/delete in ClassDetailView', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_01',
      email: 'dosen@smartsa.edu',
      displayName: 'Dr. Andi Saputra',
      emailVerified: true,
    };

    mockAuthObj.currentUser = lecturerUser;
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'uid_dosen_01',
        email: 'dosen@smartsa.edu',
        displayName: 'Dr. Andi Saputra',
        role: 'lecturer',
      }),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });

    const onClassUpdated = vi.fn();

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_new_1',
              name: 'Kelas Baru Kosong',
              code: 'CLS101',
              category: 'Ilmu Komputer',
              description: '',
              instructor: 'Dr. Andi Saputra',
              lecturerId: 'uid_dosen_01',
              meetings: [],
              meetingsCount: 0,
              materialsCount: 0,
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
            onClassUpdated={onClassUpdated}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Belum Ada Pertemuan di Kelas Ini/i)).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText(/Kontrak Kuliah/i);
    const addBtn = screen.getByRole('button', { name: /^Tambah$/i });

    // 1. Add Meeting 1 (order: 1)
    fireEvent.change(titleInput, { target: { value: 'Kontrak Kuliah' } });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_new_1' },
      expect.objectContaining({
        meetingsCount: 1,
        meetings: [expect.objectContaining({ id: 'cls_new_1_m1', order: 1, title: 'Kontrak Kuliah' })],
      })
    );

    // 2. Add Meeting 2 (order: 2)
    fireEvent.change(titleInput, { target: { value: 'Struktur Data' } });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_new_1' },
      expect.objectContaining({
        meetingsCount: 2,
        meetings: [
          expect.objectContaining({ order: 1 }),
          expect.objectContaining({ id: 'cls_new_1_m2', order: 2, title: 'Struktur Data' }),
        ],
      })
    );

    // 3. Delete Meeting 1 -> Meeting 2 MUST keep order: 2 (no renumbering)
    fireEvent.click(screen.getByRole('button', { name: /Hapus pertemuan 1/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Hapus$/i }));
    });

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_new_1' },
      expect.objectContaining({
        meetingsCount: 1,
        meetings: [expect.objectContaining({ id: 'cls_new_1_m2', order: 2, title: 'Struktur Data' })],
      })
    );

    // 4. Add another meeting -> MUST get max(2) + 1 = 3, NOT 2
    fireEvent.change(titleInput, { target: { value: 'Algoritma Graf' } });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_new_1' },
      expect.objectContaining({
        meetingsCount: 2,
        meetings: [
          expect.objectContaining({ id: 'cls_new_1_m2', order: 2, title: 'Struktur Data' }),
          expect.objectContaining({ id: 'cls_new_1_m3', order: 3, title: 'Algoritma Graf' }),
        ],
      })
    );
    expect(onClassUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({
        meetingsCount: 2,
      })
    );
  });

  it('renders clean empty states for reading material, video, PDF, and unconfigured exams without dummy fallbacks', async () => {
    const studentUser = {
      uid: 'uid_student_empty',
      email: 'mhs.empty@gmail.com',
      displayName: 'Mahasiswa Baru',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-empty'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_student_empty') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_student_empty', role: 'student', displayName: 'Mahasiswa Baru' }),
        };
      }
      return { exists: () => false };
    });

    const { container } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_empty_02',
              name: 'Keamanan Jaringan',
              code: 'SEC202',
              category: 'Keamanan Siber',
              description: '',
              instructor: 'Dr. Budi',
              lecturerId: 'uid_dosen_02',
              videoUrl: '',
              pdfUrl: '',
              meetings: [
                {
                  id: 'cls_empty_02_m1',
                  order: 1,
                  title: 'Pengantar Kriptografi',
                  date: 'Selasa, 10.00',
                  status: 'open',
                  hasVideo: false,
                  hasPdf: false,
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // 1. Course Materials tab: clean empty state, zero hardcoded Clean Architecture fallback, & no per-meeting Manual Book tab
    fireEvent.click(screen.getByRole('button', { name: /MATERI FILE/i }));
    expect(screen.getByText(/Belum ada materi file untuk pertemuan ini/i)).toBeInTheDocument();
    expect(screen.queryByText(/Clean Architecture/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /MANUAL BOOK/i })).toBeNull();

    // 2. Video tab: no ForBiggerBlazes.mp4 fallback
    fireEvent.click(screen.getByRole('button', { name: /VIDEO CDN/i }));
    expect(
      screen.getByText(/Belum Ada Video Pembelajaran untuk Pertemuan Ini/i)
    ).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('ForBiggerBlazes');

    // 3. Exam tab: unconfigured exams disabled & no hardcoded EXAM_QUESTIONS
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Evaluasi untuk pertemuan ini belum dibuat oleh dosen/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /PRETEST BELUM TERSEDIA/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /POST-TEST BELUM TERSEDIA/i })).toBeDisabled();
  });

  it('allows lecturer to manage per-meeting material files and video URLs safely, and syncs hasVideo/materialsCount', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_01',
      email: 'dosen@smartsa.edu',
      displayName: 'Dr. Andi Saputra',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-dosen'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_01') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_01', role: 'lecturer', displayName: 'Dr. Andi Saputra' }),
        };
      }
      return { exists: () => false };
    });
    mockUpdateDoc.mockResolvedValue(undefined);
    const onClassUpdated = vi.fn();

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_crud_mat',
              name: 'Algoritma Lanjut',
              code: 'ALG301',
              category: 'Ilmu Komputer',
              description: '',
              instructor: 'Dr. Andi Saputra',
              lecturerId: 'uid_dosen_01',
              videoUrl: '',
              meetings: [
                {
                  id: 'cls_crud_mat_m1',
                  order: 1,
                  title: 'Divide and Conquer',
                  date: 'Rabu, 08.00',
                  status: 'open',
                  materialFiles: [],
                  hasVideo: false,
                },
              ],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
            onClassUpdated={onClassUpdated}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/MODE INSTRUKTUR/i)).toBeInTheDocument();
    });

    // 1. Reject javascript: material URL, then save valid https:// material file -> materialsCount: 1
    fireEvent.click(screen.getByRole('button', { name: /MATERI FILE/i }));
    const matTitleInput = screen.getByLabelText(/Judul berkas materi/i);
    const matUrlInput = screen.getByLabelText(/URL berkas materi \(https:\/\/\)/i);
    const callsBeforeInvalidMat = mockUpdateDoc.mock.calls.length;

    fireEvent.change(matTitleInput, { target: { value: 'Modul Divide and Conquer' } });
    fireEvent.change(matUrlInput, { target: { value: 'javascript:alert(2)' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Materi File/i }));
    });
    expect(screen.getByText(/Hanya URL berawalan https:\/\/ yang diizinkan/i)).toBeInTheDocument();
    expect(mockUpdateDoc.mock.calls.length).toBe(callsBeforeInvalidMat);

    fireEvent.change(matUrlInput, {
      target: { value: 'https://res.cloudinary.com/demo/raw/upload/v1/modul-algoritma.pdf' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Materi File/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 1,
        meetings: [
          expect.objectContaining({
            id: 'cls_crud_mat_m1',
            materialFiles: [
              expect.objectContaining({
                title: 'Modul Divide and Conquer',
                fileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/modul-algoritma.pdf',
              }),
            ],
          }),
        ],
      })
    );

    // 2. Reject javascript: video URL, then accept valid https://youtu.be URL -> hasVideo: true, materialsCount: 2
    fireEvent.click(screen.getByRole('button', { name: /VIDEO CDN/i }));
    const videoInput = screen.getByLabelText(/URL video pembelajaran pertemuan/i);
    const prevUpdateCalls = mockUpdateDoc.mock.calls.length;

    fireEvent.change(videoInput, { target: { value: 'javascript:alert(1)' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Video/i }));
    });
    expect(screen.getByText(/URL video tidak valid/i)).toBeInTheDocument();
    expect(mockUpdateDoc.mock.calls.length).toBe(prevUpdateCalls);

    fireEvent.change(videoInput, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Video/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 2,
        meetings: [
          expect.objectContaining({
            id: 'cls_crud_mat_m1',
            videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
            hasVideo: true,
          }),
        ],
      })
    );

    // 3. Delete Video -> hasVideo: false, materialsCount: 1
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Hapus Video/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 1,
        meetings: [
          expect.objectContaining({
            id: 'cls_crud_mat_m1',
            videoUrl: '',
            hasVideo: false,
          }),
        ],
      })
    );
    expect(onClassUpdated).toHaveBeenLastCalledWith(
      expect.objectContaining({
        materialsCount: 1,
      })
    );
  });

  it('allows lecturer to create and save exam questions + server reference answerKey via save_exam without correctIndex', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_exam',
      email: 'dosen.exam@smartsa.edu',
      displayName: 'Dr. Exam',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-exam-dosen'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_exam') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_exam', role: 'lecturer', displayName: 'Dr. Exam' }),
        };
      }
      return { exists: () => false };
    });

    const fetchMock = vi.fn(async (_url, opts) => {
      const parsed = JSON.parse(opts?.body || '{}');
      if (parsed.action === 'instructor_keys') {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            classId: 'cls_exam_01',
            meetingNo: 1,
            examType: 'pretest',
            answerKey: {},
            isConfigured: false,
          }),
        };
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          saved: true,
          examId: 'cls_exam_01_m1_pretest',
          classId: 'cls_exam_01',
          meetingNo: 1,
          examType: 'pretest',
          questionsCount: 1,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_exam_01',
              name: 'Basis Data',
              code: 'BD101',
              category: 'Sistem Informasi',
              description: '',
              instructor: 'Dr. Exam',
              lecturerId: 'uid_dosen_exam',
              meetings: [
                {
                  id: 'cls_exam_01_m1',
                  order: 1,
                  title: 'Normalisasi',
                  date: 'Kamis, 09.00',
                  status: 'open',
                },
              ],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /KUNCI & STATISTIK/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /KUNCI & STATISTIK/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Teks Soal 1/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Teks Soal 1/i), {
      target: { value: 'Apa tujuan utama bentuk normal ketiga (3NF)?' },
    });
    fireEvent.change(screen.getByLabelText(/Soal 1 Opsi 1/i), { target: { value: 'Duplikasi data' } });
    fireEvent.change(screen.getByLabelText(/Soal 1 Opsi 2/i), {
      target: { value: 'Menghilangkan ketergantungan transitif' },
    });
    fireEvent.change(screen.getByLabelText(/Soal 1 Opsi 3/i), {
      target: { value: 'Menambah indeks tabel' },
    });
    fireEvent.change(screen.getByLabelText(/Soal 1 Opsi 4/i), {
      target: { value: 'Menggabungkan tabel' },
    });
    fireEvent.change(screen.getByLabelText(/Soal 1 Opsi 5/i), {
      target: { value: 'Memperbanyak atribut turunan' },
    });
    fireEvent.change(screen.getByLabelText(/Kunci Jawaban Soal 1/i), { target: { value: '1' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Soal & Kunci ke Server/i }));
    });

    const saveCall = fetchMock.mock.calls.find(([, opts]) => {
      const b = JSON.parse(opts?.body || '{}');
      return b.action === 'save_exam';
    });
    expect(saveCall).toBeDefined();
    const sentBody = JSON.parse(saveCall[1].body);
    expect(sentBody).toMatchObject({
      action: 'save_exam',
      classId: 'cls_exam_01',
      meetingNo: 1,
      examType: 'pretest',
      answerKey: { q1: 1 },
      questions: [
        {
          id: 'q1',
          question: 'Apa tujuan utama bentuk normal ketiga (3NF)?',
          options: [
            'Duplikasi data',
            'Menghilangkan ketergantungan transitif',
            'Menambah indeks tabel',
            'Menggabungkan tabel',
            'Memperbanyak atribut turunan',
          ],
        },
      ],
    });
    expect(JSON.stringify(sentBody)).not.toContain('correctIndex');
  });

  it('keeps userProfile null when unauthenticated and renders Navbar/ProfileView/StudentDashboard cleanly without fake demo identities', async () => {
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    function ProfileNullInspector() {
      const { userProfile, currentUser } = useAuth();
      return (
        <div>
          <span data-testid="profile-is-null">{String(userProfile === null)}</span>
          <span data-testid="user-is-null">{String(currentUser === null)}</span>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ProfileNullInspector />
            <Navbar activeTab="landing" setActiveTab={vi.fn()} onOpenAuth={vi.fn()} />
            <ProfileView onOpenAuth={vi.fn()} />
            <StudentDashboard onNavigateTab={vi.fn()} onSelectActivity={vi.fn()} />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-is-null')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('user-is-null')).toHaveTextContent('true');
    expect(screen.queryByText(/mhs@smartsa\.edu/i)).toBeNull();
    expect(screen.queryByText(/25050974001/i)).toBeNull();
    expect(screen.queryByText(/Ruang Lab Komputer 03/i)).toBeNull();
    expect(screen.queryByText(/^18$/)).toBeNull();
  });

  it('returns empty collections without DEMO_CLASSES and renders clean empty states across public/dashboard views', async () => {
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    const pubRes = await fetchPublicClasses();
    const clsRes = await fetchClasses();
    expect(pubRes).toMatchObject({ classes: [], isEmpty: true });
    expect(clsRes).toMatchObject({ classes: [], isEmpty: true });

    const { unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <LandingPage
            onGoToDashboard={vi.fn()}
            onGoToCatalog={vi.fn()}
            onOpenAuth={vi.fn()}
            onSelectClass={vi.fn()}
          />
          <PublicCatalog onSelectClass={vi.fn()} />
          <AdminDashboard onClassesChanged={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Belum Ada Kelas Publik Tersedia/i)).toBeInTheDocument();
      expect(screen.getByText(/Belum ada kelas publik yang tersedia saat ini/i)).toBeInTheDocument();
      expect(screen.getByText(/Belum ada log audit server yang tercatat pada sesi ini/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('8.5h')).toBeNull();
    expect(screen.queryByText('20 / 20')).toBeNull();
    expect(screen.queryByText('1420')).toBeNull();
    expect(screen.queryByText(/Seed Kelas Standar/i)).toBeNull();
    expect(screen.queryByText(/Bambang Sudarmono/i)).toBeNull();
    unmount();

    const { unmount: unmountMaterials } = render(
      <LanguageProvider>
        <AuthProvider>
          <MaterialsTab onSelectSubject={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Belum Ada Modul Mata Kuliah/i)).toBeInTheDocument();
    });
    const tasksSubTabBtn = screen.getByRole('button', { name: /Tugas/i });
    fireEvent.click(tasksSubTabBtn);
    await waitFor(() => {
      expect(screen.getByText(/Belum Ada Tugas di Firestore/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Tugas Praktikum 01: Implementasi OOP/i)).toBeNull();
    unmountMaterials();
  });

  it('disables standalone DiscussionTab new-topic form when 0 classes exist so empty classId is never submitted', async () => {
    mockAuthObj.currentUser = { uid: 'uid_no_class_user', displayName: 'Pengguna Baru' };
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(mockAuthObj.currentUser);
      return () => {};
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ uid: 'uid_no_class_user', role: 'student', displayName: 'Pengguna Baru' }),
    });

    render(
      <LanguageProvider>
        <AuthProvider>
          <DiscussionTab />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Belum ada kelas tersedia untuk forum diskusi/i)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Kirim Pertanyaan/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enforces role-scoped fetchClassesForUser, 10-ID documentId chunking, 0-class short-circuits, and classId filters', async () => {
    // 1. Lecturer role: strictly filters classes by lecturerId
    mockAuthObj.currentUser = { uid: 'uid_dosen_1' };
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'cls_lec_1', data: () => ({ name: 'Basis Data', lecturerId: 'uid_dosen_1' }) }],
    });
    const lecRes = await fetchClassesForUser({ uid: 'uid_dosen_1', role: 'lecturer' });
    expect(lecRes.classes.map((c) => c.id)).toEqual(['cls_lec_1']);
    expect(mockWhere).toHaveBeenCalledWith('lecturerId', '==', 'uid_dosen_1');

    // 2. Student with 0 memberships: short-circuits without ever issuing `in: []`
    vi.clearAllMocks();
    mockAuthObj.currentUser = { uid: 'uid_mhs_0' };
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    const emptyStudentRes = await fetchClassesForUser({ uid: 'uid_mhs_0', role: 'student' });
    expect(emptyStudentRes.classes).toEqual([]);
    expect(emptyStudentRes.isEmpty).toBe(true);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(mockDocumentId).not.toHaveBeenCalled();

    // 3. Student with 12 memberships: chunks Firestore `in` queries into max 10 IDs (10 + 2)
    vi.clearAllMocks();
    mockAuthObj.currentUser = { uid: 'uid_mhs_12' };
    const twelveClassIds = Array.from(
      { length: 12 },
      (_, idx) => `cls_${String(idx + 1).padStart(2, '0')}`
    );
    mockGetDocs
      .mockResolvedValueOnce({
        docs: twelveClassIds.map((cid, idx) => ({
          id: `${cid}_uid_mhs_12_${idx}`,
          data: () => ({ classId: cid, uid: 'uid_mhs_12' }),
        })),
      })
      .mockResolvedValueOnce({
        docs: twelveClassIds.slice(0, 10).map((cid) => ({
          id: cid,
          data: () => ({ name: `Kelas ${cid}`, lecturerId: 'uid_lec' }),
        })),
      })
      .mockResolvedValueOnce({
        docs: twelveClassIds.slice(10).map((cid) => ({
          id: cid,
          data: () => ({ name: `Kelas ${cid}`, lecturerId: 'uid_lec' }),
        })),
      });

    const chunkedRes = await fetchClassesForUser({ uid: 'uid_mhs_12', role: 'student' });
    expect(chunkedRes.classes).toHaveLength(12);
    expect(mockGetDocs).toHaveBeenCalledTimes(3);
    const inCalls = mockWhere.mock.calls.filter((args) => args[1] === 'in');
    expect(inCalls).toHaveLength(2);
    expect(inCalls[0][2]).toHaveLength(10);
    expect(inCalls[1][2]).toHaveLength(2);

    // 4. 0-class short-circuits on assignments & lecturer grading submissions
    vi.clearAllMocks();
    mockAuthObj.currentUser = { uid: 'uid_mhs_0' };
    const emptyAssignments = await fetchAssignmentsWithUserSubmissions({ classIds: [] });
    const emptySubmissions = await fetchSubmissionsForLecturerClasses([]);
    expect(emptyAssignments.assignments).toEqual([]);
    expect(emptyAssignments.isEmpty).toBe(true);
    expect(emptySubmissions).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();

    // 5. Class-scoped progress & exam attempts always filter both `classId` and `uid`
    vi.clearAllMocks();
    mockAuthObj.currentUser = { uid: 'uid_mhs_01' };
    await fetchLearningProgressByClass('cls_scoped', 'uid_mhs_01');
    await fetchUserClassExamAttempts('cls_scoped', 'uid_mhs_01');
    expect(mockWhere).toHaveBeenCalledWith('classId', '==', 'cls_scoped');
    expect(mockWhere).toHaveBeenCalledWith('uid', '==', 'uid_mhs_01');
  });

  it('scopes attendance summaries to active classes, clears demo store/exam sessionStorage, and locks meeting switching during active exam', async () => {
    // 1. Demo store scoping & clearing
    await recordMeetingAttendance({ classId: 'cls_enrolled', meetingNo: 1 });
    await recordMeetingAttendance({ classId: 'cls_untracked', meetingNo: 1 });
    expect(
      await getSemesterAttendanceSummary(null, [{ id: 'cls_enrolled', meetingsCount: 4 }])
    ).toEqual({
      attended: 1,
      totalMeetings: 4,
      progress: 25,
    });
    expect(await getSemesterAttendanceSummary(null, [])).toEqual({
      attended: 0,
      totalMeetings: 0,
      progress: 0,
    });
    clearDemoAttendanceStore();
    expect(
      await getSemesterAttendanceSummary(null, [{ id: 'cls_enrolled', meetingsCount: 4 }])
    ).toEqual({
      attended: 0,
      totalMeetings: 4,
      progress: 0,
    });

    // 2. Authenticated Firestore attendance summary ignores non-member class docs & avoids global / 16
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'cls_A_m1_uid_mhs_1', data: () => ({ uid: 'uid_mhs_1', classId: 'cls_A' }) },
        { id: 'cls_B_m1_uid_mhs_1', data: () => ({ uid: 'uid_mhs_1', classId: 'cls_B' }) },
        { id: 'cls_OLD_m1_uid_mhs_1', data: () => ({ uid: 'uid_mhs_1', classId: 'cls_OLD' }) },
      ],
    });
    expect(
      await getSemesterAttendanceSummary('uid_mhs_1', [
        { id: 'cls_A', meetingsCount: 2 },
        { id: 'cls_B', meetingsCount: 3 },
      ])
    ).toEqual({
      attended: 2,
      totalMeetings: 5,
      progress: 40,
    });

    // 3. Exam sessionStorage lifecycle reset
    setLocalExamSession({
      classId: 'cls_lock',
      meetingNo: 1,
      examType: 'pretest',
      active: true,
      durationMs: 60000,
    });
    const beforeReset = await getActiveExamStatus();
    expect(beforeReset.isExamActive).toBe(true);
    expect(beforeReset.activeAttempt?.classId).toBe('cls_lock');

    setLocalExamSession({ active: false });
    const afterReset = await getActiveExamStatus();
    expect(afterReset.isExamActive).toBe(false);
    expect(afterReset.activeAttempt).toBeNull();

    // 4. ClassDetailView disables meeting selector while examActive === true
    const studentUser = {
      uid: 'uid_mhs_lock',
      email: 'mhs@smartsa.edu',
      displayName: 'Mahasiswa Uji',
      getIdToken: vi.fn(async () => 'fake-token'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_lock') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_lock', role: 'student', displayName: 'Mahasiswa Uji' }),
        };
      }
      if (ref?.path === 'exams/cls_lock_m1_pretest') {
        return {
          exists: () => true,
          data: () => ({
            classId: 'cls_lock',
            meetingNo: 1,
            examType: 'pretest',
            questions: [
              {
                id: 'q1',
                question: 'Apa prinsip enkapsulasi pada OOP?',
                options: ['Menyembunyikan detail internal', 'Pewarisan', 'Polimorfisme', 'Abstraksi'],
              },
            ],
          }),
        };
      }
      return { exists: () => false };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ status: 'started', attemptId: 'cls_lock_m1_pretest_uid_mhs_lock' }),
      }))
    );

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_lock',
              name: 'PBO Terisolasi',
              code: 'PBO301',
              category: 'Pemrograman',
              instructor: 'Dr. Andi',
              lecturerId: 'uid_dosen_lock',
              meetings: [
                { id: 'cls_lock_m1', order: 1, title: 'Enkapsulasi', status: 'open' },
                { id: 'cls_lock_m2', order: 2, title: 'Pewarisan', status: 'open' },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    const meetingSelect = await screen.findByLabelText(/Pilih pertemuan aktif/i);
    expect(meetingSelect).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    const startBtn = await screen.findByRole('button', { name: /MULAI PRETEST/i });
    await waitFor(() => {
      expect(startBtn).not.toBeDisabled();
    });

    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByLabelText(/Pilih pertemuan aktif/i)).toBeDisabled();
    });
  });

  it('generates valid 6-12 uppercase alphanumeric class codes and handles 403 FORBIDDEN_ROLE in cloudinaryService gracefully', async () => {
    mockAuthObj.currentUser = {
      uid: 'uid_dosen_code',
      getIdToken: vi.fn(async () => 'token-123'),
    };
    mockSetDoc.mockResolvedValue(undefined);

    const createdAuto = await createClassInFirestore({ name: 'Arsitektur Cloud' });
    expect(createdAuto.code).toMatch(/^[A-Z0-9]{6,12}$/);

    await expect(
      createClassInFirestore({ name: 'Kelas Kode Pendek', code: 'CLS1' })
    ).rejects.toThrow(/6–12 karakter alfanumerik/);

    // Student document upload receives 403 FORBIDDEN_ROLE from /api/upload-sign -> clean external URL fallback
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: async () => ({
          error: 'AKSES DITOLAK: Hanya dosen atau admin...',
          code: 'FORBIDDEN_ROLE',
        }),
      }))
    );

    const samplePdf = new File(['%PDF-1.4 sample'], 'tugas_student.pdf', {
      type: 'application/pdf',
    });
    const uploadResult = await uploadMediaFile(samplePdf, 'document');
    expect(uploadResult.isLive).toBe(false);
    expect(uploadResult.requiresExternalUrl).toBe(true);
    expect(uploadResult.storageType).toBe('external_url_required');
    expect(uploadResult.note).toMatch(/Dosen\/Admin/i);
  });

  it('enforces Strict Auth Guard on #dashboard, #detail, and Landing CTAs/cards without fake identities when Firebase session is null', async () => {
    // 1. Direct visit to #dashboard with null Firebase session redirects to #landing and opens AuthModal
    window.location.hash = '#dashboard';
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#landing');
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Pengguna Smartsa/i)).toBeNull();
    expect(screen.queryByText(/DEMO CORE/i)).toBeNull();
    expect(screen.queryByText(/MODE DEMO/i)).toBeNull();
    expect(screen.queryByText(/Semester Aktif/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Buka Dashboard/i })).toBeNull();
    unmount();

    // 2. Direct visit to #detail with null Firebase session redirects to #landing and opens AuthModal
    window.location.hash = '#detail';
    const detailMount = render(<App />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#landing');
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Belum Ada Kelas Dipilih/i)).toBeNull();
    detailMount.unmount();

    // 3. Landing "Jelajahi Dashboard LMS" and public course cards open AuthModal without entering dashboard/#detail
    window.location.hash = '#landing';
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'cls_pub_1',
          data: () => ({
            id: 'cls_pub_1',
            name: 'Pemrograman Web Publik',
            title: 'Pemrograman Web Publik',
            code: 'PW101',
            category: 'Teknologi Informasi',
            instructor: 'Dr. Publik',
            isPublic: true,
            lecturerId: 'lec_1',
            meetings: [],
          }),
        },
      ],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Pemrograman Web Publik')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Buka Dashboard/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Jelajahi Dashboard LMS/i }));
    await waitFor(() => {
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#landing');
    expect(screen.queryByText(/Semester Aktif/i)).toBeNull();

    // Close modal and click a public course card -> still triggers AuthModal instead of #detail preview
    fireEvent.click(screen.getByRole('button', { name: /Tutup modal autentikasi/i }));
    expect(screen.queryByText(/Masuk ke Smartsa LMS/i)).toBeNull();

    fireEvent.click(screen.getByText('Pemrograman Web Publik'));
    await waitFor(() => {
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#landing');
  });

  it('holds rendering and avoids premature #dashboard redirect/AuthModal while Firebase auth state is loading', async () => {
    window.location.hash = '#dashboard';
    let emitAuth = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      emitAuth = cb;
      return () => {};
    });

    render(<App />);

    expect(screen.getByText(/SMARTSA LMS \/\/ INITIALIZING/i)).toBeInTheDocument();
    expect(window.location.hash).toBe('#dashboard');
    expect(screen.queryByText(/Masuk ke Smartsa LMS/i)).toBeNull();
    expect(screen.queryByText(/Semester Aktif/i)).toBeNull();

    // Resolve Firebase session with a valid authenticated user -> opens Dashboard directly without landing bounce
    const authedUser = {
      uid: 'uid_auth_reload',
      email: 'siti@kampus.ac.id',
      displayName: 'Siti Mahasiswa',
      emailVerified: true,
    };
    mockAuthObj.currentUser = authedUser;
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_auth_reload') {
        return {
          exists: () => true,
          data: () => ({
            uid: 'uid_auth_reload',
            email: 'siti@kampus.ac.id',
            displayName: 'Siti Mahasiswa',
            role: 'student',
            nim: '25050974999',
          }),
        };
      }
      return { exists: () => false };
    });

    await act(async () => {
      await emitAuth(authedUser);
    });

    await waitFor(() => {
      expect(screen.getByText('SITI MAHASISWA')).toBeInTheDocument();
      expect(screen.getByText('Siti Mahasiswa')).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#dashboard');
    expect(screen.queryByText(/Masuk ke Smartsa LMS/i)).toBeNull();
  });

  it('ignores legacy localStorage auth cache when Firebase session is null and renders active account controls in Navbar when signed in', async () => {
    // Seed legacy localStorage keys that older builds used
    localStorage.setItem(
      'smartsa_active_profile',
      JSON.stringify({
        uid: 'legacy_spoof',
        email: 'hacker@smartsa.edu',
        role: 'admin',
        displayName: 'Fake Stored Admin',
      })
    );
    localStorage.setItem('smartsa_registered_accounts', JSON.stringify([{ email: 'hacker@smartsa.edu' }]));
    localStorage.setItem('smartsa_user', 'FakeUser');
    localStorage.setItem('smartsa_role', 'admin');

    window.location.hash = '#dashboard';
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(window.location.hash).toBe('#landing');
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Fake Stored Admin/i)).toBeNull();
    expect(localStorage.getItem('smartsa_active_profile')).toBeNull();
    expect(localStorage.getItem('smartsa_registered_accounts')).toBeNull();
    expect(localStorage.getItem('smartsa_user')).toBeNull();
    expect(localStorage.getItem('smartsa_role')).toBeNull();
    unmount();

    // Authenticated Navbar renders active account indicator + Buka Dashboard + Keluar instead of Masuk / Daftar
    const signedInUser = {
      uid: 'uid_nav_user',
      email: 'budi@kampus.ac.id',
      displayName: 'Budi Terautentikasi',
      emailVerified: true,
    };
    mockAuthObj.currentUser = signedInUser;
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'uid_nav_user',
        email: 'budi@kampus.ac.id',
        displayName: 'Budi Terautentikasi',
        role: 'student',
      }),
    });
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(signedInUser);
      return () => {};
    });

    render(
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <Navbar activeTab="landing" setActiveTab={vi.fn()} onOpenAuth={vi.fn()} />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Budi Terautentikasi')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Buka Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keluar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Masuk \/ Daftar/i })).toBeNull();
  });

  it('enables student Cloudinary file upload or URL fallback while protecting graded tasks in ClassDetailView and MaterialsTab', async () => {
    const studentUser = {
      uid: 'uid_mhs_task',
      email: 'mhs.task@gmail.com',
      displayName: 'Mahasiswa Tugas',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'mock-student-task-token'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_task') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_task', role: 'student', displayName: 'Mahasiswa Tugas' }),
        };
      }
      return { exists: () => false };
    });

    const assignmentDocs = [
      {
        id: 'asg_ungraded',
        data: () => ({
          classId: 'subj_pbo',
          meetingNo: 1,
          title: 'Tugas Belum Dinilai',
          subject: 'Pemrograman Berorientasi Objek',
          subjectCode: 'PBO101',
          deadline: '2026-12-30T23:59:00.000Z',
        }),
      },
      {
        id: 'asg_graded',
        data: () => ({
          classId: 'subj_pbo',
          meetingNo: 1,
          title: 'Tugas Sudah Dinilai',
          subject: 'Pemrograman Berorientasi Objek',
          subjectCode: 'PBO101',
          deadline: '2026-12-30T23:59:00.000Z',
        }),
      },
    ];

    const submissionDocs = [
      {
        id: 'asg_ungraded_uid_mhs_task',
        data: () => ({
          assignmentId: 'asg_ungraded',
          uid: 'uid_mhs_task',
          classId: 'subj_pbo',
          storageType: 'external_url',
          externalUrl: 'https://github.com/student/ungraded',
          notes: 'Catatan awal mahasiswa',
          submittedAtLabel: 'Hari ini',
        }),
      },
      {
        id: 'asg_graded_uid_mhs_task',
        data: () => ({
          assignmentId: 'asg_graded',
          uid: 'uid_mhs_task',
          classId: 'subj_pbo',
          storageType: 'external_url',
          externalUrl: 'https://github.com/student/graded',
          notes: 'Jawaban final terkunci',
          grade: 92,
          feedback: 'Struktur kode sangat rapi',
          submittedAtLabel: 'Kemarin',
        }),
      },
    ];

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'class_members') {
        return {
          docs: [
            {
              id: 'subj_pbo_uid_mhs_task',
              data: () => ({ classId: 'subj_pbo', uid: 'uid_mhs_task', status: 'approved' }),
            },
          ],
        };
      }
      if (colName === 'classes') {
        return {
          docs: [
            {
              id: 'subj_pbo',
              data: () => ({
                name: 'Pemrograman Berorientasi Objek',
                code: 'PBO101',
                meetings: [{ id: 'subj_pbo_m1', order: 1, title: 'Pertemuan 01', status: 'in_progress' }],
              }),
            },
          ],
        };
      }
      if (colName === 'assignments') {
        return { docs: assignmentDocs };
      }
      if (colName === 'submissions') {
        return { docs: submissionDocs };
      }
      return { docs: [] };
    });

    const findCardWithButton = (headingEl) => {
      let node = headingEl?.parentElement;
      while (
        node &&
        !Array.from(node.querySelectorAll('button')).some((b) =>
          /Detail Tugas/i.test(b.textContent || '')
        )
      ) {
        node = node.parentElement;
      }
      return node;
    };

    // 1. Verify student task list & modal behavior inside ClassDetailView
    const { container, unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'subj_pbo',
              name: 'Pemrograman Berorientasi Objek',
              code: 'PBO101',
              meetings: [{ id: 'subj_pbo_m1', order: 1, title: 'Pertemuan 01', status: 'in_progress' }],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    const tasksTabBtn = await screen.findByRole('button', { name: /PENGUMPULAN TUGAS FILE/i });
    fireEvent.click(tasksTabBtn);

    const ungradedHeading = await screen.findByText('Tugas Belum Dinilai');
    const gradedHeading = await screen.findByText('Tugas Sudah Dinilai');

    expect(screen.getAllByRole('button', { name: /Detail Tugas/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Unggah Ulang/i })).toHaveLength(1);

    const gradedCard = findCardWithButton(gradedHeading);
    const ungradedCard = findCardWithButton(ungradedHeading);
    expect(gradedCard).not.toBeNull();
    expect(ungradedCard).not.toBeNull();
    expect(
      Array.from(gradedCard.querySelectorAll('button')).some((b) =>
        /Unggah Ulang/i.test(b.textContent || '')
      )
    ).toBe(false);

    // Open graded task modal: read-only, shows NILAI TUGAS (TERKUNCI), hides Cloudinary dropzone
    const gradedDetailBtn = Array.from(gradedCard.querySelectorAll('button')).find((b) =>
      /Detail Tugas/i.test(b.textContent || '')
    );
    fireEvent.click(gradedDetailBtn);

    expect(await screen.findByText(/NILAI TUGAS \(TERKUNCI\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/UNGGAH DOKUMEN VIA CLOUDINARY/i)).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    const closeGradedBtn = screen.getByRole('button', { name: /^Tutup$/i });
    expect(closeGradedBtn).toBeInTheDocument();

    fireEvent.click(closeGradedBtn);

    // Open ungraded task modal: enables student Cloudinary file dropzone + External URL input + Notes
    const ungradedDetailBtn = Array.from(ungradedCard.querySelectorAll('button')).find((b) =>
      /Detail Tugas/i.test(b.textContent || '')
    );
    fireEvent.click(ungradedDetailBtn);

    expect(screen.getByText(/UNGGAH DOKUMEN VIA CLOUDINARY/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unggah berkas pengumpulan tugas/i)).toBeInTheDocument();
    expect(
      screen.getByText(/TAUTAN URL EKSTERNAL \(OPSIONAL JIKA UNGGAH FILE\)/i)
    ).toBeInTheDocument();
    const urlInput = screen.getByDisplayValue('https://github.com/student/ungraded');
    expect(urlInput).toHaveAttribute('type', 'url');
    expect(screen.getByDisplayValue('Catatan awal mahasiswa')).toBeInTheDocument();
    unmount();

    // 2. Verify identical protections and student dropzone inside standalone MaterialsTab -> Tugas
    const { container: matContainer, unmount: unmountMat } = render(
      <LanguageProvider>
        <AuthProvider>
          <MaterialsTab onSelectSubject={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    const matTasksTab = await screen.findByRole('button', { name: /PENGUMPULAN TUGAS/i });
    fireEvent.click(matTasksTab);

    const matUngradedHeading = await screen.findByText('Tugas Belum Dinilai');
    const matGradedHeading = await screen.findByText('Tugas Sudah Dinilai');

    expect(screen.getAllByRole('button', { name: /Detail Tugas/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Unggah Ulang/i })).toHaveLength(1);

    const matUngradedCard = findCardWithButton(matUngradedHeading);
    const matGradedCard = findCardWithButton(matGradedHeading);
    expect(
      Array.from(matGradedCard.querySelectorAll('button')).some((b) =>
        /Unggah Ulang/i.test(b.textContent || '')
      )
    ).toBe(false);

    const matUngradedBtn = Array.from(matUngradedCard.querySelectorAll('button')).find((b) =>
      /Detail Tugas/i.test(b.textContent || '')
    );
    fireEvent.click(matUngradedBtn);

    expect(screen.getByText(/UNGGAH BERKAS VIA CLOUDINARY/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unggah berkas pengumpulan tugas/i)).toBeInTheDocument();
    expect(
      screen.getByText(/TAUTAN URL EKSTERNAL \(OPSIONAL JIKA UNGGAH FILE\)/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Batal$/i }));

    const matGradedBtn = Array.from(matGradedCard.querySelectorAll('button')).find((b) =>
      /Detail Tugas/i.test(b.textContent || '')
    );
    fireEvent.click(matGradedBtn);
    expect(await screen.findByText(/NILAI TUGAS \(TERKUNCI\)/i)).toBeInTheDocument();
    expect(matContainer.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole('button', { name: /^Tutup$/i })).toBeInTheDocument();
    unmountMat();
  });

  it('configures exam metadata, dynamic 2-6 options with key shifting, archive/delete, and scoped Gain analytics in ClassDetailView', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_meta',
      email: 'dosen.meta@smartsa.edu',
      displayName: 'Dr. Meta',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-dosen-meta'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });

    let configuredPretestExam = null;

    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_meta') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_meta', role: 'lecturer', displayName: 'Dr. Meta' }),
        };
      }
      if (ref?.path === 'exams/cls_meta_m1_pretest' && configuredPretestExam) {
        return {
          exists: () => true,
          data: () => configuredPretestExam,
        };
      }
      return { exists: () => false };
    });

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'class_members') {
        return {
          docs: [
            {
              id: 'cls_meta_uid_siti',
              data: () => ({
                classId: 'cls_meta',
                uid: 'uid_siti',
                studentName: 'Siti Rahma',
                email: 'siti@univ.ac.id',
                status: 'approved',
              }),
            },
            {
              id: 'cls_meta_uid_budi',
              data: () => ({
                classId: 'cls_meta',
                uid: 'uid_budi',
                displayName: 'Budi Santoso',
                email: 'budi@univ.ac.id',
                status: 'approved',
              }),
            },
          ],
        };
      }
      if (colName === 'exam_attempts') {
        return {
          docs: [
            {
              id: 'cls_meta_m1_pretest_uid_siti',
              data: () => ({
                classId: 'cls_meta',
                meetingNo: 1,
                examType: 'pretest',
                uid: 'uid_siti',
                status: 'submitted',
                score: 60,
              }),
            },
            {
              id: 'cls_meta_m1_posttest_uid_siti',
              data: () => ({
                classId: 'cls_meta',
                meetingNo: 1,
                examType: 'posttest',
                uid: 'uid_siti',
                studentName: 'Siti Rahma',
                studentEmail: 'siti@univ.ac.id',
                status: 'submitted',
                score: 90,
              }),
            },
            {
              id: 'cls_meta_m1_pretest_uid_budi',
              data: () => ({
                classId: 'cls_meta',
                meetingNo: 1,
                examType: 'pretest',
                uid: 'uid_budi',
                status: 'submitted',
                score: 80,
              }),
            },
            {
              id: 'cls_meta_m2_pretest_uid_other',
              data: () => ({
                classId: 'cls_meta',
                meetingNo: 2,
                examType: 'pretest',
                uid: 'uid_other',
                studentName: 'Peserta Pertemuan 2',
                status: 'submitted',
                score: 100,
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const fetchMock = vi.fn(async (_url, opts) => {
      const parsed = JSON.parse(opts?.body || '{}');
      if (parsed.action === 'instructor_keys') {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            classId: 'cls_meta',
            meetingNo: parsed.meetingNo,
            examType: parsed.examType,
            answerKey: configuredPretestExam ? { q1: 3 } : {},
            isConfigured: Boolean(configuredPretestExam),
          }),
        };
      }
      if (parsed.action === 'save_exam') {
        configuredPretestExam = {
          examId: 'cls_meta_m1_pretest',
          classId: 'cls_meta',
          meetingNo: 1,
          examType: 'pretest',
          title: parsed.title,
          status: parsed.status,
          durationMinutes: parsed.durationMinutes,
          deadline: parsed.deadline,
          questions: parsed.questions,
        };
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            saved: true,
            status: parsed.status,
            durationMinutes: parsed.durationMinutes,
            deadline: parsed.deadline,
          }),
        };
      }
      if (parsed.action === 'archive_exam') {
        if (configuredPretestExam) {
          configuredPretestExam = { ...configuredPretestExam, status: 'archived' };
        }
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ archived: true, status: 'archived' }),
        };
      }
      if (parsed.action === 'delete_exam') {
        configuredPretestExam = null;
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ deleted: true }),
        };
      }
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_meta',
              name: 'Arsitektur Cloud',
              code: 'CLD201',
              lecturerId: 'uid_dosen_meta',
              meetings: [
                { id: 'cls_meta_m1', order: 1, title: 'Pertemuan 1', status: 'open' },
                { id: 'cls_meta_m2', order: 2, title: 'Pertemuan 2', status: 'open' },
              ],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    const insightsTab = await screen.findByRole('button', { name: /KUNCI & STATISTIK/i });
    fireEvent.click(insightsTab);

    await waitFor(() => {
      expect(screen.getByText(/TOTAL PESERTA UJIAN \(PRETEST • P1\)/i)).toBeInTheDocument();
    });

    // Scoped Meeting 1 Pretest stats: 2 participants (not 4), avg (60+80)/2 = 70, passed 1 / 2
    expect(screen.getByText('70 / 100')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getAllByText('Siti Rahma').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Budi Santoso').length).toBeGreaterThan(0);
    expect(screen.queryByText('Peserta Pertemuan 2')).toBeNull();
    // Gain table delta (+30 for Siti Rahma)
    expect(screen.getByText('+30')).toBeInTheDocument();

    // Configure metadata + default 5 options (A-E) -> add 6th option -> remove option 2 -> key shifts from 5 to 4
    fireEvent.change(screen.getByLabelText(/Status evaluasi/i), { target: { value: 'draft' } });
    fireEvent.change(screen.getByLabelText(/Durasi ujian \(menit\)/i), { target: { value: '45' } });
    const deadlineInput = screen.getByLabelText(/Deadline evaluasi/i);
    fireEvent.change(deadlineInput, { target: { value: '2026-12-30T15:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Hapus Deadline/i }));
    expect(deadlineInput).toHaveValue('');
    fireEvent.change(deadlineInput, { target: { value: '2026-12-30T15:30' } });

    fireEvent.change(screen.getByLabelText(/Teks Soal 1/i), { target: { value: 'Soal Metadata?' } });
    expect(screen.getByLabelText(/Soal 1 Opsi 5/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tambah opsi Soal 1/i }));
    expect(screen.getByLabelText(/Soal 1 Opsi 6/i)).toBeInTheDocument();

    ['Opsi 1', 'Opsi 2', 'Opsi 3', 'Opsi 4', 'Opsi 5', 'Opsi 6'].forEach((label, idx) => {
      fireEvent.change(screen.getByLabelText(new RegExp(`Soal 1 Opsi ${idx + 1}`, 'i')), {
        target: { value: `Pilihan ${label}` },
      });
    });
    fireEvent.change(screen.getByLabelText(/Kunci Jawaban Soal 1/i), { target: { value: '5' } });

    // Remove Opsi 2 -> selected answer index 5 shifts safely to 4
    fireEvent.click(screen.getByRole('button', { name: /Hapus pilihan 2 pertanyaan 1/i }));
    expect(screen.queryByLabelText(/Soal 1 Opsi 6/i)).toBeNull();
    expect(screen.getByLabelText(/Kunci Jawaban Soal 1/i)).toHaveValue('4');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Soal & Kunci ke Server/i }));
    });

    const saveCall = fetchMock.mock.calls.find(
      ([, opts]) => JSON.parse(opts?.body || '{}').action === 'save_exam'
    );
    expect(saveCall).toBeDefined();
    const savedBody = JSON.parse(saveCall[1].body);
    expect(savedBody).toMatchObject({
      action: 'save_exam',
      status: 'draft',
      durationMinutes: 45,
      answerKey: { q1: 4 },
      questions: [
        {
          id: 'q1',
          question: 'Soal Metadata?',
          options: [
            'Pilihan Opsi 1',
            'Pilihan Opsi 3',
            'Pilihan Opsi 4',
            'Pilihan Opsi 5',
            'Pilihan Opsi 6',
          ],
        },
      ],
    });
    expect(typeof savedBody.deadline).toBe('string');

    // Archive and delete active evaluation
    const archiveBtn = await screen.findByRole('button', { name: /Arsipkan Evaluasi/i });
    await act(async () => {
      fireEvent.click(archiveBtn);
    });
    expect(
      fetchMock.mock.calls.some(([, opts]) => JSON.parse(opts?.body || '{}').action === 'archive_exam')
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Hapus Evaluasi/i }));
    const confirmDeleteBtn = await screen.findByRole('button', { name: /Ya, Hapus Evaluasi/i });
    await act(async () => {
      fireEvent.click(confirmDeleteBtn);
    });
    expect(
      fetchMock.mock.calls.some(([, opts]) => JSON.parse(opts?.body || '{}').action === 'delete_exam')
    ).toBe(true);
  });

  it('syncs timer with examExpiresAt, recovers in_progress session + localStorage draft, and shows draft/archived status to students', async () => {
    const studentUser = {
      uid: 'uid_mhs_rec',
      email: 'mhs.rec@univ.ac.id',
      displayName: 'Mahasiswa Recovery',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-mhs-rec'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });

    const draftKey = 'smartsa_exam_draft_cls_rec_m1_pretest_uid_mhs_rec';
    localStorage.setItem(draftKey, JSON.stringify({ q1: 2 }));

    const expiresAtMs = Date.now() + 240_000;
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_rec') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_rec', role: 'student', displayName: 'Mahasiswa Recovery' }),
        };
      }
      if (ref?.path === 'exams/cls_rec_m1_pretest') {
        return {
          exists: () => true,
          data: () => ({
            examId: 'cls_rec_m1_pretest',
            classId: 'cls_rec',
            meetingNo: 1,
            examType: 'pretest',
            status: 'published',
            durationMinutes: 30,
            questions: [{ id: 'q1', question: 'Pemulihan Sesi?', options: ['Opsi A', 'Opsi B', 'Opsi C'] }],
          }),
        };
      }
      if (ref?.path === 'exams/cls_rec_m1_posttest') {
        return {
          exists: () => true,
          data: () => ({
            examId: 'cls_rec_m1_posttest',
            classId: 'cls_rec',
            meetingNo: 1,
            examType: 'posttest',
            status: 'draft',
            durationMinutes: 20,
            questions: [{ id: 'q2', question: 'Draft Posttest?', options: ['Ya', 'Tidak'] }],
          }),
        };
      }
      return { exists: () => false };
    });

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'exam_attempts') {
        return {
          docs: [
            {
              id: 'cls_rec_m1_pretest_uid_mhs_rec',
              data: () => ({
                classId: 'cls_rec',
                meetingNo: 1,
                examType: 'pretest',
                uid: 'uid_mhs_rec',
                status: 'in_progress',
                examActive: true,
                examExpiresAt: expiresAtMs,
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const fetchMock = vi.fn(async (_url, opts) => {
      const parsed = JSON.parse(opts?.body || '{}');
      return {
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          attemptId: 'cls_rec_m1_pretest_uid_mhs_rec',
          meetingNo: 1,
          examType: parsed.examType || 'pretest',
          status: 'submitted',
          examActive: false,
          score: 100,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_rec',
              name: 'Keamanan Siber',
              code: 'SEC101',
              meetings: [{ id: 'cls_rec_m1', order: 1, title: 'Pertemuan 01', status: 'open' }],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // Automatically recovers in_progress sheet + restores localStorage option index 2 + syncs ~4:00 timer
    expect(await screen.findByText(/PRETEST AKTIF/i)).toBeInTheDocument();
    expect(screen.getByText(/DURASI: 30 MNT/i)).toBeInTheDocument();
    expect(screen.getByText(/SISA WAKTU:\s*0[34]:/i)).toBeInTheDocument();

    const optionC = screen.getByLabelText('Opsi C');
    expect(optionC).toBeChecked();

    // Selecting a new answer updates localStorage draft immediately
    fireEvent.click(screen.getByLabelText('Opsi B'));
    expect(JSON.parse(localStorage.getItem(draftKey) || '{}')).toEqual({ q1: 1 });

    // Submit clears localStorage draft cleanly
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /KIRIM LEMBAR EVALUASI/i }));
    });
    expect(localStorage.getItem(draftKey)).toBeNull();

    // Returning to exam tab confirms draft Posttest displays DRAFT status and stays disabled
    fireEvent.click(screen.getByRole('button', { name: /KEMBALI KE SILABUS/i }));
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    const draftPosttestBtn = screen.getByRole('button', { name: /POST-TEST MASIH DRAFT/i });
    expect(draftPosttestBtn).toBeDisabled();
  });

  it('embeds YouTube /shorts/ and /live/ URLs cleanly and suppresses preview Firestore queries in ClassDetailView', async () => {
    const studentUser = {
      uid: 'uid_mhs_vid',
      email: 'vid@univ.ac.id',
      displayName: 'Mahasiswa Video',
      emailVerified: true,
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_vid') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_vid', role: 'student', displayName: 'Mahasiswa Video' }),
        };
      }
      return { exists: () => false };
    });

    const { rerender, unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_vid',
              name: 'Multimedia',
              code: 'MM101',
              meetings: [
                {
                  id: 'cls_vid_m1',
                  order: 1,
                  title: 'YouTube Shorts',
                  videoUrl: 'https://www.youtube.com/shorts/shortVid123?feature=share',
                  status: 'open',
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /VIDEO CDN/i }));
    const shortsFrame = await screen.findByTitle('YouTube Shorts');
    expect(shortsFrame).toHaveAttribute('src', 'https://www.youtube.com/embed/shortVid123');

    rerender(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_vid',
              name: 'Multimedia',
              code: 'MM101',
              meetings: [
                {
                  id: 'cls_vid_m1',
                  order: 1,
                  title: 'YouTube Live',
                  videoUrl: 'https://youtube.com/live/liveStream987?si=abc',
                  status: 'open',
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    const liveFrame = await screen.findByTitle('YouTube Live');
    expect(liveFrame).toHaveAttribute('src', 'https://www.youtube.com/embed/liveStream987');
    unmount();

    // Preview mode (isMember === false) MUST NOT fire Firestore collection queries
    mockGetDocs.mockClear();
    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_preview',
              name: 'Kelas Pratinjau',
              code: 'PRV101',
              meetings: [{ id: 'cls_prev_m1', order: 1, title: 'Pengantar', status: 'open' }],
            }}
            isMember={false}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/MODE PRATINJAU SILABUS/i)).toBeInTheDocument();
    });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('computes MaterialsTab per-meeting progress accurately (capped at 100%) and navigates from StudentDashboard exam history using classId & meetingNo', async () => {
    const studentUser = {
      uid: 'uid_mhs_nav',
      email: 'nav@univ.ac.id',
      displayName: 'Mahasiswa Navigasi',
      emailVerified: true,
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_nav') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_nav', role: 'student', displayName: 'Mahasiswa Navigasi' }),
        };
      }
      return { exists: () => false };
    });

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'class_members') {
        return {
          docs: [
            { id: 'cls_first_uid_mhs_nav', data: () => ({ classId: 'cls_first', uid: 'uid_mhs_nav', status: 'approved' }) },
            { id: 'cls_second_uid_mhs_nav', data: () => ({ classId: 'cls_second', uid: 'uid_mhs_nav', status: 'approved' }) },
          ],
        };
      }
      if (colName === 'classes') {
        return {
          docs: [
            {
              id: 'cls_first',
              data: () => ({
                name: 'Kelas Pertama',
                code: 'KLS1',
                materialsCount: 9,
                meetingsCount: 3,
                meetings: [
                  { id: 'm1', order: 1, title: 'M1' },
                  { id: 'm2', order: 2, title: 'M2' },
                  { id: 'm3', order: 3, title: 'M3' },
                ],
              }),
            },
            {
              id: 'cls_second',
              data: () => ({
                name: 'Kelas Tujuan',
                code: 'KLS2',
                meetingsCount: 2,
                meetings: [
                  { id: 's1', order: 1, title: 'S1' },
                  { id: 's2', order: 2, title: 'S2' },
                ],
              }),
            },
          ],
        };
      }
      if (colName === 'learning_progress') {
        return {
          docs: [
            { id: 'p1', data: () => ({ classId: 'cls_first', meetingNo: 1, materialCompleted: true, videoCompleted: true }) },
            { id: 'p2', data: () => ({ classId: 'cls_first', meetingNo: 2, materialCompleted: true }) },
            { id: 'p3', data: () => ({ classId: 'cls_first', meetingNo: 3, videoCompleted: true }) },
          ],
        };
      }
      if (colName === 'exam_attempts') {
        return {
          docs: [
            {
              id: 'cls_second_m2_posttest_uid_mhs_nav',
              data: () => ({
                classId: 'cls_second',
                meetingNo: 2,
                examType: 'posttest',
                uid: 'uid_mhs_nav',
                status: 'submitted',
                score: 94,
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const { unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <MaterialsTab onSelectSubject={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    expect(await screen.findByText(/3 pertemuan • 3 selesai \(100%\)/i)).toBeInTheDocument();
    unmount();

    const onSelectActivityMock = vi.fn();
    render(
      <LanguageProvider>
        <AuthProvider>
          <StudentDashboard onNavigateTab={vi.fn()} onSelectActivity={onSelectActivityMock} />
        </AuthProvider>
      </LanguageProvider>
    );

    const ujianMenuBtn = await screen.findByRole('button', { name: /Ujian UTS & UAS/i });
    fireEvent.click(ujianMenuBtn);
    const openClassBtn = await screen.findByRole('button', { name: /Buka Kelas/i });
    fireEvent.click(openClassBtn);

    expect(onSelectActivityMock).toHaveBeenCalledWith({
      classId: 'cls_second',
      meetingNo: 2,
      examType: 'posttest',
    });
  });

  it('supports assignment edit/delete, submission filter, and unsubmitted approved members list in ClassDetailView NILAI TUGAS', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_crud',
      email: 'dosen.crud@smartsa.edu',
      displayName: 'Dr. CRUD',
      emailVerified: true,
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_crud') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_crud', role: 'lecturer', displayName: 'Dr. CRUD' }),
        };
      }
      return { exists: () => false };
    });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'assignments') {
        return {
          docs: [
            {
              id: 'asg_1',
              data: () => ({
                classId: 'cls_crud',
                meetingNo: 1,
                title: 'Tugas Pertemuan Satu',
                deadline: '2026-12-20T23:59:00.000Z',
                note: 'Instruksi awal',
              }),
            },
            {
              id: 'asg_2',
              data: () => ({
                classId: 'cls_crud',
                meetingNo: 2,
                title: 'Tugas Pertemuan Dua',
                deadline: '2026-12-25T23:59:00.000Z',
                note: 'Instruksi dua',
              }),
            },
          ],
        };
      }
      if (colName === 'submissions') {
        return {
          docs: [
            {
              id: 'asg_1_uid_siti',
              data: () => ({
                assignmentId: 'asg_1',
                classId: 'cls_crud',
                meetingNo: 1,
                uid: 'uid_siti',
                studentName: 'Siti Aminah',
                assignmentTitle: 'Tugas Pertemuan Satu',
                status: 'submitted',
              }),
            },
          ],
        };
      }
      if (colName === 'class_members') {
        return {
          docs: [
            {
              id: 'cls_crud_uid_siti',
              data: () => ({ classId: 'cls_crud', uid: 'uid_siti', studentName: 'Siti Aminah', status: 'approved' }),
            },
            {
              id: 'cls_crud_uid_budi',
              data: () => ({ classId: 'cls_crud', uid: 'uid_budi', studentName: 'Budi Terlambat', status: 'active' }),
            },
            {
              id: 'cls_crud_uid_pending',
              data: () => ({ classId: 'cls_crud', uid: 'uid_pending', studentName: 'Calon Pending', status: 'pending' }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_crud',
              name: 'Rekayasa Perangkat Lunak',
              code: 'RPL301',
              lecturerId: 'uid_dosen_crud',
              meetings: [
                { id: 'm1', order: 1, title: 'Pertemuan 1', status: 'open' },
                { id: 'm2', order: 2, title: 'Pertemuan 2', status: 'open' },
              ],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /NILAI TUGAS/i }));

    expect(await screen.findByText('Budi Terlambat')).toBeInTheDocument();
    expect(screen.queryByText('Calon Pending')).toBeNull();

    // Filter by Tugas Pertemuan Dua -> shows zero submissions cleanly
    fireEvent.change(screen.getByLabelText(/Filter tugas penilaian/i), {
      target: { value: 'asg_2' },
    });
    expect(screen.getByText(/Belum ada pengumpulan tugas mahasiswa untuk filter/i)).toBeInTheDocument();

    // Reset filter back to All and edit asg_1
    fireEvent.change(screen.getByLabelText(/Filter tugas penilaian/i), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Edit Tugas Tugas Pertemuan Satu/i }));
    fireEvent.change(screen.getByLabelText(/Edit judul tugas/i), {
      target: { value: 'Tugas Pertemuan Satu (Revisi)' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Perubahan Tugas/i }));
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'assignments/asg_1' },
      expect.objectContaining({ title: 'Tugas Pertemuan Satu (Revisi)' })
    );

    // Delete asg_2 via AccessibleDialog
    fireEvent.click(screen.getByRole('button', { name: /Hapus Tugas Tugas Pertemuan Dua/i }));
    const confirmDelTaskBtn = await screen.findByRole('button', { name: /Ya, Hapus Tugas/i });
    await act(async () => {
      fireEvent.click(confirmDelTaskBtn);
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith({ path: 'assignments/asg_2' });
  });

  it('renders actual class meetings dynamically in TeacherDashboard & DiscussionTab and uses Firestore transactions for discussion edits/likes/replies', async () => {
    const dosenUser = {
      uid: 'uid_dosen_dyn',
      email: 'dosen.dyn@smartsa.edu',
      displayName: 'Dosen Dinamis',
      emailVerified: true,
    };
    mockAuthObj.currentUser = dosenUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(dosenUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_dyn') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_dyn', role: 'lecturer', displayName: 'Dosen Dinamis' }),
        };
      }
      return { exists: () => false };
    });
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'classes') {
        return {
          docs: [
            {
              id: 'cls_dyn_1',
              data: () => ({
                name: 'Basis Data Dinamis',
                code: 'BDD101',
                lecturerId: 'uid_dosen_dyn',
                meetings: [
                  { id: 'd_m1', order: 1, title: 'Konsep Dasar' },
                  { id: 'd_m2', order: 2, title: 'Normalisasi' },
                ],
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const { unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <TeacherDashboard onSelectClass={vi.fn()} onNavigateView={vi.fn()} onOpenCreateClass={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    const attMeetingSelect = await screen.findByLabelText(/Pilih pertemuan sesi presensi/i);
    await waitFor(() => {
      expect(attMeetingSelect.querySelectorAll('option')).toHaveLength(2);
    });
    expect(screen.queryByText(/Pertemuan 16/i)).toBeNull();
    unmount();

    const { unmount: unmountDisc } = render(
      <LanguageProvider>
        <AuthProvider>
          <DiscussionTab />
        </AuthProvider>
      </LanguageProvider>
    );

    const filterMeetingSelect = await screen.findByLabelText(/Filter Pertemuan/i);
    await waitFor(() => {
      // 'Semua Pertemuan' + 2 actual meetings = 3 options (no hardcoded 1..16)
      expect(filterMeetingSelect.querySelectorAll('option')).toHaveLength(3);
    });
    expect(screen.queryByText(/Pertemuan 16/i)).toBeNull();
    unmountDisc();

    // Verify transactional reply, edit reply, toggle like & topic edit
    const txUpdate = vi.fn();
    mockRunTransaction.mockImplementation(async (_db, callback) =>
      callback({
        get: vi.fn(async () => ({
          exists: () => true,
          data: () => ({
            authorUid: 'uid_dosen_dyn',
            likedBy: [],
            likes: 0,
            replies: [{ id: 'rep_1', authorUid: 'uid_dosen_dyn', content: 'Balasan awal' }],
          }),
        })),
        update: txUpdate,
      })
    );

    await toggleLikeDiscussion({ id: 'disc_tx_1' });
    await addDiscussionReply({ id: 'disc_tx_1' }, 'Balasan baru', 'Dosen Dinamis');
    await editDiscussionReply({ id: 'disc_tx_1' }, { replyId: 'rep_1', content: 'Balasan diperbarui' });
    await updateDiscussionTopicContent('disc_tx_1', 'Konten topik diperbarui');
    await deleteDiscussionReply({ id: 'disc_tx_1' }, { replyId: 'rep_1' });

    expect(mockRunTransaction).toHaveBeenCalledTimes(5);
    expect(txUpdate).toHaveBeenCalledTimes(5);
  });

  it('enforces strict https:// or empty coverImage validation, supports Cloudinary upload and Hapus Cover in create/edit flows', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_cov',
      email: 'dosen.cover@smartsa.edu',
      displayName: 'Dr. Cover',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-dosen-cov'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });

    // 1. Service-level coverImage validation on createClassInFirestore & updateClassInfoInFirestore
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);

    const noCoverClass = await createClassInFirestore({ name: 'Sistem Terdistribusi' });
    expect(noCoverClass.coverImage).toBe('');

    await expect(
      createClassInFirestore({ name: 'Cover XSS', coverImage: 'javascript:alert(1)' })
    ).rejects.toThrow(/https:\/\//i);

    await expect(
      createClassInFirestore({ name: 'Cover Data', coverImage: 'data:image/png;base64,abc' })
    ).rejects.toThrow(/https:\/\//i);

    await expect(
      createClassInFirestore({ name: 'Cover HTTP', coverImage: 'http://insecure.example/a.jpg' })
    ).rejects.toThrow(/https:\/\//i);

    const validCoverUrl = 'https://res.cloudinary.com/demo/image/upload/v1/course_cover.jpg';
    const withCoverClass = await createClassInFirestore({
      name: 'Keamanan Aplikasi',
      coverImage: validCoverUrl,
    });
    expect(withCoverClass.coverImage).toBe(validCoverUrl);

    await expect(
      updateClassInfoInFirestore('cls_cov_unit', { coverImage: 'javascript:alert(2)' })
    ).rejects.toThrow(/https:\/\//i);

    await expect(
      updateClassInfoInFirestore('cls_cov_unit', { coverImage: 'data:text/html,<script>' })
    ).rejects.toThrow(/https:\/\//i);

    const clearedResult = await updateClassDetailsInFirestore('cls_cov_unit', { coverImage: '' });
    expect(clearedResult.coverImage).toBe('');
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_cov_unit' },
      expect.objectContaining({ coverImage: '' })
    );

    // SafeImage rejects javascript: URLs and renders safe placeholder instead
    const { container: safeImgContainer, unmount: unmountSafeImg } = render(
      <SafeImage
        src="javascript:alert(1)"
        alt="Dangerous Cover"
        fallbackLabel="SEC101"
        variant="cover"
      />
    );
    expect(safeImgContainer.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Dangerous Cover' })).toHaveTextContent('SEC101');
    unmountSafeImg();

    // 2. Interactive ClassesView Create Modal: Cloudinary image upload, Hapus Cover, reject unsafe, save valid https://
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_cov') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_cov', role: 'lecturer', displayName: 'Dr. Cover' }),
        };
      }
      return { exists: () => false };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/bootstrap')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              uid: 'uid_dosen_cov',
              role: 'lecturer',
              displayName: 'Dr. Cover',
              isInstitutional: true,
            }),
          };
        }
        if (String(url).includes('/api/upload-sign')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              api_key: 'demo_key',
              timestamp: 1700000000,
              signature: 'sig_cover_123',
              cloud_name: 'smartsa_cloud',
              folder: 'smartsa/covers',
            }),
          };
        }
        if (String(url).includes('api.cloudinary.com/v1_1/smartsa_cloud/auto/upload')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              secure_url: 'https://res.cloudinary.com/smartsa_cloud/image/upload/v1/cloud_cover.png',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({}),
        };
      })
    );

    mockSetDoc.mockClear();
    const { unmount: unmountClasses } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassesView onSelectClass={vi.fn()} />
        </AuthProvider>
      </LanguageProvider>
    );

    const createBtn = await screen.findByRole('button', { name: /Buat Kelas Baru/i });
    fireEvent.click(createBtn);

    const coverUrlInput = await screen.findByLabelText(/URL cover kelas/i);
    const uploadCoverInput = screen.getByLabelText(/Unggah gambar cover kelas/i);
    const pngFile = new File(['png-bytes'], 'banner.png', { type: 'image/png' });

    await act(async () => {
      fireEvent.change(uploadCoverInput, { target: { files: [pngFile] } });
    });

    await waitFor(() => {
      expect(coverUrlInput).toHaveValue(
        'https://res.cloudinary.com/smartsa_cloud/image/upload/v1/cloud_cover.png'
      );
    });

    // Clear cover via Hapus Cover button
    fireEvent.click(screen.getByRole('button', { name: /Hapus Cover/i }));
    expect(coverUrlInput).toHaveValue('');

    // Reject javascript: scheme on submit
    const nameInput = screen.getByPlaceholderText(/Contoh: Pemrograman Mobile/i);
    fireEvent.change(nameInput, { target: { value: 'Jaringan Komputer Lanjut' } });
    fireEvent.change(coverUrlInput, { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/https:\/\//i);

    const setDocCallsBeforeInvalid = mockSetDoc.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Terbitkan Kelas/i }));
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(setDocCallsBeforeInvalid);

    // Accept valid https:// cover URL and submit
    fireEvent.change(coverUrlInput, {
      target: { value: 'https://cdn.smartsa.edu/covers/jarkom.jpg' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Terbitkan Kelas/i }));
    });

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledTimes(setDocCallsBeforeInvalid + 1);
    });
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Jaringan Komputer Lanjut',
        coverImage: 'https://cdn.smartsa.edu/covers/jarkom.jpg',
      })
    );
    unmountClasses();

    // 3. Interactive ClassDetailView Ubah Info Kelas: reject unsafe data: URL and support Hapus Cover
    mockUpdateDoc.mockClear();
    const onClassUpdated = vi.fn();
    const { unmount: unmountDetail } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_edit_cov',
              name: 'Sistem Operasi',
              code: 'OS101',
              category: 'Ilmu Komputer',
              lecturerId: 'uid_dosen_cov',
              instructor: 'Dr. Cover',
              coverImage: 'https://cdn.smartsa.edu/covers/old.jpg',
              meetings: [{ id: 'm1', order: 1, title: 'Pertemuan 1' }],
            }}
            isMember={true}
            onClassUpdated={onClassUpdated}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    const editInfoBtn = await screen.findByRole('button', { name: /Ubah Info Kelas/i });
    fireEvent.click(editInfoBtn);

    const detailCoverInput = await screen.findByLabelText(/URL cover kelas/i);
    expect(detailCoverInput).toHaveValue('https://cdn.smartsa.edu/covers/old.jpg');

    fireEvent.change(detailCoverInput, { target: { value: 'data:image/png;base64,AAAA' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Info/i }));
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Hapus Cover/i }));
    expect(detailCoverInput).toHaveValue('');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Info/i }));
    });

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        { path: 'classes/cls_edit_cov' },
        expect.objectContaining({ coverImage: '' })
      );
    });
    expect(onClassUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ coverImage: '' })
    );
    unmountDetail();
  });

  it('preserves rich Delta ops losslessly across re-edits and supports safe image insertion in ClassDetailView', async () => {
    // 1. Unit lossless round-trip across all Delta features & legacy heading compatibility
    const richDelta = {
      ops: [
        { insert: 'Bab 1: Enkapsulasi' },
        { insert: '\n', attributes: { header: 1 } },
        { insert: 'Pengantar', attributes: { bold: true } },
        { insert: '\n', attributes: { header: 2 } },
        { insert: 'Konsep ' },
        { insert: 'private', attributes: { bold: true } },
        { insert: ' dan ' },
        { insert: 'abstraksi', attributes: { italic: true } },
        { insert: ' dengan ' },
        { insert: 'getter()', attributes: { code: true } },
        { insert: ' pada ' },
        { insert: 'Dokumentasi', attributes: { link: 'https://smartsa.edu/docs/oop' } },
        { insert: '.\n' },
        { insert: { image: 'https://res.cloudinary.com/demo/image/upload/v1/uml.png' } },
        { insert: '\n' },
        { insert: 'Lindungi state objek dari mutasi langsung.' },
        { insert: '\n', attributes: { blockquote: true } },
        { insert: 'Deklarasikan atribut private' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Sediakan accessor tervalidasi' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'Cocok untuk modul produksi' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'class Akun { #saldo = 0; }' },
        { insert: '\n', attributes: { 'code-block': true } },
      ],
    };

    const editableText = deltaToEditableText(richDelta);
    expect(editableText).toContain('# Bab 1: Enkapsulasi');
    expect(editableText).toContain('## **Pengantar**');
    expect(editableText).toContain('**private**');
    expect(editableText).toContain('*abstraksi*');
    expect(editableText).toContain('`getter()`');
    expect(editableText).toContain('[Dokumentasi](https://smartsa.edu/docs/oop)');
    expect(editableText).toContain('![Ilustrasi modul](https://res.cloudinary.com/demo/image/upload/v1/uml.png)');
    expect(editableText).toContain('> Lindungi state objek dari mutasi langsung.');
    expect(editableText).toContain('1. Deklarasikan atribut private');
    expect(editableText).toContain('2. Sediakan accessor tervalidasi');
    expect(editableText).toContain('- Cocok untuk modul produksi');
    expect(editableText).toContain('```\nclass Akun { #saldo = 0; }\n```');

    const rebuiltDelta = plainTextToDelta(editableText);
    expect(rebuiltDelta.ops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ insert: { image: 'https://res.cloudinary.com/demo/image/upload/v1/uml.png' } }),
        expect.objectContaining({ insert: '\n', attributes: { header: 1 } }),
        expect.objectContaining({ insert: '\n', attributes: { header: 2 } }),
        expect.objectContaining({ insert: 'Pengantar', attributes: { bold: true } }),
        expect.objectContaining({ insert: 'private', attributes: { bold: true } }),
        expect.objectContaining({ insert: 'abstraksi', attributes: { italic: true } }),
        expect.objectContaining({ insert: 'getter()', attributes: { code: true } }),
        expect.objectContaining({ insert: 'Dokumentasi', attributes: { link: 'https://smartsa.edu/docs/oop' } }),
        expect.objectContaining({ insert: '\n', attributes: { blockquote: true } }),
        expect.objectContaining({ insert: '\n', attributes: { list: 'ordered' } }),
        expect.objectContaining({ insert: '\n', attributes: { list: 'bullet' } }),
        expect.objectContaining({ insert: 'class Akun { #saldo = 0; }' }),
        expect.objectContaining({ insert: '\n', attributes: { 'code-block': true } }),
      ])
    );

    // Reject javascript: image & link markdown syntax during Delta parsing
    const unsafeAttempt = plainTextToDelta(
      '![xss](javascript:alert(1))\n[klik](javascript:alert(2))'
    );
    expect(unsafeAttempt.ops.some((op) => op.insert?.image)).toBe(false);
    expect(unsafeAttempt.ops.some((op) => op.attributes?.link)).toBe(false);

    // 2. Legacy Delta Read-Only Fallback + Cloudinary Material File Upload (PDF/PPTX/Image) in ClassDetailView
    const lecturerUser = {
      uid: 'uid_dosen_delta',
      email: 'dosen.delta@smartsa.edu',
      displayName: 'Dr. Delta',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-dosen-delta'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_delta') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_delta', role: 'lecturer', displayName: 'Dr. Delta' }),
        };
      }
      return { exists: () => false };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).includes('/api/upload-sign')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              api_key: 'demo_key',
              timestamp: 1700000111,
              signature: 'sig_mat_123',
              cloud_name: 'smartsa_cloud',
              folder: 'smartsa/documents',
            }),
          };
        }
        if (String(url).includes('api.cloudinary.com/v1_1/smartsa_cloud/auto/upload')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              secure_url:
                'https://res.cloudinary.com/smartsa_cloud/raw/upload/v9/slide_pola_desain.pptx',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({}),
        };
      })
    );

    mockUpdateDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockClear();

    const { container, unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_delta_rt',
              name: 'Desain Arsitektur Perangkat Lunak',
              code: 'DAP202',
              category: 'Rekayasa Perangkat Lunak',
              lecturerId: 'uid_dosen_delta',
              instructor: 'Dr. Delta',
              meetings: [
                {
                  id: 'cls_delta_rt_m1',
                  order: 1,
                  title: 'Pola Desain',
                  status: 'open',
                  deltaContent: richDelta,
                },
              ],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
            onClassUpdated={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /MATERI FILE/i }));

    // Legacy Delta content still renders read-only safely
    expect(screen.getByText(/CATATAN TEKS MODUL \(ARSIP READ-ONLY\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Bab 1: Enkapsulasi/i)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    ).toContain('https://res.cloudinary.com/demo/image/upload/v1/uml.png');

    // Lecturer uploads a PPTX material file via Cloudinary -> fills form -> saves into materialFiles
    const matUploadInput = screen.getByLabelText(/Unggah berkas materi pertemuan/i);
    const slideFile = new File(['pptx-binary'], 'slide_pola_desain.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    await act(async () => {
      fireEvent.change(matUploadInput, { target: { files: [slideFile] } });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/URL berkas materi \(https:\/\/\)/i)).toHaveValue(
        'https://res.cloudinary.com/smartsa_cloud/raw/upload/v9/slide_pola_desain.pptx'
      );
    });

    fireEvent.change(screen.getByLabelText(/Deskripsi berkas materi/i), {
      target: { value: 'Slide presentasi lengkap pola Singleton & Factory' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Materi File/i }));
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { path: 'classes/cls_delta_rt' },
      expect.objectContaining({
        materialsCount: 2,
        meetings: [
          expect.objectContaining({
            id: 'cls_delta_rt_m1',
            materialFiles: [
              expect.objectContaining({
                title: 'slide pola desain',
                description: 'Slide presentasi lengkap pola Singleton & Factory',
                fileType: 'pptx',
                storageType: 'cloudinary',
                fileUrl:
                  'https://res.cloudinary.com/smartsa_cloud/raw/upload/v9/slide_pola_desain.pptx',
              }),
            ],
          }),
        ],
      })
    );
    unmount();
  });

  it('surfaces honest backend AI errors on 429/500/502, renders live AIAssistantView without paused copy, and displays AI link in Sidebar for admin', async () => {
    const adminUser = {
      uid: 'uid_admin_ai',
      email: 'admin@smartsa.edu',
      displayName: 'Admin Smartsa',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-admin-ai'),
    };
    mockAuthObj.currentUser = adminUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(adminUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_admin_ai') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_admin_ai', role: 'admin', displayName: 'Admin Smartsa' }),
        };
      }
      return { exists: () => false };
    });

    // 1. aiService must throw honest error on 429, 502 JSON, and 500 plain-text (never mask with dummy reply)
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : '45') },
      json: async () => ({
        error: 'Terlalu banyak permintaan ke Asisten AI.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: 45,
      }),
    });
    await expect(askAIAssistant({ prompt: 'Halo' })).rejects.toThrow(/Terlalu banyak permintaan/);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Gemini API error (503): Quota exceeded', code: 'GEMINI_UPSTREAM_ERROR' }),
    });
    await expect(askAIAssistant({ prompt: 'Halo' })).rejects.toThrow(/Gemini API error/);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
    });
    await expect(askAIAssistant({ prompt: 'Halo' })).rejects.toThrow(/HTTP 500/);

    // 2. Sidebar shows AI Assistant link for role admin and navigates to 'ai'
    const setCurrentView = vi.fn();
    const { unmount: unmountSidebar } = render(
      <LanguageProvider>
        <AuthProvider>
          <Sidebar currentView="dashboard" setCurrentView={setCurrentView} />
        </AuthProvider>
      </LanguageProvider>
    );
    const adminAiNavBtn = await screen.findByRole('button', { name: /AI Assistant Admin/i });
    fireEvent.click(adminAiNavBtn);
    expect(setCurrentView).toHaveBeenCalledWith('ai');
    unmountSidebar();

    // 3. AIAssistantView loads user class context, forwards history & context, and renders Gemini live response
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'classes') {
        return {
          docs: [
            {
              id: 'cls_ai_ctx',
              data: () => ({
                name: 'Sistem Terdistribusi',
                code: 'STD401',
                description: 'Konsistensi & transaksi terdistribusi',
                meetings: [{ id: 'm1', order: 1, title: 'Pengantar RPC' }],
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/api/bootstrap')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            uid: 'uid_admin_ai',
            role: 'admin',
            displayName: 'Admin Smartsa',
            isInstitutional: true,
          }),
        };
      }
      if (String(url).includes('/api/ai')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            response_text: 'RPC menyederhanakan pemanggilan prosedur antar node.',
            tokens_consumed: 180,
            mode: 'gemini_live',
            is_live: true,
            model: 'gemini-2.5-flash',
            remaining_quota: 19,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({}),
      };
    });

    const { unmount: unmountAi } = render(
      <LanguageProvider>
        <AuthProvider>
          <AIAssistantView />
        </AuthProvider>
      </LanguageProvider>
    );

    expect(screen.queryByText(/Gemini Ditunda/i)).toBeNull();
    const contextSelect = await screen.findByLabelText(/Konteks Mata Kuliah/i);
    fireEvent.change(contextSelect, { target: { value: 'cls_ai_ctx' } });

    const promptInput = screen.getByPlaceholderText(/Ketik pertanyaan atau permintaan/i);
    fireEvent.change(promptInput, { target: { value: 'Jelaskan konsep RPC' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Kirim pesan/i }));
    });

    expect(await screen.findByText(/RPC menyederhanakan pemanggilan prosedur antar node\./i)).toBeInTheDocument();
    expect(screen.getByText(/Google Gemini AI \(Live • gemini-2\.5-flash\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sisa Kuota Permintaan: 19 \/ 20/i)).toBeInTheDocument();

    const aiPostCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/ai'));
    const latestAiBody = JSON.parse(aiPostCalls[aiPostCalls.length - 1][1].body);
    expect(latestAiBody.prompt).toBe('Jelaskan konsep RPC');
    expect(latestAiBody.context).toContain('Sistem Terdistribusi');
    expect(latestAiBody.history.length).toBeGreaterThan(0);
    unmountAi();
  });

  it('renders global ManualBookView with Cloudinary upload, AccessibleDialog delete, Sidebar/ProfileView nav, and Strict Auth Guard on #manual-book', async () => {
    // 1. Strict Auth Guard blocks unauthenticated #manual-book and redirects to landing
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });
    window.location.hash = '#manual-book';

    const { unmount: unmountGuestApp } = render(<App />);
    await waitFor(() => {
      expect(window.location.hash).toBe('#landing');
      expect(screen.getByText(/Masuk ke Smartsa LMS/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Smartsa Official Manual Books/i)).toBeNull();
    expect(screen.queryByText(/Manual Book & Panduan Resmi Smartsa/i)).toBeNull();
    unmountGuestApp();

    // 2. Sidebar shows Manual Book link for admin/lecturer/student & ProfileView renders quick-access button
    const adminUser = {
      uid: 'uid_admin_mb',
      email: 'admin.mb@smartsa.edu',
      displayName: 'Admin Manual Book',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-admin-mb'),
    };
    mockAuthObj.currentUser = adminUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(adminUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_admin_mb') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_admin_mb', role: 'admin', displayName: 'Admin Manual Book' }),
        };
      }
      return { exists: () => false };
    });

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/api/bootstrap')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ uid: 'uid_admin_mb', role: 'admin', isInstitutional: true }),
        };
      }
      if (String(url).includes('/api/upload-sign')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            api_key: 'mb_key',
            timestamp: 1700000222,
            signature: 'sig_mb_pdf',
            cloud_name: 'smartsa_cloud',
            folder: 'smartsa/documents',
          }),
        };
      }
      if (String(url).includes('api.cloudinary.com/v1_1/smartsa_cloud/auto/upload')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            secure_url: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_smartsa.pdf',
          }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const setViewSpy = vi.fn();
    const { unmount: unmountSidebar } = render(
      <LanguageProvider>
        <AuthProvider>
          <Sidebar currentView="dashboard" setCurrentView={setViewSpy} />
        </AuthProvider>
      </LanguageProvider>
    );
    const mbSidebarBtn = await screen.findByRole('button', { name: /^Manual Book$/i });
    fireEvent.click(mbSidebarBtn);
    expect(setViewSpy).toHaveBeenCalledWith('manual-book');
    unmountSidebar();

    const navMbSpy = vi.fn();
    const { unmount: unmountProfile } = render(
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ProfileView onOpenAuth={vi.fn()} onNavigateManualBook={navMbSpy} />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    );
    const mbProfileBtn = await screen.findByRole('button', { name: /Manual Book/i });
    fireEvent.click(mbProfileBtn);
    expect(navMbSpy).toHaveBeenCalledTimes(1);
    unmountProfile();

    // 3. ManualBookView CRUD as Admin/Lecturer + AccessibleDialog delete
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'manual_books') {
        return {
          docs: [
            {
              id: 'book_existing',
              data: () => ({
                title: 'Panduan Lama Unsafe Check',
                description: 'Uji validasi skema PDF',
                fileUrl: 'javascript:alert(9)',
                uploadedByName: 'Admin Smartsa',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });
    mockAddDoc.mockResolvedValue({ id: 'book_new_pdf' });
    mockDeleteDoc.mockResolvedValue(undefined);

    const { unmount: unmountAdminMb } = render(
      <LanguageProvider>
        <AuthProvider>
          <ManualBookView />
        </AuthProvider>
      </LanguageProvider>
    );

    expect(await screen.findByText(/Tautan PDF tidak valid atau diblokir/i)).toBeInTheDocument();

    const pdfUploadInput = screen.getByLabelText(/Unggah berkas PDF Manual Book/i);
    const sampleManual = new File(['%PDF-1.4'], 'panduan_smartsa.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(pdfUploadInput, { target: { files: [sampleManual] } });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/URL PDF Manual Book/i)).toHaveValue(
        'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_smartsa.pdf'
      );
    });

    fireEvent.change(screen.getByLabelText(/Judul Manual Book/i), {
      target: { value: 'Buku Panduan Smartsa LMS' },
    });
    fireEvent.change(screen.getByLabelText(/Deskripsi Manual Book/i), {
      target: { value: 'Panduan penggunaan mahasiswa dan dosen' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Manual Book/i }));
    });

    expect(mockAddDoc).toHaveBeenCalledWith(
      { col: 'manual_books' },
      expect.objectContaining({
        title: 'Buku Panduan Smartsa LMS',
        description: 'Panduan penggunaan mahasiswa dan dosen',
        fileUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_smartsa.pdf',
      })
    );
    expect(screen.getByTitle(/Manual Book PDF: Buku Panduan Smartsa LMS/i)).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_smartsa.pdf'
    );

    // Delete via AccessibleDialog
    fireEvent.click(screen.getByLabelText(/Hapus Manual Book Buku Panduan Smartsa LMS/i));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Ya, Hapus/i }));
    });
    expect(mockDeleteDoc).toHaveBeenCalledWith({ path: 'manual_books/book_new_pdf' });
    unmountAdminMb();

    // 4. Student view: sees Manual Book read-only (no upload/delete controls)
    const studentMbUser = {
      uid: 'uid_mhs_mb',
      email: 'mhs.mb@gmail.com',
      displayName: 'Mahasiswa Pembaca',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-mhs-mb'),
    };
    mockAuthObj.currentUser = studentMbUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentMbUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_mb') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_mb', role: 'student', displayName: 'Mahasiswa Pembaca' }),
        };
      }
      return { exists: () => false };
    });
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'manual_books') {
        return {
          docs: [
            {
              id: 'book_student_ok',
              data: () => ({
                title: 'Panduan Mahasiswa Resmi',
                description: 'Silabus & tatacara presensi',
                fileUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_mhs.pdf',
                uploadedByName: 'Admin Smartsa',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const { unmount: unmountStudentMb } = render(
      <LanguageProvider>
        <AuthProvider>
          <ManualBookView />
        </AuthProvider>
      </LanguageProvider>
    );

    const studentBookMatches = await screen.findAllByText('Panduan Mahasiswa Resmi');
    expect(studentBookMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle(/Manual Book PDF: Panduan Mahasiswa Resmi/i)).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/smartsa_cloud/raw/upload/v2/panduan_mhs.pdf'
    );
    expect(screen.queryByRole('button', { name: /Simpan Manual Book/i })).toBeNull();
    expect(screen.queryByLabelText(/Unggah berkas PDF Manual Book/i)).toBeNull();
    expect(screen.queryByLabelText(/Hapus Manual Book/i)).toBeNull();
    unmountStudentMb();

    // Verify Sidebar renders Manual Book link for student role too
    const { unmount: unmountStudentSidebar } = render(
      <LanguageProvider>
        <AuthProvider>
          <Sidebar currentView="dashboard" setCurrentView={setViewSpy} />
        </AuthProvider>
      </LanguageProvider>
    );
    expect(await screen.findByRole('button', { name: /^Manual Book$/i })).toBeInTheDocument();
    unmountStudentSidebar();
  });

  it('supports individu and kelompok assignment creation, category submission Cloudinary upload, required group metadata, and grading visibility', async () => {
    // 1. Lecturer creates a Kelompok assignment with Cloudinary instruction attachment
    const lecturerUser = {
      uid: 'uid_dosen_grp',
      email: 'dosen.grp@smartsa.edu',
      displayName: 'Dr. Kelompok',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-dosen-grp'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_grp') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_grp', role: 'lecturer', displayName: 'Dr. Kelompok' }),
        };
      }
      return { exists: () => false };
    });

    const fetchMock = vi.fn(async (url, opts) => {
      if (String(url).includes('/api/upload-sign')) {
        const parsed = JSON.parse(opts?.body || '{}');
        if (parsed.category === 'submission') {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({
              api_key: 'sub_key',
              timestamp: 1700000333,
              signature: 'sig_sub_pdf',
              cloud_name: 'smartsa_cloud',
              folder: `smartsa/submissions/${parsed.classId}/${parsed.assignmentId}/uid_mhs_grp`,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            api_key: 'doc_key',
            timestamp: 1700000333,
            signature: 'sig_doc_pdf',
            cloud_name: 'smartsa_cloud',
            folder: 'smartsa/documents',
          }),
        };
      }
      if (String(url).includes('api.cloudinary.com/v1_1/smartsa_cloud/auto/upload')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            secure_url: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v5/berkas_upload.pdf',
          }),
        };
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    mockAddDoc.mockResolvedValue({ id: 'asg_kelompok_01' });

    const { unmount: unmountLecturer } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_grp_01',
              name: 'Rekayasa Perangkat Lunak',
              code: 'RPL301',
              lecturerId: 'uid_dosen_grp',
              instructor: 'Dr. Kelompok',
              meetings: [{ id: 'cls_grp_01_m1', order: 1, title: 'Sprint 1', status: 'open' }],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /NILAI TUGAS/i }));
    fireEvent.change(screen.getByLabelText(/Tipe tugas baru/i), {
      target: { value: 'kelompok' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Tugas Praktikum 03/i), {
      target: { value: 'Tugas Proyek Kelompok 01' },
    });

    const attachFile = new File(['rubric'], 'rubrik_proyek.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Unggah lampiran instruksi tugas/i), {
        target: { files: [attachFile] },
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/Lampiran instruksi "rubrik_proyek\.pdf" berhasil diunggah/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Terbitkan Tugas/i }));
    });

    expect(mockAddDoc).toHaveBeenCalledWith(
      { col: 'assignments' },
      expect.objectContaining({
        classId: 'cls_grp_01',
        title: 'Tugas Proyek Kelompok 01',
        taskType: 'kelompok',
        attachmentName: 'rubrik_proyek.pdf',
        attachmentUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v5/berkas_upload.pdf',
      })
    );
    unmountLecturer();

    // 2. Verify submission validation & category: 'submission' Cloudinary upload as Student
    const studentUser = {
      uid: 'uid_mhs_grp',
      email: 'mhs.grp@gmail.com',
      displayName: 'Ketua Kelompok',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-mhs-grp'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_grp') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_grp', role: 'student', displayName: 'Ketua Kelompok' }),
        };
      }
      return { exists: () => false };
    });

    const unsafeFile = new File(['mz'], 'malware.exe', { type: 'application/x-msdownload' });
    await expect(
      uploadSubmissionFile(unsafeFile, { classId: 'cls_grp_01', assignmentId: 'asg_kelompok_01' })
    ).rejects.toThrow(/Format berkas tugas tidak diizinkan/i);

    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'assignments') {
        return {
          docs: [
            {
              id: 'asg_kelompok_01',
              data: () => ({
                classId: 'cls_grp_01',
                meetingNo: 1,
                title: 'Tugas Proyek Kelompok 01',
                taskType: 'kelompok',
                attachmentUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v5/berkas_upload.pdf',
                attachmentName: 'rubrik_proyek.pdf',
                note: 'Kumpulkan laporan sprint secara berkelompok.',
                deadline: '2026-12-30T23:59:00.000Z',
              }),
            },
          ],
        };
      }
      if (colName === 'submissions') {
        return { docs: [] };
      }
      return { docs: [] };
    });
    mockSetDoc.mockResolvedValue(undefined);

    const { unmount: unmountStudent } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_grp_01',
              name: 'Rekayasa Perangkat Lunak',
              code: 'RPL301',
              instructor: 'Dr. Kelompok',
              meetings: [{ id: 'cls_grp_01_m1', order: 1, title: 'Sprint 1', status: 'open' }],
            }}
            isMember={true}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /PENGUMPULAN TUGAS FILE/i }));
    expect(await screen.findByText('Tugas Proyek Kelompok 01')).toBeInTheDocument();
    expect(screen.getByText('KELOMPOK')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rubrik_proyek\.pdf/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kumpulkan Tugas/i }));
    expect(await screen.findByLabelText(/Nama kelompok/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Daftar anggota kelompok/i)).toBeInTheDocument();

    const subPdf = new File(['laporan-pdf'], 'laporan_kelompok_03.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Unggah berkas pengumpulan tugas/i), {
      target: { files: [subPdf] },
    });

    // Required validation triggers cleanly if group fields are empty on submit
    const modalForm = screen.getByRole('dialog').querySelector('form');
    await act(async () => {
      fireEvent.submit(modalForm);
    });
    expect(screen.getByText(/Nama Kelompok wajib diisi untuk tugas kelompok/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nama kelompok/i), {
      target: { value: 'Kelompok 03 Alpha' },
    });
    fireEvent.change(screen.getByLabelText(/Daftar anggota kelompok/i), {
      target: { value: 'Andi (230501)\nBudi (230502)' },
    });

    await act(async () => {
      fireEvent.submit(modalForm);
    });

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        { path: 'submissions/asg_kelompok_01_uid_mhs_grp' },
        expect.objectContaining({
          assignmentId: 'asg_kelompok_01',
          classId: 'cls_grp_01',
          taskType: 'kelompok',
          groupName: 'Kelompok 03 Alpha',
          groupMembers: ['Andi (230501)', 'Budi (230502)'],
          storageType: 'cloudinary',
          fileUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v5/berkas_upload.pdf',
        })
      );
    });

    const submissionSignCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/upload-sign') &&
        JSON.parse(init?.body || '{}').category === 'submission'
    );
    expect(submissionSignCall).toBeDefined();
    expect(JSON.parse(submissionSignCall[1].body)).toEqual(
      expect.objectContaining({
        category: 'submission',
        classId: 'cls_grp_01',
        assignmentId: 'asg_kelompok_01',
        fileName: 'laporan_kelompok_03.pdf',
      })
    );
    unmountStudent();

    // 3. Lecturer in NILAI TUGAS sees group badge, groupName, and groupMembers on submission card
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_grp') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_grp', role: 'lecturer', displayName: 'Dr. Kelompok' }),
        };
      }
      return { exists: () => false };
    });
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'submissions') {
        return {
          docs: [
            {
              id: 'asg_kelompok_01_uid_mhs_grp',
              data: () => ({
                assignmentId: 'asg_kelompok_01',
                classId: 'cls_grp_01',
                meetingNo: 1,
                uid: 'uid_mhs_grp',
                studentName: 'Ketua Kelompok',
                assignmentTitle: 'Tugas Proyek Kelompok 01',
                taskType: 'kelompok',
                groupName: 'Kelompok 03 Alpha',
                groupMembers: ['Andi (230501)', 'Budi (230502)'],
                fileUrl: 'https://res.cloudinary.com/smartsa_cloud/raw/upload/v5/berkas_upload.pdf',
                fileName: 'laporan_kelompok_03.pdf',
                status: 'submitted',
                submittedAtLabel: 'Hari ini',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    const { unmount: unmountGrading } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_grp_01',
              name: 'Rekayasa Perangkat Lunak',
              code: 'RPL301',
              lecturerId: 'uid_dosen_grp',
              instructor: 'Dr. Kelompok',
              meetings: [{ id: 'cls_grp_01_m1', order: 1, title: 'Sprint 1', status: 'open' }],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /NILAI TUGAS/i }));
    expect(await screen.findByText(/Kelompok 03 Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/Andi \(230501\) • Budi \(230502\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /laporan_kelompok_03\.pdf/i })).toBeInTheDocument();
    unmountGrading();
  });

  it('parses valid 5-option Aiken format (A. & A)) and reports line-numbered validation errors without correctIndex', () => {
    const validText = [
      'Apa kepanjangan CPU?',
      'A. Central Process Unit',
      'B. Central Processing Unit',
      'C. Computer Personal Unit',
      'D. Control Program Unit',
      'E. Core Peripheral Unit',
      'answer: b',
      '',
      'Protokol lapisan transport untuk koneksi andal adalah?',
      'A) HTTP',
      'B) UDP',
      'C) TCP',
      'D) ICMP',
      'ANSWER: C',
    ].join('\r\n');

    const okResult = parseAikenQuestions(validText);
    expect(okResult.errors).toEqual([]);
    expect(okResult.questions).toHaveLength(2);
    expect(okResult.questions[0]).toMatchObject({
      id: 'q1',
      question: 'Apa kepanjangan CPU?',
      options: [
        'Central Process Unit',
        'Central Processing Unit',
        'Computer Personal Unit',
        'Control Program Unit',
        'Core Peripheral Unit',
      ],
      answerIdx: 1,
    });
    expect(okResult.questions[1].options).toEqual(['HTTP', 'UDP', 'TCP', 'ICMP']);
    expect(okResult.answerKey).toEqual({ q1: 1, q2: 2 });
    expect(JSON.stringify(okResult)).not.toContain('correctIndex');

    const invalidText = [
      'Soal valid hanya satu opsi?',
      'A. Satu opsi saja',
      'ANSWER: A',
      '',
      'Soal huruf jawaban di luar opsi?',
      'A. Opsi Pertama',
      'B. Opsi Kedua',
      'C. Opsi Ketiga',
      'D. Opsi Keempat',
      'ANSWER: E',
    ].join('\n');

    const badResult = parseAikenQuestions(invalidText);
    expect(badResult.questions).toHaveLength(0);
    expect(badResult.errors).toHaveLength(2);
    expect(badResult.errors[0].line).toBe(1);
    expect(badResult.errors[0].message).toMatch(/Baris 1.*2 hingga 6 opsi/i);
    expect(badResult.errors[1].line).toBe(10);
    expect(badResult.errors[1].message).toMatch(/Baris 10.*"E".*A–D/i);
  });

  it('imports bulk Aiken questions in ClassDetailView, displays pointsPerQuestion weight, and syncs editor toggle UX', async () => {
    const lecturerUser = {
      uid: 'uid_dosen_aiken',
      email: 'dosen.aiken@smartsa.edu',
      displayName: 'Dr. Aiken',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-aiken'),
    };
    mockAuthObj.currentUser = lecturerUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(lecturerUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_aiken') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_aiken', role: 'lecturer', displayName: 'Dr. Aiken' }),
        };
      }
      return { exists: () => false };
    });

    let serverExam = null;
    let serverKeys = {};
    const fetchMock = vi.fn(async (_url, opts) => {
      const parsed = JSON.parse(opts?.body || '{}');
      if (parsed.action === 'save_exam') {
        serverExam = {
          classId: parsed.classId,
          meetingNo: parsed.meetingNo,
          examType: parsed.examType,
          title: parsed.title,
          status: parsed.status,
          durationMinutes: parsed.durationMinutes,
          questions: parsed.questions,
          pointsPerQuestion: Number((100 / parsed.questions.length).toFixed(2)),
        };
        serverKeys = { ...parsed.answerKey };
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ saved: true, ...serverExam }),
        };
      }
      if (parsed.action === 'instructor_keys') {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({ answerKey: serverKeys, source: 'firestore' }),
        };
      }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_dosen_aiken') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_dosen_aiken', role: 'lecturer', displayName: 'Dr. Aiken' }),
        };
      }
      if (ref?.path === 'exams/cls_aiken_m1_pretest' && serverExam) {
        return { exists: () => true, data: () => serverExam };
      }
      return { exists: () => false };
    });

    const { unmount } = render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'cls_aiken',
              name: 'Struktur Data',
              code: 'STD201',
              lecturerId: 'uid_dosen_aiken',
              meetings: [{ id: 'cls_aiken_m1', order: 1, title: 'Stack & Queue', status: 'open' }],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /KUNCI & STATISTIK/i }));

    // Empty question bank starts open & toggle reflects active open label immediately
    const toggleBtn = await screen.findByRole('button', {
      name: /Tutup Editor & Lihat Rekap/i,
    });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/1 Soal • 100 poin\/soal/i)).toBeInTheDocument();

    // Closing editor reveals Rekap / empty summary even when 0 questions exist
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('button', { name: /Buat \/ Edit Soal & Kunci/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Judul evaluasi/i)).toBeNull();

    // Re-open editor and import 2 Aiken 5-option questions
    fireEvent.click(screen.getByRole('button', { name: /Buat \/ Edit Soal & Kunci/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import Format Aiken/i }));

    const aikenTextarea = screen.getByLabelText(/Teks soal format Aiken/i);
    fireEvent.change(aikenTextarea, {
      target: {
        value: [
          'Struktur LIFO digunakan oleh?',
          'A. Queue',
          'B. Stack',
          'C. Heap',
          'D. Trie',
          'E. Graph',
          'ANSWER: B',
          '',
          'Struktur FIFO digunakan oleh?',
          'A) Queue',
          'B) Stack',
          'C) Tree',
          'D) DAG',
          'E) Set',
          'ANSWER: A',
        ].join('\n'),
      },
    });

    expect(screen.getByText(/2 soal valid terdeteksi • 50 poin\/soal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ganti Semua Soal/i }));

    expect(await screen.findByText(/2 Soal • 50 poin\/soal \(Total 100\)/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Struktur LIFO digunakan oleh?')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Struktur FIFO digunakan oleh?')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Soal & Kunci ke Server/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/BOBOT: 50 POIN\/SOAL \(2 SOAL\)/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/50 poin\/soal \(2 soal\)/i).length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it('renders lecturer QR visual with Mode Proyektor and cleans up student camera scanner on decode or close', async () => {
    // 1. Payload builder & parser round-trip
    expect(buildAttendanceQrPayload('cls101-m01-9988')).toBe('SMARTSA_QR:CLS101-M01-9988');
    expect(parseAttendanceQrPayload('SMARTSA_QR:IF101-M02-7766')).toBe('IF101-M02-7766');
    expect(parseAttendanceQrPayload('if101-m02-7766')).toBe('IF101-M02-7766');
    expect(parseAttendanceQrPayload('{"sessionCode":"ABC-999"}')).toBe('ABC-999');

    // 2. Lecturer AttendanceQrModal renders QR <img> + opens Mode Proyektor without dangerouslySetInnerHTML
    const onCloseSession = vi.fn();
    const { container: qrContainer, unmount: unmountQr } = render(
      <LanguageProvider>
        <AttendanceQrModal
          session={{
            isOpen: true,
            meetingNo: 3,
            sessionCode: 'IF202-M03-4567',
            expiresAt: Date.now() + 900_000,
          }}
          classCode="IF202"
          className="Algoritma & Struktur Data"
          onCloseSession={onCloseSession}
        />
      </LanguageProvider>
    );

    const qrImg = await screen.findByAltText('QR Code Presensi IF202-M03-4567');
    expect(qrImg.getAttribute('src')).toContain('data:image/png;base64,MOCK_QR_');
    expect(mockQrToDataUrl).toHaveBeenCalledWith(
      'SMARTSA_QR:IF202-M03-4567',
      expect.any(Object)
    );
    expect(screen.getByText(/Sisa waktu:/i)).toBeInTheDocument();
    expect(qrContainer.innerHTML).not.toContain('dangerouslySetInnerHTML');

    fireEvent.click(screen.getByRole('button', { name: /Mode Proyektor/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByAltText('QR Proyektor IF202-M03-4567')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Tutup Proyektor$/i }));
    unmountQr();

    // 3. QrScannerPanel stops and clears camera when scan succeeds OR when unmounted
    mockHtml5QrcodeStart.mockResolvedValue(undefined);
    mockHtml5QrcodeStop.mockClear();
    mockHtml5QrcodeClear.mockClear();

    const onScanSuccess = vi.fn();
    const { unmount: unmountScannerOnly } = render(
      <LanguageProvider>
        <QrScannerPanel onScanSuccess={onScanSuccess} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(mockHtml5QrcodeStart).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await lastScannerOnSuccessRef.current?.('SMARTSA_QR:IF202-M03-4567');
    });

    expect(onScanSuccess).toHaveBeenCalledWith('IF202-M03-4567', 'SMARTSA_QR:IF202-M03-4567');
    expect(mockHtml5QrcodeStop).toHaveBeenCalled();
    expect(mockHtml5QrcodeClear).toHaveBeenCalled();
    unmountScannerOnly();

    // 4. Student opens ScheduleTab modal -> switches to Scan QR Kamera -> closes modal via Escape/Close -> stops camera cleanly
    const studentUser = {
      uid: 'uid_mhs_qr',
      email: 'mhs.qr@gmail.com',
      displayName: 'Mahasiswa Scanner',
      emailVerified: true,
      getIdToken: vi.fn(async () => 'token-mhs-qr'),
    };
    mockAuthObj.currentUser = studentUser;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(studentUser);
      return () => {};
    });
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref?.path === 'users/uid_mhs_qr') {
        return {
          exists: () => true,
          data: () => ({ uid: 'uid_mhs_qr', role: 'student', displayName: 'Mahasiswa Scanner' }),
        };
      }
      if (ref?.path === 'classes/cls_qr_demo') {
        return {
          exists: () => true,
          data: () => ({
            activeAttendanceSession: {
              isOpen: true,
              meetingNo: 1,
              sessionCode: 'QR101-M01-5555',
              expiresAt: Date.now() + 600_000,
            },
          }),
        };
      }
      return { exists: () => false };
    });
    mockGetDocs.mockImplementation(async (qOrRef) => {
      const colName = qOrRef?.col || qOrRef?.args?.[0]?.col;
      if (colName === 'class_members') {
        return {
          docs: [
            {
              id: 'cls_qr_demo_uid_mhs_qr',
              data: () => ({ classId: 'cls_qr_demo', uid: 'uid_mhs_qr', status: 'approved' }),
            },
          ],
        };
      }
      if (colName === 'classes') {
        return {
          docs: [
            {
              id: 'cls_qr_demo',
              data: () => ({
                name: 'Pemrograman Web',
                code: 'QR101',
                day: 'Senin',
                time: '08.00',
                instructor: 'Dr. QR',
              }),
            },
          ],
        };
      }
      return { docs: [] };
    });

    mockHtml5QrcodeStart.mockClear();
    mockHtml5QrcodeStop.mockClear();
    mockHtml5QrcodeClear.mockClear();

    const { unmount: unmountSchedule } = render(
      <LanguageProvider>
        <AuthProvider>
          <ScheduleTab />
        </AuthProvider>
      </LanguageProvider>
    );

    const openQrBtn = await screen.findByRole('button', { name: /Scan QR Presensi/i });
    fireEvent.click(openQrBtn);

    const switchToCamBtn = await screen.findByRole('button', { name: /Scan QR Kamera/i });
    fireEvent.click(switchToCamBtn);

    await waitFor(() => {
      expect(mockHtml5QrcodeStart).toHaveBeenCalledTimes(1);
    });

    // Closing attendance modal before scan MUST stop and clear active camera scanner
    fireEvent.click(screen.getByRole('button', { name: /^Batal$/i }));
    await waitFor(() => {
      expect(mockHtml5QrcodeStop).toHaveBeenCalled();
      expect(mockHtml5QrcodeClear).toHaveBeenCalled();
    });
    unmountSchedule();
  });
});
