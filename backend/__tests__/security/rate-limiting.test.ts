import request from 'supertest';
import { app } from '../../src/server';
import { redis } from '../../src/utils/redis';

// Mock Redis for testing
jest.mock('../../src/utils/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    ttl: jest.fn(),
    close: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

describe('Security: Rate Limiting (CRIT-003)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Redis mocks
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  describe('Invite validation endpoint', () => {
    it('should allow 10 requests per minute', async () => {
      let requestCount = 0;
      (redis.get as jest.Mock).mockImplementation(() => {
        requestCount++;
        return Promise.resolve(String(requestCount));
      });

      // Make 10 requests (should succeed)
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .get('/api/v1/invites/validate/test-token');
        
        // First 10 should be allowed
        expect([200, 404]).toContain(response.status); // 404 is OK (invite not found)
      }
    });

    it('should block 11th request in same minute', async () => {
      (redis.get as jest.Mock).mockResolvedValue('11'); // Simulate 11th request

      const response = await request(app)
        .get('/api/v1/invites/validate/test-token');

      expect(response.status).toBe(429); // Too Many Requests
      expect(response.body).toHaveProperty('error');
    });

    it('should set proper rate limit headers', async () => {
      (redis.get as jest.Mock).mockResolvedValue('5');

      const response = await request(app)
        .get('/api/v1/invites/validate/test-token');

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Invite acceptance endpoint', () => {
    it('should allow only 5 requests per 5 minutes', async () => {
      let requestCount = 0;
      (redis.get as jest.Mock).mockImplementation(() => {
        requestCount++;
        return Promise.resolve(String(requestCount));
      });

      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/v1/invites/accept/test-token');
        
        // Should be rate limited or auth error (401), not 429 for first 5
        expect(response.status).not.toBe(429);
      }
    });

    it('should block 6th request', async () => {
      (redis.get as jest.Mock).mockResolvedValue('6');

      const response = await request(app)
        .post('/api/v1/invites/accept/test-token');

      expect(response.status).toBe(429);
    });
  });

  describe('Fallback behavior (FIX NEW-001)', () => {
    it('should use in-memory fallback when Redis fails', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      // First request should succeed (using fallback)
      const response = await request(app)
        .get('/api/v1/invites/validate/test-token');

      // Should get 404 (invite not found) not 503 (service unavailable)
      expect(response.status).not.toBe(503);
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
    });

    it('should enforce limits in fallback mode', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis down'));

      const agent = request.agent(app);

      // Make 11 requests from same IP
      for (let i = 0; i < 11; i++) {
        const response = await agent.get('/api/v1/invites/validate/test-token');
        
        if (i < 10) {
          // First 10 should work
          expect(response.status).not.toBe(429);
        } else {
          // 11th should be rate limited
          expect(response.status).toBe(429);
        }
      }
    });
  });

  describe('Brute-force protection', () => {
    it('should block IP after repeated violations', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce('11') // Exceeds limit
        .mockResolvedValueOnce('1'); // Blocked flag

      (redis.ttl as jest.Mock).mockResolvedValue(300); // 5 min remaining

      const response = await request(app)
        .get('/api/v1/invites/validate/test-token');

      expect(response.status).toBe(429);
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});
