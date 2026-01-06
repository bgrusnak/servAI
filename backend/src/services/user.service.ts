import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { logger } from '../utils/logger';

const userRepository = AppDataSource.getRepository(User);

export class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      return await userRepository.findOne({
        where: { id: userId },
        relations: ['residencies', 'residencies.unit'],
      });
    } catch (error) {
      logger.error('Failed to get user', { error, userId });
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
    } catch (error) {
      logger.error('Failed to get user by email', { error, email });
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    try {
      return await userRepository.findOne({
        where: { telegramId },
      });
    } catch (error) {
      logger.error('Failed to get user by telegram ID', { error, telegramId });
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

      Object.assign(user, data);
      await userRepository.save(user);

      logger.info('User updated', { userId });
      return user;
    } catch (error) {
      logger.error('Failed to update user', { error, userId });
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

      logger.info('User deactivated', { userId });
    } catch (error) {
      logger.error('Failed to deactivate user', { error, userId });
      throw error;
    }
  }

  /**
   * Search users
   */
  async searchUsers(query: string, limit: number = 20): Promise<User[]> {
    try {
      return await userRepository
        .createQueryBuilder('user')
        .where('user.is_active = :isActive', { isActive: true })
        .andWhere(
          '(LOWER(user.first_name) LIKE LOWER(:query) OR LOWER(user.last_name) LIKE LOWER(:query) OR LOWER(user.email) LIKE LOWER(:query))',
          { query: `%${query}%` }
        )
        .orderBy('user.first_name', 'ASC')
        .take(limit)
        .getMany();
    } catch (error) {
      logger.error('Failed to search users', { error, query });
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

      user.telegramId = telegramId;
      user.telegramUsername = telegramUsername || null;
      await userRepository.save(user);

      logger.info('Telegram linked', { userId, telegramId });
    } catch (error) {
      logger.error('Failed to link Telegram', { error, userId });
      throw error;
    }
  }
}

export const userService = new UserService();
