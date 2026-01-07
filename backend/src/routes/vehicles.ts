import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessCondo, canAccessUnit, isSecurityGuard, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { vehicleService } from '../services/vehicle.service';

const router = Router();

// ✅ GET /condos/:condoId/vehicles - Авто ЖК
router.get(
  '/condos/:condoId/vehicles',
  authenticateToken,
  canAccessCondo(), // 🔒 SECURITY
  asyncHandler(async (req, res) => {
    const vehicles = await vehicleService.getByCondo(req.params.condoId);
    res.json(vehicles);
  })
);

// ✅ GET /units/:unitId/vehicles - Авто квартиры
router.get(
  '/units/:unitId/vehicles',
  authenticateToken,
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const vehicles = await vehicleService.getByUnit(req.params.unitId);
    res.json(vehicles);
  })
);

// ✅ POST /units/:unitId/vehicles - Добавить авто
router.post(
  '/units/:unitId/vehicles',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director'),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const vehicle = await vehicleService.create(req.params.unitId, req.body);
    res.status(201).json(vehicle);
  })
);

// ✅ POST /vehicles/check-access - Проверка пропуска
router.post(
  '/vehicles/check-access',
  authenticateToken,
  isSecurityGuard(), // 🔒 SECURITY: Только охрана
  asyncHandler(async (req, res) => {
    const result = await vehicleService.checkAccess(req.body.licensePlate, req.body.condoId);
    res.json(result);
  })
);

// ✅ POST /vehicles/:id/temp-pass - Временный пропуск
router.post(
  '/vehicles/:id/temp-pass',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    const pass = await vehicleService.createTempPass(req.params.id, req.body);
    res.status(201).json(pass);
  })
);

// ✅ DELETE /vehicles/:id - Только admin или владелец
router.delete(
  '/vehicles/:id',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    await vehicleService.delete(req.params.id, req.user.id, req.user.role);
    res.status(204).send();
  })
);

export default router;
