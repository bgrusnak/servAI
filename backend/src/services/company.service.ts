import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

interface Company {
  id: string;
  name: string;
  legal_name?: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface CreateCompanyData {
  name: string;
  legal_name?: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

interface UpdateCompanyData {
  name?: string;
  legal_name?: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  is_active?: boolean;
}

export class CompanyService {
  /**
   * List companies (user sees only companies where they have roles)
   */
  static async listCompanies(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    // Get companies where user has any role
    const result = await db.query(
      `SELECT DISTINCT c.*
       FROM companies c
       INNER JOIN user_roles ur ON ur.company_id = c.id
       WHERE ur.user_id = $1 
         AND ur.deleted_at IS NULL 
         AND c.deleted_at IS NULL
       ORDER BY c.name
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await db.query(
      `SELECT COUNT(DISTINCT c.id) as total
       FROM companies c
       INNER JOIN user_roles ur ON ur.company_id = c.id
       WHERE ur.user_id = $1 
         AND ur.deleted_at IS NULL 
         AND c.deleted_at IS NULL`,
      [userId]
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    };
  }

  /**
   * Get company by ID (check user access)
   */
  static async getCompanyById(companyId: string, userId: string): Promise<Company | null> {
    const result = await db.query(
      `SELECT c.*
       FROM companies c
       INNER JOIN user_roles ur ON ur.company_id = c.id
       WHERE c.id = $1 
         AND ur.user_id = $2
         AND ur.deleted_at IS NULL
         AND c.deleted_at IS NULL
       LIMIT 1`,
      [companyId, userId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create company and assign creator as company_admin
   */
  static async createCompany(data: CreateCompanyData, creatorId: string): Promise<Company> {
    // Check INN uniqueness if provided
    if (data.inn) {
      const existing = await db.query(
        'SELECT id FROM companies WHERE inn = $1 AND deleted_at IS NULL',
        [data.inn]
      );

      if (existing.rows.length > 0) {
        throw new AppError('Company with this INN already exists', 409);
      }
    }

    // Create company and assign role in transaction
    const result = await db.transaction(async (client) => {
      const companyResult = await client.query(
        `INSERT INTO companies (name, legal_name, inn, kpp, address, phone, email, website)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          data.name,
          data.legal_name,
          data.inn,
          data.kpp,
          data.address,
          data.phone,
          data.email,
          data.website,
        ]
      );

      const company = companyResult.rows[0];

      // Assign creator as company_admin
      await client.query(
        `INSERT INTO user_roles (user_id, role, company_id, granted_by)
         VALUES ($1, 'company_admin', $2, $1)`,
        [creatorId, company.id]
      );

      return company;
    });

    logger.info('Company created', { companyId: result.id, name: data.name, creatorId });

    return result;
  }

  /**
   * Update company
   */
  static async updateCompany(companyId: string, data: UpdateCompanyData): Promise<Company> {
    // Check INN uniqueness if changing
    if (data.inn) {
      const existing = await db.query(
        'SELECT id FROM companies WHERE inn = $1 AND id != $2 AND deleted_at IS NULL',
        [data.inn, companyId]
      );

      if (existing.rows.length > 0) {
        throw new AppError('Company with this INN already exists', 409);
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.legal_name !== undefined) {
      updates.push(`legal_name = $${paramIndex++}`);
      values.push(data.legal_name);
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

    if (data.website !== undefined) {
      updates.push(`website = $${paramIndex++}`);
      values.push(data.website);
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400);
    }

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
   * Soft delete company
   */
  static async deleteCompany(companyId: string): Promise<void> {
    const result = await db.query(
      'UPDATE companies SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [companyId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Company not found', 404);
    }

    logger.info('Company deleted', { companyId });
  }

  /**
   * Check if user has access to company with specific roles
   */
  static async checkUserAccess(
    companyId: string,
    userId: string,
    requiredRoles?: string[]
  ): Promise<boolean> {
    let query = `
      SELECT 1
      FROM user_roles
      WHERE company_id = $1 
        AND user_id = $2
        AND is_active = true
        AND deleted_at IS NULL
    `;

    const params: any[] = [companyId, userId];

    if (requiredRoles && requiredRoles.length > 0) {
      query += ' AND role = ANY($3)';
      params.push(requiredRoles);
    }

    const result = await db.query(query, params);

    return result.rows.length > 0;
  }
}
