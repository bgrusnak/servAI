import { describe, it, expect, beforeAll } from 'vitest';
import {
  sanitizeEmail,
  sanitizeText,
  sanitizeFilename,
  sanitizeUrl,
  sanitizePhone,
  sanitizeNumber,
  removeControlCharacters
} from '../sanitize';

// Mock DOMPurify
beforeAll(() => {
  global.DOMPurify = {
    sanitize: (html) => html.replace(/<script.*?<\/script>/gi, '')
  };
});

describe('sanitize', () => {
  describe('sanitizeEmail', () => {
    it('should normalize email', () => {
      expect(sanitizeEmail('  User@Example.COM  ')).toBe('user@example.com');
      expect(sanitizeEmail('Test@Test.com')).toBe('test@test.com');
    });

    it('should throw on invalid email', () => {
      expect(() => sanitizeEmail('invalid')).toThrow();
      expect(() => sanitizeEmail('@example.com')).toThrow();
    });

    it('should handle empty input', () => {
      expect(sanitizeEmail('')).toBe('');
      expect(sanitizeEmail(null)).toBe('');
    });
  });

  describe('sanitizeText', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
      expect(sanitizeText('<script>alert(1)</script>Test')).toBe('Test');
    });

    it('should remove javascript: protocol', () => {
      const result = sanitizeText('javascript:alert(1)');
      expect(result).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const result = sanitizeText('onclick=alert(1)');
      expect(result).not.toContain('onclick=');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(20000);
      const result = sanitizeText(long, 1000);
      expect(result.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('sanitizeFilename', () => {
    it('should replace invalid characters', () => {
      expect(sanitizeFilename('file<>name.txt')).toBe('file__name.txt');
      expect(sanitizeFilename('file:name?.txt')).toBe('file_name_.txt');
    });

    it('should prevent path traversal', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('........etcpasswd');
      expect(sanitizeFilename('..\\windows\\system32')).toBe('..windowssystem32');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('...file.txt')).toBe('file.txt');
    });

    it('should limit length', () => {
      const long = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(long);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow http and https', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
      expect(sanitizeUrl('http://test.com')).toBe('http://test.com/');
    });

    it('should block dangerous protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeUrl('not-a-url')).toBe('');
      expect(sanitizeUrl('')).toBe('');
    });
  });

  describe('sanitizePhone', () => {
    it('should keep only digits and +', () => {
      expect(sanitizePhone('+1 (999) 123-4567')).toBe('+19991234567');
      expect(sanitizePhone('123-456-7890')).toBe('1234567890');
    });

    it('should handle multiple + signs', () => {
      const result = sanitizePhone('+1+999');
      expect(result).toBe('+1999');
    });
  });

  describe('sanitizeNumber', () => {
    it('should parse numbers', () => {
      expect(sanitizeNumber('123')).toBe(123);
      expect(sanitizeNumber('123.45')).toBe(123.45);
    });

    it('should apply min/max', () => {
      expect(sanitizeNumber('5', { min: 10 })).toBe(10);
      expect(sanitizeNumber('100', { max: 50 })).toBe(50);
    });

    it('should handle decimals', () => {
      expect(sanitizeNumber('123.456', { decimals: 2 })).toBe(123.46);
    });

    it('should return null for invalid', () => {
      expect(sanitizeNumber('abc')).toBe(null);
      expect(sanitizeNumber('')).toBe(null);
    });
  });

  describe('removeControlCharacters', () => {
    it('should remove null bytes', () => {
      const result = removeControlCharacters('test\x00evil');
      expect(result).toBe('testevil');
    });

    it('should keep newlines and tabs', () => {
      const result = removeControlCharacters('line1\nline2\ttab');
      expect(result).toContain('\n');
      expect(result).toContain('\t');
    });
  });
});
