import { useState } from 'react';
import { ROLES } from '../constants/roles';
import { translations } from '../constants/translations';
import { LanguageContext } from './languageContextDef';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    return localStorage.getItem('smartsa_language') || 'id';
  });

  const setLanguage = (lang) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('smartsa_language', lang);
    } catch (e) {
      console.warn('Gagal menyimpan preferensi bahasa:', e);
    }
  };

  const t = (key, fallback = '') => {
    return translations[language]?.[key] || translations.id?.[key] || fallback || key;
  };

  const getRoleLabel = (role) => {
    const roleKeys = {
      [ROLES.STUDENT]: 'role_student',
      [ROLES.LECTURER]: 'role_lecturer',
    };
    const key = roleKeys[role];
    return key ? t(key) : (role === ROLES.LECTURER ? t('role_lecturer') : t('role_student'));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, getRoleLabel, translations: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}
