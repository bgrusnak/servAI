import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { ResidentService } from '../services/resident.service';
import { CondoService } from '../services/condo.service';
import { UnitService } from '../services/unit.service';
import { AppError } from '../middleware/errorHandler';
import { validate as isUUID } from 'uuid';
import { securityLogger } from '../utils/logger';

const residentsRouter = Router();

residentsRouter.use(authenticate);

/**
 * Validate date input
 * CRITICAL: Prevents invalid dates and logic violations
 */
function validateDate(dateStr: string, fieldName: string): Date {
  const date = new Date(dateStr);
  
  // Check if valid date
  if (isNaN(date.getTime())) {
    throw new AppError(`Invalid ${fieldName} format`, 400);
  }
  
  // Check if not in future (moved_in/moved_out should be past)
  const now = new Date();
  if (date > now) {
    throw new AppError(`${fieldName} cannot be in the future`, 400);
  }
  
  // Check reasonable range (not before 1900)
  const minDate = new Date('1900-01-01');
  if (date < minDate) {
    throw new AppError(`${fieldName} is too far in the past`, 400);
  }
  
  return date;
}

/**
 * Validate date logic
 * CRITICAL: moved_in must be before moved_out
 */
function validateDateLogic(movedIn: Date, movedOut: Date): void {
  if (movedOut <= movedIn) {
    throw new AppError('moved_out_at must be after moved_in_at', 400);
  }
}

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

// Get resident by ID - FIXED: Check access before fetching
residentsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isUUID(req.params.id)) {
    throw new AppError('Invalid resident ID format', 400);
  }

  // CRITICAL: Get minimal preview first (only unit_id, user_id)
  const residentPreview = await ResidentService.getResidentPreview(req.params.id);
  if (!residentPreview) {
    throw new AppError('Resident not found', 404);
  }

  // Check access BEFORE fetching full data
  // 1. User can view their own
  if (residentPreview.user_id !== req.user!.id) {
    // 2. Or has condo access
    const unit = await UnitService.getUnitById(residentPreview.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id
    );

    if (!hasAccess) {
      // Log unauthorized access attempt
      securityLogger.accessDenied(
        req.user!.id,
        `resident:${req.params.id}`,
        req.ip || 'unknown'
      );
      throw new AppError('Access denied', 403);
    }
  }

  // ONLY AFTER access confirmed, get full data
  const resident = await ResidentService.getResidentById(req.params.id);

  res.json(resident);
});

// Create resident (manual assignment by admin)
residentsRouter.post('/', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { user_id, unit_id, is_owner, moved_in_at } = req.body;

    // Validation
    if (!user_id || !unit_id) {
      throw new AppError('user_id and unit_id are required', 400);
    }

    if (!isUUID(user_id)) {
      throw new AppError('Invalid user_id format', 400);
    }
    if (!isUUID(unit_id)) {
      throw new AppError('Invalid unit_id format', 400);
    }

    // Validate is_owner type
    if (is_owner !== undefined && typeof is_owner !== 'boolean') {
      throw new AppError('is_owner must be a boolean', 400);
    }

    // Get unit for access check
    const unit = await UnitService.getUnitById(unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check condo access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    // CRITICAL: Validate is_owner assignment
    if (is_owner === true) {
      // Check if unit already has an owner
      const existingOwner = await ResidentService.getUnitOwner(unit_id);
      if (existingOwner) {
        throw new AppError(
          'Unit already has an owner. Remove existing owner first.',
          400
        );
      }
      
      // Only company_admin can create owners
      const isCompanyAdmin = await CondoService.checkUserAccess(
        unit.condo_id,
        req.user!.id,
        ['company_admin']
      );
      
      if (!isCompanyAdmin) {
        throw new AppError(
          'Only company admins can assign owners',
          403
        );
      }
    }

    // Validate moved_in_at
    let movedInDate: Date | undefined;
    if (moved_in_at) {
      movedInDate = validateDate(moved_in_at, 'moved_in_at');
    }

    const resident = await ResidentService.createResident({
      user_id,
      unit_id,
      is_owner: is_owner || false, // Default to false
      moved_in_at: movedInDate,
    });

    // Log resident creation
    securityLogger.dataAccess(
      req.user!.id,
      `unit:${unit_id}`,
      'create_resident',
      { residentId: resident.id, isOwner: is_owner }
    );

    res.status(201).json(resident);
});

// Update resident
residentsRouter.patch('/:id', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    // Get resident preview for access check
    const residentPreview = await ResidentService.getResidentPreview(req.params.id);
    if (!residentPreview) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(residentPreview.unit_id);
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

    // Validate types
    if (is_owner !== undefined && typeof is_owner !== 'boolean') {
      throw new AppError('is_owner must be a boolean', 400);
    }
    if (is_active !== undefined && typeof is_active !== 'boolean') {
      throw new AppError('is_active must be a boolean', 400);
    }

    // CRITICAL: Validate is_owner change
    if (is_owner === true && residentPreview.is_owner !== true) {
      // Changing to owner
      const existingOwner = await ResidentService.getUnitOwner(residentPreview.unit_id);
      if (existingOwner && existingOwner.id !== req.params.id) {
        throw new AppError(
          'Unit already has an owner. Remove existing owner first.',
          400
        );
      }
      
      // Only company_admin can promote to owner
      const isCompanyAdmin = await CondoService.checkUserAccess(
        unit.condo_id,
        req.user!.id,
        ['company_admin']
      );
      
      if (!isCompanyAdmin) {
        throw new AppError(
          'Only company admins can assign owners',
          403
        );
      }
    }

    // Validate dates
    let movedInDate: Date | undefined;
    let movedOutDate: Date | undefined;

    if (moved_in_at) {
      movedInDate = validateDate(moved_in_at, 'moved_in_at');
    }

    if (moved_out_at) {
      movedOutDate = validateDate(moved_out_at, 'moved_out_at');
    }

    // CRITICAL: Validate date logic
    if (movedInDate && movedOutDate) {
      validateDateLogic(movedInDate, movedOutDate);
    } else if (movedOutDate && !movedInDate) {
      // If setting moved_out but not moved_in, check against existing moved_in
      const resident = await ResidentService.getResidentById(req.params.id);
      if (resident.moved_in_at) {
        validateDateLogic(new Date(resident.moved_in_at), movedOutDate);
      }
    }

    const updated = await ResidentService.updateResident(req.params.id, {
      is_owner,
      is_active,
      moved_in_at: movedInDate,
      moved_out_at: movedOutDate,
    });

    // Log update
    securityLogger.dataAccess(
      req.user!.id,
      `resident:${req.params.id}`,
      'update',
      { isOwner: is_owner, isActive: is_active }
    );

    res.json(updated);
});

// Move out resident
residentsRouter.post('/:id/move-out', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    const residentPreview = await ResidentService.getResidentPreview(req.params.id);
    if (!residentPreview) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(residentPreview.unit_id);
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
    
    // Log move out
    securityLogger.dataAccess(
      req.user!.id,
      `resident:${req.params.id}`,
      'move_out'
    );
    
    res.json({ message: 'Resident moved out successfully' });
});

// Delete resident
residentsRouter.delete('/:id', 
  authorize('uk_director', 'complex_admin'), 
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!isUUID(req.params.id)) {
      throw new AppError('Invalid resident ID format', 400);
    }

    const residentPreview = await ResidentService.getResidentPreview(req.params.id);
    if (!residentPreview) {
      throw new AppError('Resident not found', 404);
    }

    const unit = await UnitService.getUnitById(residentPreview.unit_id);
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
    
    // Log deletion
    securityLogger.dataAccess(
      req.user!.id,
      `resident:${req.params.id}`,
      'delete'
    );
    
    res.json({ message: 'Resident deleted successfully' });
});

export { residentsRouter };

// NOTE: ResidentService should implement:
// - getResidentPreview(id): Returns only { id, user_id, unit_id, is_owner }
// - getUnitOwner(unit_id): Returns current owner or null