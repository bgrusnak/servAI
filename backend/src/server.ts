import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { db } from './db';
import { runMigrations } from './db/migrate';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { apiRouter } from './routes';

const app: Application = express();

// CORS - proper configuration
const corsOptions = {
  origin: config.env === 'production' 
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : '*',
  credentials: true,
};

// Security
app.use(helmet());
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter BEFORE logger (don't log spam)
app.use(rateLimiter);

// Then logging
app.use(requestLogger);

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealthy = await db.healthCheck();
    res.status(dbHealthy ? 200 : 503).json({
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// Readiness check (includes migrations)
app.get('/ready', async (req, res) => {
  try {
    const dbHealthy = await db.healthCheck();
    
    // Check if migrations table exists
    const migrationsExist = await db.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations')"
    );
    
    const isReady = dbHealthy && migrationsExist.rows[0]?.exists;
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      database: dbHealthy,
      migrations: migrationsExist.rows[0]?.exists,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

// API routes
app.use('/api', apiRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal');
  try {
    await db.end();
    logger.info('Server shut down gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize and start
async function start() {
  try {
    logger.info('Starting servAI backend...');
    
    // Run migrations automatically
    logger.info('Running database migrations...');
    await runMigrations();
    logger.info('Database migrations completed');
    
    // Start server
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`servAI backend started on port ${PORT}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Ready check: http://localhost:${PORT}/ready`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export { app };
