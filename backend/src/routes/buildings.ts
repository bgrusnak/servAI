import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { BuildingService } from '../services/building.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';
import { validate as isUUID } from 'uuid';

const buildingsRouter = Router();

buildingsRouter.use(authenticate);

// List buildings (by condo)
buildingsRouter.get('/', canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(req.query.limit as string) || CONSTANTS.DEFAULT_PAGE_SIZE),
    CONSTANTS.MAX_PAGE_SIZE
  );
  const condoId = req.query.condo_id as string;

  if (!condoId) {
    throw new AppError('condo_id parameter is required', 400);
  }

  if (!isUUID(condoId)) {
    throw new AppError('Invalid condo_id format', 400);
  }

  const result = await BuildingService.listBuildings(condoId, page, limit);
  res.json(result);
});

// Get building by ID
buildingsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.id)) {
    throw new AppError('Invalid building ID format', 400);
  }

  const building = await BuildingService.getBuildingById(req.params.id);
  if (!building) {
    throw new AppError('Building not found', 404);
  }

  // Check access using service (consistent with PATCH/DELETE)
  const hasAccess = await BuildingService.checkUserAccess(
    building.condo_id,
    req.user!.id
  );

  if (!hasAccess) {
    throw new AppError('Access denied', 403);
  }

  res.json(building);
});

// Create building - FIXED: Now canAccessCondo() reads from body
buildingsRouter.post('/', 
  authorize('complex_admin', 'uk_director'), 
  canAccessCondo(), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { condo_id, number, address, floors, units_count } = req.body;

    if (!condo_id || !number) {
      throw new AppError('condo_id and number are required', 400);
    }

    if (!isUUID(condo_id)) {
      throw new AppError('Invalid condo_id format', 400);
    }

    const building = await BuildingService.createBuilding({
      condo_id,
      number,
      address,
      floors,
      units_count,
    });

    res.status(201).json(building);
});

// Update building - UNIFIED: Use middleware + service check
buildingsRouter.patch('/:id', 
  authorize('complex_admin', 'uk_director'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid building ID format', 400);
    }

    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access using service
    const hasAccess = await BuildingService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    const updated = await BuildingService.updateBuilding(req.params.id, req.body);
    res.json(updated);
});

// Delete building - UNIFIED: Use service check
buildingsRouter.delete('/:id', 
  authorize('complex_admin', 'uk_director'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid building ID format', 400);
    }

    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access using service
    const hasAccess = await BuildingService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    await BuildingService.deleteBuilding(req.params.id);
    res.json({ message: 'Building deleted successfully' });
});

export { buildingsRouter };
