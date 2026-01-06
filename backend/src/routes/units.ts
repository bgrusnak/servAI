import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UnitService } from '../services/unit.service';
import { CondoService } from '../services/condo.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

const unitsRouter = Router();

// All routes require authentication
unitsRouter.use(authenticate);

// List units (filtered by condo)
unitsRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE,
      CONSTANTS.MAX_PAGE_SIZE
    );
    const condoId = req.query.condo_id as string;

    if (!condoId) {
      throw new AppError('condo_id parameter is required', 400);
    }

    // Check user has access to this condo
    const hasAccess = await CondoService.checkUserAccess(condoId, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    const result = await UnitService.listUnits(condoId, page, limit);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get unit by ID
unitsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const unit = await UnitService.getUnitById(req.params.id);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access to condo
    const hasAccess = await CondoService.checkUserAccess(unit.condo_id, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    res.json(unit);
  } catch (error) {
    next(error);
  }
});

// Create unit
unitsRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { 
      condo_id, 
      building_id, 
      entrance_id, 
      unit_type_id, 
      number, 
      floor,
      area_total,
      area_living,
      rooms,
      owner_name,
      owner_phone,
      owner_email,
      is_rented,
    } = req.body;

    if (!condo_id || !unit_type_id || !number) {
      throw new AppError('condo_id, unit_type_id, and number are required', 400);
    }

    // Check if user has admin access to condo
    const hasAccess = await CondoService.checkUserAccess(condo_id, req.user!.id, ['company_admin', 'condo_admin']);

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const unit = await UnitService.createUnit({
      condo_id,
      building_id,
      entrance_id,
      unit_type_id,
      number,
      floor,
      area_total,
      area_living,
      rooms,
      owner_name,
      owner_phone,
      owner_email,
      is_rented,
    });

    res.status(201).json(unit);
  } catch (error) {
    next(error);
  }
});

// Update unit
unitsRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const unit = await UnitService.getUnitById(req.params.id);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(unit.condo_id, req.user!.id, ['company_admin', 'condo_admin']);

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const updated = await UnitService.updateUnit(req.params.id, req.body);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete unit
unitsRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const unit = await UnitService.getUnitById(req.params.id);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(unit.condo_id, req.user!.id, ['company_admin', 'condo_admin']);

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    await UnitService.deleteUnit(req.params.id);

    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { unitsRouter };
