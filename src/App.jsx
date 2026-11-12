import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/useLanguage';
import { useAuth } from './context/useAuth';
import { ROLES } from './constants/roles';
import { fetchClasses, normalizeClassDoc } from './services/lmsFirestoreService';

// Common & Public UI Components
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';
import Topbar from './components/common/Topbar';
import MobileHeader from './components/common/MobileHeader';
import BottomNav from './components/common/BottomNav';
import FloatingActionButton from './components/common/FloatingActionButton';
import AuthModal from './components/common/AuthModal';
import { AccessibleDialog } from './components/common/AccessibleDialog';

// Public Portal Views
import LandingPage from './components/public/LandingPage';
import PublicCatalog from './components/public/PublicCatalog';
import AboutPage from './components/public/AboutPage';

// LMS Dashboard & Feature Views
import StudentDashboard from './components/dashboard/StudentDashboard';
import TeacherDashboard from './components/dashboard/TeacherDashboard';
import AdminDashboard from './components/dashboard/AdminDashboard';
import ScheduleTab from './components/features/ScheduleTab';
import MaterialsTab from './components/features/MaterialsTab';
import DiscussionTab from './components/features/DiscussionTab';
import ProfileView from './components/features/ProfileView';
import ClassDetailView from './components/features/ClassDetailView';
import AIAssistantView from './components/features/AIAssistantView';
import ClassesView from './components/features/ClassesView';

const PUBLIC_VIEWS = ['landing', 'catalog', 'about'];
const LMS_VIEWS = [
  'dashboard',
  'classes-all',
  'kelas',
  'materi',
  'diskusi',
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
  const { role, currentUser, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();

  const [explicitView, setExplicitView] = useState(() => parseViewFromHash());
  const activeView = explicitView || (currentUser ? 'dashboard' : 'landing');
  const isPublicView = PUBLIC_VIEWS.includes(activeView);

  const [classes, setClasses] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [detailReturnView, setDetailReturnView] = useState('materi');
  const [requestedClassModal, setRequestedClassModal] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Exam Lockout Navigation Guard
  const [isExamActive, setIsExamActive] = useState(false);
  const [pendingNavView, setPendingNavView] = useState(null);

  const activeViewRef = useRef(activeView);
  const isExamActiveRef = useRef(isExamActive);
  const currentUserRef = useRef(currentUser);
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

  // Load classes for active user / demo session
  useEffect(() => {
    let mounted = true;
    const loadClasses = async () => {
      const res = await fetchClasses();
      if (!mounted) return;
      const loaded = res.classes || [];
      setClasses(loaded);
      setSelectedSubject((prev) => {
        if (prev && loaded.some((c) => c.id === prev.id)) {
          return loaded.find((c) => c.id === prev.id);
        }
        return loaded[0] || prev;
      });
    };
    void loadClasses();
    return () => {
      mounted = false;
    };
  }, [currentUser?.uid]);

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
      if (nextView === activeViewRef.current) return;

      if (!skipGuard && isExamActiveRef.current && activeViewRef.current === 'detail') {
        setPendingNavView(nextView);
        return;
      }

      commitNavigation(nextView, { replace });
    },
    [commitNavigation]
  );

  // Sync auth state transitions (initial mount, sign-in redirect, sign-out reset)
  useEffect(() => {
    if (authLoading) return;
    const currentUid = currentUser?.uid || null;

    if (prevUidRef.current === undefined) {
      prevUidRef.current = currentUid;
      const initialView = explicitView || (currentUid ? 'dashboard' : 'landing');
      if (typeof window !== 'undefined') {
        window.history.replaceState({ view: initialView }, '', `#${initialView}`);
      }
      return;
    }

    if (prevUidRef.current === null && currentUid !== null) {
      prevUidRef.current = currentUid;
      if (PUBLIC_VIEWS.includes(activeViewRef.current)) {
        commitNavigation('dashboard', { replace: true });
      }
      return;
    }

    if (prevUidRef.current !== null && currentUid === null) {
      prevUidRef.current = null;
      setIsExamActive(false);
      setPendingNavView(null);
      if (!PUBLIC_VIEWS.includes(activeViewRef.current)) {
        commitNavigation('landing', { replace: true });
      }
    }
  }, [authLoading, currentUser?.uid, explicitView, commitNavigation]);

  // Browser back/forward popstate listener with active exam guard
  useEffect(() => {
    const handlePopState = () => {
      const targetView =
        parseViewFromHash() || (currentUserRef.current ? 'dashboard' : 'landing');

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
    return () => window.removeEventListener('popstate', handlePopState);
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
    commitNavigation(target);
  };

  const handleSelectSubject = (subj) => {
    if (!subj) return;
    const normalized = normalizeClassDoc(subj.id || 'subj_pbo', subj);
    setSelectedSubject(normalized);
    setClasses((prev) =>
      prev.some((c) => c.id === normalized.id)
        ? prev.map((c) => (c.id === normalized.id ? normalized : c))
        : [normalized, ...prev]
    );
    navigateTo('detail');
  };

  const handleSelectActivity = () => {
    if (!selectedSubject && classes.length > 0) {
      setSelectedSubject(classes[0]);
    }
    navigateTo('detail');
  };

  const handleQuickAction = () => {
    setRequestedClassModal(role === ROLES.STUDENT ? 'join' : 'create');
    navigateTo('classes-all');
  };

  const handleOpenCreateClass = () => {
    setRequestedClassModal('create');
    navigateTo('classes-all');
  };

  const renderLMSContent = () => {
    if (activeView === 'detail') {
      const activeClass =
        classes.find((c) => c.id === selectedSubject?.id) ||
        selectedSubject ||
        classes[0] ||
        normalizeClassDoc('subj_pbo', {});

      return (
        <ClassDetailView
          key={activeClass.id}
          classData={activeClass}
          onBack={() => navigateTo(detailReturnView || 'materi')}
          onNavigateAI={() => navigateTo('ai')}
          onExamStateChange={setIsExamActive}
        />
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
        return <ProfileView onOpenAuth={() => setAuthModalOpen(true)} />;
      case 'dashboard':
      default:
        if (role === ROLES.ADMIN) {
          return <AdminDashboard />;
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-[#f59e0b] selection:text-black transition-colors">
      {isPublicView ? (
        <div className="min-h-screen flex flex-col">
          <Navbar
            activeTab={activeView}
            setActiveTab={(tab) => navigateTo(tab)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />

          <main className="flex-1">
            {activeView === 'catalog' ? (
              <PublicCatalog onSelectClass={handleSelectSubject} />
            ) : activeView === 'about' ? (
              <AboutPage onGoToDashboard={() => navigateTo('dashboard')} />
            ) : (
              <LandingPage
                onGoToDashboard={() => navigateTo('dashboard')}
                onGoToCatalog={() => navigateTo('catalog')}
                onOpenAuth={() => setAuthModalOpen(true)}
                onSelectClass={handleSelectSubject}
              />
            )}
          </main>

          <footer className="border-t border-slate-200 dark:border-[#232b38] bg-white dark:bg-[#12161f] py-6 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Smartsa LMS — Learning Management System
              </span>
              <span>
                {language === 'en'
                  ? 'Scaffolded Learning, Exam-Safe AI & Cloud Firestore'
                  : 'Pembelajaran Bertingkat, AI Aman Ujian & Cloud Firestore'}
              </span>
            </div>
          </footer>
        </div>
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
              {renderLMSContent()}
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
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
