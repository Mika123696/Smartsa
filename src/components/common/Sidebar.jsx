import { useAuth } from '../../context/useAuth';
import { ROLES, ROLE_LABELS, ROLE_BADGE_COLORS } from '../../constants/roles';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Award,
  Bookmark,
  Users,
  Settings,
  ShieldCheck,
  FileText,
  HelpCircle,
  X,
} from 'lucide-react';

export default function Sidebar({ currentView, setCurrentView, mobileOpen, setMobileOpen }) {
  const { role, userProfile } = useAuth();

  // Item navigasi berdasarkan role pengguna
  const getNavItems = () => {
    switch (role) {
      case ROLES.TEACHER:
      case ROLES.LECTURER:
        return [
          { id: 'dashboard', label: 'Dashboard Pengajar', icon: LayoutDashboard },
          { id: 'classes', label: 'Manajemen Kelas', icon: BookOpen, badge: '2' },
          { id: 'materials', label: 'Pertemuan & Materi', icon: FileText },
          { id: 'grades', label: 'Penilaian & Tugas', icon: Award, badge: '7 Baru' },
          { id: 'ai-assistant', label: 'Teaching Assistant AI', icon: Sparkles, highlight: true },
          { id: 'profile', label: 'Profil & Pengaturan', icon: Settings },
        ];
      case ROLES.ADMIN:
        return [
          { id: 'dashboard', label: 'Dashboard Administrasi', icon: LayoutDashboard },
          { id: 'classes', label: 'Manajemen Kelas Global', icon: BookOpen },
          { id: 'users-manage', label: 'Verifikasi Pengguna', icon: Users, badge: '3 Verif' },
          { id: 'audit-logs', label: 'Audit Security Logs', icon: ShieldCheck },
          { id: 'profile', label: 'Pengaturan Sistem', icon: Settings },
        ];
      case ROLES.GENERAL:
        return [
          { id: 'dashboard', label: 'Dashboard Mandiri', icon: LayoutDashboard },
          { id: 'classes', label: 'Kelas Saya', icon: BookOpen },
          { id: 'bookmarks', label: 'Materi Disimpan', icon: Bookmark },
          { id: 'ai-assistant', label: 'Learning Assistant AI', icon: Sparkles, highlight: true },
          { id: 'profile', label: 'Profil Saya', icon: Settings },
        ];
      case ROLES.STUDENT:
      default:
        return [
          { id: 'dashboard', label: 'Dashboard Belajar', icon: LayoutDashboard },
          { id: 'classes', label: 'Kelas Saya', icon: BookOpen, badge: '3' },
          { id: 'grades', label: 'Riwayat Nilai', icon: Award },
          { id: 'ai-assistant', label: 'Learning Assistant AI', icon: Sparkles, highlight: true },
          { id: 'bookmarks', label: 'Bookmark Modul', icon: Bookmark },
          { id: 'profile', label: 'Profil & Keamanan', icon: Settings },
        ];
    }
  };

  const navItems = getNavItems();

  const handleNavClick = (viewId) => {
    setCurrentView(viewId);
    if (setMobileOpen) setMobileOpen(false);
  };

  return (
    <>
      {/* Backdrop Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* User mini profile box */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={userProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'}
                alt=""
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-blue-500/30"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{userProfile?.displayName}</p>
                <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border mt-0.5 ${ROLE_BADGE_COLORS[role] || 'bg-slate-800 text-slate-300'}`}>
                  {ROLE_LABELS[role]}
                </span>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                      : item.highlight
                      ? 'text-indigo-300 hover:text-white hover:bg-indigo-950/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.highlight ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Support Info */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/60 text-xs text-slate-400">
            <div className="flex items-center gap-2 text-slate-200 font-medium mb-1">
              <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
              <span>Smartsa Core 1.0</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Arsitektur terintegrasi Firebase, Cloudinary & Gemini AI.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
