import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { ROLES } from '../../constants/roles';
import { Menu, Search, Bell, Plus, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Topbar({ currentView, onToggleSidebar, onQuickAction }) {
  const { role } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  const getTitle = () => {
    switch (currentView) {
      case 'dashboard':
        return 'Ringkasan Dashboard';
      case 'classes':
        return 'Daftar & Manajemen Kelas';
      case 'class-detail':
        return 'Detail Pertemuan & Modul';
      case 'grades':
        return 'Evaluasi & Nilai Akademik';
      case 'ai-assistant':
        return 'Asisten Kecerdasan Buatan (AI)';
      case 'bookmarks':
        return 'Materi Disimpan (Offline Cache)';
      case 'audit-logs':
        return 'Audit Security & Access Logs';
      case 'users-manage':
        return 'Persetujuan Akun Pendidik';
      case 'profile':
        return 'Profil Akun & Keamanan';
      default:
        return 'Sistem LMS';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-16 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900">{getTitle()}</h1>
        </div>
      </div>

      {/* Right: Search, Notifications & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Search Bar */}
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari materi, kuis, atau silabus..."
            className="pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-56 focus:w-72 transition-all outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        {/* Quick Action Button */}
        {role === ROLES.STUDENT || role === ROLES.GENERAL ? (
          <button
            onClick={onQuickAction}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Gabung Kelas</span>
          </button>
        ) : (
          <button
            onClick={onQuickAction}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buat Kelas Baru</span>
          </button>
        )}

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg relative transition"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full"></span>
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-3 z-50">
              <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Pemberitahuan Sistem</span>
                <span className="text-[10px] text-blue-600 font-medium cursor-pointer">Tandai Dibaca</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                <div className="p-3 hover:bg-slate-50 transition flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Deadline Tugas Kelompok</p>
                    <p className="text-[11px] text-slate-500">Tugas Proyek Microservices berakhir besok pukul 23:59 WIB.</p>
                  </div>
                </div>
                <div className="p-3 hover:bg-slate-50 transition flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Nilai Pretest Terbit</p>
                    <p className="text-[11px] text-slate-500">Skor Pertemuan 02 telah dicatat: 88/100.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Demo Mode Pill */}
        {isDemoMode && (
          <span className="hidden xl:inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            Data Demo Aktif
          </span>
        )}
      </div>
    </header>
  );
}
