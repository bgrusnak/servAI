import { AppDataSource } from '../db/data-source';
import { Entrance } from '../entities/Entrance';
import { logger } from '../utils/logger';

const entranceRepository = AppDataSource.getRepository(Entrance);

export class EntranceService {
  /**
   * Create entrance
   */
  async createEntrance(data: {
    buildingId: string;
    name: string;
    floors?: number;
  }): Promise<Entrance> {
    try {
      const entrance = entranceRepository.create(data);
      await entranceRepository.save(entrance);

      logger.info('Entrance created', { entranceId: entrance.id, name: entrance.name });
      return entrance;
    } catch (error) {
      logger.error('Failed to create entrance', { error });
      throw error;
    }
  }

  /**
   * Get entrance by ID
   */
  async getEntranceById(entranceId: string): Promise<Entrance | null> {
    try {
      return await entranceRepository.findOne({
        where: { id: entranceId },
        relations: ['building', 'units'],
      });
    } catch (error) {
      logger.error('Failed to get entrance', { error, entranceId });
      throw error;
    }
  }

  /**
   * Get entrances by building
   */
  async getEntrancesByBuilding(buildingId: string): Promise<Entrance[]> {
    try {
      return await entranceRepository.find({
        where: { buildingId, isActive: true },
        relations: ['units'],
        order: { name: 'ASC' },
      });
    } catch (error) {
      logger.error('Failed to get entrances by building', { error, buildingId });
      throw error;
    }
  }

  /**
   * Update entrance
   */
  async updateEntrance(
    entranceId: string,
    data: Partial<{
      name: string;
      floors: number;
    }>
  ): Promise<Entrance> {
    try {
      const entrance = await entranceRepository.findOne({
        where: { id: entranceId },
      });

      if (!entrance) {
        throw new Error('Entrance not found');
      }

      Object.assign(entrance, data);
      await entranceRepository.save(entrance);

      logger.info('Entrance updated', { entranceId });
      return entrance;
    } catch (error) {
      logger.error('Failed to update entrance', { error, entranceId });
      throw error;
    }
  }

  /**
   * Delete entrance (soft delete)
   */
  async deleteEntrance(entranceId: string): Promise<void> {
    try {
      const entrance = await entranceRepository.findOne({
        where: { id: entranceId },
      });

      if (!entrance) {
        throw new Error('Entrance not found');
      }

      entrance.isActive = false;
      await entranceRepository.save(entrance);

      logger.info('Entrance deleted', { entranceId });
    } catch (error) {
      logger.error('Failed to delete entrance', { error, entranceId });
      throw error;
    }
  }
}

export const entranceService = new EntranceService();
