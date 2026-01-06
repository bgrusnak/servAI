import { Router, Request, Response } from 'express';
import { telegramService } from '../services/telegram.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Webhook endpoint for Telegram
 * POST /api/v1/telegram/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Verify webhook token if configured
    const webhookToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookToken) {
      const providedToken = req.headers['x-telegram-bot-api-secret-token'];
      if (providedToken !== webhookToken) {
        return res.status(403).json({ error: 'Invalid webhook token' });
      }
    }

    // Process update
    await telegramService.processWebhookUpdate(req.body);
    
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Error processing Telegram webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Send message to user (for admin/system notifications)
 * POST /api/v1/telegram/send
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { telegram_id, message, options } = req.body;

    if (!telegram_id || !message) {
      return res.status(400).json({ error: 'telegram_id and message required' });
    }

    await telegramService.sendMessage(telegram_id, message, options);
    
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error sending Telegram message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
