/**
 * Email validation with improved RFC 5322 compliance
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // More robust RFC 5322 email regex
  const re = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  const trimmed = email.toLowerCase().trim();
  
  // Basic format check
  if (!re.test(trimmed)) return false;
  
  // Length checks
  if (trimmed.length > 254) return false;
  
  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false;
  
  // Domain checks
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  if (domainParts.some(part => !part || part.length > 63)) return false;
  
  return true;
}

/**
 * Password strength calculator
 * Returns: { score: 0-4, label: string, color: string }
 * @param {string} password - Password to check
 * @returns {object} - Strength result
 */
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: 'weak', color: 'grey' };
  
  let score = 0;
  
  // Length
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  
  // Complexity
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  // Cap at 4
  score = Math.min(score, 4);
  
  const labels = ['weak', 'weak', 'fair', 'good', 'strong'];
  const colors = ['negative', 'warning', 'orange', 'positive', 'positive'];
  
  return {
    score,
    label: labels[score],
    color: colors[score]
  };
}

/**
 * Phone number validation (international format)
 * @param {string} phone - Phone to validate
 * @returns {boolean} - True if valid
 */
export function validatePhone(phone) {
  if (!phone) return true; // Optional field
  const re = /^\+?[1-9]\d{1,14}$/;
  return re.test(phone.replace(/[\s()-]/g, ''));
}

/**
 * URL validation
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid
 */
export function validateUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Required field validator
 * @param {any} value - Value to check
 * @param {string} message - Error message
 * @returns {boolean|string} - True or error message
 */
export function required(value, message = 'Field is required') {
  return !!value || message;
}

/**
 * Min length validator
 * @param {number} min - Minimum length
 * @returns {function} - Validator function
 */
export function minLength(min) {
  return (value, message = `Minimum ${min} characters`) => {
    return !value || value.length >= min || message;
  };
}

/**
 * Max length validator
 * @param {number} max - Maximum length
 * @returns {function} - Validator function
 */
export function maxLength(max) {
  return (value, message = `Maximum ${max} characters`) => {
    return !value || value.length <= max || message;
  };
}

/**
 * Number range validator
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {function} - Validator function
 */
export function between(min, max) {
  return (value, message = `Value must be between ${min} and ${max}`) => {
    const num = parseFloat(value);
    return isNaN(num) || (num >= min && num <= max) || message;
  };
}

/**
 * Pattern validator
 * @param {RegExp} pattern - Regex pattern
 * @param {string} message - Error message
 * @returns {function} - Validator function
 */
export function pattern(pattern, message = 'Invalid format') {
  return (value) => {
    return !value || pattern.test(value) || message;
  };
}

/**
 * Numeric validator
 * @param {string} message - Error message
 * @returns {function} - Validator function
 */
export function numeric(message = 'Must be a number') {
  return (value) => {
    return !value || !isNaN(Number(value)) || message;
  };
}

/**
 * Alpha-numeric validator
 * @param {string} message - Error message
 * @returns {function} - Validator function
 */
export function alphanumeric(message = 'Only letters and numbers allowed') {
  return (value) => {
    return !value || /^[a-zA-Z0-9]+$/.test(value) || message;
  };
}
