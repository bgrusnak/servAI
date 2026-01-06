import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { config } from '../config';
import { logger } from '../utils/logger';

const userRepository = AppDataSource.getRepository(User);
const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

export class AuthService {
  /**
   * Register new user
   */
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }): Promise<User> {
    try {
      const existingUser = await userRepository.findOne({
        where: { email: data.email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = userRepository.create({
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
      });

      await userRepository.save(user);

      logger.info('User registered', { userId: user.id, email: user.email });
      return user;
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
        throw new Error('Invalid credentials');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user.id);

      logger.info('User logged in', { userId: user.id, email: user.email });

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

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Token refresh failed', { error });
      throw error;
    }
  }

  /**
   * Logout user
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
      logger.error('Logout failed', { error });
      throw error;
    }
  }

  /**
   * Link Telegram account
   */
  async linkTelegram(userId: string, telegramId: string, telegramUsername?: string): Promise<void> {
    try {
      const user = await userRepository.findOne({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      user.telegramId = telegramId;
      user.telegramUsername = telegramUsername || null;

      await userRepository.save(user);

      logger.info('Telegram linked', { userId, telegramId });
    } catch (error) {
      logger.error('Telegram linking failed', { error, userId });
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    return userRepository.findOne({
      where: { telegramId },
    });
  }

  /**
   * Generate access token
   */
  private generateAccessToken(user: User): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
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
}

export const authService = new AuthService();
