import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessCondo, canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { UnitService } from '../services/unit.service';

const router = Router();
const unitService = new UnitService();

// ✅ GET /condos/:condoId/units - Квартиры ЖК
router.get(
  '/condos/:condoId/units',
  authenticateToken,
  canAccessCondo(), // 🔒 SECURITY
  asyncHandler(async (req, res) => {
    const units = await unitService.getByCondo(req.params.condoId);
    res.json(units);
  })
);

// ✅ GET /units/:unitId
router.get(
  '/units/:unitId',
  authenticateToken,
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const unit = await unitService.getById(req.params.unitId);
    res.json(unit);
  })
);

// ✅ POST /condos/:condoId/units - Только admin
router.post(
  '/condos/:condoId/units',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    const unit = await unitService.create(req.params.condoId, req.body);
    res.status(201).json(unit);
  })
);

// ✅ PUT /units/:unitId
router.put(
  '/units/:unitId',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const unit = await unitService.update(req.params.unitId, req.body);
    res.json(unit);
  })
);

// ✅ DELETE /units/:unitId
router.delete(
  '/units/:unitId',
  authenticateToken,
  authorize('uk_director'),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    await unitService.delete(req.params.unitId);
    res.status(204).send();
  })
);

export default router;
