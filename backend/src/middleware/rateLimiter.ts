import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';
import { config } from '../config';

interface RateLimitOptions {
  points: number;      // Number of requests allowed
  duration: number;    // Time window in seconds
  keyPrefix?: string;  // Redis key prefix
  blockDuration?: number; // How long to block after limit (seconds)
  skipSuccessfulRequests?: boolean; // Only count failed requests
}

// CRITICAL: Maximum size for in-memory fallback to prevent OOM
const MAX_FALLBACK_ENTRIES = 10000;

// In-memory fallback for when Redis is down
interface FallbackEntry {
  count: number;
  resetAt: number;
  lastAccess: number; // For LRU eviction
}

const fallbackStore = new Map<string, FallbackEntry>();

function cleanupFallbackStore() {
  const now = Date.now();
  
  // Remove expired entries
  for (const [key, value] of fallbackStore.entries()) {
    if (value.resetAt < now) {
      fallbackStore.delete(key);
    }
  }
  
  // If still over limit, evict LRU entries
  if (fallbackStore.size > MAX_FALLBACK_ENTRIES) {
    const entries = Array.from(fallbackStore.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    
    const toRemove = entries.slice(0, fallbackStore.size - MAX_FALLBACK_ENTRIES);
    toRemove.forEach(([key]) => fallbackStore.delete(key));
    
    logger.warn('Fallback store LRU eviction', {
      removed: toRemove.length,
      remaining: fallbackStore.size
    });
  }
}

// Cleanup more frequently to prevent memory buildup
setInterval(cleanupFallbackStore, 10000); // Every 10 seconds

function fallbackRateLimit(
  identifier: string,
  points: number,
  duration: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  const entry = fallbackStore.get(key);

  // Check if we're at capacity before adding new entries
  if (!entry && fallbackStore.size >= MAX_FALLBACK_ENTRIES) {
    // Force cleanup and evict LRU
    cleanupFallbackStore();
    
    // If still at capacity, deny request (fail-safe)
    if (fallbackStore.size >= MAX_FALLBACK_ENTRIES) {
      logger.error('Fallback store at capacity', { size: fallbackStore.size });
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + duration * 1000,
      };
    }
  }

  if (!entry || entry.resetAt < now) {
    // Create new entry
    fallbackStore.set(key, {
      count: 1,
      resetAt: now + duration * 1000,
      lastAccess: now,
    });
    return {
      allowed: true,
      remaining: points - 1,
      resetAt: now + duration * 1000,
    };
  }

  // Update last access for LRU
  entry.lastAccess = now;

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
 * CRITICAL: Get real client IP address, preventing spoofing
 * Only trust X-Forwarded-For from configured proxies
 */
function getClientIp(req: Request): string {
  // Get trusted proxies from config
  const trustedProxies = config.trustedProxies || [];
  
  // If no trusted proxies, always use socket IP (most secure)
  if (trustedProxies.length === 0) {
    return req.socket.remoteAddress || 'unknown';
  }
  
  // Check if request came from trusted proxy
  const directIp = req.socket.remoteAddress;
  const isTrusted = trustedProxies.some(proxy => {
    if (proxy.includes('/')) {
      // CIDR notation support would go here
      return false; // For now, exact match only
    }
    return directIp === proxy;
  });
  
  if (!isTrusted) {
    // Not from trusted proxy, use socket IP
    return directIp || 'unknown';
  }
  
  // Trusted proxy - check X-Forwarded-For
  const forwardedFor = req.headers['x-forwarded-for'];
  
  if (typeof forwardedFor === 'string') {
    // X-Forwarded-For can be: "client, proxy1, proxy2"
    // Take the leftmost (original client) IP
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    const clientIp = ips[0];
    
    // Validate IP format (basic check)
    if (/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(clientIp)) {
      return clientIp;
    }
    // IPv6 basic check
    if (clientIp.includes(':')) {
      return clientIp;
    }
  }
  
  // Fallback to socket IP
  return directIp || 'unknown';
}

/**
 * Rate limiter middleware using Redis with in-memory fallback
 * FIXED: Now prevents IP spoofing and has memory limits
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    points,
    duration,
    keyPrefix = 'ratelimit',
    blockDuration = duration,
    skipSuccessfulRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // CRITICAL: Get real IP, preventing spoofing
    const clientIp = getClientIp(req);
    const identifier = clientIp;
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
        logger.warn('Rate limit block active', { identifier, ttl, ip: clientIp });
        
        const resetTime = Date.now() + ttl * 1000;
        res.set('X-RateLimit-Reset', String(resetTime));
        res.set('Retry-After', String(ttl));
        
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
          ip: clientIp,
          count,
          limit: points,
          path: req.path,
          method: req.method,
        });

        res.set('X-RateLimit-Limit', String(points));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Date.now() + blockDuration * 1000));
        res.set('Retry-After', String(blockDuration));
        
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

      // Store decrement function for successful requests
      if (skipSuccessfulRequests) {
        res.on('finish', async () => {
          if (res.statusCode < 400) {
            // Success - decrement counter
            try {
              const current = await redis.get(key);
              if (current) {
                const count = parseInt(current);
                if (count > 0) {
                  await redis.decr(key);
                }
              }
            } catch (err) {
              logger.error('Failed to decrement rate limit', { error: err });
            }
          }
        });
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }

      // Redis error - use in-memory fallback
      logger.error('Rate limiter Redis error - using fallback', { 
        error, 
        identifier,
        ip: clientIp 
      });
      
      const result = fallbackRateLimit(identifier, points, duration);
      
      if (!result.allowed) {
        res.set('X-RateLimit-Limit', String(points));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(result.resetAt));
        res.set('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
        
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
 * Account-based rate limiter (by username/email)
 * Prevents distributed brute force attacks
 */
export function accountRateLimit(options: RateLimitOptions) {
  const {
    points,
    duration,
    keyPrefix = 'account-ratelimit',
    blockDuration = duration,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract account identifier from request body
    const account = req.body.email || req.body.username || req.body.phone;
    
    if (!account) {
      // No account identifier, skip this rate limit
      return next();
    }
    
    // Normalize account identifier
    const normalizedAccount = String(account).toLowerCase().trim();
    const key = `${keyPrefix}:${normalizedAccount}`;

    try {
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      // Check if blocked
      const blockKey = `${key}:blocked`;
      const isBlocked = await redis.get(blockKey);
      
      if (isBlocked) {
        const ttl = await redis.ttl(blockKey);
        logger.warn('Account rate limit block active', { account: normalizedAccount, ttl });
        
        res.set('Retry-After', String(ttl));
        throw new AppError(
          `This account is temporarily blocked. Please try again in ${ttl} seconds.`,
          429
        );
      }

      // Check if limit exceeded
      if (count >= points) {
        await redis.set(blockKey, '1', blockDuration);
        
        logger.warn('Account rate limit exceeded', {
          account: normalizedAccount,
          count,
          limit: points,
          path: req.path,
        });

        res.set('Retry-After', String(blockDuration));
        throw new AppError(
          `Too many attempts for this account. Please try again in ${Math.ceil(blockDuration / 60)} minutes.`,
          429
        );
      }

      // Increment counter
      const newCount = count + 1;
      await redis.set(key, String(newCount), duration);

      next();
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }

      // Redis error - fail open for account rate limit (IP rate limit will still apply)
      logger.error('Account rate limiter Redis error', { error, account: normalizedAccount });
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
 * Auth IP rate limiter (login, register, etc.)
 * More lenient to accommodate legitimate retries
 */
export const authRateLimiter = rateLimit({
  points: 10,     // 10 attempts per IP
  duration: 900,  // per 15 minutes
  blockDuration: 3600, // Block for 1 hour
  keyPrefix: 'auth-ip',
  skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Auth account rate limiter
 * Prevents distributed brute force on single account
 */
export const authAccountRateLimiter = accountRateLimit({
  points: 5,      // 5 attempts per account
  duration: 900,  // per 15 minutes
  blockDuration: 3600, // Block for 1 hour
  keyPrefix: 'auth-account',
});

/**
 * Strict auth rate limiter (for sensitive operations)
 * Combine both IP and account limits
 */
export const strictAuthRateLimiter = [
  rateLimit({
    points: 3,      // 3 attempts per IP
    duration: 600,  // per 10 minutes
    blockDuration: 7200, // Block for 2 hours
    keyPrefix: 'strict-auth-ip',
  }),
  accountRateLimit({
    points: 3,      // 3 attempts per account
    duration: 600,  // per 10 minutes
    blockDuration: 7200, // Block for 2 hours
    keyPrefix: 'strict-auth-account',
  }),
];