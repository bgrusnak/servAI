import { createI18n } from 'vue-i18n';
import messages from './locales';

// Detect browser language
const getBrowserLocale = () => {
  const locale = navigator.language || navigator.userLanguage;
  if (locale.startsWith('ru')) return 'ru';
  if (locale.startsWith('bg')) return 'bg';
  return 'en';
};

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || getBrowserLocale(),
  fallbackLocale: 'en',
  messages,
  globalInjection: true
});

export default i18n;
