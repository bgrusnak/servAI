import TelegramBot from 'node-telegram-bot-api';
import { Pool, PoolClient } from 'pg';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { perplexityService } from './perplexity.service';
import { Counter, Histogram } from 'prom-client';

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

// Configuration
const CONVERSATION_HISTORY_LIMIT = parseInt(process.env.CONVERSATION_HISTORY_LIMIT || '20');
const INTENT_CONFIDENCE_THRESHOLD = parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD || '0.7');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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

class TelegramService {
  private bot: TelegramBot | null = null;
  private webhookUrl: string = '';

  /**
   * Initialize Telegram bot
   */
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
      // Webhook mode (for production)
      this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || '';
      if (!this.webhookUrl) {
        throw new Error('TELEGRAM_WEBHOOK_URL required for webhook mode');
      }

      this.bot = new TelegramBot(token, { webHook: true });
      await this.bot.setWebHook(`${this.webhookUrl}/api/v1/telegram/webhook`);
      logger.info('Telegram bot initialized in webhook mode', { url: this.webhookUrl });
    } else {
      // Polling mode (for development)
      this.bot = new TelegramBot(token, { polling: true });
      logger.info('Telegram bot initialized in polling mode');
    }

    this.setupHandlers();
  }

  /**
   * Setup message handlers
   */
  private setupHandlers(): void {
    if (!this.bot) return;

    // Handle /start command
    this.bot.onText(/\/start(.*)/, async (msg, match) => {
      await this.handleStart(msg, match?.[1]?.trim());
    });

    // Handle text messages
    this.bot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return; // Skip commands
      await this.handleMessage(msg);
    });

    // Handle photos
    this.bot.on('photo', async (msg) => {
      await this.handlePhoto(msg);
    });

    // Handle callback queries (buttons)
    this.bot.on('callback_query', async (query) => {
      await this.handleCallbackQuery(query);
    });

    logger.info('Telegram bot handlers setup complete');
  }

  /**
   * Handle /start command
   */
  private async handleStart(msg: TelegramBot.Message, inviteToken?: string): Promise<void> {
    try {
      const telegramId = msg.from?.id;
      if (!telegramId) return;

      telegramMessagesTotal.inc({ type: 'start', status: 'received' });

      // Check if user already exists
      const existingUser = await this.getTelegramUser(telegramId);
      
      if (existingUser) {
        await this.sendMessageWithRetry(telegramId, 
          'Добро пожаловать! Чем могу помочь?');
        telegramMessagesTotal.inc({ type: 'start', status: 'existing_user' });
        return;
      }

      // New user - require invite token
      if (!inviteToken) {
        await this.sendMessageWithRetry(telegramId,
          'Добро пожаловать в servAI! Для регистрации нужна ссылка-приглашение.\n\n' +
          'Попросите администратора вашего дома выслать вам ссылку.');
        telegramMessagesTotal.inc({ type: 'start', status: 'no_invite' });
        return;
      }

      // Validate invite and create user
      await this.handleInviteRegistration(msg, inviteToken);
      telegramMessagesTotal.inc({ type: 'start', status: 'registered' });
    } catch (error) {
      logger.error('Error handling /start:', error);
      telegramMessagesTotal.inc({ type: 'start', status: 'error' });
      await this.sendMessageWithRetry(msg.from!.id, 
        'Извините, произошла ошибка. Попробуйте позже.');
    }
  }

  /**
   * Handle invite registration with transaction
   */
  private async handleInviteRegistration(
    msg: TelegramBot.Message, 
    inviteToken: string
  ): Promise<void> {
    const telegramId = msg.from!.id;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Lock and validate invite
      const inviteResult = await client.query(
        `SELECT i.*, u.id as unit_id, u.number as unit_number,
                c.name as condo_name, b.name as building_name
         FROM invites i
         JOIN units u ON i.unit_id = u.id
         JOIN buildings b ON u.building_id = b.id
         JOIN condos c ON b.condo_id = c.id
         WHERE i.token = $1 
           AND i.status = 'pending'
           AND i.expires_at > NOW()
           AND i.deleted_at IS NULL
         FOR UPDATE`,
        [inviteToken]
      );

      if (inviteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        await this.sendMessageWithRetry(telegramId,
          'Неверная или устаревшая ссылка-приглашение. Обратитесь к администратору.');
        return;
      }

      const invite = inviteResult.rows[0];

      // Check if invite already has a user (for multi-use invites)
      let userId = invite.user_id;

      if (!userId) {
        // Create new user
        const userResult = await client.query(
          `INSERT INTO users (email, email_verified, first_name, last_name)
           VALUES ($1, false, $2, $3)
           RETURNING id`,
          [
            `telegram_${telegramId}@servai.temp`,
            msg.from!.first_name || 'Пользователь',
            msg.from!.last_name || ''
          ]
        );
        userId = userResult.rows[0].id;

        // Update invite
        await client.query(
          `UPDATE invites SET user_id = $1, accepted_at = NOW(), status = 'accepted'
           WHERE id = $2`,
          [userId, invite.id]
        );
      }

      // Check if telegram user already exists (shouldn't happen, but defensive)
      const existingTgUser = await client.query(
        'SELECT id FROM telegram_users WHERE telegram_id = $1 AND deleted_at IS NULL',
        [telegramId]
      );

      if (existingTgUser.rows.length > 0) {
        await client.query('ROLLBACK');
        await this.sendMessageWithRetry(telegramId,
          'Вы уже зарегистрированы!');
        return;
      }

      // Create telegram_user
      const tgUserResult = await client.query(
        `INSERT INTO telegram_users (user_id, telegram_id, telegram_username, first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          userId,
          telegramId,
          msg.from!.username || null,
          msg.from!.first_name || null,
          msg.from!.last_name || null,
          msg.from!.language_code || 'ru'
        ]
      );

      const tgUserId = tgUserResult.rows[0].id;

      // Create user context
      await client.query(
        `INSERT INTO user_context (telegram_user_id, current_unit_id)
         VALUES ($1, $2)`,
        [tgUserId, invite.unit_id]
      );

      // Create resident link
      await client.query(
        `INSERT INTO residents (user_id, unit_id, role)
         VALUES ($1, $2, $3)`,
        [userId, invite.unit_id, invite.role]
      );

      await client.query('COMMIT');

      // Send welcome message
      const address = `${invite.condo_name}, ${invite.building_name}, Квартира ${invite.unit_number}`;
      await this.sendMessageWithRetry(telegramId,
        `Добро пожаловать в servAI! 🏠\n\n` +
        `Ваш адрес: ${address}\n\n` +
        `Я помогу вам:\n` +
        `• Передать показания счётчиков\n` +
        `• Сообщить о проблемах\n` +
        `• Посмотреть счета\n` +
        `• Участвовать в голосованиях\n` +
        `• Управлять доступом автомобилей\n\n` +
        `Чем могу помочь?`);

      telegramActiveUsers.inc();
      logger.info('User registered via Telegram', { telegramId, userId, unitId: invite.unit_id });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in invite registration:', error);
      await this.sendMessageWithRetry(telegramId,
        'Извините, регистрация не удалась. Обратитесь в поддержку.');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle regular text message
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.text || !msg.from) return;

    try {
      telegramMessagesTotal.inc({ type: 'text', status: 'received' });

      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessageWithRetry(msg.from.id,
          'Пожалуйста, начните с команды /start и ссылки-приглашения.');
        return;
      }

      // Save user message to conversation
      await this.saveMessage(telegramUser.id, msg.message_id, 'user', msg.text);

      // Send typing indicator
      await this.bot?.sendChatAction(msg.from.id, 'typing');

      // Process with AI
      const timer = telegramIntentDuration.startTimer();
      const intentResult = await this.processWithAI(telegramUser, msg.text);
      timer();

      // Send AI response
      await this.sendMessageWithRetry(msg.from.id, intentResult.response);

      // Save assistant message
      await this.saveMessage(
        telegramUser.id,
        0,
        'assistant',
        intentResult.response,
        intentResult.intent,
        intentResult.confidence
      );

      // Update context
      if (intentResult.summary_update) {
        await this.updateContext(telegramUser.id, intentResult.summary_update);
      }

      // Execute intent handler
      if (intentResult.intent && intentResult.confidence > INTENT_CONFIDENCE_THRESHOLD) {
        await this.executeIntent(telegramUser, intentResult);
      }

      telegramMessagesTotal.inc({ type: 'text', status: 'success' });

    } catch (error) {
      logger.error('Error handling message:', error);
      telegramMessagesTotal.inc({ type: 'text', status: 'error' });
      await this.sendMessageWithRetry(msg.from.id,
        'Извините, не смог обработать сообщение. Попробуйте ещё раз.');
    }
  }

  /**
   * Handle photo message
   */
  private async handlePhoto(msg: TelegramBot.Message): Promise<void> {
    if (!msg.photo || !msg.from) return;

    try {
      telegramMessagesTotal.inc({ type: 'photo', status: 'received' });

      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessageWithRetry(msg.from.id, 'Пожалуйста, начните с /start.');
        return;
      }

      // Get largest photo
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await this.bot?.getFileLink(photo.file_id);

      if (!fileLink) {
        await this.sendMessageWithRetry(msg.from.id, 'Не удалось обработать фото.');
        return;
      }

      // Validate photo URL is from Telegram
      if (!fileLink.startsWith('https://api.telegram.org/')) {
        logger.error('Invalid file link (not from Telegram):', fileLink);
        await this.sendMessageWithRetry(msg.from.id, 'Неверный источник фото.');
        return;
      }

      await this.sendMessageWithRetry(msg.from.id, 
        'Обрабатываю фото... Это может занять несколько секунд.');

      // Process photo with Perplexity (OCR for meter reading)
      const ocrResult = await perplexityService.recognizeMeterReading(fileLink);

      if (ocrResult.success && ocrResult.value) {
        await this.sendMessageWithRetry(msg.from.id,
          `Распознал: ${ocrResult.meter_type || 'счётчик'} = ${ocrResult.value}\n\n` +
          `Это верно? Ответьте 'да' для подтверждения или отправьте правильное значение.`);
        
        // Save pending reading in context
        await pool.query(
          `UPDATE user_context 
           SET state = 'awaiting_meter_confirmation',
               state_data = $1
           WHERE telegram_user_id = (SELECT id FROM telegram_users WHERE telegram_id = $2)`,
          [JSON.stringify(ocrResult), msg.from.id]
        );

        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_success' });
      } else {
        await this.sendMessageWithRetry(msg.from.id,
          'К сожалению, не смог прочитать показания с фото. ' +
          'Попробуйте сделать фото более чётким или введите показания вручную.');
        
        telegramMessagesTotal.inc({ type: 'photo', status: 'ocr_failed' });
      }

    } catch (error) {
      logger.error('Error handling photo:', error);
      telegramMessagesTotal.inc({ type: 'photo', status: 'error' });
      await this.sendMessageWithRetry(msg.from.id,
        'Извините, не смог обработать фото.');
    }
  }

  /**
   * Handle callback query (button press)
   */
  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!query.message || !query.from) return;

    try {
      await this.bot?.answerCallbackQuery(query.id);
      
      // Handle callback data
      const data = JSON.parse(query.data || '{}');
      
      // Route to appropriate handler based on action
      // This will be expanded as we add polls, tickets, etc.
      
    } catch (error) {
      logger.error('Error handling callback query:', error);
    }
  }

  /**
   * Process message with AI
   */
  private async processWithAI(
    telegramUser: TelegramUser,
    message: string
  ): Promise<IntentResult> {
    try {
      // Get conversation history
      const history = await this.getConversationHistory(telegramUser.id, CONVERSATION_HISTORY_LIMIT);
      
      // Get current context
      const context = await this.getContext(telegramUser.id);
      
      // Get system prompt
      const systemPrompt = await this.getSystemPrompt(telegramUser.language_code);
      
      // Get intents list
      const intents = await this.getIntents();

      // Call Perplexity
      const result = await perplexityService.processMessage(
        message,
        history,
        context.conversation_summary || '',
        systemPrompt,
        intents,
        telegramUser.language_code
      );

      return result;
    } catch (error) {
      logger.error('Error processing with AI:', error);
      return {
        intent: 'unknown',
        confidence: 0,
        parameters: {},
        response: 'Извините, не понял. Не могли бы вы перефразировать?'
      };
    }
  }

  /**
   * Execute intent handler
   */
  private async executeIntent(
    telegramUser: TelegramUser,
    intentResult: IntentResult
  ): Promise<void> {
    // This will route to appropriate service based on intent.handler
    // Will be implemented as we build each module (meters, tickets, etc.)
    logger.info('Executing intent', { 
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      parameters: intentResult.parameters 
    });
  }

  /**
   * Get or create Telegram user
   */
  private async getTelegramUser(telegramId: number): Promise<TelegramUser | null> {
    const result = await pool.query(
      `SELECT id, user_id, telegram_id, language_code
       FROM telegram_users
       WHERE telegram_id = $1 AND deleted_at IS NULL`,
      [telegramId]
    );

    if (result.rows.length === 0) return null;

    // Update last interaction
    await pool.query(
      'UPDATE telegram_users SET last_interaction_at = NOW() WHERE id = $1',
      [result.rows[0].id]
    );

    return result.rows[0];
  }

  /**
   * Save message to conversation history
   */
  private async saveMessage(
    telegramUserId: string,
    telegramMessageId: number,
    role: 'user' | 'assistant',
    content: string,
    intent?: string,
    confidence?: number
  ): Promise<void> {
    await pool.query(
      `INSERT INTO conversations (telegram_user_id, telegram_message_id, role, content, intent, intent_confidence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [telegramUserId, telegramMessageId, role, content, intent, confidence]
    );
  }

  /**
   * Get conversation history
   */
  private async getConversationHistory(
    telegramUserId: string,
    limit: number
  ): Promise<ConversationMessage[]> {
    const result = await pool.query(
      `SELECT role, content
       FROM conversations
       WHERE telegram_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [telegramUserId, limit]
    );

    return result.rows.reverse();
  }

  /**
   * Get user context
   */
  private async getContext(telegramUserId: string): Promise<any> {
    const result = await pool.query(
      'SELECT * FROM user_context WHERE telegram_user_id = $1',
      [telegramUserId]
    );

    return result.rows[0] || {};
  }

  /**
   * Update context
   */
  private async updateContext(telegramUserId: string, summaryUpdate: string): Promise<void> {
    await pool.query(
      `UPDATE user_context
       SET conversation_summary = COALESCE(conversation_summary || ' ', '') || $1,
           last_updated_at = NOW()
       WHERE telegram_user_id = $2`,
      [summaryUpdate, telegramUserId]
    );
  }

  /**
   * Get system prompt
   */
  private async getSystemPrompt(languageCode: string): Promise<string> {
    const result = await pool.query(
      `SELECT content FROM system_prompts
       WHERE is_active = true AND language_code = $1
       ORDER BY version DESC LIMIT 1`,
      [languageCode]
    );

    if (result.rows.length === 0) {
      // Fallback to English or Russian
      const fallbackLang = languageCode === 'ru' ? 'en' : 'ru';
      const fallback = await pool.query(
        `SELECT content FROM system_prompts
         WHERE is_active = true AND language_code = $1
         ORDER BY version DESC LIMIT 1`,
        [fallbackLang]
      );
      return fallback.rows[0]?.content || '';
    }

    return result.rows[0].content;
  }

  /**
   * Get active intents
   */
  private async getIntents(): Promise<any[]> {
    const result = await pool.query(
      `SELECT code, name, description, examples, parameters
       FROM intents
       WHERE is_active = true AND deleted_at IS NULL
       ORDER BY priority DESC, code`
    );

    return result.rows;
  }

  /**
   * Send message with retry logic
   */
  async sendMessageWithRetry(
    telegramId: number, 
    text: string, 
    options?: any
  ): Promise<void> {
    if (!this.bot) return;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.bot.sendMessage(telegramId, text, options);
        return;
      } catch (error: any) {
        logger.warn(`Telegram send message attempt ${attempt} failed:`, error.message);
        
        if (attempt === MAX_RETRIES) {
          logger.error('Failed to send message after max retries:', error);
          throw error;
        }
        
        // Exponential backoff
        await this.sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  /**
   * Send message (legacy, for compatibility)
   */
  async sendMessage(telegramId: number, text: string, options?: any): Promise<void> {
    await this.sendMessageWithRetry(telegramId, text, options);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Process webhook update
   */
  async processWebhookUpdate(update: any): Promise<void> {
    if (!this.bot) return;
    
    try {
      await this.bot.processUpdate(update);
    } catch (error) {
      logger.error('Error processing webhook update:', error);
    }
  }

  /**
   * Shutdown bot
   */
  async shutdown(): Promise<void> {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        logger.info('Telegram bot polling stopped');
      } catch (error) {
        logger.warn('Error stopping bot polling:', error);
      }
      this.bot = null;
    }
  }
}

export const telegramService = new TelegramService();
