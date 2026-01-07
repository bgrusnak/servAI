import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { EntranceService } from '../services/entrance.service';
import { BuildingService } from '../services/building.service';
import { CondoService } from '../services/condo.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';
import { validate as isUUID } from 'uuid';

const entrancesRouter = Router();

entrancesRouter.use(authenticate);

// List entrances (by building)
entrancesRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE),
    CONSTANTS.MAX_PAGE_SIZE
  );
  const buildingId = req.query.building_id as string;

  if (!buildingId) {
    throw new AppError('building_id parameter is required', 400);
  }

  if (!isUUID(buildingId)) {
    throw new AppError('Invalid building_id format', 400);
  }

  const building = await BuildingService.getBuildingById(buildingId);
  if (!building) {
    throw new AppError('Building not found', 404);
  }

  const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
  if (!hasAccess) {
    throw new AppError('Access denied', 403);
  }

  const result = await EntranceService.listEntrances(buildingId, page, limit);
  res.json(result);
});

// Get entrance by ID
entrancesRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.id)) {
    throw new AppError('Invalid entrance ID format', 400);
  }

  const entrance = await EntranceService.getEntranceById(req.params.id);
  if (!entrance) {
    throw new AppError('Entrance not found', 404);
  }

  const building = await BuildingService.getBuildingById(entrance.building_id);
  if (!building) {
    throw new AppError('Building not found', 404);
  }

  const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
  if (!hasAccess) {
    throw new AppError('Access denied', 403);
  }

  res.json(entrance);
});

// Create entrance - UNIFIED: Use service check
entrancesRouter.post('/', 
  authorize('complex_admin', 'uk_director'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { building_id, number, floors, units_count } = req.body;

    if (!building_id || !number) {
      throw new AppError('building_id and number are required', 400);
    }

    if (!isUUID(building_id)) {
      throw new AppError('Invalid building_id format', 400);
    }

    const building = await BuildingService.getBuildingById(building_id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

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
});

// Update entrance - UNIFIED
entrancesRouter.patch('/:id', 
  authorize('complex_admin', 'uk_director'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid entrance ID format', 400);
    }

    const entrance = await EntranceService.getEntranceById(req.params.id);
    if (!entrance) {
      throw new AppError('Entrance not found', 404);
    }

    const building = await BuildingService.getBuildingById(entrance.building_id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

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
});

// Delete entrance - UNIFIED
entrancesRouter.delete('/:id', 
  authorize('complex_admin', 'uk_director'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid entrance ID format', 400);
    }

    const entrance = await EntranceService.getEntranceById(req.params.id);
    if (!entrance) {
      throw new AppError('Entrance not found', 404);
    }

    const building = await BuildingService.getBuildingById(entrance.building_id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

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
});

export { entrancesRouter };
