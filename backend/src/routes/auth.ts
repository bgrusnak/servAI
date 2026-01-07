import { Router } from 'express';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

const router = Router();

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many refresh requests',
});

// Cookie options
const getCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict' as const,
  maxAge,
  path: '/'
});

/**
 * POST /auth/register
 * Public registration - resident role only
 */
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone } = req.body;
    
    const result = await authService.register({
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone,
      role: 'resident',
    });

    // Set httpOnly cookies for tokens
    res.cookie('accessToken', result.accessToken, getCookieOptions(15 * 60 * 1000)); // 15 min
    res.cookie('refreshToken', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000)); // 7 days

    // Return only user data, NOT tokens
    res.status(201).json({ user: result.user });
  })
);

/**
 * POST /auth/create-user
 * Admin-only user creation with custom roles
 */
router.post(
  '/create-user',
  authenticate,
  authorize('superadmin'),
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, role, companyId, condoId } = req.body;
    
    const allowedRoles = ['resident', 'security_guard', 'employee', 'accountant', 'complex_admin', 'uk_director'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const result = await authService.register({
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone,
      role,
      companyId,
      condoId,
    });

    // Set httpOnly cookies for tokens
    res.cookie('accessToken', result.accessToken, getCookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

    res.status(201).json({ user: result.user });
  })
);

/**
 * POST /auth/login
 */
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email.trim().toLowerCase(), password);
    
    // Set httpOnly cookies for tokens
    res.cookie('accessToken', result.accessToken, getCookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

    // Return only user data, NOT tokens
    res.json({ user: result.user });
  })
);

/**
 * POST /auth/refresh
 * Reads refresh token from httpOnly cookie
 */
router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    const result = await authService.refreshAccessToken(refreshToken);
    
    // Set new httpOnly cookies
    res.cookie('accessToken', result.accessToken, getCookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

    res.json({ success: true });
  })
);

/**
 * POST /auth/logout
 * Reads refresh token from httpOnly cookie
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    
    // Clear cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    
    res.json({ message: 'Logged out successfully' });
  })
);

/**
 * GET /auth/me
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
