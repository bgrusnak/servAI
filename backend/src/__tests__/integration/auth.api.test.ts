import request from 'supertest';
import { Express } from 'express';
import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { createTestApp } from '../utils/test-app';
import { createTestUser } from '../utils/fixtures';

/**
 * Auth API Integration Tests - REAL HTTP TESTS
 * 
 * These tests use actual HTTP requests through Express router.
 * They test the REAL API, not mocks.
 */
describe('Auth API Integration Tests', () => {
  let app: Express;
  let userRepo: any;

  beforeAll(() => {
    app = createTestApp(testDataSource);
    userRepo = testDataSource.getRepository(User);
  });

  beforeEach(async () => {
    await userRepo.query('TRUNCATE TABLE "users" CASCADE');
    await userRepo.query('TRUNCATE TABLE "refresh_tokens" CASCADE');
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return 201 with user data', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+79001234567',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);  // ✅ EXACT CODE - no more ANY status!

      // Verify response structure
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', userData.email);
      expect(response.body.user).toHaveProperty('firstName', userData.firstName);
      expect(response.body.user).toHaveProperty('lastName', userData.lastName);
      
      // ✅ Tokens should be in cookies, NOT in body
      expect(response.body.accessToken).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
      
      // ✅ Check httpOnly cookies
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.startsWith('accessToken='))).toBe(true);
      expect(cookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
      
      // Verify user was created in database
      const user = await userRepo.findOne({
        where: { email: userData.email },
      });
      
      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe(userData.password); // hashed
    });

    it('should return 400 for weak password (too short)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',  // too short
          firstName: 'Test',
          lastName: 'User',
        })
        .expect('Content-Type', /json/)
        .expect(400);  // ✅ EXACT CODE
      
      // ✅ Verify error message
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/password/i);
      expect(response.body.error).toMatch(/8 characters/i);
    });

    it('should return 400 for password without uppercase', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'lowercase123',  // no uppercase
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
      
      expect(response.body.error).toMatch(/uppercase/i);
    });

    it('should return 400 for password without lowercase', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'UPPERCASE123',  // no lowercase
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
      
      expect(response.body.error).toMatch(/lowercase/i);
    });

    it('should return 400 for password without numbers', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'NoNumbersHere',  // no digits
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);
      
      expect(response.body.error).toMatch(/number|digit/i);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'notanemail',  // invalid
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);

      expect(response.body.error).toMatch(/email/i);
    });

    it('should return 409 for duplicate email', async () => {
      const email = 'duplicate@example.com';
      
      // Create first user
      await createTestUser(userRepo, { email });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(409);  // ✅ Conflict

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          // missing password, firstName, lastName
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);

      expect(response.body.error).toMatch(/email/i);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials and return 200', async () => {
      const password = 'TestPass123!';
      const user = await createTestUser(userRepo, {
        email: 'login@example.com',
        password,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password,
        })
        .expect('Content-Type', /json/)
        .expect(200);  // ✅ EXACT CODE

      // ✅ Should return user data
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(user.email);
      
      // ✅ Tokens in cookies, NOT in body
      expect(response.body.accessToken).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.startsWith('accessToken='))).toBe(true);
      expect(cookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
    });

    it('should return 401 for wrong password', async () => {
      const user = await createTestUser(userRepo, {
        email: 'wrongpass@example.com',
        password: 'CorrectPass123!',
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'WrongPass123!',  // wrong password
        })
        .expect(401);  // ✅ EXACT CODE

      expect(response.body.error).toMatch(/authentication failed|invalid credentials/i);
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePass123!',
        })
        .expect(401);

      expect(response.body.error).toMatch(/authentication failed|invalid credentials/i);
    });

    it('should return 401 for inactive user', async () => {
      const user = await createTestUser(userRepo, {
        email: 'inactive@example.com',
        password: 'TestPass123!',
        isActive: false,  // inactive
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'TestPass123!',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          // missing password
        })
        .expect(400);

      expect(response.body.error).toMatch(/password/i);
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: 'TestPass123!',
          // missing email
        })
        .expect(400);

      expect(response.body.error).toMatch(/email/i);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      // First, login to get refresh token
      const user = await createTestUser(userRepo, {
        email: 'refresh@example.com',
        password: 'TestPass123!',
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'TestPass123!',
        })
        .expect(200);

      // Extract refresh token from cookie
      const cookies = loginResponse.headers['set-cookie'];
      const refreshTokenCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
      
      // Now use refresh token
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);  // ✅ EXACT CODE

      // Should return new tokens in cookies
      const newCookies = response.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      expect(newCookies.some((c: string) => c.startsWith('accessToken='))).toBe(true);
      expect(newCookies.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=invalid-token-12345')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .expect(401);

      expect(response.body.error).toMatch(/refresh token/i);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and clear cookies', async () => {
      // First, login
      const user = await createTestUser(userRepo, {
        email: 'logout@example.com',
        password: 'TestPass123!',
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'TestPass123!',
        });

      const cookies = loginResponse.headers['set-cookie'];
      const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));
      const refreshTokenCookie = cookies.find((c: string) => c.startsWith('refreshToken='));

      // Now logout
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [accessTokenCookie, refreshTokenCookie])
        .expect(200);  // ✅ EXACT CODE

      // Cookies should be cleared
      const logoutCookies = response.headers['set-cookie'];
      if (logoutCookies) {
        const accessCleared = logoutCookies.some((c: string) => 
          c.startsWith('accessToken=') && c.includes('Max-Age=0')
        );
        const refreshCleared = logoutCookies.some((c: string) => 
          c.startsWith('refreshToken=') && c.includes('Max-Age=0')
        );
        expect(accessCleared || refreshCleared).toBe(true);
      }
    });

    it('should return 401 for logout without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user data for authenticated request', async () => {
      const user = await createTestUser(userRepo, {
        email: 'me@example.com',
        password: 'TestPass123!',
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'TestPass123!',
        });

      const cookies = loginResponse.headers['set-cookie'];
      const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', accessTokenCookie)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(user.email);
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });
});
