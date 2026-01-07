import request from 'supertest';
import { Express } from 'express';
import { testDataSource } from '../setup';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { MeterType } from '../../entities/MeterType';
import { Meter } from '../../entities/Meter';
import { MeterReading } from '../../entities/MeterReading';
import { User } from '../../entities/User';
import { createTestApp } from '../utils/test-app';
import {
  createTestCompany,
  createTestCondo,
  createTestUnit,
  createTestMeterType,
  createTestMeter,
  createTestUser,
} from '../utils/fixtures';

/**
 * Meters API Integration Tests - WITH REAL AUTHENTICATION
 * 
 * These tests properly authenticate before making API calls.
 * They test REAL security and authorization.
 */
describe('Meters API Integration Tests', () => {
  let app: Express;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let meterTypeRepo: any;
  let meterRepo: any;
  let meterReadingRepo: any;
  let userRepo: any;

  beforeAll(() => {
    app = createTestApp(testDataSource);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    meterTypeRepo = testDataSource.getRepository(MeterType);
    meterRepo = testDataSource.getRepository(Meter);
    meterReadingRepo = testDataSource.getRepository(MeterReading);
    userRepo = testDataSource.getRepository(User);
  });

  beforeEach(async () => {
    await meterReadingRepo.query('TRUNCATE TABLE "meter_readings" CASCADE');
    await meterRepo.query('TRUNCATE TABLE "meters" CASCADE');
    await meterTypeRepo.query('TRUNCATE TABLE "meter_types" CASCADE');
    await unitRepo.query('TRUNCATE TABLE "units" CASCADE');
    await condoRepo.query('TRUNCATE TABLE "condos" CASCADE');
    await companyRepo.query('TRUNCATE TABLE "companies" CASCADE');
    await userRepo.query('TRUNCATE TABLE "users" CASCADE');
  });

  /**
   * Helper: Login and get access token
   */
  async function loginUser(email: string, password: string): Promise<string> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    const cookies = response.headers['set-cookie'];
    const accessTokenCookie = cookies.find((c: string) => c.startsWith('accessToken='));
    
    if (!accessTokenCookie) {
      throw new Error('No access token in login response');
    }

    // Extract token value from cookie
    const tokenMatch = accessTokenCookie.match(/accessToken=([^;]+)/);
    return tokenMatch ? tokenMatch[1] : '';
  }

  describe('GET /api/v1/units/:unitId/meters', () => {
    it('should return 401 without authentication', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const response = await request(app)
        .get(`/api/v1/units/${unit.id}/meters`)
        // NO AUTHENTICATION
        .expect(401);  // ✅ Must be unauthorized

      expect(response.body.error).toBeDefined();
    });

    it('should return all meters for a unit with authentication', async () => {
      // Setup: create user, company, condo, unit, meters
      const user = await createTestUser(userRepo, {
        email: 'resident@example.com',
        password: 'TestPass123!',
      });

      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      
      const electricityType = await createTestMeterType(meterTypeRepo, {
        name: 'Electricity',
        unitOfMeasurement: 'kWh',
      });
      
      const waterType = await createTestMeterType(meterTypeRepo, {
        name: 'Water',
        unitOfMeasurement: 'm³',
      });

      await createTestMeter(meterRepo, unit.id, electricityType.id);
      await createTestMeter(meterRepo, unit.id, waterType.id);

      // Login to get token
      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get(`/api/v1/units/${unit.id}/meters`)
        .set('Cookie', `accessToken=${token}`)  // ✅ With authentication
        .expect('Content-Type', /json/)
        .expect(200);  // ✅ EXACT CODE

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('serialNumber');
      expect(response.body[0]).toHaveProperty('meterType');
    });

    it('should return 404 for non-existent unit', async () => {
      const user = await createTestUser(userRepo, {
        email: 'user@example.com',
        password: 'TestPass123!',
      });

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get('/api/v1/units/00000000-0000-0000-0000-000000000000/meters')
        .set('Cookie', `accessToken=${token}`)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return empty array for unit with no meters', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .get(`/api/v1/units/${unit.id}/meters`)
        .set('Cookie', `accessToken=${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('POST /api/v1/meters/:meterId/readings', () => {
    it('should return 401 without authentication', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .send({
          value: 1234.56,
          readingDate: new Date().toISOString(),
          source: 'manual',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should submit a meter reading with authentication', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const token = await loginUser(user.email, 'TestPass123!');

      const readingData = {
        value: 1234.56,
        readingDate: new Date().toISOString(),
        source: 'manual',
      };

      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .set('Cookie', `accessToken=${token}`)
        .send(readingData)
        .expect(201);  // ✅ EXACT CODE

      expect(response.body).toHaveProperty('value', readingData.value);
      expect(response.body).toHaveProperty('source', readingData.source);
    });

    it('should return 400 for negative reading value', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          value: -100,  // negative
          readingDate: new Date().toISOString(),
          source: 'manual',
        })
        .expect(400);

      expect(response.body.error).toMatch(/value|negative|positive/i);
    });

    it('should return 400 when value is less than previous reading', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const token = await loginUser(user.email, 'TestPass123!');

      // First reading
      await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          value: 1000,
          readingDate: new Date('2026-01-01').toISOString(),
          source: 'manual',
        })
        .expect(201);

      // Try to submit lower reading
      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .set('Cookie', `accessToken=${token}`)
        .send({
          value: 500,  // less than 1000
          readingDate: new Date().toISOString(),
          source: 'manual',
        })
        .expect(400);

      expect(response.body.error).toMatch(/previous|less|greater/i);
    });

    it('should return 404 for non-existent meter', async () => {
      const user = await createTestUser(userRepo);
      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post('/api/v1/meters/00000000-0000-0000-0000-000000000000/readings')
        .set('Cookie', `accessToken=${token}`)
        .send({
          value: 100,
          readingDate: new Date().toISOString(),
          source: 'manual',
        })
        .expect(404);

      expect(response.body.error).toMatch(/not found|meter/i);
    });
  });

  describe('POST /api/v1/meters/readings/ocr', () => {
    it('should process OCR reading from photo', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post('/api/v1/meters/readings/ocr')
        .set('Cookie', `accessToken=${token}`)
        .send({
          meterId: meter.id,
          value: 9876.54,
          readingDate: new Date().toISOString(),
          source: 'ocr',
          photoUrl: '/uploads/meters/photo.jpg',
          ocrConfidence: 0.92,
        })
        .expect(201);

      expect(response.body).toHaveProperty('value', 9876.54);
      expect(response.body).toHaveProperty('ocrConfidence', 0.92);
    });

    it('should require verification for low confidence OCR', async () => {
      const user = await createTestUser(userRepo);
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const token = await loginUser(user.email, 'TestPass123!');

      const response = await request(app)
        .post('/api/v1/meters/readings/ocr')
        .set('Cookie', `accessToken=${token}`)
        .send({
          meterId: meter.id,
          value: 1234,
          readingDate: new Date().toISOString(),
          source: 'ocr',
          ocrConfidence: 0.65,  // low confidence
        });

      // 201 or 202 Accepted are both valid
      expect([201, 202]).toContain(response.status);
      
      if (response.status === 202) {
        expect(response.body.requiresVerification).toBe(true);
      }
    });
  });
});
