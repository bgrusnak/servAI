/**
 * User role constants
 * Use these instead of magic strings throughout the application
 */
export const USER_ROLES = Object.freeze({
  SUPER_ADMIN: 'superadmin',
  UK_DIRECTOR: 'uk_director',
  COMPLEX_ADMIN: 'complex_admin',
  ACCOUNTANT: 'accountant',
  EMPLOYEE: 'employee',
  SECURITY_GUARD: 'security_guard',
  RESIDENT: 'resident'
});

/**
 * Role priority for determining primary role
 * Higher index = higher priority
 */
export const ROLE_PRIORITY = Object.freeze([
  USER_ROLES.RESIDENT,
  USER_ROLES.SECURITY_GUARD,
  USER_ROLES.EMPLOYEE,
  USER_ROLES.ACCOUNTANT,
  USER_ROLES.COMPLEX_ADMIN,
  USER_ROLES.UK_DIRECTOR,
  USER_ROLES.SUPER_ADMIN
]);

/**
 * Ticket status constants
 */
export const TICKET_STATUS = Object.freeze({
  NEW: 'new',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  CANCELLED: 'cancelled'
});

/**
 * Ticket priority constants
 */
export const TICKET_PRIORITY = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
  CRITICAL: 'critical'
});

/**
 * File upload constants
 */
export const FILE_UPLOAD = Object.freeze({
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 5,
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB
  
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
});

/**
 * API constants
 */
export const API = Object.freeze({
  TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_QUEUE_SIZE: 50
});

/**
 * Pagination constants
 */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  MAX_PAGE_SIZE: 100
});

/**
 * Date format constants
 */
export const DATE_FORMATS = Object.freeze({
  SHORT: 'dd.MM.yyyy',
  LONG: 'dd MMMM yyyy',
  WITH_TIME: 'dd.MM.yyyy HH:mm',
  TIME_ONLY: 'HH:mm',
  ISO: "yyyy-MM-dd'T'HH:mm:ss"
});

/**
 * Validation constants
 */
export const VALIDATION = Object.freeze({
  EMAIL_MAX_LENGTH: 254,
  EMAIL_LOCAL_PART_MAX_LENGTH: 64,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  PHONE_MIN_LENGTH: 10,
  PHONE_MAX_LENGTH: 15,
  TEXT_MAX_LENGTH: 10000,
  FILENAME_MAX_LENGTH: 255
});

/**
 * UI constants
 */
export const UI = Object.freeze({
  SEARCH_DEBOUNCE: 300,
  AUTOSAVE_DEBOUNCE: 1000,
  NOTIFICATION_DURATION: 5000,
  TOAST_POSITION: 'top-right',
  VIRTUAL_SCROLL_SLICE_SIZE: 50
});

/**
 * Storage keys
 */
export const STORAGE_KEYS = Object.freeze({
  AUTH_TOKEN: 'authToken',
  REFRESH_TOKEN: 'refreshToken',
  REMEMBER_ME: 'rememberMe',
  LANGUAGE: 'language',
  THEME: 'theme',
  TABLE_PREFERENCES: 'tablePreferences'
});

/**
 * Event names for custom events
 */
export const EVENTS = Object.freeze({
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_TOKEN_EXPIRED: 'auth:token-expired',
  NOTIFICATION_NEW: 'notification:new',
  TICKET_UPDATED: 'ticket:updated',
  FILE_UPLOADED: 'file:uploaded'
});

/**
 * HTTP status codes
 */
export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
});

/**
 * Regex patterns
 */
export const PATTERNS = Object.freeze({
  EMAIL: /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  NUMERIC: /^[0-9]+$/,
  ALPHA: /^[a-zA-Z]+$/
});
