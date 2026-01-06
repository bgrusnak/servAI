// Application constants
export const CONSTANTS = {
  // Database
  DB_SLOW_QUERY_THRESHOLD_MS: 1000,
  DB_CLIENT_TIMEOUT_MS: 30000,
  DB_ADVISORY_LOCK_ID: 1234567890, // For migration locking

  // Cache TTL
  CACHE_USER_TTL_SECONDS: 300, // 5 minutes
  CACHE_ROLES_TTL_SECONDS: 300,
  
  // Rate limiting
  RATE_LIMIT_AUTH_WINDOW_MS: 900000, // 15 minutes
  RATE_LIMIT_AUTH_MAX: 5, // 5 login attempts per 15 min
  RATE_LIMIT_API_WINDOW_MS: 60000, // 1 minute
  RATE_LIMIT_API_MAX: 100,
  
  // Token TTL
  JWT_ACCESS_TOKEN_TTL: '15m',
  JWT_REFRESH_TOKEN_TTL: '7d',
  
  // Invite defaults
  INVITE_DEFAULT_TTL_DAYS: 7,
  INVITE_MAX_USES_DEFAULT: null, // unlimited
  
  // Cleanup retention
  TELEGRAM_MESSAGES_RETENTION_DAYS: 365,
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // File uploads
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_MIME_TYPES: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};
