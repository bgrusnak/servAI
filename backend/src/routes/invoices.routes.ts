import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { InvoiceService } from '../services/invoice.service';

const router = Router();
const invoiceService = new InvoiceService();

// ✅ GET /units/:unitId/invoices - Счета квартиры
router.get(
  '/units/:unitId/invoices',
  authenticateToken,
  canAccessUnit(), // 🔒 SECURITY: Только своя квартира
  asyncHandler(async (req, res) => {
    const invoices = await invoiceService.getByUnit(req.params.unitId);
    res.json(invoices);
  })
);

// ✅ GET /invoices/:id
router.get(
  '/invoices/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getById(req.params.id);
    
    // Проверка доступа к квартире
    req.params.unitId = invoice.unitId;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    res.json(invoice);
  })
);

// ✅ POST /units/:unitId/invoices - Только admin/accountant
router.post(
  '/units/:unitId/invoices',
  authenticateToken,
  authorize('uk_director', 'accountant', 'complex_admin'), // 🔒 SECURITY
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.create(req.params.unitId, req.body);
    res.status(201).json(invoice);
  })
);

// ✅ PUT /invoices/:id - Только admin/accountant
router.put(
  '/invoices/:id',
  authenticateToken,
  authorize('uk_director', 'accountant', 'complex_admin'),
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.update(req.params.id, req.body);
    res.json(invoice);
  })
);

// ✅ DELETE /invoices/:id - Только admin
router.delete(
  '/invoices/:id',
  authenticateToken,
  authorize('uk_director', 'complex_admin'),
  asyncHandler(async (req, res) => {
    await invoiceService.delete(req.params.id);
    res.status(204).send();
  })
);

// ✅ POST /invoices/:id/pay - Оплата счёта
router.post(
  '/invoices/:id/pay',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const invoice = await invoiceService.getById(req.params.id);
    req.params.unitId = invoice.unitId;
    const middleware = canAccessUnit();
    await new Promise((resolve, reject) => {
      middleware(req, res, (err) => err ? reject(err) : resolve(null));
    });
    
    const result = await invoiceService.pay(req.params.id, req.body);
    res.json(result);
  })
);

export default router;
