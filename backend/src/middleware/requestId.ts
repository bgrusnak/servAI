import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include id
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Request ID middleware for distributed tracing (fixes MED-003)
 * Adds unique ID to each request for logging and debugging
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID from header or generate new one
  req.id = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Set response header
  res.setHeader('X-Request-ID', req.id);
  
  next();
}
