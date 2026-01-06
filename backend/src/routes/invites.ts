import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { InviteService } from '../services/invite.service';
import { ResidentService } from '../services/resident.service';
import { CondoService } from '../services/condo.service';
import { UnitService } from '../services/unit.service';
import { AppError } from '../middleware/errorHandler';

const invitesRouter = Router();

// Public: Validate invite token (no auth required)
invitesRouter.get('/validate/:token', async (req, res: Response, next: NextFunction) => {
  try {
    const validation = await InviteService.validateInvite(req.params.token);

    res.json(validation);
  } catch (error) {
    next(error);
  }
});

// Public: Accept invite (create resident record)
invitesRouter.post('/accept/:token', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    // Validate invite
    const validation = await InviteService.validateInvite(req.params.token);

    if (!validation.valid) {
      throw new AppError(validation.reason || 'Invalid invite', 400);
    }

    const invite = validation.invite!;

    // Create resident in transaction
    const resident = await ResidentService.createResident({
      user_id: req.user.id,
      unit_id: invite.unit_id,
      is_owner: false, // Invites are for tenants/residents, not owners
    });

    // Increment invite usage
    await InviteService.useInvite(req.params.token);

    res.status(201).json({
      message: 'Invite accepted successfully',
      resident,
      unit: {
        number: invite.unit_number,
        type: invite.unit_type,
        condo: invite.condo_name,
        address: invite.condo_address,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Protected routes (require authentication)
invitesRouter.use(authenticate);

// Create invite for a unit
invitesRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { unit_id, email, phone, ttl_days, max_uses } = req.body;

    if (!unit_id) {
      throw new AppError('unit_id is required', 400);
    }

    // Get unit to check access
    const unit = await UnitService.getUnitById(unit_id);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check if user has access to the condo
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const invite = await InviteService.createInvite({
      unit_id,
      email,
      phone,
      ttl_days,
      max_uses,
      created_by: req.user!.id,
    });

    res.status(201).json(invite);
  } catch (error) {
    next(error);
  }
});

// List invites for a unit
invitesRouter.get('/unit/:unitId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const unit = await UnitService.getUnitById(req.params.unitId);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const includeExpired = req.query.include_expired === 'true';
    const invites = await InviteService.listInvitesByUnit(req.params.unitId, includeExpired);

    res.json(invites);
  } catch (error) {
    next(error);
  }
});

// Get invite statistics for a unit
invitesRouter.get('/unit/:unitId/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const unit = await UnitService.getUnitById(req.params.unitId);

    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    const stats = await InviteService.getInviteStats(req.params.unitId);

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Get invite by ID (for deactivate/delete access check)
invitesRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const invite = await InviteService.getInviteById(req.params.id);

    if (!invite) {
      throw new AppError('Invite not found', 404);
    }

    const unit = await UnitService.getUnitById(invite.unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }

    // Check access
    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Access denied', 403);
    }

    res.json(invite);
  } catch (error) {
    next(error);
  }
});

// Deactivate invite
invitesRouter.post('/:id/deactivate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get invite to check access
    const invite = await InviteService.getInviteById(req.params.id);

    if (!invite) {
      throw new AppError('Invite not found', 404);
    }

    const unit = await UnitService.getUnitById(invite.unit_id);
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

    await InviteService.deactivateInvite(req.params.id);

    res.json({ message: 'Invite deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete invite
invitesRouter.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get invite to check access
    const invite = await InviteService.getInviteById(req.params.id);

    if (!invite) {
      throw new AppError('Invite not found', 404);
    }

    const unit = await UnitService.getUnitById(invite.unit_id);
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

    await InviteService.deleteInvite(req.params.id);

    res.json({ message: 'Invite deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export { invitesRouter };
