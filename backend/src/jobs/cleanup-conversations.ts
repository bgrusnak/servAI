/**
 * Background job: Clean up old conversations
 * 
 * Removes conversations older than 30 days to prevent database bloat
 * Should be run daily via cron or scheduler
 */

import { pool } from '../db';
import { logger } from '../utils/logger';

const RETENTION_DAYS = parseInt(process.env.CONVERSATION_RETENTION_DAYS || '30');

export async function cleanupOldConversations(): Promise<void> {
  try {
    const result = await pool.query(
      `DELETE FROM conversations 
       WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
       RETURNING id`,
    );

    const deletedCount = result.rowCount || 0;
    
    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old conversations older than ${RETENTION_DAYS} days`);
    }
  } catch (error) {
    logger.error('Error cleaning up old conversations:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  cleanupOldConversations()
    .then(() => {
      logger.info('Cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Cleanup failed:', error);
      process.exit(1);
    });
}
