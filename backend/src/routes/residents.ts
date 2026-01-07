import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { ResidentService } from '../services/resident.service';
import { CondoService } from '../services/condo.service';
import { UnitService } from '../services/unit.service';
import { AppError } from '../middleware/errorHandler';
import { validate as isUUID } from 'uuid';

const residentsRouter = Router();

residentsRouter.use(authenticate);

// List residents by unit
residentsRouter.get('/unit/:unitId', canAccessUnit(), async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.unitId)) {
    throw new AppError('Invalid unit ID format', 400);
  }

  const includeInactive = req.query.include_inactive === 'true';
  const residents = await ResidentService.listResidentsByUnit(req.params.unitId, includeInactive);
  res.json(residents);
});

// List units for current user
residentsRouter.get('/my-units', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const includeInactive = req.query.include_inactive === 'true';
  const units = await ResidentService.listUnitsByUser(req.user!.id, includeInactive);
  res.json(units);
});

// Get resident by ID
residentsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.id)) {
    throw new AppError('Invalid resident ID format', 400);
  }

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
});

// Create resident (manual assignment by admin)
residentsRouter.post('/', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { user_id, unit_id, is_owner, moved_in_at } = req.body;

    if (!user_id || !unit_id) {
      throw new AppError('user_id and unit_id are required', 400);
    }

    if (!isUUID(user_id)) {
      throw new AppError('Invalid user_id format', 400);
    }
    if (!isUUID(unit_id)) {
      throw new AppError('Invalid unit_id format', 400);
    }

    const unit = await UnitService.getUnitById(unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

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
});

// Update resident
residentsRouter.patch('/:id', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

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
});

// Move out resident
residentsRouter.post('/:id/move-out', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

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
});

// Delete resident
residentsRouter.delete('/:id', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(resident.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

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
});

export { residentsRouter };
