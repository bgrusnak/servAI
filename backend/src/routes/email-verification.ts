import { Router } from 'express';
import { EmailVerificationService } from '../services/email-verification.service';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiter';
import { z } from 'zod';

const router = Router();

// Validation schemas
const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

/**
 * @route POST /api/v1/email-verification/verify
 * @desc Verify email using token
 * @access Public
 * @ratelimit 10 requests per 5 minutes per IP
 */
router.post(
  '/verify',
  rateLimit({ points: 10, duration: 300 }), // 10 attempts per 5 minutes
  asyncHandler(async (req, res) => {
    // Validate input
    const data = VerifyEmailSchema.parse(req.body);

    const result = await EmailVerificationService.verifyEmail({
      token: data.token,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(result);
  })
);

/**
 * @route POST /api/v1/email-verification/resend
 * @desc Resend verification email
 * @access Private (requires authentication)
 * @ratelimit 3 requests per hour
 */
router.post(
  '/resend',
  authenticateToken,
  rateLimit({ points: 3, duration: 3600 }), // 3 attempts per hour
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const result = await EmailVerificationService.resendVerificationEmail(userId);

    res.json(result);
  })
);

/**
 * @route GET /api/v1/email-verification/status
 * @desc Check if user's email is verified
 * @access Private
 */
router.get(
  '/status',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const isVerified = await EmailVerificationService.isEmailVerified(userId);

    res.json({ email_verified: isVerified });
  })
);

export default router;
