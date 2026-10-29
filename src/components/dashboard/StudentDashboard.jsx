import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { getClassAttendance } from '../../services/attendanceService';
import {
  ArrowRight,
  Crosshair,
  Flame,
  Clock,
  Sparkles,
  QrCode,
  Play,
  Pause,
  RotateCcw,
  X,
  BookOpen,
  Barcode,
  TrendingUp,
} from 'lucide-react';

export default function StudentDashboard({ onNavigateTab, onSelectActivity }) {
  const { userProfile } = useAuth();
  const { t } = useLanguage();

  // State Progres Riwayat Kehadiran Semester (+6% per scan)
  const [semesterAttendance, setSemesterAttendance] = useState(() => {
    const pbo = getClassAttendance('subj_pbo');
    const pwmb = getClassAttendance('subj_pwmb');
    const totalAttended = pbo.attendedOrders.length + pwmb.attendedOrders.length;
    const totalProg = Math.min(100, Math.max(pbo.progress, totalAttended * 6));
    return {
      progress: totalProg,
      attended: totalAttended,
    };
  });

  useEffect(() => {
    const update = () => {
      const pbo = getClassAttendance('subj_pbo');
      const pwmb = getClassAttendance('subj_pwmb');
      const totalAttended = pbo.attendedOrders.length + pwmb.attendedOrders.length;
      const totalProg = Math.min(100, Math.max(pbo.progress, totalAttended * 6));
      setSemesterAttendance({
        progress: totalProg,
        attended: totalAttended,
      });
    };
    window.addEventListener('smartsa_attendance_updated', update);
    return () => window.removeEventListener('smartsa_attendance_updated', update);
  }, []);

  // State Modal Timer Sesi Fokus (Pomodoro Taktikal)
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(1500); // 25 menit = 1500 detik
  const [focusActive, setFocusActive] = useState(false);

  // Toggle Focus Timer
  const toggleFocusTimer = () => {
    setFocusActive(!focusActive);
  };

  const resetFocusTimer = () => {
    setFocusActive(false);
    setFocusSeconds(1500);
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const menuActivities = [
    {
      id: 'pretest',
      code: 'TEST-01',
      title: t('card_pretest_title'),
      subtitle: t('card_pretest_sub'),
      category: 'EVALUASI',
      progress: t('card_pretest_progress'),
      progressPercent: 25,
      action: () => onSelectActivity('pretest'),
      renderIcon: () => (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-800" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <path d="M18 13l2.5-2.5a1.5 1.5 0 0 0-2.1-2.1L16 11l-.5 2.5 2.5-.5z" />
        </svg>
      ),
    },
    {
      id: 'materi',
      code: 'DOC-02',
      title: t('card_read_title'),
      subtitle: t('card_read_sub'),
      category: 'MODUL',
      progress: t('card_read_progress'),
      progressPercent: 42,
      action: () => onNavigateTab('materi'),
      renderIcon: () => (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-800" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="12" y1="6" x2="16" y2="6" />
          <line x1="12" y1="10" x2="16" y2="10" />
        </svg>
      ),
    },
    {
      id: 'video',
      code: 'MEDIA-03',
      title: t('card_video_title'),
      subtitle: t('card_video_sub'),
      category: 'STREAM',
      progress: t('card_video_progress'),
      progressPercent: 25,
      action: () => onSelectActivity('video'),
      renderIcon: () => (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-800" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    {
      id: 'posttest',
      code: 'EXAM-04',
      title: t('card_posttest_title'),
      subtitle: t('card_posttest_sub'),
      category: 'EVALUASI',
      progress: t('card_posttest_progress'),
      progressPercent: 0,
      action: () => onSelectActivity('posttest'),
      renderIcon: () => (
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-slate-800" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <circle cx="16" cy="18" r="3" fill="#1e293b" />
          <path d="M14.8 18l.8.8 1.6-1.6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-5 pt-3">
      {/* 1. Sapaan Pengguna */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block text-[#f59e0b] font-black text-2xl -skew-x-12 select-none leading-none">
              /
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight leading-none">
              {t('greeting_student')}
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 font-sans">
            {t('greeting_sub')}
          </p>
        </div>

        {/* Streak Counter Pill & Crosshair HUD */}
        <div className="flex items-center gap-2">
          <div
            onClick={() => setIsFocusOpen(true)}
            className="flex items-center gap-1 bg-[#1c2432] hover:bg-[#253042] border border-[#f59e0b]/40 text-[#f59e0b] px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold cursor-pointer transition shadow-xs"
            title={t('streak_title')}
          >
            <Flame className="w-3.5 h-3.5 text-[#f59e0b] animate-bounce" />
            <span>{t('streak_label')}</span>
          </div>
          <div className="w-8 h-8 flex items-center justify-center text-slate-600 select-none">
            <Crosshair className="w-6 h-6 stroke-[1.2]" />
          </div>
        </div>
      </div>

      {/* 2. Presensi & Telemetri Jadwal Kuliah Hari Ini (Tepat di bawah Halo Mahasiswa) */}
      <div className="bg-[#141b26] p-4 rounded-xl border border-[#232f42] flex items-center justify-between gap-3 shadow-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#f59e0b]" />

        <div className="flex items-center gap-3 min-w-0 pl-1.5">
          <div className="w-10 h-10 rounded-md bg-[#1f2a3c] border border-slate-700 flex items-center justify-center text-[#f59e0b] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{t('attendance_banner_session')}</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-100 truncate mt-0.5">
              {t('attendance_banner_subject')}
            </p>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">
              {t('attendance_banner_location')}
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('kelas')}
          className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[10px] font-mono font-bold px-3 py-2 rounded-sm transition shrink-0 flex items-center gap-1 shadow-md uppercase tracking-wider"
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('attendance_btn')}
        </button>
      </div>

      {/* 3. Section Menu Belajar Taktikal */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block text-[#f59e0b] font-black text-xl -skew-x-12 select-none leading-none">
                /
              </span>
              <h2 className="text-xl font-black text-white tracking-tight leading-none">
                {t('study_menu_title')}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {t('study_menu_sub')}
            </p>
          </div>

          {/* Hazard Stripes */}
          <div className="flex items-center gap-1 select-none">
            <div className="w-1.5 h-3 -skew-x-30 bg-[#f59e0b]" />
            <div className="w-1.5 h-3 -skew-x-30 bg-[#f59e0b]" />
            <div className="w-1.5 h-3 -skew-x-30 bg-[#f59e0b]" />
            <div className="w-1.5 h-3 -skew-x-30 bg-slate-700" />
          </div>
        </div>

        {/* 2x2 Grid Modul */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {menuActivities.map((act) => {
            return (
              <div
                key={act.id}
                onClick={act.action}
                className="bg-[#f0f4f8] p-3.5 rounded-xl border border-slate-300 shadow-md hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between chamfer-card relative group min-h-[175px]"
              >
                {/* Header Kartu: Chamfered Icon & Arrow */}
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 bg-white border border-slate-300/80 rounded-md flex items-center justify-center relative shadow-xs chamfer-badge">
                    <span className="absolute -top-[1px] -right-[1px] w-2 h-[2px] bg-[#f59e0b]" />
                    <span className="absolute -top-[1px] -right-[1px] w-[2px] h-2 bg-[#f59e0b]" />
                    <span className="absolute -bottom-[1px] -left-[1px] w-2 h-[2px] bg-[#f59e0b]" />
                    <span className="absolute -bottom-[1px] -left-[1px] w-[2px] h-2 bg-[#f59e0b]" />
                    {act.renderIcon()}
                  </div>

                  <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded-xs">
                    {act.code}
                  </span>
                </div>

                {/* Konten Kartu */}
                <div className="mb-2">
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-slate-800 transition tracking-tight">
                    {act.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-snug mt-0.5 line-clamp-2">
                    {act.subtitle}
                  </p>
                </div>

                {/* Progress Bar & Status */}
                <div className="mt-auto pt-2 border-t border-slate-200/80">
                  <div className="w-full bg-[#cbd5e1] h-1.5 rounded-full overflow-hidden mb-1">
                    <div
                      className="bg-[#00897b] h-full rounded-full transition-all"
                      style={{ width: `${Math.max(6, act.progressPercent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-sans">
                    <span className="text-[#00897b] font-bold">{act.progress}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-[#f59e0b] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Ringkasan Status Pembelajaran Semester */}
      <div className="bg-[#141b26] p-4 rounded-xl border border-[#232f42] space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#f59e0b]" />
            <span className="font-mono font-bold text-slate-200 text-[11px] uppercase tracking-wider">
              {t('semester_progress_title')}
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-[#00e5ff] bg-[#00e5ff]/15 px-2 py-0.5 rounded-xs border border-[#00e5ff]/30">
            {semesterAttendance.progress}% SELESAI (+6%/SCAN)
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="w-full bg-[#1e2838] h-2 rounded-full overflow-hidden relative">
            <div
              className="bg-gradient-to-r from-[#00897b] to-[#00e5ff] h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${Math.max(6, semesterAttendance.progress)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>{semesterAttendance.attended} Pertemuan Hadir (+6%)</span>
            <span>4 Mata Kuliah Aktif</span>
          </div>
        </div>
      </div>

      {/* 5. Smartsa AIC Intelligence Insight Widget */}
      <div className="bg-[#121822] p-4 rounded-xl border border-[#232f42] text-xs font-mono space-y-2 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-[#f59e0b]/5 rounded-bl-full pointer-events-none" />
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold text-[#f59e0b] tracking-wider uppercase flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#f59e0b]" />
            {t('aic_briefing_title')}
          </span>
          <span className="text-[9px] text-slate-500">{t('aic_briefing_live')}</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed font-sans">
          {t('aic_briefing_quote')}
        </p>
        <div className="flex justify-end pt-1">
          <button
            onClick={() => onNavigateTab('ai')}
            className="text-[10px] font-bold text-[#f59e0b] hover:text-[#fbbf24] flex items-center gap-1 uppercase tracking-wider"
          >
            {t('aic_consult_btn')}
          </button>
        </div>
      </div>

      {/* 6. Tagline Bawah */}
      <div className="pt-2 pb-3 flex items-center justify-between text-slate-500 font-mono text-[9px] border-t border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <span className="text-[#f59e0b] font-black text-sm -skew-x-12 select-none leading-none">
            /
          </span>
          <span className="tracking-[0.2em] font-semibold uppercase text-slate-400">
            {t('bottom_tagline')}
          </span>
        </div>
        <div className="w-8 h-[1px] bg-slate-700/60" />
      </div>

      {/* MODAL: Sesi Belajar Fokus (Pomodoro Taktikal) */}
      {isFocusOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-mono">
          <div className="bg-[#161c24] w-full max-w-sm rounded-xl shadow-2xl border border-slate-700 overflow-hidden relative">
            <div className="p-4 bg-[#1b2330] border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#f59e0b] uppercase">
                <Clock className="w-4 h-4 text-[#f59e0b]" />
                <span>{t('focus_timer_title')}</span>
              </div>
              <button
                onClick={() => setIsFocusOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="text-4xl font-black text-white font-mono tracking-widest drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]">
                {formatTimer(focusSeconds)}
              </div>
              <p className="text-xs text-slate-400 font-sans">
                {t('focus_timer_desc')}
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={toggleFocusTimer}
                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-black px-5 py-2.5 rounded-sm flex items-center gap-1.5 transition shadow-md uppercase tracking-wider"
                >
                  {focusActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {focusActive ? t('focus_pause') : t('focus_start')}
                </button>
                <button
                  onClick={resetFocusTimer}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold p-2.5 rounded-sm transition"
                  title="Reset Timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
