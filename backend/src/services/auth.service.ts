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
import { Counter } from 'prom-client';

const userRepository = AppDataSource.getRepository(User);
const userRoleRepository = AppDataSource.getRepository(UserRole);
const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

// OWASP 2024 recommendation: 12 rounds minimum
const BCRYPT_ROUNDS = 12;

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const FAILED_LOGIN_WINDOW_MINUTES = 15;

// In-memory failed login tracking (should be Redis in production)
const failedLoginAttempts = new Map<string, { count: number; firstAttempt: Date; lockedUntil?: Date }>();

// Security metrics
const authSecurityEvents = new Counter({
  name: 'auth_security_events_total',
  help: 'Authentication security events',
  labelNames: ['event_type', 'severity']
});

const passwordValidationFailures = new Counter({
  name: 'password_validation_failures_total',
  help: 'Password validation failures',
  labelNames: ['reason']
});

export class AuthService {
  /**
   * Validate password strength
   * CRITICAL: Must be called before hashing
   */
  private validatePassword(password: string): void {
    if (!password || typeof password !== 'string') {
      passwordValidationFailures.inc({ reason: 'invalid_type' });
      throw new Error('Password is required');
    }

    if (password.length < 8) {
      passwordValidationFailures.inc({ reason: 'too_short' });
      throw new Error('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      passwordValidationFailures.inc({ reason: 'too_long' });
      throw new Error('Password must be less than 128 characters');
    }

    // Must contain uppercase
    if (!/[A-Z]/.test(password)) {
      passwordValidationFailures.inc({ reason: 'no_uppercase' });
      throw new Error('Password must contain at least one uppercase letter');
    }

    // Must contain lowercase
    if (!/[a-z]/.test(password)) {
      passwordValidationFailures.inc({ reason: 'no_lowercase' });
      throw new Error('Password must contain at least one lowercase letter');
    }

    // Must contain number
    if (!/[0-9]/.test(password)) {
      passwordValidationFailures.inc({ reason: 'no_number' });
      throw new Error('Password must contain at least one number');
    }

    // Must contain special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      passwordValidationFailures.inc({ reason: 'no_special' });
      throw new Error('Password must contain at least one special character');
    }

    // Check for common weak passwords
    const weakPasswords = ['Password1!', 'Qwerty123!', 'Admin123!', 'Welcome1!'];
    if (weakPasswords.includes(password)) {
      passwordValidationFailures.inc({ reason: 'common_password' });
      throw new Error('Password is too common');
    }
  }

  /**
   * Check if account is locked due to failed login attempts
   */
  private isAccountLocked(email: string): boolean {
    const attempts = failedLoginAttempts.get(email);
    
    if (!attempts) return false;
    
    if (attempts.lockedUntil && new Date() < attempts.lockedUntil) {
      return true;
    }
    
    // Unlock if lockout period expired
    if (attempts.lockedUntil && new Date() >= attempts.lockedUntil) {
      failedLoginAttempts.delete(email);
      return false;
    }
    
    return false;
  }

  /**
   * Record failed login attempt
   */
  private recordFailedLogin(email: string): void {
    const now = new Date();
    const attempts = failedLoginAttempts.get(email);
    
    if (!attempts) {
      failedLoginAttempts.set(email, {
        count: 1,
        firstAttempt: now
      });
      return;
    }
    
    // Reset if outside window
    const windowMs = FAILED_LOGIN_WINDOW_MINUTES * 60 * 1000;
    if (now.getTime() - attempts.firstAttempt.getTime() > windowMs) {
      failedLoginAttempts.set(email, {
        count: 1,
        firstAttempt: now
      });
      return;
    }
    
    // Increment count
    attempts.count++;
    
    // Lock account if threshold reached
    if (attempts.count >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      attempts.lockedUntil = lockedUntil;
      
      authSecurityEvents.inc({ 
        event_type: 'account_locked', 
        severity: 'high' 
      });
      
      logger.warn('Account locked due to failed login attempts', {
        email,
        attempts: attempts.count,
        lockedUntil
      });
    }
    
    failedLoginAttempts.set(email, attempts);
  }

  /**
   * Clear failed login attempts on successful login
   */
  private clearFailedLogins(email: string): void {
    failedLoginAttempts.delete(email);
  }

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
        authSecurityEvents.inc({ 
          event_type: 'duplicate_registration', 
          severity: 'medium' 
        });
        throw new Error('Registration failed');
      }

      // CRITICAL: Validate password before hashing
      this.validatePassword(data.password);

      // Use 12 rounds (OWASP 2024 recommendation)
      const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

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
   * Login user with account lockout protection
   */
  async login(email: string, password: string): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Check if account is locked
      if (this.isAccountLocked(email)) {
        authSecurityEvents.inc({ 
          event_type: 'login_attempt_while_locked', 
          severity: 'high' 
        });
        throw new Error('Account temporarily locked. Try again later.');
      }

      const user = await userRepository.findOne({
        where: { email },
      });

      if (!user) {
        this.recordFailedLogin(email);
        authSecurityEvents.inc({ 
          event_type: 'login_user_not_found', 
          severity: 'low' 
        });
        throw new Error('Authentication failed');
      }

      if (!user.isActive) {
        this.recordFailedLogin(email);
        authSecurityEvents.inc({ 
          event_type: 'login_inactive_user', 
          severity: 'medium' 
        });
        throw new Error('Authentication failed');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        this.recordFailedLogin(email);
        authSecurityEvents.inc({ 
          event_type: 'login_invalid_password', 
          severity: 'medium' 
        });
        throw new Error('Authentication failed');
      }

      // Clear failed login attempts on success
      this.clearFailedLogins(email);

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
   * Refresh access token with token theft detection
   */
  async refreshAccessToken(token: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      const refreshToken = await refreshTokenRepository.findOne({
        where: { token },
        relations: ['user'],
      });

      if (!refreshToken) {
        authSecurityEvents.inc({ 
          event_type: 'refresh_token_not_found', 
          severity: 'medium' 
        });
        throw new Error('Invalid refresh token');
      }

      // CRITICAL: Detect token reuse (possible theft)
      if (refreshToken.revokedAt) {
        authSecurityEvents.inc({ 
          event_type: 'refresh_token_reuse_detected', 
          severity: 'critical' 
        });
        
        logger.error('Refresh token reuse detected - possible token theft!', {
          userId: refreshToken.userId,
          tokenId: refreshToken.id,
          revokedAt: refreshToken.revokedAt
        });
        
        // Revoke ALL refresh tokens for this user
        await this.revokeAllUserTokens(refreshToken.userId);
        
        throw new Error('Token theft detected. All sessions terminated.');
      }

      if (new Date() > refreshToken.expiresAt) {
        authSecurityEvents.inc({ 
          event_type: 'refresh_token_expired', 
          severity: 'low' 
        });
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
   * Revoke all refresh tokens for a user (on token theft detection)
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    await refreshTokenRepository.update(
      { userId, revokedAt: null },
      { revokedAt: new Date() }
    );
    
    logger.warn('All refresh tokens revoked for user', { userId });
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
   * FIXED: Removed email from payload (PII leak)
   */
  private generateAccessToken(user: User): string {
    const tokenId = crypto.randomBytes(16).toString('hex');
    
    return jwt.sign(
      {
        userId: user.id,
        tokenId,
        // email removed - PII should not be in JWT
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