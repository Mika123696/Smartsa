import {
  Home,
  Calendar,
  BookOpen,
  MessageSquare,
  User,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function BottomNav({ activeTab, setActiveTab }) {
  const { t } = useLanguage();

  const tabs = [
    { id: 'dashboard', label: t('nav_dashboard', 'Dashboard'), icon: Home },
    { id: 'kelas', label: t('nav_classes', 'Kelas'), icon: Calendar },
    { id: 'materi', label: t('nav_materials', 'Materi'), icon: BookOpen },
    { id: 'diskusi', label: t('nav_discussions', 'Diskusi'), icon: MessageSquare },
    { id: 'profil', label: t('nav_profile', 'Profil'), icon: User },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-[#12161f]/95 backdrop-blur-md border-t border-[#232b38] z-40 py-2">
      <div className="max-w-md mx-auto px-3 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center py-1 px-3 transition-colors relative group"
            >
              <Icon
                className={`w-5 h-5 mb-1 transition-all ${
                  isActive
                    ? 'text-[#f59e0b] fill-[#f59e0b] scale-105 stroke-[1.5]'
                    : 'text-slate-400 group-hover:text-slate-200 stroke-[1.8]'
                }`}
              />
              <span
                className={`text-[10px] leading-tight transition-colors ${
                  isActive
                    ? 'font-bold text-[#f59e0b]'
                    : 'font-medium text-slate-400 group-hover:text-slate-300'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
