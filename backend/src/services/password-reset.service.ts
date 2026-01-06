import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

const userRepository = AppDataSource.getRepository(User);

interface PasswordResetToken {
  userId: string;
  token: string;
  expiresAt: Date;
}

// In-memory storage for reset tokens (could be Redis in production)
const resetTokens = new Map<string, PasswordResetToken>();

export class PasswordResetService {
  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await userRepository.findOne({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists
        logger.warn('Password reset requested for non-existent email', { email });
        return;
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

      // Store token
      resetTokens.set(token, {
        userId: user.id,
        token,
        expiresAt,
      });

      // Send email
      await emailService.sendPasswordResetEmail(user.email, token);

      logger.info('Password reset requested', { userId: user.id });
    } catch (error) {
      logger.error('Failed to request password reset', { error, email });
      throw error;
    }
  }

  /**
   * Verify reset token
   */
  async verifyResetToken(token: string): Promise<boolean> {
    try {
      const resetToken = resetTokens.get(token);

      if (!resetToken) {
        return false;
      }

      if (resetToken.expiresAt < new Date()) {
        resetTokens.delete(token);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to verify reset token', { error });
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const resetToken = resetTokens.get(token);

      if (!resetToken) {
        throw new Error('Invalid or expired reset token');
      }

      if (resetToken.expiresAt < new Date()) {
        resetTokens.delete(token);
        throw new Error('Reset token expired');
      }

      // Get user
      const user = await userRepository.findOne({
        where: { id: resetToken.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      user.passwordHash = passwordHash;
      await userRepository.save(user);

      // Remove token
      resetTokens.delete(token);

      logger.info('Password reset', { userId: user.id });
    } catch (error) {
      logger.error('Failed to reset password', { error });
      throw error;
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    let count = 0;

    for (const [token, resetToken] of resetTokens.entries()) {
      if (resetToken.expiresAt < now) {
        resetTokens.delete(token);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Cleaned up expired reset tokens', { count });
    }
  }
}

export const passwordResetService = new PasswordResetService();

// Cleanup expired tokens every 15 minutes
setInterval(() => {
  passwordResetService.cleanupExpiredTokens();
}, 15 * 60 * 1000);
