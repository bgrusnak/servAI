import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { InviteService } from '../services/invite.service';
import { UnitService } from '../services/unit.service';

const router = Router();

// ✅ GET /invites/validate/:token - Публичный endpoint
router.get(
  '/validate/:token',
  asyncHandler(async (req, res) => {
    const validation = await InviteService.validateInvite(req.params.token);
    res.json(validation);
  })
);

// ✅ POST /invites/accept/:token - Принять приглашение
router.post(
  '/accept/:token',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const result = await InviteService.acceptInvite(req.params.token, req.user.id);
    res.status(201).json({
      message: 'Invite accepted successfully',
      resident: result.resident,
      unit: result.unit,
    });
  })
);

// ✅ POST /invites - Создать приглашение
router.post(
  '/',
  authenticateToken,
  authorize('uk_director', 'complex_admin'), // 🔒 UNIFIED
  asyncHandler(async (req, res) => {
    const { unit_id, email, phone, ttl_days, max_uses } = req.body;
    
    if (!unit_id) {
      return res.status(400).json({ error: 'unit_id is required' });
    }
    
    // Проверка доступа к unit
    req.params.unitId = unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const invite = await InviteService.createInvite({
      unit_id,
      email,
      phone,
      ttl_days,
      max_uses,
      created_by: req.user.id,
    });
    
    res.status(201).json(invite);
  })
);

// ✅ GET /units/:unitId/invites - Приглашения квартиры
router.get(
  '/units/:unitId/invites',
  authenticateToken,
  canAccessUnit(), // 🔒 UNIFIED MIDDLEWARE
  asyncHandler(async (req, res) => {
    const includeExpired = req.query.include_expired === 'true';
    const invites = await InviteService.listInvitesByUnit(req.params.unitId, includeExpired);
    res.json(invites);
  })
);

// ✅ GET /units/:unitId/invites/stats
router.get(
  '/units/:unitId/invites/stats',
  authenticateToken,
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const stats = await InviteService.getInviteStats(req.params.unitId);
    res.json(stats);
  })
);

// ✅ GET /invites/:id
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const invite = await InviteService.getInviteById(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    req.params.unitId = invite.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    res.json(invite);
  })
);

// ✅ POST /invites/:id/deactivate
router.post(
  '/:id/deactivate',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const invite = await InviteService.getInviteById(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    req.params.unitId = invite.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    await InviteService.deactivateInvite(req.params.id);
    res.json({ message: 'Invite deactivated successfully' });
  })
);

// ✅ DELETE /invites/:id
router.delete(
  '/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const invite = await InviteService.getInviteById(req.params.id);
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    req.params.unitId = invite.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    await InviteService.deleteInvite(req.params.id);
    res.json({ message: 'Invite deleted successfully' });
  })
);

export default router;
