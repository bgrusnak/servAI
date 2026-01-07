import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessCompany, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { CompanyService } from '../services/company.service';

const router = Router();

// ✅ GET /companies - Список УК (только свои)
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await CompanyService.listCompanies(req.user.id, page, limit);
    res.json(result);
  })
);

// ✅ GET /companies/:companyId
router.get(
  '/:companyId',
  authenticateToken,
  canAccessCompany(), // 🔒 UNIFIED MIDDLEWARE
  asyncHandler(async (req, res) => {
    const company = await CompanyService.getCompanyById(req.params.companyId, req.user.id);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(company);
  })
);

// ✅ POST /companies - Только superadmin
router.post(
  '/',
  authenticateToken,
  authorize('superadmin'), // 🔒 UNIFIED
  asyncHandler(async (req, res) => {
    const { name, legal_name, inn, kpp, address, phone, email, website } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    const company = await CompanyService.createCompany({
      name,
      legal_name,
      inn,
      kpp,
      address,
      phone,
      email,
      website,
    }, req.user.id);
    
    res.status(201).json(company);
  })
);

// ✅ PATCH /companies/:companyId - Только uk_director
router.patch(
  '/:companyId',
  authenticateToken,
  authorize('uk_director'), // 🔒 UNIFIED
  canAccessCompany(),
  asyncHandler(async (req, res) => {
    const { name, legal_name, inn, kpp, address, phone, email, website, is_active } = req.body;
    const company = await CompanyService.updateCompany(req.params.companyId, {
      name,
      legal_name,
      inn,
      kpp,
      address,
      phone,
      email,
      website,
      is_active,
    });
    res.json(company);
  })
);

// ✅ DELETE /companies/:companyId - Только superadmin
router.delete(
  '/:companyId',
  authenticateToken,
  authorize('superadmin'),
  asyncHandler(async (req, res) => {
    await CompanyService.deleteCompany(req.params.companyId);
    res.json({ message: 'Company deleted successfully' });
  })
);

export default router;
