import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { ResidentService } from '../services/resident.service';
import { UnitService } from '../services/unit.service';

const router = Router();

// ✅ GET /units/:unitId/residents - Жители квартиры
router.get(
  '/units/:unitId/residents',
  authenticateToken,
  canAccessUnit(), // 🔒 UNIFIED MIDDLEWARE
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.include_inactive === 'true';
    const residents = await ResidentService.listResidentsByUnit(req.params.unitId, includeInactive);
    res.json(residents);
  })
);

// ✅ GET /residents/my-units - Мои квартиры
router.get(
  '/my-units',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.include_inactive === 'true';
    const units = await ResidentService.listUnitsByUser(req.user.id, includeInactive);
    res.json(units);
  })
);

// ✅ GET /residents/:id
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      return res.status(404).json({ error: 'Resident not found' });
    }
    
    // Проверка доступа: свой или canAccessUnit
    if (resident.user_id !== req.user.id) {
      req.params.unitId = resident.unit_id;
      const middleware = canAccessUnit();
      await new Promise((resolve, reject) => {
        middleware(req, res, (err) => err ? reject(err) : resolve(null));
      });
    }
    
    res.json(resident);
  })
);

// ✅ POST /residents - Создать жителя (только admin)
router.post(
  '/',
  authenticateToken,
  authorize('uk_director', 'complex_admin'), // 🔒 UNIFIED
  asyncHandler(async (req, res) => {
    const { user_id, unit_id, is_owner, moved_in_at } = req.body;
    
    if (!user_id || !unit_id) {
      return res.status(400).json({ error: 'user_id and unit_id are required' });
    }
    
    // Проверка доступа к unit
    req.params.unitId = unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const resident = await ResidentService.createResident({
      user_id,
      unit_id,
      is_owner,
      moved_in_at: moved_in_at ? new Date(moved_in_at) : undefined,
    });
    
    res.status(201).json(resident);
  })
);

// ✅ PATCH /residents/:id
router.patch(
  '/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      return res.status(404).json({ error: 'Resident not found' });
    }
    
    req.params.unitId = resident.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const { is_owner, is_active, moved_in_at, moved_out_at } = req.body;
    const updated = await ResidentService.updateResident(req.params.id, {
      is_owner,
      is_active,
      moved_in_at: moved_in_at ? new Date(moved_in_at) : undefined,
      moved_out_at: moved_out_at ? new Date(moved_out_at) : undefined,
    });
    
    res.json(updated);
  })
);

// ✅ POST /residents/:id/move-out
router.post(
  '/:id/move-out',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      return res.status(404).json({ error: 'Resident not found' });
    }
    
    req.params.unitId = resident.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    await ResidentService.moveOutResident(req.params.id);
    res.json({ message: 'Resident moved out successfully' });
  })
);

// ✅ DELETE /residents/:id
router.delete(
  '/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const resident = await ResidentService.getResidentById(req.params.id);
    if (!resident) {
      return res.status(404).json({ error: 'Resident not found' });
    }
    
    req.params.unitId = resident.unit_id;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    await ResidentService.deleteResident(req.params.id);
    res.json({ message: 'Resident deleted successfully' });
  })
);

export default router;
