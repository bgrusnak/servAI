import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { ticketService } from '../services/ticket.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   POST /api/v1/tickets
 * @desc    Create new ticket
 * @access  Private
 */
router.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { unitId, condoId, categoryId, title, description, priority } = req.body;

    if (!unitId || !condoId || !categoryId || !title || !description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const ticket = await ticketService.createTicket({
      unitId,
      condoId,
      createdBy: userId,
      categoryId,
      title,
      description,
      priority
    });

    res.status(201).json({ success: true, ticket });
  } catch (error: any) {
    logger.error('Error creating ticket', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/tickets/:ticketId
 * @desc    Get ticket with comments
 * @access  Private
 */
router.get('/tickets/:ticketId', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await ticketService.getTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.json({ success: true, ticket });
  } catch (error: any) {
    logger.error('Error fetching ticket', { error, ticketId: req.params.ticketId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/tickets/:ticketId/comments
 * @desc    Add comment to ticket
 * @access  Private
 */
router.post('/tickets/:ticketId/comments', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = (req as any).user.id;
    const { comment, isInternal } = req.body;

    if (!comment) {
      return res.status(400).json({ 
        success: false, 
        error: 'Comment is required' 
      });
    }

    const newComment = await ticketService.addComment(
      ticketId,
      userId,
      comment,
      isInternal || false
    );

    res.status(201).json({ success: true, comment: newComment });
  } catch (error: any) {
    logger.error('Error adding ticket comment', { error, ticketId: req.params.ticketId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PATCH /api/v1/tickets/:ticketId/status
 * @desc    Update ticket status
 * @access  Private (Admin/Staff only)
 */
router.patch('/tickets/:ticketId/status', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = (req as any).user.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Status is required' 
      });
    }

    await ticketService.updateStatus(ticketId, status, userId);
    res.json({ success: true, message: 'Status updated' });
  } catch (error: any) {
    logger.error('Error updating ticket status', { error, ticketId: req.params.ticketId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PATCH /api/v1/tickets/:ticketId/assign
 * @desc    Assign ticket to staff
 * @access  Private (Admin only)
 */
router.patch('/tickets/:ticketId/assign', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ 
        success: false, 
        error: 'assignedTo is required' 
      });
    }

    await ticketService.assignTicket(ticketId, assignedTo);
    res.json({ success: true, message: 'Ticket assigned' });
  } catch (error: any) {
    logger.error('Error assigning ticket', { error, ticketId: req.params.ticketId });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
