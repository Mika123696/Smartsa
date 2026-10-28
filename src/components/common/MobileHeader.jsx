import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { ROLES } from '../../constants/roles';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Shield,
  ChevronDown,
  LogIn,
} from 'lucide-react';

export default function MobileHeader({ onOpenAuth }) {
  const { role, switchDemoRole, isDemoMode, userProfile } = useAuth();
  const { t, getRoleLabel } = useLanguage();
  const [notifOpen, setNotifOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  return (
    <header className="relative z-40 bg-[#161c24] text-white border-b border-[#232b38]">
      {/* Background industrial silhouette with dark vignette (clipped separately so dropdowns don't get cut off) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
      <div className="relative px-4 py-3 flex items-center justify-between">
        {/* Left Vertical Hazard Orange Bar */}
        <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#f59e0b] rounded-r-xs shadow-[0_0_8px_rgba(245,158,11,0.5)]" />

        {/* Brand Logo & Typography: Smartsa */}
        <div className="pl-3 flex items-start gap-2.5">
          {/* Stylized Endfield Geometric Double-Chevron Glyph */}
          <div className="w-7 h-8 pt-0.5 shrink-0">
            <svg viewBox="0 0 32 36" fill="none" className="w-full h-full drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]">
              <path
                d="M4 4L22 4L14 16L4 16Z"
                fill="#f59e0b"
              />
              <path
                d="M10 18L28 18L18 32L8 32Z"
                fill="#fbbf24"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black tracking-wider text-white font-sans leading-none">
                Smartsa
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[#f59e0b] font-mono text-[9px] font-bold">_</span>
              <span className="text-[8.5px] font-mono tracking-[0.16em] text-slate-400 uppercase">
                {t('header_tagline')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Actions: Role Clearance Switcher & Hexagonal Notification Bell */}
        <div className="flex items-center gap-2">
          {/* Quick Role Clearance Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => {
                setRoleDropdownOpen(!roleDropdownOpen);
                setNotifOpen(false);
              }}
              className="flex items-center gap-1.5 bg-[#1d2636] hover:bg-[#253247] text-slate-100 text-xs font-mono font-bold px-2.5 py-1.5 rounded-sm border border-slate-600 transition shadow-xs"
              title={t('switch_role_title')}
            >
              <Shield className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-[11px] font-semibold">{getRoleLabel(role)?.split(' ')[0] || role}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {roleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-[#18202c] text-slate-200 rounded-md shadow-2xl border border-slate-600 py-1.5 z-50 font-mono text-xs animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 border-b border-slate-700 text-[10px] font-bold text-[#f59e0b] uppercase tracking-wider flex items-center justify-between">
                  <span>{t('switch_role_title')}</span>
                  <span className="text-[9px] text-slate-400">CLEARANCE</span>
                </div>
                {Object.values(ROLES).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      switchDemoRole(r);
                      setRoleDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 transition ${
                      role === r ? 'font-bold text-[#f59e0b] bg-[#f59e0b]/15' : 'text-slate-300'
                    }`}
                  >
                    <span className="text-xs">{getRoleLabel(r)}</span>
                    {role === r && <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" />}
                  </button>
                ))}

                <div className="pt-1.5 border-t border-slate-700 px-2 pb-1 mt-1">
                  <button
                    onClick={() => {
                      setRoleDropdownOpen(false);
                      onOpenAuth && onOpenAuth();
                    }}
                    className="w-full bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold py-1.5 px-2 rounded-sm transition flex items-center justify-center gap-1.5 uppercase tracking-wide"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t('signin_google_btn')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Hexagonal / Faceted Notification Bell Button */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen(!notifOpen);
                setRoleDropdownOpen(false);
              }}
              className="w-9 h-9 bg-[#1c232f] hover:bg-[#242c3a] border border-slate-700/70 rounded-xl flex items-center justify-center text-slate-200 transition shadow-inner relative group"
              style={{
                clipPath: 'polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)',
              }}
            >
              <Bell className="w-4 h-4 text-slate-200 group-hover:scale-105 transition-transform" />
              {/* Orange Notification Badge Dot */}
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#f59e0b] rounded-full ring-2 ring-[#161c24] shadow-[0_0_6px_#f59e0b]" />
            </button>

            {/* Notifications Popover */}
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[#18202c] rounded-md shadow-2xl border border-slate-700 py-2.5 z-50 text-slate-200 font-mono text-xs">
                <div className="px-3 pb-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-[#f59e0b] uppercase text-[10px] tracking-wider">{t('notif_title')}</span>
                  <span className="text-[9px] text-slate-400 hover:text-white cursor-pointer">{t('notif_clear')}</span>
                </div>
                <div className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
                  <div className="p-2.5 hover:bg-slate-800/50 transition flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-100 text-[11px]">{t('notif_1_title')}</p>
                      <p className="text-[10px] text-slate-400 font-sans">{t('notif_1_desc')}</p>
                    </div>
                  </div>
                  <div className="p-2.5 hover:bg-slate-800/50 transition flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-[#f59e0b] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#f59e0b] text-[11px]">{t('notif_2_title')}</p>
                      <p className="text-[10px] text-slate-400 font-sans">{t('notif_2_desc')}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Header Bottom Tech Divider with Center Gold Mark & Angled Hazard Notches */}
      <div className="relative h-1 bg-[#12161f] flex items-center justify-between px-4 overflow-hidden">
        <div className="w-12 h-[1px] bg-slate-700/60" />
        <div className="w-16 h-[2px] bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" />
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-[#f59e0b]/80" />
          <div className="w-1 h-2 -skew-x-30 bg-slate-700" />
        </div>
      </div>
    </header>
  );
}
