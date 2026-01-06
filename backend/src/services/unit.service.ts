import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Unit {
  id: string;
  condo_id: string;
  building_id?: string;
  entrance_id?: string;
  unit_type_id: string;
  number: string;
  floor?: number;
  area_total?: number;
  area_living?: number;
  rooms?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  is_rented: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CreateUnitData {
  condo_id: string;
  building_id?: string;
  entrance_id?: string;
  unit_type_id: string;
  number: string;
  floor?: number;
  area_total?: number;
  area_living?: number;
  rooms?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  is_rented?: boolean;
}

interface UpdateUnitData {
  building_id?: string;
  entrance_id?: string;
  unit_type_id?: string;
  number?: string;
  floor?: number;
  area_total?: number;
  area_living?: number;
  rooms?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  is_rented?: boolean;
}

export class UnitService {
  /**
   * List units for a condo
   */
  static async listUnits(
    condoId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: Unit[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const result = await db.query(
      `SELECT u.*, ut.name as unit_type_name
       FROM units u
       LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
       WHERE u.condo_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.number
       LIMIT $2 OFFSET $3`,
      [condoId, limit, offset]
    );

    const countResult = await db.query(
      'SELECT COUNT(*) as total FROM units WHERE condo_id = $1 AND deleted_at IS NULL',
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
   * Get unit by ID
   */
  static async getUnitById(unitId: string): Promise<Unit | null> {
    const result = await db.query(
      `SELECT u.*, ut.name as unit_type_name
       FROM units u
       LEFT JOIN unit_types ut ON ut.id = u.unit_type_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [unitId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create unit
   */
  static async createUnit(data: CreateUnitData): Promise<Unit> {
    // Verify condo exists
    const condoCheck = await db.query(
      'SELECT id FROM condos WHERE id = $1 AND deleted_at IS NULL',
      [data.condo_id]
    );

    if (condoCheck.rows.length === 0) {
      throw new AppError('Condo not found', 404);
    }

    // Verify unit_type exists
    const typeCheck = await db.query(
      'SELECT id FROM unit_types WHERE id = $1 AND deleted_at IS NULL',
      [data.unit_type_id]
    );

    if (typeCheck.rows.length === 0) {
      throw new AppError('Unit type not found', 404);
    }

    // Check for duplicate unit number in same condo
    const duplicateCheck = await db.query(
      'SELECT id FROM units WHERE condo_id = $1 AND number = $2 AND deleted_at IS NULL',
      [data.condo_id, data.number]
    );

    if (duplicateCheck.rows.length > 0) {
      throw new AppError('Unit with this number already exists in this condo', 409);
    }

    const result = await db.query(
      `INSERT INTO units (
        condo_id, building_id, entrance_id, unit_type_id, number, floor,
        area_total, area_living, rooms, owner_name, owner_phone, owner_email, is_rented
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.condo_id,
        data.building_id,
        data.entrance_id,
        data.unit_type_id,
        data.number,
        data.floor,
        data.area_total,
        data.area_living,
        data.rooms,
        data.owner_name,
        data.owner_phone,
        data.owner_email,
        data.is_rented || false,
      ]
    );

    logger.info('Unit created', { unitId: result.rows[0].id, number: data.number });

    return result.rows[0];
  }

  /**
   * Update unit
   */
  static async updateUnit(unitId: string, data: UpdateUnitData): Promise<Unit> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Check for duplicate number if changing
    if (data.number !== undefined) {
      const unit = await this.getUnitById(unitId);
      if (!unit) {
        throw new AppError('Unit not found', 404);
      }

      const duplicateCheck = await db.query(
        'SELECT id FROM units WHERE condo_id = $1 AND number = $2 AND id != $3 AND deleted_at IS NULL',
        [unit.condo_id, data.number, unitId]
      );

      if (duplicateCheck.rows.length > 0) {
        throw new AppError('Unit with this number already exists in this condo', 409);
      }
    }

    // Build dynamic update query
    const fields = [
      'building_id', 'entrance_id', 'unit_type_id', 'number', 'floor',
      'area_total', 'area_living', 'rooms', 'owner_name', 'owner_phone',
      'owner_email', 'is_rented'
    ];

    for (const field of fields) {
      if (data[field as keyof UpdateUnitData] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(data[field as keyof UpdateUnitData]);
      }
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(unitId);

    const result = await db.query(
      `UPDATE units
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Unit not found', 404);
    }

    logger.info('Unit updated', { unitId });

    return result.rows[0];
  }

  /**
   * Soft delete unit
   */
  static async deleteUnit(unitId: string): Promise<void> {
    const result = await db.query(
      'UPDATE units SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [unitId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Unit not found', 404);
    }

    logger.info('Unit deleted', { unitId });
  }
}
