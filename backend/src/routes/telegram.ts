import { Router, Request, Response } from 'express';
import { telegramService } from '../services/telegram.service';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize.middleware';
import { logger } from '../utils/logger';
import rateLimit from 'express-rate-limit';
import { Counter } from 'prom-client';

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

// Telegram server IP ranges (as of 2025)
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
 * Check if IP is in allowed ranges
 */
function isIpInRange(ip: string, ranges: string[]): boolean {
  // Simple IP check - in production use 'ip-range-check' library
  // For now, allow all in development
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  
  // TODO: Implement proper CIDR check with ip-range-check library
  // For now, log and allow (but track metrics)
  logger.debug('IP check', { ip, env: process.env.NODE_ENV });
  return true;
}

/**
 * Webhook endpoint for Telegram
 * POST /api/v1/telegram/webhook
 * 
 * Security:
 * - MANDATORY webhook secret verification
 * - IP whitelist check
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

    // 2. IP whitelist check (log if not from Telegram)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!isIpInRange(clientIp, TELEGRAM_IP_RANGES)) {
      logger.warn('Webhook from non-Telegram IP', {
        ip: clientIp,
        hasValidToken: true
      });
      telegramSecurityEvents.inc({ event_type: 'suspicious_ip', severity: 'medium' });
      // Don't block yet, just log (could be proxy/load balancer)
    }

    // 3. Validate update structure
    if (!req.body || typeof req.body.update_id !== 'number') {
      logger.warn('Invalid update structure', { body: req.body });
      telegramSecurityEvents.inc({ event_type: 'invalid_update', severity: 'medium' });
      return res.status(400).json({ error: 'Invalid update format' });
    }

    // 4. Process update
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
