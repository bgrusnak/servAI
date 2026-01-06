import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { logger } from './utils/logger';
import { db } from './db';
import { redis } from './utils/redis';
import { runMigrations } from './db/migrate';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { apiRouter } from './routes';

const app: Application = express();

// Request ID middleware
app.use((req: any, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// CORS - proper configuration
const corsOptions = {
  origin: config.env === 'production'
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Context'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400,
};

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(cors(corsOptions));

// Body parsing - FIX NEW-009: Reduced from 10MB to 1MB for API requests
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiter BEFORE logger
app.use(rateLimiter);

// Then logging
app.use(requestLogger);

// Health check
app.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.3.1',
    environment: config.env,
  });
});

// Readiness check
app.get('/ready', async (req, res) => {
  try {
    const checks = await Promise.all([
      db.healthCheck().then(result => ({ name: 'database', healthy: result })),
      redis.healthCheck().then(result => ({ name: 'redis', healthy: result })),
      db.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations')")
        .then(result => ({ name: 'migrations', healthy: result.rows[0]?.exists || false })),
    ]);

    const allHealthy = checks.every(check => check.healthy);
    const checkResults = checks.reduce((acc, check) => {
      acc[check.name] = check.healthy;
      return acc;
    }, {} as Record<string, boolean>);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: checkResults,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

// API routes with versioning
app.use('/api/v1', apiRouter);

// Redirect /api to /api/v1
app.use('/api', (req, res, next) => {
  if (req.path === '/' || req.path === '') {
    return res.status(200).json({
      message: 'servAI API',
      version: '0.3.1',
      availableVersions: ['v1'],
      documentation: '/api/v1/docs',
    });
  }
  req.url = `/v1${req.url}`;
  apiRouter(req, res, next);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    suggestion: 'Try /api/v1 or check /health endpoint',
  });
});

// Error handler
app.use(errorHandler);

// Graceful shutdown
const shutdown = async () => {
  logger.info('Received shutdown signal');
  try {
    await redis.close();
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

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', { reason });
  if (config.env === 'development') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

async function start() {
  try {
    logger.info('Starting servAI backend...');
    
    logger.info('Running database migrations...');
    await runMigrations();
    logger.info('Database migrations completed');
    
    const PORT = config.port;
    app.listen(PORT, () => {
      logger.info(`servAI backend v0.3.1 started on port ${PORT}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`API v1: http://localhost:${PORT}/api/v1`);
      
      if (config.env === 'production') {
        logger.info('🚀 Production mode enabled');
      } else {
        logger.warn('⚠️  Development mode');
      }
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export { app };
