import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { WifiOff } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/useLanguage';
import { useAuth } from './context/useAuth';
import { ROLES } from './constants/roles';
import {
  fetchClassesForUser,
  fetchJoinedMemberships,
  normalizeClassDoc,
} from './services/lmsFirestoreService';
import { setLocalExamSession } from './services/aiService';
import { clearDemoAttendanceStore } from './services/attendanceService';

// Common & Public UI Components
import ErrorBoundary from './components/common/ErrorBoundary';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import Topbar from './components/common/Topbar';
import MobileHeader from './components/common/MobileHeader';
import BottomNav from './components/common/BottomNav';
import FloatingActionButton from './components/common/FloatingActionButton';
import AuthModal from './components/common/AuthModal';
import BrandLogo from './components/common/BrandLogo';
import MfaChallengeScreen from './components/common/MfaChallengeScreen';
import { AccessibleDialog } from './components/common/AccessibleDialog';

// Lightweight Public & LMS Views
import LandingPage from './components/public/LandingPage';
import ScheduleTab from './components/features/ScheduleTab';
import MaterialsTab from './components/features/MaterialsTab';
import DiscussionTab from './components/features/DiscussionTab';

// Lazy-loaded Heavy Feature & Portal Views (Code-Splitting)
const PublicCatalog = lazy(() => import('./components/public/PublicCatalog'));
const AboutPage = lazy(() => import('./components/public/AboutPage'));
const StudentDashboard = lazy(() => import('./components/dashboard/StudentDashboard'));
const TeacherDashboard = lazy(() => import('./components/dashboard/TeacherDashboard'));
const AdminDashboard = lazy(() => import('./components/dashboard/AdminDashboard'));
const ProfileView = lazy(() => import('./components/features/ProfileView'));
const ClassDetailView = lazy(() => import('./components/features/ClassDetailView'));
const AIAssistantView = lazy(() => import('./components/features/AIAssistantView'));
const ClassesView = lazy(() => import('./components/features/ClassesView'));
const ManualBookView = lazy(() => import('./components/features/ManualBookView'));

function ViewFallback() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
      <span className="text-xs font-mono tracking-wider text-slate-500 dark:text-slate-400">
        MEMUAT MODUL HALAMAN...
      </span>
    </div>
  );
}

const PUBLIC_VIEWS = ['landing', 'catalog', 'about'];
const LMS_VIEWS = [
  'dashboard',
  'classes-all',
  'kelas',
  'materi',
  'diskusi',
  'manual-book',
  'detail',
  'ai',
  'profil',
];
const ALL_VIEWS = [...PUBLIC_VIEWS, ...LMS_VIEWS];

function parseViewFromHash() {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return ALL_VIEWS.includes(raw) ? raw : null;
}

function MainApp() {
  const { role, currentUser, loading: authLoading, mfaRequired } = useAuth();
  const { t, language } = useLanguage();

  const [explicitView, setExplicitView] = useState(() => parseViewFromHash());
  const rawRequestedView = explicitView;
  const activeView = !currentUser
    ? rawRequestedView && PUBLIC_VIEWS.includes(rawRequestedView)
      ? rawRequestedView
      : 'landing'
    : rawRequestedView || 'dashboard';
  const isPublicView = PUBLIC_VIEWS.includes(activeView);

  const [classes, setClasses] = useState([]);
  const [joinedClassIds, setJoinedClassIds] = useState(() => new Set());
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [detailInitialTarget, setDetailInitialTarget] = useState(null);
  const [detailReturnView, setDetailReturnView] = useState('materi');
  const [requestedClassModal, setRequestedClassModal] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Exam Lockout Navigation Guard
  const [isExamActive, setIsExamActive] = useState(false);
  const [pendingNavView, setPendingNavView] = useState(null);

  // Real-time Offline / Online Status Detection
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync dynamic document.title based on active view & role
  useEffect(() => {
    const viewTitles = {
      landing: language === 'en' ? 'Home' : 'Beranda',
      catalog: language === 'en' ? 'Course Catalog' : 'Katalog Kelas',
      about: language === 'en' ? 'About Smartsa' : 'Tentang Smartsa',
      dashboard:
        role === ROLES.ADMIN
          ? 'Admin Console'
          : role === ROLES.LECTURER
            ? language === 'en'
              ? 'Educator Hub'
              : 'Hub Pengajar'
            : 'Dashboard',
      'classes-all': language === 'en' ? 'All Classes' : 'Semua Kelas',
      kelas: language === 'en' ? 'Schedule & Attendance' : 'Jadwal & Presensi',
      materi: language === 'en' ? 'Materials & Tasks' : 'Materi & Tugas',
      diskusi: language === 'en' ? 'Discussion Forum' : 'Forum Diskusi',
      detail: selectedSubject?.name || selectedSubject?.title || (language === 'en' ? 'Class Detail' : 'Detail Kelas'),
      'manual-book': language === 'en' ? 'Manual Book & Guide' : 'Manual Book & Panduan',
      ai: language === 'en' ? 'Smartsa AI Assistant' : 'Asisten AI Smartsa',
      profil: language === 'en' ? 'Profile & Settings' : 'Profil & Pengaturan',
    };
    const label = viewTitles[activeView] || 'Learning Management System';
    document.title = `${label} | Smartsa LMS`;
  }, [activeView, language, role, selectedSubject?.name, selectedSubject?.title]);

  const activeViewRef = useRef(activeView);
  const isExamActiveRef = useRef(isExamActive);
  const currentUserRef = useRef(currentUser);
  const authLoadingRef = useRef(authLoading);
  const prevUidRef = useRef(undefined);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    isExamActiveRef.current = isExamActive;
  }, [isExamActive]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    authLoadingRef.current = authLoading;
  }, [authLoading]);

  const refreshClassesAndMemberships = useCallback(
    async (uidOverride = currentUser?.uid) => {
      if (!uidOverride || mfaRequired) {
        setClasses([]);
        setJoinedClassIds(new Set());
        setMembershipsLoaded(false);
        setSelectedSubject(null);
        return;
      }
      const [res, memberships] = await Promise.all([
        fetchClassesForUser({ uid: uidOverride, role }),
        fetchJoinedMemberships(uidOverride),
      ]);
      const loaded = res.classes || [];
      setClasses(loaded);
      setJoinedClassIds(new Set(memberships.map((m) => m.classId)));
      setMembershipsLoaded(true);
      setSelectedSubject((prev) => {
        if (prev && loaded.some((c) => c.id === prev.id)) {
          return loaded.find((c) => c.id === prev.id) || null;
        }
        return loaded[0] || null;
      });
    },
    [currentUser?.uid, role, mfaRequired]
  );

  // Load classes and memberships isolated by active user & role
  useEffect(() => {
    let mounted = true;
    const loadClasses = async () => {
      if (!currentUser?.uid || mfaRequired) {
        setClasses([]);
        setJoinedClassIds(new Set());
        setMembershipsLoaded(false);
        setSelectedSubject(null);
        return;
      }
      const [res, memberships] = await Promise.all([
        fetchClassesForUser({ uid: currentUser.uid, role }),
        fetchJoinedMemberships(currentUser.uid),
      ]);
      if (!mounted) return;
      const loaded = res.classes || [];
      setClasses(loaded);
      setJoinedClassIds(new Set(memberships.map((m) => m.classId)));
      setMembershipsLoaded(true);
      setSelectedSubject((prev) => {
        if (prev && loaded.some((c) => c.id === prev.id)) {
          return loaded.find((c) => c.id === prev.id) || null;
        }
        return loaded[0] || null;
      });
    };
    void loadClasses();
    return () => {
      mounted = false;
    };
  }, [currentUser?.uid, role, mfaRequired]);

  const commitNavigation = useCallback((nextView, { replace = false } = {}) => {
    if (!ALL_VIEWS.includes(nextView)) return;
    if (activeViewRef.current !== 'detail' && nextView === 'detail') {
      setDetailReturnView(activeViewRef.current);
    }
    setExplicitView(nextView);

    const targetHash = `#${nextView}`;
    if (typeof window !== 'undefined' && window.location.hash !== targetHash) {
      if (replace) {
        window.history.replaceState({ view: nextView }, '', targetHash);
      } else {
        window.history.pushState({ view: nextView }, '', targetHash);
      }
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const navigateTo = useCallback(
    (nextView, { replace = false, skipGuard = false } = {}) => {
      if (!ALL_VIEWS.includes(nextView)) return;

      // Strict Auth Guard: block all LMS_VIEWS when unauthenticated
      if (!currentUserRef.current && LMS_VIEWS.includes(nextView)) {
        if (!PUBLIC_VIEWS.includes(activeViewRef.current)) {
          commitNavigation('landing', { replace: true });
        }
        setAuthModalOpen(true);
        return;
      }

      if (nextView === activeViewRef.current) return;

      if (!skipGuard && isExamActiveRef.current && activeViewRef.current === 'detail') {
        setPendingNavView(nextView);
        return;
      }

      commitNavigation(nextView, { replace });
    },
    [commitNavigation]
  );

  // Sync auth state transitions (wait while loading, enforce Strict Auth Guard once resolved)
  useEffect(() => {
    if (authLoading) return;
    const currentUid = currentUser?.uid || null;
    const requestedView = explicitView;

    if (prevUidRef.current === undefined) {
      prevUidRef.current = currentUid;
      if (!currentUid && requestedView && LMS_VIEWS.includes(requestedView)) {
        if (typeof window !== 'undefined') {
          window.history.replaceState({ view: 'landing' }, '', '#landing');
        }
        Promise.resolve().then(() => {
          setExplicitView('landing');
          setAuthModalOpen(true);
        });
        return;
      }
      const initialView = requestedView || (currentUid ? 'dashboard' : 'landing');
      if (typeof window !== 'undefined') {
        window.history.replaceState({ view: initialView }, '', `#${initialView}`);
      }
      return;
    }

    if (prevUidRef.current !== currentUid) {
      const hadPreviousUser = prevUidRef.current !== null;
      prevUidRef.current = currentUid;
      setLocalExamSession({ active: false });
      clearDemoAttendanceStore();

      Promise.resolve().then(() => {
        setIsExamActive(false);
        setPendingNavView(null);
        setRequestedClassModal(null);

        if (currentUid !== null) {
          setAuthModalOpen(false);
          if (hadPreviousUser) {
            setClasses([]);
            setJoinedClassIds(new Set());
            setMembershipsLoaded(false);
            setSelectedSubject(null);
          }
          if (PUBLIC_VIEWS.includes(activeViewRef.current)) {
            commitNavigation('dashboard', { replace: true });
          }
        } else {
          setClasses([]);
          setJoinedClassIds(new Set());
          setMembershipsLoaded(false);
          setSelectedSubject(null);
          if (!PUBLIC_VIEWS.includes(activeViewRef.current) || (requestedView && LMS_VIEWS.includes(requestedView))) {
            commitNavigation('landing', { replace: true });
          }
        }
      });
      return;
    }

    if (!currentUid && requestedView && LMS_VIEWS.includes(requestedView)) {
      if (typeof window !== 'undefined') {
        window.history.replaceState({ view: 'landing' }, '', '#landing');
      }
      Promise.resolve().then(() => {
        setExplicitView('landing');
        setAuthModalOpen(true);
      });
    }
  }, [authLoading, currentUser?.uid, explicitView, commitNavigation]);

  // Browser back/forward & manual hash listener with Strict Auth Guard & active exam guard
  useEffect(() => {
    const handlePopState = () => {
      if (authLoadingRef.current) return;
      const targetView =
        parseViewFromHash() || (currentUserRef.current ? 'dashboard' : 'landing');

      if (!currentUserRef.current && LMS_VIEWS.includes(targetView)) {
        window.history.replaceState({ view: 'landing' }, '', '#landing');
        setExplicitView('landing');
        setAuthModalOpen(true);
        return;
      }

      if (
        isExamActiveRef.current &&
        activeViewRef.current === 'detail' &&
        targetView !== 'detail'
      ) {
        window.history.pushState({ view: 'detail' }, '', '#detail');
        setPendingNavView(targetView);
        return;
      }

      if (activeViewRef.current !== 'detail' && targetView === 'detail') {
        setDetailReturnView(activeViewRef.current);
      }
      setExplicitView(targetView);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // Warn before closing/reloading browser tab during an active exam
  useEffect(() => {
    if (!isExamActive) return undefined;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isExamActive]);

  const handleConfirmLeaveExam = () => {
    const target = pendingNavView || detailReturnView || 'materi';
    setPendingNavView(null);
    setIsExamActive(false);
    setLocalExamSession({ active: false });
    commitNavigation(target);
  };

  const handleSelectSubject = (subj) => {
    if (!currentUserRef.current) {
      setAuthModalOpen(true);
      return;
    }
    if (!subj?.id) return;
    const normalized = normalizeClassDoc(subj.id, subj);
    setDetailInitialTarget(null);
    setSelectedSubject(normalized);
    setClasses((prev) =>
      prev.some((c) => c.id === normalized.id)
        ? prev.map((c) => (c.id === normalized.id ? normalized : c))
        : [normalized, ...prev]
    );
    navigateTo('detail');
  };

  const handleSelectActivity = (activity) => {
    if (!currentUserRef.current) {
      setAuthModalOpen(true);
      return;
    }
    const targetClassId =
      typeof activity === 'object' && activity !== null ? activity.classId || '' : '';
    const targetMeetingNo =
      typeof activity === 'object' && activity !== null && activity.meetingNo
        ? Number(activity.meetingNo)
        : null;
    const targetExamType =
      typeof activity === 'object' && activity !== null
        ? activity.examType || null
        : typeof activity === 'string'
          ? activity
          : null;

    const matchedClass = targetClassId
      ? classes.find((c) => c.id === targetClassId) || null
      : null;

    if (matchedClass) {
      setSelectedSubject(matchedClass);
    } else if (!selectedSubject && classes.length > 0) {
      setSelectedSubject(classes[0]);
    }

    setDetailInitialTarget(
      targetClassId || targetMeetingNo || targetExamType
        ? {
            classId: matchedClass?.id || targetClassId || '',
            meetingNo: targetMeetingNo,
            tab: targetExamType ? 'exam' : null,
          }
        : null
    );
    navigateTo('detail');
  };

  const handleQuickAction = () => {
    if (!currentUserRef.current) {
      setAuthModalOpen(true);
      return;
    }
    if (role === ROLES.ADMIN) {
      navigateTo('dashboard');
      return;
    }
    setRequestedClassModal(role === ROLES.STUDENT ? 'join' : 'create');
    navigateTo('classes-all');
  };

  const handleMembershipChanged = useCallback((classId, updatedClass = null) => {
    if (classId) {
      setJoinedClassIds((prev) => new Set([...prev, classId]));
    }
    if (updatedClass) {
      const normalized = normalizeClassDoc(updatedClass.id || classId, updatedClass);
      setClasses((prev) =>
        prev.some((c) => c.id === normalized.id)
          ? prev.map((c) => (c.id === normalized.id ? normalized : c))
          : [normalized, ...prev]
      );
      setSelectedSubject((prev) => (prev?.id === normalized.id ? normalized : prev));
    }
  }, []);

  const handleClassUpdated = useCallback((updatedClass) => {
    if (!updatedClass?.id) return;
    const normalized = normalizeClassDoc(updatedClass.id, updatedClass);
    setClasses((prev) =>
      prev.some((c) => c.id === normalized.id)
        ? prev.map((c) => (c.id === normalized.id ? normalized : c))
        : [normalized, ...prev]
    );
    setSelectedSubject((prev) => (prev?.id === normalized.id ? normalized : prev));
  }, []);

  const handleOpenCreateClass = () => {
    if (!currentUserRef.current) {
      setAuthModalOpen(true);
      return;
    }
    setRequestedClassModal('create');
    navigateTo('classes-all');
  };

  const renderLMSContent = () => {
    if (activeView === 'detail') {
      const activeClass =
        (selectedSubject?.id
          ? classes.find((c) => c.id === selectedSubject.id) || selectedSubject
          : classes[0]) || null;

      if (!activeClass) {
        return (
          <div className="bg-white dark:bg-[#121822] p-8 rounded-2xl border border-dashed border-slate-300 dark:border-[#232f42] text-center space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {language === 'en' ? 'No Class Selected Yet' : 'Belum Ada Kelas Dipilih'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {language === 'en'
                ? 'Select a class from your directory or create/join a class to open its learning modules.'
                : 'Pilih kelas dari direktori atau buat/gabung kelas terlebih dahulu untuk membuka detail pembelajaran.'}
            </p>
            <button
              type="button"
              onClick={() => navigateTo('classes-all')}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-lg transition"
            >
              {language === 'en' ? 'Go to Classes Directory' : 'Buka Daftar Kelas'}
            </button>
          </div>
        );
      }

      const matchesInitialTarget =
        detailInitialTarget &&
        (!detailInitialTarget.classId || detailInitialTarget.classId === activeClass.id);

      return (
        <ClassDetailView
          key={activeClass.id}
          classData={activeClass}
          initialMeetingNo={matchesInitialTarget ? detailInitialTarget.meetingNo : null}
          initialTab={matchesInitialTarget ? detailInitialTarget.tab : null}
          isMember={!currentUser || !membershipsLoaded ? undefined : joinedClassIds.has(activeClass.id)}
          onMembershipChanged={handleMembershipChanged}
          onClassUpdated={handleClassUpdated}
          onBack={() => navigateTo(detailReturnView || 'materi')}
          onNavigateAI={() => navigateTo('ai')}
          onExamStateChange={setIsExamActive}
        />
      );
    }

    if (activeView === 'manual-book') {
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:text-amber-500 dark:hover:text-[#fbbf24] flex items-center gap-1.5 mb-2 transition"
          >
            {t('back_to_hub')}
          </button>
          <ManualBookView />
        </div>
      );
    }

    if (activeView === 'ai') {
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:text-amber-500 dark:hover:text-[#fbbf24] flex items-center gap-1.5 mb-2 transition"
          >
            {t('back_to_hub')}
          </button>
          <AIAssistantView />
        </div>
      );
    }

    if (activeView === 'classes-all') {
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="text-xs font-mono font-bold text-amber-600 dark:text-[#f59e0b] hover:text-amber-500 dark:hover:text-[#fbbf24] flex items-center gap-1.5 mb-2 transition"
          >
            {t('back_to_hub')}
          </button>
          <ClassesView
            onSelectClass={handleSelectSubject}
            requestedModal={requestedClassModal}
            onClearRequestedModal={() => setRequestedClassModal(null)}
            onMembershipChanged={handleMembershipChanged}
            onClassCreated={handleClassUpdated}
          />
        </div>
      );
    }

    switch (activeView) {
      case 'kelas':
        return <ScheduleTab />;
      case 'materi':
        return <MaterialsTab onSelectSubject={handleSelectSubject} />;
      case 'diskusi':
        return <DiscussionTab />;
      case 'profil':
        return (
          <ProfileView
            onOpenAuth={() => setAuthModalOpen(true)}
            onNavigateManualBook={() => navigateTo('manual-book')}
          />
        );
      case 'dashboard':
      default:
        if (role === ROLES.ADMIN) {
          return <AdminDashboard onClassesChanged={() => void refreshClassesAndMemberships()} />;
        }
        if (role === ROLES.LECTURER) {
          return (
            <TeacherDashboard
              onSelectClass={handleSelectSubject}
              onNavigateView={(view) =>
                navigateTo(view === 'ai-assistant' ? 'ai' : 'classes-all')
              }
              onOpenCreateClass={handleOpenCreateClass}
            />
          );
        }
        return (
          <StudentDashboard
            onNavigateTab={(tab) => navigateTo(tab)}
            onSelectActivity={handleSelectActivity}
          />
        );
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full border-3 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-xs font-mono tracking-wider text-slate-500 dark:text-slate-400">
            SMARTSA LMS // INITIALIZING...
          </span>
        </div>
      </div>
    );
  }

  const isMfaLocked = Boolean(currentUser && mfaRequired && LMS_VIEWS.includes(activeView));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-[#f59e0b] selection:text-black transition-colors">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 w-full bg-amber-500 text-black px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {language === 'en'
              ? 'You are currently offline. Viewing cached Firestore data — changes will sync automatically when online.'
              : 'Anda sedang offline. Menampilkan data cache Firestore — perubahan akan tersinkron otomatis saat kembali terhubung.'}
          </span>
        </div>
      )}

      {isPublicView || !currentUser ? (
        <div className="min-h-screen flex flex-col">
          <Navbar
            activeTab={activeView}
            setActiveTab={(tab) => navigateTo(tab)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />

          <main className="flex-1">
            <Suspense fallback={<ViewFallback />}>
              {activeView === 'catalog' ? (
                <PublicCatalog
                  onSelectClass={handleSelectSubject}
                  onOpenAuth={() => setAuthModalOpen(true)}
                />
              ) : activeView === 'about' ? (
                <AboutPage
                  onGoToDashboard={() => navigateTo('dashboard')}
                  onOpenAuth={() => setAuthModalOpen(true)}
                />
              ) : (
                <LandingPage
                  onGoToDashboard={() => navigateTo('dashboard')}
                  onGoToCatalog={() => navigateTo('catalog')}
                  onOpenAuth={() => setAuthModalOpen(true)}
                  onSelectClass={handleSelectSubject}
                />
              )}
            </Suspense>
          </main>

          <footer className="border-t border-slate-200 dark:border-[#232b38] bg-white dark:bg-[#12161f] py-6 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BrandLogo size="xs" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Smartsa LMS — Learning Management System
                </span>
              </div>
              <span>
                {language === 'en'
                  ? 'Scaffolded Learning, Exam-Safe AI & Cloud Firestore'
                  : 'Pembelajaran Bertingkat, AI Aman Ujian & Cloud Firestore'}
              </span>
            </div>
          </footer>
        </div>
      ) : isMfaLocked ? (
        <MfaChallengeScreen />
      ) : (
        <div className="min-h-screen flex">
          {/* Desktop Sidebar */}
          <Sidebar
            currentView={activeView}
            setCurrentView={(view) => navigateTo(view)}
          />

          {/* Main Column */}
          <div className="flex-1 flex flex-col min-w-0 min-h-screen">
            <Topbar
              currentView={activeView}
              onQuickAction={handleQuickAction}
              onOpenAuth={() => setAuthModalOpen(true)}
            />

            <MobileHeader />

            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 md:pb-10">
              <Suspense fallback={<ViewFallback />}>
                {renderLMSContent()}
              </Suspense>
            </main>

            <FloatingActionButton
              onOpenAI={() => navigateTo('ai')}
              onOpenJoinModal={handleQuickAction}
            />

            <BottomNav
              activeTab={activeView}
              setActiveTab={(tab) => navigateTo(tab)}
            />
          </div>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <AccessibleDialog
        isOpen={Boolean(pendingNavView)}
        variant="danger"
        title={t('exam_guard_title')}
        message={t('exam_guard_msg')}
        confirmLabel={t('exam_guard_leave')}
        cancelLabel={t('exam_guard_stay')}
        onConfirm={handleConfirmLeaveExam}
        onClose={() => setPendingNavView(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <MainApp />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
