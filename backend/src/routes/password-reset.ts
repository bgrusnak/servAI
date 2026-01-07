import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { passwordResetService } from '../services/password-reset.service';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter to prevent email bombing
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many password reset requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /password-reset/request
 * Request password reset email
 */
router.post(
  '/request',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    await passwordResetService.requestPasswordReset(email.trim().toLowerCase());

    // Always return success to prevent email enumeration
    res.json({ message: 'If the email exists, a reset link has been sent' });
  })
);

/**
 * POST /password-reset/reset
 * Reset password with token
 */
router.post(
  '/reset',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    await passwordResetService.resetPassword(token, newPassword);

    res.json({ message: 'Password reset successful' });
  })
);

/**
 * GET /password-reset/verify/:token
 * Verify if reset token is valid
 */
router.get(
  '/verify/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const isValid = await passwordResetService.verifyResetToken(token);

    res.json({ valid: isValid });
  })
);

export default router;
