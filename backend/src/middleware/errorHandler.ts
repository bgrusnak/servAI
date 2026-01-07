import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';
import { randomBytes } from 'crypto';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorId?: string;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorId = randomBytes(8).toString('hex');
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Detect if error is a database error
 */
function isDatabaseError(err: Error): boolean {
  const message = err.message.toLowerCase();
  
  // PostgreSQL error patterns
  const dbPatterns = [
    'violates',
    'constraint',
    'foreign key',
    'unique',
    'duplicate key',
    'check constraint',
    'not-null',
    'syntax error',
    'relation',
    'column',
    'table',
    'invalid input',
    'pg::', // PostgreSQL error codes
    'sqlstate',
  ];
  
  return dbPatterns.some(pattern => message.includes(pattern));
}

/**
 * Sanitize database errors to prevent schema disclosure
 */
function sanitizeDatabaseError(err: Error): string {
  const message = err.message;
  
  // Map specific patterns to generic messages
  if (message.includes('duplicate key')) {
    return 'This value already exists';
  }
  
  if (message.includes('foreign key')) {
    return 'Invalid reference';
  }
  
  if (message.includes('not-null') || message.includes('violates check constraint')) {
    return 'Missing required field';
  }
  
  if (message.includes('invalid input')) {
    return 'Invalid data format';
  }
  
  // Generic fallback
  return 'Database operation failed';
}

/**
 * Sanitize error messages for production/staging
 * FIXED: Now handles all database error types
 */
function sanitizeErrorMessage(err: Error | AppError, statusCode: number): string {
  // Development: show all errors
  if (config.env === 'development') {
    return err.message;
  }
  
  // Production/Staging: sanitize sensitive errors
  
  // 1. Database errors (CRITICAL: prevent schema disclosure)
  if (isDatabaseError(err)) {
    return sanitizeDatabaseError(err);
  }
  
  // 2. Internal server errors (5xx)
  if (statusCode >= 500) {
    return 'Internal server error';
  }
  
  // 3. Authentication/Authorization errors (keep specific)
  if (statusCode === 401 || statusCode === 403) {
    return err.message; // These are safe to show
  }
  
  // 4. Validation errors (keep specific)
  if (statusCode === 400 || statusCode === 422) {
    // But remove any potential database references
    const message = err.message;
    if (isDatabaseError(err)) {
      return sanitizeDatabaseError(err);
    }
    return message;
  }
  
  // 5. Other client errors (keep message)
  if (statusCode >= 400 && statusCode < 500) {
    return err.message;
  }
  
  // Fallback
  return 'An error occurred';
}

/**
 * Redact sensitive data from error messages for logging
 */
function redactSensitiveData(message: string): string {
  let redacted = message;
  
  // Redact potential tokens
  redacted = redacted.replace(/[A-Za-z0-9-_]{20,}/g, '[REDACTED_TOKEN]');
  
  // Redact email addresses
  redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
  
  // Redact phone numbers
  redacted = redacted.replace(/\+?[0-9]{10,}/g, '[REDACTED_PHONE]');
  
  // Redact IPs (but keep for rate limiting context)
  // redacted = redacted.replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, '[REDACTED_IP]');
  
  return redacted;
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isOperational = err instanceof AppError ? err.isOperational : false;
  const errorId = err instanceof AppError ? err.errorId : randomBytes(8).toString('hex');

  // Log error with context
  logger.error('Error occurred', {
    errorId,
    error: redactSensitiveData(err.message),
    stack: config.env === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    statusCode,
    isOperational,
    userId: (req as any).user?.id,
    ip: req.ip || req.socket.remoteAddress,
  });

  const message = sanitizeErrorMessage(err, statusCode);

  // Response format
  const response: any = {
    error: message,
    errorId, // Always include for support tickets
  };

  // CRITICAL: Only show stack traces in development
  // NOT in staging or production
  if (config.env === 'development') {
    response.stack = err.stack;
    response.details = err.message;
  }

  res.status(statusCode).json(response);
};

/**
 * Not Found (404) handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const errorId = randomBytes(8).toString('hex');
  
  logger.warn('Route not found', {
    errorId,
    path: req.path,
    method: req.method,
    ip: req.ip || req.socket.remoteAddress,
  });
  
  res.status(404).json({
    error: 'Not found',
    errorId,
  });
};

/**
 * Async error wrapper
 * Use this to wrap async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};