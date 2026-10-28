import { useState } from 'react';
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
import AdminDashboard from './components/dashboard/AdminDashboard';
import ScheduleTab from './components/features/ScheduleTab';
import MaterialsTab from './components/features/MaterialsTab';
import DiscussionTab from './components/features/DiscussionTab';
import ProfileView from './components/features/ProfileView';
import ClassDetailView from './components/features/ClassDetailView';
import AIAssistantView from './components/features/AIAssistantView';
import ClassesView from './components/features/ClassesView';

function MainApp() {
  const { role } = useAuth();
  const { t } = useLanguage();

  // Navigation State: 'dashboard' | 'kelas' | 'materi' | 'diskusi' | 'profil' | 'detail' | 'ai' | 'classes-all'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedSubject, setSelectedSubject] = useState(DEMO_SUBJECTS[0]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Navigasi saat memilih mata pelajaran di tab Materi
  const handleSelectSubject = (subj) => {
    setSelectedSubject(subj);
    setActiveTab('detail');
  };

  // Navigasi dari kartu di Dashboard (Pretest, Video, Posttest, Manual Book)
  const handleSelectActivity = () => {
    setActiveTab('detail');
  };

  // Render Konten Utama Berdasarkan Tab yang Aktif
  const renderContent = () => {
    // Jika sedang membuka detail modul mata pelajaran
    if (activeTab === 'detail') {
      const activeClass = DEMO_CLASSES.find((c) => c.id === selectedSubject.id) || DEMO_CLASSES[0];
      return (
        <ClassDetailView
          classData={activeClass}
          onBack={() => setActiveTab('materi')}
          onNavigateAI={() => setActiveTab('ai')}
        />
      );
    }

    // Jika sedang membuka layar AI Assistant
    if (activeTab === 'ai') {
      return (
        <div className="space-y-3 font-mono">
          <button
            onClick={() => setActiveTab('dashboard')}
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
            onClick={() => setActiveTab('dashboard')}
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
        return <ScheduleTab />;
      case 'materi':
        return <MaterialsTab onSelectSubject={handleSelectSubject} />;
      case 'diskusi':
        return <DiscussionTab />;
      case 'profil':
        return <ProfileView onOpenAuth={() => setAuthModalOpen(true)} />;
      case 'dashboard':
      default:
        // Jika role Guru/Dosen
        if (role === ROLES.TEACHER || role === ROLES.LECTURER) {
          return (
            <TeacherDashboard
              onSelectClass={handleSelectSubject}
              onNavigateView={(view) => setActiveTab(view === 'ai-assistant' ? 'ai' : 'classes-all')}
              onOpenCreateClass={() => setActiveTab('classes-all')}
            />
          );
        }
        // Jika role Admin
        if (role === ROLES.ADMIN) {
          return <AdminDashboard />;
        }
        // Default Mahasiswa & Umum (Presisi 100% Sesuai Screenshot Endfield Academy)
        return (
          <StudentDashboard
            onNavigateTab={(tab) => setActiveTab(tab)}
            onSelectActivity={handleSelectActivity}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex justify-center font-sans antialiased selection:bg-[#f59e0b] selection:text-black">
      {/* Wrapper frame gawai / mobile layout persis screenshot */}
      <div className="w-full max-w-md bg-[#161c24] min-h-screen flex flex-col relative shadow-2xl border-x border-[#232b38]">
        {/* Top Header dengan Logo Smartsa & Notification Bell */}
        <MobileHeader onOpenAuth={() => setAuthModalOpen(true)} />

        {/* Area Konten Utama */}
        <main className="flex-1 p-4 sm:p-5 pb-24 overflow-y-auto">
          {renderContent()}
        </main>

        {/* Floating Action Button (Endfield Command Core) */}
        <FloatingActionButton
          onOpenAI={() => setActiveTab('ai')}
          onOpenJoinModal={() => setActiveTab('classes-all')}
        />

        {/* Bottom Navigation Bar (5 Tabs) */}
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

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
    <LanguageProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </LanguageProvider>
  );
}
