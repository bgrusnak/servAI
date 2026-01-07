import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { ResidentService } from '../services/resident.service';
import { CondoService } from '../services/condo.service';
import { UnitService } from '../services/unit.service';
import { AppError } from '../middleware/errorHandler';

const residentsRouter = Router();

// All routes require authentication
residentsRouter.use(authenticate);

// ✅ List residents by unit
residentsRouter.get('/unit/:unitId', canAccessUnit(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const residents = await ResidentService.listResidentsByUnit(req.params.unitId, includeInactive);
    res.json(residents);
  } catch (error) {
    next(error);
  }
});

// ✅ List units for current user
residentsRouter.get('/my-units', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const units = await ResidentService.listUnitsByUser(req.user!.id, includeInactive);
    res.json(units);
  } catch (error) {
    next(error);
  }
});

// ✅ Get resident by ID
residentsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resident = await ResidentService.getResidentById(req.params.id);

    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    // Check access - user can view their own or has condo access
    if (resident.user_id !== req.user!.id) {
      const unit = await UnitService.getUnitById(resident.unit_id);
      if (!unit) {
        throw new AppError('Unit not found', 404);
      }

      const hasAccess = await CondoService.checkUserAccess(
        unit.condo_id,
        req.user!.id
      );

      if (!hasAccess) {
        throw new AppError('Access denied', 403);
      }
    }

    res.json(resident);
  } catch (error) {
    next(error);
  }
});

// ✅ Create resident (manual assignment by admin)
residentsRouter.post('/', authorize('uk_director', 'complex_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { user_id, unit_id, is_owner, moved_in_at } = req.body;

    if (!user_id || !unit_id) {
      throw new AppError('user_id and unit_id are required', 400);
    }

    const unit = await UnitService.getUnitById(unit_id);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const resident = await ResidentService.createResident({
      user_id,
      unit_id,
      is_owner,
      moved_in_at: moved_in_at ? new Date(moved_in_at) : undefined,
    });

    res.status(201).json(resident);
  } catch (error) {
    next(error);
  }
});

// ✅ Update resident
residentsRouter.patch('/:id', authorize('uk_director', 'complex_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resident = await ResidentService.getResidentById(req.params.id);

    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const { is_owner, is_active, moved_in_at, moved_out_at } = req.body;

    const updated = await ResidentService.updateResident(req.params.id, {
      is_owner,
      is_active,
      moved_in_at: moved_in_at ? new Date(moved_in_at) : undefined,
      moved_out_at: moved_out_at ? new Date(moved_out_at) : undefined,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// ✅ Move out resident
residentsRouter.post('/:id/move-out', authorize('uk_director', 'complex_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resident = await ResidentService.getResidentById(req.params.id);

    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    await ResidentService.moveOutResident(req.params.id);
    res.json({ message: 'Resident moved out successfully' });
  } catch (error) {
    next(error);
  }
});

// ✅ Delete resident
residentsRouter.delete('/:id', authorize('uk_director', 'complex_admin'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const resident = await ResidentService.getResidentById(req.params.id);

    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check admin access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    await ResidentService.deleteResident(req.params.id);
    res.json({ message: 'Resident deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { residentsRouter };
