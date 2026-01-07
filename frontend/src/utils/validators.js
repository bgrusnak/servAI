/**
 * Email validation with RFC 5322 compliance
 */
export function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.toLowerCase());
}

/**
 * Password strength calculator
 * Returns: { score: 0-4, label: string, color: string }
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
 */
export function validatePhone(phone) {
  if (!phone) return true; // Optional field
  const re = /^\+?[1-9]\d{1,14}$/;
  return re.test(phone.replace(/[\s()-]/g, ''));
}

/**
 * URL validation
 */
export function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Required field
 */
export function required(value, message = 'Field is required') {
  return !!value || message;
}

/**
 * Min length
 */
export function minLength(min) {
  return (value, message = `Minimum ${min} characters`) => {
    return !value || value.length >= min || message;
  };
}

/**
 * Max length
 */
export function maxLength(max) {
  return (value, message = `Maximum ${max} characters`) => {
    return !value || value.length <= max || message;
  };
}

/**
 * Number range
 */
export function between(min, max) {
  return (value, message = `Value must be between ${min} and ${max}`) => {
    const num = parseFloat(value);
    return isNaN(num) || (num >= min && num <= max) || message;
  };
}
