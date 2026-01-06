import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';
import { CONSTANTS } from '../config/constants';

class RedisClient {
  private client: IORedis;
  private isReady: boolean = false;

  constructor() {
    this.client = new IORedis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('Redis client ready');
    });

    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err });
      this.isReady = false;
    });

    this.client.on('close', () => {
      this.isReady = false;
      logger.warn('Redis client connection closed');
    });
  }

  getClient(): IORedis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isReady) {
      logger.warn('Redis not ready, skipping GET');
      return null;
    }
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error', { key, error });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isReady) {
      logger.warn('Redis not ready, skipping SET');
      return;
    }
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Redis SET error', { key, error });
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isReady) {
      return;
    }
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Redis DEL error', { key, error });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
    logger.info('Redis client closed');
  }
}

export const redis = new RedisClient();
