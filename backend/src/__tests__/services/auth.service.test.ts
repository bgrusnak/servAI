import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { RefreshToken } from '../../entities/RefreshToken';
import { createTestUser } from '../utils/fixtures';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

describe('Auth Service Tests', () => {
  let userRepo: any;
  let refreshTokenRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    refreshTokenRepo = testDataSource.getRepository(RefreshToken);
  });

  describe('User Registration', () => {
    it('should create a new user with hashed password', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const user = await createTestUser(userRepo, userData);

      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(userData.password);
      
      // Verify password is hashed correctly
      const isMatch = await bcrypt.compare(userData.password, user.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('should not allow duplicate emails', async () => {
      const email = 'duplicate@example.com';
      await createTestUser(userRepo, { email });

      await expect(
        createTestUser(userRepo, { email })
      ).rejects.toThrow();
    });

    it('should set default values for new user', async () => {
      const user = await createTestUser(userRepo, {
        email: 'defaults@example.com',
      });

      expect(user.isActive).toBe(true);
      expect(user.emailVerified).toBe(true);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });
  });

  describe('User Login', () => {
    it('should authenticate user with correct credentials', async () => {
      const password = 'CorrectPass123!';
      const user = await createTestUser(userRepo, {
        email: 'login@example.com',
        password,
      });

      const foundUser = await userRepo.findOne({
        where: { email: user.email },
      });

      expect(foundUser).toBeDefined();
      const isMatch = await bcrypt.compare(password, foundUser.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('should fail authentication with wrong password', async () => {
      const user = await createTestUser(userRepo, {
        email: 'wrongpass@example.com',
        password: 'CorrectPass123!',
      });

      const isMatch = await bcrypt.compare('WrongPass123!', user.passwordHash);
      expect(isMatch).toBe(false);
    });

    it('should not authenticate inactive user', async () => {
      const user = await createTestUser(userRepo, {
        email: 'inactive@example.com',
        isActive: false,
      });

      expect(user.isActive).toBe(false);
    });
  });

  describe('JWT Tokens', () => {
    it('should generate valid access token', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const secret = process.env.JWT_SECRET || 'test-secret';
      const token = jwt.sign(payload, secret, { expiresIn: '15m' });

      const decoded = jwt.verify(token, secret) as any;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    it('should create refresh token in database', async () => {
      const user = await createTestUser(userRepo, {
        email: 'refresh@example.com',
      });

      const refreshToken = refreshTokenRepo.create({
        userId: user.id,
        token: 'refresh-token-' + Date.now(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      const saved = await refreshTokenRepo.save(refreshToken);

      expect(saved.id).toBeDefined();
      expect(saved.userId).toBe(user.id);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should not allow duplicate refresh tokens', async () => {
      const token = 'unique-token-' + Date.now();
      const user = await createTestUser(userRepo);

      await refreshTokenRepo.save({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await expect(
        refreshTokenRepo.save({
          userId: user.id,
          token, // same token
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });
  });

  describe('Email Verification', () => {
    it('should mark user as verified', async () => {
      const user = await createTestUser(userRepo, {
        email: 'verify@example.com',
        emailVerified: false,
      });

      expect(user.emailVerified).toBe(false);

      user.emailVerified = true;
      const updated = await userRepo.save(user);

      expect(updated.emailVerified).toBe(true);
    });
  });
});
