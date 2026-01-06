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

// In-memory fallback for when Redis is down
const fallbackStore = new Map<string, { count: number; resetAt: number }>();

function cleanupFallbackStore() {
  const now = Date.now();
  for (const [key, value] of fallbackStore.entries()) {
    if (value.resetAt < now) {
      fallbackStore.delete(key);
    }
  }
}

// Cleanup every minute
setInterval(cleanupFallbackStore, 60000);

function fallbackRateLimit(
  identifier: string,
  points: number,
  duration: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  const entry = fallbackStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    fallbackStore.set(key, {
      count: 1,
      resetAt: now + duration * 1000,
    });
    return {
      allowed: true,
      remaining: points - 1,
      resetAt: now + duration * 1000,
    };
  }

  // Increment existing entry
  if (entry.count >= points) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: points - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limiter middleware using Redis with in-memory fallback
 * FIX NEW-001: Now fails safe instead of failing open
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    points,
    duration,
    keyPrefix = 'ratelimit',
    blockDuration = duration,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${identifier}`;

    try {
      // Try Redis first
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
        return next(error);
      }

      // Redis error - use in-memory fallback (FIX NEW-001)
      logger.error('Rate limiter Redis error - using fallback', { error, identifier });
      
      const result = fallbackRateLimit(identifier, points, duration);
      
      if (!result.allowed) {
        res.set('X-RateLimit-Limit', String(points));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(result.resetAt));
        
        return next(
          new AppError(
            `Rate limit exceeded (fallback mode). Maximum ${points} requests per ${duration} seconds.`,
            429
          )
        );
      }

      res.set('X-RateLimit-Limit', String(points));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', String(result.resetAt));
      
      next();
    }
  };
}

/**
 * Global rate limiter (all API endpoints)
 */
export const globalRateLimiter = rateLimit({
  points: 100,    // 100 requests
  duration: 60,   // per minute
  keyPrefix: 'global',
});

/**
 * Auth rate limiter (login, register, etc.)
 */
export const authRateLimiter = rateLimit({
  points: 5,      // 5 attempts
  duration: 900,  // per 15 minutes
  blockDuration: 3600, // Block for 1 hour
  keyPrefix: 'auth',
});
