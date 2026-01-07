import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { logger, securityLogger } from '../utils/logger';
import validator from 'validator';
import { Brackets } from 'typeorm';

const userRepository = AppDataSource.getRepository(User);

// CRITICAL: Input validation limits
const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 20;
const MAX_SEARCH_LENGTH = 100;

// CRITICAL: Allowed avatar URL domains (whitelist)
const ALLOWED_AVATAR_DOMAINS = [
  'servai.app',
  'cdn.servai.app',
  'storage.googleapis.com',
  's3.amazonaws.com',
  'cloudinary.com',
  'gravatar.com',
];

export class UserService {
  /**
   * CRITICAL: Validate and sanitize name
   */
  private validateName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a string');
    }

    // Length check
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name too long (max ${MAX_NAME_LENGTH} chars)`);
    }

    if (name.length === 0) {
      throw new Error('Name cannot be empty');
    }

    // Remove control characters and excessive whitespace
    let sanitized = name.replace(/[\x00-\x1F\x7F]/g, '').trim();

    // Normalize Unicode (prevent homograph attacks)
    sanitized = sanitized.normalize('NFKC');

    // Allow only letters, spaces, hyphens, apostrophes
    if (!/^[\p{L}\s'-]+$/u.test(sanitized)) {
      throw new Error('Name contains invalid characters');
    }

    // Check for XSS attempts
    if (/<|>|script|javascript|onerror/i.test(sanitized)) {
      throw new Error('Name contains invalid characters');
    }

    return sanitized;
  }

  /**
   * CRITICAL: Validate phone number (E.164 format)
   */
  private validatePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number must be a string');
    }

    // Remove whitespace and common separators
    let cleaned = phone.replace(/[\s().-]/g, '');

    // Length check
    if (cleaned.length > MAX_PHONE_LENGTH) {
      throw new Error(`Phone number too long (max ${MAX_PHONE_LENGTH} chars)`);
    }

    // E.164 format: +[country code][number]
    if (!validator.isMobilePhone(cleaned, 'any', { strictMode: false })) {
      throw new Error('Invalid phone number format');
    }

    // Ensure starts with +
    if (!cleaned.startsWith('+')) {
      throw new Error('Phone number must include country code (e.g., +1234567890)');
    }

    return cleaned;
  }

  /**
   * CRITICAL: Validate avatar URL (prevent SSRF)
   */
  private validateAvatarUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      throw new Error('Avatar URL must be a string');
    }

    if (url.length > 500) {
      throw new Error('Avatar URL too long (max 500 chars)');
    }

    // Must be HTTPS
    if (!validator.isURL(url, { protocols: ['https'], require_protocol: true })) {
      throw new Error('Avatar URL must be a valid HTTPS URL');
    }

    // CRITICAL: Domain whitelist check (prevent SSRF)
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Check if hostname is in whitelist or subdomain of whitelist
      const isAllowed = ALLOWED_AVATAR_DOMAINS.some((domain) => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });

      if (!isAllowed) {
        throw new Error(
          `Avatar URL domain not allowed. Allowed domains: ${ALLOWED_AVATAR_DOMAINS.join(', ')}`
        );
      }

      // Prevent localhost/private IPs (additional safety)
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^(10|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\./.test(hostname) ||
        /^169\.254\./.test(hostname) // AWS metadata
      ) {
        throw new Error('Avatar URL points to private network');
      }
    } catch (error: any) {
      throw new Error(`Invalid avatar URL: ${error.message}`);
    }

    return url;
  }

  /**
   * CRITICAL: Escape SQL LIKE wildcards
   */
  private escapeLikeWildcards(value: string): string {
    // Escape % and _ wildcards
    return value.replace(/[%_]/g, '\\$&');
  }

  /**
   * CRITICAL: Validate search query
   */
  private validateSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      throw new Error('Search query must be a string');
    }

    // Length check
    if (query.length > MAX_SEARCH_LENGTH) {
      throw new Error(`Search query too long (max ${MAX_SEARCH_LENGTH} chars)`);
    }

    if (query.length < 1) {
      throw new Error('Search query too short');
    }

    // Remove control characters
    let sanitized = query.replace(/[\x00-\x1F\x7F]/g, '').trim();

    // CRITICAL: Escape LIKE wildcards to prevent wildcard injection
    sanitized = this.escapeLikeWildcards(sanitized);

    return sanitized;
  }

  /**
   * CRITICAL: Validate Telegram ID format
   */
  private validateTelegramId(telegramId: string): string {
    if (!telegramId || typeof telegramId !== 'string') {
      throw new Error('Telegram ID must be a string');
    }

    // Telegram IDs are numeric strings
    if (!/^[0-9]{1,20}$/.test(telegramId)) {
      throw new Error('Invalid Telegram ID format');
    }

    return telegramId;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      return await userRepository.findOne({
        where: { id: userId },
        relations: ['residencies', 'residencies.unit'],
      });
    } catch (error: any) {
      logger.error('Failed to get user', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      return await userRepository.findOne({
        where: { email },
      });
    } catch (error: any) {
      logger.error('Failed to get user by email', { error: error.message, email });
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      const validatedId = this.validateTelegramId(telegramId);
      return await userRepository.findOne({
        where: { telegramId: validatedId },
      });
    } catch (error: any) {
      logger.error('Failed to get user by telegram ID', {
        error: error.message,
        telegramId,
      });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUser(
    userId: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      avatarUrl: string;
    }>
  ): Promise<User> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // CRITICAL: Validate each field
      const updates: Partial<User> = {};

      if (data.firstName !== undefined) {
        updates.firstName = this.validateName(data.firstName);
      }

      if (data.lastName !== undefined) {
        updates.lastName = this.validateName(data.lastName);
      }

      if (data.phoneNumber !== undefined) {
        if (data.phoneNumber) {
          updates.phoneNumber = this.validatePhoneNumber(data.phoneNumber);
        } else {
          updates.phoneNumber = null;
        }
      }

      if (data.avatarUrl !== undefined) {
        if (data.avatarUrl) {
          updates.avatarUrl = this.validateAvatarUrl(data.avatarUrl);
        } else {
          updates.avatarUrl = null;
        }
      }

      Object.assign(user, updates);
      await userRepository.save(user);

      // Log profile update
      securityLogger.dataAccess(
        userId,
        `user:${userId}`,
        'update_profile',
        { fields: Object.keys(updates) }
      );

      logger.info('User updated', { userId, fields: Object.keys(updates) });
      return user;
    } catch (error: any) {
      logger.error('Failed to update user', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      user.isActive = false;
      await userRepository.save(user);

      // Log deactivation
      securityLogger.dataAccess(userId, `user:${userId}`, 'deactivate', {});

      logger.info('User deactivated', { userId });
    } catch (error: any) {
      logger.error('Failed to deactivate user', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Search users (with SQL injection prevention)
   */
  async searchUsers(query: string, limit: number = 20): Promise<User[]> {
    try {
      // CRITICAL: Validate inputs
      const sanitizedQuery = this.validateSearchQuery(query);

      if (limit < 1 || limit > 100) {
        throw new Error('Limit must be between 1 and 100');
      }

      // CRITICAL: Use parameterized query with escaped wildcards
      const searchPattern = `%${sanitizedQuery}%`;

      return await userRepository
        .createQueryBuilder('user')
        .where('user.is_active = :isActive', { isActive: true })
        .andWhere(
          new Brackets((qb) => {
            qb.where('LOWER(user.first_name) LIKE LOWER(:query)', { query: searchPattern })
              .orWhere('LOWER(user.last_name) LIKE LOWER(:query)', { query: searchPattern })
              .orWhere('LOWER(user.email) LIKE LOWER(:query)', { query: searchPattern });
          })
        )
        .orderBy('user.first_name', 'ASC')
        .take(limit)
        .getMany();
    } catch (error: any) {
      logger.error('Failed to search users', { error: error.message, query });
      throw error;
    }
  }

  /**
   * Link Telegram account
   */
  async linkTelegram(
    userId: string,
    telegramId: string,
    telegramUsername?: string
  ): Promise<void> {
    try {
      const user = await userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // CRITICAL: Validate Telegram ID
      const validatedId = this.validateTelegramId(telegramId);

      // Validate username if provided
      let validatedUsername: string | null = null;
      if (telegramUsername) {
        if (telegramUsername.length > 32) {
          throw new Error('Telegram username too long');
        }
        // Telegram usernames: alphanumeric + underscore, 5-32 chars
        if (!/^[a-zA-Z0-9_]{5,32}$/.test(telegramUsername)) {
          throw new Error('Invalid Telegram username format');
        }
        validatedUsername = telegramUsername;
      }

      user.telegramId = validatedId;
      user.telegramUsername = validatedUsername;
      await userRepository.save(user);

      // Log Telegram linking
      securityLogger.dataAccess(userId, `user:${userId}`, 'link_telegram', {
        telegramId: validatedId,
      });

      logger.info('Telegram linked', { userId, telegramId: validatedId });
    } catch (error: any) {
      logger.error('Failed to link Telegram', { error: error.message, userId });
      throw error;
    }
  }
}

export const userService = new UserService();