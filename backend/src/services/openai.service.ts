import OpenAI from 'openai';
import { logger, securityLogger } from '../utils/logger';
import { Counter, Histogram, Gauge } from 'prom-client';
import { redisClient } from '../utils/redis';

// Metrics
const openaiCallsTotal = new Counter({
  name: 'openai_api_calls_total',
  help: 'Total OpenAI API calls',
  labelNames: ['type', 'model', 'status']
});

const openaiCallDuration = new Histogram({
  name: 'openai_api_duration_seconds',
  help: 'OpenAI API call duration in seconds',
  labelNames: ['type', 'model']
});

const openaiCostsTotal = new Counter({
  name: 'openai_costs_total',
  help: 'Total estimated OpenAI API costs in USD',
  labelNames: ['model']
});

const openaiTokensTotal = new Counter({
  name: 'openai_tokens_total',
  help: 'Total OpenAI tokens used',
  labelNames: ['model', 'type']
});

const openaiDailyCost = new Gauge({
  name: 'openai_daily_cost_usd',
  help: 'OpenAI daily cost in USD',
  labelNames: ['date']
});

// Configuration
const TEXT_TIMEOUT_MS = parseInt(process.env.OPENAI_TEXT_TIMEOUT_MS || '15000');
const VISION_TIMEOUT_MS = parseInt(process.env.OPENAI_VISION_TIMEOUT_MS || '30000');
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// CRITICAL: Cost limits
const DAILY_USER_COST_LIMIT = parseFloat(process.env.OPENAI_DAILY_USER_LIMIT || '1.00'); // $1/user/day
const MONTHLY_BUDGET = parseFloat(process.env.OPENAI_MONTHLY_BUDGET || '100.00'); // $100/month
const COST_ALERT_THRESHOLD = 0.8; // Alert at 80%

// CRITICAL: Input limits
const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_CONVERSATION_HISTORY = 20;

// Rate limiting
let requestCount = 0;
let windowStart = Date.now();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.OPENAI_RATE_LIMIT || '450');

// Pricing per 1M tokens (GPT-4o-mini)
const PRICING = {
  'gpt-4o-mini': {
    input: 0.150,
    output: 0.600
  }
};

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface IntentResult {
  intent: string;
  confidence: number;
  parameters: Record<string, any>;
  response: string;
  summary_update?: string;
}

interface OCRResult {
  success: boolean;
  value?: number;
  meter_type?: string;
  confidence?: number;
}

class OpenAIService {
  private client: OpenAI | null = null;
  private model: string = 'gpt-4o-mini';
  private validIntents: Set<string> = new Set();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      const message = 'OPENAI_API_KEY not set - AI features disabled';
      logger.error(message);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error('OPENAI_API_KEY is required in production');
      }
      
      logger.warn('OpenAI service will not work without API key');
    } else {
      this.client = new OpenAI({ apiKey });
      logger.info('OpenAI API configured', { model: this.model });
    }
  }

  /**
   * Register valid intents for validation
   */
  registerIntents(intents: Array<{ code: string }>): void {
    this.validIntents = new Set(intents.map(i => i.code));
    this.validIntents.add('unknown');
    this.validIntents.add('fallback');
  }

  /**
   * CRITICAL: Sanitize user message to prevent prompt injection
   */
  private sanitizeUserMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message format');
    }

    // Length limit
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} chars)`);
    }

    // Remove potential prompt injection patterns
    let sanitized = message
      // Remove system-like instructions
      .replace(/\b(ignore|disregard|forget)\s+(all|previous|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
      .replace(/\b(you are now|act as|pretend to be|roleplay as)/gi, '[filtered]')
      .replace(/\b(system prompt|new instructions|override)/gi, '[filtered]')
      // Remove code injection attempts
      .replace(/```[\s\S]*?```/g, '[code block removed]')
      // Remove excessive special characters
      .replace(/([^\w\s.,!?-]){10,}/g, '[filtered]');

    // Escape control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

    return sanitized.trim();
  }

  /**
   * CRITICAL: Validate conversation history
   */
  private validateConversationHistory(history: ConversationMessage[]): ConversationMessage[] {
    if (!Array.isArray(history)) {
      return [];
    }

    // Limit history size
    const limited = history.slice(-MAX_CONVERSATION_HISTORY);

    // Validate and sanitize each message
    return limited
      .filter(msg => msg && typeof msg === 'object')
      .filter(msg => ['user', 'assistant', 'system'].includes(msg.role))
      .map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? this.sanitizeUserMessage(msg.content)
          : '[multimodal]'
      }));
  }

  /**
   * CRITICAL: Validate image base64 data
   */
  private validateImageData(imageBase64: string): void {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('Invalid image data');
    }

    // Check base64 format
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Pattern.test(imageBase64)) {
      throw new Error('Invalid base64 format');
    }

    // Check size (base64 is ~33% larger than binary)
    const estimatedSize = (imageBase64.length * 3) / 4;
    if (estimatedSize > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`Image too large (max ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`);
    }

    // Decode and verify magic bytes
    try {
      const buffer = Buffer.from(imageBase64, 'base64');
      const magicBytes = buffer.slice(0, 4).toString('hex');
      
      const validMagicBytes = [
        'ffd8ff', // JPEG
        '89504e47', // PNG
        '47494638', // GIF
      ];

      const isValid = validMagicBytes.some(magic => magicBytes.startsWith(magic));
      if (!isValid) {
        throw new Error('Invalid image format (must be JPEG, PNG, or GIF)');
      }
    } catch (error) {
      throw new Error('Failed to decode image data');
    }
  }

  /**
   * CRITICAL: Check cost limits
   */
  private async checkCostLimits(userId?: string): Promise<void> {
    // Check monthly budget
    const monthKey = `openai:cost:month:${new Date().toISOString().slice(0, 7)}`;
    const monthCost = parseFloat(await redisClient.get(monthKey) || '0');

    if (monthCost >= MONTHLY_BUDGET) {
      securityLogger.suspiciousActivity(
        'OpenAI monthly budget exceeded',
        userId,
        'system',
        { monthCost, budget: MONTHLY_BUDGET }
      );
      throw new Error('Monthly OpenAI budget exceeded');
    }

    if (monthCost >= MONTHLY_BUDGET * COST_ALERT_THRESHOLD) {
      logger.warn('OpenAI cost approaching monthly budget', {
        current: monthCost,
        budget: MONTHLY_BUDGET,
        percent: (monthCost / MONTHLY_BUDGET * 100).toFixed(1)
      });
    }

    // Check daily user limit
    if (userId) {
      const dayKey = `openai:cost:user:${userId}:${new Date().toISOString().slice(0, 10)}`;
      const userCost = parseFloat(await redisClient.get(dayKey) || '0');

      if (userCost >= DAILY_USER_COST_LIMIT) {
        securityLogger.suspiciousActivity(
          'User OpenAI daily limit exceeded',
          userId,
          'system',
          { userCost, limit: DAILY_USER_COST_LIMIT }
        );
        throw new Error('Daily OpenAI usage limit exceeded');
      }
    }
  }

  /**
   * CRITICAL: Track cost with limits
   */
  private async trackCostWithLimits(usage: any, userId?: string): Promise<void> {
    if (!usage) return;

    const pricing = PRICING[this.model];
    if (!pricing) return;

    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // Update metrics
    openaiTokensTotal.inc({ model: this.model, type: 'input' }, inputTokens);
    openaiTokensTotal.inc({ model: this.model, type: 'output' }, outputTokens);
    openaiCostsTotal.inc({ model: this.model }, totalCost);

    // Update Redis counters
    const monthKey = `openai:cost:month:${new Date().toISOString().slice(0, 7)}`;
    await redisClient.incrByFloat(monthKey, totalCost);
    await redisClient.expire(monthKey, 86400 * 31); // 31 days

    if (userId) {
      const dayKey = `openai:cost:user:${userId}:${new Date().toISOString().slice(0, 10)}`;
      await redisClient.incrByFloat(dayKey, totalCost);
      await redisClient.expire(dayKey, 86400); // 24 hours
    }

    // Update daily gauge
    const today = new Date().toISOString().slice(0, 10);
    const dayKey = `openai:cost:day:${today}`;
    const dayCost = parseFloat(await redisClient.get(dayKey) || '0') + totalCost;
    await redisClient.setex(dayKey, 86400, dayCost.toString());
    openaiDailyCost.set({ date: today }, dayCost);

    logger.debug('OpenAI cost tracked', {
      model: this.model,
      inputTokens,
      outputTokens,
      cost: totalCost.toFixed(6),
      userId
    });
  }

  /**
   * Check and enforce rate limit
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
      requestCount = 0;
      windowStart = now;
      return;
    }

    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - windowStart);
      logger.warn(`OpenAI rate limit reached, waiting ${waitTime}ms`, {
        requestCount,
        limit: MAX_REQUESTS_PER_MINUTE
      });
      
      await this.sleep(waitTime);
      requestCount = 0;
      windowStart = Date.now();
    }

    requestCount++;
  }

  /**
   * CRITICAL: Validate AI response
   */
  private validateIntentResult(parsed: any, validIntents: string[]): IntentResult {
    // Validate intent against whitelist
    const intent = typeof parsed.intent === 'string' ? parsed.intent : 'unknown';
    const validIntent = this.validIntents.has(intent) ? intent : 'unknown';

    // Validate confidence range [0, 1]
    let confidence = parseFloat(parsed.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      confidence = 0;
    }

    // Sanitize parameters (prevent XSS/injection)
    const parameters: Record<string, any> = {};
    if (parsed.parameters && typeof parsed.parameters === 'object') {
      for (const [key, value] of Object.entries(parsed.parameters)) {
        if (typeof value === 'string') {
          parameters[key] = this.sanitizeOutput(value);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          parameters[key] = value;
        }
      }
    }

    // Sanitize response text
    const response = typeof parsed.response === 'string'
      ? this.sanitizeOutput(parsed.response)
      : '';

    // Sanitize summary update
    const summary_update = typeof parsed.summary_update === 'string'
      ? this.sanitizeOutput(parsed.summary_update)
      : undefined;

    return {
      intent: validIntent,
      confidence,
      parameters,
      response,
      summary_update
    };
  }

  /**
   * CRITICAL: Sanitize AI output to prevent XSS
   */
  private sanitizeOutput(text: string): string {
    if (!text || typeof text !== 'string') return '';

    return text
      // Remove script tags
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      // Limit length
      .slice(0, 10000);
  }

  /**
   * Process user message with AI for intent recognition
   */
  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    summary: string,
    systemPrompt: string,
    intents: any[],
    languageCode: string,
    userId?: string
  ): Promise<IntentResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const timer = openaiCallDuration.startTimer({ type: 'intent_recognition', model: this.model });

    try {
      // CRITICAL: Validate inputs
      const sanitizedMessage = this.sanitizeUserMessage(userMessage);
      const validatedHistory = this.validateConversationHistory(conversationHistory);
      const sanitizedSummary = this.sanitizeUserMessage(summary || '');

      // Register valid intents
      this.registerIntents(intents);

      // CRITICAL: Check cost limits
      await this.checkCostLimits(userId);
      await this.checkRateLimit();

      const intentsList = intents.map(intent => 
        `- ${intent.code}: ${intent.description}\n  Examples: ${intent.examples.join(', ')}`
      ).join('\n');

      const historyText = validatedHistory
        .slice(-10)
        .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : '[multimodal]'}`)
        .join('\n');

      // CRITICAL: Use parameterized system prompt (no user input injection)
      const finalSystemPrompt = systemPrompt
        .replace('{INTENTS_LIST}', intentsList)
        .replace('{CONVERSATION_HISTORY}', historyText)
        .replace('{SUMMARY}', sanitizedSummary);
      // Note: {USER_MESSAGE} is NOT injected into system prompt

      const languageInstruction = `\n\nIMPORTANT: Respond in ${this.getLanguageName(languageCode)} language.`;

      const completion = await this.callWithRetry(async () => {
        return await this.client!.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: finalSystemPrompt + languageInstruction
            },
            {
              role: 'user',
              content: sanitizedMessage  // User message separate from system
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        });
      }, TEXT_TIMEOUT_MS);

      const aiResponse = completion.choices[0].message.content || '{}';
      
      await this.trackCostWithLimits(completion.usage, userId);

      try {
        const parsed = JSON.parse(aiResponse);
        openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'success' });
        
        // CRITICAL: Validate response structure
        return this.validateIntentResult(parsed, intents.map(i => i.code));
      } catch (parseError) {
        logger.warn('Failed to parse intent JSON', { response: aiResponse.slice(0, 200) });
        openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'parse_error' });
        
        return {
          intent: 'unknown',
          confidence: 0.5,
          parameters: {},
          response: this.sanitizeOutput(aiResponse)
        };
      }

    } catch (error: any) {
      logger.error('Error calling OpenAI API', { error: error.message });
      openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }

  /**
   * Recognize meter reading from photo using Vision API
   */
  async recognizeMeterReading(imageBase64: string, userId?: string): Promise<OCRResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const timer = openaiCallDuration.startTimer({ type: 'ocr', model: this.model });

    try {
      // CRITICAL: Validate image data
      this.validateImageData(imageBase64);

      // CRITICAL: Check cost limits (vision is expensive)
      await this.checkCostLimits(userId);
      await this.checkRateLimit();

      const prompt = `Analyze this meter image and extract the reading.

Respond in JSON format:
{
  "success": true,
  "value": 123.45,
  "meter_type": "water" or "electricity" or "gas",
  "confidence": 0.95
}

If you cannot clearly read the meter, return {"success": false}.
Return ONLY valid JSON, no other text.`;

      const completion = await this.callWithRetry(async () => {
        return await this.client!.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        });
      }, VISION_TIMEOUT_MS);

      const aiResponse = completion.choices[0].message.content || '{"success": false}';
      
      await this.trackCostWithLimits(completion.usage, userId);

      try {
        const parsed = JSON.parse(aiResponse);
        
        // Validate response structure
        if (typeof parsed.success !== 'boolean') {
          return { success: false };
        }

        if (!parsed.success) {
          openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'no_reading' });
          return { success: false };
        }

        // Validate value
        const value = parseFloat(parsed.value);
        if (isNaN(value) || value < 0 || value > 999999999) {
          return { success: false };
        }

        // Validate confidence
        let confidence = parseFloat(parsed.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
          confidence = 0.5;
        }

        // Validate meter type
        const validTypes = ['water', 'electricity', 'gas'];
        const meter_type = validTypes.includes(parsed.meter_type) ? parsed.meter_type : undefined;

        openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'success' });
        return {
          success: true,
          value,
          meter_type,
          confidence
        };
      } catch (parseError) {
        logger.error('Failed to parse OCR response', { response: aiResponse.slice(0, 200) });
        openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'parse_error' });
        return { success: false };
      }

    } catch (error: any) {
      logger.error('Error recognizing meter reading', { error: error.message });
      openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'error' });
      return { success: false };
    } finally {
      timer();
    }
  }

  /**
   * Translate text
   */
  async translate(text: string, targetLanguage: string, userId?: string): Promise<string> {
    if (!this.client) {
      return text;
    }

    try {
      const sanitizedText = this.sanitizeUserMessage(text);
      
      await this.checkCostLimits(userId);
      await this.checkRateLimit();

      const completion = await this.callWithRetry(async () => {
        return await this.client!.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `Translate the following text to ${this.getLanguageName(targetLanguage)}. Return ONLY the translation, no explanations.`
            },
            {
              role: 'user',
              content: sanitizedText
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        });
      }, TEXT_TIMEOUT_MS);

      await this.trackCostWithLimits(completion.usage, userId);

      const result = completion.choices[0].message.content || text;
      return this.sanitizeOutput(result);
    } catch (error) {
      logger.error('Error translating text', { error });
      return text;
    }
  }

  /**
   * Call API with retry logic and exponential backoff
   */
  private async callWithRetry<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
        });

        return await Promise.race([fn(), timeoutPromise]);
      } catch (error: any) {
        lastError = error;
        
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        if (isLastAttempt) {
          break;
        }

        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) {
          throw error;
        }

        const retryAfter = this.getRetryAfter(error);
        const backoffMs = retryAfter || (INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));

        logger.warn(`OpenAI API attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`, {
          error: error.message,
          status: error.status
        });

        await this.sleep(backoffMs);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error.status) return true;

    return [
      408, // Request Timeout
      429, // Rate Limit
      500, // Internal Server Error
      502, // Bad Gateway
      503, // Service Unavailable
      504  // Gateway Timeout
    ].includes(error.status);
  }

  /**
   * Extract Retry-After header value in milliseconds
   */
  private getRetryAfter(error: any): number | null {
    const retryAfter = error.headers?.['retry-after'];
    if (!retryAfter) return null;

    const seconds = parseInt(retryAfter);
    return isNaN(seconds) ? null : seconds * 1000;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      'en': 'English',
      'ru': 'Russian',
      'bg': 'Bulgarian',
      'pl': 'Polish',
      'uk': 'Ukrainian',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian'
    };

    return languages[code] || 'English';
  }
}

export const openaiService = new OpenAIService();