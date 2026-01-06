import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Sanitize error messages for production
function sanitizeErrorMessage(err: Error | AppError, statusCode: number): string {
  if (config.env === 'production' && statusCode >= 500) {
    // Don't leak internal details in production
    return 'Internal server error';
  }
  
  if (config.env === 'production' && err.message.includes('violates')) {
    // Don't leak database constraint details
    return 'Invalid request';
  }
  
  return err.message;
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

  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
    isOperational,
  });

  const message = sanitizeErrorMessage(err, statusCode);

  res.status(statusCode).json({
    error: message,
    ...(config.env === 'development' && { 
      stack: err.stack,
      details: err.message 
    }),
  });
};
