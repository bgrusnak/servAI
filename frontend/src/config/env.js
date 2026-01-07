/**
 * Environment Configuration and Validation
 * Проверяет наличие и корректность переменных окружения
 */

const REQUIRED_ENV_VARS = [
  'VITE_API_BASE_URL',
  'VITE_APP_NAME',
  'VITE_APP_ENV'
];

const OPTIONAL_ENV_VARS = {
  VITE_API_TIMEOUT: '30000',
  VITE_APP_VERSION: '1.0.0',
  VITE_ENABLE_ANALYTICS: 'false',
  VITE_SENTRY_DSN: '',
  VITE_MAX_FILE_SIZE: '10485760' // 10MB
};

/**
 * Validate environment variables
 * @throws {Error} if required variables are missing
 */
function validateEnv() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!import.meta.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please check your .env file.'
    );
  }

  // Validate API URL format
  try {
    new URL(import.meta.env.VITE_API_BASE_URL);
  } catch (error) {
    throw new Error(
      `Invalid VITE_API_BASE_URL: ${import.meta.env.VITE_API_BASE_URL}. ` +
      'Must be a valid URL.'
    );
  }

  // Check for production-specific requirements
  if (import.meta.env.PROD) {
    const apiUrl = import.meta.env.VITE_API_BASE_URL;
    
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      warnings.push(
        'Production build is using localhost API URL. ' +
        'This will not work in production!'
      );
    }

    if (!apiUrl.startsWith('https://')) {
      warnings.push(
        'Production API URL should use HTTPS for security.'
      );
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('Environment configuration warnings:');
    warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  }
}

/**
 * Get environment variable with fallback
 * @param {string} name - Variable name
 * @param {any} defaultValue - Default value if not set
 * @returns {string}
 */
function getEnv(name, defaultValue = '') {
  return import.meta.env[name] ?? defaultValue;
}

/**
 * Get numeric environment variable
 * @param {string} name - Variable name
 * @param {number} defaultValue - Default value
 * @returns {number}
 */
function getEnvNumber(name, defaultValue = 0) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get boolean environment variable
 * @param {string} name - Variable name
 * @param {boolean} defaultValue - Default value
 * @returns {boolean}
 */
function getEnvBoolean(name, defaultValue = false) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return value === 'true' || value === '1' || value === 'yes';
}

// Validate on module load
validateEnv();

/**
 * Application Configuration
 */
export const config = Object.freeze({
  // Environment
  env: getEnv('VITE_APP_ENV', 'development'),
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  
  // App Info
  appName: getEnv('VITE_APP_NAME', 'ServAI'),
  appVersion: getEnv('VITE_APP_VERSION', '1.0.0'),
  buildTime: __BUILD_TIME__,
  
  // API Configuration
  api: {
    baseUrl: getEnv('VITE_API_BASE_URL'),
    timeout: getEnvNumber('VITE_API_TIMEOUT', 30000),
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  // File Upload
  upload: {
    maxFileSize: getEnvNumber('VITE_MAX_FILE_SIZE', 10485760), // 10MB
    maxFiles: 5,
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  },
  
  // Security
  security: {
    enableCSP: true,
    enableHSTS: isProduction,
    sessionTimeout: 3600000, // 1 hour
    tokenRefreshThreshold: 300000 // 5 minutes
  },
  
  // Features
  features: {
    enableAnalytics: getEnvBoolean('VITE_ENABLE_ANALYTICS', false),
    enableErrorReporting: getEnvBoolean('VITE_ENABLE_ERROR_REPORTING', isProduction),
    enableServiceWorker: isProduction,
    enableWebSocket: true
  },
  
  // Monitoring
  monitoring: {
    sentryDsn: getEnv('VITE_SENTRY_DSN', ''),
    enablePerformanceMonitoring: isProduction
  },
  
  // UI
  ui: {
    defaultTheme: 'light',
    defaultLocale: 'ru',
    supportedLocales: ['ru', 'en'],
    itemsPerPage: 20,
    toastDuration: 5000
  }
});

/**
 * Get full configuration
 * @returns {object}
 */
export function getConfig() {
  return config;
}

/**
 * Check if feature is enabled
 * @param {string} feature - Feature name
 * @returns {boolean}
 */
export function isFeatureEnabled(feature) {
  return config.features[feature] ?? false;
}

/**
 * Get API base URL
 * @returns {string}
 */
export function getApiBaseUrl() {
  return config.api.baseUrl;
}

/**
 * Check if running in development
 * @returns {boolean}
 */
export function isDevelopment() {
  return config.isDevelopment;
}

/**
 * Check if running in production
 * @returns {boolean}
 */
export function isProduction() {
  return config.isProduction;
}

// Export for testing
export const __testing__ = {
  validateEnv,
  getEnv,
  getEnvNumber,
  getEnvBoolean
};

export default config;
