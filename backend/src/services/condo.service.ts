import { AppDataSource } from '../db/data-source';
import { Condo } from '../entities/Condo';
import { logger } from '../utils/logger';

const condoRepository = AppDataSource.getRepository(Condo);

export class CondoService {
  /**
   * Create condo
   */
  async createCondo(data: {
    companyId: string;
    name: string;
    address: string;
    city: string;
    country: string;
    postalCode?: string;
    totalUnits?: number;
  }): Promise<Condo> {
    try {
      const condo = condoRepository.create(data);
      await condoRepository.save(condo);

      logger.info('Condo created', { condoId: condo.id, name: condo.name });
      return condo;
    } catch (error) {
      logger.error('Failed to create condo', { error });
      throw error;
    }
  }

  /**
   * Get condo by ID with relations
   */
  async getCondoById(condoId: string): Promise<Condo | null> {
    try {
      return await condoRepository.findOne({
        where: { id: condoId },
        relations: ['company', 'buildings'],
      });
    } catch (error) {
      logger.error('Failed to get condo', { error, condoId });
      throw error;
    }
  }

  /**
   * Get condos by company
   */
  async getCondosByCompany(
    companyId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ condos: Condo[]; total: number }> {
    try {
      const [condos, total] = await condoRepository.findAndCount({
        where: { companyId, isActive: true },
        relations: ['buildings'],
        order: { name: 'ASC' },
        take: limit,
        skip: offset,
      });

      return { condos, total };
    } catch (error) {
      logger.error('Failed to get condos by company', { error, companyId });
      throw error;
    }
  }

  /**
   * Update condo
   */
  async updateCondo(
    condoId: string,
    data: Partial<{
      name: string;
      address: string;
      city: string;
      country: string;
      postalCode: string;
      totalUnits: number;
    }>
  ): Promise<Condo> {
    try {
      const condo = await condoRepository.findOne({
        where: { id: condoId },
      });

      if (!condo) {
        throw new Error('Condo not found');
      }

      Object.assign(condo, data);
      await condoRepository.save(condo);

      logger.info('Condo updated', { condoId });
      return condo;
    } catch (error) {
      logger.error('Failed to update condo', { error, condoId });
      throw error;
    }
  }

  /**
   * Delete condo (soft delete)
   */
  async deleteCondo(condoId: string): Promise<void> {
    try {
      const condo = await condoRepository.findOne({
        where: { id: condoId },
      });

      if (!condo) {
        throw new Error('Condo not found');
      }

      condo.isActive = false;
      await condoRepository.save(condo);

      logger.info('Condo deleted', { condoId });
    } catch (error) {
      logger.error('Failed to delete condo', { error, condoId });
      throw error;
    }
  }

  /**
   * Search condos
   */
  async searchCondos(query: string, companyId?: string): Promise<Condo[]> {
    try {
      const queryBuilder = condoRepository
        .createQueryBuilder('condo')
        .where('condo.is_active = :isActive', { isActive: true })
        .andWhere(
          '(LOWER(condo.name) LIKE LOWER(:query) OR LOWER(condo.address) LIKE LOWER(:query))',
          { query: `%${query}%` }
        );

      if (companyId) {
        queryBuilder.andWhere('condo.company_id = :companyId', { companyId });
      }

      return await queryBuilder
        .orderBy('condo.name', 'ASC')
        .take(20)
        .getMany();
    } catch (error) {
      logger.error('Failed to search condos', { error, query });
      throw error;
    }
  }

  /**
   * Get condo with full structure
   */
  async getCondoWithStructure(condoId: string): Promise<Condo | null> {
    try {
      return await condoRepository.findOne({
        where: { id: condoId },
        relations: [
          'buildings',
          'buildings.entrances',
          'buildings.entrances.units',
        ],
      });
    } catch (error) {
      logger.error('Failed to get condo with structure', { error, condoId });
      throw error;
    }
  }
}

export const condoService = new CondoService();
