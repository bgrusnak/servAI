import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { BuildingService } from '../services/building.service';
import { CondoService } from '../services/condo.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

const buildingsRouter = Router();

// All routes require authentication
buildingsRouter.use(authenticate);

// List buildings (by condo)
buildingsRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    // Check access
    const hasAccess = await CondoService.checkUserAccess(condoId, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    const result = await BuildingService.listBuildings(condoId, page, limit);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get building by ID
buildingsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    res.json(building);
  } catch (error) {
    next(error);
  }
});

// Create building
buildingsRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { condo_id, number, address, floors, units_count } = req.body;

    if (!condo_id || !number) {
      throw new AppError('condo_id and number are required', 400);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const building = await BuildingService.createBuilding({
      condo_id,
      number,
      address,
      floors,
      units_count,
    });

    res.status(201).json(building);
  } catch (error) {
    next(error);
  }
});

// Update building
buildingsRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const updated = await BuildingService.updateBuilding(req.params.id, req.body);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete building
buildingsRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    await BuildingService.deleteBuilding(req.params.id);

    res.json({ message: 'Building deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { buildingsRouter };
