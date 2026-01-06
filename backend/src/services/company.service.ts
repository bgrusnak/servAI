import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Company {
  id: string;
  name: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CreateCompanyData {
  name: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
}

interface UpdateCompanyData {
  name?: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

export class CompanyService {
  static async createCompany(data: CreateCompanyData): Promise<Company> {
    const result = await db.query(
      `INSERT INTO companies (name, inn, kpp, address, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.name, data.inn, data.kpp, data.address, data.phone, data.email]
    );

    logger.info('Company created', { companyId: result.rows[0].id, name: data.name });

    return result.rows[0];
  }

  static async getCompanyById(companyId: string): Promise<Company | null> {
    const result = await db.query(
      'SELECT * FROM companies WHERE id = $1 AND deleted_at IS NULL',
      [companyId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  static async listCompanies(
    page: number = 1,
    limit: number = 20,
    includeInactive: boolean = false
  ): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM companies WHERE deleted_at IS NULL';
    if (!includeInactive) {
      query += ' AND is_active = true';
    }
    query += ' ORDER BY name ASC LIMIT $1 OFFSET $2';

    const result = await db.query(query, [limit, offset]);

    // Count
    let countQuery = 'SELECT COUNT(*) as total FROM companies WHERE deleted_at IS NULL';
    if (!includeInactive) {
      countQuery += ' AND is_active = true';
    }

    const countResult = await db.query(countQuery);

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  static async updateCompany(companyId: string, data: UpdateCompanyData): Promise<Company> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.inn !== undefined) {
      updates.push(`inn = $${paramIndex++}`);
      values.push(data.inn);
    }

    if (data.kpp !== undefined) {
      updates.push(`kpp = $${paramIndex++}`);
      values.push(data.kpp);
    }

    if (data.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(data.address);
    }

    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(data.phone);
    }

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    updates.push(`updated_at = NOW()`);
    values.push(companyId);

    const result = await db.query(
      `UPDATE companies
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('Company not found', 404);
    }

    logger.info('Company updated', { companyId });

    return result.rows[0];
  }

  /**
   * Delete company with cascading (fixes CRIT-004)
   * Database triggers handle cascading automatically
   */
  static async deleteCompany(companyId: string): Promise<{
    message: string;
    cascaded: {
      condos: number;
      buildings: number;
      units: number;
      residents: number;
      invites: number;
      roles: number;
    };
  }> {
    return await db.transaction(async (client) => {
      // Get cascade counts before deletion
      const condosCount = await client.query(
        'SELECT COUNT(*) as count FROM condos WHERE company_id = $1 AND deleted_at IS NULL',
        [companyId]
      );

      const buildingsCount = await client.query(
        `SELECT COUNT(*) as count FROM buildings b
         INNER JOIN condos c ON c.id = b.condo_id
         WHERE c.company_id = $1 AND b.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [companyId]
      );

      const unitsCount = await client.query(
        `SELECT COUNT(*) as count FROM units u
         INNER JOIN condos c ON c.id = u.condo_id
         WHERE c.company_id = $1 AND u.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [companyId]
      );

      const residentsCount = await client.query(
        `SELECT COUNT(*) as count FROM residents r
         INNER JOIN units u ON u.id = r.unit_id
         INNER JOIN condos c ON c.id = u.condo_id
         WHERE c.company_id = $1 AND r.deleted_at IS NULL AND u.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [companyId]
      );

      const invitesCount = await client.query(
        `SELECT COUNT(*) as count FROM invites i
         INNER JOIN units u ON u.id = i.unit_id
         INNER JOIN condos c ON c.id = u.condo_id
         WHERE c.company_id = $1 AND i.deleted_at IS NULL AND u.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [companyId]
      );

      const rolesCount = await client.query(
        'SELECT COUNT(*) as count FROM user_roles WHERE company_id = $1 AND deleted_at IS NULL',
        [companyId]
      );

      // Soft delete company (triggers will cascade)
      const result = await client.query(
        'UPDATE companies SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [companyId]
      );

      if (result.rowCount === 0) {
        throw new AppError('Company not found', 404);
      }

      logger.warn('Company deleted with cascading', {
        companyId,
        condos: parseInt(condosCount.rows[0].count),
        buildings: parseInt(buildingsCount.rows[0].count),
        units: parseInt(unitsCount.rows[0].count),
        residents: parseInt(residentsCount.rows[0].count),
        invites: parseInt(invitesCount.rows[0].count),
        roles: parseInt(rolesCount.rows[0].count),
      });

      return {
        message: 'Company and all related entities deleted successfully',
        cascaded: {
          condos: parseInt(condosCount.rows[0].count),
          buildings: parseInt(buildingsCount.rows[0].count),
          units: parseInt(unitsCount.rows[0].count),
          residents: parseInt(residentsCount.rows[0].count),
          invites: parseInt(invitesCount.rows[0].count),
          roles: parseInt(rolesCount.rows[0].count),
        },
      };
    });
  }
}
