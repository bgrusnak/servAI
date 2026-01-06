import request from 'supertest';
import { app } from '../../src/server';
import { db } from '../../src/db';
import { AuthService } from '../../src/services/auth.service';

describe('SQL Injection Security Tests', () => {
  let adminToken: string;

  beforeAll(async () => {
    // Create admin user
    const hash = await AuthService.hashPassword('Admin123!');
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name) VALUES ('sqladmin@test.com', $1, 'Admin') RETURNING id`,
      [hash]
    );
    const userId = userResult.rows[0].id;

    const tokenPair = await AuthService.createTokenPair(userId);
    adminToken = tokenPair.accessToken;
  });

  afterAll(async () => {
    await db.query("DELETE FROM users WHERE email = 'sqladmin@test.com'");
  });

  describe('SQL Injection Attempts', () => {
    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "1' UNION SELECT NULL, NULL, NULL--",
      "admin'--",
      "' OR 1=1--",
      "\" OR \"1\"=\"1",
      "1; UPDATE users SET password_hash='hacked'--",
    ];

    it('should reject SQL injection in invite validation', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get(`/api/invites/validate/${encodeURIComponent(payload)}`);

        // Should return 404 (not found), not 500 (error) or 200 (success)
        expect(response.status).toBe(404);
        expect(response.body.error).not.toContain('syntax error');
      }
    });

    it('should reject SQL injection in query parameters', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/residents')
          .query({ unit_id: payload })
          .set('Authorization', `Bearer ${adminToken}`);

        // Should return 400 (bad request) or 404, not expose database errors
        expect([400, 404]).toContain(response.status);
        expect(response.body.error).not.toContain('syntax');
        expect(response.body.error).not.toContain('pg');
      }
    });

    it('should parameterize all database queries', async () => {
      // Test that even valid SQL syntax is treated as data, not code
      const payload = "'; SELECT * FROM users WHERE '1'='1";
      
      const response = await request(app)
        .get(`/api/invites/validate/${encodeURIComponent(payload)}`);

      // Should treat as a literal token value (not found)
      expect(response.status).toBe(404);
      expect(response.body.reason).toBe('Invite not found');
    });
  });

  describe('Database Error Handling', () => {
    it('should not expose database errors to client', async () => {
      const response = await request(app)
        .get('/api/invites/validate/will-cause-error');

      if (response.status === 500) {
        expect(response.body.error).not.toContain('pg');
        expect(response.body.error).not.toContain('postgres');
        expect(response.body.error).not.toContain('SQL');
        expect(response.body.error).not.toContain('query');
      }
    });
  });
});
