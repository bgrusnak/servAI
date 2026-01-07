import { Router } from 'express';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import crypto from 'crypto';

const router = Router();

// Email validation regex (RFC 5322 compliant)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC max length
  return EMAIL_REGEX.test(email);
}

// CSRF token storage (should be Redis in production)
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

/**
 * Generate CSRF token
 */
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token
 */
function validateCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    csrfTokens.delete(sessionId);
    return false;
  }
  return stored.token === token;
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Use both IP and email for rate limiting
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${req.ip}_${email}`;
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: 'Too many registration attempts, please try again later',
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many refresh requests',
});

// Cookie options
const getCookieOptions = (maxAge: number) => {
  // CRITICAL: Use secure cookies in staging and production
  const isSecure = config.env === 'production' || config.env === 'staging';
  
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict' as const,
    maxAge,
    path: '/'
  };
};

/**
 * GET /auth/csrf-token
 * Get CSRF token for form submissions
 */
router.get('/csrf-token', asyncHandler(async (req, res) => {
  const sessionId = req.sessionID || crypto.randomBytes(16).toString('hex');
  const token = generateCSRFToken();
  
  csrfTokens.set(sessionId, {
    token,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
  });
  
  res.cookie('sessionId', sessionId, getCookieOptions(15 * 60 * 1000));
  res.json({ csrfToken: token });
}));

/**
 * CSRF validation middleware
 */
const validateCSRF = (req: any, res: any, next: any) => {
  const sessionId = req.cookies?.sessionId;
  const csrfToken = req.headers['x-csrf-token'];
  
  if (!sessionId || !csrfToken) {
    return res.status(403).json({ error: 'CSRF token required' });
  }
  
  if (!validateCSRFToken(sessionId, csrfToken as string)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  
  next();
};

/**
 * POST /auth/register
 * Public registration - resident role only
 */
router.post(
  '/register',
  registerLimiter,
  validateCSRF,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone } = req.body;
    
    // Validate email format
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate names
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }
    
    const result = await authService.register({
      email: trimmedEmail,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone?.trim(),
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
  validateCSRF,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, role, companyId, condoId } = req.body;
    
    // Validate email format
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const allowedRoles = ['resident', 'security_guard', 'employee', 'accountant', 'complex_admin', 'uk_director'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const result = await authService.register({
      email: trimmedEmail,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone?.trim(),
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
  validateCSRF,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    // Validate email format
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const result = await authService.login(trimmedEmail, password);
    
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
    res.clearCookie('sessionId', { path: '/' });
    
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