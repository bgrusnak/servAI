import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * Redis client with error handling
 */
class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.client = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis error', { error });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });
  }

  /**
   * Get Redis client
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  /**
   * Get value
   */
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  /**
   * Set value with optional TTL
   */
  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    if (ttl) {
      return await this.client.set(key, value, 'EX', ttl);
    }
    return await this.client.set(key, value);
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  /**
   * Set expiry
   */
  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}

// Export singleton
export const redis = new RedisClient();
