import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const { mockAuthObj, mockDbObj, mockOnAuthStateChanged, mockGetDoc, mockSetDoc, mockUpdateProfile } =
  vi.hoisted(() => ({
    mockAuthObj: { currentUser: null },
    mockDbObj: { name: 'mock-db' },
    mockOnAuthStateChanged: vi.fn(),
    mockGetDoc: vi.fn(),
    mockSetDoc: vi.fn(),
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
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
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
});
