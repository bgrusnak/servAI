import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { redis } from '../services/redis';
import checkDiskSpace from 'check-disk-space';
import os from 'os';
import { logger } from '../utils/logger';

const router = Router();

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'degraded' | 'failed';
      latency?: number;
      error?: string;
    };
    redis: {
      status: 'ok' | 'degraded' | 'failed';
      latency?: number;
      error?: string;
    };
    disk: {
      status: 'ok' | 'warning' | 'critical';
      free: number;
      total: number;
      percentUsed: number;
    };
    memory: {
      status: 'ok' | 'warning' | 'critical';
      used: number;
      total: number;
      percentUsed: number;
      heapUsed: number;
      heapTotal: number;
    };
    cpu: {
      status: 'ok' | 'warning' | 'critical';
      loadAverage: number[];
      cores: number;
    };
  };
}

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<HealthCheck['checks']['database']> {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;
    
    return {
      status: latency < 100 ? 'ok' : 'degraded',
      latency
    };
  } catch (error: any) {
    logger.error('Database health check failed', error);
    return {
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Check Redis connectivity and performance
 */
async function checkRedis(): Promise<HealthCheck['checks']['redis']> {
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    
    return {
      status: latency < 50 ? 'ok' : 'degraded',
      latency
    };
  } catch (error: any) {
    logger.error('Redis health check failed', error);
    return {
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Check disk space
 */
async function checkDisk(): Promise<HealthCheck['checks']['disk']> {
  try {
    const diskSpace = await checkDiskSpace('/');
    const percentUsed = ((diskSpace.size - diskSpace.free) / diskSpace.size) * 100;
    
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    if (diskSpace.free < 1_000_000_000) { // < 1GB
      status = 'critical';
    } else if (percentUsed > 80) {
      status = 'warning';
    }
    
    return {
      status,
      free: diskSpace.free,
      total: diskSpace.size,
      percentUsed: Math.round(percentUsed * 100) / 100
    };
  } catch (error: any) {
    logger.error('Disk health check failed', error);
    return {
      status: 'critical',
      free: 0,
      total: 0,
      percentUsed: 100
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): HealthCheck['checks']['memory'] {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const percentUsed = (usedMem / totalMem) * 100;
  
  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (percentUsed > 90) {
    status = 'critical';
  } else if (percentUsed > 80) {
    status = 'warning';
  }
  
  return {
    status,
    used: usedMem,
    total: totalMem,
    percentUsed: Math.round(percentUsed * 100) / 100,
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal
  };
}

/**
 * Check CPU load
 */
function checkCPU(): HealthCheck['checks']['cpu'] {
  const loadAvg = os.loadavg();
  const cores = os.cpus().length;
  const loadPerCore = loadAvg[0] / cores;
  
  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (loadPerCore > 0.9) {
    status = 'critical';
  } else if (loadPerCore > 0.7) {
    status = 'warning';
  }
  
  return {
    status,
    loadAverage: loadAvg,
    cores
  };
}

/**
 * Full health check endpoint
 * GET /api/v1/health
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const [database, redisCheck] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);
    
    const disk = await checkDisk();
    const memory = checkMemory();
    const cpu = checkCPU();
    
    const checks = { database, redis: redisCheck, disk, memory, cpu };
    
    // Determine overall status
    const criticalFailures = Object.values(checks).some(
      (check: any) => check.status === 'failed' || check.status === 'critical'
    );
    const degraded = Object.values(checks).some(
      (check: any) => check.status === 'degraded' || check.status === 'warning'
    );
    
    const status = criticalFailures ? 'unhealthy' : degraded ? 'degraded' : 'healthy';
    const httpStatus = criticalFailures ? 503 : 200;
    
    const healthCheck: HealthCheck = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks
    };
    
    res.status(httpStatus).json(healthCheck);
  } catch (error: any) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Readiness probe - checks if service is ready to accept traffic
 * GET /api/v1/health/ready
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const [database, redisCheck] = await Promise.all([
      checkDatabase(),
      checkRedis()
    ]);
    
    const ready = database.status !== 'failed' && redisCheck.status !== 'failed';
    
    if (ready) {
      res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        checks: { database, redis: redisCheck }
      });
    }
  } catch (error: any) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Liveness probe - checks if service is alive (simple ping)
 * GET /api/v1/health/live
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
