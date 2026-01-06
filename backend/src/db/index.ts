import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.pool.max,
      min: config.database.pool.min,
      idleTimeoutMillis: config.database.pool.idle,
      connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    this.pool.on('connect', (client) => {
      logger.debug('New database connection established');
      
      // Auto-release client after 30 seconds if not released manually
      const timeout = setTimeout(() => {
        logger.warn('Client held for too long, forcing release');
        client.release();
      }, 30000);
      
      client.once('release', () => {
        clearTimeout(timeout);
      });
    });
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        logger.warn('Slow query detected', { text: text.substring(0, 100), duration, rows: result.rowCount });
      } else {
        logger.debug('Query executed', { duration, rows: result.rowCount });
      }
      
      return result;
    } catch (error) {
      logger.error('Database query error', { text: text.substring(0, 100), error });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as time, version() as version');
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }
}

export const db = new Database();
