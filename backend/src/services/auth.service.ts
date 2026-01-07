import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { UserRole } from '../entities/UserRole';
import { RefreshToken } from '../entities/RefreshToken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { tokenBlacklistService } from './token-blacklist.service';

const userRepository = AppDataSource.getRepository(User);
const userRoleRepository = AppDataSource.getRepository(UserRole);
const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

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

      // Assign role via TypeORM entity (safer than raw SQL)
      if (data.role) {
        const userRole = userRoleRepository.create({
          userId: user.id,
          role: data.role,
          companyId: data.companyId || undefined,
          condoId: data.condoId || undefined,
          isActive: true,
        });
        await userRoleRepository.save(userRole);
      }

      logger.info('User registered', { userId: user.id, email: data.email });
      
      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user.id);

      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error('Registration failed', { error, email: data.email });
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

      logger.info('User logged in', { userId: user.id, email });

      return { user, accessToken, refreshToken };
    } catch (error) {
      logger.error('Login failed', { error, email });
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

      logger.info('Access token refreshed', { userId: refreshToken.userId });

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Token refresh failed', { error });
      throw error;
    }
  }

  /**
   * Logout user by revoking refresh token and blacklisting access token
   */
  async logout(token: string, accessTokenId?: string): Promise<void> {
    try {
      // Revoke refresh token
      const refreshToken = await refreshTokenRepository.findOne({
        where: { token },
      });

      if (refreshToken && !refreshToken.revokedAt) {
        refreshToken.revokedAt = new Date();
        await refreshTokenRepository.save(refreshToken);
      }

      // Blacklist access token if provided
      if (accessTokenId) {
        // Access tokens expire in 15 minutes
        await tokenBlacklistService.revokeToken(accessTokenId, 15 * 60);
      }

      logger.info('User logged out');
    } catch (error) {
      logger.error('Logout failed', { error });
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
   * Check if token is revoked (using Redis)
   */
  async isTokenRevoked(tokenId: string): Promise<boolean> {
    return await tokenBlacklistService.isTokenRevoked(tokenId);
  }

  /**
   * Revoke access token (using Redis)
   */
  async revokeAccessToken(tokenId: string): Promise<void> {
    await tokenBlacklistService.revokeToken(tokenId, 15 * 60); // 15 min TTL
  }
}

export const authService = new AuthService();
