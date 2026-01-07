import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { MeterType } from '../../entities/MeterType';
import { Meter } from '../../entities/Meter';
import { MeterReading } from '../../entities/MeterReading';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
  createTestUnit,
  createTestMeterType,
  createTestMeter,
} from '../utils/fixtures';

describe('Meter Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let meterTypeRepo: any;
  let meterRepo: any;
  let meterReadingRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    meterTypeRepo = testDataSource.getRepository(MeterType);
    meterRepo = testDataSource.getRepository(Meter);
    meterReadingRepo = testDataSource.getRepository(MeterReading);
  });

  describe('Meter Creation', () => {
    it('should create meter for a unit', async () => {
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

      const serialNumber = 'UNIQUE-SN-' + Date.now();
      await createTestMeter(meterRepo, unit.id, meterType.id, { serialNumber });

      await expect(
        createTestMeter(meterRepo, unit.id, meterType.id, { serialNumber })
      ).rejects.toThrow();
    });
  });

  describe('Meter Readings', () => {
    it('should create meter reading', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading = meterReadingRepo.create({
        meterId: meter.id,
        userId: user.id,
        value: 1234.56,
        readingDate: new Date('2026-01-01'),
        source: 'manual',
        isVerified: false,
      });

      const saved = await meterReadingRepo.save(reading);

      expect(saved.id).toBeDefined();
      expect(saved.value).toBe(1234.56);
      expect(saved.source).toBe('manual');
      expect(saved.isVerified).toBe(false);
    });

    it('should calculate consumption between readings', async () => {
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

      // Second reading
      await meterReadingRepo.save({
        meterId: meter.id,
        userId: user.id,
        value: 1250,
        readingDate: new Date('2026-02-01'),
        source: 'manual',
      });

      const readings = await meterReadingRepo.find({
        where: { meterId: meter.id },
        order: { readingDate: 'ASC' },
      });

      const consumption = readings[1].value - readings[0].value;
      expect(consumption).toBe(250);
    });

    it('should handle OCR readings', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const meterType = await createTestMeterType(meterTypeRepo);
      const meter = await createTestMeter(meterRepo, unit.id, meterType.id);
      const user = await createTestUser(userRepo);

      const reading = meterReadingRepo.create({
        meterId: meter.id,
        userId: user.id,
        value: 5678.90,
        readingDate: new Date(),
        source: 'ocr',
        photoUrl: '/uploads/meters/photo123.jpg',
        ocrConfidence: 0.95,
        isVerified: false,
      });

      const saved = await meterReadingRepo.save(reading);

      expect(saved.source).toBe('ocr');
      expect(saved.photoUrl).toBeDefined();
      expect(saved.ocrConfidence).toBe(0.95);
      expect(saved.isVerified).toBe(false);
    });

    it('should verify reading', async () => {
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
        value: 1111.11,
        readingDate: new Date(),
        source: 'manual',
        isVerified: false,
      });

      reading.isVerified = true;
      reading.verifiedBy = admin.id;
      const verified = await meterReadingRepo.save(reading);

      expect(verified.isVerified).toBe(true);
      expect(verified.verifiedBy).toBe(admin.id);
    });
  });

  describe('Meter Types', () => {
    it('should create different meter types', async () => {
      const types = [
        { name: 'Electricity', unitOfMeasurement: 'kWh' },
        { name: 'Cold Water', unitOfMeasurement: 'm³' },
        { name: 'Hot Water', unitOfMeasurement: 'm³' },
        { name: 'Gas', unitOfMeasurement: 'm³' },
      ];

      for (const typeData of types) {
        const meterType = await createTestMeterType(meterTypeRepo, typeData);
        expect(meterType.name).toBe(typeData.name);
        expect(meterType.unitOfMeasurement).toBe(typeData.unitOfMeasurement);
      }

      const allTypes = await meterTypeRepo.find();
      expect(allTypes.length).toBeGreaterThanOrEqual(4);
    });
  });
});
