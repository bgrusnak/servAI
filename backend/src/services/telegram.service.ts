import TelegramBot from 'node-telegram-bot-api';
import { Pool, PoolClient } from 'pg';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { openaiService } from './openai.service';
import { Counter, Histogram, Gauge } from 'prom-client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import stream from 'stream';
import {
  sanitizeTelegramName,
  sanitizeTelegramUsername,
  sanitizeMessageText,
  hashTelegramId,
  isValidTelegramId
} from '../utils/telegram-sanitizer';

const pipeline = promisify(stream.pipeline);

// Constants
const CONVERSATION_HISTORY_LIMIT = parseInt(process.env.CONVERSATION_HISTORY_LIMIT || '20');
const CONVERSATION_HISTORY_MAX_AGE_HOURS = parseInt(process.env.CONVERSATION_HISTORY_MAX_AGE_HOURS || '24');
const INTENT_CONFIDENCE_THRESHOLD = parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD || '0.7');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TELEGRAM_RATE_LIMIT_PER_SECOND = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_SECOND || '25');
const MESSAGE_INTERVAL_MS = 1000 / TELEGRAM_RATE_LIMIT_PER_SECOND;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 4096;  // Telegram's limit
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/servai-telegram';
const JOB_TIMEOUT_MS = 30000; // 30 seconds
const TEMP_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const START_COMMAND_RATE_LIMIT = 5; // Max 5 /start per minute per user
const START_COMMAND_WINDOW_MS = 60 * 1000; // 1 minute

// Allowed language codes (ISO 639-1)
const ALLOWED_LANGUAGE_CODES = ['ru', 'en', 'uk', 'kk', 'be'];

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Metrics
const telegramMessagesTotal = new Counter({
  name: 'telegram_messages_total',
  help: 'Total Telegram messages processed',
  labelNames: ['type', 'status']
});

const telegramIntentDuration = new Histogram({
  name: 'telegram_intent_recognition_duration_seconds',
  help: 'Duration of intent recognition'
});

const telegramActiveUsers = new Counter({
  name: 'telegram_active_users_total',
  help: 'Total active Telegram users'
});

const telegramQueueSize = new Gauge({
  name: 'telegram_queue_size',
  help: 'Current size of Telegram message queue'
});

const telegramQueueDelayed = new Gauge({
  name: 'telegram_queue_delayed',
  help: 'Number of delayed jobs in Telegram queue'
});

const telegramSecurityEvents = new Counter({
  name: 'telegram_security_events_total',
  help: 'Security events in Telegram bot',
  labelNames: ['event_type', 'severity']
});

interface TelegramUser {
  id: string;
  user_id: string;
  telegram_id: number;
  language_code: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface IntentResult {
  intent: string;
  confidence: number;
  parameters: Record<string, any>;
  response: string;
  summary_update?: string;
}

interface QueuedMessage {
  telegramId: number;
  text: string;
  options?: any;
  priority?: number;
}

class TelegramService {
  private bot: TelegramBot | null = null;
  private webhookUrl: string = '';
  private webhookSecret: string = '';
  private messageQueue: Queue<QueuedMessage> | null = null;
  private messageWorker: Worker<QueuedMessage> | null = null;
  private redisConnection: IORedis | null = null;
  private lastMessageTime = 0;
  private tempCleanupInterval: NodeJS.Timeout | null = null;
  private startCommandRateLimiter: Map<number, number[]> = new Map();
  private redisHealthy: boolean = true;

  async initialize(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      const message = 'TELEGRAM_BOT_TOKEN not set - bot features disabled';
      logger.error(message);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error('TELEGRAM_BOT_TOKEN is required in production');
      }
      
      logger.warn('Bot will not start in development mode without token');
      return;
    }

    const useWebhook = process.env.TELEGRAM_USE_WEBHOOK === 'true';
    
    if (useWebhook) {
      // Validate webhook configuration
      this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || '';
      if (!this.webhookUrl) {
        throw new Error('TELEGRAM_WEBHOOK_URL required for webhook mode');
      }

      this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
      if (!this.webhookSecret) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET is MANDATORY for webhook mode');
      }

      // Validate webhook secret strength
      if (this.webhookSecret.length < 32) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET must be at least 32 characters');
      }

      this.bot = new TelegramBot(token, { webHook: true });
      
      // Set webhook with secret token
      await this.bot.setWebHook(`${this.webhookUrl}/api/v1/telegram/webhook`, {
        secret_token: this.webhookSecret,
        max_connections: 40,
        allowed_updates: ['message', 'callback_query']
      });
      
      logger.info('Telegram bot initialized in webhook mode', { 
        url: this.webhookUrl,
        hasSecret: true,
        secretLength: this.webhookSecret.length
      });
    } else {
      this.bot = new TelegramBot(token, { polling: true });
      logger.info('Telegram bot initialized in polling mode');
    }

    this.setupHandlers();
    await this.initializeMessageQueue();
    
    // Cleanup old temp files on start
    await this.cleanupOldTempFiles();
    
    // Setup periodic temp file cleanup
    this.tempCleanupInterval = setInterval(() => {
      this.cleanupOldTempFiles().catch(err => {
        logger.error('Error in periodic temp cleanup', { error: err });
      });
    }, TEMP_CLEANUP_INTERVAL_MS);
  }

  private async initializeMessageQueue(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error('REDIS_URL is required for message queue');
      }
      
      this.redisConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        retryStrategy: (times) => {
          if (times > 10) {
            this.redisHealthy = false;
            logger.error('Redis connection failed after 10 retries');
            return null;
          }
          return Math.min(times * 100, 3000);
        }
      });

      this.redisConnection.on('error', (err) => {
        this.redisHealthy = false;
        logger.error('Redis connection error', { error: err });
      });

      this.redisConnection.on('ready', () => {
        this.redisHealthy = true;
        logger.info('Redis connection ready for message queue');
      });

      this.redisConnection.on('reconnecting', () => {
        logger.warn('Redis reconnecting...');
      });
      
      this.messageQueue = new Queue<QueuedMessage>('telegram-outgoing-messages', {
        connection: this.redisConnection.duplicate(),
        defaultJobOptions: {
          attempts: MAX_RETRIES,
          backoff: {
            type: 'exponential',
            delay: RETRY_DELAY_MS
          },
          removeOnComplete: 100,
          removeOnFail: 500,
          timeout: JOB_TIMEOUT_MS // Add timeout to prevent hanging jobs
        }
      });

      this.messageWorker = new Worker<QueuedMessage>(
        'telegram-outgoing-messages',
        async (job: Job<QueuedMessage>) => {
          const { telegramId, text, options } = job.data;
          
          try {
            const now = Date.now();
            const timeSinceLastMessage = now - this.lastMessageTime;
            if (timeSinceLastMessage < MESSAGE_INTERVAL_MS) {
              await this.sleep(MESSAGE_INTERVAL_MS - timeSinceLastMessage);
            }

            if (!this.bot) {
              throw new Error('Bot not initialized');
            }

            await this.bot.sendMessage(telegramId, text, options);
            this.lastMessageTime = Date.now();
            
            telegramMessagesTotal.inc({ type: 'outgoing', status: 'sent' });
            logger.debug('Message sent from queue', { 
              telegramId, 
              jobId: job.id,
              queueSize: await this.messageQueue?.count()
            });
          } catch (error: any) {
            if (error.response?.statusCode === 429) {
              const retryAfter = error.response?.parameters?.retry_after || 1;
              logger.warn('Telegram rate limit hit', {
                telegramId,
                jobId: job.id,
                retryAfter
              });
              
              telegramMessagesTotal.inc({ type: 'outgoing', status: 'rate_limited' });
              throw new Error(`RATE_LIMIT:${retryAfter * 1000}`);
            }
            
            if (error.message?.includes('FLOOD_WAIT')) {
              const match = error.message.match(/FLOOD_WAIT_(\d+)/);
              const waitSeconds = match ? parseInt(match[1]) : 60;
              logger.warn('Telegram flood wait', {
                telegramId,
                jobId: job.id,
                waitSeconds
              });
              
              telegramMessagesTotal.inc({ type: 'outgoing', status: 'flood_wait' });
              throw new Error(`FLOOD_WAIT:${waitSeconds * 1000}`);
            }
            
            logger.error('Failed to send message from queue', {
              telegramId,
              jobId: job.id,
              error: error.message
            });
            
            telegramMessagesTotal.inc({ type: 'outgoing', status: 'error' });
            throw error;
          }
        },
        {
          connection: this.redisConnection.duplicate(),
          concurrency: 1,
          limiter: {
            max: TELEGRAM_RATE_LIMIT_PER_SECOND,
            duration: 1000
          }
        }
      );

      this.messageWorker.on('completed', (job) => {
        logger.debug('Job completed', { jobId: job.id });
      });

      this.messageWorker.on('failed', async (job, err) => {
        if (err.message.startsWith('RATE_LIMIT:') || err.message.startsWith('FLOOD_WAIT:')) {
          const delayMs = parseInt(err.message.split(':')[1]);
          logger.info('Retrying job after delay', {
            jobId: job?.id,
            delayMs
          });
          
          if (job && this.messageQueue) {
            await this.messageQueue.add(job.name, job.data, {
              delay: delayMs,
              priority: job.opts.priority
            });
          }
        } else {
          logger.error('Job failed permanently', {
            jobId: job?.id,
            error: err.message,
            attempts: job?.attemptsMade
          });
        }
      });

      this.messageWorker.on('stalled', (jobId) => {
        logger.warn('Job stalled', { jobId });
      });

      setInterval(async () => {
        if (this.messageQueue) {
          const waiting = await this.messageQueue.getWaitingCount();
          const active = await this.messageQueue.getActiveCount();
          const delayed = await this.messageQueue.getDelayedCount();
          
          telegramQueueSize.set(waiting + active);
          telegramQueueDelayed.set(delayed);
        }
      }, 5000);

      logger.info('Telegram message queue initialized', {
        rateLimit: TELEGRAM_RATE_LIMIT_PER_SECOND,
        intervalMs: MESSAGE_INTERVAL_MS,
        jobTimeout: JOB_TIMEOUT_MS
      });
    } catch (error) {
      logger.error('Failed to initialize message queue', { error });
      throw error;
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      await this.handleStart(msg, match?.[1]?.trim());
    });

    this.bot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return;
      await this.handleMessage(msg);
    });

    this.bot.on('photo', async (msg) => {
      await this.handlePhoto(msg);
    });

    this.bot.on('callback_query', async (query) => {
      await this.handleCallbackQuery(query);
    });

    logger.info('Telegram bot handlers setup complete');
  }

  private isStartCommandRateLimited(telegramId: number): boolean {
    const now = Date.now();
    const userRequests = this.startCommandRateLimiter.get(telegramId) || [];
    
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(
      timestamp => now - timestamp < START_COMMAND_WINDOW_MS
    );
    
    if (recentRequests.length >= START_COMMAND_RATE_LIMIT) {
      return true;
    }
    
    recentRequests.push(now);
    this.startCommandRateLimiter.set(telegramId, recentRequests);
    
    // Cleanup old entries periodically
    if (this.startCommandRateLimiter.size > 10000) {
      const entriesToDelete: number[] = [];
      this.startCommandRateLimiter.forEach((timestamps, id) => {
        if (timestamps.every(t => now - t > START_COMMAND_WINDOW_MS)) {
          entriesToDelete.push(id);
        }
      });
      entriesToDelete.forEach(id => this.startCommandRateLimiter.delete(id));
    }
    
    return false;
  }

  private async handleStart(msg: TelegramBot.Message, inviteToken?: string): Promise<void> {
    try {
      const telegramId = msg.from?.id;
      if (!telegramId || !isValidTelegramId(telegramId)) {
        logger.warn('Invalid telegram ID in /start', { telegramId });
        return;
      }

      // Rate limiting for /start command
      if (this.isStartCommandRateLimited(telegramId)) {
        telegramSecurityEvents.inc({ event_type: 'start_rate_limited', severity: 'medium' });
        logger.warn('Start command rate limited', { telegramId });
        await this.sendMessage(telegramId, 'Слишком много попыток. Подождите минуту.');
        return;
      }

      telegramMessagesTotal.inc({ type: 'start', status: 'received' });

      const existingUser = await this.getTelegramUser(telegramId);
      
      if (existingUser) {
        await this.sendMessage(telegramId, 'Добро пожаловать! Чем могу помочь?');
        telegramMessagesTotal.inc({ type: 'start', status: 'existing_user' });
        return;
      }

      if (!inviteToken) {
        await this.sendMessage(telegramId,
          'Добро пожаловать в servAI! Для регистрации нужна ссылка-приглашение.\n\n' +
          'Попросите администратора вашего дома выслать вам ссылку.');
        telegramMessagesTotal.inc({ type: 'start', status: 'no_invite' });
        return;
      }

      await this.handleInviteRegistration(msg, inviteToken);
      telegramMessagesTotal.inc({ type: 'start', status: 'registered' });
    } catch (error) {
      logger.error('Error handling /start', { error });
      telegramMessagesTotal.inc({ type: 'start', status: 'error' });
      if (msg.from?.id) {
        await this.sendMessage(msg.from.id, 'Извините, произошла ошибка. Попробуйте позже.');
      }
    }
  }

  private validateInviteToken(token: string): string | null {
    // Sanitize first
    const sanitized = token.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 64);
    
    // Check if empty after sanitization
    if (!sanitized || sanitized.length < 8) {
      return null;
    }
    
    // Validate UUID v4 format (optional but recommended)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sanitized)) {
      // If not UUID, check if it's alphanumeric with proper length
      if (sanitized.length < 16 || sanitized.length > 64) {
        return null;
      }
    }
    
    return sanitized;
  }

  private validateLanguageCode(code: string | undefined): string {
    if (!code) return 'ru';
    
    const normalized = code.toLowerCase().substring(0, 2);
    
    if (ALLOWED_LANGUAGE_CODES.includes(normalized)) {
      return normalized;
    }
    
    return 'ru'; // Default fallback
  }

  private async handleInviteRegistration(msg: TelegramBot.Message, inviteToken: string): Promise<void> {
    const telegramId = msg.from!.id;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      // Validate and sanitize invite token
      const validatedToken = this.validateInviteToken(inviteToken);
      
      if (!validatedToken) {
        await client.query('ROLLBACK');
        
        telegramSecurityEvents.inc({ 
          event_type: 'invalid_invite_format', 
          severity: 'medium' 
        });
        
        logger.warn('Invalid invite token format', {
          telegramId,
          tokenLength: inviteToken.length
        });
        
        await this.sendMessage(telegramId,
          'Неверный формат ссылки-приглашения. Обратитесь к администратору.');
        return;
      }
      
      const inviteResult = await client.query(
        `SELECT i.*, u.id as unit_id, u.number as unit_number,
                c.name as condo_name, b.name as building_name
         FROM invites i
         JOIN units u ON i.unit_id = u.id
         JOIN buildings b ON u.building_id = b.id
         JOIN condos c ON b.condo_id = c.id
         WHERE i.token = $1 AND i.status = 'pending'
           AND i.expires_at > NOW() AND i.deleted_at IS NULL
         FOR UPDATE`,
        [validatedToken]
      );

      if (inviteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        
        telegramSecurityEvents.inc({ 
          event_type: 'invalid_invite', 
          severity: 'medium' 
        });
        
        logger.warn('Invalid or expired invite token', {
          telegramId,
          token: validatedToken.substring(0, 8) + '...'
        });
        
        await this.sendMessage(telegramId,
          'Неверная или устаревшая ссылка-приглашение. Обратитесь к администратору.');
        return;
      }

      const invite = inviteResult.rows[0];
      let userId = invite.user_id;

      // Sanitize user input
      const firstName = sanitizeTelegramName(msg.from!.first_name, 'Пользователь');
      const lastName = sanitizeTelegramName(msg.from!.last_name, '');
      const username = sanitizeTelegramUsername(msg.from!.username);
      const hashedId = hashTelegramId(telegramId);
      const languageCode = this.validateLanguageCode(msg.from!.language_code);

      if (!userId) {
        const userResult = await client.query(
          `INSERT INTO users (email, email_verified, first_name, last_name)
           VALUES ($1, false, $2, $3) RETURNING id`,
          [`tg_${hashedId}@servai.internal`, firstName, lastName]
        );
        userId = userResult.rows[0].id;
        
        await client.query(
          `UPDATE invites SET user_id = $1, accepted_at = NOW(), status = 'accepted' 
           WHERE id = $2`,
          [userId, invite.id]
        );
      }

      // Check if telegram_id already registered WITH LOCK to prevent race condition
      const existingTgUser = await client.query(
        `SELECT id FROM telegram_users 
         WHERE telegram_id = $1 AND deleted_at IS NULL 
         FOR UPDATE`,
        [telegramId]
      );
      
      if (existingTgUser.rows.length > 0) {
        await client.query('ROLLBACK');
        
        telegramSecurityEvents.inc({ 
          event_type: 'duplicate_telegram_id', 
          severity: 'high' 
        });
        
        logger.warn('Telegram ID already registered', { telegramId, userId });
        await this.sendMessage(telegramId, 'Этот Telegram аккаунт уже зарегистрирован.');
        return;
      }

      const tgUserResult = await client.query(
        `INSERT INTO telegram_users (user_id, telegram_id, telegram_username, 
                                      first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, telegramId, username, firstName, lastName, languageCode]
      );

      await client.query(
        `INSERT INTO user_context (telegram_user_id, current_unit_id) 
         VALUES ($1, $2)`,
        [tgUserResult.rows[0].id, invite.unit_id]
      );
      
      await client.query(
        `INSERT INTO residents (user_id, unit_id, role) VALUES ($1, $2, $3)`,
        [userId, invite.unit_id, invite.role]
      );
      
      await client.query('COMMIT');

      const address = `${invite.condo_name}, ${invite.building_name}, Квартира ${invite.unit_number}`;
      await this.sendMessage(telegramId,
        `Добро пожаловать в servAI! 🏠\n\nВаш адрес: ${address}\n\nЧем могу помочь?`);
      
      telegramActiveUsers.inc();
      
      logger.info('New user registered via Telegram', {
        userId,
        telegramId,
        unitId: invite.unit_id
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in invite registration', { error, telegramId });
      telegramSecurityEvents.inc({ 
        event_type: 'registration_error', 
        severity: 'high' 
      });
      await this.sendMessage(telegramId, 'Извините, регистрация не удалась.');
      throw error;
    } finally {
      client.release();
    }
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.text || !msg.from) return;
    
    try {
      const telegramId = msg.from.id;
      
      if (!isValidTelegramId(telegramId)) {
        logger.warn('Invalid telegram ID in message', { telegramId });
        return;
      }
      
      // Validate and sanitize message
      const sanitizedText = sanitizeMessageText(msg.text, MAX_MESSAGE_LENGTH);
      
      if (!sanitizedText) {
        await this.sendMessage(telegramId, 'Сообщение содержит недопустимые символы.');
        return;
      }
      
      if (sanitizedText.length > MAX_MESSAGE_LENGTH) {
        await this.sendMessage(telegramId, 
          `Сообщение слишком длинное. Максимум ${MAX_MESSAGE_LENGTH} символов.`);
        return;
      }
      
      telegramMessagesTotal.inc({ type: 'text', status: 'received' });
      
      const telegramUser = await this.getTelegramUser(telegramId);
      if (!telegramUser) {
        await this.sendMessage(telegramId, 'Пожалуйста, начните с команды /start.');
        return;
      }
      
      await this.saveMessage(telegramUser.id, msg.message_id, 'user', sanitizedText);
      await this.bot?.sendChatAction(telegramId, 'typing');
      
      const timer = telegramIntentDuration.startTimer();
      const intentResult = await this.processWithAI(telegramUser, sanitizedText);
      timer();
      
      await this.sendMessage(telegramId, intentResult.response);
      await this.saveMessage(
        telegramUser.id, 
        0, 
        'assistant', 
        intentResult.response, 
        intentResult.intent, 
        intentResult.confidence
      );
      
      if (intentResult.summary_update) {
        await this.updateContext(telegramUser.id, intentResult.summary_update);
      }
      
      if (intentResult.intent && intentResult.confidence > INTENT_CONFIDENCE_THRESHOLD) {
        await this.executeIntent(telegramUser, intentResult);
      }
      
      telegramMessagesTotal.inc({ type: 'text', status: 'success' });
    } catch (error) {
      logger.error('Error handling message', { error, telegramId: msg.from?.id });
      telegramMessagesTotal.inc({ type: 'text', status: 'error' });
      if (msg.from?.id) {
        await this.sendMessage(msg.from.id, 'Извините, не смог обработать сообщение.');
      }
    }
  }

  private async handlePhoto(msg: TelegramBot.Message): Promise<void> {
    if (!msg.photo || !msg.from) return;
    
    let tempFilePath: string | null = null;
    let fileCreated = false;
    
    try {
      const telegramId = msg.from.id;
      
      if (!isValidTelegramId(telegramId)) {
        logger.warn('Invalid telegram ID in photo', { telegramId });
        return;
      }
      
      telegramMessagesTotal.inc({ type: 'photo', status: 'received' });
      
      const telegramUser = await this.getTelegramUser(telegramId);
      if (!telegramUser) {
        await this.sendMessage(telegramId, 'Пожалуйста, начните с /start.');
        return;
      }
      
      const photo = msg.photo[msg.photo.length - 1];
      
      // Validate file size
      if (photo.file_size && photo.file_size > MAX_FILE_SIZE_BYTES) {
        await this.sendMessage(telegramId, 
          `Файл слишком большой. Максимум ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }

      await this.sendMessage(telegramId, 'Обрабатываю фото...');
      
      const fileLink = await this.bot?.getFileLink(photo.file_id);
      if (!fileLink) {
        await this.sendMessage(telegramId, 'Не удалось получить файл.');
        return;
      }

      // Generate temp file path
      tempFilePath = path.join(
        TEMP_DIR,
        `tg_${telegramId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.jpg`
      );
      
      // Download and validate image
      const imageBase64 = await this.downloadAndValidateImage(fileLink, tempFilePath);
      fileCreated = true;
      
      const ocrResult = await openaiService.recognizeMeterReading(imageBase64);
      
      if (ocrResult.success && ocrResult.value) {
        await this.sendMessage(telegramId, 
          `Распознал: ${ocrResult.meter_type || 'счётчик'} = ${ocrResult.value}`);
        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_success' });
      } else {
        await this.sendMessage(telegramId, 
          'Не смог прочитать показания с фото. Попробуйте сфотографировать чётче.');
        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_failed' });
      }
    } catch (error) {
      logger.error('Error handling photo', { error, telegramId: msg.from?.id });
      telegramMessagesTotal.inc({ type: 'photo', status: 'error' });
      if (msg.from?.id) {
        await this.sendMessage(msg.from.id, 'Ошибка обработки фото.');
      }
    } finally {
      // ALWAYS cleanup temp file if it was created
      if (tempFilePath && fileCreated) {
        try {
          await fs.promises.unlink(tempFilePath);
          logger.debug('Temp file cleaned up', { tempFilePath });
        } catch (err) {
          logger.warn('Failed to delete temp file', { tempFilePath, error: err });
        }
      }
    }
  }

  private async downloadAndValidateImage(url: string, tempFilePath: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'stream',
        timeout: 10000,
        maxContentLength: MAX_FILE_SIZE_BYTES,
        validateStatus: (status) => status === 200
      });

      // Validate Content-Type
      const contentType = response.headers['content-type'];
      if (!contentType || !ALLOWED_IMAGE_TYPES.includes(contentType)) {
        telegramSecurityEvents.inc({ 
          event_type: 'invalid_content_type', 
          severity: 'high' 
        });
        logger.warn('Invalid content type in image download', { contentType, url });
        throw new Error('Invalid image type');
      }

      // Download to temp file
      await pipeline(
        response.data,
        fs.createWriteStream(tempFilePath)
      );

      // Read and validate file signature
      const buffer = await fs.promises.readFile(tempFilePath);
      
      // Validate JPEG signature (FF D8 FF)
      // Validate PNG signature (89 50 4E 47)
      const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      
      if (!isJPEG && !isPNG) {
        telegramSecurityEvents.inc({ 
          event_type: 'invalid_file_signature', 
          severity: 'critical' 
        });
        logger.error('Invalid file signature detected', {
          url,
          signature: buffer.slice(0, 4).toString('hex')
        });
        
        // Delete invalid file immediately
        await fs.promises.unlink(tempFilePath);
        throw new Error('Invalid image file signature');
      }
      
      return buffer.toString('base64');
      
    } catch (error) {
      logger.error('Error downloading image', { error, url });
      
      // Cleanup on error
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch (cleanupErr) {
        logger.warn('Failed to cleanup file after error', { tempFilePath });
      }
      
      throw new Error('Failed to download or validate image');
    }
  }

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!query.message || !query.from) return;
    try {
      await this.bot?.answerCallbackQuery(query.id);
    } catch (error) {
      logger.error('Error handling callback query', { error });
    }
  }

  private async processWithAI(telegramUser: TelegramUser, message: string): Promise<IntentResult> {
    try {
      const history = await this.getConversationHistory(
        telegramUser.id, 
        CONVERSATION_HISTORY_LIMIT,
        CONVERSATION_HISTORY_MAX_AGE_HOURS
      );
      const context = await this.getContext(telegramUser.id);
      const systemPrompt = await this.getSystemPrompt(telegramUser.language_code);
      const intents = await this.getIntents();
      
      return await openaiService.processMessage(
        message, 
        history, 
        context.conversation_summary || '', 
        systemPrompt, 
        intents, 
        telegramUser.language_code
      );
    } catch (error) {
      logger.error('Error processing with AI', { error });
      return { 
        intent: 'unknown', 
        confidence: 0, 
        parameters: {}, 
        response: 'Извините, не понял.' 
      };
    }
  }

  private async executeIntent(telegramUser: TelegramUser, intentResult: IntentResult): Promise<void> {
    logger.info('Executing intent', { intent: intentResult.intent });
  }

  private async getTelegramUser(telegramId: number): Promise<TelegramUser | null> {
    const result = await pool.query(
      `SELECT id, user_id, telegram_id, language_code 
       FROM telegram_users 
       WHERE telegram_id = $1 AND deleted_at IS NULL`,
      [telegramId]
    );
    
    if (result.rows.length === 0) return null;
    
    await pool.query(
      'UPDATE telegram_users SET last_interaction_at = NOW() WHERE id = $1',
      [result.rows[0].id]
    );
    
    return result.rows[0];
  }

  private async saveMessage(
    telegramUserId: string, 
    telegramMessageId: number, 
    role: 'user' | 'assistant', 
    content: string, 
    intent?: string, 
    confidence?: number
  ): Promise<void> {
    await pool.query(
      `INSERT INTO conversations 
       (telegram_user_id, telegram_message_id, role, content, intent, intent_confidence) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [telegramUserId, telegramMessageId, role, content, intent, confidence]
    );
  }

  private async getConversationHistory(
    telegramUserId: string, 
    limit: number,
    maxAgeHours: number = 24
  ): Promise<ConversationMessage[]> {
    // FIX #27: Use parameterized query for maxAgeHours to prevent SQL injection
    const result = await pool.query(
      `SELECT role, content 
       FROM conversations 
       WHERE telegram_user_id = $1 
         AND created_at > NOW() - INTERVAL '1 hour' * $3
       ORDER BY created_at DESC 
       LIMIT $2`,
      [telegramUserId, limit, maxAgeHours]
    );
    return result.rows.reverse();
  }

  private async getContext(telegramUserId: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM user_context WHERE telegram_user_id = $1',
      [telegramUserId]
    );
    return result.rows[0] || {};
  }

  private async updateContext(telegramUserId: string, summaryUpdate: string): Promise<void> {
    await pool.query(
      `UPDATE user_context 
       SET conversation_summary = COALESCE(conversation_summary || ' ', '') || $1, 
           last_updated_at = NOW() 
       WHERE telegram_user_id = $2`,
      [summaryUpdate, telegramUserId]
    );
  }

  private async getSystemPrompt(languageCode: string): Promise<string> {
    const result = await pool.query(
      `SELECT content 
       FROM system_prompts 
       WHERE is_active = true AND language_code = $1 
       ORDER BY version DESC 
       LIMIT 1`,
      [languageCode]
    );
    return result.rows[0]?.content || '';
  }

  private async getIntents(): Promise<any[]> {
    const result = await pool.query(
      `SELECT code, name, description, examples, parameters 
       FROM intents 
       WHERE is_active = true AND deleted_at IS NULL 
       ORDER BY priority DESC, code`
    );
    return result.rows;
  }

  async sendMessage(telegramId: number, text: string, options?: any, priority: number = 0): Promise<void> {
    // Graceful degradation if Redis is down
    if (!this.messageQueue || !this.redisHealthy) {
      logger.warn('Message queue not available, using direct send', { 
        redisHealthy: this.redisHealthy 
      });
      return this.sendMessageDirect(telegramId, text, options);
    }

    try {
      await this.messageQueue.add('send-message', {
        telegramId,
        text,
        options,
        priority
      }, {
        priority
      });

      logger.debug('Message queued', { telegramId, textLength: text.length });
      telegramMessagesTotal.inc({ type: 'outgoing', status: 'queued' });
    } catch (error) {
      logger.error('Failed to queue message, falling back to direct send', { error });
      await this.sendMessageDirect(telegramId, text, options);
    }
  }

  private async sendMessageDirect(telegramId: number, text: string, options?: any): Promise<void> {
    if (!this.bot) return;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.bot.sendMessage(telegramId, text, options);
        telegramMessagesTotal.inc({ type: 'outgoing', status: 'sent_direct' });
        return;
      } catch (error: any) {
        if (error.response?.statusCode === 429) {
          const retryAfter = error.response?.parameters?.retry_after || 1;
          await this.sleep(retryAfter * 1000);
          continue;
        }
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  async sendMessageWithRetry(telegramId: number, text: string, options?: any): Promise<void> {
    await this.sendMessage(telegramId, text, options);
  }

  async getWebhookInfo(): Promise<any> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    return await this.bot.getWebHookInfo();
  }

  /**
   * Verify webhook secret token
   * CRITICAL: Must be called for every webhook request
   */
  verifyWebhookSecret(providedSecret: string): boolean {
    if (!this.webhookSecret) {
      logger.error('Webhook secret not configured but verification attempted');
      return false;
    }
    
    // Constant-time comparison to prevent timing attacks
    if (providedSecret.length !== this.webhookSecret.length) {
      return false;
    }
    
    let mismatch = 0;
    for (let i = 0; i < this.webhookSecret.length; i++) {
      mismatch |= this.webhookSecret.charCodeAt(i) ^ providedSecret.charCodeAt(i);
    }
    
    const isValid = mismatch === 0;
    
    if (!isValid) {
      telegramSecurityEvents.inc({ 
        event_type: 'webhook_secret_mismatch', 
        severity: 'critical' 
      });
      logger.error('Webhook secret verification failed');
    }
    
    return isValid;
  }

  private async cleanupOldTempFiles(): Promise<void> {
    try {
      const files = await fs.promises.readdir(TEMP_DIR);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      let cleaned = 0;
      
      for (const file of files) {
        const filePath = path.join(TEMP_DIR, file);
        try {
          const stats = await fs.promises.stat(filePath);
          if (now - stats.mtimeMs > maxAge) {
            await fs.promises.unlink(filePath);
            cleaned++;
          }
        } catch (err) {
          logger.debug('Could not clean temp file', { file, error: err });
        }
      }
      
      if (cleaned > 0) {
        logger.info('Cleaned up old temp files', { count: cleaned });
      }
    } catch (error) {
      logger.error('Error cleaning up temp files', { error });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processWebhookUpdate(update: any, providedSecret?: string): Promise<void> {
    if (!this.bot) return;
    
    // CRITICAL: Verify webhook secret if in webhook mode
    if (this.webhookSecret && providedSecret) {
      if (!this.verifyWebhookSecret(providedSecret)) {
        throw new Error('Webhook secret verification failed');
      }
    }
    
    try {
      await this.bot.processUpdate(update);
    } catch (error) {
      logger.error('Error processing webhook update', { error });
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Telegram service...');
    
    // Stop periodic cleanup
    if (this.tempCleanupInterval) {
      clearInterval(this.tempCleanupInterval);
      logger.info('Temp cleanup interval stopped');
    }
    
    if (this.messageWorker) {
      await this.messageWorker.close();
      logger.info('Telegram message worker closed');
    }
    
    if (this.messageQueue) {
      await this.messageQueue.close();
      logger.info('Telegram message queue closed');
    }
    
    if (this.redisConnection) {
      await this.redisConnection.quit();
      logger.info('Redis connection closed');
    }
    
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = null;
      logger.info('Bot polling stopped');
    }
    
    // Cleanup temp files on shutdown
    await this.cleanupOldTempFiles();
    
    // Clear rate limiter
    this.startCommandRateLimiter.clear();
  }
}

export const telegramService = new TelegramService();