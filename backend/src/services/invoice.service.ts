import { AppDataSource } from '../db/data-source';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { InvoiceItem } from '../entities/InvoiceItem';
import { Payment, PaymentStatus } from '../entities/Payment';
import { logger } from '../utils/logger';
import { Between, In } from 'typeorm';

const invoiceRepository = AppDataSource.getRepository(Invoice);
const invoiceItemRepository = AppDataSource.getRepository(InvoiceItem);
const paymentRepository = AppDataSource.getRepository(Payment);

export class InvoiceService {
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
    } catch (error) {
      logger.error('Failed to get invoices', { error, filter });
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
    } catch (error) {
      logger.error('Failed to get invoice', { error, invoiceId });
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
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Calculate total
      const totalAmount = data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0
      );

      // Create invoice
      const invoice = invoiceRepository.create({
        unitId: data.unitId,
        condoId: data.condoId,
        invoiceNumber: data.invoiceNumber,
        billingPeriod: data.billingPeriod,
        dueDate: data.dueDate,
        totalAmount,
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
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })
      );

      await queryRunner.manager.save(items);

      await queryRunner.commitTransaction();

      logger.info('Invoice created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      });

      return await this.getInvoiceById(invoice.id) as Invoice;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to create invoice', { error });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Record payment for invoice
   */
  async recordPayment(
    invoiceId: string,
    userId: string,
    amount: number,
    method: string
  ): Promise<Payment> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invoice = await invoiceRepository.findOne({
        where: { id: invoiceId },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Create payment
      const payment = paymentRepository.create({
        invoiceId,
        amount,
        paymentMethod: method,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      });

      await queryRunner.manager.save(payment);

      // Update invoice paid amount
      invoice.paidAmount = Number(invoice.paidAmount) + amount;

      // Update status if fully paid
      if (invoice.paidAmount >= invoice.totalAmount) {
        invoice.status = InvoiceStatus.PAID;
      }

      await queryRunner.manager.save(invoice);

      await queryRunner.commitTransaction();

      logger.info('Payment recorded', {
        invoiceId,
        amount,
        method,
      });

      return payment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to record payment', { error, invoiceId });
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

      logger.info('Marked overdue invoices', { count: result.affected });
      return result.affected || 0;
    } catch (error) {
      logger.error('Failed to mark overdue invoices', { error });
      throw error;
    }
  }
}

export const invoiceService = new InvoiceService();
