import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { invoiceService } from '../services/invoice.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route   GET /api/v1/invoices
 * @desc    Get invoices with filters
 * @access  Private
 */
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const { unitId, condoId, status, fromDate, toDate, limit, offset } = req.query;

    const filter: any = {};
    if (unitId) filter.unitId = unitId as string;
    if (condoId) filter.condoId = condoId as string;
    if (status) filter.status = status as string;
    if (fromDate) filter.fromDate = fromDate as string;
    if (toDate) filter.toDate = toDate as string;

    const result = await invoiceService.getInvoices(
      filter,
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0
    );

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error fetching invoices', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/invoices/:invoiceId
 * @desc    Get invoice by ID with items
 * @access  Private
 */
router.get('/invoices/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await invoiceService.getInvoiceById(invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({ success: true, invoice });
  } catch (error: any) {
    logger.error('Error fetching invoice', { error, invoiceId: req.params.invoiceId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/invoices/:invoiceId/payments
 * @desc    Record payment for invoice
 * @access  Private
 */
router.post('/invoices/:invoiceId/payments', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const userId = (req as any).user.id;
    const { amount, method } = req.body;

    if (!amount || !method) {
      return res.status(400).json({ 
        success: false, 
        error: 'Amount and method are required' 
      });
    }

    const payment = await invoiceService.recordPayment(
      invoiceId,
      userId,
      parseFloat(amount),
      method
    );

    res.status(201).json({ success: true, payment });
  } catch (error: any) {
    logger.error('Error recording payment', { error, invoiceId: req.params.invoiceId });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/v1/units/:unitId/invoices
 * @desc    Get invoices for specific unit
 * @access  Private
 */
router.get('/units/:unitId/invoices', authenticateToken, async (req, res) => {
  try {
    const { unitId } = req.params;
    const { status, limit, offset } = req.query;

    const filter: any = { unitId };
    if (status) filter.status = status as string;

    const result = await invoiceService.getInvoices(
      filter,
      parseInt(limit as string) || 50,
      parseInt(offset as string) || 0
    );

    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error fetching unit invoices', { error, unitId: req.params.unitId });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
