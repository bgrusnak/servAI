import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
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

// Health check - simple liveness probe
app.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Readiness check - comprehensive check of all dependencies
app.get('/ready', async (req, res) => {
  try {
    const checks = await Promise.all([
      // Database
      db.healthCheck().then(result => ({ name: 'database', healthy: result })),
      
      // Redis
      redis.healthCheck().then(result => ({ name: 'redis', healthy: result })),
      
      // Migrations
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

// Integration health checks (for monitoring)
app.get('/health/integrations', async (req, res) => {
  const checks: Record<string, { healthy: boolean; message?: string }> = {};
  
  // Telegram Bot API (optional - only if token is configured)
  if (config.telegram.botToken) {
    try {
      const axios = require('axios');
      const response = await axios.get(
        `https://api.telegram.org/bot${config.telegram.botToken}/getMe`,
        { timeout: 5000 }
      );
      checks.telegram = { healthy: response.data.ok };
    } catch (error) {
      checks.telegram = { healthy: false, message: 'Connection failed' };
    }
  }
  
  // Perplexity API (optional - only if key is configured)
  if (config.perplexity.apiKey) {
    try {
      const axios = require('axios');
      await axios.post(
        'https://api.perplexity.ai/chat/completions',
        { model: config.perplexity.model, messages: [{ role: 'user', content: 'test' }] },
        { 
          headers: { 'Authorization': `Bearer ${config.perplexity.apiKey}` },
          timeout: 5000 
        }
      );
      checks.perplexity = { healthy: true };
    } catch (error: any) {
      // 401/403 means API key is invalid, but service is up
      checks.perplexity = { 
        healthy: error.response?.status === 401 || error.response?.status === 403,
        message: error.response?.status ? `HTTP ${error.response.status}` : 'Connection failed'
      };
    }
  }
  
  // Stripe API (optional - only if key is configured)
  if (config.stripe.secretKey) {
    try {
      const axios = require('axios');
      await axios.get('https://api.stripe.com/v1/balance', {
        headers: { 'Authorization': `Bearer ${config.stripe.secretKey}` },
        timeout: 5000
      });
      checks.stripe = { healthy: true };
    } catch (error: any) {
      checks.stripe = { 
        healthy: error.response?.status === 401,
        message: error.response?.status ? `HTTP ${error.response.status}` : 'Connection failed'
      };
    }
  }
  
  const allHealthy = Object.values(checks).every(c => c.healthy);
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    integrations: checks,
  });
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
      logger.info(`Integrations check: http://localhost:${PORT}/health/integrations`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();

export { app };
