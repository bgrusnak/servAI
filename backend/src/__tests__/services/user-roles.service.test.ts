import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { Company } from '../../entities/Company';
import { Condo } from '../../entities/Condo';
import { Unit } from '../../entities/Unit';
import { UserRole } from '../../entities/UserRole';
import { Resident } from '../../entities/Resident';
import {
  createTestUser,
  createTestCompany,
  createTestCondo,
  createTestUnit,
} from '../utils/fixtures';

describe('User Roles Service Tests', () => {
  let userRepo: any;
  let companyRepo: any;
  let condoRepo: any;
  let unitRepo: any;
  let userRoleRepo: any;
  let residentRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
    companyRepo = testDataSource.getRepository(Company);
    condoRepo = testDataSource.getRepository(Condo);
    unitRepo = testDataSource.getRepository(Unit);
    userRoleRepo = testDataSource.getRepository(UserRole);
    residentRepo = testDataSource.getRepository(Resident);
  });

  describe('Role Assignment', () => {
    it('should assign super_admin role', async () => {
      const user = await createTestUser(userRepo);

      const role = await userRoleRepo.save({
        userId: user.id,
        role: 'super_admin',
      });

      expect(role.id).toBeDefined();
      expect(role.role).toBe('super_admin');
      expect(role.condoId).toBeUndefined();
    });

    it('should assign condo-specific admin role', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const user = await createTestUser(userRepo);

      const role = await userRoleRepo.save({
        userId: user.id,
        condoId: condo.id,
        role: 'admin',
      });

      expect(role.condoId).toBe(condo.id);
      expect(role.role).toBe('admin');
    });

    it('should assign resident role to unit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const role = await userRoleRepo.save({
        userId: user.id,
        condoId: condo.id,
        unitId: unit.id,
        role: 'resident',
      });

      expect(role.unitId).toBe(unit.id);
      expect(role.role).toBe('resident');
    });
  });

  describe('Residents', () => {
    it('should create resident for unit', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const resident = await residentRepo.save({
        userId: user.id,
        unitId: unit.id,
        isOwner: true,
        moveInDate: new Date('2025-01-01'),
      });

      expect(resident.id).toBeDefined();
      expect(resident.isOwner).toBe(true);
      expect(resident.moveInDate).toBeDefined();
    });

    it('should handle tenant (non-owner) residents', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const resident = await residentRepo.save({
        userId: user.id,
        unitId: unit.id,
        isOwner: false,
        moveInDate: new Date('2025-06-01'),
      });

      expect(resident.isOwner).toBe(false);
    });

    it('should track move-out date', async () => {
      const company = await createTestCompany(companyRepo);
      const condo = await createTestCondo(condoRepo, company.id);
      const unit = await createTestUnit(unitRepo, condo.id);
      const user = await createTestUser(userRepo);

      const resident = await residentRepo.save({
        userId: user.id,
        unitId: unit.id,
        isOwner: false,
        moveInDate: new Date('2024-01-01'),
        moveOutDate: new Date('2025-12-31'),
      });

      expect(resident.moveOutDate).toBeDefined();
      expect(resident.moveOutDate!.getFullYear()).toBe(2025);
    });
  });

  describe('Multiple Roles', () => {
    it('should allow user to have multiple roles in different condos', async () => {
      const company = await createTestCompany(companyRepo);
      const condo1 = await createTestCondo(condoRepo, company.id, { name: 'Condo 1' });
      const condo2 = await createTestCondo(condoRepo, company.id, { name: 'Condo 2' });
      const user = await createTestUser(userRepo);

      const role1 = await userRoleRepo.save({
        userId: user.id,
        condoId: condo1.id,
        role: 'admin',
      });

      const role2 = await userRoleRepo.save({
        userId: user.id,
        condoId: condo2.id,
        role: 'manager',
      });

      const userRoles = await userRoleRepo.find({
        where: { userId: user.id },
      });

      expect(userRoles.length).toBe(2);
      expect(userRoles[0].role).not.toBe(userRoles[1].role);
    });
  });
});
