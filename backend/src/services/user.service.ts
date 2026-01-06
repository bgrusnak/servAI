import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface User {
  id: string;
  email: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  telegram_id?: number;
  telegram_username?: string;
  is_active: boolean;
  created_at: Date;
}

interface CreateUserData {
  email: string;
  password_hash: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  telegram_id?: number;
  telegram_username?: string;
}

interface UpdateUserData {
  phone?: string;
  first_name?: string;
  last_name?: string;
  telegram_username?: string;
}

export class UserService {
  /**
   * Create new user
   */
  static async createUser(data: CreateUserData): Promise<User> {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, phone, first_name, last_name, telegram_id, telegram_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, phone, first_name, last_name, telegram_id, telegram_username, is_active, created_at`,
      [
        data.email.toLowerCase(),
        data.password_hash,
        data.phone,
        data.first_name,
        data.last_name,
        data.telegram_id,
        data.telegram_username,
      ]
    );

    logger.info('User created', { userId: result.rows[0].id, email: data.email });

    return result.rows[0];
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, phone, first_name, last_name, telegram_id, telegram_username, is_active, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, phone, first_name, last_name, telegram_id, telegram_username, is_active, created_at
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get user by telegram ID
   */
  static async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const result = await db.query(
      `SELECT id, email, phone, first_name, last_name, telegram_id, telegram_username, is_active, created_at
       FROM users
       WHERE telegram_id = $1 AND deleted_at IS NULL`,
      [telegramId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update user
   */
  static async updateUser(userId: string, data: UpdateUserData): Promise<User> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(data.phone);
    }

    if (data.first_name !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(data.first_name);
    }

    if (data.last_name !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(data.last_name);
    }

    if (data.telegram_username !== undefined) {
      updates.push(`telegram_username = $${paramIndex++}`);
      values.push(data.telegram_username);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(userId);

    const result = await db.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, email, phone, first_name, last_name, telegram_id, telegram_username, is_active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    logger.info('User updated', { userId });

    return result.rows[0];
  }

  /**
   * Soft delete user
   */
  static async deleteUser(userId: string): Promise<void> {
    const result = await db.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (result.rowCount === 0) {
      throw new AppError('User not found', 404);
    }

    logger.info('User deleted', { userId });
  }

  /**
   * Link Telegram account to user
   */
  static async linkTelegram(userId: string, telegramId: number, telegramUsername?: string): Promise<void> {
    // Check if telegram_id is already linked to another user
    const existing = await db.query(
      'SELECT id FROM users WHERE telegram_id = $1 AND id != $2 AND deleted_at IS NULL',
      [telegramId, userId]
    );

    if (existing.rows.length > 0) {
      throw new AppError('This Telegram account is already linked to another user', 409);
    }

    const result = await db.query(
      `UPDATE users
       SET telegram_id = $1, telegram_username = $2
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id`,
      [telegramId, telegramUsername, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    logger.info('Telegram linked', { userId, telegramId });
  }

  /**
   * Unlink Telegram account from user
   */
  static async unlinkTelegram(userId: string): Promise<void> {
    const result = await db.query(
      `UPDATE users
       SET telegram_id = NULL, telegram_username = NULL
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    logger.info('Telegram unlinked', { userId });
  }
}
