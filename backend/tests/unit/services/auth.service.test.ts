import { AuthService } from '../../../src/services/auth.service';
import { db } from '../../../src/db';
import { redis } from '../../../src/utils/redis';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
  describe('validatePassword', () => {
    it('should accept valid password', () => {
      expect(() => AuthService.validatePassword('ValidPass123!')).not.toThrow();
    });

    it('should reject password shorter than 8 characters', () => {
      expect(() => AuthService.validatePassword('Short1!')).toThrow('at least 8 characters');
    });

    it('should reject password without uppercase', () => {
      expect(() => AuthService.validatePassword('lowercase123!')).toThrow('uppercase letter');
    });

    it('should reject password without lowercase', () => {
      expect(() => AuthService.validatePassword('UPPERCASE123!')).toThrow('lowercase letter');
    });

    it('should reject password without number', () => {
      expect(() => AuthService.validatePassword('NoNumbers!')).toThrow('number');
    });
  });

  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthService.hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await AuthService.hashPassword(password);
      const hash2 = await AuthService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthService.hashPassword(password);
      
      const isValid = await AuthService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await AuthService.hashPassword(password);
      
      const isValid = await AuthService.verifyPassword('WrongPassword!', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate valid JWT', () => {
      const userId = 'test-user-id';
      const tokenId = 'test-token-id';
      
      const token = AuthService.generateAccessToken(userId, tokenId);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should encode userId and tokenId in payload', () => {
      const userId = 'test-user-id';
      const tokenId = 'test-token-id';
      
      const token = AuthService.generateAccessToken(userId, tokenId);
      const decoded = AuthService.verifyAccessToken(token);
      
      expect(decoded.userId).toBe(userId);
      expect(decoded.tokenId).toBe(tokenId);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid token', () => {
      const userId = 'test-user-id';
      const tokenId = 'test-token-id';
      
      const token = AuthService.generateAccessToken(userId, tokenId);
      const decoded = AuthService.verifyAccessToken(token);
      
      expect(decoded.userId).toBe(userId);
      expect(decoded.tokenId).toBe(tokenId);
    });

    it('should reject invalid token', () => {
      expect(() => AuthService.verifyAccessToken('invalid.token.here')).toThrow('Invalid or expired');
    });

    it('should reject tampered token', () => {
      const userId = 'test-user-id';
      const tokenId = 'test-token-id';
      
      const token = AuthService.generateAccessToken(userId, tokenId);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      
      expect(() => AuthService.verifyAccessToken(tamperedToken)).toThrow();
    });
  });
});
