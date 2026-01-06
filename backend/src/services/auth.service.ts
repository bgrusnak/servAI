import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { EmailVerificationService } from './email-verification.service';
import { metrics } from '../monitoring/metrics';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email_verified: boolean;
  created_at: Date;
}

interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class AuthService {
  /**
   * Register new user
   */
  static async register(data: RegisterData): Promise<{ user: User; tokens: TokenPair }> {
    return await db.transaction(async (client) => {
      // Check if user exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        throw new AppError('Email already registered', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 10);

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, first_name, last_name, phone, email_verified, created_at`,
        [
          data.email.toLowerCase(),
          passwordHash,
          data.first_name,
          data.last_name,
          data.phone,
        ]
      );

      const user = result.rows[0];

      // Generate tokens
      const tokens = await this.generateTokenPair(user.id, client);

      logger.info('User registered', { userId: user.id, email: user.email });

      // Send verification email (async, don't wait)
      EmailVerificationService.sendVerificationEmail({
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      }).catch((error) => {
        logger.error('Failed to send verification email on registration', {
          userId: user.id,
          error,
        });
      });

      metrics.incrementCounter('email_verification_sent_total');

      return { user, tokens };
    });
  }

  /**
   * Login user
   */
  static async login(data: LoginData): Promise<{ user: User; tokens: TokenPair }> {
    metrics.incrementCounter('auth_login_attempts_total');

    const result = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, email_verified, created_at
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [data.email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      metrics.incrementCounter('auth_login_failures_total', { reason: 'user_not_found' });
      throw new AppError('Invalid credentials', 401);
    }

    const user = result.rows[0];

    // Verify password
    const passwordValid = await bcrypt.compare(data.password, user.password_hash);

    if (!passwordValid) {
      metrics.incrementCounter('auth_login_failures_total', { reason: 'invalid_password' });
      throw new AppError('Invalid credentials', 401);
    }

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id);

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Remove password_hash from response
    delete user.password_hash;

    return { user, tokens };
  }

  /**
   * Generate access and refresh tokens
   */
  private static async generateTokenPair(
    userId: string,
    client?: any
  ): Promise<TokenPair> {
    const dbClient = client || db;

    // Generate access token
    const accessToken = jwt.sign({ userId }, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiry,
    });

    // Generate refresh token
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiry,
    });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await dbClient.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, refreshToken, expiresAt]
    );

    // Parse expiry to seconds
    const expiryMatch = config.jwt.accessExpiry.match(/(\d+)([smhd])/);
    let expiresIn = 900; // Default 15 minutes
    if (expiryMatch) {
      const value = parseInt(expiryMatch[1]);
      const unit = expiryMatch[2];
      switch (unit) {
        case 's':
          expiresIn = value;
          break;
        case 'm':
          expiresIn = value * 60;
          break;
        case 'h':
          expiresIn = value * 3600;
          break;
        case 'd':
          expiresIn = value * 86400;
          break;
      }
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.secret);
    } catch (error) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (decoded.type !== 'refresh') {
      throw new AppError('Invalid token type', 401);
    }

    // Check if token exists and is not revoked
    const result = await db.query(
      `SELECT user_id, revoked_at
       FROM refresh_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );

    if (result.rows.length === 0) {
      throw new AppError('Refresh token not found or expired', 401);
    }

    if (result.rows[0].revoked_at) {
      throw new AppError('Refresh token has been revoked', 401);
    }

    const userId = result.rows[0].user_id;

    // Generate new token pair
    const tokens = await this.generateTokenPair(userId);

    // Revoke old refresh token
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
      [refreshToken]
    );

    logger.info('Token refreshed', { userId });

    return tokens;
  }

  /**
   * Logout user (revoke refresh token)
   */
  static async logout(refreshToken: string): Promise<void> {
    await db.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
      [refreshToken]
    );

    logger.info('User logged out');
  }
}
