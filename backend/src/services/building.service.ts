import { AppDataSource } from '../db/data-source';
import { Building } from '../entities/Building';
import { logger } from '../utils/logger';

const buildingRepository = AppDataSource.getRepository(Building);

export class BuildingService {
  /**
   * Create building
   */
  async createBuilding(data: {
    condoId: string;
    name: string;
    address?: string;
    floors?: number;
  }): Promise<Building> {
    try {
      const building = buildingRepository.create(data);
      await buildingRepository.save(building);

      logger.info('Building created', { buildingId: building.id, name: building.name });
      return building;
    } catch (error) {
      logger.error('Failed to create building', { error });
      throw error;
    }
  }

  /**
   * Get building by ID
   */
  async getBuildingById(buildingId: string): Promise<Building | null> {
    try {
      return await buildingRepository.findOne({
        where: { id: buildingId },
        relations: ['condo', 'entrances'],
      });
    } catch (error) {
      logger.error('Failed to get building', { error, buildingId });
      throw error;
    }
  }

  /**
   * Get buildings by condo
   */
  async getBuildingsByCondo(condoId: string): Promise<Building[]> {
    try {
      return await buildingRepository.find({
        where: { condoId, isActive: true },
        relations: ['entrances'],
        order: { name: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get buildings by condo', { error, condoId });
      throw error;
    }
  }

  /**
   * Update building
   */
  async updateBuilding(
    buildingId: string,
    data: Partial<{
      name: string;
      address: string;
      floors: number;
    }>
  ): Promise<Building> {
    try {
      const building = await buildingRepository.findOne({
        where: { id: buildingId },
      });

      if (!building) {
        throw new Error('Building not found');
      }

      Object.assign(building, data);
      await buildingRepository.save(building);

      logger.info('Building updated', { buildingId });
      return building;
    } catch (error) {
      logger.error('Failed to update building', { error, buildingId });
      throw error;
    }
  }

  /**
   * Delete building (soft delete)
   */
  async deleteBuilding(buildingId: string): Promise<void> {
    try {
      const building = await buildingRepository.findOne({
        where: { id: buildingId },
      });

      if (!building) {
        throw new Error('Building not found');
      }

      building.isActive = false;
      await buildingRepository.save(building);

      logger.info('Building deleted', { buildingId });
    } catch (error) {
      logger.error('Failed to delete building', { error, buildingId });
      throw error;
    }
  }
}

export const buildingService = new BuildingService();
