import { Router } from 'express';
import { metrics } from '../monitoring/metrics';
import { db } from '../db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route GET /metrics
 * @desc Prometheus metrics endpoint
 * @access Public (should be restricted by firewall in production)
 */
router.get('/metrics', metrics.getMetricsHandler());

/**
 * @route GET /health
 * @desc Detailed health check
 * @access Public
 */
router.get('/health', async (req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  // Check database
  try {
    await db.query('SELECT 1');
    health.checks.database = { status: 'ok' };
  } catch (error) {
    health.checks.database = { status: 'error', error: String(error) };
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await redis.ping();
    health.checks.redis = { status: 'ok' };
  } catch (error) {
    health.checks.redis = { status: 'error', error: String(error) };
    // Redis failure is not critical (we have fallback)
    if (health.status === 'ok') {
      health.status = 'degraded';
    }
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  health.memory = {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
    rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * @route GET /health/liveness
 * @desc Kubernetes liveness probe
 * @access Public
 */
router.get('/health/liveness', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * @route GET /health/readiness
 * @desc Kubernetes readiness probe
 * @access Public
 */
router.get('/health/readiness', async (req, res) => {
  try {
    // Check database is ready
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({ status: 'not ready', error: String(error) });
  }
});

export default router;
