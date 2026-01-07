import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { MeterService } from '../services/meter.service';

const router = Router();
const meterService = new MeterService();

// ✅ GET /units/:unitId/meters - Счётчики квартиры
router.get(
  '/units/:unitId/meters',
  authenticateToken,
  canAccessUnit(), // 🔒 SECURITY
  asyncHandler(async (req, res) => {
    const meters = await meterService.getByUnit(req.params.unitId);
    res.json(meters);
  })
);

// ✅ GET /meters/:id
router.get(
  '/meters/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const meter = await meterService.getById(req.params.id);
    req.params.unitId = meter.unitId;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    res.json(meter);
  })
);

// ✅ POST /units/:unitId/meters - Только admin
router.post(
  '/units/:unitId/meters',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const meter = await meterService.create(req.params.unitId, req.body);
    res.status(201).json(meter);
  })
);

// ✅ POST /meters/:id/readings - Подать показания
router.post(
  '/meters/:id/readings',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const meter = await meterService.getById(req.params.id);
    req.params.unitId = meter.unitId;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const reading = await meterService.submitReading(req.params.id, req.body);
    res.status(201).json(reading);
  })
);

// ✅ PUT /meters/:id - Только admin
router.put(
  '/meters/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const meter = await meterService.update(req.params.id, req.body);
    res.json(meter);
  })
);

// ✅ DELETE /meters/:id - Только admin
router.delete(
  '/meters/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    await meterService.delete(req.params.id);
    res.status(204).send();
  })
);

export default router;
