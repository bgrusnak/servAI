import { Router } from 'express';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * POST /auth/register
 * ✅ FIXED: Регистрация ТОЛЬКО с ролью 'resident'
 */
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone } = req.body;
    
    const result = await authService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      role: 'resident', // 🔒 FIXED ROLE
    });

    res.status(201).json(result);
  })
);

/**
 * POST /auth/create-user
 * ✅ NEW: Только superadmin может создавать пользователей с ролями
 */
router.post(
  '/create-user',
  authenticateToken,
  authorize('superadmin'),
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, role, companyId, condoId } = req.body;
    
    const allowedRoles = ['resident', 'security_guard', 'employee', 'accountant', 'complex_admin', 'uk_director'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const result = await authService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      companyId,
      condoId,
    });

    res.status(201).json(result);
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  })
);

router.post(
  '/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user.id);
    res.json({ message: 'Logged out successfully' });
  })
);

export default router;
