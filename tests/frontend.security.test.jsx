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
  updateDoc: mockUpdateDoc,
  where: mockWhere,
  documentId: mockDocumentId,
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import DeltaContentRenderer from '../src/components/common/DeltaContentRenderer';
import App from '../src/App';
import SafeImage from '../src/components/common/SafeImage';
import Navbar from '../src/components/common/Navbar';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import { useAuth } from '../src/context/useAuth';
import ClassDetailView from '../src/components/features/ClassDetailView';
import DiscussionTab from '../src/components/features/DiscussionTab';
import MaterialsTab from '../src/components/features/MaterialsTab';
import ProfileView from '../src/components/features/ProfileView';
import LandingPage from '../src/components/public/LandingPage';
import PublicCatalog from '../src/components/public/PublicCatalog';
import AdminDashboard from '../src/components/dashboard/AdminDashboard';
import StudentDashboard from '../src/components/dashboard/StudentDashboard';
import {
  createClassInFirestore,
  fetchAssignmentsWithUserSubmissions,
  fetchClasses,
  fetchClassesForUser,
  fetchLearningProgressByClass,
  fetchPublicClasses,
  fetchSubmissionsForLecturerClasses,
  fetchUserClassExamAttempts,
  normalizeClassDoc,
  upsertLearningProgress,
} from '../src/services/lmsFirestoreService';
import {
  clearDemoAttendanceStore,
  getSemesterAttendanceSummary,
  recordMeetingAttendance,
} from '../src/services/attendanceService';
import { uploadMediaFile } from '../src/services/cloudinaryService';
import { getActiveExamStatus, setLocalExamSession } from '../src/services/aiService';

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
    fireEvent.click(screen.getByRole('button', { name: /DELTA JSON/i }));
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

    // 1. Reading tab: no DEFAULT_SAMPLE_DELTA ("Clean Architecture"), clean empty state
    fireEvent.click(screen.getByRole('button', { name: /DELTA JSON/i }));
    expect(screen.getByText(/Belum ada materi bacaan untuk pertemuan ini/i)).toBeInTheDocument();
    expect(screen.queryByText(/Clean Architecture/i)).toBeNull();

    // 2. Video tab: no ForBiggerBlazes.mp4 fallback
    fireEvent.click(screen.getByRole('button', { name: /VIDEO CDN/i }));
    expect(
      screen.getByText(/Belum Ada Video Pembelajaran untuk Pertemuan Ini/i)
    ).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('ForBiggerBlazes');

    // 3. Manual Book PDF tab: no synthetic Buku_Panduan_Praktikum_*.txt
    fireEvent.click(screen.getByRole('button', { name: /MANUAL BOOK/i }));
    expect(screen.getByText(/Belum Ada Dokumen PDF untuk Pertemuan Ini/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('Buku_Panduan_Praktikum');

    // 4. Exam tab: unconfigured exams disabled & no hardcoded EXAM_QUESTIONS
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Evaluasi untuk pertemuan ini belum dibuat oleh dosen/i)
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /PRETEST BELUM TERSEDIA/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /POST-TEST BELUM TERSEDIA/i })).toBeDisabled();
  });

  it('allows lecturer to manage per-meeting reading material, video/PDF URLs safely, and syncs hasVideo/hasPdf/materialsCount', async () => {
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
              pdfUrl: '',
              meetings: [
                {
                  id: 'cls_crud_mat_m1',
                  order: 1,
                  title: 'Divide and Conquer',
                  date: 'Rabu, 08.00',
                  status: 'open',
                  hasVideo: false,
                  hasPdf: false,
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

    // 1. Save reading material (Delta JSON) -> materialsCount: 1
    fireEvent.click(screen.getByRole('button', { name: /DELTA JSON/i }));
    const matTextarea = screen.getByLabelText(/Teks materi pertemuan/i);
    fireEvent.change(matTextarea, {
      target: { value: '# Pengantar\nMembagi masalah besar menjadi sub-masalah.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan Materi/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 1,
        meetings: [
          expect.objectContaining({
            id: 'cls_crud_mat_m1',
            deltaContent: expect.objectContaining({ ops: expect.any(Array) }),
          }),
        ],
      })
    );

    // 2. Reject javascript: video URL, then accept valid https://youtu.be URL -> hasVideo: true
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

    // 3. Reject invalid javascript: PDF URL, then save valid https:// PDF URL -> hasPdf: true, materialsCount: 3
    fireEvent.click(screen.getByRole('button', { name: /MANUAL BOOK/i }));
    const pdfInput = screen.getByLabelText(/URL PDF pertemuan/i);
    const callsBeforeInvalidPdf = mockUpdateDoc.mock.calls.length;
    fireEvent.change(pdfInput, { target: { value: 'javascript:alert(2)' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan PDF/i }));
    });
    expect(screen.getByText(/URL PDF tidak valid/i)).toBeInTheDocument();
    expect(mockUpdateDoc.mock.calls.length).toBe(callsBeforeInvalidPdf);

    fireEvent.change(pdfInput, { target: { value: 'https://example.com/modul-algoritma.pdf' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Simpan PDF/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 3,
        meetings: [
          expect.objectContaining({
            id: 'cls_crud_mat_m1',
            pdfUrl: 'https://example.com/modul-algoritma.pdf',
            hasPdf: true,
          }),
        ],
      })
    );

    // 4. Delete Video -> hasVideo: false, materialsCount: 2
    fireEvent.click(screen.getByRole('button', { name: /VIDEO CDN/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Hapus Video/i }));
    });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith(
      { path: 'classes/cls_crud_mat' },
      expect.objectContaining({
        materialsCount: 2,
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
        materialsCount: 2,
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
});
