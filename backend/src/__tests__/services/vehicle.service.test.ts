import { testDataSource } from '../setup';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { Vehicle } from '../../entities/Vehicle';
import { VehicleAccessLog } from '../../entities/VehicleAccessLog';
import {
  createTestCompany,
  createTestCondo,
  createTestUnit,
} from '../utils/fixtures';

describe('Vehicle Service Tests', () => {
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let vehicleRepo: any;
  let accessLogRepo: any;

  beforeAll(() => {
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    vehicleRepo = testDataSource.getRepository(Vehicle);
    accessLogRepo = testDataSource.getRepository(VehicleAccessLog);
  });

  describe('Vehicle Registration', () => {
    it('should register a vehicle', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const vehicle = await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'A123BC77',
        make: 'Toyota',
        model: 'Camry',
        color: 'White',
        year: 2023,
        isActive: true,
      });

      expect(vehicle.id).toBeDefined();
      expect(vehicle.licensePlate).toBe('A123BC77');
      expect(vehicle.isActive).toBe(true);
    });

    it('should not allow duplicate license plates', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const licensePlate = 'X999YZ77';

      await vehicleRepo.save({
        unitId: unit.id,
        licensePlate,
        make: 'BMW',
        model: 'X5',
        isActive: true,
      });

      await expect(
        vehicleRepo.save({
          unitId: unit.id,
          licensePlate,
          make: 'Mercedes',
          model: 'E-Class',
          isActive: true,
        })
      ).rejects.toThrow();
    });
  });

  describe('Access Logs', () => {
    it('should log vehicle entry', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const vehicle = await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'T555ES77',
        isActive: true,
      });

      const accessLog = await accessLogRepo.save({
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        accessType: 'entry',
        gateLocation: 'Main Gate',
      });

      expect(accessLog.id).toBeDefined();
      expect(accessLog.accessType).toBe('entry');
      expect(accessLog.gateLocation).toBe('Main Gate');
    });

    it('should log vehicle exit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const vehicle = await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'E111XT77',
        isActive: true,
      });

      const accessLog = await accessLogRepo.save({
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        accessType: 'exit',
        gateLocation: 'Side Gate',
      });

      expect(accessLog.accessType).toBe('exit');
    });

    it('should log unknown vehicle', async () => {
      const accessLog = await accessLogRepo.save({
        licensePlate: 'UNKNOWN123',
        accessType: 'entry',
        notes: 'Unregistered vehicle',
      });

      expect(accessLog.vehicleId).toBeUndefined();
      expect(accessLog.notes).toBe('Unregistered vehicle');
    });

    it('should store photo URL', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const vehicle = await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'P777HO77',
        isActive: true,
      });

      const accessLog = await accessLogRepo.save({
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        accessType: 'entry',
        photoUrl: '/uploads/access/photo123.jpg',
      });

      expect(accessLog.photoUrl).toBeDefined();
    });
  });

  describe('Vehicle Management', () => {
    it('should deactivate vehicle', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      const vehicle = await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'D333AC77',
        isActive: true,
      });

      vehicle.isActive = false;
      const updated = await vehicleRepo.save(vehicle);

      expect(updated.isActive).toBe(false);
    });

    it('should find vehicles by unit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);

      await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'CAR1-77',
        isActive: true,
      });

      await vehicleRepo.save({
        unitId: unit.id,
        licensePlate: 'CAR2-77',
        isActive: true,
      });

      const vehicles = await vehicleRepo.find({
        where: { unitId: unit.id, isActive: true },
      });

      expect(vehicles.length).toBe(2);
    });
  });
});
