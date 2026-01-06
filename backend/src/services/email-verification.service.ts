import crypto from 'crypto';
import { PoolClient } from 'pg';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

interface EmailVerificationToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at?: Date;
  created_at: Date;
}

interface SendVerificationData {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface VerifyEmailData {
  token: string;
  ip_address?: string;
  user_agent?: string;
}

export class EmailVerificationService {
  private static readonly TOKEN_LENGTH = 32; // 256 bits
  private static readonly TOKEN_EXPIRY_HOURS = 24;
  private static readonly MAX_RESEND_PER_HOUR = 3;

  /**
   * Generate secure random token
   */
  private static generateToken(): { plain: string; hash: string } {
    const plain = crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
    const hash = crypto.createHash('sha256').update(plain).digest('hex');
    return { plain, hash };
  }

  /**
   * Hash token for storage
   */
  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Check rate limit for verification emails
   */
  private static async checkRateLimit(
    userId: string,
    client: PoolClient
  ): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await client.query(
      `SELECT COUNT(*) as count
       FROM email_verification_tokens
       WHERE user_id = $1 AND created_at > $2`,
      [userId, oneHourAgo]
    );

    const count = parseInt(result.rows[0].count);

    if (count >= this.MAX_RESEND_PER_HOUR) {
      logger.warn('Email verification rate limit exceeded', { userId });
      throw new AppError(
        'Too many verification emails sent. Please try again later.',
        429
      );
    }
  }

  /**
   * Send verification email
   */
  static async sendVerificationEmail(
    data: SendVerificationData
  ): Promise<{ message: string }> {
    return await db.transaction(async (client) => {
      // Check if user exists and is not already verified
      const userResult = await client.query(
        `SELECT id, email, first_name, last_name, email_verified
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [data.userId]
      );

      if (userResult.rows.length === 0) {
        throw new AppError('User not found', 404);
      }

      const user = userResult.rows[0];

      if (user.email_verified) {
        return { message: 'Email is already verified' };
      }

      // Check rate limit
      await this.checkRateLimit(user.id, client);

      // Invalidate all previous tokens for this user
      await client.query(
        `UPDATE email_verification_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      );

      // Generate token
      const { plain, hash } = this.generateToken();
      const expiresAt = new Date(
        Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
      );

      // Store hashed token
      await client.query(
        `INSERT INTO email_verification_tokens 
         (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, hash, expiresAt]
      );

      // Send email with plain token
      try {
        await emailService.sendEmailVerification({
          to: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          token: plain,
          expiresAt,
        });

        logger.info('Email verification sent', {
          userId: user.id,
          email: user.email,
        });
      } catch (error) {
        logger.error('Failed to send verification email', {
          userId: user.id,
          error,
        });
        throw new AppError('Failed to send verification email', 500);
      }

      return { message: 'Verification email sent' };
    });
  }

  /**
   * Resend verification email
   */
  static async resendVerificationEmail(
    userId: string
  ): Promise<{ message: string }> {
    const userResult = await db.query(
      `SELECT id, email, first_name, last_name, email_verified
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    const user = userResult.rows[0];

    return await this.sendVerificationEmail({
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    });
  }

  /**
   * Verify email using token
   */
  static async verifyEmail(data: VerifyEmailData): Promise<{ message: string }> {
    return await db.transaction(async (client) => {
      const hash = this.hashToken(data.token);

      // Get and lock token
      const tokenResult = await client.query(
        `SELECT evt.*, u.email, u.email_verified
         FROM email_verification_tokens evt
         INNER JOIN users u ON u.id = evt.user_id
         WHERE evt.token = $1 AND u.deleted_at IS NULL
         FOR UPDATE OF evt`,
        [hash]
      );

      if (tokenResult.rows.length === 0) {
        throw new AppError('Invalid or expired verification token', 400);
      }

      const tokenData = tokenResult.rows[0];

      // Check if already verified
      if (tokenData.email_verified) {
        return { message: 'Email is already verified' };
      }

      // Validate token
      if (tokenData.used_at) {
        throw new AppError('Verification token has already been used', 400);
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        throw new AppError('Verification token has expired', 400);
      }

      // Mark email as verified
      await client.query(
        `UPDATE users
         SET email_verified = true, email_verified_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [tokenData.user_id]
      );

      // Mark token as used
      await client.query(
        `UPDATE email_verification_tokens
         SET used_at = NOW(), ip_address = $1, user_agent = $2
         WHERE id = $3`,
        [data.ip_address, data.user_agent, tokenData.id]
      );

      logger.info('Email verified successfully', {
        userId: tokenData.user_id,
        email: tokenData.email,
      });

      return { message: 'Email verified successfully' };
    });
  }

  /**
   * Check if user's email is verified
   */
  static async isEmailVerified(userId: string): Promise<boolean> {
    const result = await db.query(
      `SELECT email_verified FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    return result.rows[0].email_verified;
  }

  /**
   * Cleanup expired tokens (run via cron job)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const result = await db.query(
      `DELETE FROM email_verification_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days'`
    );

    const deleted = result.rowCount || 0;

    if (deleted > 0) {
      logger.info('Cleaned up expired email verification tokens', {
        count: deleted,
      });
    }

    return deleted;
  }
}
