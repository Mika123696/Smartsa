import {
  Home,
  Calendar,
  BookOpen,
  FileText,
  MessageSquare,
  User,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';

export default function BottomNav({ activeTab, setActiveTab }) {
  const { role } = useAuth();
  const { t, language } = useLanguage();

  const tabs =
    role === ROLES.ADMIN
      ? [
          { id: 'dashboard', label: language === 'en' ? 'Admin' : 'Admin', icon: ShieldCheck },
          { id: 'classes-all', label: language === 'en' ? 'Classes' : 'Kelola', icon: BookOpen },
          { id: 'diskusi', label: t('nav_discussions', 'Diskusi'), icon: MessageSquare },
          { id: 'profil', label: t('nav_profile', 'Profil'), icon: User },
        ]
      : role === ROLES.LECTURER
        ? [
            { id: 'dashboard', label: language === 'en' ? 'Hub' : 'Hub', icon: Home },
            { id: 'classes-all', label: t('nav_classes', 'Kelas'), icon: BookOpen },
            { id: 'materi', label: t('nav_materials', 'Materi'), icon: FileText },
            { id: 'diskusi', label: t('nav_discussions', 'Diskusi'), icon: MessageSquare },
            { id: 'profil', label: t('nav_profile', 'Profil'), icon: User },
          ]
        : [
            { id: 'dashboard', label: t('nav_dashboard', 'Dashboard'), icon: Home },
            { id: 'kelas', label: t('nav_classes', 'Kelas'), icon: Calendar },
            { id: 'materi', label: t('nav_materials', 'Materi'), icon: BookOpen },
            { id: 'diskusi', label: t('nav_discussions', 'Diskusi'), icon: MessageSquare },
            { id: 'profil', label: t('nav_profile', 'Profil'), icon: User },
          ];

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-[#12161f]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#232b38] z-40 py-2 transition-colors"
    >
      <div className="max-w-md mx-auto px-3 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center justify-center py-1 px-3 transition-colors relative group cursor-pointer"
            >
              <Icon
                className={`w-5 h-5 mb-1 transition-all ${
                  isActive
                    ? 'text-amber-600 dark:text-[#f59e0b] fill-amber-500/20 dark:fill-[#f59e0b] scale-105 stroke-[1.8]'
                    : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 stroke-[1.8]'
                }`}
              />
              <span
                className={`text-[10px] leading-tight transition-colors ${
                  isActive
                    ? 'font-bold text-amber-600 dark:text-[#f59e0b]'
                    : 'font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-300'
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
