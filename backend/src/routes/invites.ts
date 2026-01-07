import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { InviteService } from '../services/invite.service';
import { UnitService } from '../services/unit.service';
import { rateLimit } from '../middleware/rateLimit';
import { AppError } from '../middleware/errorHandler';
import { securityLogger } from '../utils/logger';

const router = Router();

/**
 * CRITICAL: Rate limiting for public invite validation
 * Prevents token enumeration attacks
 */
const inviteValidationRateLimit = rateLimit({
  points: 10,           // 10 attempts
  duration: 900,        // per 15 minutes
  blockDuration: 3600,  // Block for 1 hour
  keyPrefix: 'invite-validate',
});

/**
 * Validate invite token format
 * CRITICAL: Prevents invalid token enumeration
 */
function validateInviteToken(token: string): boolean {
  // Invite tokens should be UUID v4 format or base64
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const base64Pattern = /^[A-Za-z0-9+/]{32,}={0,2}$/;
  
  return uuidPattern.test(token) || base64Pattern.test(token);
}

// ✅ GET /invites/validate/:token - Публичный endpoint с rate limiting
router.get(
  '/validate/:token',
  inviteValidationRateLimit,
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    
    // Validate token format
    if (!validateInviteToken(token)) {
      // Log suspicious activity
      securityLogger.suspiciousActivity(
        'Invalid invite token format',
        undefined,
        req.ip || 'unknown',
        { token: token.substring(0, 10) }
      );
      
      // Return generic error (don't reveal format requirements)
      return res.status(400).json({ 
        error: 'Invalid invite token',
        valid: false 
      });
    }
    
    try {
      const validation = await InviteService.validateInvite(token);
      
      // Don't log successful validations of valid tokens (privacy)
      res.json(validation);
    } catch (error) {
      // Log failed validation attempts
      securityLogger.suspiciousActivity(
        'Failed invite validation',
        undefined,
        req.ip || 'unknown',
        { tokenPrefix: token.substring(0, 10) }
      );
      
      // Generic error (don't reveal if token exists)
      res.status(400).json({ 
        error: 'Invalid or expired invite',
        valid: false 
      });
    }
  })
);

// ✅ POST /invites/accept/:token - Принять приглашение
router.post(
  '/accept/:token',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    
    if (!validateInviteToken(token)) {
      throw new AppError('Invalid invite token', 400);
    }
    
    const result = await InviteService.acceptInvite(token, req.user.id);
    
    // Log successful invite acceptance
    securityLogger.dataAccess(
      req.user.id,
      `invite:${token.substring(0, 10)}`,
      'accept',
      { unitId: result.unit.id }
    );
    
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
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const { unit_id, email, phone, ttl_days, max_uses } = req.body;
    
    // Validation
    if (!unit_id) {
      throw new AppError('unit_id is required', 400);
    }
    
    if (!email && !phone) {
      throw new AppError('Either email or phone is required', 400);
    }
    
    if (ttl_days && (ttl_days < 1 || ttl_days > 365)) {
      throw new AppError('ttl_days must be between 1 and 365', 400);
    }
    
    if (max_uses && (max_uses < 1 || max_uses > 100)) {
      throw new AppError('max_uses must be between 1 and 100', 400);
    }
    
    // CRITICAL: Check access BEFORE creating invite
    const unit = await UnitService.getUnitById(unit_id);
    if (!unit) {
      throw new AppError('Unit not found', 404);
    }
    
    // Use standard middleware for access check
    req.params.unitId = unit_id;
    const middleware = canAccessUnit();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve());
    });
    
    const invite = await InviteService.createInvite({
      unit_id,
      email,
      phone,
      ttl_days,
      max_uses,
      created_by: req.user.id,
    });
    
    // Log invite creation
    securityLogger.dataAccess(
      req.user.id,
      `unit:${unit_id}`,
      'create_invite',
      { inviteId: invite.id }
    );
    
    res.status(201).json(invite);
  })
);

// ✅ GET /units/:unitId/invites - Приглашения квартиры
router.get(
  '/units/:unitId/invites',
  authenticateToken,
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const includeExpired = req.query.include_expired === 'true';
    const invites = await InviteService.listInvitesByUnit(
      req.params.unitId, 
      includeExpired
    );
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

// ✅ GET /invites/:id - FIXED: Check access before fetching
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // CRITICAL: First get minimal info to determine access
    const invitePreview = await InviteService.getInvitePreview(req.params.id);
    if (!invitePreview) {
      throw new AppError('Invite not found', 404);
    }
    
    // THEN check access using standard middleware
    req.params.unitId = invitePreview.unit_id;
    const middleware = canAccessUnit();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve());
    });
    
    // ONLY AFTER access is confirmed, get full details
    const invite = await InviteService.getInviteById(req.params.id);
    
    res.json(invite);
  })
);

// ✅ POST /invites/:id/deactivate
router.post(
  '/:id/deactivate',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    // Get preview first
    const invitePreview = await InviteService.getInvitePreview(req.params.id);
    if (!invitePreview) {
      throw new AppError('Invite not found', 404);
    }
    
    // Check access
    req.params.unitId = invitePreview.unit_id;
    const middleware = canAccessUnit();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve());
    });
    
    await InviteService.deactivateInvite(req.params.id);
    
    // Log deactivation
    securityLogger.dataAccess(
      req.user.id,
      `invite:${req.params.id}`,
      'deactivate'
    );
    
    res.json({ message: 'Invite deactivated successfully' });
  })
);

// ✅ DELETE /invites/:id
router.delete(
  '/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    // Get preview first
    const invitePreview = await InviteService.getInvitePreview(req.params.id);
    if (!invitePreview) {
      throw new AppError('Invite not found', 404);
    }
    
    // Check access
    req.params.unitId = invitePreview.unit_id;
    const middleware = canAccessUnit();
    await new Promise<void>((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve());
    });
    
    await InviteService.deleteInvite(req.params.id);
    
    // Log deletion
    securityLogger.dataAccess(
      req.user.id,
      `invite:${req.params.id}`,
      'delete'
    );
    
    res.json({ message: 'Invite deleted successfully' });
  })
);

export default router;

// NOTE: InviteService should implement getInvitePreview() method:
// - Returns only { id, unit_id } for access checks
// - Does NOT return sensitive data (email, phone, token)
// - Used before full authorization