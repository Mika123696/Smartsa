import { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { useAuth } from './context/useAuth';
import { ROLES } from './constants/roles';
import { DEMO_CLASSES, DEMO_SUBJECTS } from './services/mockData';

// Common Mobile-Native UI Components matching screenshots
import MobileHeader from './components/common/MobileHeader';
import BottomNav from './components/common/BottomNav';
import FloatingActionButton from './components/common/FloatingActionButton';
import AuthModal from './components/common/AuthModal';

// Views
import StudentDashboard from './components/dashboard/StudentDashboard';
import TeacherDashboard from './components/dashboard/TeacherDashboard';
import DosenCourseDetailPage from './components/dosen/DosenCourseDetailPage';
import DosenKelasPage from './components/dosen/DosenKelasPage';
import ScheduleTab from './components/features/ScheduleTab';
import MaterialsTab from './components/features/MaterialsTab';
import DiscussionTab from './components/features/DiscussionTab';
import ProfileView from './components/features/ProfileView';
import ClassDetailView from './components/features/ClassDetailView';
import AIAssistantView from './components/features/AIAssistantView';
import ClassesView from './components/features/ClassesView';

const DOSEN_COURSE_ROUTE_PREFIX = '/dosen/mata-kuliah/';

function resolveInitialCourseFromUrl() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname || '';
  if (!path.startsWith(DOSEN_COURSE_ROUTE_PREFIX)) return null;
  const matkulId = decodeURIComponent(path.slice(DOSEN_COURSE_ROUTE_PREFIX.length).replace(/\/+$/, ''));
  if (!matkulId) return null;
  return (
    DEMO_CLASSES.find((c) => c.id === matkulId) ||
    DEMO_SUBJECTS.find((s) => s.id === matkulId) ||
    null
  );
}

function MainApp() {
  const { role } = useAuth();
  const { t } = useLanguage();

  const initialUrlCourse = resolveInitialCourseFromUrl();

  // Navigation State: 'dashboard' | 'kelas' | 'materi' | 'diskusi' | 'profil' | 'detail' | 'ai' | 'classes-all'
  const [activeTab, setActiveTab] = useState(initialUrlCourse ? 'detail' : 'dashboard');
  const [selectedSubject, setSelectedSubject] = useState(initialUrlCourse || DEMO_SUBJECTS[0]);
  const [kelasTarget, setKelasTarget] = useState({
    matkulId: DEMO_CLASSES[0]?.id || 'subj_pbo',
    pertemuan: 1,
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Sinkronisasi history browser untuk rute /dosen/mata-kuliah/:matkulId
  useEffect(() => {
    const handlePopState = () => {
      const course = resolveInitialCourseFromUrl();
      if (course) {
        setSelectedSubject(course);
        setActiveTab('detail');
      } else {
        setActiveTab((prev) => (prev === 'detail' ? 'dashboard' : prev));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const syncBaseUrlIfNeeded = useCallback(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith(DOSEN_COURSE_ROUTE_PREFIX)) {
      window.history.pushState({ tab: 'dashboard' }, '', '/');
    }
  }, []);

  const handleSetActiveTab = (tab) => {
    if (tab !== 'detail') {
      syncBaseUrlIfNeeded();
    }
    setActiveTab(tab);
  };

  // Navigasi saat memilih mata kuliah dari Dashboard Dosen / Tab Materi / Semua Kelas
  const handleSelectSubject = (subj) => {
    if (!subj) return;
    setSelectedSubject(subj);
    setActiveTab('detail');
    if (role === ROLES.LECTURER && typeof window !== 'undefined') {
      const targetPath = `${DOSEN_COURSE_ROUTE_PREFIX}${encodeURIComponent(subj.id)}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab: 'detail', matkulId: subj.id }, '', targetPath);
      }
    }
  };

  const handleBackFromDetail = (fallbackTab = 'dashboard') => {
    syncBaseUrlIfNeeded();
    setActiveTab(fallbackTab);
  };

  // Navigasi dari kartu di Dashboard Mahasiswa (Pretest, Video, Posttest, Manual Book)
  const handleSelectActivity = () => {
    setActiveTab('detail');
  };

  // Render Konten Utama Berdasarkan Tab yang Aktif
  const renderContent = () => {
    // Jika sedang membuka halaman detail mata kuliah
    if (activeTab === 'detail') {
      const activeClass =
        DEMO_CLASSES.find((c) => c.id === selectedSubject?.id) ||
        DEMO_CLASSES[0];

      if (role === ROLES.LECTURER) {
        return (
          <DosenCourseDetailPage
            key={activeClass.id}
            matkul={activeClass}
            onBack={() => handleBackFromDetail('dashboard')}
            onNavigateAI={() => handleSetActiveTab('ai')}
            onNavigateKelas={(matkulId, pertemuan) => {
              setKelasTarget({ matkulId, pertemuan });
              handleSetActiveTab('kelas');
            }}
          />
        );
      }

      return (
        <ClassDetailView
          classData={activeClass}
          onBack={() => handleBackFromDetail('materi')}
          onNavigateAI={() => handleSetActiveTab('ai')}
        />
      );
    }

    // Jika sedang membuka layar AI Assistant
    if (activeTab === 'ai') {
      return (
        <div className="space-y-3 font-mono">
          <button
            onClick={() => handleSetActiveTab('dashboard')}
            className="text-xs font-bold text-[#f59e0b] hover:text-[#fbbf24] flex items-center gap-1.5 mb-2 transition"
          >
            {t('back_to_hub')}
          </button>
          <AIAssistantView />
        </div>
      );
    }

    // Jika membuka semua daftar kelas (untuk join/create)
    if (activeTab === 'classes-all') {
      return (
        <div className="space-y-3 font-mono">
          <button
            onClick={() => handleSetActiveTab('dashboard')}
            className="text-xs font-bold text-[#f59e0b] hover:text-[#fbbf24] flex items-center gap-1.5 mb-2 transition"
          >
            {t('back_to_hub')}
          </button>
          <ClassesView onSelectClass={handleSelectSubject} />
        </div>
      );
    }

    // Tab Bar 5 Menu Utama
    switch (activeTab) {
      case 'kelas':
        if (role === ROLES.LECTURER) {
          return (
            <DosenKelasPage
              key={`${kelasTarget.matkulId}_${kelasTarget.pertemuan}`}
              initialMatkulId={kelasTarget.matkulId}
              initialPertemuan={kelasTarget.pertemuan}
              onOpenCourseMateri={handleSelectSubject}
            />
          );
        }
        return <ScheduleTab />;
      case 'materi':
        return <MaterialsTab onSelectSubject={handleSelectSubject} />;
      case 'diskusi':
        return <DiscussionTab />;
      case 'profil':
        return <ProfileView onOpenAuth={() => setAuthModalOpen(true)} />;
      case 'dashboard':
      default:
        // Jika role Dosen
        if (role === ROLES.LECTURER) {
          return (
            <TeacherDashboard
              onSelectClass={handleSelectSubject}
              onNavigateView={(view) => handleSetActiveTab(view === 'ai-assistant' ? 'ai' : 'classes-all')}
              onOpenCreateClass={() => handleSetActiveTab('classes-all')}
            />
          );
        }
        // Default Mahasiswa
        return (
          <StudentDashboard
            onNavigateTab={(tab) => handleSetActiveTab(tab)}
            onSelectActivity={handleSelectActivity}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex justify-center font-sans antialiased selection:bg-[#f59e0b] selection:text-black">
      {/* Wrapper frame gawai / mobile layout */}
      <div className="w-full max-w-md bg-[#161c24] min-h-screen flex flex-col relative shadow-2xl border-x border-[#232b38]">
        {/* Top Header dengan Logo Smartsa & Notification Bell */}
        <MobileHeader onOpenAuth={() => setAuthModalOpen(true)} />

        {/* Area Konten Utama */}
        <main className="flex-1 p-4 sm:p-5 pb-36 overflow-y-auto">
          {renderContent()}
        </main>

        {/* Floating Action Button */}
        <FloatingActionButton
          onOpenAI={() => handleSetActiveTab('ai')}
          onOpenJoinModal={() => handleSetActiveTab('classes-all')}
        />

        {/* Bottom Navigation Bar (5 Tabs) */}
        <BottomNav activeTab={activeTab} setActiveTab={handleSetActiveTab} />

        {/* Modal Autentikasi */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
        />
      </div>
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
