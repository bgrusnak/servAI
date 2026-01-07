import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Quasar, Notify, Dialog, Loading, LocalStorage, SessionStorage } from 'quasar';
import router from './router';
import i18n from './i18n';
import App from './App.vue';

import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/dist/quasar.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(Quasar, {
  plugins: { Notify, Dialog, Loading, LocalStorage, SessionStorage },
  config: {
    notify: { 
      position: 'top-right', 
      timeout: 3000,
      actions: [{ icon: 'close', color: 'white' }]
    },
    loading: { 
      delay: 200,
      spinner: 'dots',
      spinnerColor: 'primary'
    }
  }
});

app.config.errorHandler = (err, instance, info) => {
  console.error('Global error:', err, info);
};

app.config.warnHandler = (msg, instance, trace) => {
  if (import.meta.env.DEV) {
    console.warn('Vue warning:', msg, trace);
  }
};

app.mount('#app');
