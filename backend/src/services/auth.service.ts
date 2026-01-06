import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from '../db';
import { config } from '../config';
import { CONSTANTS } from '../config/constants';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import { AppError } from '../middleware/errorHandler';
import { invalidateUserCache } from '../middleware/auth';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface TokenPayload {
  userId: string;
  tokenId: string;
}

export class AuthService {
  /**
   * Validate password strength
   */
  static validatePassword(password: string): void {
    if (password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
      throw new AppError(`Password must be at least ${CONSTANTS.PASSWORD_MIN_LENGTH} characters`, 400);
    }
    
    if (CONSTANTS.PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
      throw new AppError('Password must contain at least one uppercase letter', 400);
    }
    
    if (CONSTANTS.PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
      throw new AppError('Password must contain at least one lowercase letter', 400);
    }
    
    if (CONSTANTS.PASSWORD_REQUIRE_NUMBER && !/[0-9]/.test(password)) {
      throw new AppError('Password must contain at least one number', 400);
    }
    
    if (CONSTANTS.PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      throw new AppError('Password must contain at least one special character', 400);
    }
  }

  /**
   * Generate access token (short-lived)
   */
  static generateAccessToken(userId: string, tokenId: string): string {
    return jwt.sign(
      { userId, tokenId } as TokenPayload,
      config.jwt.secret,
      { expiresIn: CONSTANTS.JWT_ACCESS_TOKEN_TTL }
    );
  }

  /**
   * Generate refresh token (long-lived, stored in DB)
   */
  static async generateRefreshToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CONSTANTS.JWT_REFRESH_TOKEN_TTL_DAYS);

    const result = await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, token, expiresAt, ipAddress, userAgent]
    );

    logger.info('Refresh token generated', { userId, tokenId: result.rows[0].id });

    return token;
  }

  /**
   * Create token pair (access + refresh)
   */
  static async createTokenPair(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TokenPair> {
    const refreshToken = await this.generateRefreshToken(userId, ipAddress, userAgent);
    
    // Get token ID for access token
    const tokenResult = await db.query(
      'SELECT id FROM refresh_tokens WHERE token = $1 AND deleted_at IS NULL',
      [refreshToken]
    );

    const tokenId = tokenResult.rows[0].id;
    const accessToken = this.generateAccessToken(userId, tokenId);

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode access token
   */
  static verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      
      if (typeof decoded === 'string' || !decoded.userId || !decoded.tokenId) {
        throw new AppError('Invalid token payload', 401);
      }
      
      return decoded as TokenPayload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Invalid or expired access token', 401);
    }
  }

  /**
   * Check if token is revoked (for access token validation)
   */
  static async isTokenRevoked(tokenId: string): Promise<boolean> {
    // Check Redis blacklist first (fast path)
    const blacklisted = await redis.get(`token:revoked:${tokenId}`);
    if (blacklisted) {
      return true;
    }

    // Check database
    const result = await db.query(
      'SELECT revoked_at FROM refresh_tokens WHERE id = $1 AND deleted_at IS NULL',
      [tokenId]
    );

    if (result.rows.length === 0 || result.rows[0].revoked_at) {
      // Cache in Redis for fast subsequent checks (TTL = access token lifetime)
      await redis.set(`token:revoked:${tokenId}`, '1', 900); // 15 minutes
      return true;
    }

    return false;
  }

  /**
   * Rate limit refresh token requests per user
   */
  static async checkRefreshRateLimit(userId: string): Promise<void> {
    const key = `ratelimit:refresh:${userId}`;
    const count = await redis.get(key);
    
    if (count && parseInt(count) >= CONSTANTS.RATE_LIMIT_REFRESH_PER_USER_MAX) {
      throw new AppError('Too many refresh requests, please try again later', 429);
    }
    
    const newCount = count ? parseInt(count) + 1 : 1;
    await redis.set(key, newCount.toString(), 60); // 1 minute window
  }

  /**
   * Refresh tokens - rotate refresh token and issue new access token
   */
  static async refreshTokens(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TokenPair> {
    // Find refresh token in database
    const tokenResult = await db.query(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token = $1 AND deleted_at IS NULL`,
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is revoked
    if (tokenData.revoked_at) {
      logger.warn('Attempt to use revoked refresh token', {
        tokenId: tokenData.id,
        userId: tokenData.user_id,
      });
      throw new AppError('Refresh token has been revoked', 401);
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      throw new AppError('Refresh token expired', 401);
    }

    const userId = tokenData.user_id;

    // Rate limit refresh requests per user
    await this.checkRefreshRateLimit(userId);

    // Verify user still exists and is active
    const userResult = await db.query(
      'SELECT id, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new AppError('User not found', 401);
    }

    if (!userResult.rows[0].is_active) {
      throw new AppError('User account is disabled', 403);
    }

    // Token rotation: revoke old token and create new one
    if (CONSTANTS.JWT_REFRESH_TOKEN_ROTATION) {
      const newRefreshToken = await this.generateRefreshToken(userId, ipAddress, userAgent);
      
      // Get new token ID
      const newTokenResult = await db.query(
        'SELECT id FROM refresh_tokens WHERE token = $1 AND deleted_at IS NULL',
        [newRefreshToken]
      );
      const newTokenId = newTokenResult.rows[0].id;

      // Revoke old token and link to new one
      await db.query(
        `UPDATE refresh_tokens 
         SET revoked_at = NOW(), replaced_by = $1
         WHERE id = $2`,
        [newTokenId, tokenData.id]
      );

      // Add old token to Redis blacklist
      await redis.set(`token:revoked:${tokenData.id}`, '1', 900);

      const newAccessToken = this.generateAccessToken(userId, newTokenId);

      logger.info('Refresh tokens rotated', {
        userId,
        oldTokenId: tokenData.id,
        newTokenId,
      });

      // Invalidate user cache to force reload on next request
      await invalidateUserCache(userId);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } else {
      // No rotation - just issue new access token with same refresh token
      const accessToken = this.generateAccessToken(userId, tokenData.id);

      return {
        accessToken,
        refreshToken, // Same refresh token
      };
    }
  }

  /**
   * Revoke refresh token (logout)
   */
  static async revokeRefreshToken(refreshToken: string): Promise<void> {
    const result = await db.query(
      `UPDATE refresh_tokens 
       SET revoked_at = NOW()
       WHERE token = $1 AND deleted_at IS NULL AND revoked_at IS NULL
       RETURNING id, user_id`,
      [refreshToken]
    );

    if (result.rows.length > 0) {
      const tokenId = result.rows[0].id;
      const userId = result.rows[0].user_id;

      // Add to Redis blacklist
      await redis.set(`token:revoked:${tokenId}`, '1', 900);

      logger.info('Refresh token revoked', { tokenId, userId });

      // Invalidate user cache
      await invalidateUserCache(userId);
    }
  }

  /**
   * Revoke all refresh tokens for user (logout all devices)
   */
  static async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await db.query(
      `UPDATE refresh_tokens 
       SET revoked_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL AND revoked_at IS NULL
       RETURNING id`,
      [userId]
    );

    // Add all tokens to Redis blacklist
    if (result.rows.length > 0) {
      await Promise.all(
        result.rows.map(row => 
          redis.set(`token:revoked:${row.id}`, '1', 900)
        )
      );
    }

    logger.info('All user tokens revoked', {
      userId,
      count: result.rowCount,
    });

    // Invalidate user cache
    await invalidateUserCache(userId);

    return result.rowCount || 0;
  }

  /**
   * Hash password
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify password
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
