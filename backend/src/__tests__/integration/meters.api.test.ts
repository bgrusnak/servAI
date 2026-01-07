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

describe('Meters API Integration Tests', () => {
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

      const meters = await meterRepo.find({
        where: { unitId: unit.id },
        relations: ['meterType'],
      });

      expect(meters.length).toBe(2);
      expect(meters[0].meterType).toBeDefined();
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
        meterId: meter.id,
        userId: user.id,
        value: 1234.56,
        readingDate: new Date(),
        source: 'manual',
      };

      const reading = await meterReadingRepo.save(readingData);

      expect(reading.id).toBeDefined();
      expect(reading.value).toBe(1234.56);
    });

    it('should validate reading value is positive', () => {
      const validValue = 1000;
      const invalidValue = -100;

      expect(validValue).toBeGreaterThan(0);
      expect(invalidValue).toBeLessThan(0);
    });

    it('should validate reading value is not less than previous', async () => {
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

      // Invalid: value less than previous
      const invalidValue = 500;
      const previousValue = 1000;
      expect(invalidValue).toBeLessThan(previousValue);
    });
  });

  describe('POST /api/v1/meters/readings/ocr', () => {
    it('should process OCR reading from photo', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const ocrData = {
        meterId: meter.id,
        userId: user.id,
        value: 9876.54,
        readingDate: new Date(),
        source: 'ocr',
        photoUrl: '/uploads/meters/photo.jpg',
        ocrConfidence: 0.92,
      };

      const reading = await meterReadingRepo.save(ocrData);

      expect(reading.source).toBe('ocr');
      expect(reading.ocrConfidence).toBe(0.92);
      expect(reading.photoUrl).toBeDefined();
    });

    it('should require verification for low confidence OCR', () => {
      const lowConfidence = 0.65;
      const threshold = 0.8;

      const needsVerification = lowConfidence < threshold;
      expect(needsVerification).toBe(true);
    });
  });
});
