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
} = vi.hoisted(() => ({
  mockAuthObj: { currentUser: null },
  mockDbObj: { name: 'mock-db' },
  mockOnAuthStateChanged: vi.fn(),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockOnSnapshot: vi.fn(() => () => {}),
  mockUpdateProfile: vi.fn(),
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
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: mockOnSnapshot,
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: mockUpdateDoc,
  where: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import DeltaContentRenderer from '../src/components/common/DeltaContentRenderer';
import SafeImage from '../src/components/common/SafeImage';
import { AuthProvider } from '../src/context/AuthContext';
import { LanguageProvider } from '../src/context/LanguageContext';
import { useAuth } from '../src/context/useAuth';
import ClassDetailView from '../src/components/features/ClassDetailView';
import DiscussionTab from '../src/components/features/DiscussionTab';
import { upsertLearningProgress } from '../src/services/lmsFirestoreService';

describe('Frontend Security & UI Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthObj.currentUser = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
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
          <span data-testid="nim">{userProfile.nim}</span>
          <span data-testid="name">{userProfile.displayName}</span>
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
    vi.useFakeTimers();
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    const onExamStateChange = vi.fn();

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'subj_pbo',
              name: 'Pemrograman Berorientasi Objek',
              code: 'PBO101',
              meetings: [],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
            onExamStateChange={onExamStateChange}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // Switch to Exam tab
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));

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

  it('enforces 1 Account = 1 Role, auto-corrects stale admin@smartsa.edu name, and removes DEV role simulation', async () => {
    const adminFirebaseUser = {
      uid: 'uid_admin_smartsa',
      email: 'admin@smartsa.edu',
      displayName: 'Dr. Andi Saputra',
      emailVerified: true,
    };

    mockAuthObj.currentUser = adminFirebaseUser;
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: 'uid_admin_smartsa',
        email: 'admin@smartsa.edu',
        displayName: 'Dr. Andi Saputra',
        role: 'student',
        photoURL: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=120&q=80',
      }),
    });
    mockSetDoc.mockResolvedValue(undefined);
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(adminFirebaseUser);
      return () => {};
    });

    function AdminIdentityInspector() {
      const ctx = useAuth();
      return (
        <div>
          <span data-testid="admin-role">{ctx.role}</span>
          <span data-testid="admin-name">{ctx.userProfile.displayName}</span>
          <span data-testid="admin-nip">{ctx.userProfile.nip}</span>
          <span data-testid="admin-photo">{String(ctx.userProfile.photoURL)}</span>
          <span data-testid="has-sim">{String('simulateDevRole' in ctx)}</span>
        </div>
      );
    }

    render(
      <AuthProvider>
        <AdminIdentityInspector />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('admin-role')).toHaveTextContent('admin');
    });

    expect(screen.getByTestId('admin-name')).toHaveTextContent('Administrator Smartsa');
    expect(screen.getByTestId('admin-nip')).toHaveTextContent('ADM-001');
    expect(screen.getByTestId('admin-photo')).toHaveTextContent('null');
    expect(screen.getByTestId('has-sim')).toHaveTextContent('false');

    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/uid_admin_smartsa' },
      expect.objectContaining({
        role: 'admin',
        displayName: 'Administrator Smartsa',
        nip: 'ADM-001',
        photoURL: null,
      }),
      { merge: true }
    );
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
    mockAuthObj.currentUser = null;
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => {
      void cb(null);
      return () => {};
    });

    render(
      <LanguageProvider>
        <AuthProvider>
          <ClassDetailView
            classData={{
              id: 'subj_pbo',
              name: 'Pemrograman Berorientasi Objek',
              code: 'PBO101',
              meetings: [],
            }}
            onBack={vi.fn()}
            onNavigateAI={vi.fn()}
          />
        </AuthProvider>
      </LanguageProvider>
    );

    // 1. Go to Exam tab: Posttest is locked initially
    fireEvent.click(screen.getByRole('button', { name: /PRETEST & EVALUASI/i }));
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

    // Complete Posttest and verify Gain Card displays delta
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
});
