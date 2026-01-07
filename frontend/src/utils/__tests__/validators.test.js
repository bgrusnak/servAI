import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePhone,
  validateUrl,
  required,
  minLength,
  maxLength,
  between,
  numeric,
  getPasswordStrength
} from '../validators';

describe('validators', () => {
  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('user_name@test-domain.com')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@.com')).toBe(false);
      expect(validateEmail('user..name@example.com')).toBe(false);
    });

    it('should reject emails exceeding length limits', () => {
      const longLocal = 'a'.repeat(65) + '@example.com';
      expect(validateEmail(longLocal)).toBe(false);
      
      const longEmail = 'user@' + 'a'.repeat(250) + '.com';
      expect(validateEmail(longEmail)).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(validateEmail(null)).toBe(false);
      expect(validateEmail(undefined)).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should validate international phone numbers', () => {
      expect(validatePhone('+12345678901')).toBe(true);
      expect(validatePhone('+79991234567')).toBe(true);
      expect(validatePhone('+1 (999) 123-4567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(false);
      expect(validatePhone('abc')).toBe(false);
      expect(validatePhone('+0123456789')).toBe(false);
    });

    it('should accept empty (optional)', () => {
      expect(validatePhone('')).toBe(true);
      expect(validatePhone(null)).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('should validate correct URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://test.com/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('javascript:alert(1)')).toBe(false);
      expect(validateUrl('')).toBe(false);
    });
  });

  describe('required', () => {
    it('should pass for non-empty values', () => {
      expect(required('test')).toBe(true);
      expect(required(123)).toBe(true);
      expect(required(true)).toBe(true);
    });

    it('should fail for empty values', () => {
      expect(required('')).toBe('Field is required');
      expect(required(null)).toBe('Field is required');
      expect(required(undefined)).toBe('Field is required');
      expect(required(false)).toBe('Field is required');
      expect(required(0)).toBe('Field is required');
    });

    it('should use custom message', () => {
      expect(required('', 'Custom error')).toBe('Custom error');
    });
  });

  describe('minLength', () => {
    const validator = minLength(5);

    it('should pass for valid length', () => {
      expect(validator('12345')).toBe(true);
      expect(validator('123456')).toBe(true);
    });

    it('should fail for short values', () => {
      const result = validator('123');
      expect(result).toBe('Minimum 5 characters');
    });

    it('should pass for empty (optional)', () => {
      expect(validator('')).toBe(true);
    });
  });

  describe('maxLength', () => {
    const validator = maxLength(10);

    it('should pass for valid length', () => {
      expect(validator('12345')).toBe(true);
      expect(validator('1234567890')).toBe(true);
    });

    it('should fail for long values', () => {
      const result = validator('12345678901');
      expect(result).toBe('Maximum 10 characters');
    });
  });

  describe('between', () => {
    const validator = between(10, 100);

    it('should pass for values in range', () => {
      expect(validator(10)).toBe(true);
      expect(validator(50)).toBe(true);
      expect(validator(100)).toBe(true);
    });

    it('should fail for values out of range', () => {
      const resultLow = validator(5);
      const resultHigh = validator(101);
      expect(resultLow).toContain('between');
      expect(resultHigh).toContain('between');
    });
  });

  describe('numeric', () => {
    const validator = numeric();

    it('should pass for numeric values', () => {
      expect(validator('123')).toBe(true);
      expect(validator('123.45')).toBe(true);
      expect(validator('-123')).toBe(true);
    });

    it('should fail for non-numeric values', () => {
      expect(validator('abc')).toBe('Must be a number');
      expect(validator('123abc')).toBe('Must be a number');
    });
  });

  describe('getPasswordStrength', () => {
    it('should rate weak passwords', () => {
      expect(getPasswordStrength('123').score).toBeLessThan(2);
      expect(getPasswordStrength('password').score).toBeLessThan(3);
    });

    it('should rate strong passwords', () => {
      const result = getPasswordStrength('MyP@ssw0rd123!');
      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.label).toMatch(/good|strong/);
    });

    it('should handle empty password', () => {
      const result = getPasswordStrength('');
      expect(result.score).toBe(0);
      expect(result.label).toBe('weak');
    });
  });
});
