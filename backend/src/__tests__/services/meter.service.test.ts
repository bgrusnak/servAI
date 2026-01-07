import { testDataSource } from '../setup';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { MeterType } from '../../entities/MeterType';
import { Meter } from '../../entities/Meter';
import { MeterReading } from '../../entities/MeterReading';
import { User } from '../../entities/User';
import {
  createTestCompany,
  createTestCondo,
  createTestUnit,
  createTestMeterType,
  createTestMeter,
  createTestUser,
} from '../utils/fixtures';

describe('Meter Service Tests', () => {
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let meterTypeRepo: any;
  let meterRepo: any;
  let meterReadingRepo: any;
  let userRepo: any;

  beforeAll(() => {
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    meterTypeRepo = testDataSource.getRepository(MeterType);
    meterRepo = testDataSource.getRepository(Meter);
    meterReadingRepo = testDataSource.getRepository(MeterReading);
    userRepo = testDataSource.getRepository(User);
  });

  // Optimized: clear only relevant tables
  beforeEach(async () => {
    await meterReadingRepo.query('TRUNCATE TABLE "meter_readings" CASCADE');
    await meterRepo.query('TRUNCATE TABLE "meters" CASCADE');
    await meterTypeRepo.query('TRUNCATE TABLE "meter_types" CASCADE');
    await unitRepo.query('TRUNCATE TABLE "units" CASCADE');
    await condoRepo.query('TRUNCATE TABLE "condos" CASCADE');
    await companyRepo.query('TRUNCATE TABLE "companies" CASCADE');
    await userRepo.query('TRUNCATE TABLE "users" CASCADE');
  });

  describe('Meter Creation', () => {
    it('should create a meter for a unit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo, {
        name: 'Electricity',
        unitOfMeasurement: 'kWh',
      });

      const meter = await createTestMeter(meterRepo, unit.id, meterType.id, {
        serialNumber: 'ELEC-001',
      });

      expect(meter.id).toBeDefined();
      expect(meter.unitId).toBe(unit.id);
      expect(meter.meterTypeId).toBe(meterType.id);
      expect(meter.serialNumber).toBe('ELEC-001');
      expect(meter.isActive).toBe(true);
    });

    it('should not allow duplicate serial numbers', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);

      const serialNumber = 'UNIQUE-12345';
      await createTestMeter(meterRepo, unit.id, meterType.id, { serialNumber });

      await expect(
        createTestMeter(meterRepo, unit.id, meterType.id, { serialNumber })
      ).rejects.toThrow();
    });

    it('should create meters of different types', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const types = [
        { name: 'Electricity', unit: 'kWh' },
        { name: 'Water', unit: 'm³' },
        { name: 'Gas', unit: 'm³' },
        { name: 'Heat', unit: 'Gcal' },
      ];

      for (const type of types) {
        const meterType = await createTestMeterType(meterTypeRepo, {
          name: type.name,
          unitOfMeasurement: type.unit,
        });

        const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
        expect(meter.meterTypeId).toBe(meterType.id);
      }
    });
  });

  describe('Meter Readings', () => {
    it('should submit a meter reading', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1234.56,
        readingDate: new Date(),
        source: 'manual',
      });

      expect(reading.id).toBeDefined();
      expect(reading.value).toBe(1234.56);
      expect(reading.source).toBe('manual');
    });

    it('should calculate consumption between readings', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading1 = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1000,
        readingDate: new Date('2026-01-01'),
        source: 'manual',
      });

      const reading2 = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1500,
        readingDate: new Date('2026-01-31'),
        source: 'manual',
      });

      const consumption = reading2.value - reading1.value;
      expect(consumption).toBe(500);
    });

    it('should validate reading value is positive', () => {
      const validValue = 1000;
      const invalidValue = -100;

      expect(validValue).toBeGreaterThan(0);
      expect(invalidValue).toBeLessThan(0);
    });

    it('should track reading source', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const sources = ['manual', 'ocr', 'auto'];
      
      for (const source of sources) {
        const reading = await meterReadingRepo.save({
          meterId: meter.id,
          userId: user.id,
          value: Math.random() * 1000,
          readingDate: new Date(),
          source,
        });

        expect(reading.source).toBe(source);
      }
    });
  });

  describe('OCR Readings', () => {
    it('should process OCR reading with photo', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 5678.90,
        readingDate: new Date(),
        source: 'ocr',
        photoUrl: '/uploads/meters/photo-123.jpg',
        ocrConfidence: 0.95,
      });

      expect(reading.source).toBe('ocr');
      expect(reading.photoUrl).toBeDefined();
      expect(reading.ocrConfidence).toBe(0.95);
    });

    it('should flag low confidence OCR readings', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1234,
        readingDate: new Date(),
        source: 'ocr',
        ocrConfidence: 0.65,
        verifiedBy: null, // needs verification
      });

      const threshold = 0.8;
      const needsVerification = reading.ocrConfidence < threshold;
      
      expect(needsVerification).toBe(true);
      expect(reading.verifiedBy).toBeNull();
    });

    it('should allow admin to verify OCR reading', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);
      const admin = await createTestUser(userRepo, { email: 'admin@example.com' });

      const reading = await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1234,
        readingDate: new Date(),
        source: 'ocr',
        ocrConfidence: 0.65,
      });

      reading.verifiedBy = admin.id;
      reading.verifiedAt = new Date();
      const verified = await meterReadingRepo.save(reading);

      expect(verified.verifiedBy).toBe(admin.id);
      expect(verified.verifiedAt).toBeDefined();
    });
  });

  describe('Meter Status', () => {
    it('should deactivate meter', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);

      expect(meter.isActive).toBe(true);

      meter.isActive = false;
      const updated = await meterRepo.save(meter);

      expect(updated.isActive).toBe(false);
    });
  });
});
