/**
 * Sanitize email address
 */
export function sanitizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Sanitize text input (remove HTML, trim)
 */
export function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>"']/g, '') // Remove dangerous chars
    .trim();
}

/**
 * Sanitize HTML for display (basic XSS prevention)
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Escape special characters for regex
 */
export function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}
