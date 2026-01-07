import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { db } from '../db';

const userRepository = AppDataSource.getRepository(User);
const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

// In-memory token blacklist (use Redis in production)
const revokedTokens = new Set<string>();

export class AuthService {
  /**
   * Register new user with role assignment
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role?: string;
    companyId?: string;
    condoId?: string;
  }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const existingUser = await userRepository.findOne({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new Error('Registration failed');
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = userRepository.create({
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phone,
      });

      await userRepository.save(user);

      // Assign role via SQL (user_roles table)
      if (data.role) {
        await db.query(
          `INSERT INTO user_roles (user_id, role, company_id, condo_id, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [user.id, data.role, data.companyId || null, data.condoId || null]
        );
      }

      logger.info('User registered', { userId: user.id });
      
      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user.id);

      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error('Registration failed', { error });
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(email: string, password: string): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const user = await userRepository.findOne({
        where: { email },
      });

      if (!user) {
        throw new Error('Authentication failed');
      }

      if (!user.isActive) {
        throw new Error('Authentication failed');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        throw new Error('Authentication failed');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user.id);

      logger.info('User logged in', { userId: user.id });

      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error('Login failed');
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(token: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const refreshToken = await refreshTokenRepository.findOne({
        where: { token, revokedAt: null },
        relations: ['user'],
      });

      if (!refreshToken) {
        throw new Error('Invalid refresh token');
      }

      if (new Date() > refreshToken.expiresAt) {
        throw new Error('Refresh token expired');
      }

      // Revoke old token
      refreshToken.revokedAt = new Date();
      await refreshTokenRepository.save(refreshToken);

      // Generate new tokens
      const accessToken = this.generateAccessToken(refreshToken.user);
      const newRefreshToken = await this.generateRefreshToken(refreshToken.userId);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Token refresh failed');
      throw error;
    }
  }

  /**
   * Logout user by revoking refresh token
   */
  async logout(token: string): Promise<void> {
    try {
      const refreshToken = await refreshTokenRepository.findOne({
        where: { token },
      });

      if (refreshToken && !refreshToken.revokedAt) {
        refreshToken.revokedAt = new Date();
        await refreshTokenRepository.save(refreshToken);
      }
    } catch (error) {
      logger.error('Logout failed');
      throw error;
    }
  }

  /**
   * Generate access token with tokenId for revocation
   */
  private generateAccessToken(user: User): string {
    const tokenId = crypto.randomBytes(16).toString('hex');
    
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        tokenId,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiry }
    );
  }

  /**
   * Generate refresh token
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const refreshToken = refreshTokenRepository.create({
      userId,
      token,
      expiresAt,
    });

    await refreshTokenRepository.save(refreshToken);

    return token;
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Check if token is revoked
   */
  async isTokenRevoked(tokenId: string): Promise<boolean> {
    return revokedTokens.has(tokenId);
  }

  /**
   * Revoke access token
   */
  async revokeAccessToken(tokenId: string): Promise<void> {
    revokedTokens.add(tokenId);
    // TODO: In production, use Redis with TTL
  }
}

export const authService = new AuthService();
