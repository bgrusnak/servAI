import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { EntranceService } from '../services/entrance.service';
import { BuildingService } from '../services/building.service';
import { CondoService } from '../services/condo.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

const entrancesRouter = Router();

// All routes require authentication
entrancesRouter.use(authenticate);

// List entrances (by building)
entrancesRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE,
      CONSTANTS.MAX_PAGE_SIZE
    );
    const buildingId = req.query.building_id as string;

    if (!buildingId) {
      throw new AppError('building_id parameter is required', 400);
    }

    // Get building to check access
    const building = await BuildingService.getBuildingById(buildingId);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    const result = await EntranceService.listEntrances(buildingId, page, limit);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get entrance by ID
entrancesRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const entrance = await EntranceService.getEntranceById(req.params.id);

    if (!entrance) {
      throw new AppError('Entrance not found', 404);
    }

    // Get building to check access
    const building = await BuildingService.getBuildingById(entrance.building_id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    res.json(entrance);
  } catch (error) {
    next(error);
  }
});

// Create entrance
entrancesRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { building_id, number, floors, units_count } = req.body;

    if (!building_id || !number) {
      throw new AppError('building_id and number are required', 400);
    }

    // Get building to check access
    const building = await BuildingService.getBuildingById(building_id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const entrance = await EntranceService.createEntrance({
      building_id,
      number,
      floors,
      units_count,
    });

    res.status(201).json(entrance);
  } catch (error) {
    next(error);
  }
});

// Update entrance
entrancesRouter.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const entrance = await EntranceService.getEntranceById(req.params.id);

    if (!entrance) {
      throw new AppError('Entrance not found', 404);
    }

    const building = await BuildingService.getBuildingById(entrance.building_id);
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

    const updated = await EntranceService.updateEntrance(req.params.id, req.body);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Delete entrance
entrancesRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const entrance = await EntranceService.getEntranceById(req.params.id);

    if (!entrance) {
      throw new AppError('Entrance not found', 404);
    }

    const building = await BuildingService.getBuildingById(entrance.building_id);
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

    await EntranceService.deleteEntrance(req.params.id);

    res.json({ message: 'Entrance deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { entrancesRouter };
