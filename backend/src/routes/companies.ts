import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import { CompanyService } from '../services/company.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

const companiesRouter = Router();

// All routes require authentication
companiesRouter.use(authenticate);

// List companies (user sees only companies where they have roles)
companiesRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE,
      CONSTANTS.MAX_PAGE_SIZE
    );

    const result = await CompanyService.listCompanies(req.user!.id, page, limit);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get company by ID
companiesRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const company = await CompanyService.getCompanyById(req.params.id, req.user!.id);

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    res.json(company);
  } catch (error) {
    next(error);
  }
});

// Create company (system admin only for now, can be opened later)
companiesRouter.post('/', requireRole('system_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
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
  } catch (error) {
    next(error);
  }
});

// Update company
companiesRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check if user has admin role for this company
    const hasAccess = await CompanyService.checkUserAccess(req.params.id, req.user!.id, ['company_admin']);

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
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
  } catch (error) {
    next(error);
  }
});

// Delete company (soft delete)
companiesRouter.delete('/:id', requireRole('system_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await CompanyService.deleteCompany(req.params.id);

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { companiesRouter };
