import { Router } from 'express';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';

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

    res.status(201).json(result);
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

    res.status(201).json(result);
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
    res.json(result);
  })
);

/**
 * POST /auth/refresh
 */
router.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  })
);

/**
 * POST /auth/logout
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    
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
