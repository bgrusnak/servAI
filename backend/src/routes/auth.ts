import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { db } from '../db';
import { logger } from '../utils/logger';

const authRouter = Router();

// Apply strict rate limiting to auth endpoints
authRouter.use(authRateLimiter);

// Register
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, phone, first_name, last_name, telegram_username } = req.body;

    // Validation
    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Invalid email format', 400);
    }

    // Validate password strength
    AuthService.validatePassword(password);

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      throw new AppError('User with this email already exists', 409);
    }

    // Hash password
    const password_hash = await AuthService.hashPassword(password);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, phone, first_name, last_name, telegram_username)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, phone, first_name, last_name, telegram_username, created_at`,
      [email.toLowerCase(), password_hash, phone, first_name, last_name, telegram_username]
    );

    const user = result.rows[0];

    logger.info('User registered', { userId: user.id, email: user.email });

    // Generate tokens
    const tokens = await AuthService.createTokenPair(
      user.id,
      req.ip,
      req.get('user-agent')
    );

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        telegram_username: user.telegram_username,
        created_at: user.created_at,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Login
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    // Find user
    const result = await db.query(
      `SELECT id, email, password_hash, is_active, phone, first_name, last_name, telegram_username
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid email or password', 401);
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      throw new AppError('Account is disabled', 403);
    }

    // Verify password
    const isValidPassword = await AuthService.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      logger.warn('Failed login attempt', { email, ip: req.ip });
      throw new AppError('Invalid email or password', 401);
    }

    // Update last login
    await db.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Generate tokens
    const tokens = await AuthService.createTokenPair(
      user.id,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        telegram_username: user.telegram_username,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const tokens = await AuthService.refreshTokens(
      refreshToken,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// Logout (revoke current refresh token)
authRouter.post('/logout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.revokeRefreshToken(refreshToken);
    }

    logger.info('User logged out', { userId: req.user?.id });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// Logout all devices (revoke all refresh tokens)
authRouter.post('/logout-all', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const count = await AuthService.revokeAllUserTokens(req.user.id);

    logger.info('User logged out from all devices', { userId: req.user.id, count });

    res.json({ 
      message: 'Logged out from all devices',
      revokedTokens: count,
    });
  } catch (error) {
    next(error);
  }
});

// Get current user profile
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // Get full user data with roles
    const result = await db.query(
      `SELECT 
        u.id,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        u.telegram_id,
        u.telegram_username,
        u.is_active,
        u.last_login_at,
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ur.id,
              'role', ur.role,
              'company_id', ur.company_id,
              'condo_id', ur.condo_id,
              'is_active', ur.is_active,
              'granted_at', ur.granted_at
            )
          ) FILTER (WHERE ur.id IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL
      WHERE u.id = $1 AND u.deleted_at IS NULL
      GROUP BY u.id`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      first_name: user.first_name,
      last_name: user.last_name,
      telegram_id: user.telegram_id,
      telegram_username: user.telegram_username,
      is_active: user.is_active,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      roles: user.roles,
    });
  } catch (error) {
    next(error);
  }
});

export { authRouter };
