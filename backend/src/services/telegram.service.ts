import TelegramBot from 'node-telegram-bot-api';
import { pool } from '../db';
import { logger } from '../utils/logger';
import { perplexityService } from './perplexity.service';

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
      logger.warn('TELEGRAM_BOT_TOKEN not set, bot will not start');
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
      logger.info('Telegram bot initialized in webhook mode');
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

      // Check if user already exists
      const existingUser = await this.getTelegramUser(telegramId);
      
      if (existingUser) {
        await this.sendMessage(telegramId, 
          'Welcome back! How can I help you today?');
        return;
      }

      // New user - require invite token
      if (!inviteToken) {
        await this.sendMessage(telegramId,
          'Welcome to servAI! To get started, you need an invitation link.\n\n' +
          'Please ask your building administrator for an invitation link.');
        return;
      }

      // Validate invite and create user
      await this.handleInviteRegistration(msg, inviteToken);
    } catch (error) {
      logger.error('Error handling /start:', error);
      await this.sendMessage(msg.from!.id, 
        'Sorry, something went wrong. Please try again later.');
    }
  }

  /**
   * Handle invite registration
   */
  private async handleInviteRegistration(
    msg: TelegramBot.Message, 
    inviteToken: string
  ): Promise<void> {
    const telegramId = msg.from!.id;

    try {
      // Validate invite token
      const inviteResult = await pool.query(
        `SELECT i.*, u.id as unit_id, u.number as unit_number,
                c.name as condo_name, b.name as building_name
         FROM invites i
         JOIN units u ON i.unit_id = u.id
         JOIN buildings b ON u.building_id = b.id
         JOIN condos c ON b.condo_id = c.id
         WHERE i.token = $1 
           AND i.status = 'pending'
           AND i.expires_at > NOW()
           AND i.deleted_at IS NULL`,
        [inviteToken]
      );

      if (inviteResult.rows.length === 0) {
        await this.sendMessage(telegramId,
          'Invalid or expired invitation link. Please contact your administrator.');
        return;
      }

      const invite = inviteResult.rows[0];

      // Check if invite already has a user (for multi-use invites)
      let userId = invite.user_id;

      if (!userId) {
        // Create new user
        const userResult = await pool.query(
          `INSERT INTO users (email, email_verified, first_name, last_name)
           VALUES ($1, false, $2, $3)
           RETURNING id`,
          [
            `telegram_${telegramId}@servai.temp`,
            msg.from!.first_name || 'User',
            msg.from!.last_name || ''
          ]
        );
        userId = userResult.rows[0].id;

        // Update invite
        await pool.query(
          `UPDATE invites SET user_id = $1, accepted_at = NOW(), status = 'accepted'
           WHERE id = $2`,
          [userId, invite.id]
        );
      }

      // Create telegram_user
      await pool.query(
        `INSERT INTO telegram_users (user_id, telegram_id, telegram_username, first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          telegramId,
          msg.from!.username || null,
          msg.from!.first_name || null,
          msg.from!.last_name || null,
          msg.from!.language_code || 'en'
        ]
      );

      // Create user context
      await pool.query(
        `INSERT INTO user_context (telegram_user_id, current_unit_id)
         SELECT id, $1 FROM telegram_users WHERE telegram_id = $2`,
        [invite.unit_id, telegramId]
      );

      // Create resident link
      await pool.query(
        `INSERT INTO residents (user_id, unit_id, role)
         VALUES ($1, $2, $3)`,
        [userId, invite.unit_id, invite.role]
      );

      // Send welcome message
      const address = `${invite.condo_name}, ${invite.building_name}, Unit ${invite.unit_number}`;
      await this.sendMessage(telegramId,
        `Welcome to servAI! 🏠\n\n` +
        `Your address: ${address}\n\n` +
        `I can help you with:\n` +
        `• Submit meter readings\n` +
        `• Report issues\n` +
        `• Check bills\n` +
        `• Vote in polls\n` +
        `• Manage car access\n\n` +
        `How can I help you today?`);

    } catch (error) {
      logger.error('Error in invite registration:', error);
      await this.sendMessage(telegramId,
        'Sorry, registration failed. Please contact support.');
    }
  }

  /**
   * Handle regular text message
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.text || !msg.from) return;

    try {
      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessage(msg.from.id,
          'Please start the bot first with /start and your invitation link.');
        return;
      }

      // Save user message to conversation
      await this.saveMessage(telegramUser.id, msg.message_id, 'user', msg.text);

      // Send typing indicator
      await this.bot?.sendChatAction(msg.from.id, 'typing');

      // Process with AI
      const intentResult = await this.processWithAI(telegramUser, msg.text);

      // Send AI response
      await this.sendMessage(msg.from.id, intentResult.response);

      // Save assistant message
      await this.saveMessage(
        telegramUser.id,
        0, // No telegram message ID for bot responses yet
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
      if (intentResult.intent && intentResult.confidence > 0.7) {
        await this.executeIntent(telegramUser, intentResult);
      }

    } catch (error) {
      logger.error('Error handling message:', error);
      await this.sendMessage(msg.from.id,
        'Sorry, I had trouble processing your message. Please try again.');
    }
  }

  /**
   * Handle photo message
   */
  private async handlePhoto(msg: TelegramBot.Message): Promise<void> {
    if (!msg.photo || !msg.from) return;

    try {
      const telegramUser = await this.getTelegramUser(msg.from.id);
      if (!telegramUser) {
        await this.sendMessage(msg.from.id, 'Please start with /start first.');
        return;
      }

      // Get largest photo
      const photo = msg.photo[msg.photo.length - 1];
      const fileLink = await this.bot?.getFileLink(photo.file_id);

      if (!fileLink) {
        await this.sendMessage(msg.from.id, 'Could not process photo.');
        return;
      }

      await this.sendMessage(msg.from.id, 
        'Processing your photo... This may take a moment.');

      // Process photo with Perplexity (OCR for meter reading)
      const ocrResult = await perplexityService.recognizeMeterReading(fileLink);

      if (ocrResult.success && ocrResult.value) {
        await this.sendMessage(msg.from.id,
          `I detected: ${ocrResult.meter_type || 'meter'} reading = ${ocrResult.value}\n\n` +
          `Is this correct? Reply 'yes' to confirm or send the correct value.`);
        
        // Save pending reading in context
        await pool.query(
          `UPDATE user_context 
           SET state = 'awaiting_meter_confirmation',
               state_data = $1
           WHERE telegram_user_id = (SELECT id FROM telegram_users WHERE telegram_id = $2)`,
          [JSON.stringify(ocrResult), msg.from.id]
        );
      } else {
        await this.sendMessage(msg.from.id,
          'Sorry, I could not read the meter from this photo. ' +
          'Please try taking a clearer photo or type the reading manually.');
      }

    } catch (error) {
      logger.error('Error handling photo:', error);
      await this.sendMessage(msg.from.id,
        'Sorry, I had trouble processing your photo.');
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
      const history = await this.getConversationHistory(telegramUser.id, 20);
      
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
        response: 'I\'m sorry, I didn\'t understand that. Could you please rephrase?'
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
    logger.info(`Executing intent: ${intentResult.intent}`, { 
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
      // Fallback to English
      const fallback = await pool.query(
        `SELECT content FROM system_prompts
         WHERE is_active = true AND language_code = 'en'
         ORDER BY version DESC LIMIT 1`
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
   * Send message to user
   */
  async sendMessage(telegramId: number, text: string, options?: any): Promise<void> {
    if (!this.bot) return;
    
    try {
      await this.bot.sendMessage(telegramId, text, options);
    } catch (error) {
      logger.error('Error sending message:', error);
    }
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
      await this.bot.stopPolling();
      this.bot = null;
    }
  }
}

export const telegramService = new TelegramService();
