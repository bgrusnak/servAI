import { Worker, Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config';
import { logger } from './utils/logger';
import { db } from './db';
import { CONSTANTS } from './config/constants';
import { perplexityService } from './services/perplexity.service';
import * as XLSX from 'xlsx';

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

// ==========================================
// JOB PROCESSORS
// ==========================================

const processors = {
  // ==========================================
  // EXCEL IMPORT
  // ==========================================
  'import:units': async (job: Job) => {
    logger.info('Processing units import', { jobId: job.id, data: job.data });
    
    try {
      const { fileBuffer, condoId, buildingId, userId } = job.data;
      
      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      
      let imported = 0;
      let errors = 0;
      const errorDetails: string[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row: any = rows[i];
        
        try {
          // Validate required fields
          if (!row.number || !row.area) {
            throw new Error(`Row ${i + 2}: Missing required fields (number, area)`);
          }
          
          // Get or create unit type
          let unitTypeId;
          const typeCode = row.type || 'residential';
          const typeResult = await db.query(
            'SELECT id FROM unit_types WHERE code = $1 LIMIT 1',
            [typeCode]
          );
          
          if (typeResult.rows.length > 0) {
            unitTypeId = typeResult.rows[0].id;
          } else {
            const newType = await db.query(
              'INSERT INTO unit_types (name, code) VALUES ($1, $2) RETURNING id',
              [typeCode, typeCode]
            );
            unitTypeId = newType.rows[0].id;
          }
          
          // Insert or update unit
          await db.query(
            `INSERT INTO units (
              condo_id, building_id, unit_type_id, number, floor, area, rooms,
              cadastral_number, owner_full_name, owner_phone, owner_email
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (building_id, number) DO UPDATE SET
              floor = EXCLUDED.floor,
              area = EXCLUDED.area,
              rooms = EXCLUDED.rooms,
              cadastral_number = EXCLUDED.cadastral_number,
              owner_full_name = EXCLUDED.owner_full_name,
              owner_phone = EXCLUDED.owner_phone,
              owner_email = EXCLUDED.owner_email,
              updated_at = NOW()`,
            [
              condoId,
              buildingId,
              unitTypeId,
              row.number,
              row.floor || null,
              row.area,
              row.rooms || null,
              row.cadastral_number || null,
              row.owner_full_name || null,
              row.owner_phone || null,
              row.owner_email || null
            ]
          );
          
          imported++;
          await job.updateProgress(Math.round((i + 1) / rows.length * 100));
        } catch (err: any) {
          errors++;
          errorDetails.push(err.message);
          logger.error(`Failed to import row ${i + 2}`, { error: err.message });
        }
      }
      
      logger.info('Units import completed', { imported, errors });
      return { success: true, imported, errors, errorDetails };
    } catch (error: any) {
      logger.error('Units import failed', { error: error.message });
      throw error;
    }
  },

  // ==========================================
  // TELEGRAM MESSAGE PROCESSING
  // ==========================================
  'telegram:message': async (job: Job) => {
    logger.info('Processing Telegram message', { jobId: job.id });
    
    try {
      const { telegramUserId, message } = job.data;
      
      // Get conversation history
      const historyResult = await db.query(
        `SELECT role, content FROM conversations 
         WHERE telegram_user_id = $1 
         ORDER BY created_at DESC LIMIT 20`,
        [telegramUserId]
      );
      const history = historyResult.rows.reverse();
      
      // Get context
      const contextResult = await db.query(
        'SELECT * FROM user_context WHERE telegram_user_id = $1',
        [telegramUserId]
      );
      const context = contextResult.rows[0] || {};
      
      // Get language
      const userResult = await db.query(
        'SELECT language_code FROM telegram_users WHERE id = $1',
        [telegramUserId]
      );
      const languageCode = userResult.rows[0]?.language_code || 'ru';
      
      // Process with AI
      const systemPrompt = await getSystemPrompt(languageCode);
      const intents = await getIntents();
      
      const result = await perplexityService.processMessage(
        message,
        history,
        context.conversation_summary || '',
        systemPrompt,
        intents,
        languageCode
      );
      
      await job.updateProgress(100);
      return { success: true, result };
    } catch (error: any) {
      logger.error('Telegram message processing failed', { error: error.message });
      throw error;
    }
  },

  // ==========================================
  // INVOICE GENERATION
  // ==========================================
  'billing:generate-invoices': async (job: Job) => {
    logger.info('Generating invoices', { jobId: job.id });
    
    try {
      const { condoId, periodStart, periodEnd } = job.data;
      
      // Get all active units in condo
      const unitsResult = await db.query(
        `SELECT u.id, u.number, u.area, u.unit_type_id,
                b.name as building_name, c.name as condo_name
         FROM units u
         JOIN buildings b ON u.building_id = b.id
         JOIN condos c ON u.condo_id = c.id
         WHERE u.condo_id = $1 AND u.is_active = true AND u.deleted_at IS NULL`,
        [condoId]
      );
      
      let generated = 0;
      
      for (const unit of unitsResult.rows) {
        // Generate unique invoice number
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(generated + 1).padStart(6, '0')}`;
        
        // Calculate tariffs (simplified - should be configurable)
        const maintenanceRate = 35; // RUB per m²
        const heatingRate = 1500; // Fixed per month
        
        const maintenanceAmount = unit.area * maintenanceRate;
        const heatingAmount = heatingRate;
        
        // Get meter readings for the period
        const readingsResult = await db.query(
          `SELECT mr.*, mt.code, mt.unit
           FROM meter_readings mr
           JOIN meters m ON mr.meter_id = m.id
           JOIN meter_types mt ON m.meter_type_id = mt.id
           WHERE m.unit_id = $1 
             AND mr.reading_date BETWEEN $2 AND $3
             AND mr.deleted_at IS NULL
           ORDER BY mt.code, mr.reading_date DESC`,
          [unit.id, periodStart, periodEnd]
        );
        
        // Create invoice
        const subtotal = maintenanceAmount + heatingAmount;
        const taxAmount = 0; // No VAT for residential
        const totalAmount = subtotal + taxAmount;
        
        const invoiceResult = await db.query(
          `INSERT INTO invoices (
            invoice_number, unit_id, condo_id, period_start, period_end,
            issue_date, due_date, status, subtotal, tax_amount, total_amount
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days',
            'issued', $6, $7, $8)
          RETURNING id`,
          [
            invoiceNumber, unit.id, condoId, periodStart, periodEnd,
            subtotal, taxAmount, totalAmount
          ]
        );
        
        const invoiceId = invoiceResult.rows[0].id;
        
        // Add invoice items
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoiceId, 'Содержание и ремонт', unit.area, maintenanceRate, maintenanceAmount]
        );
        
        await db.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoiceId, 'Отопление', 1, heatingAmount, heatingAmount]
        );
        
        // Add meter readings if any
        for (const reading of readingsResult.rows) {
          const rate = getMeterRate(reading.code); // Get tariff rate
          const prevReading = await getPreviousReading(reading.meter_id, periodStart);
          const consumption = reading.value - (prevReading?.value || 0);
          const amount = consumption * rate;
          
          await db.query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, meter_reading_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, getMeterName(reading.code), consumption, rate, amount, reading.id]
          );
        }
        
        generated++;
        await job.updateProgress(Math.round(generated / unitsResult.rows.length * 100));
      }
      
      logger.info('Invoices generated', { count: generated });
      return { success: true, generated };
    } catch (error: any) {
      logger.error('Invoice generation failed', { error: error.message });
      throw error;
    }
  },

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  'notification:send': async (job: Job) => {
    logger.info('Sending notification', { jobId: job.id, data: job.data });
    
    try {
      const { userId, type, title, message, data } = job.data;
      
      // Get user's notification preferences
      const userResult = await db.query(
        'SELECT telegram_id, email FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const user = userResult.rows[0];
      
      // Send via Telegram if available
      if (user.telegram_id) {
        // Import telegram service dynamically to avoid circular dependency
        const { telegramService } = await import('./services/telegram.service');
        await telegramService.sendMessage(
          user.telegram_id,
          `*${title}*\n\n${message}`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // TODO: Send via email if enabled
      // if (user.email && user.email_notifications_enabled) {
      //   await emailService.send(user.email, title, message);
      // }
      
      // Save notification to DB for history
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, data, sent_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, type, title, message, JSON.stringify(data || {})]
      );
      
      await job.updateProgress(100);
      return { success: true };
    } catch (error: any) {
      logger.error('Notification sending failed', { error: error.message });
      throw error;
    }
  },

  // ==========================================
  // CLEANUP JOBS
  // ==========================================
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
        await new Promise(resolve => setTimeout(resolve, 100));
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

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function getSystemPrompt(languageCode: string): Promise<string> {
  const result = await db.query(
    `SELECT content FROM system_prompts 
     WHERE is_active = true AND language_code = $1 
     ORDER BY version DESC LIMIT 1`,
    [languageCode]
  );
  return result.rows[0]?.content || '';
}

async function getIntents(): Promise<any[]> {
  const result = await db.query(
    `SELECT code, name, description, examples, parameters 
     FROM intents 
     WHERE is_active = true AND deleted_at IS NULL 
     ORDER BY priority DESC, code`
  );
  return result.rows;
}

function getMeterRate(code: string): number {
  // Simplified tariff rates (should be configurable per condo)
  const rates: Record<string, number> = {
    cold_water: 42.5,
    hot_water: 156.0,
    electricity: 5.38,
    gas: 7.25,
    heating: 2100.0
  };
  return rates[code] || 0;
}

function getMeterName(code: string): string {
  const names: Record<string, string> = {
    cold_water: 'Холодная вода',
    hot_water: 'Горячая вода',
    electricity: 'Электроэнергия',
    gas: 'Газ',
    heating: 'Отопление'
  };
  return names[code] || code;
}

async function getPreviousReading(meterId: string, beforeDate: string): Promise<any> {
  const result = await db.query(
    `SELECT value FROM meter_readings
     WHERE meter_id = $1 AND reading_date < $2
     AND deleted_at IS NULL
     ORDER BY reading_date DESC LIMIT 1`,
    [meterId, beforeDate]
  );
  return result.rows[0] || null;
}

// ==========================================
// CREATE WORKERS AND QUEUES
// ==========================================

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

// ==========================================
// SCHEDULE CLEANUP JOBS
// ==========================================

async function scheduleCleanupJobs() {
  const cleanupQueue = queues.find(q => q.name === 'cleanup:invites');
  
  if (cleanupQueue) {
    await cleanupQueue.add('cleanup-invites', {}, {
      repeat: { pattern: '0 2 * * *' }, // Daily at 2 AM
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

scheduleCleanupJobs().catch(err => {
  logger.error('Failed to schedule cleanup jobs', { error: err });
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

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

// Export queues for use in other services
export { queues };
