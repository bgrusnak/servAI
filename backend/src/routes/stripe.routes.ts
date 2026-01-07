import { Router, Request, Response } from 'express';
import { stripeService } from '../services/stripe.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { config } from '../config';
import express from 'express';

const router = Router();

// UUID v4 validation regex
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID v4 format
 */
function isValidUUID(str: string): boolean {
  return typeof str === 'string' && UUID_V4_REGEX.test(str);
}

/**
 * Validate and parse amount
 */
function validateAmount(amount: any): number {
  // Check if amount exists
  if (amount === undefined || amount === null) {
    throw new Error('Amount is required');
  }

  // Convert to number
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);

  // Check for NaN
  if (isNaN(numAmount)) {
    throw new Error('Amount must be a valid number');
  }

  // Check for Infinity
  if (!isFinite(numAmount)) {
    throw new Error('Amount must be a finite number');
  }

  // Check range (0.01 to 999,999.99)
  if (numAmount < 0.01 || numAmount > 999999.99) {
    throw new Error('Amount must be between 0.01 and 999,999.99');
  }

  return numAmount;
}

/**
 * @route   POST /api/v1/stripe/payment-intent
 * @desc    Create payment intent for invoice
 * @access  Private
 */
router.post('/stripe/payment-intent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount, currency } = req.body;

    // Validate invoiceId
    if (!invoiceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'invoiceId is required' 
      });
    }

    if (!isValidUUID(invoiceId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'invoiceId must be a valid UUID' 
      });
    }

    // Validate amount
    let validatedAmount: number;
    try {
      validatedAmount = validateAmount(amount);
    } catch (error: any) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }

    const result = await stripeService.createPaymentIntent(
      invoiceId, 
      validatedAmount,
      currency
    );
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    logger.error('Error creating payment intent', { error });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/v1/stripe/webhook
 * @desc    Handle Stripe webhooks
 * @access  Public (verified by Stripe signature)
 * 
 * CRITICAL: Must use raw body for signature verification!
 * This endpoint uses express.raw() middleware to preserve raw body.
 */
router.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }), // CRITICAL: Parse as raw buffer
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];

    if (!sig || typeof sig !== 'string') {
      logger.warn('Webhook request missing stripe-signature header');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    try {
      // Construct and verify event from raw body
      // req.body is Buffer here due to express.raw() middleware
      const event = stripeService.constructWebhookEvent(
        req.body, // Raw buffer
        sig
      );

      // Process the verified event
      await stripeService.handleWebhook(event);
      
      res.json({ received: true });
    } catch (error: any) {
      logger.error('Stripe webhook error', { 
        error: error.message,
        hasSignature: !!sig
      });
      res.status(400).json({ error: `Webhook Error: ${error.message}` });
    }
  }
);

export default router;