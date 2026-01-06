/* eslint-env node */
const { configure } = require('quasar/wrappers');

module.exports = configure(function (/* ctx */) {
  return {
    eslint: {
      warnings: true,
      errors: true
    },

    boot: [
      'i18n',
      'axios',
      'auth'
    ],

    css: [
      'app.scss'
    ],

    extras: [
      'roboto-font',
      'material-icons',
      'material-icons-outlined',
      'fontawesome-v6'
    ],

    build: {
      target: {
        browser: ['es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
        node: 'node20'
      },

      vueRouterMode: 'history',
      env: {
        API_BASE_URL: process.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
        APP_NAME: process.env.VITE_APP_NAME || 'ServAI',
        APP_VERSION: process.env.VITE_APP_VERSION || '1.0.0'
      },

      extendViteConf(viteConf) {
        viteConf.optimizeDeps = viteConf.optimizeDeps || {};
        viteConf.optimizeDeps.include = viteConf.optimizeDeps.include || [];
      }
    },

    devServer: {
      open: true,
      port: 9000
    },

    framework: {
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
        notify: {},
        loading: {},
        loadingBar: { color: 'primary', size: '3px' }
      },

      plugins: [
        'Notify',
        'Dialog',
        'Loading',
        'LoadingBar',
        'LocalStorage',
        'SessionStorage'
      ]
    },

    animations: [],

    ssr: {
      pwa: false,
      prodPort: 3000,
      middlewares: [
        'render'
      ]
    },

    pwa: {
      workboxMode: 'generateSW',
      injectPwaMetaTags: true,
      swFilename: 'sw.js',
      manifestFilename: 'manifest.json',
      useCredentialsForManifestTag: false
    },

    cordova: {},
    capacitor: {
      hideSplashscreen: true
    },

    electron: {
      inspectPort: 5858,
      bundler: 'packager',
      builder: {
        appId: 'servai-frontend'
      }
    },

    bex: {
      contentScripts: [
        'my-content-script'
      ]
    }
  };
});
