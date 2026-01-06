import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

class Database {
  private pool: Pool;
  private activeClients: Map<PoolClient, { acquiredAt: number; stack: string }> = new Map();

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
    });
    
    // Monitor for connection leaks every 30 seconds
    setInterval(() => {
      this.checkForLeakedConnections();
    }, 30000);
  }

  private checkForLeakedConnections() {
    const now = Date.now();
    for (const [client, info] of this.activeClients.entries()) {
      const heldFor = now - info.acquiredAt;
      if (heldFor > CONSTANTS.DB_CLIENT_TIMEOUT_MS) {
        logger.error('Connection leak detected', {
          heldForMs: heldFor,
          stack: info.stack,
        });
        // Force release
        this.activeClients.delete(client);
        try {
          client.release();
        } catch (err) {
          logger.error('Error releasing leaked client', { error: err });
        }
      }
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      if (duration > CONSTANTS.DB_SLOW_QUERY_THRESHOLD_MS) {
        logger.warn('Slow query detected', { 
          query: text.substring(0, 100), 
          duration, 
          rows: result.rowCount 
        });
      } else {
        logger.debug('Query executed', { duration, rows: result.rowCount });
      }
      
      return result;
    } catch (error) {
      logger.error('Database query error', { query: text.substring(0, 100), error });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    const stack = new Error().stack || 'no stack';
    
    this.activeClients.set(client, {
      acquiredAt: Date.now(),
      stack,
    });
    
    // Wrap release to clean up tracking
    const originalRelease = client.release.bind(client);
    client.release = ((err?: Error | boolean) => {
      this.activeClients.delete(client);
      return originalRelease(err);
    }) as any;
    
    return client;
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    let committed = false;
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      committed = true;
      return result;
    } catch (error) {
      if (!committed) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Error during ROLLBACK', { rollbackError });
        }
      }
      logger.error('Transaction failed', { error });
      throw error;
    } finally {
      try {
        client.release();
      } catch (releaseError) {
        logger.error('Error releasing client after transaction', { releaseError });
      }
    }
  }

  async withAdvisoryLock<T>(lockId: number, callback: () => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      // Acquire advisory lock
      const lockResult = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );
      
      if (!lockResult.rows[0]?.acquired) {
        throw new Error(`Failed to acquire advisory lock ${lockId}`);
      }
      
      logger.debug('Advisory lock acquired', { lockId });
      
      try {
        return await callback();
      } finally {
        // Release advisory lock
        await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
        logger.debug('Advisory lock released', { lockId });
      }
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    // Release all tracked clients
    for (const [client] of this.activeClients.entries()) {
      try {
        client.release();
      } catch (err) {
        logger.error('Error releasing client during shutdown', { error: err });
      }
    }
    this.activeClients.clear();
    
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
