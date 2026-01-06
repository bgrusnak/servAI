import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError } from './errorHandler';
import { db } from '../db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';
import { AuthService } from '../services/auth.service';

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

function getCacheKey(userId: string): string {
  return `user:${userId}:auth`;
}

async function getUserFromCache(userId: string): Promise<AuthUser | null> {
  try {
    const cached = await redis.get(getCacheKey(userId));
    if (cached) {
      logger.debug('User loaded from cache', { userId });
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.error('Error reading from cache', { error });
  }
  return null;
}

async function setUserInCache(user: AuthUser): Promise<void> {
  try {
    await redis.set(
      getCacheKey(user.id),
      JSON.stringify(user),
      CONSTANTS.CACHE_USER_TTL_SECONDS
    );
    logger.debug('User cached', { userId: user.id });
  } catch (error) {
    logger.error('Error writing to cache', { error });
  }
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await redis.del(getCacheKey(userId));
  logger.debug('User cache invalidated', { userId });
}

async function loadUserFromDB(userId: string): Promise<AuthUser | null> {
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

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401);
    }

    const token = authHeader.substring(7);
    
    // Verify and decode token
    const decoded = AuthService.verifyAccessToken(token);

    // Check if token has been revoked
    const isRevoked = await AuthService.isTokenRevoked(decoded.tokenId);
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
        req.currentContext = JSON.parse(contextHeader);
      } catch (error) {
        logger.warn('Invalid context header', { contextHeader });
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
