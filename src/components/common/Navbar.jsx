import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import { GraduationCap, BookOpen, LogIn, LogOut, Shield, ChevronDown } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenAuth }) {
  const { role, switchDemoRole, currentUser, logout, isDemoMode } = useAuth();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  return (
    <nav className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('landing')}>
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Smartsa</span>
              <span className="text-xs text-blue-400 block font-medium">Learning Management System</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('landing')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'landing' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Beranda
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'catalog' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Katalog Kelas
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === 'about' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              Tentang Platform
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-blue-950/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Buka Dashboard
            </button>
          </div>

          {/* Role Switcher & Auth Section */}
          <div className="flex items-center gap-3">
            {/* Quick Role Switcher (untuk pengujian & audit) */}
            <div className="relative">
              <button
                onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition"
                title="Ganti peran untuk menguji tampilan dashboard role lain"
              >
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline text-slate-400">Role:</span>
                <span className="font-semibold text-white">{ROLE_LABELS[role] || role}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 py-2 z-50">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Pilih Role untuk Pratinjau
                  </div>
                  {Object.values(ROLES).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        switchDemoRole(r);
                        setRoleDropdownOpen(false);
                        setActiveTab('dashboard');
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition ${
                        role === r ? 'font-bold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                      }`}
                    >
                      <span>{ROLE_LABELS[r]}</span>
                      {role === r && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
                    </button>
                  ))}
                  {isDemoMode && (
                    <div className="px-3 pt-2 text-[10px] text-amber-600 border-t border-slate-100 italic">
                      Mode Demonstrasi Aktif
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Login / User button */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300 hidden md:inline">{currentUser.displayName || currentUser.email}</span>
                <button
                  onClick={logout}
                  className="bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-400 p-2 rounded-lg transition"
                  title="Keluar"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-md transition"
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk / Daftar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
