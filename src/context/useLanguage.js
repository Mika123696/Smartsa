import { useContext } from 'react';
import { LanguageContext } from './languageContextDef';
import { translations } from '../constants/translations';

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: 'id',
      setLanguage: () => {},
      t: (key, fallback = '') => translations.id[key] || fallback || key,
      getRoleLabel: (role) => role,
      translations: translations.id,
    };
  }
  return context;
}
