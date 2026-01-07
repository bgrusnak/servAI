import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCompany, canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { CondoService } from '../services/condo.service';
import { CompanyService } from '../services/company.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';
import { validate as isUUID } from 'uuid';

const condosRouter = Router();

// All routes require authentication
condosRouter.use(authenticate);

// ✅ List condos (optionally filtered by company)
condosRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE,
      CONSTANTS.MAX_PAGE_SIZE
    );
    const companyId = req.query.company_id as string;

    // ✅ UUID validation if company_id provided
    if (companyId && !isUUID(companyId)) {
      throw new AppError('Invalid company_id format', 400);
    }

    const result = await CondoService.listCondos(req.user!.id, page, limit, companyId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ✅ Get condo by ID
condosRouter.get('/:id', canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid condo ID format', 400);
    }

    const condo = await CondoService.getCondoById(req.params.id, req.user!.id);
    if (!condo) {
      throw new AppError('Condo not found', 404);
    }

    res.json(condo);
  } catch (error) {
    next(error);
  }
});

// ✅ Create condo - FIXED: Use canAccessCompany middleware
condosRouter.post('/', authorize('uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { company_id, name, address, description, total_buildings, total_units } = req.body;

    if (!company_id || !name || !address) {
      throw new AppError('company_id, name, and address are required', 400);
    }

    // ✅ UUID validation
    if (!isUUID(company_id)) {
      throw new AppError('Invalid company_id format', 400);
    }

    // ✅ FIXED: Consistent with other routes
    const hasAccess = await CompanyService.checkUserAccess(company_id, req.user!.id, ['company_admin']);
    if (!hasAccess) {
      throw new AppError('Insufficient permissions to create condo in this company', 403);
    }

    const condo = await CondoService.createCondo({
      company_id,
      name,
      address,
      description,
      total_buildings,
      total_units,
    });

    res.status(201).json(condo);
  } catch (error) {
    next(error);
  }
});

// ✅ Update condo
condosRouter.patch('/:id', authorize('uk_director', 'complex_admin'), canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid condo ID format', 400);
    }

    const { name, address, description, total_buildings, total_units } = req.body;

    const condo = await CondoService.updateCondo(req.params.id, {
      name,
      address,
      description,
      total_buildings,
      total_units,
    });

    res.json(condo);
  } catch (error) {
    next(error);
  }
});

// ✅ Delete condo
condosRouter.delete('/:id', authorize('uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid condo ID format', 400);
    }

    // Check if user has company admin access
    const condo = await CondoService.getCondoById(req.params.id, req.user!.id);
    if (!condo) {
      throw new AppError('Condo not found', 404);
    }

    const hasAccess = await CompanyService.checkUserAccess(condo.company_id, req.user!.id, ['company_admin']);
    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    await CondoService.deleteCondo(req.params.id);
    res.json({ message: 'Condo deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { condosRouter };
