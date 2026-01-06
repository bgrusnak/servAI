import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { logger } from './utils/logger';
import { db } from './db';

// Redis connection for BullMQ
const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

// Job processors
const processors = {
  // Excel import jobs
  'import:units': async (job: Job) => {
    logger.info('Processing units import', { jobId: job.id, data: job.data });
    // TODO: Implement Excel import logic
    await job.updateProgress(100);
    return { success: true, imported: 0 };
  },

  // Telegram message processing
  'telegram:message': async (job: Job) => {
    logger.info('Processing Telegram message', { jobId: job.id });
    // TODO: Implement Telegram message processing with Sonar
    await job.updateProgress(100);
    return { success: true };
  },

  // Invoice generation
  'billing:generate-invoices': async (job: Job) => {
    logger.info('Generating invoices', { jobId: job.id });
    // TODO: Implement invoice generation
    await job.updateProgress(100);
    return { success: true, generated: 0 };
  },

  // Notifications
  'notification:send': async (job: Job) => {
    logger.info('Sending notification', { jobId: job.id, data: job.data });
    // TODO: Implement notification sending
    await job.updateProgress(100);
    return { success: true };
  },

  // Cleanup jobs
  'cleanup:invites': async (job: Job) => {
    logger.info('Cleaning up expired invites', { jobId: job.id });
    const result = await db.query(
      'DELETE FROM invites WHERE expires_at < NOW() RETURNING id'
    );
    logger.info('Expired invites cleaned', { count: result.rowCount });
    return { success: true, deleted: result.rowCount || 0 };
  },

  'cleanup:audit-logs': async (job: Job) => {
    logger.info('Cleaning up old audit logs', { jobId: job.id });
    const result = await db.query(
      `DELETE FROM audit_logs 
       WHERE created_at < NOW() - INTERVAL '${config.retention.auditLogs} days' 
       RETURNING id`
    );
    logger.info('Old audit logs cleaned', { count: result.rowCount });
    return { success: true, deleted: result.rowCount || 0 };
  },
};

// Create workers for each queue
const workers: Worker[] = [];

Object.entries(processors).forEach(([queueName, processor]) => {
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      try {
        return await processor(job);
      } catch (error) {
        logger.error(`Job ${queueName} failed`, { jobId: job.id, error });
        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Job completed`, { queue: queueName, jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed`, { queue: queueName, jobId: job?.id, error: err.message });
  });

  workers.push(worker);
  logger.info(`Worker started for queue: ${queueName}`);
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map(w => w.close()));
  await connection.quit();
  await db.end();
  logger.info('Workers shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info(`Worker started with ${workers.length} queues`);
