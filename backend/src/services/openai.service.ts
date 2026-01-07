import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { Counter, Histogram } from 'prom-client';
import axios from 'axios';

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

// Configuration
const TEXT_TIMEOUT_MS = parseInt(process.env.OPENAI_TEXT_TIMEOUT_MS || '15000');
const VISION_TIMEOUT_MS = parseInt(process.env.OPENAI_VISION_TIMEOUT_MS || '30000');
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

// Rate limiting (OpenAI: 500 req/min for tier 1)
let requestCount = 0;
let windowStart = Date.now();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.OPENAI_RATE_LIMIT || '450'); // Safety margin

// Pricing per 1M tokens (GPT-4o-mini)
const PRICING = {
  'gpt-4o-mini': {
    input: 0.150,  // $0.150 per 1M input tokens
    output: 0.600  // $0.600 per 1M output tokens
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
   * Process user message with AI for intent recognition
   */
  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    summary: string,
    systemPrompt: string,
    intents: any[],
    languageCode: string
  ): Promise<IntentResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const timer = openaiCallDuration.startTimer({ type: 'intent_recognition', model: this.model });

    try {
      await this.checkRateLimit();

      const intentsList = intents.map(intent => 
        `- ${intent.code}: ${intent.description}\n  Examples: ${intent.examples.join(', ')}\n  Parameters: ${JSON.stringify(intent.parameters)}`
      ).join('\n');

      const historyText = conversationHistory
        .slice(-10)
        .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : '[multimodal]'}`)
        .join('\n');

      const finalSystemPrompt = systemPrompt
        .replace('{INTENTS_LIST}', intentsList)
        .replace('{CONVERSATION_HISTORY}', historyText)
        .replace('{SUMMARY}', summary)
        .replace('{USER_MESSAGE}', userMessage);

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
              content: userMessage
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        });
      }, TEXT_TIMEOUT_MS);

      const aiResponse = completion.choices[0].message.content || '{}';
      
      this.trackUsage(completion.usage);

      try {
        const parsed = JSON.parse(aiResponse);
        openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'success' });
        
        return {
          intent: parsed.intent || 'unknown',
          confidence: parsed.confidence || 0,
          parameters: parsed.parameters || {},
          response: parsed.response || aiResponse,
          summary_update: parsed.summary_update
        };
      } catch (parseError) {
        logger.warn('Failed to parse intent JSON', { response: aiResponse });
        openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'parse_error' });
        
        return {
          intent: 'unknown',
          confidence: 0.5,
          parameters: {},
          response: aiResponse
        };
      }

    } catch (error) {
      logger.error('Error calling OpenAI API', { error });
      openaiCallsTotal.inc({ type: 'intent_recognition', model: this.model, status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }

  /**
   * Recognize meter reading from photo using Vision API
   */
  async recognizeMeterReading(imageBase64: string): Promise<OCRResult> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const timer = openaiCallDuration.startTimer({ type: 'ocr', model: this.model });

    try {
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
      
      this.trackUsage(completion.usage);

      try {
        const parsed = JSON.parse(aiResponse);
        openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'success' });
        return parsed;
      } catch (parseError) {
        logger.error('Failed to parse OCR response', { response: aiResponse });
        openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'parse_error' });
        return { success: false };
      }

    } catch (error) {
      logger.error('Error recognizing meter reading', { error });
      openaiCallsTotal.inc({ type: 'ocr', model: this.model, status: 'error' });
      return { success: false };
    } finally {
      timer();
    }
  }

  /**
   * Translate text
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    if (!this.client) {
      return text;
    }

    try {
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
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        });
      }, TEXT_TIMEOUT_MS);

      this.trackUsage(completion.usage);

      return completion.choices[0].message.content || text;
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
   * Track token usage and costs
   */
  private trackUsage(usage: any): void {
    if (!usage) return;

    const pricing = PRICING[this.model];
    if (!pricing) return;

    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;

    openaiTokensTotal.inc({ model: this.model, type: 'input' }, inputTokens);
    openaiTokensTotal.inc({ model: this.model, type: 'output' }, outputTokens);

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    openaiCostsTotal.inc({ model: this.model }, totalCost);

    logger.debug('OpenAI usage tracked', {
      model: this.model,
      inputTokens,
      outputTokens,
      totalCost: totalCost.toFixed(6)
    });
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
