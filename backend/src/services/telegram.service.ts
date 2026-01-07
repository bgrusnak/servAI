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
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

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

// Configuration
const CONVERSATION_HISTORY_LIMIT = parseInt(process.env.CONVERSATION_HISTORY_LIMIT || '20');
const INTENT_CONFIDENCE_THRESHOLD = parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD || '0.7');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TELEGRAM_RATE_LIMIT_PER_SECOND = parseInt(process.env.TELEGRAM_RATE_LIMIT_PER_SECOND || '25');
const MESSAGE_INTERVAL_MS = 1000 / TELEGRAM_RATE_LIMIT_PER_SECOND;
const MAX_FILE_SIZE_MB = 5;
const TEMP_DIR = process.env.TEMP_DIR || '/tmp';

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
  private messageQueue: Queue<QueuedMessage> | null = null;
  private messageWorker: Worker<QueuedMessage> | null = null;
  private redisConnection: IORedis | null = null;
  private lastMessageTime = 0;

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
      this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || '';
      if (!this.webhookUrl) {
        throw new Error('TELEGRAM_WEBHOOK_URL required for webhook mode');
      }

      this.bot = new TelegramBot(token, { webHook: true });
      await this.bot.setWebHook(`${this.webhookUrl}/api/v1/telegram/webhook`);
      logger.info('Telegram bot initialized in webhook mode', { url: this.webhookUrl });
    } else {
      this.bot = new TelegramBot(token, { polling: true });
      logger.info('Telegram bot initialized in polling mode');
    }

    this.setupHandlers();
    await this.initializeMessageQueue();
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
      });

      this.redisConnection.on('error', (err) => {
        logger.error('Redis connection error', { error: err });
      });

      this.redisConnection.on('ready', () => {
        logger.info('Redis connection ready for message queue');
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
          removeOnFail: 500
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
        intervalMs: MESSAGE_INTERVAL_MS
      });
    } catch (error) {
      logger.error('Failed to initialize message queue', error);
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

  private async handleStart(msg: TelegramBot.Message, inviteToken?: string): Promise<void> {
    try {
      const telegramId = msg.from?.id;
      if (!telegramId) return;

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
      logger.error('Error handling /start:', error);
      telegramMessagesTotal.inc({ type: 'start', status: 'error' });
      await this.sendMessage(msg.from!.id, 'Извините, произошла ошибка. Попробуйте позже.');
    }
  }

  private async handleInviteRegistration(msg: TelegramBot.Message, inviteToken: string): Promise<void> {
    const telegramId = msg.from!.id;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
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
        [inviteToken]
      );

      if (inviteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        await this.sendMessage(telegramId,
          'Неверная или устаревшая ссылка-приглашение. Обратитесь к администратору.');
        return;
      }

      const invite = inviteResult.rows[0];
      let userId = invite.user_id;

      if (!userId) {
        const userResult = await client.query(
          `INSERT INTO users (email, email_verified, first_name, last_name)
           VALUES ($1, false, $2, $3) RETURNING id`,
          [`telegram_${telegramId}@servai.temp`, msg.from!.first_name || 'Пользователь', msg.from!.last_name || '']
        );
        userId = userResult.rows[0].id;
        await client.query(
          `UPDATE invites SET user_id = $1, accepted_at = NOW(), status = 'accepted' WHERE id = $2`,
          [userId, invite.id]
        );
      }

      const tgUserResult = await client.query(
        `INSERT INTO telegram_users (user_id, telegram_id, telegram_username, first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, telegramId, msg.from!.username || null, msg.from!.first_name || null, msg.from!.last_name || null, msg.from!.language_code || 'ru']
      );

      await client.query(`INSERT INTO user_context (telegram_user_id, current_unit_id) VALUES ($1, $2)`, [tgUserResult.rows[0].id, invite.unit_id]);
      await client.query(`INSERT INTO residents (user_id, unit_id, role) VALUES ($1, $2, $3)`, [userId, invite.unit_id, invite.role]);
      await client.query('COMMIT');

      const address = `${invite.condo_name}, ${invite.building_name}, Квартира ${invite.unit_number}`;
      await this.sendMessage(telegramId,
        `Добро пожаловать в servAI! 🏠\n\nВаш адрес: ${address}\n\nЧем могу помочь?`);
      telegramActiveUsers.inc();
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in invite registration:', error);
      await this.sendMessage(telegramId, 'Извините, регистрация не удалась.');
      throw error;
    } finally {
      client.release();
    }
  }

  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.text || !msg.from) return;
    try {
      telegramMessagesTotal.inc({ type: 'text', status: 'received' });
      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessage(msg.from.id, 'Пожалуйста, начните с команды /start.');
        return;
      }
      await this.saveMessage(telegramUser.id, msg.message_id, 'user', msg.text);
      await this.bot?.sendChatAction(msg.from.id, 'typing');
      const timer = telegramIntentDuration.startTimer();
      const intentResult = await this.processWithAI(telegramUser, msg.text);
      timer();
      await this.sendMessage(msg.from.id, intentResult.response);
      await this.saveMessage(telegramUser.id, 0, 'assistant', intentResult.response, intentResult.intent, intentResult.confidence);
      if (intentResult.summary_update) {
        await this.updateContext(telegramUser.id, intentResult.summary_update);
      }
      if (intentResult.intent && intentResult.confidence > INTENT_CONFIDENCE_THRESHOLD) {
        await this.executeIntent(telegramUser, intentResult);
      }
      telegramMessagesTotal.inc({ type: 'text', status: 'success' });
    } catch (error) {
      logger.error('Error handling message:', error);
      telegramMessagesTotal.inc({ type: 'text', status: 'error' });
      await this.sendMessage(msg.from.id, 'Извините, не смог обработать сообщение.');
    }
  }

  private async handlePhoto(msg: TelegramBot.Message): Promise<void> {
    if (!msg.photo || !msg.from) return;
    try {
      telegramMessagesTotal.inc({ type: 'photo', status: 'received' });
      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessage(msg.from.id, 'Пожалуйста, начните с /start.');
        return;
      }
      
      const photo = msg.photo[msg.photo.length - 1];
      
      if (photo.file_size && photo.file_size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        await this.sendMessage(msg.from.id, `Файл слишком большой. Максимум ${MAX_FILE_SIZE_MB}MB.`);
        return;
      }

      await this.sendMessage(msg.from.id, 'Обрабатываю фото...');
      
      const fileLink = await this.bot?.getFileLink(photo.file_id);
      if (!fileLink) {
        await this.sendMessage(msg.from.id, 'Не удалось получить файл.');
        return;
      }

      const imageBase64 = await this.downloadAndConvertToBase64(fileLink);
      const ocrResult = await openaiService.recognizeMeterReading(imageBase64);
      
      if (ocrResult.success && ocrResult.value) {
        await this.sendMessage(msg.from.id, `Распознал: ${ocrResult.meter_type || 'счётчик'} = ${ocrResult.value}`);
        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_success' });
      } else {
        await this.sendMessage(msg.from.id, 'Не смог прочитать показания с фото. Попробуйте сфотографировать чётче.');
        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_failed' });
      }
    } catch (error) {
      logger.error('Error handling photo:', error);
      telegramMessagesTotal.inc({ type: 'photo', status: 'error' });
      await this.sendMessage(msg.from.id, 'Ошибка обработки фото.');
    }
  }

  private async downloadAndConvertToBase64(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000
      });

      const buffer = Buffer.from(response.data);
      return buffer.toString('base64');
    } catch (error) {
      logger.error('Error downloading image', { error, url });
      throw new Error('Failed to download image');
    }
  }

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!query.message || !query.from) return;
    try {
      await this.bot?.answerCallbackQuery(query.id);
    } catch (error) {
      logger.error('Error handling callback query:', error);
    }
  }

  private async processWithAI(telegramUser: TelegramUser, message: string): Promise<IntentResult> {
    try {
      const history = await this.getConversationHistory(telegramUser.id, CONVERSATION_HISTORY_LIMIT);
      const context = await this.getContext(telegramUser.id);
      const systemPrompt = await this.getSystemPrompt(telegramUser.language_code);
      const intents = await this.getIntents();
      return await openaiService.processMessage(message, history, context.conversation_summary || '', systemPrompt, intents, telegramUser.language_code);
    } catch (error) {
      logger.error('Error processing with AI:', error);
      return { intent: 'unknown', confidence: 0, parameters: {}, response: 'Извините, не понял.' };
    }
  }

  private async executeIntent(telegramUser: TelegramUser, intentResult: IntentResult): Promise<void> {
    logger.info('Executing intent', { intent: intentResult.intent });
  }

  private async getTelegramUser(telegramId: number): Promise<TelegramUser | null> {
    const result = await pool.query(
      `SELECT id, user_id, telegram_id, language_code FROM telegram_users WHERE telegram_id = $1 AND deleted_at IS NULL`,
      [telegramId]
    );
    if (result.rows.length === 0) return null;
    await pool.query('UPDATE telegram_users SET last_interaction_at = NOW() WHERE id = $1', [result.rows[0].id]);
    return result.rows[0];
  }

  private async saveMessage(telegramUserId: string, telegramMessageId: number, role: 'user' | 'assistant', content: string, intent?: string, confidence?: number): Promise<void> {
    await pool.query(
      `INSERT INTO conversations (telegram_user_id, telegram_message_id, role, content, intent, intent_confidence) VALUES ($1, $2, $3, $4, $5, $6)`,
      [telegramUserId, telegramMessageId, role, content, intent, confidence]
    );
  }

  private async getConversationHistory(telegramUserId: string, limit: number): Promise<ConversationMessage[]> {
    const result = await pool.query(
      `SELECT role, content FROM conversations WHERE telegram_user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [telegramUserId, limit]
    );
    return result.rows.reverse();
  }

  private async getContext(telegramUserId: string): Promise<any> {
    const result = await pool.query('SELECT * FROM user_context WHERE telegram_user_id = $1', [telegramUserId]);
    return result.rows[0] || {};
  }

  private async updateContext(telegramUserId: string, summaryUpdate: string): Promise<void> {
    await pool.query(
      `UPDATE user_context SET conversation_summary = COALESCE(conversation_summary || ' ', '') || $1, last_updated_at = NOW() WHERE telegram_user_id = $2`,
      [summaryUpdate, telegramUserId]
    );
  }

  private async getSystemPrompt(languageCode: string): Promise<string> {
    const result = await pool.query(
      `SELECT content FROM system_prompts WHERE is_active = true AND language_code = $1 ORDER BY version DESC LIMIT 1`,
      [languageCode]
    );
    return result.rows[0]?.content || '';
  }

  private async getIntents(): Promise<any[]> {
    const result = await pool.query(
      `SELECT code, name, description, examples, parameters FROM intents WHERE is_active = true AND deleted_at IS NULL ORDER BY priority DESC, code`
    );
    return result.rows;
  }

  async sendMessage(telegramId: number, text: string, options?: any, priority: number = 0): Promise<void> {
    if (!this.messageQueue) {
      logger.warn('Message queue not initialized, using fallback');
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
      logger.error('Failed to queue message', error);
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async processWebhookUpdate(update: any): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.processUpdate(update);
    } catch (error) {
      logger.error('Error processing webhook update:', error);
    }
  }

  async shutdown(): Promise<void> {
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
    }
  }
}

export const telegramService = new TelegramService();
