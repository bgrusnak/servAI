import winston from 'winston';
import { config } from '../config';

// Custom format to include request ID if available
const customFormat = winston.format.printf(({ level, message, timestamp, requestId, ...meta }) => {
  let log = `[${timestamp}] ${level.toUpperCase()}`;
  
  if (requestId) {
    log += ` [req:${requestId}]`;
  }
  
  log += `: ${message}`;
  
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  
  return log;
});

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
  ],
});

// Production: add file transports
if (config.env === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 10,
    })
  );
}

/**
 * Helper to log with request context
 */
export function logWithRequest(req: any, level: string, message: string, meta?: any) {
  logger.log(level, message, {
    requestId: req.id,
    userId: req.user?.id,
    ...meta,
  });
}
