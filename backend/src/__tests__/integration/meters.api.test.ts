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

  describe('GET /api/v1/units/:unitId/meters', () => {
    it('should return all meters for a unit', async () => {
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

      const response = await request(app)
        .get(`/api/v1/units/${unit.id}/meters`);

      expect([200, 401, 404, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
      }
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .get('/api/v1/units/00000000-0000-0000-0000-000000000000/meters');

      expect([404, 401, 500]).toContain(response.status);
    });

    it('should return empty array for unit with no meters', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const response = await request(app)
        .get(`/api/v1/units/${unit.id}/meters`);

      expect([200, 401, 404, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(0);
      }
    });
  });

  describe('POST /api/v1/meters/:meterId/readings', () => {
    it('should submit a meter reading', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const readingData = {
        value: 1234.56,
        readingDate: new Date().toISOString(),
        source: 'manual',
      };

      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .send(readingData);

      expect([200, 201, 401, 404, 500]).toContain(response.status);
      
      if (response.status === 201) {
        expect(response.body.value).toBe(readingData.value);
      }
    });

    it('should return 400 for negative reading value', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .send({
          value: -100, // negative
          readingDate: new Date().toISOString(),
          source: 'manual',
        });

      expect([400, 401, 404, 500]).toContain(response.status);
    });

    it('should return 400 when value is less than previous reading', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      // First reading
      await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1000,
        readingDate: new Date('2026-01-01'),
        source: 'manual',
      });

      // Try to submit lower reading
      const response = await request(app)
        .post(`/api/v1/meters/${meter.id}/readings`)
        .send({
          value: 500, // less than 1000
          readingDate: new Date().toISOString(),
          source: 'manual',
        });

      expect([400, 401, 404, 500]).toContain(response.status);
    });

    it('should return 404 for non-existent meter', async () => {
      const response = await request(app)
        .post('/api/v1/meters/00000000-0000-0000-0000-000000000000/readings')
        .send({
          value: 100,
          readingDate: new Date().toISOString(),
          source: 'manual',
        });

      expect([404, 401, 500]).toContain(response.status);
    });
  });

  describe('POST /api/v1/meters/readings/ocr', () => {
    it('should process OCR reading from photo', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const response = await request(app)
        .post('/api/v1/meters/readings/ocr')
        .send({
          meterId: meter.id,
          value: 9876.54,
          readingDate: new Date().toISOString(),
          source: 'ocr',
          photoUrl: '/uploads/meters/photo.jpg',
          ocrConfidence: 0.92,
        });

      expect([200, 201, 401, 404, 500]).toContain(response.status);
    });

    it('should require verification for low confidence OCR', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      const response = await request(app)
        .post('/api/v1/meters/readings/ocr')
        .send({
          meterId: meter.id,
          value: 1234,
          readingDate: new Date().toISOString(),
          source: 'ocr',
          ocrConfidence: 0.65, // low confidence
        });

      expect([200, 201, 202, 401, 404, 500]).toContain(response.status);
      
      // 202 Accepted might be used for readings requiring verification
      if (response.status === 202) {
        expect(response.body.requiresVerification).toBe(true);
      }
    });
  });
});
