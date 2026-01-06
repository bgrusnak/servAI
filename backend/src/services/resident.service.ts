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
   * Create resident (link user to unit)
   */
  static async createResident(data: CreateResidentData): Promise<Resident> {
    // Verify user exists
    const userCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [data.user_id]
    );

    if (userCheck.rows.length === 0) {
      throw new AppError('User not found', 404);
    }

    // Verify unit exists
    const unitCheck = await db.query(
      'SELECT id FROM units WHERE id = $1 AND deleted_at IS NULL',
      [data.unit_id]
    );

    if (unitCheck.rows.length === 0) {
      throw new AppError('Unit not found', 404);
    }

    // Check if already exists and is active
    const existing = await db.query(
      'SELECT id FROM residents WHERE user_id = $1 AND unit_id = $2 AND is_active = true AND deleted_at IS NULL',
      [data.user_id, data.unit_id]
    );

    if (existing.rows.length > 0) {
      throw new AppError('User is already an active resident of this unit', 409);
    }

    // Create resident and assign role in transaction
    const result = await db.transaction(async (client) => {
      // Create resident record
      const residentResult = await client.query(
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

      // Get condo_id for role assignment
      const unitResult = await client.query(
        'SELECT condo_id FROM units WHERE id = $1',
        [data.unit_id]
      );

      const condoId = unitResult.rows[0].condo_id;

      // Check if user already has resident role for this condo
      const roleCheck = await client.query(
        'SELECT id FROM user_roles WHERE user_id = $1 AND condo_id = $2 AND role = $3 AND deleted_at IS NULL',
        [data.user_id, condoId, 'resident']
      );

      // Create resident role if doesn't exist
      if (roleCheck.rows.length === 0) {
        await client.query(
          `INSERT INTO user_roles (user_id, role, condo_id)
           VALUES ($1, 'resident', $2)`,
          [data.user_id, condoId]
        );
      } else {
        // Reactivate role if exists but inactive
        await client.query(
          'UPDATE user_roles SET is_active = true WHERE id = $1',
          [roleCheck.rows[0].id]
        );
      }

      return residentResult.rows[0];
    });

    logger.info('Resident created', {
      residentId: result.id,
      userId: data.user_id,
      unitId: data.unit_id,
    });

    return result;
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
   * List residents by unit
   */
  static async listResidentsByUnit(
    unitId: string,
    includeInactive: boolean = false
  ): Promise<ResidentWithDetails[]> {
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

    query += ' ORDER BY r.is_owner DESC, r.created_at ASC';

    const result = await db.query(query, [unitId]);

    return result.rows;
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
    const result = await db.query(
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

    // Check if user has any other active residences in the same condo
    const unitResult = await db.query(
      'SELECT condo_id FROM units WHERE id = $1',
      [unit_id]
    );
    const condoId = unitResult.rows[0].condo_id;

    const otherResidences = await db.query(
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
      await db.query(
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
