import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from './errorHandler';
import { db } from '../db';

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
    
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new AppError('Invalid or expired token', 401);
    }

    // Fetch user with roles
    const userResult = await db.query(`
      SELECT 
        u.id,
        u.email,
        u.telegram_id,
        u.is_active,
        json_agg(
          json_build_object(
            'role', ur.role,
            'company_id', ur.company_id,
            'condo_id', ur.condo_id
          )
        ) FILTER (WHERE ur.id IS NOT NULL) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = true
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id
    `, [decoded.userId]);

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 401);
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw new AppError('Account is disabled', 403);
    }

    req.user = {
      id: user.id,
      email: user.email,
      telegram_id: user.telegram_id,
      roles: user.roles || [],
    };

    // Set current context from header if provided
    const contextHeader = req.headers['x-context'];
    if (contextHeader && typeof contextHeader === 'string') {
      try {
        req.currentContext = JSON.parse(contextHeader);
      } catch (error) {
        // Invalid context header, ignore
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
