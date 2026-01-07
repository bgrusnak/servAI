import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from './errorHandler';
import { db } from '../db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';
import { authService } from '../services/auth.service';
import { Counter, Gauge } from 'prom-client';

export interface AuthUser {
  id: string;
  email?: string;
  telegram_id?: number;
  roles: {
    role: string;
    company_id?: string;
    condo_id?: string;
  }[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  currentContext?: {
    company_id?: string;
    condo_id?: string;
    role?: string;
  };
}

// Circuit breaker for Redis
let redisFailureCount = 0;
let redisCircuitOpen = false;
let lastRedisCheck = Date.now();
const REDIS_FAILURE_THRESHOLD = 5;
const REDIS_CIRCUIT_TIMEOUT_MS = 30000; // 30 seconds

// Rate limiting for DB fallback
const dbFallbackCounts = new Map<string, { count: number; resetAt: number }>();
const DB_FALLBACK_LIMIT = 100; // Max 100 requests per minute per user
const DB_FALLBACK_WINDOW_MS = 60000; // 1 minute

// Metrics
const authCacheHits = new Counter({
  name: 'auth_cache_hits_total',
  help: 'Number of cache hits for user auth data'
});

const authCacheMisses = new Counter({
  name: 'auth_cache_misses_total',
  help: 'Number of cache misses for user auth data'
});

const authRedisErrors = new Counter({
  name: 'auth_redis_errors_total',
  help: 'Number of Redis errors in auth middleware'
});

const authDbFallbacks = new Counter({
  name: 'auth_db_fallbacks_total',
  help: 'Number of times DB fallback was used'
});

const authContextValidationFailures = new Counter({
  name: 'auth_context_validation_failures_total',
  help: 'Context validation failures',
  labelNames: ['reason']
});

function getCacheKey(userId: string): string {
  return `user:${userId}:auth`;
}

function checkRedisCircuit(): boolean {
  const now = Date.now();
  
  // Reset circuit after timeout
  if (redisCircuitOpen && (now - lastRedisCheck) > REDIS_CIRCUIT_TIMEOUT_MS) {
    redisCircuitOpen = false;
    redisFailureCount = 0;
    logger.info('Redis circuit breaker reset');
  }
  
  return !redisCircuitOpen;
}

function recordRedisFailure(): void {
  redisFailureCount++;
  lastRedisCheck = Date.now();
  
  if (redisFailureCount >= REDIS_FAILURE_THRESHOLD) {
    redisCircuitOpen = true;
    logger.error('Redis circuit breaker opened', {
      failures: redisFailureCount
    });
  }
}

function recordRedisSuccess(): void {
  if (redisFailureCount > 0) {
    redisFailureCount = Math.max(0, redisFailureCount - 1);
  }
}

function checkDbFallbackRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = dbFallbackCounts.get(userId);
  
  if (!userLimit || now > userLimit.resetAt) {
    dbFallbackCounts.set(userId, {
      count: 1,
      resetAt: now + DB_FALLBACK_WINDOW_MS
    });
    return true;
  }
  
  if (userLimit.count >= DB_FALLBACK_LIMIT) {
    logger.warn('DB fallback rate limit exceeded', { userId });
    return false;
  }
  
  userLimit.count++;
  return true;
}

async function getUserFromCache(userId: string): Promise<AuthUser | null> {
  if (!checkRedisCircuit()) {
    logger.debug('Redis circuit open, skipping cache');
    return null;
  }
  
  try {
    const cached = await redis.get(getCacheKey(userId));
    if (cached) {
      recordRedisSuccess();
      authCacheHits.inc();
      logger.debug('User loaded from cache', { userId });
      return JSON.parse(cached);
    }
    authCacheMisses.inc();
  } catch (error) {
    authRedisErrors.inc();
    recordRedisFailure();
    logger.error('Error reading from cache', { error });
  }
  return null;
}

async function setUserInCache(user: AuthUser): Promise<void> {
  if (!checkRedisCircuit()) {
    return;
  }
  
  try {
    await redis.set(
      getCacheKey(user.id),
      JSON.stringify(user),
      CONSTANTS.CACHE_USER_TTL_SECONDS
    );
    recordRedisSuccess();
    logger.debug('User cached', { userId: user.id });
  } catch (error) {
    authRedisErrors.inc();
    recordRedisFailure();
    logger.error('Error writing to cache', { error });
  }
}

/**
 * Invalidate user cache (e.g., after role changes)
 * CRITICAL: Must be called when user roles change
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    await redis.del(getCacheKey(userId));
    logger.info('User cache invalidated', { userId });
  } catch (error) {
    logger.error('Failed to invalidate cache', { error, userId });
  }
}

async function loadUserFromDB(userId: string): Promise<AuthUser | null> {
  // Rate limit DB fallback to prevent DoS
  if (!checkDbFallbackRateLimit(userId)) {
    throw new AppError('Rate limit exceeded', 429);
  }
  
  authDbFallbacks.inc();
  
  // Use FOR SHARE lock for consistent read
  const userResult = await db.query(`
    SELECT 
      u.id,
      u.email,
      u.telegram_id,
      u.is_active,
      COALESCE(
        json_agg(
          json_build_object(
            'role', ur.role,
            'company_id', ur.company_id,
            'condo_id', ur.condo_id
          )
        ) FILTER (WHERE ur.id IS NOT NULL),
        '[]'
      ) as roles
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = true AND ur.deleted_at IS NULL
    WHERE u.id = $1 AND u.deleted_at IS NULL
    GROUP BY u.id
    FOR SHARE
  `, [userId]);

  if (userResult.rows.length === 0) {
    return null;
  }

  const row = userResult.rows[0];

  if (!row.is_active) {
    throw new AppError('Account is disabled', 403);
  }

  const user: AuthUser = {
    id: row.id,
    email: row.email,
    telegram_id: row.telegram_id,
    roles: Array.isArray(row.roles) ? row.roles : [],
  };

  // Cache for future requests
  await setUserInCache(user);

  return user;
}

/**
 * Validate context header against user's roles
 * CRITICAL: Prevents authorization bypass
 */
function validateContext(user: AuthUser, context: any): boolean {
  // Validate context structure
  if (typeof context !== 'object' || context === null) {
    authContextValidationFailures.inc({ reason: 'invalid_type' });
    return false;
  }
  
  // Only allow company_id, condo_id, role fields
  const allowedFields = ['company_id', 'condo_id', 'role'];
  for (const key of Object.keys(context)) {
    if (!allowedFields.includes(key)) {
      authContextValidationFailures.inc({ reason: 'unknown_field' });
      logger.warn('Unknown field in context header', { field: key, userId: user.id });
      return false;
    }
  }
  
  // If company_id specified, check user has access
  if (context.company_id) {
    const hasCompanyAccess = user.roles.some(r => 
      r.company_id === context.company_id
    );
    
    if (!hasCompanyAccess) {
      authContextValidationFailures.inc({ reason: 'no_company_access' });
      logger.warn('User attempted to access unauthorized company', {
        userId: user.id,
        companyId: context.company_id
      });
      return false;
    }
  }
  
  // If condo_id specified, check user has access
  if (context.condo_id) {
    const hasCondoAccess = user.roles.some(r => 
      r.condo_id === context.condo_id
    );
    
    if (!hasCondoAccess) {
      authContextValidationFailures.inc({ reason: 'no_condo_access' });
      logger.warn('User attempted to access unauthorized condo', {
        userId: user.id,
        condoId: context.condo_id
      });
      return false;
    }
  }
  
  return true;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // CHANGED: Read token from httpOnly cookie instead of Authorization header
    const token = req.cookies?.accessToken;
    
    if (!token) {
      // Fallback to Authorization header for API clients (mobile apps, etc.)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const headerToken = authHeader.substring(7);
        // Use header token
        const decoded = authService.verifyAccessToken(headerToken);
        const isRevoked = await authService.isTokenRevoked(decoded.tokenId);
        if (isRevoked) {
          throw new AppError('Token has been revoked', 401);
        }
        
        let user = await getUserFromCache(decoded.userId);
        if (!user) {
          user = await loadUserFromDB(decoded.userId);
        }
        if (!user) {
          throw new AppError('User not found', 401);
        }
        
        req.user = user;
        
        // Validate context header if provided
        const contextHeader = req.headers['x-context'];
        if (contextHeader && typeof contextHeader === 'string') {
          try {
            const context = JSON.parse(contextHeader);
            if (validateContext(user, context)) {
              req.currentContext = context;
            } else {
              throw new AppError('Invalid or unauthorized context', 403);
            }
          } catch (error) {
            if (error instanceof AppError) throw error;
            logger.warn('Invalid context header JSON', { contextHeader });
            throw new AppError('Invalid context header format', 400);
          }
        }
        
        return next();
      }
      
      throw new AppError('Authentication required', 401);
    }
    
    // Verify and decode token from cookie
    const decoded = authService.verifyAccessToken(token);

    // Check if token has been revoked
    const isRevoked = await authService.isTokenRevoked(decoded.tokenId);
    if (isRevoked) {
      throw new AppError('Token has been revoked', 401);
    }

    // Try cache first
    let user = await getUserFromCache(decoded.userId);
    
    // If not in cache, load from DB
    if (!user) {
      user = await loadUserFromDB(decoded.userId);
    }

    if (!user) {
      throw new AppError('User not found', 401);
    }

    req.user = user;

    // Set current context from header if provided
    const contextHeader = req.headers['x-context'];
    if (contextHeader && typeof contextHeader === 'string') {
      try {
        const context = JSON.parse(contextHeader);
        if (validateContext(user, context)) {
          req.currentContext = context;
        } else {
          throw new AppError('Invalid or unauthorized context', 403);
        }
      } catch (error) {
        if (error instanceof AppError) throw error;
        logger.warn('Invalid context header JSON', { contextHeader });
        throw new AppError('Invalid context header format', 400);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const hasRole = req.user.roles.some(r => allowedRoles.includes(r.role));

    if (!hasRole) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

export const requireContext = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.currentContext || (!req.currentContext.company_id && !req.currentContext.condo_id)) {
    return next(new AppError('Context required (company_id or condo_id)', 400));
  }
  next();
};