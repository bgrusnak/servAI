import { Request, Response, NextFunction } from 'express';

/**
 * Async handler wrapper to catch errors in async route handlers
 * Eliminates need for try-catch in every route
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
