import request from 'supertest';
import { app } from '../../src/server';
import { redis } from '../../src/utils/redis';

describe('Rate Limiting Security Tests', () => {
  beforeEach(async () => {
    // Clear rate limit counters
    await redis.flushdb();
  });

  describe('CRIT-003: Public Endpoint Rate Limiting', () => {
    it('should rate limit /api/invites/validate/:token', async () => {
      const token = 'test-token-' + Date.now();
      const requests = [];

      // Make 15 requests (limit is 10 per minute)
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app).get(`/api/invites/validate/${token}`)
        );
      }

      const responses = await Promise.all(requests);

      // First 10 should succeed (200 or 404)
      const firstTen = responses.slice(0, 10);
      firstTen.forEach(res => {
        expect([200, 404]).toContain(res.status);
      });

      // Last 5 should be rate limited (429)
      const lastFive = responses.slice(10);
      lastFive.forEach(res => {
        expect(res.status).toBe(429);
        expect(res.body.error).toContain('Too many requests');
      });
    });

    it('should rate limit /api/invites/accept/:token', async () => {
      const token = 'test-token-' + Date.now();
      const requests = [];

      // Make 10 requests (limit is 5 per 5 minutes)
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post(`/api/invites/accept/${token}`)
            .set('Authorization', 'Bearer fake-token')
        );
      }

      const responses = await Promise.all(requests);

      // First 5 should fail with auth error (401)
      const firstFive = responses.slice(0, 5);
      firstFive.forEach(res => {
        expect(res.status).toBe(401);
      });

      // Last 5 should be rate limited (429)
      const lastFive = responses.slice(5);
      lastFive.forEach(res => {
        expect(res.status).toBe(429);
      });
    });
  });

  describe('Brute Force Protection', () => {
    it('should prevent token enumeration attacks', async () => {
      const possibleTokens = [];
      
      // Generate 20 possible tokens
      for (let i = 0; i < 20; i++) {
        possibleTokens.push('fake-token-' + i);
      }

      const requests = possibleTokens.map(token =>
        request(app).get(`/api/invites/validate/${token}`)
      );

      const responses = await Promise.all(requests);

      // Should get rate limited after 10 attempts
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
