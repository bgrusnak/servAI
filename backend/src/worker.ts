import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { logger } from './utils/logger';
import { db } from './db';
import { CONSTANTS } from './config/constants';

// Redis connection for BullMQ
const connection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

connection.on('error', (err) => {
  logger.error('Worker Redis connection error', { error: err });
});

connection.on('ready', () => {
  logger.info('Worker Redis connection ready');
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
    
    // Soft delete expired invites
    const deleted = await db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE invites 
         SET deleted_at = NOW()
         WHERE id IN (
           SELECT id FROM invites 
           WHERE expires_at < NOW() 
           AND is_active = true 
           AND deleted_at IS NULL
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id`
      );
      return result.rowCount || 0;
    });
    
    logger.info('Expired invites soft deleted', { count: deleted });
    return { success: true, deleted };
  },

  'cleanup:audit-logs': async (job: Job) => {
    logger.info('Cleaning up old audit logs', { jobId: job.id });
    
    // Soft delete old audit logs
    const result = await db.query(
      `UPDATE audit_logs 
       SET deleted_at = NOW()
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       AND deleted_at IS NULL
       RETURNING id`,
      [config.retention.auditLogs]
    );
    
    logger.info('Old audit logs soft deleted', { count: result.rowCount });
    return { success: true, deleted: result.rowCount || 0 };
  },
  
  'cleanup:telegram-messages': async (job: Job) => {
    logger.info('Cleaning up old telegram messages', { jobId: job.id });
    
    // Soft delete old telegram messages
    const result = await db.query(
      `UPDATE telegram_messages 
       SET deleted_at = NOW()
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       AND deleted_at IS NULL
       RETURNING id`,
      [CONSTANTS.TELEGRAM_MESSAGES_RETENTION_DAYS]
    );
    
    logger.info('Old telegram messages soft deleted', { count: result.rowCount });
    return { success: true, deleted: result.rowCount || 0 };
  },
  
  'cleanup:refresh-tokens': async (job: Job) => {
    logger.info('Cleaning up old refresh tokens', { jobId: job.id });
    
    // Soft delete old revoked refresh tokens (keep for audit trail)
    const result = await db.query(
      `UPDATE refresh_tokens 
       SET deleted_at = NOW()
       WHERE revoked_at < NOW() - INTERVAL '1 day' * $1
       AND deleted_at IS NULL
       RETURNING id`,
      [CONSTANTS.REFRESH_TOKENS_RETENTION_DAYS]
    );
    
    logger.info('Old refresh tokens soft deleted', { count: result.rowCount });
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
      connection: connection.duplicate(), // Each worker gets its own connection
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
