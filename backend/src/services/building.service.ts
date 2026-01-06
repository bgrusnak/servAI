import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Building {
  id: string;
  condo_id: string;
  number: string;
  address?: string;
  floors?: number;
  units_count?: number;
  created_at: Date;
  updated_at: Date;
}

interface CreateBuildingData {
  condo_id: string;
  number: string;
  address?: string;
  floors?: number;
  units_count?: number;
}

interface UpdateBuildingData {
  number?: string;
  address?: string;
  floors?: number;
  units_count?: number;
}

export class BuildingService {
  /**
   * List buildings for a condo
   */
  static async listBuildings(
    condoId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: Building[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT *
       FROM buildings
       WHERE condo_id = $1 AND deleted_at IS NULL
       ORDER BY number
       LIMIT $2 OFFSET $3`,
      [condoId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM buildings WHERE condo_id = $1 AND deleted_at IS NULL',
      [condoId]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  /**
   * Get building by ID
   */
  static async getBuildingById(buildingId: string): Promise<Building | null> {
    const result = await db.query(
      'SELECT * FROM buildings WHERE id = $1 AND deleted_at IS NULL',
      [buildingId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create building
   */
  static async createBuilding(data: CreateBuildingData): Promise<Building> {
    // Verify condo exists
    const condoCheck = await db.query(
      'SELECT id FROM condos WHERE id = $1 AND deleted_at IS NULL',
      [data.condo_id]
    );

    if (condoCheck.rows.length === 0) {
      throw new AppError('Condo not found', 404);
    }

    // Check for duplicate building number in same condo
    const duplicateCheck = await db.query(
      'SELECT id FROM buildings WHERE condo_id = $1 AND number = $2 AND deleted_at IS NULL',
      [data.condo_id, data.number]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new AppError('Building with this number already exists in this condo', 409);
    }

    const result = await db.query(
      `INSERT INTO buildings (condo_id, number, address, floors, units_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.condo_id, data.number, data.address, data.floors, data.units_count]
    );

    logger.info('Building created', { buildingId: result.rows[0].id, number: data.number });

    return result.rows[0];
  }

  /**
   * Update building
   */
  static async updateBuilding(buildingId: string, data: UpdateBuildingData): Promise<Building> {
    // Check for duplicate number if changing
    if (data.number !== undefined) {
      const building = await this.getBuildingById(buildingId);
      if (!building) {
        throw new AppError('Building not found', 404);
      }

      const duplicateCheck = await db.query(
        'SELECT id FROM buildings WHERE condo_id = $1 AND number = $2 AND id != $3 AND deleted_at IS NULL',
        [building.condo_id, data.number, buildingId]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new AppError('Building with this number already exists in this condo', 409);
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields = ['number', 'address', 'floors', 'units_count'];

    for (const field of fields) {
      if (data[field as keyof UpdateBuildingData] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field as keyof UpdateBuildingData]);
      }
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(buildingId);

    const result = await db.query(
      `UPDATE buildings
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Building not found', 404);
    }

    logger.info('Building updated', { buildingId });

    return result.rows[0];
  }

  /**
   * Soft delete building
   */
  static async deleteBuilding(buildingId: string): Promise<void> {
    const result = await db.query(
      'UPDATE buildings SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [buildingId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Building not found', 404);
    }

    logger.info('Building deleted', { buildingId });
  }
}
