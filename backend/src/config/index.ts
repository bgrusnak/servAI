import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const env = process.env.NODE_ENV || 'development';

/**
 * Calculate Shannon entropy of a string
 * CRITICAL: Used to validate JWT secret strength
 */
function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies: { [key: string]: number } = {};
  
  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy * len; // bits of entropy
}

/**
 * Validate JWT secret strength
 * CRITICAL: Prevents weak secrets that can be brute-forced
 */
function validateJWTSecret(secret: string): void {
  // Length check
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long. Generate with: openssl rand -base64 48'
    );
  }
  
  // Entropy check (minimum 128 bits)
  const entropy = calculateEntropy(secret);
  if (entropy < 128) {
    throw new Error(
      `JWT_SECRET has insufficient entropy (${entropy.toFixed(1)} bits, need >= 128). ` +
      'Use a cryptographically random string. Generate with: openssl rand -base64 48'
    );
  }
  
  // Character diversity check
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 16) {
    throw new Error(
      `JWT_SECRET has too few unique characters (${uniqueChars}, need >= 16). ` +
      'Use a cryptographically random string.'
    );
  }
  
  // Pattern detection (no repeating sequences)
  const pattern = /(.)\1{4,}/; // 5+ repeating chars
  if (pattern.test(secret)) {
    throw new Error(
      'JWT_SECRET contains repeating patterns. Use a cryptographically random string.'
    );
  }
  
  // Common weak patterns
  const weakPatterns = [
    /^[a-z]+$/i,           // Only letters
    /^[0-9]+$/,            // Only numbers
    /^(12345|abcde|test|password|secret|admin|default)/i, // Common words
  ];
  
  for (const weakPattern of weakPatterns) {
    if (weakPattern.test(secret)) {
      throw new Error(
        'JWT_SECRET appears to use a weak or predictable pattern. Use: openssl rand -base64 48'
      );
    }
  }
}

/**
 * Validate database URL for SSL/TLS
 * CRITICAL: Prevents unencrypted database connections in production
 */
function validateDatabaseURL(url: string, environment: string): void {
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  
  // Production must use SSL
  if (environment === 'production' || environment === 'staging') {
    // Check for SSL parameters
    const hasSSL = url.includes('sslmode=require') || 
                   url.includes('ssl=true') ||
                   url.includes('sslmode=verify-full');
    
    if (!hasSSL) {
      throw new Error(
        'DATABASE_URL must use SSL in production/staging. ' +
        'Add "?sslmode=require" or "?sslmode=verify-full" to connection string'
      );
    }
  }
}

/**
 * Validate CORS origins
 * CRITICAL: Prevents CORS misconfigurations
 */
function validateCORSOrigins(origins: string[], credentials: boolean): string[] {
  const validated: string[] = [];
  
  for (const origin of origins) {
    const trimmed = origin.trim();
    
    if (!trimmed) {
      continue; // Skip empty
    }
    
    // CRITICAL: Wildcard with credentials is a security violation
    if (trimmed === '*' && credentials) {
      throw new Error(
        'CORS: Cannot use wildcard (*) origin with credentials: true. ' +
        'This is a critical security violation.'
      );
    }
    
    // Validate URL format (unless wildcard)
    if (trimmed !== '*') {
      try {
        const url = new URL(trimmed);
        
        // Production should use HTTPS
        if ((env === 'production' || env === 'staging') && url.protocol === 'http:') {
          throw new Error(
            `CORS origin "${trimmed}" uses HTTP in ${env} environment. ` +
            'Use HTTPS for security.'
          );
        }
        
        validated.push(trimmed);
      } catch (err) {
        throw new Error(
          `Invalid CORS origin "${trimmed}". Must be a valid URL (e.g., https://example.com)`
        );
      }
    } else {
      validated.push(trimmed);
    }
  }
  
  if (validated.length === 0) {
    throw new Error('At least one CORS origin must be configured');
  }
  
  return validated;
}

// Validate JWT secret
const jwtSecret = process.env.JWT_SECRET || '';
validateJWTSecret(jwtSecret);

// Support for JWT secret rotation (optional secondary secrets)
const jwtSecrets = [jwtSecret];
if (process.env.JWT_SECRET_OLD) {
  validateJWTSecret(process.env.JWT_SECRET_OLD);
  jwtSecrets.push(process.env.JWT_SECRET_OLD);
}

// Validate database URL
const databaseURL = process.env.DATABASE_URL || '';
validateDatabaseURL(databaseURL, env);

// Validate CORS
const corsCredentials = true;
const corsOrigins = validateCORSOrigins(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  corsCredentials
);

// Validate trusted proxies (for rate limiter)
const trustedProxies = process.env.TRUSTED_PROXIES
  ? process.env.TRUSTED_PROXIES.split(',').map(ip => ip.trim())
  : [];

// Validate critical production config
if (env === 'production') {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'REDIS_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(
        `${key} is required in production environment. Check your .env file.`
      );
    }
  }
  
  // Redis must use TLS in production
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('rediss://')) {
    throw new Error(
      'REDIS_URL must use TLS (rediss://) in production. ' +
      'Change redis:// to rediss://'
    );
  }
}

export const config = Object.freeze({
  env,
  port: parseInt(process.env.PORT || '3000', 10),

  app: {
    url: process.env.APP_URL || 'http://localhost:3000',
  },

  database: {
    url: databaseURL,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000', 10),
    },
    // SSL configuration
    ssl: {
      rejectUnauthorized: env === 'production',
      ca: process.env.DB_SSL_CA, // Optional CA certificate
    },
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'servai:',
  },

  jwt: {
    secret: jwtSecret,
    secrets: jwtSecrets, // For rotation support
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    algorithm: 'HS256' as const,
  },

  email: {
    apiUrl: process.env.EMAIL_API_URL || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    fromEmail: process.env.EMAIL_FROM || 'noreply@servai.app',
    fromName: process.env.EMAIL_FROM_NAME || 'servAI',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'servai',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },

  cors: {
    allowedOrigins: corsOrigins,
    credentials: corsCredentials,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  retention: {
    auditLogs: parseInt(process.env.AUDIT_LOGS_RETENTION_DAYS || '90', 10),
  },
  
  // Trusted proxies for IP detection
  trustedProxies,
});

// Log configuration (mask sensitive values)
if (env === 'development') {
  console.log('Configuration loaded:');
  console.log(JSON.stringify({
    ...config,
    database: { ...config.database, url: '[REDACTED]' },
    jwt: { ...config.jwt, secret: '[REDACTED]', secrets: '[REDACTED]' },
    email: { ...config.email, apiKey: '[REDACTED]' },
    stripe: { 
      ...config.stripe, 
      secretKey: '[REDACTED]', 
      webhookSecret: '[REDACTED]' 
    },
    s3: { 
      ...config.s3, 
      accessKeyId: '[REDACTED]', 
      secretAccessKey: '[REDACTED]' 
    },
  }, null, 2));
}