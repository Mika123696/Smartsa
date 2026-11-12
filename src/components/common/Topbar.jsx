import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  Bell,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Globe,
  LogIn,
} from 'lucide-react';

export default function Topbar({ currentView, onQuickAction, onOpenAuth }) {
  const { role, isDemoMode, currentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [notifOpen, setNotifOpen] = useState(false);

  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return t('topbar_title_dashboard');
      case 'classes-all':
        return t('topbar_title_classes');
      case 'kelas':
        return t('topbar_title_schedule');
      case 'materi':
        return t('topbar_title_materials');
      case 'diskusi':
        return t('topbar_title_discussions');
      case 'detail':
        return t('topbar_title_detail');
      case 'ai':
        return t('topbar_title_ai');
      case 'profil':
        return t('topbar_title_profile');
      default:
        return 'Smartsa LMS';
    }
  };

  return (
    <header className="hidden md:flex h-16 bg-white/95 dark:bg-[#12161f]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#232b38] sticky top-0 z-30 items-center justify-between px-6 transition-colors">
      {/* Page Title */}
      <div>
        <h1 className="text-base lg:text-lg font-bold text-slate-900 dark:text-slate-100">
          {getTitle()}
        </h1>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Quick Action Button */}
        {role === ROLES.STUDENT ? (
          <button
            type="button"
            onClick={onQuickAction}
            className="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('topbar_join_class')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onQuickAction}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('topbar_create_class')}</span>
          </button>
        )}

        {/* Language Toggle */}
        <button
          type="button"
          onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
          aria-label="Ubah Bahasa"
          className="p-2 rounded-lg border border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-mono font-bold flex items-center gap-1"
        >
          <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-[#00e5ff]" />
          <span>{language.toUpperCase()}</span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
          className="p-2 rounded-lg border border-slate-200 dark:border-[#232f42] bg-slate-50 dark:bg-[#161d2a] text-slate-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label={t('topbar_system_notif')}
            className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg relative transition border border-transparent dark:hover:border-[#232f42]"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f59e0b] rounded-full" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#121822] rounded-xl shadow-xl border border-slate-200 dark:border-[#232f42] py-3 z-50">
              <div className="px-4 pb-2 border-b border-slate-100 dark:border-[#232f42] flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {t('topbar_system_notif')}
                </span>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-[10px] text-blue-600 dark:text-[#00e5ff] font-medium hover:underline"
                >
                  {t('topbar_mark_read')}
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-[#232f42] max-h-64 overflow-y-auto">
                <div className="p-3 hover:bg-slate-50 dark:hover:bg-[#161d2a] transition flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t('notif_2_title')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('notif_2_desc')}
                    </p>
                  </div>
                </div>
                <div className="p-3 hover:bg-slate-50 dark:hover:bg-[#161d2a] transition flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t('notif_1_title')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('notif_1_desc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Auth / Demo Pill */}
        {!currentUser && onOpenAuth ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-500/40 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/60 transition"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{t('tab_login')}</span>
          </button>
        ) : isDemoMode ? (
          <span className="hidden xl:inline-flex items-center text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-500/40 px-2.5 py-1 rounded-full">
            {t('topbar_demo_active')}
          </span>
        ) : null}
      </div>
    </header>
  );
}
