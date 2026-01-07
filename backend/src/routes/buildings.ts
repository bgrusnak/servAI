import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { BuildingService } from '../services/building.service';

const router = Router();

// ✅ GET /condos/:condoId/buildings - Здания ЖК
router.get(
  '/condos/:condoId/buildings',
  authenticateToken,
  canAccessCondo(), // 🔒 UNIFIED MIDDLEWARE
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await BuildingService.listBuildings(req.params.condoId, page, limit);
    res.json(result);
  })
);

// ✅ GET /buildings/:id
router.get(
  '/buildings/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    // Проверка доступа к ЖК
    req.params.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    res.json(building);
  })
);

// ✅ POST /condos/:condoId/buildings - Только admin
router.post(
  '/condos/:condoId/buildings',
  authenticateToken,
  authorize('complex_admin', 'uk_director'), // 🔒 UNIFIED
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    const { number, address, floors, units_count } = req.body;
    if (!number) {
      return res.status(400).json({ error: 'number is required' });
    }
    
    const building = await BuildingService.createBuilding({
      condo_id: req.params.condoId,
      number,
      address,
      floors,
      units_count,
    });
    
    res.status(201).json(building);
  })
);

// ✅ PATCH /buildings/:id
router.patch(
  '/buildings/:id',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    req.params.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const updated = await BuildingService.updateBuilding(req.params.id, req.body);
    res.json(updated);
  })
);

// ✅ DELETE /buildings/:id
router.delete(
  '/buildings/:id',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    const building = await BuildingService.getBuildingById(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }
    
    req.params.condoId = building.condo_id;
    const middleware = canAccessCondo();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    await BuildingService.deleteBuilding(req.params.id);
    res.json({ message: 'Building deleted successfully' });
  })
);

export default router;
