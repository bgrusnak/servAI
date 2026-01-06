import dotenv from 'dotenv';

dotenv.config();

// Validate critical env variables
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
];

const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV === 'production') {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// FIX NEW-004: Require strong JWT secret even in dev
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long! Generate with: openssl rand -base64 32');
}

if (process.env.JWT_SECRET === 'dev_jwt_secret_CHANGE_THIS') {
  throw new Error('JWT_SECRET must be changed from default value!');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://servai:servai_dev_pass@localhost:5432/servai',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_TIMEOUT || '5000', 10),
    },
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,  // Validated above
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },
  
  perplexity: {
    apiKey: process.env.PERPLEXITY_API_KEY || '',
    model: process.env.SONAR_MODEL || 'llama-3.1-sonar-small-128k-online',
    maxTokens: parseInt(process.env.SONAR_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.SONAR_TEMPERATURE || '0.2'),
  },
  
  platform: {
    name: process.env.PLATFORM_NAME || 'servAI',
    email: process.env.PLATFORM_EMAIL || 'support@servai.example',
    commissionFixed: parseFloat(process.env.PLATFORM_COMMISSION_FIXED || '0'),
    commissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '5'),
  },
  
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
    path: process.env.UPLOAD_PATH || './uploads',
  },
  
  retention: {
    auditLogs: parseInt(process.env.RETENTION_AUDIT_LOGS || '90', 10),
    files: parseInt(process.env.RETENTION_FILES || '365', 10),
    invites: parseInt(process.env.RETENTION_INVITES || '7', 10),
    invoicesPlatform: parseInt(process.env.RETENTION_INVOICES_PLATFORM || '1095', 10),
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    messageFloodThreshold: parseInt(process.env.MESSAGE_FLOOD_THRESHOLD || '10', 10),
    messageFloodBaseDelayMs: parseInt(process.env.MESSAGE_FLOOD_BASE_DELAY_MS || '1000', 10),
  },
};
