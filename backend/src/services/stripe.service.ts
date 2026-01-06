import Stripe from 'stripe';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { config } from '../config';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export class StripeService {
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
   * Create payment intent for invoice
   */
  async createPaymentIntent(invoiceId: string, amount: number, currency: string = 'rub'): Promise<any> {
    try {
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

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to kopecks
        currency: currency.toLowerCase(),
        customer: invoice.stripe_customer_id,
        receipt_email: invoice.owner_email,
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoice_number
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      await pool.query(
        'UPDATE invoices SET stripe_payment_intent_id = $1 WHERE id = $2',
        [paymentIntent.id, invoiceId]
      );

      logger.info('Payment intent created', { 
        paymentIntentId: paymentIntent.id, 
        invoiceId 
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
   * Handle webhook events from Stripe
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

      // Update invoice
      await client.query(
        `UPDATE invoices 
         SET paid_amount = paid_amount + $1,
             status = CASE 
               WHEN paid_amount + $1 >= total_amount THEN 'paid'::invoice_status
               ELSE status
             END
         WHERE id = $2`,
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
    await pool.query(
      `UPDATE payments 
       SET status = 'refunded'
       WHERE stripe_charge_id = $1`,
      [charge.id]
    );

    logger.info('Refund processed', { chargeId: charge.id });
  }
}

export const stripeService = new StripeService();
