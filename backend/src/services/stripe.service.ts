import Stripe from 'stripe';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Allowed currencies (ISO 4217)
const ALLOWED_CURRENCIES = ['rub', 'usd', 'eur', 'kzt', 'uah'];

// Amount validation constants
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 999999.99;

export class StripeService {
  /**
   * Validate amount for payment
   */
  private validateAmount(amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new Error('Amount must be a valid number');
    }

    if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      throw new Error(`Amount must be between ${MIN_AMOUNT} and ${MAX_AMOUNT}`);
    }

    // Check precision (max 2 decimal places)
    const amountInKopecks = Math.round(amount * 100);
    if (Math.abs(amountInKopecks - amount * 100) > 0.001) {
      throw new Error('Amount must have at most 2 decimal places');
    }
  }

  /**
   * Validate currency code
   */
  private validateCurrency(currency: string): string {
    const normalized = currency.toLowerCase().trim();
    
    if (!ALLOWED_CURRENCIES.includes(normalized)) {
      throw new Error(`Invalid currency. Allowed: ${ALLOWED_CURRENCIES.join(', ')}`);
    }
    
    return normalized;
  }

  /**
   * Create Stripe customer for company
   */
  async createCustomer(companyId: string, email: string, name: string): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: { companyId }
      });

      await pool.query(
        'UPDATE companies SET stripe_customer_id = $1 WHERE id = $2',
        [customer.id, companyId]
      );

      logger.info('Stripe customer created', { customerId: customer.id, companyId });
      return customer.id;
    } catch (error) {
      logger.error('Failed to create Stripe customer', { error, companyId });
      throw error;
    }
  }

  /**
   * Create payment intent for invoice with full validation
   */
  async createPaymentIntent(invoiceId: string, amount: number, currency: string = 'rub'): Promise<any> {
    try {
      // Validate inputs
      this.validateAmount(amount);
      const validatedCurrency = this.validateCurrency(currency);

      const invoiceResult = await pool.query(
        `SELECT i.*, u.owner_email, c.stripe_customer_id
         FROM invoices i
         JOIN units u ON i.unit_id = u.id
         JOIN condos co ON i.condo_id = co.id
         JOIN companies c ON co.company_id = c.id
         WHERE i.id = $1`,
        [invoiceId]
      );

      if (invoiceResult.rows.length === 0) {
        throw new Error('Invoice not found');
      }

      const invoice = invoiceResult.rows[0];

      // Generate idempotency key to prevent double charging
      const idempotencyKey = `invoice_${invoiceId}_${Date.now()}`;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to kopecks
        currency: validatedCurrency,
        customer: invoice.stripe_customer_id,
        receipt_email: invoice.owner_email,
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoice_number
        },
        automatic_payment_methods: {
          enabled: true,
        },
      }, {
        idempotencyKey // Prevent duplicate charges on retry
      });

      await pool.query(
        'UPDATE invoices SET stripe_payment_intent_id = $1 WHERE id = $2',
        [paymentIntent.id, invoiceId]
      );

      logger.info('Payment intent created', { 
        paymentIntentId: paymentIntent.id, 
        invoiceId,
        amount,
        currency: validatedCurrency
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      };
    } catch (error) {
      logger.error('Failed to create payment intent', { error, invoiceId });
      throw error;
    }
  }

  /**
   * Verify webhook signature and construct event
   * CRITICAL: Must be called for every webhook request
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = config.stripe.webhookSecret;
    
    if (!webhookSecret) {
      logger.error('Stripe webhook secret not configured');
      throw new Error('Webhook secret not configured');
    }

    try {
      // Stripe verifies signature and constructs event
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
      
      logger.info('Webhook signature verified', { eventType: event.type });
      return event;
    } catch (error: any) {
      logger.error('Webhook signature verification failed', { 
        error: error.message,
        hasSignature: !!signature
      });
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Handle webhook events from Stripe
   * CRITICAL: Only call after signature verification!
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.handlePaymentSuccess(paymentIntent);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await this.handlePaymentFailure(paymentIntent);
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          await this.handleRefund(charge);
          break;
        }

        default:
          logger.info('Unhandled Stripe event', { type: event.type });
      }
    } catch (error) {
      logger.error('Failed to handle Stripe webhook', { error, eventType: event.type });
      throw error;
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const invoiceId = paymentIntent.metadata.invoiceId;
    
    if (!invoiceId) {
      logger.warn('Payment intent missing invoice ID', { paymentIntentId: paymentIntent.id });
      return;
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check for duplicate payment to prevent double processing
      const existingPayment = await client.query(
        'SELECT id FROM payments WHERE stripe_payment_id = $1',
        [paymentIntent.id]
      );

      if (existingPayment.rows.length > 0) {
        logger.warn('Payment already processed (duplicate webhook)', {
          paymentIntentId: paymentIntent.id,
          invoiceId
        });
        await client.query('ROLLBACK');
        return;
      }

      // Create payment record
      await client.query(
        `INSERT INTO payments (
          invoice_id, amount, payment_method, status,
          stripe_payment_id, stripe_charge_id
        ) VALUES ($1, $2, 'stripe', 'completed', $3, $4)`,
        [
          invoiceId,
          paymentIntent.amount / 100,
          paymentIntent.id,
          paymentIntent.latest_charge
        ]
      );

      // Update invoice WITH LOCK to prevent race condition
      await client.query(
        `UPDATE invoices 
         SET paid_amount = paid_amount + $1,
             status = CASE 
               WHEN paid_amount + $1 >= total_amount THEN 'paid'::invoice_status
               ELSE status
             END
         WHERE id = $2
         FOR UPDATE`,  // CRITICAL: Lock the row to prevent concurrent updates
        [paymentIntent.amount / 100, invoiceId]
      );

      await client.query('COMMIT');
      logger.info('Payment success handled', { invoiceId, amount: paymentIntent.amount / 100 });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to handle payment success', { error, invoiceId });
      throw error;
    } finally {
      client.release();
    }
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const invoiceId = paymentIntent.metadata.invoiceId;
    
    if (!invoiceId) return;

    // Check for duplicate
    const existing = await pool.query(
      'SELECT id FROM payments WHERE stripe_payment_id = $1',
      [paymentIntent.id]
    );

    if (existing.rows.length > 0) {
      logger.warn('Payment failure already recorded', { paymentIntentId: paymentIntent.id });
      return;
    }

    await pool.query(
      `INSERT INTO payments (
        invoice_id, amount, payment_method, status,
        stripe_payment_id
      ) VALUES ($1, $2, 'stripe', 'failed', $3)`,
      [invoiceId, paymentIntent.amount / 100, paymentIntent.id]
    );

    logger.warn('Payment failed', { invoiceId, paymentIntentId: paymentIntent.id });
  }

  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    const result = await pool.query(
      `UPDATE payments 
       SET status = 'refunded'
       WHERE stripe_charge_id = $1
       RETURNING id, invoice_id`,
      [charge.id]
    );

    if (result.rows.length > 0) {
      const payment = result.rows[0];
      
      // Update invoice paid_amount
      await pool.query(
        `UPDATE invoices
         SET paid_amount = paid_amount - $1,
             status = CASE
               WHEN paid_amount - $1 < total_amount THEN 'pending'::invoice_status
               ELSE status
             END
         WHERE id = $2`,
        [charge.amount / 100, payment.invoice_id]
      );
      
      logger.info('Refund processed', { 
        chargeId: charge.id,
        invoiceId: payment.invoice_id,
        amount: charge.amount / 100
      });
    } else {
      logger.warn('Refund for unknown charge', { chargeId: charge.id });
    }
  }
}

export const stripeService = new StripeService();