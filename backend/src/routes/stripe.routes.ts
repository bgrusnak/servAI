import { Router, Request, Response } from 'express';
import { stripeService } from '../services/stripe.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { config } from '../config';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

/**
 * @route   POST /api/v1/stripe/payment-intent
 * @desc    Create payment intent for invoice
 * @access  Private
 */
router.post('/stripe/payment-intent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount } = req.body;

    if (!invoiceId || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'invoiceId and amount are required' 
      });
    }

    const result = await stripeService.createPaymentIntent(invoiceId, parseFloat(amount));
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
 */
router.post('/stripe/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );

    await stripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (error: any) {
    logger.error('Stripe webhook error', { error: error.message });
    res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }
});

export default router;
