import winston from 'winston';
import { config } from '../config';

// Custom format to include request ID
const customFormat = winston.format.printf(({ level, message, timestamp, requestId, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]`;
  
  if (requestId) {
    msg += ` [${requestId}]`;
  }
  
  msg += `: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
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

// Add file transport in production
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
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    })
  );
}

// Helper to log with request ID
export const logWithRequest = (req: any) => {
  return {
    info: (message: string, meta?: any) => logger.info(message, { requestId: req.id, ...meta }),
    warn: (message: string, meta?: any) => logger.warn(message, { requestId: req.id, ...meta }),
    error: (message: string, meta?: any) => logger.error(message, { requestId: req.id, ...meta }),
    debug: (message: string, meta?: any) => logger.debug(message, { requestId: req.id, ...meta }),
  };
};
