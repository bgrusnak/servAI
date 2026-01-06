import { pool } from '../db';
import { logger } from '../utils/logger';

interface Ticket {
  unitId: string;
  condoId: string;
  createdBy: string;
  categoryId: string;
  title: string;
  description: string;
  priority?: string;
}

export class TicketService {
  /**
   * Create ticket
   */
  async createTicket(ticket: Ticket): Promise<any> {
    try {
      // Generate ticket number
      const numberResult = await pool.query(
        `SELECT COUNT(*) FROM tickets WHERE condo_id = $1`,
        [ticket.condoId]
      );
      const ticketNumber = `TKT-${new Date().getFullYear()}-${String(parseInt(numberResult.rows[0].count) + 1).padStart(5, '0')}`;
      
      const result = await pool.query(
        `INSERT INTO tickets (
          ticket_number, unit_id, condo_id, created_by, category_id,
          title, description, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          ticketNumber, ticket.unitId, ticket.condoId, ticket.createdBy,
          ticket.categoryId, ticket.title, ticket.description,
          ticket.priority || 'normal'
        ]
      );
      
      logger.info('Ticket created', { 
        ticketId: result.rows[0].id,
        ticketNumber 
      });
      
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create ticket', { error, ticket });
      throw error;
    }
  }

  /**
   * Add comment to ticket
   */
  async addComment(ticketId: string, userId: string, comment: string, isInternal: boolean = false): Promise<any> {
    const result = await pool.query(
      `INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, userId, comment, isInternal]
    );
    
    logger.info('Ticket comment added', { ticketId, userId });
    return result.rows[0];
  }

  /**
   * Update ticket status
   */
  async updateStatus(ticketId: string, status: string, userId: string): Promise<void> {
    await pool.query(
      `UPDATE tickets
       SET status = $1,
           resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
           closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $2`,
      [status, ticketId]
    );
    
    logger.info('Ticket status updated', { ticketId, status, userId });
  }

  /**
   * Assign ticket
   */
  async assignTicket(ticketId: string, assignedTo: string): Promise<void> {
    await pool.query(
      `UPDATE tickets SET assigned_to = $1 WHERE id = $2`,
      [assignedTo, ticketId]
    );
    
    logger.info('Ticket assigned', { ticketId, assignedTo });
  }

  /**
   * Get ticket with comments
   */
  async getTicketById(ticketId: string): Promise<any> {
    const ticketResult = await pool.query(
      `SELECT t.*, u.first_name, u.last_name, c.name as category_name,
              un.number as unit_number
       FROM tickets t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN ticket_categories c ON t.category_id = c.id
       LEFT JOIN units un ON t.unit_id = un.id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [ticketId]
    );
    
    if (ticketResult.rows.length === 0) {
      return null;
    }
    
    const ticket = ticketResult.rows[0];
    
    const commentsResult = await pool.query(
      `SELECT tc.*, u.first_name, u.last_name
       FROM ticket_comments tc
       LEFT JOIN users u ON tc.user_id = u.id
       WHERE tc.ticket_id = $1 AND tc.deleted_at IS NULL
       ORDER BY tc.created_at ASC`,
      [ticketId]
    );
    
    return {
      ...ticket,
      comments: commentsResult.rows
    };
  }
}

export const ticketService = new TicketService();
