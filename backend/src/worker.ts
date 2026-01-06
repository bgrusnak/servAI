import { Worker, Job, Queue } from 'bullmq';
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

  // Cleanup jobs with batching
  'cleanup:invites': async (job: Job) => {
    logger.info('Cleaning up expired invites', { jobId: job.id });
    
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      const deleted = await db.transaction(async (client) => {
        const result = await client.query(
          `UPDATE invites 
           SET deleted_at = NOW()
           WHERE id IN (
             SELECT id FROM invites 
             WHERE expires_at < NOW() 
             AND is_active = true 
             AND deleted_at IS NULL
             LIMIT $1
             FOR UPDATE SKIP LOCKED
           )
           RETURNING id`,
          [CONSTANTS.CLEANUP_BATCH_SIZE]
        );
        return result.rowCount || 0;
      });
      
      totalDeleted += deleted;
      hasMore = deleted >= CONSTANTS.CLEANUP_BATCH_SIZE;
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
      }
    }
    
    logger.info('Expired invites soft deleted', { count: totalDeleted });
    return { success: true, deleted: totalDeleted };
  },

  'cleanup:audit-logs': async (job: Job) => {
    logger.info('Cleaning up old audit logs', { jobId: job.id });
    
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      const result = await db.query(
        `UPDATE audit_logs 
         SET deleted_at = NOW()
         WHERE id IN (
           SELECT id FROM audit_logs
           WHERE created_at < NOW() - INTERVAL '1 day' * $1
           AND deleted_at IS NULL
           LIMIT $2
         )
         RETURNING id`,
        [config.retention.auditLogs, CONSTANTS.CLEANUP_BATCH_SIZE]
      );
      
      const deleted = result.rowCount || 0;
      totalDeleted += deleted;
      hasMore = deleted >= CONSTANTS.CLEANUP_BATCH_SIZE;
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info('Old audit logs soft deleted', { count: totalDeleted });
    return { success: true, deleted: totalDeleted };
  },
  
  'cleanup:telegram-messages': async (job: Job) => {
    logger.info('Cleaning up old telegram messages', { jobId: job.id });
    
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      const result = await db.query(
        `UPDATE telegram_messages 
         SET deleted_at = NOW()
         WHERE id IN (
           SELECT id FROM telegram_messages
           WHERE created_at < NOW() - INTERVAL '1 day' * $1
           AND deleted_at IS NULL
           LIMIT $2
         )
         RETURNING id`,
        [CONSTANTS.TELEGRAM_MESSAGES_RETENTION_DAYS, CONSTANTS.CLEANUP_BATCH_SIZE]
      );
      
      const deleted = result.rowCount || 0;
      totalDeleted += deleted;
      hasMore = deleted >= CONSTANTS.CLEANUP_BATCH_SIZE;
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info('Old telegram messages soft deleted', { count: totalDeleted });
    return { success: true, deleted: totalDeleted };
  },
  
  'cleanup:refresh-tokens': async (job: Job) => {
    logger.info('Cleaning up old refresh tokens', { jobId: job.id });
    
    let totalDeleted = 0;
    let hasMore = true;
    
    while (hasMore) {
      const result = await db.query(
        `UPDATE refresh_tokens 
         SET deleted_at = NOW()
         WHERE id IN (
           SELECT id FROM refresh_tokens
           WHERE revoked_at < NOW() - INTERVAL '1 day' * $1
           AND deleted_at IS NULL
           LIMIT $2
         )
         RETURNING id`,
        [CONSTANTS.REFRESH_TOKENS_RETENTION_DAYS, CONSTANTS.CLEANUP_BATCH_SIZE]
      );
      
      const deleted = result.rowCount || 0;
      totalDeleted += deleted;
      hasMore = deleted >= CONSTANTS.CLEANUP_BATCH_SIZE;
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info('Old refresh tokens soft deleted', { count: totalDeleted });
    return { success: true, deleted: totalDeleted };
  },
};

// Create workers and queues
const workers: Worker[] = [];
const queues: Queue[] = [];

Object.entries(processors).forEach(([queueName, processor]) => {
  // Create queue for scheduling
  const queue = new Queue(queueName, { connection: connection.duplicate() });
  queues.push(queue);

  // Create worker
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
      connection: connection.duplicate(),
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

// Schedule cleanup jobs
async function scheduleCleanupJobs() {
  const cleanupQueue = queues.find(q => q.name === 'cleanup:invites');
  
  if (cleanupQueue) {
    // Schedule cleanup jobs to run daily at 2 AM
    await cleanupQueue.add('cleanup-invites', {}, {
      repeat: { pattern: '0 2 * * *' }, // Cron: every day at 2 AM
      jobId: 'cleanup-invites-daily',
    });
  }

  const auditQueue = queues.find(q => q.name === 'cleanup:audit-logs');
  if (auditQueue) {
    await auditQueue.add('cleanup-audit', {}, {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'cleanup-audit-daily',
    });
  }

  const telegramQueue = queues.find(q => q.name === 'cleanup:telegram-messages');
  if (telegramQueue) {
    await telegramQueue.add('cleanup-telegram', {}, {
      repeat: { pattern: '0 4 * * *' },
      jobId: 'cleanup-telegram-daily',
    });
  }

  const tokensQueue = queues.find(q => q.name === 'cleanup:refresh-tokens');
  if (tokensQueue) {
    await tokensQueue.add('cleanup-tokens', {}, {
      repeat: { pattern: '0 5 * * *' },
      jobId: 'cleanup-tokens-daily',
    });
  }

  logger.info('Cleanup jobs scheduled');
}

// Schedule jobs after workers start
scheduleCleanupJobs().catch(err => {
  logger.error('Failed to schedule cleanup jobs', { error: err });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map(w => w.close()));
  await Promise.all(queues.map(q => q.close()));
  await connection.quit();
  await db.end();
  logger.info('Workers shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info(`Worker started with ${workers.length} queues and cleanup jobs scheduled`);
