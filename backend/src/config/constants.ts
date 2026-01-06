// Application constants with environment variable overrides

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value.toLowerCase() === 'true' : defaultValue;
}

export const CONSTANTS = {
  // Database
  DB_SLOW_QUERY_THRESHOLD_MS: getEnvInt('DB_SLOW_QUERY_THRESHOLD_MS', 1000),
  DB_CLIENT_TIMEOUT_MS: getEnvInt('DB_CLIENT_TIMEOUT_MS', 30000),
  DB_ADVISORY_LOCK_ID: 1234567890, // For migration locking

  // Cache TTL (seconds)
  CACHE_USER_TTL_SECONDS: getEnvInt('CACHE_USER_TTL_SECONDS', 300), // 5 minutes
  CACHE_ROLES_TTL_SECONDS: getEnvInt('CACHE_ROLES_TTL_SECONDS', 300),
  CACHE_REFRESH_TOKEN_TTL_SECONDS: getEnvInt('CACHE_REFRESH_TOKEN_TTL_SECONDS', 604800), // 7 days
  
  // Rate limiting
  RATE_LIMIT_AUTH_WINDOW_MS: getEnvInt('RATE_LIMIT_AUTH_WINDOW_MS', 900000), // 15 minutes
  RATE_LIMIT_AUTH_MAX: getEnvInt('RATE_LIMIT_AUTH_MAX', 5), // 5 login attempts per 15 min
  RATE_LIMIT_API_WINDOW_MS: getEnvInt('RATE_LIMIT_API_WINDOW_MS', 60000), // 1 minute
  RATE_LIMIT_API_MAX: getEnvInt('RATE_LIMIT_API_MAX', 100),
  RATE_LIMIT_REFRESH_PER_USER_MAX: getEnvInt('RATE_LIMIT_REFRESH_PER_USER_MAX', 10), // 10 refreshes per minute per user
  
  // Token TTL
  JWT_ACCESS_TOKEN_TTL: process.env.JWT_ACCESS_TOKEN_TTL || '15m',
  JWT_REFRESH_TOKEN_TTL_DAYS: getEnvInt('JWT_REFRESH_TOKEN_TTL_DAYS', 7),
  JWT_REFRESH_TOKEN_ROTATION: getEnvBool('JWT_REFRESH_TOKEN_ROTATION', true),
  
  // Invite defaults
  INVITE_DEFAULT_TTL_DAYS: getEnvInt('INVITE_DEFAULT_TTL_DAYS', 7),
  INVITE_MAX_USES_DEFAULT: null, // unlimited
  
  // Cleanup retention (days)
  TELEGRAM_MESSAGES_RETENTION_DAYS: getEnvInt('TELEGRAM_MESSAGES_RETENTION_DAYS', 365),
  REFRESH_TOKENS_RETENTION_DAYS: getEnvInt('REFRESH_TOKENS_RETENTION_DAYS', 30), // Keep revoked tokens for audit
  CLEANUP_BATCH_SIZE: getEnvInt('CLEANUP_BATCH_SIZE', 1000), // Records per batch
  
  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // File uploads
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_MIME_TYPES: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  
  // Password validation
  PASSWORD_MIN_LENGTH: getEnvInt('PASSWORD_MIN_LENGTH', 8),
  PASSWORD_REQUIRE_UPPERCASE: getEnvBool('PASSWORD_REQUIRE_UPPERCASE', true),
  PASSWORD_REQUIRE_LOWERCASE: getEnvBool('PASSWORD_REQUIRE_LOWERCASE', true),
  PASSWORD_REQUIRE_NUMBER: getEnvBool('PASSWORD_REQUIRE_NUMBER', true),
  PASSWORD_REQUIRE_SPECIAL: getEnvBool('PASSWORD_REQUIRE_SPECIAL', false),
};
