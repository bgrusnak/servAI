import crypto from 'crypto';
import { PoolClient } from 'pg';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import bcrypt from 'bcrypt';

interface PasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at?: Date;
  created_at: Date;
}

interface RequestResetData {
  email: string;
  ip_address?: string;
  user_agent?: string;
}

interface ResetPasswordData {
  token: string;
  new_password: string;
  ip_address?: string;
  user_agent?: string;
}

export class PasswordResetService {
  private static readonly TOKEN_LENGTH = 32; // 256 bits
  private static readonly TOKEN_EXPIRY_HOURS = 1;
  private static readonly MAX_ATTEMPTS_PER_HOUR = 3;

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
   * Check rate limit for password reset requests
   */
  private static async checkRateLimit(
    userId: string,
    client: PoolClient
  ): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await client.query(
      `SELECT COUNT(*) as count
       FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > $2`,
      [userId, oneHourAgo]
    );

    const count = parseInt(result.rows[0].count);

    if (count >= this.MAX_ATTEMPTS_PER_HOUR) {
      logger.warn('Password reset rate limit exceeded', { userId });
      throw new AppError(
        'Too many password reset requests. Please try again later.',
        429
      );
    }
  }

  /**
   * Request password reset
   * Generates token and sends email
   */
  static async requestPasswordReset(
    data: RequestResetData
  ): Promise<{ message: string }> {
    return await db.transaction(async (client) => {
      // Find user by email
      const userResult = await client.query(
        `SELECT id, email, first_name, last_name
         FROM users
         WHERE email = $1 AND deleted_at IS NULL`,
        [data.email.toLowerCase()]
      );

      // SECURITY: Always return same message (prevent email enumeration)
      const successMessage =
        'If an account exists with that email, you will receive password reset instructions.';

      if (userResult.rows.length === 0) {
        logger.info('Password reset requested for non-existent email', {
          email: data.email,
        });
        return { message: successMessage };
      }

      const user = userResult.rows[0];

      // Check rate limit
      await this.checkRateLimit(user.id, client);

      // Invalidate all previous tokens for this user
      await client.query(
        `UPDATE password_reset_tokens
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
        `INSERT INTO password_reset_tokens 
         (user_id, token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, hash, expiresAt, data.ip_address, data.user_agent]
      );

      // Send email with plain token
      try {
        await emailService.sendPasswordResetEmail({
          to: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          token: plain,
          expiresAt,
        });

        logger.info('Password reset email sent', {
          userId: user.id,
          email: user.email,
        });
      } catch (error) {
        logger.error('Failed to send password reset email', {
          userId: user.id,
          error,
        });
        // Don't throw - prevents information disclosure
      }

      return { message: successMessage };
    });
  }

  /**
   * Validate password reset token
   */
  static async validateToken(
    token: string
  ): Promise<{ valid: boolean; userId?: string; reason?: string }> {
    const hash = this.hashToken(token);

    const result = await db.query(
      `SELECT prt.*, u.email
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1 AND u.deleted_at IS NULL`,
      [hash]
    );

    if (result.rows.length === 0) {
      return { valid: false, reason: 'Invalid or expired token' };
    }

    const tokenData = result.rows[0];

    if (tokenData.used_at) {
      return { valid: false, reason: 'Token has already been used' };
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return { valid: false, reason: 'Token has expired' };
    }

    return { valid: true, userId: tokenData.user_id };
  }

  /**
   * Reset password using token
   */
  static async resetPassword(data: ResetPasswordData): Promise<{ message: string }> {
    // Validate password strength
    if (data.new_password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    return await db.transaction(async (client) => {
      const hash = this.hashToken(data.token);

      // Get and lock token
      const tokenResult = await client.query(
        `SELECT prt.*, u.email
         FROM password_reset_tokens prt
         INNER JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1 AND u.deleted_at IS NULL
         FOR UPDATE OF prt`,
        [hash]
      );

      if (tokenResult.rows.length === 0) {
        throw new AppError('Invalid or expired token', 400);
      }

      const tokenData = tokenResult.rows[0];

      // Validate token
      if (tokenData.used_at) {
        throw new AppError('Token has already been used', 400);
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        throw new AppError('Token has expired', 400);
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(data.new_password, 10);

      // Update password
      await client.query(
        `UPDATE users
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, tokenData.user_id]
      );

      // Mark token as used
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW(), ip_address = $1, user_agent = $2
         WHERE id = $3`,
        [data.ip_address, data.user_agent, tokenData.id]
      );

      // Invalidate all refresh tokens (force re-login)
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [tokenData.user_id]
      );

      logger.info('Password reset successful', {
        userId: tokenData.user_id,
        email: tokenData.email,
      });

      // Send confirmation email
      try {
        await emailService.sendPasswordChangedEmail({
          to: tokenData.email,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Failed to send password changed email', {
          userId: tokenData.user_id,
          error,
        });
        // Don't throw - password was already changed
      }

      return { message: 'Password has been reset successfully' };
    });
  }

  /**
   * Cleanup expired tokens (run via cron job)
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const result = await db.query(
      `DELETE FROM password_reset_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days'`
    );

    const deleted = result.rowCount || 0;

    if (deleted > 0) {
      logger.info('Cleaned up expired password reset tokens', {
        count: deleted,
      });
    }

    return deleted;
  }
}
