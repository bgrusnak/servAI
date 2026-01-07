import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { BuildingService } from '../services/building.service';
import { CondoService } from '../services/condo.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';
import { validate as isUUID } from 'uuid';

const buildingsRouter = Router();

// All routes require authentication
buildingsRouter.use(authenticate);

// ✅ List buildings (by condo)
buildingsRouter.get('/', canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    // ✅ UUID validation
    if (!isUUID(condoId)) {
      throw new AppError('Invalid condo_id format', 400);
    }

    const result = await BuildingService.listBuildings(condoId, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ✅ Get building by ID - FIXED RACE CONDITION
buildingsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid building ID format', 400);
    }

    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // ✅ FIXED: Check access immediately
    const hasAccess = await CondoService.checkUserAccess(building.condo_id, req.user!.id);
    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    // ✅ Return immediately after check - no race condition
    res.json(building);
  } catch (error) {
    next(error);
  }
});

// ✅ Create building - SIMPLIFIED
buildingsRouter.post('/', authorize('complex_admin', 'uk_director'), canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { condo_id, number, address, floors, units_count } = req.body;

    if (!condo_id || !number) {
      throw new AppError('condo_id and number are required', 400);
    }

    // ✅ UUID validation
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
  } catch (error) {
    next(error);
  }
});

// ✅ Update building - FIXED
buildingsRouter.patch('/:id', authorize('complex_admin', 'uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid building ID format', 400);
    }

    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // ✅ FIXED: Direct check, no Promise hacks
    const hasAccess = await CondoService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    const updated = await BuildingService.updateBuilding(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ✅ Delete building - FIXED
buildingsRouter.delete('/:id', authorize('complex_admin', 'uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // ✅ UUID validation
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid building ID format', 400);
    }

    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // ✅ FIXED: Direct check, no Promise hacks
    const hasAccess = await CondoService.checkUserAccess(
      building.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    await BuildingService.deleteBuilding(req.params.id);
    res.json({ message: 'Building deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { buildingsRouter };
