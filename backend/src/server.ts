import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';

// Import routes
import authRoutes from './routes/auth';
import companyRoutes from './routes/companies';
import condoRoutes from './routes/condos';
import buildingRoutes from './routes/buildings';
import entranceRoutes from './routes/entrances';
import unitRoutes from './routes/units';
import inviteRoutes from './routes/invites';
import residentRoutes from './routes/residents';
import passwordResetRoutes from './routes/password-reset';
import emailVerificationRoutes from './routes/email-verification';
import monitoringRoutes from './routes/monitoring';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  })
);

// Request parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Metrics collection
app.use(metricsMiddleware);

// Request logging
app.use(requestLogger);

// Monitoring endpoints (no /api prefix)
app.use('/', monitoringRoutes);

// API routes (v1)
const apiV1Router = express.Router();

apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/companies', companyRoutes);
apiV1Router.use('/condos', condoRoutes);
apiV1Router.use('/buildings', buildingRoutes);
apiV1Router.use('/entrances', entranceRoutes);
apiV1Router.use('/units', unitRoutes);
apiV1Router.use('/invites', inviteRoutes);
apiV1Router.use('/residents', residentRoutes);
apiV1Router.use('/password-reset', passwordResetRoutes);
apiV1Router.use('/email-verification', emailVerificationRoutes);

app.use('/api/v1', apiV1Router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Metrics available at http://localhost:${config.port}/metrics`);
  });
}

export { app };
