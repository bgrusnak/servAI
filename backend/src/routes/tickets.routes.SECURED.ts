import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { canAccessUnit, canAccessTask, authorize } from '../middleware/authorize.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { TicketService } from '../services/ticket.service';

const router = Router();
const ticketService = new TicketService();

// ✅ GET /units/:unitId/tickets - Заявки квартиры
router.get(
  '/units/:unitId/tickets',
  authenticateToken,
  canAccessUnit(), // 🔒 SECURITY
  asyncHandler(async (req, res) => {
    const tickets = await ticketService.getByUnit(req.params.unitId);
    res.json(tickets);
  })
);

// ✅ GET /tickets/my - Мои задачи (для employee)
router.get(
  '/tickets/my',
  authenticateToken,
  authorize('employee', 'complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    const tickets = await ticketService.getMyTasks(req.user.id, req.user.role);
    res.json(tickets);
  })
);

// ✅ GET /tickets/:id
router.get(
  '/tickets/:id',
  authenticateToken,
  canAccessTask(), // 🔒 SECURITY: Только свои задачи
  asyncHandler(async (req, res) => {
    const ticket = await ticketService.getById(req.params.id);
    res.json(ticket);
  })
);

// ✅ POST /units/:unitId/tickets - Создать заявку
router.post(
  '/units/:unitId/tickets',
  authenticateToken,
  authorize('resident', 'complex_admin', 'uk_director'),
  canAccessUnit(),
  asyncHandler(async (req, res) => {
    const ticket = await ticketService.create(req.params.unitId, req.body, req.user.id);
    res.status(201).json(ticket);
  })
);

// ✅ PUT /tickets/:id - Обновить заявку
router.put(
  '/tickets/:id',
  authenticateToken,
  canAccessTask(),
  asyncHandler(async (req, res) => {
    const ticket = await ticketService.update(req.params.id, req.body);
    res.json(ticket);
  })
);

// ✅ PUT /tickets/:id/assign - Назначить сотрудника
router.put(
  '/tickets/:id/assign',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    const ticket = await ticketService.assign(req.params.id, req.body.employeeId);
    res.json(ticket);
  })
);

// ✅ PUT /tickets/:id/complete - Завершить задачу
router.put(
  '/tickets/:id/complete',
  authenticateToken,
  authorize('employee', 'complex_admin', 'uk_director'),
  canAccessTask(),
  asyncHandler(async (req, res) => {
    const ticket = await ticketService.complete(req.params.id);
    res.json(ticket);
  })
);

// ✅ DELETE /tickets/:id - Только admin
router.delete(
  '/tickets/:id',
  authenticateToken,
  authorize('complex_admin', 'uk_director'),
  asyncHandler(async (req, res) => {
    await ticketService.delete(req.params.id);
    res.status(204).send();
  })
);

export default router;
