import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import { logger } from '../utils/logger';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]
});

// HTTP request counter
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Active connections gauge
const activeConnections = new client.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections'
});

// Database query duration
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
});

// Database connection pool
const dbPoolConnections = new client.Gauge({
  name: 'db_pool_connections',
  help: 'Number of database pool connections',
  labelNames: ['state'] // 'idle', 'active'
});

// Redis operations
const redisOperations = new client.Counter({
  name: 'redis_operations_total',
  help: 'Total number of Redis operations',
  labelNames: ['operation', 'status']
});

// Redis connection status
const redisConnectionStatus = new client.Gauge({
  name: 'redis_connection_status',
  help: 'Redis connection status (1 = connected, 0 = disconnected)'
});

// Auth attempts
const authAttempts = new client.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'] // type: 'login'|'register'|'refresh', status: 'success'|'failure'
});

// Rate limit hits
const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint']
});

// Telegram bot messages
const telegramMessages = new client.Counter({
  name: 'telegram_messages_total',
  help: 'Total number of Telegram messages',
  labelNames: ['direction', 'intent'] // direction: 'incoming'|'outgoing'
});

// Business metrics
const ticketsCreated = new client.Counter({
  name: 'tickets_created_total',
  help: 'Total number of tickets created',
  labelNames: ['category', 'priority']
});

const ticketsResolved = new client.Counter({
  name: 'tickets_resolved_total',
  help: 'Total number of tickets resolved',
  labelNames: ['category']
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestCounter);
register.registerMetric(activeConnections);
register.registerMetric(dbQueryDuration);
register.registerMetric(dbPoolConnections);
register.registerMetric(redisOperations);
register.registerMetric(redisConnectionStatus);
register.registerMetric(authAttempts);
register.registerMetric(rateLimitHits);
register.registerMetric(telegramMessages);
register.registerMetric(ticketsCreated);
register.registerMetric(ticketsResolved);

/**
 * Middleware to track HTTP request metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Increment active connections
  activeConnections.inc();
  
  // Capture response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode.toString();
    
    // Record metrics
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestCounter.inc({ method, route, status_code: statusCode });
    activeConnections.dec();
    
    // Log slow requests (> 1 second)
    if (duration > 1) {
      logger.warn('Slow request detected', {
        method,
        route,
        duration: `${duration.toFixed(3)}s`,
        statusCode
      });
    }
  });
  
  next();
};

/**
 * Endpoint to expose metrics for Prometheus scraping
 */
export const getMetrics = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', error);
    res.status(500).send('Failed to generate metrics');
  }
};

// Export individual metrics for use in other modules
export const metrics = {
  httpRequestDuration,
  httpRequestCounter,
  activeConnections,
  dbQueryDuration,
  dbPoolConnections,
  redisOperations,
  redisConnectionStatus,
  authAttempts,
  rateLimitHits,
  telegramMessages,
  ticketsCreated,
  ticketsResolved
};

export { register };
