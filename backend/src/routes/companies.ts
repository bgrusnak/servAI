import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { canAccessCompany, authorize } from '../middleware/authorize.middleware';
import { CompanyService } from '../services/company.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';
import { validate as isUUID } from 'uuid';

const companiesRouter = Router();

companiesRouter.use(authenticate);

// List companies (user sees only companies where they have roles)
companiesRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE),
    CONSTANTS.MAX_PAGE_SIZE
  );

  const result = await CompanyService.listCompanies(req.user!.id, page, limit);
  res.json(result);
});

// Get company by ID
companiesRouter.get('/:id', canAccessCompany(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.id)) {
    throw new AppError('Invalid company ID format', 400);
  }

  const company = await CompanyService.getCompanyById(req.params.id, req.user!.id);
  if (!company) {
    throw new AppError('Company not found', 404);
  }

  res.json(company);
});

// Create company (system admin only)
companiesRouter.post('/', 
  authorize('superadmin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { name, legal_name, inn, kpp, address, phone, email, website } = req.body;

    if (!name) {
      throw new AppError('Company name is required', 400);
    }

    const company = await CompanyService.createCompany({
      name,
      legal_name,
      inn,
      kpp,
      address,
      phone,
      email,
      website,
    }, req.user!.id);

    res.status(201).json(company);
});

// Update company
companiesRouter.patch('/:id', 
  authorize('uk_director'), 
  canAccessCompany(), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid company ID format', 400);
    }

    const { name, legal_name, inn, kpp, address, phone, email, website, is_active } = req.body;

    const company = await CompanyService.updateCompany(req.params.id, {
      name,
      legal_name,
      inn,
      kpp,
      address,
      phone,
      email,
      website,
      is_active,
    });

    res.json(company);
});

// Delete company (soft delete)
companiesRouter.delete('/:id', 
  authorize('superadmin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid company ID format', 400);
    }

    await CompanyService.deleteCompany(req.params.id);
    res.json({ message: 'Company deleted successfully' });
});

export { companiesRouter };
