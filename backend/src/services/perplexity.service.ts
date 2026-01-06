import axios from 'axios';
import { logger } from '../utils/logger';

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
      logger.warn('PERPLEXITY_API_KEY not set, AI features will not work');
    }
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
    try {
      // Build intents list for prompt
      const intentsList = intents.map(intent => 
        `- ${intent.code}: ${intent.description}\n  Examples: ${intent.examples.join(', ')}\n  Parameters: ${JSON.stringify(intent.parameters)}`
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
      const languageInstruction = `\n\nIMPORTANT: Respond in ${this.getLanguageName(languageCode)} language.`;

      // Call Perplexity API
      const response = await axios.post(
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
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(aiResponse);
        return {
          intent: parsed.intent || 'unknown',
          confidence: parsed.confidence || 0,
          parameters: parsed.parameters || {},
          response: parsed.response || aiResponse,
          summary_update: parsed.summary_update
        };
      } catch {
        // If not JSON, return as plain response
        return {
          intent: 'unknown',
          confidence: 0.5,
          parameters: {},
          response: aiResponse
        };
      }

    } catch (error) {
      logger.error('Error calling Perplexity API:', error);
      throw error;
    }
  }

  /**
   * Recognize meter reading from photo
   */
  async recognizeMeterReading(photoUrl: string): Promise<OCRResult> {
    try {
      const prompt = `Analyze this image of a utility meter and extract the reading.

Provide response in JSON format:
{
  "success": true,
  "value": 123.45,
  "meter_type": "water" or "electricity" or "gas",
  "confidence": 0.95
}

If you cannot read the meter clearly, return {"success": false}.
Only return the JSON, no other text.`;

      const response = await axios.post(
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
          timeout: 30000
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      
      try {
        const parsed = JSON.parse(aiResponse);
        return parsed;
      } catch {
        logger.error('Failed to parse OCR response:', aiResponse);
        return { success: false };
      }

    } catch (error) {
      logger.error('Error recognizing meter reading:', error);
      return { success: false };
    }
  }

  /**
   * Translate text
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `Translate the following text to ${this.getLanguageName(targetLanguage)}. Return only the translation, no explanations.`
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
          timeout: 15000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Error translating text:', error);
      return text; // Return original on error
    }
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

export const perplexityService = new PerplexityService();
