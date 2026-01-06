import 'reflect-metadata';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { telegramService } from './services/telegram.service';
import { websocketService } from './services/websocket.service';
import { AppDataSource } from './db/data-source';

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
import telegramRoutes from './routes/telegram';

// New routes
import metersRoutes from './routes/meters.routes';
import invoicesRoutes from './routes/invoices.routes';
import pollsRoutes from './routes/polls.routes';
import ticketsRoutes from './routes/tickets.routes';
import stripeRoutes from './routes/stripe.routes';
import uploadRoutes from './routes/upload.routes';

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: config.cors.credentials,
  })
);

// Static files for uploads
const uploadsDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Raw body for Stripe webhooks
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));

// Metrics collection
app.use(metricsMiddleware);

// Request logging
app.use(requestLogger);

// Monitoring endpoints (no /api prefix)
app.use('/', monitoringRoutes);

// API routes (v1)
const apiV1Router = express.Router();

// Auth & User Management
apiV1Router.use('/auth', authRoutes);
apiV1Router.use('/password-reset', passwordResetRoutes);
apiV1Router.use('/email-verification', emailVerificationRoutes);

// Organizations & Structure
apiV1Router.use('/companies', companyRoutes);
apiV1Router.use('/condos', condoRoutes);
apiV1Router.use('/buildings', buildingRoutes);
apiV1Router.use('/entrances', entranceRoutes);
apiV1Router.use('/units', unitRoutes);
apiV1Router.use('/invites', inviteRoutes);
apiV1Router.use('/residents', residentRoutes);

// Business Logic
apiV1Router.use('/', metersRoutes);         // /meters, /units/:id/meters
apiV1Router.use('/', invoicesRoutes);       // /invoices, /units/:id/invoices
apiV1Router.use('/', pollsRoutes);          // /polls
apiV1Router.use('/', ticketsRoutes);        // /tickets

// Integrations
apiV1Router.use('/', stripeRoutes);         // /stripe/payment-intent, /stripe/webhook
apiV1Router.use('/', uploadRoutes);         // /upload/document, /upload/meter-photo
apiV1Router.use('/telegram', telegramRoutes);

app.use('/api/v1', apiV1Router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize services
let servicesInitialized = false;

async function initializeServices() {
  if (servicesInitialized) return;
  
  try {
    // Initialize TypeORM
    await AppDataSource.initialize();
    logger.info('TypeORM DataSource initialized');
    
    // Initialize Telegram bot
    await telegramService.initialize();
    logger.info('Telegram bot initialized');
    
    // Initialize WebSocket server
    websocketService.initialize(httpServer);
    logger.info('WebSocket server initialized');
    
    servicesInitialized = true;
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully');
  
  try {
    await telegramService.shutdown();
    logger.info('Telegram bot stopped');
    
    await AppDataSource.destroy();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.warn('Forcing shutdown');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
if (require.main === module) {
  httpServer.listen(config.port, async () => {
    logger.info(`servAI Backend v${require('../package.json').version}`);
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Metrics: http://localhost:${config.port}/metrics`);
    logger.info(`Health: http://localhost:${config.port}/health`);
    logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
    logger.info(`Uploads: ${uploadsDir}`);
    
    // Initialize services after server starts
    await initializeServices();
  });
}

export { app, httpServer };
