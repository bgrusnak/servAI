import { createApp } from 'vue';
import { Quasar, Notify, Dialog, Loading, LoadingBar, LocalStorage } from 'quasar';
import App from './App.vue';
import router from './router';
import { createPinia } from 'pinia';
import i18n from './i18n';

// Import icon libraries
import '@quasar/extras/material-icons/material-icons.css';
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css';
import '@quasar/extras/fontawesome-v6/fontawesome-v6.css';

// Import Quasar css
import 'quasar/dist/quasar.css';

// Import app styles
import './css/app.scss';

const app = createApp(App);
const pinia = createPinia();

app.use(Quasar, {
  plugins: {
    Notify,
    Dialog,
    Loading,
    LoadingBar,
    LocalStorage
  },
  config: {
    brand: {
      primary: '#1976D2',
      secondary: '#26A69A',
      accent: '#9C27B0',
      dark: '#1D1D1D',
      positive: '#21BA45',
      negative: '#C10015',
      info: '#31CCEC',
      warning: '#F2C037'
    },
    notify: {
      position: 'top-right',
      timeout: 3000
    },
    loading: {},
    loadingBar: {
      color: 'primary',
      size: '3px'
    }
  }
});

app.use(pinia);
app.use(router);
app.use(i18n);

app.mount('#q-app');
