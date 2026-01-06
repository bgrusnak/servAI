import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { config } from '../config';
import { redis } from '../utils/redis';
import { CONSTANTS } from '../config/constants';

// API rate limiter with Redis store
export const rateLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_API_WINDOW_MS,
  max: CONSTANTS.RATE_LIMIT_API_MAX,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - rate-limit-redis typing issue
    client: redis.getClient(),
    prefix: 'rl:api:',
  }),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/ready';
  },
});

// Stricter rate limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_AUTH_WINDOW_MS,
  max: CONSTANTS.RATE_LIMIT_AUTH_MAX,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - rate-limit-redis typing issue
    client: redis.getClient(),
    prefix: 'rl:auth:',
  }),
  skipSuccessfulRequests: true, // Don't count successful logins
});
