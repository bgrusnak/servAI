import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Global error handler middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Handle known application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err instanceof ValidationError && { errors: err.errors }),
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle TypeORM errors
  if (err.name === 'QueryFailedError') {
    // Don't expose internal DB errors
    logger.error('Database query failed', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });

    return res.status(500).json({
      success: false,
      error: 'Database operation failed',
    });
  }

  // Handle unexpected errors
  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    user: (req as any).user?.id,
  });

  // Don't expose internal error details in production
  const message =
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';

  res.status(500).json({
    success: false,
    error: message,
  });
}

/**
 * Async error wrapper
 * Catches errors from async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
