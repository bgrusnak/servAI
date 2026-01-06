import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/db';
import { sign } from 'jsonwebtoken';
import { config } from '../../src/config';

describe('Security: Authentication & Authorization', () => {
  let validToken: string;
  let expiredToken: string;
  let tamperedToken: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    // Create test user
    const user = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['auth@test.com', 'hash', 'Auth', 'User']
    );
    userId = user.rows[0].id;

    const otherUser = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['other@test.com', 'hash', 'Other', 'User']
    );
    otherUserId = otherUser.rows[0].id;

    // Valid token
    validToken = sign(
      { id: userId, email: 'auth@test.com' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Expired token
    expiredToken = sign(
      { id: userId, email: 'auth@test.com' },
      config.jwt.secret,
      { expiresIn: '-1h' } // Expired 1 hour ago
    );

    // Tampered token (signed with wrong secret)
    tamperedToken = sign(
      { id: userId, email: 'auth@test.com' },
      'wrong_secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id IN ($1, $2)', [userId, otherUserId]);
  });

  describe('JWT Authentication', () => {
    it('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', userId);
    });

    it('should reject expired JWT token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should reject tampered JWT token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('should reject malformed JWT token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer malformed.token.here')
        .expect(401);
    });

    it('should reject missing Authorization header', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should reject Bearer without token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });
  });

  describe('Authorization', () => {
    it('should prevent accessing other user\'s resources', async () => {
      // Create a company owned by otherUser
      const company = await db.query(
        `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        ['Private Company', otherUserId]
      );

      const companyId = company.rows[0].id;

      // User tries to access otherUser's company
      await request(app)
        .get(`/api/v1/companies/${companyId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403); // Forbidden

      // Cleanup
      await db.query('DELETE FROM companies WHERE id = $1', [companyId]);
    });
  });

  describe('Token reuse prevention', () => {
    it('should prevent using revoked refresh token', async () => {
      // Create refresh token
      const refreshToken = await db.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days') RETURNING token`,
        [userId, 'test-refresh-token']
      );

      // Revoke it
      await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
        ['test-refresh-token']
      );

      // Try to use revoked token
      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'test-refresh-token' })
        .expect(401);

      // Cleanup
      await db.query('DELETE FROM refresh_tokens WHERE token = $1', ['test-refresh-token']);
    });
  });
});
