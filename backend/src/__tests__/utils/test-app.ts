import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import authRoutes from '../../routes/auth';
import metersRoutes from '../../routes/meters.routes';
import invoicesRoutes from '../../routes/invoices.routes';
import pollsRoutes from '../../routes/polls.routes';
import ticketsRoutes from '../../routes/tickets.routes';
import { errorHandler } from '../../middleware/errorHandler';

/**
 * Creates a test Express app with real routes for integration testing
 * 
 * This is NOT a mock - it uses actual route handlers.
 * However, it skips some middleware that requires external services:
 * - CSRF (skipped for testing convenience)
 * - Rate limiting (skipped to avoid test flakiness)
 * 
 * Authentication IS enabled and required for protected routes.
 */
export function createTestApp(dataSource?: DataSource): Express {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Skip CSRF in tests (would require session management)
  app.use((req, res, next) => {
    req.csrfToken = () => 'test-csrf-token';
    next();
  });

  // API routes (v1)
  const apiV1Router = express.Router();
  
  // Mount real routes with real authentication
  apiV1Router.use('/auth', authRoutes);
  apiV1Router.use('/', metersRoutes);
  apiV1Router.use('/', invoicesRoutes);
  apiV1Router.use('/', pollsRoutes);
  apiV1Router.use('/', ticketsRoutes);
  
  app.use('/api/v1', apiV1Router);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
