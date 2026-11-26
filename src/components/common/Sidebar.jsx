import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES, ROLE_BADGE_COLORS } from '../../constants/roles';
import SafeImage from './SafeImage';
import BrandLogo from './BrandLogo';
import {
  LayoutDashboard,
  BookOpen,
  BookMarked,
  Sparkles,
  Calendar,
  FileText,
  MessageSquare,
  Settings,
  HelpCircle,
  Globe,
  ShieldCheck,
} from 'lucide-react';

export default function Sidebar({ currentView, setCurrentView }) {
  const { role, userProfile, currentUser } = useAuth();
  const { t, getRoleLabel } = useLanguage();

  if (!currentUser) {
    return null;
  }

  const getNavItems = () => {
    if (role === ROLES.ADMIN) {
      return [
        { id: 'dashboard', label: t('sidebar_admin_dash'), icon: ShieldCheck },
        { id: 'classes-all', label: t('sidebar_manage_classes'), icon: BookOpen },
        { id: 'diskusi', label: t('sidebar_discussions'), icon: MessageSquare },
        { id: 'manual-book', label: t('sidebar_manual_book'), icon: BookMarked },
        { id: 'ai', label: t('sidebar_ai_admin'), icon: Sparkles, highlight: true },
        { id: 'profil', label: t('sidebar_profile'), icon: Settings },
      ];
    }

    if (role === ROLES.LECTURER) {
      return [
        { id: 'dashboard', label: t('sidebar_lecturer_dash'), icon: LayoutDashboard },
        { id: 'classes-all', label: t('sidebar_manage_classes'), icon: BookOpen },
        { id: 'materi', label: t('sidebar_materials'), icon: FileText },
        { id: 'kelas', label: t('sidebar_schedule'), icon: Calendar },
        { id: 'diskusi', label: t('sidebar_discussions'), icon: MessageSquare },
        { id: 'manual-book', label: t('sidebar_manual_book'), icon: BookMarked },
        { id: 'ai', label: t('sidebar_ai_lecturer'), icon: Sparkles, highlight: true },
        { id: 'profil', label: t('sidebar_profile'), icon: Settings },
      ];
    }

    return [
      { id: 'dashboard', label: t('sidebar_student_dash'), icon: LayoutDashboard },
      { id: 'classes-all', label: t('sidebar_my_classes'), icon: BookOpen },
      { id: 'kelas', label: t('sidebar_schedule'), icon: Calendar },
      { id: 'materi', label: t('sidebar_materials'), icon: FileText },
      { id: 'diskusi', label: t('sidebar_discussions'), icon: MessageSquare },
      { id: 'manual-book', label: t('sidebar_manual_book'), icon: BookMarked },
      { id: 'ai', label: t('sidebar_ai_student'), icon: Sparkles, highlight: true },
      { id: 'profil', label: t('sidebar_profile'), icon: Settings },
    ];
  };

  const navItems = getNavItems();
  const displayName =
    userProfile?.displayName ||
    currentUser.displayName ||
    currentUser.email ||
    '';

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-white dark:bg-[#12161f] border-r border-slate-200 dark:border-[#232b38] sticky top-0 h-screen justify-between transition-colors">
      <div className="flex flex-col min-h-0 flex-1">
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-slate-200 dark:border-[#232b38] flex items-center gap-3 shrink-0">
          <BrandLogo size="md" />
          <div className="min-w-0">
            <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white block leading-none">
              SMARTSA <span className="text-[#f59e0b]">LMS</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block mt-1 truncate">
              CLOUD SYNC
            </span>
          </div>
        </div>

        {/* User mini profile box */}
        <div className="p-4 border-b border-slate-200 dark:border-[#232b38] flex items-center gap-3">
          <SafeImage
            src={userProfile?.photoURL || currentUser.photoURL || null}
            alt={displayName}
            fallbackLabel={displayName}
            variant="avatar"
            className="w-10 h-10 rounded-xl object-cover ring-2 ring-amber-500/30 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {displayName}
            </p>
            {role && (
              <span
                className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border mt-0.5 ${
                  ROLE_BADGE_COLORS[role] || 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {getRoleLabel(role)}
              </span>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Navigasi Utama Desktop" className="p-3 space-y-1 overflow-y-auto flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                  isActive
                    ? 'bg-[#f59e0b] text-black shadow-sm'
                    : item.highlight
                    ? 'text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-black'
                      : item.highlight
                      ? 'text-indigo-500 dark:text-indigo-400'
                      : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-slate-200 dark:border-[#232b38]">
            <button
              type="button"
              onClick={() => setCurrentView('landing')}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('sidebar_public_portal')}</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Footer Support Info */}
      <div className="p-3 border-t border-slate-200 dark:border-[#232b38]">
        <div className="bg-slate-50 dark:bg-[#161d2a] rounded-xl p-3 border border-slate-200 dark:border-[#232f42] text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-200 font-semibold mb-1">
            <HelpCircle className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Smartsa Core 2.0</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Firebase Auth, Cloud Firestore &amp; Exam-Safe Architecture.
          </p>
        </div>
      </div>
    </aside>
  );
}
