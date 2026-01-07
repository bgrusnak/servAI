import { AppDataSource } from '../db/data-source';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { InvoiceItem } from '../entities/InvoiceItem';
import { Payment, PaymentStatus } from '../entities/Payment';
import { logger, securityLogger } from '../utils/logger';
import { Between, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../utils/redis';

const invoiceRepository = AppDataSource.getRepository(Invoice);
const invoiceItemRepository = AppDataSource.getRepository(InvoiceItem);
const paymentRepository = AppDataSource.getRepository(Payment);

// CRITICAL: Valid payment methods whitelist
const VALID_PAYMENT_METHODS = ['card', 'bank_transfer', 'cash', 'stripe', 'paypal'];

// CRITICAL: Amount precision (2 decimal places)
const AMOUNT_PRECISION = 2;

export class InvoiceService {
  /**
   * CRITICAL: Validate amount precision and range
   */
  private validateAmount(amount: number, fieldName: string): void {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error(`${fieldName} must be a valid number`);
    }

    if (amount < 0) {
      throw new Error(`${fieldName} must be positive`);
    }

    if (amount > 999999999.99) {
      throw new Error(`${fieldName} exceeds maximum allowed value`);
    }

    // Check precision (2 decimal places)
    const decimals = (amount.toString().split('.')[1] || '').length;
    if (decimals > AMOUNT_PRECISION) {
      throw new Error(`${fieldName} must have at most ${AMOUNT_PRECISION} decimal places`);
    }
  }

  /**
   * CRITICAL: Validate invoice item
   */
  private validateInvoiceItem(item: any): void {
    if (!item.description || typeof item.description !== 'string') {
      throw new Error('Item description is required');
    }

    if (item.description.length > 500) {
      throw new Error('Item description too long (max 500 chars)');
    }

    // CRITICAL: Quantity must be positive
    if (typeof item.quantity !== 'number' || item.quantity <= 0) {
      throw new Error('Item quantity must be a positive number');
    }

    if (item.quantity > 1000000) {
      throw new Error('Item quantity exceeds maximum');
    }

    // CRITICAL: Unit price must be positive
    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
      throw new Error('Item unit price must be a non-negative number');
    }

    this.validateAmount(item.unitPrice, 'Item unit price');
    this.validateAmount(item.quantity * item.unitPrice, 'Item total price');
  }

  /**
   * CRITICAL: Validate date logic
   */
  private validateInvoiceDates(billingPeriod: Date, dueDate: Date): void {
    const now = new Date();

    // Billing period should not be too far in the past (1 year)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    if (billingPeriod < oneYearAgo) {
      throw new Error('Billing period is too far in the past');
    }

    // Billing period should not be in the future
    if (billingPeriod > now) {
      throw new Error('Billing period cannot be in the future');
    }

    // Due date must be after billing period
    if (dueDate <= billingPeriod) {
      throw new Error('Due date must be after billing period');
    }

    // Due date should not be too far in the future (1 year)
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(now.getFullYear() + 1);
    if (dueDate > oneYearFromNow) {
      throw new Error('Due date is too far in the future');
    }
  }

  /**
   * Get invoices with filters
   */
  async getInvoices(
    filter: {
      unitId?: string;
      condoId?: string;
      status?: InvoiceStatus;
      fromDate?: string;
      toDate?: string;
    },
    limit: number = 50,
    offset: number = 0
  ): Promise<{ invoices: Invoice[]; total: number }> {
    try {
      // Validate pagination
      if (limit < 1 || limit > 100) {
        throw new Error('Limit must be between 1 and 100');
      }
      if (offset < 0) {
        throw new Error('Offset must be non-negative');
      }

      const where: any = {};

      if (filter.unitId) where.unitId = filter.unitId;
      if (filter.condoId) where.condoId = filter.condoId;
      if (filter.status) where.status = filter.status;

      if (filter.fromDate && filter.toDate) {
        where.billingPeriod = Between(new Date(filter.fromDate), new Date(filter.toDate));
      }

      const [invoices, total] = await invoiceRepository.findAndCount({
        where,
        relations: ['unit', 'items'],
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });

      return { invoices, total };
    } catch (error: any) {
      logger.error('Failed to get invoices', { error: error.message, filter });
      throw error;
    }
  }

  /**
   * Get invoice by ID with all relations
   */
  async getInvoiceById(invoiceId: string): Promise<Invoice | null> {
    try {
      return await invoiceRepository.findOne({
        where: { id: invoiceId },
        relations: ['unit', 'unit.condo', 'items', 'payments'],
      });
    } catch (error: any) {
      logger.error('Failed to get invoice', { error: error.message, invoiceId });
      throw error;
    }
  }

  /**
   * Create invoice with items
   */
  async createInvoice(data: {
    unitId: string;
    condoId: string;
    invoiceNumber: string;
    billingPeriod: Date;
    dueDate: Date;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
    notes?: string;
  }): Promise<Invoice> {
    // CRITICAL: Validate inputs
    if (!data.unitId || !data.condoId || !data.invoiceNumber) {
      throw new Error('Missing required fields');
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Invoice must have at least one item');
    }

    if (data.items.length > 1000) {
      throw new Error('Too many invoice items (max 1000)');
    }

    // Validate dates
    this.validateInvoiceDates(data.billingPeriod, data.dueDate);

    // Validate all items
    for (const item of data.items) {
      this.validateInvoiceItem(item);
    }

    // Validate notes
    if (data.notes && data.notes.length > 2000) {
      throw new Error('Notes too long (max 2000 chars)');
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // CRITICAL: Check invoice number uniqueness
      const existing = await invoiceRepository.findOne({
        where: {
          invoiceNumber: data.invoiceNumber,
          condoId: data.condoId
        }
      });

      if (existing) {
        throw new Error(`Invoice number ${data.invoiceNumber} already exists for this condo`);
      }

      // Calculate total with validation
      let totalAmount = 0;
      for (const item of data.items) {
        const itemTotal = item.quantity * item.unitPrice;
        totalAmount += itemTotal;
      }

      // Round to 2 decimal places
      totalAmount = Math.round(totalAmount * 100) / 100;

      // CRITICAL: Validate total amount
      this.validateAmount(totalAmount, 'Total amount');

      if (totalAmount === 0) {
        throw new Error('Invoice total must be greater than zero');
      }

      // Create invoice
      const invoice = invoiceRepository.create({
        unitId: data.unitId,
        condoId: data.condoId,
        invoiceNumber: data.invoiceNumber,
        billingPeriod: data.billingPeriod,
        dueDate: data.dueDate,
        totalAmount,
        paidAmount: 0,
        status: InvoiceStatus.ISSUED,
        notes: data.notes,
      });

      await queryRunner.manager.save(invoice);

      // Create invoice items
      const items = data.items.map((item) =>
        invoiceItemRepository.create({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100) / 100,
          totalPrice: Math.round(item.quantity * item.unitPrice * 100) / 100,
        })
      );

      await queryRunner.manager.save(items);

      await queryRunner.commitTransaction();

      // Log invoice creation
      securityLogger.dataAccess(
        'system',
        `invoice:${invoice.id}`,
        'create',
        { invoiceNumber: invoice.invoiceNumber, total: totalAmount }
      );

      logger.info('Invoice created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount
      });

      return await this.getInvoiceById(invoice.id) as Invoice;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to create invoice', { error: error.message });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * CRITICAL: Record payment for invoice with race condition prevention
   */
  async recordPayment(
    invoiceId: string,
    userId: string,
    amount: number,
    method: string,
    idempotencyKey?: string
  ): Promise<Payment> {
    // CRITICAL: Validate inputs
    this.validateAmount(amount, 'Payment amount');

    if (amount === 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    // Validate payment method
    if (!VALID_PAYMENT_METHODS.includes(method)) {
      throw new Error(`Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`);
    }

    // CRITICAL: Idempotency check (prevent duplicate payments)
    if (idempotencyKey) {
      const lockKey = `payment:idempotency:${idempotencyKey}`;
      const existing = await redisClient.get(lockKey);
      if (existing) {
        const existingPayment = await paymentRepository.findOne({
          where: { id: existing }
        });
        if (existingPayment) {
          logger.warn('Duplicate payment attempt detected', {
            idempotencyKey,
            paymentId: existing
          });
          return existingPayment;
        }
      }
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // CRITICAL: SELECT FOR UPDATE to prevent race condition
      const invoice = await queryRunner.manager
        .createQueryBuilder(Invoice, 'invoice')
        .where('invoice.id = :id', { id: invoiceId })
        .setLock('pessimistic_write') // Row-level lock
        .getOne();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Validate invoice status
      if (invoice.status === InvoiceStatus.PAID) {
        throw new Error('Invoice is already fully paid');
      }

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new Error('Cannot pay cancelled invoice');
      }

      // CRITICAL: Check for overpayment
      const remainingAmount = invoice.totalAmount - Number(invoice.paidAmount);
      if (amount > remainingAmount + 0.01) { // Allow 1 cent tolerance
        throw new Error(
          `Payment amount (${amount}) exceeds remaining balance (${remainingAmount.toFixed(2)})`
        );
      }

      // Create payment
      const payment = paymentRepository.create({
        id: idempotencyKey || uuidv4(),
        invoiceId,
        amount: Math.round(amount * 100) / 100,
        paymentMethod: method,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      });

      await queryRunner.manager.save(payment);

      // CRITICAL: Update invoice with SELECT FOR UPDATE lock held
      const newPaidAmount = Number(invoice.paidAmount) + amount;
      invoice.paidAmount = Math.round(newPaidAmount * 100) / 100;

      // Update status if fully paid (with tolerance)
      if (invoice.paidAmount >= invoice.totalAmount - 0.01) {
        invoice.status = InvoiceStatus.PAID;
      }

      await queryRunner.manager.save(invoice);

      // Store idempotency key
      if (idempotencyKey) {
        const lockKey = `payment:idempotency:${idempotencyKey}`;
        await redisClient.setex(lockKey, 86400, payment.id); // 24 hours
      }

      await queryRunner.commitTransaction();

      // Log payment
      securityLogger.dataAccess(
        userId,
        `invoice:${invoiceId}`,
        'payment',
        {
          paymentId: payment.id,
          amount,
          method,
          remainingBalance: (invoice.totalAmount - invoice.paidAmount).toFixed(2)
        }
      );

      logger.info('Payment recorded', {
        invoiceId,
        paymentId: payment.id,
        amount,
        method,
        newBalance: invoice.paidAmount
      });

      return payment;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to record payment', {
        error: error.message,
        invoiceId,
        amount
      });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Mark overdue invoices
   */
  async markOverdueInvoices(): Promise<number> {
    try {
      const result = await invoiceRepository
        .createQueryBuilder()
        .update(Invoice)
        .set({ status: InvoiceStatus.OVERDUE })
        .where('due_date < :now', { now: new Date() })
        .andWhere('status IN (:...statuses)', {
          statuses: [InvoiceStatus.ISSUED, InvoiceStatus.DRAFT],
        })
        .execute();

      const count = result.affected || 0;
      
      if (count > 0) {
        logger.info('Marked overdue invoices', { count });
      }
      
      return count;
    } catch (error: any) {
      logger.error('Failed to mark overdue invoices', { error: error.message });
      throw error;
    }
  }

  /**
   * CRITICAL: Validate invoice status transition
   */
  private canTransitionStatus(from: InvoiceStatus, to: InvoiceStatus): boolean {
    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      [InvoiceStatus.DRAFT]: [InvoiceStatus.ISSUED, InvoiceStatus.CANCELLED],
      [InvoiceStatus.ISSUED]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.CANCELLED],
      [InvoiceStatus.OVERDUE]: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
      [InvoiceStatus.PAID]: [], // Cannot transition from paid
      [InvoiceStatus.CANCELLED]: [], // Cannot transition from cancelled
    };

    return validTransitions[from]?.includes(to) || false;
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(
    invoiceId: string,
    newStatus: InvoiceStatus,
    userId: string
  ): Promise<Invoice> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invoice = await queryRunner.manager
        .createQueryBuilder(Invoice, 'invoice')
        .where('invoice.id = :id', { id: invoiceId })
        .setLock('pessimistic_write')
        .getOne();

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Validate transition
      if (!this.canTransitionStatus(invoice.status, newStatus)) {
        throw new Error(
          `Invalid status transition from ${invoice.status} to ${newStatus}`
        );
      }

      const oldStatus = invoice.status;
      invoice.status = newStatus;
      await queryRunner.manager.save(invoice);

      await queryRunner.commitTransaction();

      // Log status change
      securityLogger.dataAccess(
        userId,
        `invoice:${invoiceId}`,
        'status_change',
        { from: oldStatus, to: newStatus }
      );

      return invoice;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to update invoice status', {
        error: error.message,
        invoiceId
      });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

export const invoiceService = new InvoiceService();