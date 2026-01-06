import { createI18n } from 'vue-i18n';
import ru from './locales/ru.json';
import en from './locales/en.json';
import bg from './locales/bg.json';

const messages = { ru, en, bg };

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'ru',
  fallbackLocale: 'en',
  messages
});

export default i18n;
