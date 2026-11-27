import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { useTheme } from '../../context/useTheme';
import { ROLES } from '../../constants/roles';
import BrandLogo from './BrandLogo';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  ShieldCheck,
  Shield,
  Sun,
  Moon,
} from 'lucide-react';

export default function MobileHeader() {
  const { role, userProfile, currentUser } = useAuth();
  const { t, getRoleLabel } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);

  const roleBadgeClass =
    role === ROLES.ADMIN
      ? 'bg-rose-50 dark:bg-[#241019] border-rose-200 dark:border-rose-500/60 text-rose-700 dark:text-rose-300'
      : role === ROLES.LECTURER
      ? 'bg-amber-50 dark:bg-[#221808] border-amber-300 dark:border-[#f59e0b]/60 text-amber-700 dark:text-[#f59e0b]'
      : 'bg-sky-50 dark:bg-[#0a1824] border-sky-200 dark:border-[#00e5ff]/60 text-sky-700 dark:text-[#00e5ff]';

  return (
    <header className="md:hidden relative z-40 bg-white dark:bg-[#161c24] text-slate-900 dark:text-white border-b border-slate-200 dark:border-[#232b38] transition-colors">
      {/* Background industrial silhouette with vignette in dark mode */}
      <div className="hidden dark:block absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-luminosity"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80")',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#12161f]/80 via-[#161c24]/90 to-[#161c24]" />
      </div>

      {/* Main Header Container */}
      <div className="relative px-4 py-3 flex items-center justify-between gap-2">
        {/* Left Vertical Hazard Orange Bar */}
        <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#f59e0b] rounded-r-xs shadow-[0_0_8px_rgba(245,158,11,0.5)]" />

        {/* Brand Logo & Typography: Smartsa */}
        <div className="pl-3 flex items-start gap-2.5 min-w-0">
          <div className="pt-0.5 shrink-0">
            <BrandLogo size="sm" />
          </div>

          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black tracking-wider text-slate-900 dark:text-white font-sans leading-none">
                Smartsa
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[#f59e0b] font-mono text-[9px] font-bold">_</span>
              <span className="text-[8.5px] font-mono tracking-[0.14em] text-slate-500 dark:text-slate-400 uppercase truncate">
                {t('header_tagline')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions: Theme, Role Badge & Notification Bell */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1c232f] border border-slate-200 dark:border-slate-700/70 flex items-center justify-center text-slate-700 dark:text-amber-400 transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Static Authenticated Role Badge */}
          {currentUser && role && (
            <div
              className={`flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-1 rounded-sm border shadow-xs select-none ${roleBadgeClass}`}
              title={`${userProfile?.displayName || getRoleLabel(role)} (${getRoleLabel(role)})`}
            >
              {role === ROLES.ADMIN ? (
                <Shield className="w-3 h-3" />
              ) : role === ROLES.LECTURER ? (
                <GraduationCap className="w-3 h-3" />
              ) : (
                <ShieldCheck className="w-3 h-3" />
              )}
              <span className="tracking-wide uppercase">{getRoleLabel(role)}</span>
            </div>
          )}

          {/* Notification Bell Button */}
          <div className="relative">
            <button
              type="button"
              aria-label={t('topbar_system_notif')}
              onClick={() => setNotifOpen(!notifOpen)}
              className="w-9 h-9 bg-slate-100 dark:bg-[#1c232f] hover:bg-slate-200 dark:hover:bg-[#242c3a] border border-slate-200 dark:border-slate-700/70 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 transition shadow-inner relative group"
              style={{
                clipPath:
                  'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)',
              }}
            >
              <Bell className="w-4 h-4 group-hover:scale-105 transition-transform" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f59e0b] rounded-full ring-2 ring-white dark:ring-[#161c24] shadow-[0_0_6px_#f59e0b]" />
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#18202c] rounded-md shadow-2xl border border-slate-200 dark:border-slate-700 py-2.5 z-50 text-slate-800 dark:text-slate-200 font-mono text-xs">
                <div className="px-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-amber-600 dark:text-[#f59e0b] uppercase text-[10px] tracking-wider">
                    {t('notif_title')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-[9px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    {t('notif_clear')}
                  </button>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-56 overflow-y-auto">
                  <div className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-[11px]">
                        {t('notif_1_title')}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                        {t('notif_1_desc')}
                      </p>
                    </div>
                  </div>
                  <div className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-600 dark:text-[#f59e0b] text-[11px]">
                        {t('notif_2_title')}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                        {t('notif_2_desc')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header Bottom Tech Divider */}
      <div className="relative h-1 bg-slate-100 dark:bg-[#12161f] flex items-center justify-between px-4 overflow-hidden">
        <div className="w-12 h-[1px] bg-slate-300 dark:bg-slate-700/60" />
        <div className="w-16 h-[2px] bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" />
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-slate-300 dark:bg-slate-700" />
        </div>
      </div>
    </header>
  );
}
