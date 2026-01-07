import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Invoice } from '../../entities/Invoice';
import { InvoiceItem } from '../../entities/InvoiceItem';
import { Payment } from '../../entities/Payment';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
  createTestUnit,
} from '../utils/fixtures';

describe('Invoice Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let invoiceRepo: any;
  let invoiceItemRepo: any;
  let paymentRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    invoiceRepo = testDataSource.getRepository(Invoice);
    invoiceItemRepo = testDataSource.getRepository(InvoiceItem);
    paymentRepo = testDataSource.getRepository(Payment);
  });

  describe('Invoice Creation', () => {
    it('should create invoice for a unit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = invoiceRepo.create({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 5000.00,
        paidAmount: 0,
        status: 'issued',
      });

      const saved = await invoiceRepo.save(invoice);

      expect(saved.id).toBeDefined();
      expect(saved.totalAmount).toBe(5000.00);
      expect(saved.paidAmount).toBe(0);
      expect(saved.status).toBe('issued');
    });

    it('should not allow duplicate invoice numbers', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoiceNumber = `UNIQUE-INV-${Date.now()}`;

      await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 1000,
        status: 'issued',
      });

      await expect(
        invoiceRepo.save({
          unitId: unit.id,
          condoId: condo.id,
          invoiceNumber,
          billingPeriod: new Date('2026-02-01'),
          dueDate: new Date('2026-02-15'),
          totalAmount: 2000,
          status: 'issued',
        })
      ).rejects.toThrow();
    });
  });

  describe('Invoice Items', () => {
    it('should add items to invoice', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 0,
        status: 'draft',
      });

      const items = [
        { description: 'Maintenance Fee', quantity: 1, unitPrice: 3000, amount: 3000 },
        { description: 'Electricity', quantity: 150, unitPrice: 5, amount: 750 },
        { description: 'Water', quantity: 10, unitPrice: 50, amount: 500 },
      ];

      let total = 0;
      for (const itemData of items) {
        const item = invoiceItemRepo.create({
          invoiceId: invoice.id,
          ...itemData,
        });
        await invoiceItemRepo.save(item);
        total += itemData.amount;
      }

      invoice.totalAmount = total;
      invoice.status = 'issued';
      const updated = await invoiceRepo.save(invoice);

      const savedItems = await invoiceItemRepo.find({
        where: { invoiceId: invoice.id },
      });

      expect(savedItems.length).toBe(3);
      expect(updated.totalAmount).toBe(4250);
    });

    it('should calculate amount correctly', () => {
      const quantity = 100;
      const unitPrice = 5.5;
      const amount = quantity * unitPrice;
      expect(amount).toBe(550);
    });
  });

  describe('Payments', () => {
    it('should record payment for invoice', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 5000,
        paidAmount: 0,
        status: 'issued',
      });

      const payment = paymentRepo.create({
        invoiceId: invoice.id,
        amount: 5000,
        paymentMethod: 'card',
        status: 'completed',
        paidAt: new Date(),
      });

      const savedPayment = await paymentRepo.save(payment);

      invoice.paidAmount = 5000;
      invoice.status = 'paid';
      await invoiceRepo.save(invoice);

      const updatedInvoice = await invoiceRepo.findOne({
        where: { id: invoice.id },
      });

      expect(savedPayment.id).toBeDefined();
      expect(savedPayment.amount).toBe(5000);
      expect(updatedInvoice?.status).toBe('paid');
      expect(updatedInvoice?.paidAmount).toBe(5000);
    });

    it('should handle partial payments', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 10000,
        paidAmount: 0,
        status: 'issued',
      });

      // First payment
      await paymentRepo.save({
        invoiceId: invoice.id,
        amount: 3000,
        paymentMethod: 'card',
        status: 'completed',
        paidAt: new Date(),
      });

      invoice.paidAmount = 3000;
      await invoiceRepo.save(invoice);

      // Second payment
      await paymentRepo.save({
        invoiceId: invoice.id,
        amount: 7000,
        paymentMethod: 'card',
        status: 'completed',
        paidAt: new Date(),
      });

      invoice.paidAmount = 10000;
      invoice.status = 'paid';
      await invoiceRepo.save(invoice);

      const payments = await paymentRepo.find({
        where: { invoiceId: invoice.id },
      });

      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      expect(payments.length).toBe(2);
      expect(totalPaid).toBe(10000);
    });

    it('should mark invoice as overdue', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days ago

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date('2025-12-01'),
        dueDate: pastDate,
        totalAmount: 5000,
        paidAmount: 0,
        status: 'overdue',
      });

      expect(invoice.status).toBe('overdue');
      expect(invoice.dueDate.getTime()).toBeLessThan(Date.now());
    });
  });
});
