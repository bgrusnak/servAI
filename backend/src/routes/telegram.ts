import { Router, Request, Response } from 'express';
import { telegramService } from '../services/telegram.service';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { logger } from '../utils/logger';
import rateLimit from 'express-rate-limit';
import { Counter } from 'prom-client';
import ipRangeCheck from 'ip-range-check';
import { config } from '../config';

const router = Router();

// Security metrics
const telegramSecurityEvents = new Counter({
  name: 'telegram_security_events_total',
  help: 'Security events in Telegram bot',
  labelNames: ['event_type', 'severity']
});

// Rate limiter for send endpoint
const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute per user
  message: 'Too many messages sent, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Telegram server IP ranges (as of 2026)
// Source: https://core.telegram.org/bots/webhooks#the-short-version
const TELEGRAM_IP_RANGES = [
  '149.154.160.0/20',
  '91.108.4.0/22',
  '91.108.8.0/22',
  '91.108.12.0/22',
  '91.108.16.0/22',
  '91.108.56.0/22',
  '149.154.164.0/22',
  '149.154.168.0/22',
  '149.154.172.0/22'
];

/**
 * Check if IP is in Telegram's allowed ranges using CIDR
 */
function isIpInTelegramRanges(ip: string): boolean {
  if (!ip || ip === 'unknown') {
    return false;
  }

  // In development, allow localhost/private IPs but log warning
  if (config.env === 'development') {
    logger.debug('Development mode: IP whitelist bypassed', { ip });
    return true;
  }

  // In production/staging, strictly check IP ranges
  try {
    // Remove IPv6 prefix if present (::ffff:x.x.x.x -> x.x.x.x)
    const cleanIp = ip.replace(/^::ffff:/, '');
    
    const isInRange = ipRangeCheck(cleanIp, TELEGRAM_IP_RANGES);
    
    if (!isInRange) {
      logger.warn('IP not in Telegram ranges', {
        ip: cleanIp,
        env: config.env
      });
      telegramSecurityEvents.inc({ event_type: 'ip_not_in_range', severity: 'high' });
    }
    
    return isInRange;
  } catch (error) {
    logger.error('IP range check error', { ip, error });
    return false;
  }
}

/**
 * Webhook endpoint for Telegram
 * POST /api/v1/telegram/webhook
 * 
 * Security:
 * - MANDATORY webhook secret verification
 * - IP whitelist check (CIDR)
 * - Request structure validation
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // 1. MANDATORY webhook secret verification
    const webhookToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookToken) {
      logger.error('TELEGRAM_WEBHOOK_SECRET not configured - webhook disabled');
      telegramSecurityEvents.inc({ event_type: 'missing_secret', severity: 'critical' });
      return res.status(503).json({ error: 'Service unavailable' });
    }

    const providedToken = req.headers['x-telegram-bot-api-secret-token'];
    if (!providedToken || providedToken !== webhookToken) {
      logger.warn('Invalid webhook token attempt', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        hasToken: !!providedToken
      });
      telegramSecurityEvents.inc({ event_type: 'invalid_webhook_token', severity: 'high' });
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 2. IP whitelist check (strict in production)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!isIpInTelegramRanges(clientIp)) {
      logger.error('Webhook from non-Telegram IP blocked', {
        ip: clientIp,
        hasValidToken: true,
        env: config.env
      });
      telegramSecurityEvents.inc({ event_type: 'blocked_non_telegram_ip', severity: 'critical' });
      
      // In production, BLOCK non-Telegram IPs even with valid token
      if (config.env === 'production' || config.env === 'staging') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // 3. Validate update structure
    if (!req.body || typeof req.body.update_id !== 'number') {
      logger.warn('Invalid update structure', { body: req.body });
      telegramSecurityEvents.inc({ event_type: 'invalid_update', severity: 'medium' });
      return res.status(400).json({ error: 'Invalid update format' });
    }

    // 4. Process update
    // Note: We already verified the webhook secret here,
    // so service can trust this is a legitimate Telegram update
    await telegramService.processWebhookUpdate(req.body);
    
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Error processing Telegram webhook', { error });
    telegramSecurityEvents.inc({ event_type: 'webhook_error', severity: 'high' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Send message to user (for admin/system notifications)
 * POST /api/v1/telegram/send
 * 
 * Security:
 * - Requires authentication
 * - Admin/system role only
 * - Rate limited
 */
router.post('/send',
  authenticate,
  authorize('superadmin', 'admin', 'system'),
  sendMessageLimiter,
  async (req: Request, res: Response) => {
    try {
      const { telegram_id, message, options, priority } = req.body;

      // Validation
      if (!telegram_id || !message) {
        return res.status(400).json({ error: 'telegram_id and message required' });
      }

      if (typeof telegram_id !== 'number') {
        return res.status(400).json({ error: 'telegram_id must be a number' });
      }

      if (typeof message !== 'string' || message.length === 0) {
        return res.status(400).json({ error: 'message must be a non-empty string' });
      }

      if (message.length > 4096) {
        return res.status(400).json({ error: 'message too long (max 4096 characters)' });
      }

      await telegramService.sendMessage(telegram_id, message, options, priority || 0);
      
      logger.info('Admin sent Telegram message', {
        userId: (req as any).user?.id,
        telegramId: telegram_id,
        messageLength: message.length
      });
      
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Error sending Telegram message', { error });
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

/**
 * Get webhook info (admin only)
 * GET /api/v1/telegram/webhook-info
 */
router.get('/webhook-info',
  authenticate,
  authorize('superadmin'),
  async (req: Request, res: Response) => {
    try {
      const info = await telegramService.getWebhookInfo();
      res.json(info);
    } catch (error) {
      logger.error('Error getting webhook info', { error });
      res.status(500).json({ error: 'Failed to get webhook info' });
    }
  }
);

export default router;