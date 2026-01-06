import dotenv from 'dotenv';

dotenv.config();

const env = process.env.NODE_ENV || 'development';

// Validate JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be at least 32 characters long. Set it in your .env file.'
  );
}

export const config = {
  env,
  port: parseInt(process.env.PORT || '3000', 10),

  app: {
    url: process.env.APP_URL || 'http://localhost:3000',
  },

  database: {
    url: process.env.DATABASE_URL || '',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'servai:',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  email: {
    apiUrl: process.env.EMAIL_API_URL || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    fromEmail: process.env.EMAIL_FROM || 'noreply@servai.app',
    fromName: process.env.EMAIL_FROM_NAME || 'servAI',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};
