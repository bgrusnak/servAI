import { pool } from '../db';
import { logger } from '../utils/logger';

interface InvoiceFilter {
  unitId?: string;
  condoId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

export class InvoiceService {
  /**
   * Get invoices with filters
   */
  async getInvoices(filter: InvoiceFilter, limit: number = 50, offset: number = 0): Promise<any> {
    let query = `
      SELECT i.*, u.number as unit_number, c.name as condo_name
      FROM invoices i
      JOIN units u ON i.unit_id = u.id
      JOIN condos c ON i.condo_id = c.id
      WHERE i.deleted_at IS NULL
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    if (filter.unitId) {
      query += ` AND i.unit_id = $${paramIndex++}`;
      params.push(filter.unitId);
    }
    
    if (filter.condoId) {
      query += ` AND i.condo_id = $${paramIndex++}`;
      params.push(filter.condoId);
    }
    
    if (filter.status) {
      query += ` AND i.status = $${paramIndex++}`;
      params.push(filter.status);
    }
    
    if (filter.fromDate) {
      query += ` AND i.issue_date >= $${paramIndex++}`;
      params.push(filter.fromDate);
    }
    
    if (filter.toDate) {
      query += ` AND i.issue_date <= $${paramIndex++}`;
      params.push(filter.toDate);
    }
    
    query += ` ORDER BY i.issue_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    const countResult = await pool.query(
      query.replace('SELECT i.*', 'SELECT COUNT(*)').split('ORDER BY')[0],
      params.slice(0, -2)
    );
    
    return {
      invoices: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Get invoice with items
   */
  async getInvoiceById(invoiceId: string): Promise<any> {
    const invoiceResult = await pool.query(
      `SELECT i.*, u.number as unit_number, u.area,
              c.name as condo_name, c.address as condo_address
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       JOIN condos c ON i.condo_id = c.id
       WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [invoiceId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return null;
    }
    
    const invoice = invoiceResult.rows[0];
    
    const itemsResult = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at`,
      [invoiceId]
    );
    
    const paymentsResult = await pool.query(
      `SELECT * FROM payments 
       WHERE invoice_id = $1 AND deleted_at IS NULL 
       ORDER BY payment_date DESC`,
      [invoiceId]
    );
    
    return {
      ...invoice,
      items: itemsResult.rows,
      payments: paymentsResult.rows
    };
  }

  /**
   * Record payment
   */
  async recordPayment(invoiceId: string, userId: string, amount: number, method: string): Promise<any> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create payment record
      const paymentResult = await client.query(
        `INSERT INTO payments (invoice_id, user_id, amount, payment_method, status)
         VALUES ($1, $2, $3, $4, 'completed')
         RETURNING *`,
        [invoiceId, userId, amount, method]
      );
      
      // Update invoice paid amount
      await client.query(
        `UPDATE invoices 
         SET paid_amount = paid_amount + $1,
             status = CASE 
               WHEN paid_amount + $1 >= total_amount THEN 'paid'::invoice_status
               ELSE status
             END
         WHERE id = $2`,
        [amount, invoiceId]
      );
      
      await client.query('COMMIT');
      
      logger.info('Payment recorded', { 
        paymentId: paymentResult.rows[0].id,
        invoiceId,
        amount 
      });
      
      return paymentResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to record payment', { error, invoiceId, amount });
      throw error;
    } finally {
      client.release();
    }
  }
}

export const invoiceService = new InvoiceService();
