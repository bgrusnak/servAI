import { Request, Response, NextFunction } from 'express';
import { rateLimit } from '../../../src/middleware/rateLimiter';
import { redis } from '../../../src/utils/redis';
import { AppError } from '../../../src/middleware/errorHandler';

jest.mock('../../../src/utils/redis');
jest.mock('../../../src/utils/logger');

describe('RateLimiter Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      ip: '127.0.0.1',
      path: '/api/test',
      headers: {},
    };

    mockRes = {
      set: jest.fn(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('Redis-based rate limiting', () => {
    it('should allow requests within limit', async () => {
      (redis.get as jest.Mock).mockResolvedValue('5');
      (redis.set as jest.Mock).mockResolvedValue('OK');
      (redis.ttl as jest.Mock).mockResolvedValue(60);

      const limiter = rateLimit({ points: 10, duration: 60 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('should block requests exceeding limit', async () => {
      (redis.get as jest.Mock).mockResolvedValue('10');
      (redis.set as jest.Mock).mockResolvedValue('OK');

      const limiter = rateLimit({ points: 10, duration: 60 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      const error = (mockNext as jest.Mock).mock.calls[0][0];
      expect(error.statusCode).toBe(429);
    });

    it('should respect blocking period', async () => {
      (redis.get as jest.Mock)
        .mockResolvedValueOnce('0') // count
        .mockResolvedValueOnce('1'); // blocked flag
      (redis.ttl as jest.Mock).mockResolvedValue(300);

      const limiter = rateLimit({ points: 10, duration: 60 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
  });

  describe('Fallback rate limiting (FIX NEW-001)', () => {
    it('should use in-memory fallback when Redis fails', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      const limiter = rateLimit({ points: 10, duration: 60 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      // Should not throw, should use fallback
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    });

    it('should enforce limits in fallback mode', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis down'));

      const limiter = rateLimit({ points: 3, duration: 60 });

      // Make 3 requests (should succeed)
      for (let i = 0; i < 3; i++) {
        jest.clearAllMocks();
        await limiter(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
      }

      // 4th request should be blocked
      jest.clearAllMocks();
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('Rate limit headers', () => {
    it('should set correct rate limit headers', async () => {
      (redis.get as jest.Mock).mockResolvedValue('3');
      (redis.set as jest.Mock).mockResolvedValue('OK');

      const limiter = rateLimit({ points: 10, duration: 60 });
      await limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '6');
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
  });
});
