import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  Sparkles,
  KeyRound,
  X,
  HelpCircle,
  Cpu,
} from 'lucide-react';

export default function FloatingActionButton({ onOpenAI, onOpenJoinModal }) {
  const { t, language } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button (Tactical Endfield Command Core) */}
      <div className="fixed bottom-20 right-4 z-30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-11 h-11 rounded-sm bg-[#161c24] hover:bg-[#1f2835] text-[#f59e0b] border border-[#f59e0b]/60 flex items-center justify-center shadow-lg shadow-black/60 transition-transform active:scale-95 group"
          title="Endfield Command Core & AI Assistant"
        >
          <Cpu className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#f59e0b] rounded-full animate-ping" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#f59e0b] rounded-full" />
        </button>
      </div>

      {/* Quick Drawer / Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center z-50 p-4 font-mono">
          <div className="bg-[#12161f] w-full max-w-sm rounded-sm shadow-2xl border border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
            <div className="p-4 bg-[#18202c] text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f59e0b]" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">{t('quick_core_tag')}</h3>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenAI();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xs bg-[#192332] hover:bg-[#202d40] border border-slate-700/80 text-slate-200 text-xs font-bold transition text-left"
              >
                <div className="w-8 h-8 rounded-xs bg-[#f59e0b] text-black flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{t('quick_core_ai_title')}</div>
                  <div className="text-[10px] text-slate-400 font-sans">{t('quick_core_ai_sub')}</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenJoinModal();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xs bg-[#192332] hover:bg-[#202d40] border border-slate-700/80 text-slate-200 text-xs font-bold transition text-left"
              >
                <div className="w-8 h-8 rounded-xs bg-[#00897b] text-white flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{t('quick_core_join_title')}</div>
                  <div className="text-[10px] text-slate-400 font-sans">{t('quick_core_join_sub')}</div>
                </div>
              </button>

              <div className="pt-2 text-center text-[10px] text-slate-500 flex items-center justify-center gap-1 font-mono">
                <HelpCircle className="w-3 h-3 text-[#f59e0b]" />
                <span>SMARTSA // ENDFIELD PROTOCOL v1.0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
