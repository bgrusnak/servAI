import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { InviteService } from '../services/invite.service';
import { ResidentService } from '../services/resident.service';
import { CondoService } from '../services/condo.service';
import { UnitService } from '../services/unit.service';
import { AppError } from '../middleware/errorHandler';
import { rateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';

const invitesRouter = Router();

// Validation schemas
const CreateInviteSchema = z.object({
  unit_id: z.string().uuid(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  ttl_days: z.number().int().min(1).max(365).optional(),
  max_uses: z.number().int().min(1).optional(),
});

// Public: Validate invite token (rate limited)
invitesRouter.get(
  '/validate/:token',
  rateLimiter({ points: 10, duration: 60 }), // 10 req/min per IP
  async (req, res: Response, next: NextFunction) => {
    try {
      const validation = await InviteService.validateInvite(req.params.token);
      res.json(validation);
    } catch (error) {
      next(error);
    }
  }
);

// Public: Accept invite (rate limited + auth required)
invitesRouter.post(
  '/accept/:token',
  rateLimiter({ points: 5, duration: 300 }), // 5 accepts per 5 min per IP
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      // Accept invite with transaction (fixes CRIT-001)
      const result = await InviteService.acceptInvite(req.params.token, req.user.id);

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// Protected routes (require authentication)
invitesRouter.use(authenticate);

// Create invite for a unit
invitesRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Validate input (fixes HIGH-001)
    const data = CreateInviteSchema.parse(req.body);

    // Get unit to check access
    const unit = await UnitService.getUnitById(data.unit_id);
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
      ...data,
      created_by: req.user!.id,
    });

    res.status(201).json(invite);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppError(`Validation error: ${error.errors.map(e => e.message).join(', ')}`, 400));
    }
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

// Get invite by ID
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

    const hasAccess = await CondoService.checkUserAccess(
      unit.condo_id,
      req.user!.id,
      ['company_admin', 'condo_admin']
    );

    if (!hasAccess) {
      throw new AppError('Insufficient permissions', 403);
    }

    res.json(invite);
  } catch (error) {
    next(error);
  }
});

// Deactivate invite
invitesRouter.post('/:id/deactivate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
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
