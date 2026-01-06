import crypto from 'crypto';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { logger } from '../utils/logger';
import { emailService } from './email.service';

const userRepository = AppDataSource.getRepository(User);

interface VerificationToken {
  userId: string;
  token: string;
  email: string;
  expiresAt: Date;
}

// In-memory storage for verification tokens (could be Redis in production)
const verificationTokens = new Map<string, VerificationToken>();

export class EmailVerificationService {
  /**
   * Send verification email
   */
  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.emailVerified) {
        logger.warn('Email already verified', { userId });
        return;
      }

      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

      // Store token
      verificationTokens.set(token, {
        userId,
        token,
        email,
        expiresAt,
      });

      // Send email
      await emailService.sendVerificationEmail(email, token);

      logger.info('Verification email sent', { userId, email });
    } catch (error) {
      logger.error('Failed to send verification email', { error, userId });
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<void> {
    try {
      const verificationToken = verificationTokens.get(token);

      if (!verificationToken) {
        throw new Error('Invalid or expired verification token');
      }

      if (verificationToken.expiresAt < new Date()) {
        verificationTokens.delete(token);
        throw new Error('Verification token expired');
      }

      // Get user
      const user = await userRepository.findOne({
        where: { id: verificationToken.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Mark email as verified
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
      await userRepository.save(user);

      // Remove token
      verificationTokens.delete(token);

      logger.info('Email verified', { userId: user.id });
    } catch (error) {
      logger.error('Failed to verify email', { error });
      throw error;
    }
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.emailVerified) {
        throw new Error('Email already verified');
      }

      await this.sendVerificationEmail(userId, user.email);
    } catch (error) {
      logger.error('Failed to resend verification email', { error, userId });
      throw error;
    }
  }

  /**
   * Check if email is verified
   */
  async isEmailVerified(userId: string): Promise<boolean> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      return user?.emailVerified || false;
    } catch (error) {
      logger.error('Failed to check email verification', { error, userId });
      throw error;
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    let count = 0;

    for (const [token, verificationToken] of verificationTokens.entries()) {
      if (verificationToken.expiresAt < now) {
        verificationTokens.delete(token);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Cleaned up expired verification tokens', { count });
    }
  }
}

export const emailVerificationService = new EmailVerificationService();

// Cleanup expired tokens every 30 minutes
setInterval(() => {
  emailVerificationService.cleanupExpiredTokens();
}, 30 * 60 * 1000);
