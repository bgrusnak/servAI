import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { BuildingService } from '../services/building.service';
import { AppError } from '../middleware/errorHandler';
import { CONSTANTS } from '../config/constants';

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

    const result = await BuildingService.listBuildings(condoId, page, limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ✅ Get building by ID
buildingsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access via middleware
    req.query.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err?: any) => err ? reject(err) : resolve());
    });

    res.json(building);
  } catch (error) {
    next(error);
  }
});

// ✅ Create building
buildingsRouter.post('/', authorize('complex_admin', 'uk_director'), canAccessCondo(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { condo_id, number, address, floors, units_count } = req.body;

    if (!condo_id || !number) {
      throw new AppError('condo_id and number are required', 400);
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

// ✅ Update building
buildingsRouter.patch('/:id', authorize('complex_admin', 'uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    req.query.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err?: any) => err ? reject(err) : resolve());
    });

    const updated = await BuildingService.updateBuilding(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ✅ Delete building
buildingsRouter.delete('/:id', authorize('complex_admin', 'uk_director'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const building = await BuildingService.getBuildingById(req.params.id);

    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Check access
    req.query.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err?: any) => err ? reject(err) : resolve());
    });

    await BuildingService.deleteBuilding(req.params.id);
    res.json({ message: 'Building deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { buildingsRouter };
