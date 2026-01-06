import { randomBytes } from 'crypto';
import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

interface Invite {
  id: string;
  unit_id: string;
  token: string;
  email?: string;
  phone?: string;
  expires_at: Date;
  is_active: boolean;
  max_uses?: number;
  used_count: number;
  created_by: string;
  created_at: Date;
}

interface CreateInviteData {
  unit_id: string;
  email?: string;
  phone?: string;
  ttl_days?: number;
  max_uses?: number;
  created_by: string;
}

interface InviteDetails extends Invite {
  unit_number: string;
  unit_type: string;
  condo_name: string;
  condo_address: string;
  company_name: string;
}

export class InviteService {
  /**
   * Generate secure invite token
   */
  private static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create invite for a unit
   */
  static async createInvite(data: CreateInviteData): Promise<Invite> {
    // Verify unit exists
    const unitCheck = await db.query(
      'SELECT id, condo_id FROM units WHERE id = $1 AND deleted_at IS NULL',
      [data.unit_id]
    );

    if (unitCheck.rows.length === 0) {
      throw new AppError('Unit not found', 404);
    }

    // Generate unique token
    let token: string;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      token = this.generateToken();
      const existing = await db.query(
        'SELECT id FROM invites WHERE token = $1 AND deleted_at IS NULL',
        [token]
      );
      isUnique = existing.rows.length === 0;
      attempts++;
    }

    if (!isUnique) {
      throw new AppError('Failed to generate unique token', 500);
    }

    // Calculate expiration
    const ttlDays = data.ttl_days || CONSTANTS.INVITE_DEFAULT_TTL_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    // Create invite
    const result = await db.query(
      `INSERT INTO invites (unit_id, token, email, phone, expires_at, max_uses, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.unit_id,
        token!,
        data.email,
        data.phone,
        expiresAt,
        data.max_uses || CONSTANTS.INVITE_MAX_USES_DEFAULT,
        data.created_by,
      ]
    );

    logger.info('Invite created', {
      inviteId: result.rows[0].id,
      unitId: data.unit_id,
      createdBy: data.created_by,
    });

    return result.rows[0];
  }

  /**
   * Get invite by token with full details
   */
  static async getInviteByToken(token: string): Promise<InviteDetails | null> {
    const result = await db.query(
      `SELECT 
        i.*,
        u.number as unit_number,
        ut.name as unit_type,
        c.name as condo_name,
        c.address as condo_address,
        co.name as company_name
      FROM invites i
      INNER JOIN units u ON u.id = i.unit_id
      INNER JOIN unit_types ut ON ut.id = u.unit_type_id
      INNER JOIN condos c ON c.id = u.condo_id
      INNER JOIN companies co ON co.id = c.company_id
      WHERE i.token = $1 
        AND i.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND co.deleted_at IS NULL`,
      [token]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List invites for a unit
   */
  static async listInvitesByUnit(
    unitId: string,
    includeExpired: boolean = false
  ): Promise<Invite[]> {
    let query = `
      SELECT *
      FROM invites
      WHERE unit_id = $1 AND deleted_at IS NULL
    `;

    if (!includeExpired) {
      query += ' AND is_active = true AND expires_at > NOW()';
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, [unitId]);

    return result.rows;
  }

  /**
   * Validate invite token
   */
  static async validateInvite(token: string): Promise<{
    valid: boolean;
    reason?: string;
    invite?: InviteDetails;
  }> {
    const invite = await this.getInviteByToken(token);

    if (!invite) {
      return { valid: false, reason: 'Invite not found' };
    }

    if (!invite.is_active) {
      return { valid: false, reason: 'Invite is no longer active', invite };
    }

    if (new Date(invite.expires_at) < new Date()) {
      return { valid: false, reason: 'Invite has expired', invite };
    }

    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
      return { valid: false, reason: 'Invite has reached maximum uses', invite };
    }

    return { valid: true, invite };
  }

  /**
   * Use invite (increment usage counter)
   */
  static async useInvite(token: string): Promise<void> {
    const result = await db.query(
      `UPDATE invites
       SET used_count = used_count + 1
       WHERE token = $1 
         AND deleted_at IS NULL
         AND is_active = true
         AND expires_at > NOW()
         AND (max_uses IS NULL OR used_count < max_uses)
       RETURNING id, used_count, max_uses`,
      [token]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invite is not valid or has been exhausted', 400);
    }

    const invite = result.rows[0];

    // Auto-deactivate if reached max uses
    if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
      await db.query(
        'UPDATE invites SET is_active = false WHERE id = $1',
        [invite.id]
      );

      logger.info('Invite auto-deactivated (max uses reached)', {
        inviteId: invite.id,
        usedCount: invite.used_count,
        maxUses: invite.max_uses,
      });
    }

    logger.info('Invite used', { inviteId: invite.id, usedCount: invite.used_count });
  }

  /**
   * Deactivate invite
   */
  static async deactivateInvite(inviteId: string): Promise<void> {
    const result = await db.query(
      'UPDATE invites SET is_active = false WHERE id = $1 AND deleted_at IS NULL',
      [inviteId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Invite not found', 404);
    }

    logger.info('Invite deactivated', { inviteId });
  }

  /**
   * Delete invite (soft delete)
   */
  static async deleteInvite(inviteId: string): Promise<void> {
    const result = await db.query(
      'UPDATE invites SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [inviteId]
    );

    if (result.rowCount === 0) {
      throw new AppError('Invite not found', 404);
    }

    logger.info('Invite deleted', { inviteId });
  }

  /**
   * Get invite statistics for a unit
   */
  static async getInviteStats(unitId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    exhausted: number;
    totalUses: number;
  }> {
    const result = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true AND expires_at > NOW() AND (max_uses IS NULL OR used_count < max_uses)) as active,
        COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired,
        COUNT(*) FILTER (WHERE max_uses IS NOT NULL AND used_count >= max_uses) as exhausted,
        COALESCE(SUM(used_count), 0) as total_uses
      FROM invites
      WHERE unit_id = $1 AND deleted_at IS NULL`,
      [unitId]
    );

    return {
      total: parseInt(result.rows[0].total),
      active: parseInt(result.rows[0].active),
      expired: parseInt(result.rows[0].expired),
      exhausted: parseInt(result.rows[0].exhausted),
      totalUses: parseInt(result.rows[0].total_uses),
    };
  }
}
