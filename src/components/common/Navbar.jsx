import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/useTheme';
import { useLanguage } from '../../context/useLanguage';
import { ROLES, ROLE_BADGE_COLORS } from '../../constants/roles';
import {
  GraduationCap,
  BookOpen,
  LogIn,
  LogOut,
  Shield,
  Sun,
  Moon,
  Globe,
  Menu,
  X,
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenAuth }) {
  const { role, currentUser, userProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage, getRoleLabel } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (tab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand Logo */}
          <button
            type="button"
            className="flex items-center gap-3 text-left cursor-pointer"
            onClick={() => handleNav('landing')}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white block leading-none">
                Smartsa
              </span>
              <span className="text-[11px] text-blue-600 dark:text-blue-400 block font-medium mt-0.5">
                Learning Management System
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNav('landing')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'landing'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              {t('nav_home')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('catalog')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'catalog'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              {t('nav_catalog')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('about')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'about'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
              }`}
            >
              {t('nav_about')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              {role === ROLES.ADMIN
                ? t('topbar_admin_panel')
                : role === ROLES.LECTURER
                  ? t('sidebar_lecturer_dash')
                  : t('nav_open_dashboard')}
            </button>
          </div>

          {/* Right Controls: Theme, Lang, Auth */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
              aria-label="Ubah Bahasa"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-xs font-mono font-bold flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{language.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2">
                <div
                  className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                    ROLE_BADGE_COLORS[role] || 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                  title={`${userProfile?.displayName || ''} (${getRoleLabel(role)})`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-semibold">{getRoleLabel(role)}</span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label={t('nav_logout')}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 p-2 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-md transition"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">{t('nav_login_register')}</span>
                <span className="sm:hidden">{t('tab_login')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Menu Navigasi"
              className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Public Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
            <button
              type="button"
              onClick={() => handleNav('landing')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                activeTab === 'landing'
                  ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t('nav_home')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('catalog')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                activeTab === 'catalog'
                  ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t('nav_catalog')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('about')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                activeTab === 'about'
                  ? 'bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {t('nav_about')}
            </button>
            <button
              type="button"
              onClick={() => handleNav('dashboard')}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              {role === ROLES.ADMIN
                ? t('topbar_admin_panel')
                : role === ROLES.LECTURER
                  ? t('sidebar_lecturer_dash')
                  : t('nav_open_dashboard')}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
