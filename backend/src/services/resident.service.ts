import { AppDataSource } from '../db/data-source';
import { Resident, ResidentRole } from '../entities/Resident';
import { User } from '../entities/User';
import { Unit } from '../entities/Unit';
import { logger } from '../utils/logger';

const residentRepository = AppDataSource.getRepository(Resident);
const userRepository = AppDataSource.getRepository(User);
const unitRepository = AppDataSource.getRepository(Unit);

export class ResidentService {
  /**
   * Add resident to unit
   */
  async addResident(data: {
    userId: string;
    unitId: string;
    role: ResidentRole;
  }): Promise<Resident> {
    try {
      // Check if user exists
      const user = await userRepository.findOne({
        where: { id: data.userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Check if unit exists
      const unit = await unitRepository.findOne({
        where: { id: data.unitId },
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      // Check if already resident
      const existing = await residentRepository.findOne({
        where: {
          userId: data.userId,
          unitId: data.unitId,
        },
      });

      if (existing) {
        throw new Error('User is already a resident of this unit');
      }

      const resident = residentRepository.create(data);
      await residentRepository.save(resident);

      logger.info('Resident added', {
        residentId: resident.id,
        userId: data.userId,
        unitId: data.unitId,
      });

      return resident;
    } catch (error) {
      logger.error('Failed to add resident', { error });
      throw error;
    }
  }

  /**
   * Get resident by ID
   */
  async getResidentById(residentId: string): Promise<Resident | null> {
    try {
      return await residentRepository.findOne({
        where: { id: residentId },
        relations: ['user', 'unit', 'unit.entrance', 'unit.entrance.building'],
      });
    } catch (error) {
      logger.error('Failed to get resident', { error, residentId });
      throw error;
    }
  }

  /**
   * Get residents by unit
   */
  async getResidentsByUnit(unitId: string): Promise<Resident[]> {
    try {
      return await residentRepository.find({
        where: { unitId, isActive: true },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get residents by unit', { error, unitId });
      throw error;
    }
  }

  /**
   * Get units by user
   */
  async getUnitsByUser(userId: string): Promise<Resident[]> {
    try {
      return await residentRepository.find({
        where: { userId, isActive: true },
        relations: [
          'unit',
          'unit.entrance',
          'unit.entrance.building',
          'unit.entrance.building.condo',
        ],
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get units by user', { error, userId });
      throw error;
    }
  }

  /**
   * Update resident role
   */
  async updateResidentRole(
    residentId: string,
    role: ResidentRole
  ): Promise<Resident> {
    try {
      const resident = await residentRepository.findOne({
        where: { id: residentId },
      });

      if (!resident) {
        throw new Error('Resident not found');
      }

      resident.role = role;
      await residentRepository.save(resident);

      logger.info('Resident role updated', { residentId, role });
      return resident;
    } catch (error) {
      logger.error('Failed to update resident role', { error, residentId });
      throw error;
    }
  }

  /**
   * Remove resident from unit
   */
  async removeResident(residentId: string): Promise<void> {
    try {
      const resident = await residentRepository.findOne({
        where: { id: residentId },
      });

      if (!resident) {
        throw new Error('Resident not found');
      }

      resident.isActive = false;
      await residentRepository.save(resident);

      logger.info('Resident removed', { residentId });
    } catch (error) {
      logger.error('Failed to remove resident', { error, residentId });
      throw error;
    }
  }

  /**
   * Check if user is owner of unit
   */
  async isOwner(userId: string, unitId: string): Promise<boolean> {
    try {
      const resident = await residentRepository.findOne({
        where: {
          userId,
          unitId,
          role: ResidentRole.OWNER,
          isActive: true,
        },
      });

      return !!resident;
    } catch (error) {
      logger.error('Failed to check if owner', { error, userId, unitId });
      throw error;
    }
  }
}

export const residentService = new ResidentService();
