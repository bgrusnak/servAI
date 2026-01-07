import { Router } from 'express';
import { getMetrics } from '../middleware/metrics';
import healthRouter from './health';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @route GET /metrics
 * @desc Prometheus metrics endpoint
 * @access Public (should be restricted by firewall in production)
 * 
 * Usage:
 * - Prometheus scraping: prometheus.yml -> scrape_configs
 * - Manual check: curl http://localhost:3000/metrics
 * 
 * Metrics included:
 * - Default Node.js metrics (CPU, memory, GC, event loop)
 * - HTTP request duration & count
 * - Database query duration & pool stats
 * - Redis operations & connection status
 * - Authentication attempts
 * - Rate limit hits
 * - Telegram bot messages
 * - Business metrics (tickets, invoices, etc.)
 */
router.get('/metrics', getMetrics);

/**
 * Health check endpoints
 * 
 * GET /health - Full health check with all components
 * GET /health/live - Liveness probe (is process alive?)
 * GET /health/ready - Readiness probe (can accept traffic?)
 * 
 * Usage:
 * - Kubernetes probes
 * - Docker healthcheck
 * - Uptime monitoring services (Uptime Robot, Better Uptime, etc.)
 * - Load balancer health checks
 */
router.use('/health', healthRouter);

/**
 * @route GET /ping
 * @desc Simple ping endpoint (minimal overhead)
 * @access Public
 */
router.get('/ping', (req, res) => {
  res.send('pong');
});

export default router;
