import { logger } from './logger';

/**
 * Sanitize user input from Telegram
 * Prevents XSS, SQL injection, and other attacks
 */

const DANGEROUS_CHARS_REGEX = /[<>"'`\\;]/g;
const SQL_KEYWORDS_REGEX = /(DROP|DELETE|INSERT|UPDATE|SELECT|UNION|EXEC|EXECUTE|SCRIPT)/gi;

/**
 * Sanitize name from Telegram user
 */
export function sanitizeTelegramName(name: string | undefined, fallback: string): string {
  if (!name || typeof name !== 'string') {
    return fallback;
  }

  // Remove dangerous characters
  let clean = name
    .replace(DANGEROUS_CHARS_REGEX, '')  // Remove HTML/SQL dangerous chars
    .replace(SQL_KEYWORDS_REGEX, '')     // Remove SQL keywords
    .replace(/\s+/g, ' ')                 // Normalize whitespace
    .trim()
    .substring(0, 100);                   // Limit length

  // Ensure not empty after sanitization
  if (!clean) {
    logger.warn('Name sanitized to empty string', { original: name });
    return fallback;
  }

  // Log if significant changes were made
  if (clean !== name) {
    logger.info('Name sanitized', {
      original: name.substring(0, 50),
      sanitized: clean.substring(0, 50),
      removed: name.length - clean.length
    });
  }

  return clean;
}

/**
 * Sanitize username (more restrictive)
 */
export function sanitizeTelegramUsername(username: string | undefined): string | null {
  if (!username || typeof username !== 'string') {
    return null;
  }

  // Telegram usernames can only contain a-z, 0-9, and underscores
  const clean = username
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .substring(0, 32);  // Telegram max username length

  return clean || null;
}

/**
 * Validate and sanitize message text
 */
export function sanitizeMessageText(text: string | undefined, maxLength: number = 4096): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Remove null bytes and control characters (except newlines and tabs)
  let clean = text
    .replace(/\0/g, '')  // Null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Control chars
    .trim();

  // Check length
  if (clean.length === 0) {
    return null;
  }

  if (clean.length > maxLength) {
    logger.warn('Message too long', {
      length: clean.length,
      maxLength,
      truncated: true
    });
    clean = clean.substring(0, maxLength);
  }

  return clean;
}

/**
 * Hash telegram ID for email (non-reversible)
 */
export function hashTelegramId(telegramId: number): string {
  const crypto = require('crypto');
  
  const salt = process.env.TELEGRAM_ID_SALT || 'default_salt_change_me';
  
  if (salt === 'default_salt_change_me') {
    logger.warn('Using default TELEGRAM_ID_SALT - set env var!');
  }
  
  const hash = crypto
    .createHash('sha256')
    .update(`${telegramId}:${salt}`)
    .digest('hex')
    .substring(0, 16);

  return hash;
}

/**
 * Validate telegram ID format
 */
export function isValidTelegramId(id: any): boolean {
  return typeof id === 'number' && id > 0 && Number.isInteger(id);
}
