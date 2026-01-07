import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessCompany, canAccessCondo, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { CondoService } from '../services/condo.service';

const router = Router();

// ✅ GET /condos - Список ЖК (только доступные)
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const companyId = req.query.company_id as string;
    const result = await CondoService.listCondos(req.user.id, page, limit, companyId);
    res.json(result);
  })
);

// ✅ GET /condos/:condoId
router.get(
  '/:condoId',
  authenticateToken,
  canAccessCondo(), // 🔒 UNIFIED MIDDLEWARE
  asyncHandler(async (req, res) => {
    const condo = await CondoService.getCondoById(req.params.condoId, req.user.id);
    if (!condo) {
      return res.status(404).json({ error: 'Condo not found' });
    }
    res.json(condo);
  })
);

// ✅ POST /condos - Только uk_director
router.post(
  '/',
  authenticateToken,
  authorize('uk_director'), // 🔒 UNIFIED
  asyncHandler(async (req, res) => {
    const { company_id, name, address, description, total_buildings, total_units } = req.body;
    
    if (!company_id || !name || !address) {
      return res.status(400).json({ error: 'company_id, name, and address are required' });
    }
    
    // Проверка доступа к company
    req.params.companyId = company_id;
    const middleware = canAccessCompany();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const condo = await CondoService.createCondo({
      company_id,
      name,
      address,
      description,
      total_buildings,
      total_units,
    });
    
    res.status(201).json(condo);
  })
);

// ✅ PATCH /condos/:condoId - Только uk_director/complex_admin
router.patch(
  '/:condoId',
  authenticateToken,
  authorize('uk_director', 'complex_admin'), // 🔒 UNIFIED
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    const { name, address, description, total_buildings, total_units } = req.body;
    const condo = await CondoService.updateCondo(req.params.condoId, {
      name,
      address,
      description,
      total_buildings,
      total_units,
    });
    res.json(condo);
  })
);

// ✅ DELETE /condos/:condoId - Только uk_director
router.delete(
  '/:condoId',
  authenticateToken,
  authorize('uk_director'),
  canAccessCondo(),
  asyncHandler(async (req, res) => {
    await CondoService.deleteCondo(req.params.condoId);
    res.json({ message: 'Condo deleted successfully' });
  })
);

export default router;
