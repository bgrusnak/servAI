import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  points: number;      // Number of requests allowed
  duration: number;    // Time window in seconds
  keyPrefix?: string;  // Redis key prefix
  blockDuration?: number; // How long to block after limit (seconds)
}

/**
 * Rate limiter middleware using Redis
 * Can be applied globally or per-route
 */
export function rateLimiter(options: RateLimitOptions) {
  const {
    points,
    duration,
    keyPrefix = 'ratelimit',
    blockDuration = duration,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use IP as identifier (could also use user ID if authenticated)
      const identifier = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${keyPrefix}:${identifier}`;

      // Get current count
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      // Check if blocked
      const blockKey = `${key}:blocked`;
      const isBlocked = await redis.get(blockKey);
      
      if (isBlocked) {
        const ttl = await redis.ttl(blockKey);
        logger.warn('Rate limit block active', { identifier, ttl });
        
        res.set('X-RateLimit-Reset', String(Date.now() + ttl * 1000));
        throw new AppError(
          `Too many requests. Please try again in ${ttl} seconds.`,
          429
        );
      }

      // Check if limit exceeded
      if (count >= points) {
        // Set block
        await redis.set(blockKey, '1', blockDuration);
        
        logger.warn('Rate limit exceeded', {
          identifier,
          count,
          limit: points,
          path: req.path,
        });

        res.set('X-RateLimit-Limit', String(points));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Date.now() + blockDuration * 1000));
        
        throw new AppError(
          `Rate limit exceeded. Maximum ${points} requests per ${duration} seconds.`,
          429
        );
      }

      // Increment counter
      const newCount = count + 1;
      await redis.set(key, String(newCount), duration);

      // Set rate limit headers
      res.set('X-RateLimit-Limit', String(points));
      res.set('X-RateLimit-Remaining', String(points - newCount));
      res.set('X-RateLimit-Reset', String(Date.now() + duration * 1000));

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error('Rate limiter error', { error });
        // If Redis fails, allow request through (fail open)
        next();
      }
    }
  };
}

/**
 * Global rate limiter (all API endpoints)
 */
export const globalRateLimiter = rateLimiter({
  points: 100,    // 100 requests
  duration: 60,   // per minute
  keyPrefix: 'global',
});

/**
 * Auth rate limiter (login, register, etc.)
 */
export const authRateLimiter = rateLimiter({
  points: 5,      // 5 attempts
  duration: 900,  // per 15 minutes
  blockDuration: 3600, // Block for 1 hour
  keyPrefix: 'auth',
});
