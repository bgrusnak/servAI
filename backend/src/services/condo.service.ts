import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Condo {
  id: string;
  company_id: string;
  name: string;
  address: string;
  description?: string;
  total_buildings?: number;
  total_units?: number;
  created_at: Date;
  updated_at: Date;
}

interface CreateCondoData {
  company_id: string;
  name: string;
  address: string;
  description?: string;
  total_buildings?: number;
  total_units?: number;
}

interface UpdateCondoData {
  name?: string;
  address?: string;
  description?: string;
  total_buildings?: number;
  total_units?: number;
}

export class CondoService {
  /**
   * List condos (filtered by user access)
   */
  static async listCondos(
    userId: string,
    page: number = 1,
    limit: number = 20,
    companyId?: string
  ): Promise<{ data: Condo[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    let query = `
      SELECT DISTINCT c.*
      FROM condos c
      LEFT JOIN user_roles ur_company ON ur_company.company_id = c.company_id
      LEFT JOIN user_roles ur_condo ON ur_condo.condo_id = c.id
      WHERE (ur_company.user_id = $1 OR ur_condo.user_id = $1)
        AND ur_company.deleted_at IS NULL
        AND ur_condo.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `;

    let countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM condos c
      LEFT JOIN user_roles ur_company ON ur_company.company_id = c.company_id
      LEFT JOIN user_roles ur_condo ON ur_condo.condo_id = c.id
      WHERE (ur_company.user_id = $1 OR ur_condo.user_id = $1)
        AND ur_company.deleted_at IS NULL
        AND ur_condo.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `;

    const params: any[] = [userId];

    if (companyId) {
      query += ' AND c.company_id = $2';
      countQuery += ' AND c.company_id = $2';
      params.push(companyId);
    }

    query += ` ORDER BY c.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const countParams = companyId ? [userId, companyId] : [userId];
    const countResult = await db.query(countQuery, countParams);

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  /**
   * Get condo by ID (check user access)
   */
  static async getCondoById(condoId: string, userId: string): Promise<Condo | null> {
    const result = await db.query(
      `SELECT DISTINCT c.*
       FROM condos c
       LEFT JOIN user_roles ur_company ON ur_company.company_id = c.company_id
       LEFT JOIN user_roles ur_condo ON ur_condo.condo_id = c.id
       WHERE c.id = $1
         AND (ur_company.user_id = $2 OR ur_condo.user_id = $2)
         AND ur_company.deleted_at IS NULL
         AND ur_condo.deleted_at IS NULL
         AND c.deleted_at IS NULL
       LIMIT 1`,
      [condoId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create condo
   */
  static async createCondo(data: CreateCondoData): Promise<Condo> {
    // Verify company exists
    const companyCheck = await db.query(
      'SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL',
      [data.company_id]
    );

    if (companyCheck.rows.length === 0) {
      throw new AppError('Company not found', 404);
    }

    const result = await db.query(
      `INSERT INTO condos (company_id, name, address, description, total_buildings, total_units)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.company_id,
        data.name,
        data.address,
        data.description,
        data.total_buildings,
        data.total_units,
      ]
    );

    logger.info('Condo created', { condoId: result.rows[0].id, name: data.name });

    return result.rows[0];
  }

  /**
   * Update condo
   */
  static async updateCondo(condoId: string, data: UpdateCondoData): Promise<Condo> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(data.address);
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }

    if (data.total_buildings !== undefined) {
      updates.push(`total_buildings = $${paramIndex++}`);
      values.push(data.total_buildings);
    }

    if (data.total_units !== undefined) {
      updates.push(`total_units = $${paramIndex++}`);
      values.push(data.total_units);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    values.push(condoId);

    const result = await db.query(
      `UPDATE condos
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Condo not found', 404);
    }

    logger.info('Condo updated', { condoId });

    return result.rows[0];
  }

  /**
   * Soft delete condo
   */
  static async deleteCondo(condoId: string): Promise<void> {
    const result = await db.query(
      'UPDATE condos SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [condoId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Condo not found', 404);
    }

    logger.info('Condo deleted', { condoId });
  }

  /**
   * Check if user has access to condo
   */
  static async checkUserAccess(
    condoId: string,
    userId: string,
    requiredRoles?: string[]
  ): Promise<boolean> {
    let query = `
      SELECT 1
      FROM condos c
      LEFT JOIN user_roles ur_company ON ur_company.company_id = c.company_id
      LEFT JOIN user_roles ur_condo ON ur_condo.condo_id = c.id
      WHERE c.id = $1
        AND (ur_company.user_id = $2 OR ur_condo.user_id = $2)
        AND ur_company.is_active = true
        AND ur_condo.is_active = true
        AND ur_company.deleted_at IS NULL
        AND ur_condo.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `;

    const params: any[] = [condoId, userId];

    if (requiredRoles && requiredRoles.length > 0) {
      query += ' AND (ur_company.role = ANY($3) OR ur_condo.role = ANY($3))';
      params.push(requiredRoles);
    }

    const result = await db.query(query, params);

    return result.rows.length > 0;
  }
}
