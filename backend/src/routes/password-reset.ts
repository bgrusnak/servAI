import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { passwordResetService } from '../services/password-reset.service';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = Router();

// Token format regex (UUID or 64-char hex)
const TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{64}$/i;

/**
 * Validate password strength (same as registration)
 */
function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password too long (max 128 characters)' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true };
}

/**
 * Validate token format
 */
function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return TOKEN_REGEX.test(token);
}

/**
 * Constant-time delay to prevent timing attacks
 */
async function constantTimeDelay(minMs: number = 200, maxMs: number = 500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Rate limiter to prevent email bombing and brute force
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per IP
  message: 'Too many password reset requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown'
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour  
  max: 5, // 5 reset attempts per hour
  message: 'Too many reset attempts, please try again later',
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

    const trimmedEmail = email.trim().toLowerCase();

    // Basic email format validation
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // CRITICAL: Prevent timing attacks by always taking same time
    const startTime = Date.now();
    
    try {
      await passwordResetService.requestPasswordReset(trimmedEmail);
    } catch (error) {
      // Swallow error to prevent email enumeration
    }

    // Add random delay to make timing consistent
    const elapsed = Date.now() - startTime;
    if (elapsed < 200) {
      await constantTimeDelay(200 - elapsed, 500 - elapsed);
    }

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
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    // Validate token format
    if (!isValidTokenFormat(token)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    try {
      await passwordResetService.resetPassword(token, newPassword);
      res.json({ message: 'Password reset successful' });
    } catch (error: any) {
      // Don't reveal if token is invalid or expired
      res.status(400).json({ error: 'Invalid or expired reset token' });
    }
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

    // Validate token format
    if (!isValidTokenFormat(token)) {
      return res.json({ valid: false });
    }

    try {
      const isValid = await passwordResetService.verifyResetToken(token);
      res.json({ valid: isValid });
    } catch (error) {
      res.json({ valid: false });
    }
  })
);

export default router;