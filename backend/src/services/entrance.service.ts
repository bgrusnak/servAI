import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Entrance {
  id: string;
  building_id: string;
  number: string;
  floors?: number;
  units_count?: number;
  created_at: Date;
  updated_at: Date;
}

interface CreateEntranceData {
  building_id: string;
  number: string;
  floors?: number;
  units_count?: number;
}

interface UpdateEntranceData {
  number?: string;
  floors?: number;
  units_count?: number;
}

export class EntranceService {
  /**
   * List entrances for a building
   */
  static async listEntrances(
    buildingId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: Entrance[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT *
       FROM entrances
       WHERE building_id = $1 AND deleted_at IS NULL
       ORDER BY number
       LIMIT $2 OFFSET $3`,
      [buildingId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM entrances WHERE building_id = $1 AND deleted_at IS NULL',
      [buildingId]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  /**
   * Get entrance by ID
   */
  static async getEntranceById(entranceId: string): Promise<Entrance | null> {
    const result = await db.query(
      'SELECT * FROM entrances WHERE id = $1 AND deleted_at IS NULL',
      [entranceId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create entrance
   */
  static async createEntrance(data: CreateEntranceData): Promise<Entrance> {
    // Verify building exists
    const buildingCheck = await db.query(
      'SELECT id FROM buildings WHERE id = $1 AND deleted_at IS NULL',
      [data.building_id]
    );

    if (buildingCheck.rows.length === 0) {
      throw new AppError('Building not found', 404);
    }

    // Check for duplicate entrance number in same building
    const duplicateCheck = await db.query(
      'SELECT id FROM entrances WHERE building_id = $1 AND number = $2 AND deleted_at IS NULL',
      [data.building_id, data.number]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new AppError('Entrance with this number already exists in this building', 409);
    }

    const result = await db.query(
      `INSERT INTO entrances (building_id, number, floors, units_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.building_id, data.number, data.floors, data.units_count]
    );

    logger.info('Entrance created', { entranceId: result.rows[0].id, number: data.number });

    return result.rows[0];
  }

  /**
   * Update entrance
   */
  static async updateEntrance(entranceId: string, data: UpdateEntranceData): Promise<Entrance> {
    // Check for duplicate number if changing
    if (data.number !== undefined) {
      const entrance = await this.getEntranceById(entranceId);
      if (!entrance) {
        throw new AppError('Entrance not found', 404);
      }

      const duplicateCheck = await db.query(
        'SELECT id FROM entrances WHERE building_id = $1 AND number = $2 AND id != $3 AND deleted_at IS NULL',
        [entrance.building_id, data.number, entranceId]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new AppError('Entrance with this number already exists in this building', 409);
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = ['number', 'floors', 'units_count'];

    for (const field of fields) {
      if (data[field as keyof UpdateEntranceData] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field as keyof UpdateEntranceData]);
      }
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(entranceId);

    const result = await db.query(
      `UPDATE entrances
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Entrance not found', 404);
    }

    logger.info('Entrance updated', { entranceId });

    return result.rows[0];
  }

  /**
   * Soft delete entrance
   */
  static async deleteEntrance(entranceId: string): Promise<void> {
    const result = await db.query(
      'UPDATE entrances SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [entranceId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Entrance not found', 404);
    }

    logger.info('Entrance deleted', { entranceId });
  }
}
