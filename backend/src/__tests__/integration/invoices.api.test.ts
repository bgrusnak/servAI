import request from 'supertest';
import { Express } from 'express';
import { testDataSource } from '../setup';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Invoice } from '../../entities/Invoice';
import { InvoiceItem } from '../../entities/InvoiceItem';
import { Payment } from '../../entities/Payment';
import { User } from '../../entities/User';
import { createTestApp } from '../utils/test-app';
import {
  createTestCompany,
  createTestCondo,
  createTestUnit,
  createTestUser,
} from '../utils/fixtures';

/**
 * Invoices API Integration Tests - WITH REAL AUTHENTICATION
 */
describe('Invoices API Integration Tests', () => {
  let app: Express;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let invoiceRepo: any;
  let invoiceItemRepo: any;
  let paymentRepo: any;
  let userRepo: any;

  beforeAll(() => {
    app = createTestApp(testDataSource);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    invoiceRepo = testDataSource.getRepository(Invoice);
    invoiceItemRepo = testDataSource.getRepository(InvoiceItem);
    paymentRepo = testDataSource.getRepository(Payment);
    userRepo = testDataSource.getRepository(User);
  });

  beforeEach(async () => {
    await paymentRepo.query('TRUNCATE TABLE "payments" CASCADE');
    await invoiceItemRepo.query('TRUNCATE TABLE "invoice_items" CASCADE');
    await invoiceRepo.query('TRUNCATE TABLE "invoices" CASCADE');
    await unitRepo.query('TRUNCATE TABLE "units" CASCADE');
    await condoRepo.query('TRUNCATE TABLE "condos" CASCADE');
    await companyRepo.query('TRUNCATE TABLE "companies" CASCADE');
    await userRepo.query('TRUNCATE TABLE "users" CASCADE');
  });

  async function loginUser(email: string, password: string): Promise<string> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const cookies = response.headers['set-cookie'];
    const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));
    const tokenMatch = accessTokenCookie?.match(/accessToken=([^;]+)/);
    return tokenMatch ? tokenMatch[1] : '';
  }

  describe('GET /api/v1/invoices', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/invoices')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return invoices for authenticated user', async () => {
      const user = await createTestUser(userRepo);
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

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get('/api/v1/invoices')
        .set('Cookie', `accessToken=${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter invoices by status', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date(),
        dueDate: new Date(),
        totalAmount: 1000,
        status: 'issued',
      });

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get('/api/v1/invoices')
        .query({ status: 'issued' })
        .set('Cookie', `accessToken=${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body.every((inv: any) => inv.status === 'issued')).toBe(true);
      }
    });
  });

  describe('GET /api/v1/invoices/:invoiceId', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/invoices/00000000-0000-0000-0000-000000000000')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return invoice with items', async () => {
      const user = await createTestUser(userRepo);
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

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get(`/api/v1/invoices/${invoice.id}`)
        .set('Cookie', `accessToken=${token}`)
        .expect(200);

      expect(response.body.id).toBe(invoice.id);
      expect(response.body.totalAmount).toBe(3500);
    });

    it('should return 404 for non-existent invoice', async () => {
      const user = await createTestUser(userRepo);
      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get('/api/v1/invoices/00000000-0000-0000-0000-000000000000')
        .set('Cookie', `accessToken=${token}`)
        .expect(404);

      expect(response.body.error).toMatch(/not found/i);
    });
  });

  describe('POST /api/v1/invoices/:invoiceId/payments', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/invoices/00000000-0000-0000-0000-000000000000/payments')
        .send({
          amount: 1000,
          paymentMethod: 'card',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should create payment for invoice', async () => {
      const user = await createTestUser(userRepo);
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

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          amount: 5000,
          paymentMethod: 'card',
        })
        .expect(201);

      expect(response.body.amount).toBe(5000);
      expect(response.body.status).toBe('completed');
    });

    it('should return 400 when payment exceeds total', async () => {
      const user = await createTestUser(userRepo);
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

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          amount: 6000,  // exceeds total
          paymentMethod: 'card',
        })
        .expect(400);

      expect(response.body.error).toMatch(/exceed|total|amount/i);
    });

    it('should handle partial payments', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const invoice = await invoiceRepo.save({
        unitId: unit.id,
        condoId: condo.id,
        invoiceNumber: `INV-${Date.now()}`,
        billingPeriod: new Date(),
        dueDate: new Date(),
        totalAmount: 10000,
        paidAmount: 0,
        status: 'issued',
      });

      const token = await loginUser(user.email, 'TestPass123!');

      // First partial payment
      const response1 = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          amount: 3000,
          paymentMethod: 'card',
        })
        .expect(201);

      expect(response1.body.amount).toBe(3000);

      // Second partial payment
      const response2 = await request(app)
        .post(`/api/v1/invoices/${invoice.id}/payments`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          amount: 7000,
          paymentMethod: 'card',
        })
        .expect(201);

      expect(response2.body.amount).toBe(7000);
    });
  });
});
