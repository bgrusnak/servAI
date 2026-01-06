import { PoolClient } from 'pg';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Resident {
  id: string;
  user_id: string;
  unit_id: string;
  is_owner: boolean;
  is_active: boolean;
  moved_in_at?: Date;
  moved_out_at?: Date;
  created_at: Date;
}

interface ResidentWithDetails extends Resident {
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_phone?: string;
  unit_number: string;
  condo_name: string;
}

interface CreateResidentData {
  user_id: string;
  unit_id: string;
  is_owner?: boolean;
  moved_in_at?: Date;
}

interface UpdateResidentData {
  is_owner?: boolean;
  is_active?: boolean;
  moved_in_at?: Date;
  moved_out_at?: Date;
}

export class ResidentService {
  /**
   * Create resident - PUBLIC API (wraps atomic version)
   */
  static async createResident(data: CreateResidentData): Promise<Resident> {
    return await db.transaction(async (client) => {
      return await this.createResidentAtomic(data, client);
    });
  }

  /**
   * Create resident atomically - INTERNAL (FIXES CRIT-002)
   * Can be called within existing transaction
   */
  static async createResidentAtomic(
    data: CreateResidentData,
    client: PoolClient
  ): Promise<Resident> {
    // Verify user exists
    const userCheck = await client.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [data.user_id]
    );

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Verify unit exists
    const unitCheck = await client.query(
      'SELECT id, condo_id FROM units WHERE id = $1 AND deleted_at IS NULL',
      [data.unit_id]
    );

    if (unitCheck.rows.length === 0) {
      throw new AppError('Unit not found', 404);
    }

    const condoId = unitCheck.rows[0].condo_id;

    // Lock existing active residents for this user+unit combination
    // This prevents race condition (CRIT-002)
    const existingCheck = await client.query(
      `SELECT id FROM residents 
       WHERE user_id = $1 AND unit_id = $2 AND is_active = true AND deleted_at IS NULL
       FOR UPDATE`,  // <-- Lock to prevent concurrent inserts
      [data.user_id, data.unit_id]
    );

    if (existingCheck.rows.length > 0) {
      throw new AppError('User is already an active resident of this unit', 409);
    }

    // Create resident record
    let residentResult;
    try {
      residentResult = await client.query(
        `INSERT INTO residents (user_id, unit_id, is_owner, moved_in_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          data.user_id,
          data.unit_id,
          data.is_owner || false,
          data.moved_in_at || new Date(),
        ]
      );
    } catch (error: any) {
      // Database constraint violation (if unique constraint exists)
      if (error.code === '23505') {
        throw new AppError('User is already an active resident of this unit', 409);
      }
      throw error;
    }

    // Check if user already has resident role for this condo
    const roleCheck = await client.query(
      'SELECT id, is_active FROM user_roles WHERE user_id = $1 AND condo_id = $2 AND role = $3 AND deleted_at IS NULL',
      [data.user_id, condoId, 'resident']
    );

    if (roleCheck.rows.length === 0) {
      // Create resident role
      try {
        await client.query(
          `INSERT INTO user_roles (user_id, role, condo_id)
           VALUES ($1, 'resident', $2)`,
          [data.user_id, condoId]
        );
      } catch (error: any) {
        // Race condition - role created by another transaction
        if (error.code === '23505') {
          // Update existing role to active
          await client.query(
            'UPDATE user_roles SET is_active = true WHERE user_id = $1 AND condo_id = $2 AND role = $3',
            [data.user_id, condoId, 'resident']
          );
        } else {
          throw new AppError('Failed to assign resident role', 500, error);
        }
      }
    } else if (!roleCheck.rows[0].is_active) {
      // Reactivate role if exists but inactive
      await client.query(
        'UPDATE user_roles SET is_active = true WHERE id = $1',
        [roleCheck.rows[0].id]
      );
    }

    const resident = residentResult.rows[0];

    logger.info('Resident created', {
      residentId: resident.id,
      unitId: data.unit_id,
      condoId,
    });

    return resident;
  }

  /**
   * Get resident by ID with details
   */
  static async getResidentById(residentId: string): Promise<ResidentWithDetails | null> {
    const result = await db.query(
      `SELECT 
        r.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.phone as user_phone,
        un.number as unit_number,
        c.name as condo_name
      FROM residents r
      INNER JOIN users u ON u.id = r.user_id
      INNER JOIN units un ON un.id = r.unit_id
      INNER JOIN condos c ON c.id = un.condo_id
      WHERE r.id = $1 AND r.deleted_at IS NULL`,
      [residentId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List residents by unit (with pagination)
   */
  static async listResidentsByUnit(
    unitId: string,
    page: number = 1,
    limit: number = 20,
    includeInactive: boolean = false
  ): Promise<{
    data: ResidentWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 100);
    const offset = (validPage - 1) * validLimit;

    // Count total
    let countQuery = `
      SELECT COUNT(*) as total
      FROM residents r
      WHERE r.unit_id = $1 AND r.deleted_at IS NULL
    `;

    if (!includeInactive) {
      countQuery += ' AND r.is_active = true';
    }

    const countResult = await db.query(countQuery, [unitId]);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    let query = `
      SELECT 
        r.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.phone as user_phone,
        un.number as unit_number,
        c.name as condo_name
      FROM residents r
      INNER JOIN users u ON u.id = r.user_id
      INNER JOIN units un ON un.id = r.unit_id
      INNER JOIN condos c ON c.id = un.condo_id
      WHERE r.unit_id = $1 AND r.deleted_at IS NULL
    `;

    if (!includeInactive) {
      query += ' AND r.is_active = true';
    }

    query += ' ORDER BY r.is_owner DESC, r.created_at ASC LIMIT $2 OFFSET $3';

    const result = await db.query(query, [unitId, validLimit, offset]);

    return {
      data: result.rows,
      total,
      page: validPage,
      limit: validLimit,
      totalPages: Math.ceil(total / validLimit),
    };
  }

  /**
   * List units for a user (where they are resident)
   */
  static async listUnitsByUser(
    userId: string,
    includeInactive: boolean = false
  ): Promise<any[]> {
    let query = `
      SELECT 
        r.*,
        un.id as unit_id,
        un.number as unit_number,
        un.floor,
        un.area_total,
        ut.name as unit_type,
        c.id as condo_id,
        c.name as condo_name,
        c.address as condo_address
      FROM residents r
      INNER JOIN units un ON un.id = r.unit_id
      INNER JOIN unit_types ut ON ut.id = un.unit_type_id
      INNER JOIN condos c ON c.id = un.condo_id
      WHERE r.user_id = $1 AND r.deleted_at IS NULL
    `;

    if (!includeInactive) {
      query += ' AND r.is_active = true';
    }

    query += ' ORDER BY c.name, un.number';

    const result = await db.query(query, [userId]);

    return result.rows;
  }

  /**
   * Update resident
   */
  static async updateResident(
    residentId: string,
    data: UpdateResidentData
  ): Promise<Resident> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.is_owner !== undefined) {
      updates.push(`is_owner = $${paramIndex++}`);
      values.push(data.is_owner);
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }

    if (data.moved_in_at !== undefined) {
      updates.push(`moved_in_at = $${paramIndex++}`);
      values.push(data.moved_in_at);
    }

    if (data.moved_out_at !== undefined) {
      updates.push(`moved_out_at = $${paramIndex++}`);
      values.push(data.moved_out_at);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(residentId);

    const result = await db.query(
      `UPDATE residents
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Resident not found', 404);
    }

    logger.info('Resident updated', { residentId });

    return result.rows[0];
  }

  /**
   * Move out resident (set inactive and moved_out_at)
   */
  static async moveOutResident(residentId: string): Promise<void> {
    await db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE residents
         SET is_active = false, moved_out_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING user_id, unit_id`,
        [residentId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Resident not found', 404);
      }

      const { user_id, unit_id } = result.rows[0];

      // Get condo_id for role management
      const unitResult = await client.query(
        'SELECT condo_id FROM units WHERE id = $1',
        [unit_id]
      );
      const condoId = unitResult.rows[0].condo_id;

      // Check if user has any other active residences in the same condo
      const otherResidences = await client.query(
        `SELECT r.id
         FROM residents r
         INNER JOIN units u ON u.id = r.unit_id
         WHERE r.user_id = $1 
           AND u.condo_id = $2 
           AND r.is_active = true 
           AND r.id != $3
           AND r.deleted_at IS NULL`,
        [user_id, condoId, residentId]
      );

      // If no other active residences, deactivate resident role
      if (otherResidences.rows.length === 0) {
        await client.query(
          `UPDATE user_roles
           SET is_active = false
           WHERE user_id = $1 AND condo_id = $2 AND role = 'resident'`,
          [user_id, condoId]
        );

        logger.info('Resident role deactivated (no active residences)', {
          userId: user_id,
          condoId,
        });
      }

      logger.info('Resident moved out', { residentId });
    });
  }

  /**
   * Delete resident (soft delete)
   */
  static async deleteResident(residentId: string): Promise<void> {
    const result = await db.query(
      'UPDATE residents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [residentId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Resident not found', 404);
    }

    logger.info('Resident deleted', { residentId });
  }
}
