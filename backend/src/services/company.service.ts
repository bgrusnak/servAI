import { AppDataSource } from '../db/data-source';
import { Company } from '../entities/Company';
import { logger } from '../utils/logger';

const companyRepository = AppDataSource.getRepository(Company);

export class CompanyService {
  /**
   * Create company
   */
  async createCompany(data: {
    name: string;
    legalName: string;
    taxId: string;
    email: string;
    phoneNumber?: string;
    address?: string;
    city?: string;
    country?: string;
  }): Promise<Company> {
    try {
      // Check if company with this tax ID already exists
      const existing = await companyRepository.findOne({
        where: { taxId: data.taxId },
      });

      if (existing) {
        throw new Error('Company with this tax ID already exists');
      }

      const company = companyRepository.create(data);
      await companyRepository.save(company);

      logger.info('Company created', { companyId: company.id, name: company.name });
      return company;
    } catch (error) {
      logger.error('Failed to create company', { error });
      throw error;
    }
  }

  /**
   * Get company by ID
   */
  async getCompanyById(companyId: string): Promise<Company | null> {
    try {
      return await companyRepository.findOne({
        where: { id: companyId },
        relations: ['condos'],
      });
    } catch (error) {
      logger.error('Failed to get company', { error, companyId });
      throw error;
    }
  }

  /**
   * Get all companies
   */
  async getAllCompanies(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ companies: Company[]; total: number }> {
    try {
      const [companies, total] = await companyRepository.findAndCount({
        where: { isActive: true },
        order: { name: 'ASC' },
        take: limit,
        skip: offset,
      });

      return { companies, total };
    } catch (error) {
      logger.error('Failed to get companies', { error });
      throw error;
    }
  }

  /**
   * Update company
   */
  async updateCompany(
    companyId: string,
    data: Partial<{
      name: string;
      legalName: string;
      email: string;
      phoneNumber: string;
      address: string;
      city: string;
      country: string;
    }>
  ): Promise<Company> {
    try {
      const company = await companyRepository.findOne({
        where: { id: companyId },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      Object.assign(company, data);
      await companyRepository.save(company);

      logger.info('Company updated', { companyId });
      return company;
    } catch (error) {
      logger.error('Failed to update company', { error, companyId });
      throw error;
    }
  }

  /**
   * Delete company (soft delete)
   */
  async deleteCompany(companyId: string): Promise<void> {
    try {
      const company = await companyRepository.findOne({
        where: { id: companyId },
      });

      if (!company) {
        throw new Error('Company not found');
      }

      company.isActive = false;
      await companyRepository.save(company);

      logger.info('Company deleted', { companyId });
    } catch (error) {
      logger.error('Failed to delete company', { error, companyId });
      throw error;
    }
  }

  /**
   * Search companies by name
   */
  async searchCompanies(query: string): Promise<Company[]> {
    try {
      return await companyRepository
        .createQueryBuilder('company')
        .where('company.is_active = :isActive', { isActive: true })
        .andWhere(
          '(LOWER(company.name) LIKE LOWER(:query) OR LOWER(company.legal_name) LIKE LOWER(:query))',
          { query: `%${query}%` }
        )
        .orderBy('company.name', 'ASC')
        .take(20)
        .getMany();
    } catch (error) {
      logger.error('Failed to search companies', { error, query });
      throw error;
    }
  }
}

export const companyService = new CompanyService();
