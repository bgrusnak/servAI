import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { Counter, Histogram } from 'prom-client';

// Metrics
const perplexityCallsTotal = new Counter({
  name: 'perplexity_api_calls_total',
  help: 'Total Perplexity API calls',
  labelNames: ['type', 'status']
});

const perplexityCallDuration = new Histogram({
  name: 'perplexity_api_duration_seconds',
  help: 'Perplexity API call duration in seconds',
  labelNames: ['type']
});

const perplexityCostsTotal = new Counter({
  name: 'perplexity_costs_total',
  help: 'Total estimated Perplexity API costs',
  labelNames: ['model']
});

// Configuration
const API_TIMEOUT_MS = parseInt(process.env.PERPLEXITY_TIMEOUT_MS || '10000'); // 10s default
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// Rate limiting
let requestCount = 0;
let windowStart = Date.now();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.PERPLEXITY_RATE_LIMIT || '60');

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

interface OCRResult {
  success: boolean;
  value?: number;
  meter_type?: string;
  confidence?: number;
}

class PerplexityService {
  private apiKey: string;
  private apiUrl: string = 'https://api.perplexity.ai/chat/completions';
  private model: string = 'llama-3.1-sonar-large-128k-online';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      const message = 'PERPLEXITY_API_KEY not set - AI features disabled';
      logger.error(message);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error('PERPLEXITY_API_KEY is required in production');
      }
      
      logger.warn('Perplexity service will not work without API key');
    } else {
      logger.info('Perplexity API configured: YES');
    }
  }

  /**
   * Check rate limit
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset window if needed
    if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
      requestCount = 0;
      windowStart = now;
    }

    // Check limit
    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - windowStart);
      logger.warn(`Perplexity rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      requestCount = 0;
      windowStart = Date.now();
    }

    requestCount++;
  }

  /**
   * Process user message with AI
   */
  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    summary: string,
    systemPrompt: string,
    intents: any[],
    languageCode: string
  ): Promise<IntentResult> {
    const timer = perplexityCallDuration.startTimer({ type: 'intent_recognition' });

    try {
      await this.checkRateLimit();

      // Build intents list for prompt
      const intentsList = intents.map(intent => 
        `- ${intent.code}: ${intent.description}\n  Примеры: ${intent.examples.join(', ')}\n  Параметры: ${JSON.stringify(intent.parameters)}`
      ).join('\n');

      // Build conversation history string
      const historyText = conversationHistory
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Replace placeholders in system prompt
      const finalSystemPrompt = systemPrompt
        .replace('{INTENTS_LIST}', intentsList)
        .replace('{CONVERSATION_HISTORY}', historyText)
        .replace('{SUMMARY}', summary)
        .replace('{USER_MESSAGE}', userMessage);

      // Add instruction for response language
      const languageInstruction = `\n\nВАЖНО: Отвечай на языке ${this.getLanguageName(languageCode)}.`;

      // Call Perplexity API with retry
      const response = await this.callWithRetry(async () => {
        return await axios.post(
          this.apiUrl,
          {
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
            max_tokens: 1000
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: API_TIMEOUT_MS
          }
        );
      });

      const aiResponse = response.data.choices[0].message.content;
      
      // Log token usage for cost tracking
      if (response.data.usage) {
        const tokens = response.data.usage.total_tokens || 0;
        const estimatedCost = tokens * 0.000001; // Approximate
        perplexityCostsTotal.inc({ model: this.model }, estimatedCost);
        logger.debug('Perplexity tokens used:', { tokens, estimatedCost });
      }

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(aiResponse);
        perplexityCallsTotal.inc({ type: 'intent_recognition', status: 'success' });
        return {
          intent: parsed.intent || 'unknown',
          confidence: parsed.confidence || 0,
          parameters: parsed.parameters || {},
          response: parsed.response || aiResponse,
          summary_update: parsed.summary_update
        };
      } catch {
        // If not JSON, return as plain response
        perplexityCallsTotal.inc({ type: 'intent_recognition', status: 'unparsed' });
        return {
          intent: 'unknown',
          confidence: 0.5,
          parameters: {},
          response: aiResponse
        };
      }

    } catch (error) {
      logger.error('Error calling Perplexity API:', error);
      perplexityCallsTotal.inc({ type: 'intent_recognition', status: 'error' });
      throw error;
    } finally {
      timer();
    }
  }

  /**
   * Recognize meter reading from photo
   */
  async recognizeMeterReading(photoUrl: string): Promise<OCRResult> {
    const timer = perplexityCallDuration.startTimer({ type: 'ocr' });

    try {
      await this.checkRateLimit();

      const prompt = `Проанализируй это изображение счётчика и извлеки показания.

Ответь в JSON формате:
{
  "success": true,
  "value": 123.45,
  "meter_type": "water" или "electricity" или "gas",
  "confidence": 0.95
}

Если не можешь чётко прочитать счётчик, верни {"success": false}.
Верни только JSON, без другого текста.`;

      const response = await this.callWithRetry(async () => {
        return await axios.post(
          this.apiUrl,
          {
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
                      url: photoUrl
                    }
                  }
                ]
              }
            ],
            temperature: 0.3,
            max_tokens: 500
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: API_TIMEOUT_MS
          }
        );
      });

      const aiResponse = response.data.choices[0].message.content;
      
      try {
        const parsed = JSON.parse(aiResponse);
        perplexityCallsTotal.inc({ type: 'ocr', status: 'success' });
        return parsed;
      } catch {
        logger.error('Failed to parse OCR response:', aiResponse);
        perplexityCallsTotal.inc({ type: 'ocr', status: 'parse_error' });
        return { success: false };
      }

    } catch (error) {
      logger.error('Error recognizing meter reading:', error);
      perplexityCallsTotal.inc({ type: 'ocr', status: 'error' });
      return { success: false };
    } finally {
      timer();
    }
  }

  /**
   * Call API with retry logic
   */
  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isLastAttempt = attempt > MAX_RETRIES;
        
        if (isLastAttempt) {
          throw error;
        }

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) {
          throw error;
        }

        logger.warn(`Perplexity API attempt ${attempt} failed, retrying...`, {
          error: error.message,
          code: error.code
        });

        // Exponential backoff
        await this.sleep(RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error('Should not reach here');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // Network errors
      if (!axiosError.response) {
        return true;
      }

      // Server errors (5xx)
      if (axiosError.response.status >= 500) {
        return true;
      }

      // Rate limit (429)
      if (axiosError.response.status === 429) {
        return true;
      }

      // Timeout
      if (axiosError.code === 'ECONNABORTED') {
        return true;
      }
    }

    return false;
  }

  /**
   * Translate text
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    try {
      await this.checkRateLimit();

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `Переведи следующий текст на ${this.getLanguageName(targetLanguage)}. Верни только перевод, без объяснений.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: API_TIMEOUT_MS
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Error translating text:', error);
      return text; // Return original on error
    }
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
      'en': 'английский',
      'ru': 'русский',
      'bg': 'болгарский',
      'pl': 'польский',
      'uk': 'украинский',
      'de': 'немецкий',
      'fr': 'французский',
      'es': 'испанский',
      'it': 'итальянский'
    };

    return languages[code] || 'английский';
  }
}

export const perplexityService = new PerplexityService();
