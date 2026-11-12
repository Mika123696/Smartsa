import { useState, useEffect } from 'react';
import { useLanguage } from '../../context/useLanguage';
import {
  Sparkles,
  KeyRound,
  X,
  HelpCircle,
  Cpu,
} from 'lucide-react';

export default function FloatingActionButton({ onOpenAI, onOpenJoinModal }) {
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <>
      {/* Floating Action Button (Mobile Quick Command Core) */}
      <div className="md:hidden fixed bottom-20 right-4 z-30">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Smartsa Quick Core & AI Assistant"
          className="w-11 h-11 rounded-sm bg-white dark:bg-[#161c24] hover:bg-amber-50 dark:hover:bg-[#1f2835] text-amber-600 dark:text-[#f59e0b] border border-amber-400 dark:border-[#f59e0b]/60 flex items-center justify-center shadow-lg transition-transform active:scale-95 group"
          title="Smartsa Command Core & AI Assistant"
        >
          <Cpu className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#f59e0b] rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#f59e0b] rounded-full" />
        </button>
      </div>

      {/* Quick Drawer / Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4 font-mono">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fab-core-dialog-title"
            className="bg-white dark:bg-[#12161f] w-full max-w-sm rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom duration-200"
          >
            <div className="p-4 bg-slate-50 dark:bg-[#18202c] text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f59e0b]" />
                <h3
                  id="fab-core-dialog-title"
                  className="text-xs font-bold uppercase tracking-wider"
                >
                  {t('quick_core_tag')}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Tutup panel cepat"
                onClick={() => setDrawerOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenAI();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#192332] hover:bg-slate-100 dark:hover:bg-[#202d40] border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 text-xs font-bold transition text-left"
              >
                <div className="w-8 h-8 rounded-md bg-[#f59e0b] text-black flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('quick_core_ai_title')}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                    {t('quick_core_ai_sub')}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenJoinModal();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-[#192332] hover:bg-slate-100 dark:hover:bg-[#202d40] border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 text-xs font-bold transition text-left"
              >
                <div className="w-8 h-8 rounded-md bg-[#00897b] text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('quick_core_join_title')}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                    {t('quick_core_join_sub')}
                  </div>
                </div>
              </button>

              <div className="pt-2 text-center text-[10px] text-slate-500 flex items-center justify-center gap-1 font-mono">
                <HelpCircle className="w-3 h-3 text-[#f59e0b]" />
                <span>SMARTSA // CORE PROTOCOL v2.0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
