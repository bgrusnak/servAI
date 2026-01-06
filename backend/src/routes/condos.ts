import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CondoService } from '../services/condo.service';
import { CompanyService } from '../services/company.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

const condosRouter = Router();

// All routes require authentication
condosRouter.use(authenticate);

// List condos (optionally filtered by company)
condosRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE,
      CONSTANTS.MAX_PAGE_SIZE
    );
    const companyId = req.query.company_id as string;

    const result = await CondoService.listCondos(req.user!.id, page, limit, companyId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get condo by ID
condosRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const condo = await CondoService.getCondoById(req.params.id, req.user!.id);

    if (!condo) {
      throw new AppError('Condo not found', 404);
    }

    res.json(condo);
  } catch (error) {
    next(error);
  }
});

// Create condo
condosRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { company_id, name, address, description, total_buildings, total_units } = req.body;

    if (!company_id || !name || !address) {
      throw new AppError('company_id, name, and address are required', 400);
    }

    // Check if user has admin access to company
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

// Update condo
condosRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check if user has access to this condo
    const hasAccess = await CondoService.checkUserAccess(req.params.id, req.user!.id, ['company_admin', 'condo_admin']);

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
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

// Delete condo
condosRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
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
