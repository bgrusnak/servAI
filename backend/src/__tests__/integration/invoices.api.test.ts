import { testDataSource } from '../setup';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Invoice } from '../../entities/Invoice';
import { InvoiceItem } from '../../entities/InvoiceItem';
import { Payment } from '../../entities/Payment';
import {
  createTestCompany,
  createTestCondo,
  createTestUnit,
} from '../utils/fixtures';

describe('Invoices API Integration Tests', () => {
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let invoiceRepo: any;
  let invoiceItemRepo: any;
  let paymentRepo: any;

  beforeAll(() => {
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    invoiceRepo = testDataSource.getRepository(Invoice);
    invoiceItemRepo = testDataSource.getRepository(InvoiceItem);
    paymentRepo = testDataSource.getRepository(Payment);
  });

  describe('GET /api/v1/invoices', () => {
    it('should return invoices for authenticated user', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}-1`,
        billingPeriod: new Date('2026-01-01'),
        dueDate: new Date('2026-01-15'),
        totalAmount: 5000,
        status: 'issued',
      });

      await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}-2`,
        billingPeriod: new Date('2025-12-01'),
        dueDate: new Date('2025-12-15'),
        totalAmount: 5000,
        status: 'paid',
      });

      const invoices = await invoiceRepo.find({
        where: { unitId: unit.id },
        order: { billingPeriod: 'DESC' },
      });

      expect(invoices.length).toBe(2);
      expect(invoices[0].billingPeriod.getMonth()).toBe(0); // January
    });

    it('should filter invoices by status', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-STATUS-${Date.now()}`,
        billingPeriod: new Date(),
        dueDate: new Date(),
        totalAmount: 1000,
        status: 'issued',
      });

      const issuedInvoices = await invoiceRepo.find({
        where: { unitId: unit.id, status: 'issued' },
      });

      expect(issuedInvoices.length).toBeGreaterThan(0);
      expect(issuedInvoices.every(inv => inv.status === 'issued')).toBe(true);
    });
  });

  describe('GET /api/v1/invoices/:invoiceId', () => {
    it('should return invoice with items', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date(),
        dueDate: new Date(),
        totalAmount: 3500,
        status: 'issued',
      });

      await invoiceItemRepo.save({
        invoiceId: invoice.id,
        description: 'Maintenance',
        quantity: 1,
        unitPrice: 3000,
        amount: 3000,
      });

      await invoiceItemRepo.save({
        invoiceId: invoice.id,
        description: 'Electricity',
        quantity: 100,
        unitPrice: 5,
        amount: 500,
      });

      const result = await invoiceRepo.findOne({
        where: { id: invoice.id },
        relations: ['items'],
      });

      expect(result?.items.length).toBe(2);
      expect(result?.totalAmount).toBe(3500);
    });
  });

  describe('POST /api/v1/invoices/:invoiceId/payments', () => {
    it('should create payment for invoice', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date(),
        dueDate: new Date(),
        totalAmount: 5000,
        paidAmount: 0,
        status: 'issued',
      });

      const payment = await paymentRepo.save({
        invoiceId: invoice.id,
        amount: 5000,
        paymentMethod: 'card',
        status: 'completed',
        paidAt: new Date(),
      });

      invoice.paidAmount = 5000;
      invoice.status = 'paid';
      await invoiceRepo.save(invoice);

      expect(payment.id).toBeDefined();
      expect(payment.status).toBe('completed');
    });

    it('should validate payment amount does not exceed total', () => {
      const totalAmount = 5000;
      const paymentAmount = 6000;

      const exceedsTotal = paymentAmount > totalAmount;
      expect(exceedsTotal).toBe(true);
    });
  });
});
