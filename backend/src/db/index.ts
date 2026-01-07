import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger, sanitizeLogInput } from '../utils/logger';
import { CONSTANTS } from '../config/constants';

/**
 * CRITICAL: Sanitize SQL query for logging
 * Removes sensitive data while preserving query structure
 */
function sanitizeQueryForLogging(query: string): string {
  // Replace string literals with placeholder
  let sanitized = query.replace(/'[^']*'/g, "'[REDACTED]'");
  
  // Replace number literals in sensitive contexts
  const sensitivePatterns = [
    /password\s*=\s*\d+/gi,
    /token\s*=\s*\d+/gi,
    /secret\s*=\s*\d+/gi,
  ];
  
  for (const pattern of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      return match.replace(/\d+/g, '[REDACTED]');
    });
  }
  
  // Truncate to prevent log flooding
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500) + '... [TRUNCATED]';
  }
  
  return sanitized;
}

/**
 * Generate query fingerprint for monitoring
 * Replaces all literals with placeholders
 */
function getQueryFingerprint(query: string): string {
  return query
    .replace(/'[^']*'/g, '?')           // String literals
    .replace(/\b\d+\b/g, '?')           // Numbers
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim()
    .substring(0, 200);
}

class Database {
  private pool: Pool;
  private activeClients: Map<PoolClient, { acquiredAt: number; stack: string; inTransaction: boolean }> = new Map();
  private queryStats: Map<string, { count: number; totalTime: number }> = new Map();

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.pool.max,
      min: config.database.pool.min,
      idleTimeoutMillis: config.database.pool.idle,
      connectionTimeoutMillis: config.database.pool.connectionTimeoutMillis,
      
      // SSL configuration
      ssl: config.env === 'production' || config.env === 'staging' ? {
        rejectUnauthorized: config.database.ssl.rejectUnauthorized,
        ca: config.database.ssl.ca,
      } : false,
      
      // Statement timeout (prevent long-running queries)
      statement_timeout: 30000, // 30 seconds
      
      // Query timeout
      query_timeout: 30000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });

    this.pool.on('connect', (client) => {
      logger.debug('New database connection established');
      
      // Set session parameters for security
      client.query('SET SESSION "application_name" = \'servai-backend\'').catch(err => {
        logger.error('Failed to set application_name', { error: err.message });
      });
    });
    
    // Monitor for connection leaks every 30 seconds
    setInterval(() => {
      this.checkForLeakedConnections();
    }, 30000);
    
    // Log query stats every 5 minutes
    setInterval(() => {
      this.logQueryStats();
    }, 300000);
  }

  private async checkForLeakedConnections() {
    const now = Date.now();
    
    for (const [client, info] of this.activeClients.entries()) {
      const heldFor = now - info.acquiredAt;
      
      if (heldFor > CONSTANTS.DB_CLIENT_TIMEOUT_MS) {
        logger.error('Connection leak detected - forcing termination', {
          heldForMs: heldFor,
          inTransaction: info.inTransaction,
          stack: info.stack.substring(0, 500),
        });
        
        // CRITICAL: Force rollback if in transaction
        if (info.inTransaction) {
          try {
            await client.query('ROLLBACK');
            logger.info('Rolled back leaked transaction');
          } catch (rollbackErr) {
            logger.error('Failed to rollback leaked transaction', { 
              error: rollbackErr 
            });
          }
        }
        
        // Remove from tracking
        this.activeClients.delete(client);
        
        // Force release
        try {
          client.release(true); // true = destroy connection
        } catch (err) {
          logger.error('Error destroying leaked client', { error: err });
        }
        
        // Also terminate at PostgreSQL level if possible
        try {
          // Get backend PID (if available)
          const pidResult = await this.pool.query(
            'SELECT pg_backend_pid() as pid'
          );
          
          if (pidResult.rows[0]?.pid) {
            // Note: This terminates current connection, not the leaked one
            // In production, use pg_terminate_backend with actual PID
            logger.warn('Leaked connection should be terminated at DB level', {
              pid: pidResult.rows[0].pid
            });
          }
        } catch (terminateErr) {
          // Ignore errors during termination attempt
        }
      }
    }
  }
  
  private logQueryStats() {
    if (this.queryStats.size === 0) return;
    
    const stats = Array.from(this.queryStats.entries())
      .map(([fingerprint, data]) => ({
        fingerprint: fingerprint.substring(0, 100),
        count: data.count,
        avgTime: Math.round(data.totalTime / data.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    logger.info('Top 10 queries by frequency', { stats });
    
    // Reset stats
    this.queryStats.clear();
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    const fingerprint = getQueryFingerprint(text);
    
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      // Update stats
      const currentStats = this.queryStats.get(fingerprint) || { count: 0, totalTime: 0 };
      this.queryStats.set(fingerprint, {
        count: currentStats.count + 1,
        totalTime: currentStats.totalTime + duration,
      });
      
      // Log slow queries with sanitized content
      if (duration > CONSTANTS.DB_SLOW_QUERY_THRESHOLD_MS) {
        logger.warn('Slow query detected', { 
          fingerprint: fingerprint.substring(0, 100),
          sanitizedQuery: sanitizeQueryForLogging(text),
          duration, 
          rows: result.rowCount 
        });
      } else {
        logger.debug('Query executed', { 
          fingerprint: fingerprint.substring(0, 50),
          duration, 
          rows: result.rowCount 
        });
      }
      
      return result;
    } catch (error: any) {
      logger.error('Database query error', { 
        fingerprint: fingerprint.substring(0, 100),
        sanitizedQuery: sanitizeQueryForLogging(text),
        error: error.message,
      });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    const stack = new Error().stack || 'no stack';
    
    this.activeClients.set(client, {
      acquiredAt: Date.now(),
      stack,
      inTransaction: false,
    });
    
    // Wrap release to clean up tracking
    const originalRelease = client.release.bind(client);
    client.release = ((err?: Error | boolean) => {
      const clientInfo = this.activeClients.get(client);
      
      // Warn if releasing while in transaction
      if (clientInfo?.inTransaction) {
        logger.warn('Releasing client while in transaction', {
          stack: clientInfo.stack.substring(0, 500)
        });
      }
      
      this.activeClients.delete(client);
      return originalRelease(err);
    }) as any;
    
    return client;
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    const clientInfo = this.activeClients.get(client);
    let committed = false;
    
    try {
      await client.query('BEGIN');
      
      // Mark as in transaction
      if (clientInfo) {
        clientInfo.inTransaction = true;
      }
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      committed = true;
      
      // Mark as not in transaction
      if (clientInfo) {
        clientInfo.inTransaction = false;
      }
      
      return result;
    } catch (error) {
      if (!committed) {
        try {
          await client.query('ROLLBACK');
          
          // Mark as not in transaction
          if (clientInfo) {
            clientInfo.inTransaction = false;
          }
        } catch (rollbackError: any) {
          logger.error('Error during ROLLBACK', { error: rollbackError.message });
        }
      }
      
      logger.error('Transaction failed', { error });
      throw error;
    } finally {
      try {
        client.release();
      } catch (releaseError: any) {
        logger.error('Error releasing client after transaction', { 
          error: releaseError.message 
        });
      }
    }
  }

  /**
   * Advisory lock with timeout
   * CRITICAL: Prevents deadlocks from long-running operations
   */
  async withAdvisoryLock<T>(
    lockId: number, 
    callback: () => Promise<T>,
    timeoutMs: number = 30000 // Default 30 seconds
  ): Promise<T> {
    const client = await this.getClient();
    let lockAcquired = false;
    
    try {
      // Acquire advisory lock
      const lockResult = await client.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [lockId]
      );
      
      if (!lockResult.rows[0]?.acquired) {
        throw new Error(`Failed to acquire advisory lock ${lockId}`);
      }
      
      lockAcquired = true;
      logger.debug('Advisory lock acquired', { lockId });
      
      // Execute callback with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Advisory lock operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      try {
        const result = await Promise.race([
          callback(),
          timeoutPromise,
        ]);
        
        return result;
      } catch (error) {
        logger.error('Advisory lock operation failed', { 
          lockId, 
          error 
        });
        throw error;
      }
    } finally {
      // Always release lock
      if (lockAcquired) {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
          logger.debug('Advisory lock released', { lockId });
        } catch (unlockError: any) {
          logger.error('Failed to release advisory lock', { 
            lockId, 
            error: unlockError.message 
          });
        }
      }
      
      client.release();
    }
  }

  async end(): Promise<void> {
    // Release all tracked clients
    for (const [client, info] of this.activeClients.entries()) {
      try {
        // Rollback if in transaction
        if (info.inTransaction) {
          await client.query('ROLLBACK');
        }
        client.release(true); // Destroy connection
      } catch (err: any) {
        logger.error('Error releasing client during shutdown', { 
          error: err.message 
        });
      }
    }
    this.activeClients.clear();
    
    await this.pool.end();
    logger.info('Database pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query(
        'SELECT NOW() as time, version() as version, current_database() as database'
      );
      
      if (result.rowCount && result.rowCount > 0) {
        logger.debug('Database health check OK', {
          database: result.rows[0].database,
        });
        return true;
      }
      
      return false;
    } catch (error: any) {
      logger.error('Database health check failed', { error: error.message });
      return false;
    }
  }
  
  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      active: this.activeClients.size,
    };
  }
}

export const db = new Database();