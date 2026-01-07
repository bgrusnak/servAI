import { AppDataSource } from '../db/data-source';
import { Building } from '../entities/Building';
import { CondoService } from './condo.service';
import { AppError } from '../middleware/errorHandler';

const buildingRepository = AppDataSource.getRepository(Building);

export class BuildingService {
  static async listBuildings(condoId: string, page: number = 1, limit: number = 10) {
    const [buildings, total] = await buildingRepository.findAndCount({
      where: { condo_id: condoId },
      skip: (page - 1) * limit,
      take: limit,
      order: { number: 'ASC' },
    });

    return {
      data: buildings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getBuildingById(id: string) {
    return await buildingRepository.findOne({ where: { id } });
  }

  static async createBuilding(data: Partial<Building>) {
    const building = buildingRepository.create(data);
    return await buildingRepository.save(building);
  }

  static async updateBuilding(id: string, data: Partial<Building>) {
    await buildingRepository.update(id, data);
    return await this.getBuildingById(id);
  }

  static async deleteBuilding(id: string) {
    await buildingRepository.delete(id);
  }

  /**
   * Check if user has access to building via condo
   */
  static async checkUserAccess(
    condoId: string,
    userId: string,
    allowedRoles?: string[]
  ): Promise<boolean> {
    return await CondoService.checkUserAccess(condoId, userId, allowedRoles);
  }
}
