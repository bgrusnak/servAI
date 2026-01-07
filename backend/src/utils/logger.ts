import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';

/**
 * CRITICAL: Sanitize log input to prevent log injection
 * Removes control characters, newlines, ANSI codes
 */
function sanitizeLogInput(input: any): any {
  if (typeof input === 'string') {
    return input
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      .replace(/\r?\n/g, ' ')  // Replace newlines with spaces
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
      .substring(0, 10000); // Limit length to prevent DoS
  }
  
  if (typeof input === 'object' && input !== null) {
    if (Array.isArray(input)) {
      return input.map(item => sanitizeLogInput(item));
    }
    
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeLogInput(key);
      sanitized[sanitizedKey] = sanitizeLogInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Redact sensitive data from logs
 */
function redactSensitiveData(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'authorization',
    'cookie',
    'sessionId',
    'session_id',
    'csrfToken',
    'csrf_token',
  ];
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }
  
  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive keywords
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Safe JSON stringify with circular reference handling
 */
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

// Custom format to include request ID and sanitize input
const customFormat = winston.format.printf(({ level, message, timestamp, requestId, ...metadata }) => {
  // Sanitize message
  const sanitizedMessage = sanitizeLogInput(message);
  
  let msg = `${timestamp} [${level.toUpperCase()}]`;
  
  if (requestId) {
    msg += ` [${sanitizeLogInput(requestId)}]`;
  }
  
  msg += `: ${sanitizedMessage}`;
  
  // Sanitize and redact metadata
  if (Object.keys(metadata).length > 0) {
    const sanitizedMetadata = sanitizeLogInput(metadata);
    const redactedMetadata = redactSensitiveData(sanitizedMetadata);
    msg += ` ${safeStringify(redactedMetadata)}`;
  }
  
  return msg;
});

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    config.env === 'production'
      ? winston.format.json()  // JSON in production for log aggregation
      : customFormat  // Pretty format in development
  ),
  defaultMeta: { service: 'servai-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
  ],
});

// Add file transports in production with improved rotation
if (config.env === 'production') {
  // Error logs with daily rotation
  logger.add(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '20d', // Keep 20 days
      zippedArchive: true, // Compress old logs
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
  
  // Combined logs with daily rotation
  logger.add(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d', // Keep 30 days
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
  
  // Security audit log (separate for compliance)
  logger.add(
    new DailyRotateFile({
      filename: 'logs/security-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'warn', // Only warnings and errors
      maxSize: '20m',
      maxFiles: '90d', // Keep 90 days for compliance
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

/**
 * Helper to log with request ID and automatic sanitization
 */
export const logWithRequest = (req: any) => {
  return {
    info: (message: string, meta?: any) => {
      const sanitizedMeta = meta ? sanitizeLogInput(meta) : {};
      logger.info(message, { requestId: req.id, ...sanitizedMeta });
    },
    warn: (message: string, meta?: any) => {
      const sanitizedMeta = meta ? sanitizeLogInput(meta) : {};
      logger.warn(message, { requestId: req.id, ...sanitizedMeta });
    },
    error: (message: string, meta?: any) => {
      const sanitizedMeta = meta ? sanitizeLogInput(meta) : {};
      logger.error(message, { requestId: req.id, ...sanitizedMeta });
    },
    debug: (message: string, meta?: any) => {
      const sanitizedMeta = meta ? sanitizeLogInput(meta) : {};
      logger.debug(message, { requestId: req.id, ...sanitizedMeta });
    },
  };
};

/**
 * Security-specific logger for audit trail
 */
export const securityLogger = {
  authSuccess: (userId: string, ip: string, meta?: any) => {
    logger.info('Authentication successful', {
      event: 'auth_success',
      userId: sanitizeLogInput(userId),
      ip: sanitizeLogInput(ip),
      ...sanitizeLogInput(meta || {}),
    });
  },
  
  authFailure: (identifier: string, ip: string, reason: string, meta?: any) => {
    logger.warn('Authentication failed', {
      event: 'auth_failure',
      identifier: sanitizeLogInput(identifier),
      ip: sanitizeLogInput(ip),
      reason: sanitizeLogInput(reason),
      ...sanitizeLogInput(meta || {}),
    });
  },
  
  accessDenied: (userId: string | undefined, resource: string, ip: string, meta?: any) => {
    logger.warn('Access denied', {
      event: 'access_denied',
      userId: userId ? sanitizeLogInput(userId) : 'anonymous',
      resource: sanitizeLogInput(resource),
      ip: sanitizeLogInput(ip),
      ...sanitizeLogInput(meta || {}),
    });
  },
  
  suspiciousActivity: (description: string, userId: string | undefined, ip: string, meta?: any) => {
    logger.error('Suspicious activity detected', {
      event: 'suspicious_activity',
      description: sanitizeLogInput(description),
      userId: userId ? sanitizeLogInput(userId) : 'anonymous',
      ip: sanitizeLogInput(ip),
      ...sanitizeLogInput(meta || {}),
    });
  },
  
  dataAccess: (userId: string, resource: string, action: string, meta?: any) => {
    logger.info('Data access', {
      event: 'data_access',
      userId: sanitizeLogInput(userId),
      resource: sanitizeLogInput(resource),
      action: sanitizeLogInput(action),
      ...sanitizeLogInput(meta || {}),
    });
  },
};

// Export sanitization functions for use in other modules
export { sanitizeLogInput, redactSensitiveData };