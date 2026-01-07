import DOMPurify from 'dompurify';

/**
 * Sanitize and validate email address
 * @param {string} email - Email to sanitize
 * @returns {string} - Sanitized email or empty string if invalid
 */
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  
  const trimmed = email.trim().toLowerCase();
  
  // RFC 5322 compliant email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(trimmed)) {
    throw new Error('Invalid email format');
  }
  
  // Additional length checks
  if (trimmed.length > 254) {
    throw new Error('Email too long');
  }
  
  const [localPart, domain] = trimmed.split('@');
  if (localPart.length > 64) {
    throw new Error('Email local part too long');
  }
  
  return trimmed;
}

/**
 * Sanitize text input (remove HTML, trim, prevent XSS)
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text, maxLength = 10000) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove all HTML tags and dangerous characters
  const sanitized = text
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
  
  // Limit length to prevent DoS
  return sanitized.slice(0, maxLength);
}

/**
 * Sanitize HTML for safe display using DOMPurify
 * @param {string} html - HTML to sanitize
 * @param {object} config - DOMPurify configuration
 * @returns {string} - Sanitized HTML safe for innerHTML
 */
export function sanitizeHtml(html, config = {}) {
  if (!html || typeof html !== 'string') return '';
  
  const defaultConfig = {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
    FORCE_BODY: true,
    SANITIZE_DOM: true,
    ...config
  };
  
  // Use DOMPurify for proper XSS protection
  return DOMPurify.sanitize(html, defaultConfig);
}

/**
 * Sanitize HTML with more permissive settings for rich text editors
 * @param {string} html - HTML to sanitize
 * @returns {string} - Sanitized HTML
 */
export function sanitizeRichText(html) {
  if (!html || typeof html !== 'string') return '';
  
  const config = {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'b', 'i', 'em', 'strong', 'u', 's', 'strike',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'class', 'id',
      'colspan', 'rowspan'
    ],
    ALLOW_DATA_ATTR: false,
    ADD_TAGS: [],
    ADD_ATTR: [],
    FORCE_BODY: true
  };
  
  return DOMPurify.sanitize(html, config);
}

/**
 * Escape special characters for regex
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
export function escapeRegex(string) {
  if (!string || typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize filename to prevent path traversal and malicious files
 * @param {string} filename - Filename to sanitize
 * @returns {string} - Safe filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') return 'file';
  
  return filename
    .replace(/[\/\\]/g, '') // Remove path separators
    .replace(/\.\.+/g, '.') // Remove parent directory references
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Only allow safe characters
    .replace(/_{2,}/g, '_') // Collapse multiple underscores
    .replace(/^[._]+/, '') // Remove leading dots/underscores
    .slice(0, 255); // Limit length
}

/**
 * Sanitize and validate URL with protocol whitelist
 * @param {string} url - URL to sanitize
 * @param {string[]} allowedProtocols - Allowed URL protocols
 * @returns {string} - Safe URL or empty string if invalid
 */
export function sanitizeUrl(url, allowedProtocols = ['http:', 'https:']) {
  if (!url || typeof url !== 'string') return '';
  
  try {
    const parsed = new URL(url.trim());
    
    // Check protocol whitelist
    if (!allowedProtocols.includes(parsed.protocol)) {
      console.warn(`Blocked URL with protocol: ${parsed.protocol}`);
      return '';
    }
    
    // Block known dangerous patterns
    const dangerous = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'about:'
    ];
    
    const urlLower = url.toLowerCase();
    if (dangerous.some(pattern => urlLower.includes(pattern))) {
      console.warn('Blocked dangerous URL pattern');
      return '';
    }
    
    return parsed.toString();
  } catch (error) {
    console.warn('Invalid URL:', error.message);
    return '';
  }
}

/**
 * Sanitize phone number to digits only with optional + prefix
 * @param {string} phone - Phone number to sanitize
 * @returns {string} - Sanitized phone
 */
export function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^0-9+]/g, '');
  
  // Ensure + is only at the start
  if (cleaned.includes('+')) {
    const parts = cleaned.split('+');
    return '+' + parts.filter(Boolean).join('');
  }
  
  return cleaned;
}

/**
 * Sanitize numeric input
 * @param {any} value - Value to sanitize
 * @param {object} options - Options (min, max, decimals)
 * @returns {number|null} - Sanitized number or null if invalid
 */
export function sanitizeNumber(value, options = {}) {
  const { min, max, decimals } = options;
  
  if (value === null || value === undefined || value === '') return null;
  
  const num = Number(value);
  
  if (isNaN(num) || !isFinite(num)) return null;
  
  let result = num;
  
  if (typeof min === 'number' && result < min) result = min;
  if (typeof max === 'number' && result > max) result = max;
  
  if (typeof decimals === 'number' && decimals >= 0) {
    result = Math.round(result * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  
  return result;
}

/**
 * Remove null bytes and control characters
 * @param {string} str - String to clean
 * @returns {string} - Cleaned string
 */
export function removeControlCharacters(str) {
  if (!str || typeof str !== 'string') return '';
  
  // Remove null bytes, control characters except newlines/tabs
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize object keys and values recursively
 * @param {object} obj - Object to sanitize
 * @param {number} depth - Current recursion depth
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {object} - Sanitized object
 */
export function sanitizeObject(obj, depth = 0, maxDepth = 10) {
  if (depth > maxDepth) {
    console.warn('Maximum sanitization depth reached');
    return {};
  }
  
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1, maxDepth));
  }
  
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = sanitizeText(key, 1000);
    
    if (typeof value === 'string') {
      sanitized[cleanKey] = sanitizeText(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[cleanKey] = sanitizeObject(value, depth + 1, maxDepth);
    } else {
      sanitized[cleanKey] = value;
    }
  }
  
  return sanitized;
}
