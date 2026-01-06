import { AppDataSource } from '../db/data-source';
import { Unit } from '../entities/Unit';
import { logger } from '../utils/logger';

const unitRepository = AppDataSource.getRepository(Unit);

export class UnitService {
  /**
   * Create unit
   */
  async createUnit(data: {
    entranceId: string;
    unitNumber: string;
    floor?: number;
    area?: number;
    bedrooms?: number;
    bathrooms?: number;
  }): Promise<Unit> {
    try {
      const unit = unitRepository.create(data);
      await unitRepository.save(unit);

      logger.info('Unit created', { unitId: unit.id, unitNumber: unit.unitNumber });
      return unit;
    } catch (error) {
      logger.error('Failed to create unit', { error });
      throw error;
    }
  }

  /**
   * Get unit by ID with relations
   */
  async getUnitById(unitId: string): Promise<Unit | null> {
    try {
      return await unitRepository.findOne({
        where: { id: unitId },
        relations: [
          'entrance',
          'entrance.building',
          'entrance.building.condo',
          'residents',
          'residents.user',
        ],
      });
    } catch (error) {
      logger.error('Failed to get unit', { error, unitId });
      throw error;
    }
  }

  /**
   * Get units by entrance
   */
  async getUnitsByEntrance(entranceId: string): Promise<Unit[]> {
    try {
      return await unitRepository.find({
        where: { entranceId, isActive: true },
        relations: ['residents', 'residents.user'],
        order: { unitNumber: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get units by entrance', { error, entranceId });
      throw error;
    }
  }

  /**
   * Get unit by number
   */
  async getUnitByNumber(
    entranceId: string,
    unitNumber: string
  ): Promise<Unit | null> {
    try {
      return await unitRepository.findOne({
        where: { entranceId, unitNumber },
        relations: ['entrance', 'entrance.building', 'entrance.building.condo'],
      });
    } catch (error) {
      logger.error('Failed to get unit by number', { error, entranceId, unitNumber });
      throw error;
    }
  }

  /**
   * Update unit
   */
  async updateUnit(
    unitId: string,
    data: Partial<{
      unitNumber: string;
      floor: number;
      area: number;
      bedrooms: number;
      bathrooms: number;
    }>
  ): Promise<Unit> {
    try {
      const unit = await unitRepository.findOne({
        where: { id: unitId },
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      Object.assign(unit, data);
      await unitRepository.save(unit);

      logger.info('Unit updated', { unitId });
      return unit;
    } catch (error) {
      logger.error('Failed to update unit', { error, unitId });
      throw error;
    }
  }

  /**
   * Delete unit (soft delete)
   */
  async deleteUnit(unitId: string): Promise<void> {
    try {
      const unit = await unitRepository.findOne({
        where: { id: unitId },
      });

      if (!unit) {
        throw new Error('Unit not found');
      }

      unit.isActive = false;
      await unitRepository.save(unit);

      logger.info('Unit deleted', { unitId });
    } catch (error) {
      logger.error('Failed to delete unit', { error, unitId });
      throw error;
    }
  }

  /**
   * Search units in condo
   */
  async searchUnits(condoId: string, query: string): Promise<Unit[]> {
    try {
      return await unitRepository
        .createQueryBuilder('unit')
        .innerJoin('unit.entrance', 'entrance')
        .innerJoin('entrance.building', 'building')
        .where('building.condo_id = :condoId', { condoId })
        .andWhere('unit.is_active = :isActive', { isActive: true })
        .andWhere('LOWER(unit.unit_number) LIKE LOWER(:query)', {
          query: `%${query}%`,
        })
        .orderBy('unit.unit_number', 'ASC')
        .take(20)
        .getMany();
    } catch (error) {
      logger.error('Failed to search units', { error, condoId, query });
      throw error;
    }
  }
}

export const unitService = new UnitService();
