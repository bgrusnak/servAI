import { Router } from 'express';
import { PasswordResetService } from '../services/password-reset.service';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimiter';
import { z } from 'zod';

const router = Router();

// Validation schemas
const RequestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const ValidateTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long'),
});

/**
 * @route POST /api/v1/password-reset/request
 * @desc Request password reset
 * @access Public
 * @ratelimit 3 requests per hour per IP
 */
router.post(
  '/request',
  rateLimit({ points: 3, duration: 3600 }), // 3 attempts per hour
  asyncHandler(async (req, res) => {
    // Validate input
    const data = RequestResetSchema.parse(req.body);

    const result = await PasswordResetService.requestPasswordReset({
      email: data.email,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(result);
  })
);

/**
 * @route GET /api/v1/password-reset/validate/:token
 * @desc Validate password reset token
 * @access Public
 */
router.get(
  '/validate/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const result = await PasswordResetService.validateToken(token);

    res.json(result);
  })
);

/**
 * @route POST /api/v1/password-reset/reset
 * @desc Reset password using token
 * @access Public
 * @ratelimit 5 requests per 5 minutes per IP
 */
router.post(
  '/reset',
  rateLimit({ points: 5, duration: 300 }), // 5 attempts per 5 minutes
  asyncHandler(async (req, res) => {
    // Validate input
    const data = ResetPasswordSchema.parse(req.body);

    const result = await PasswordResetService.resetPassword({
      token: data.token,
      new_password: data.new_password,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(result);
  })
);

export default router;
