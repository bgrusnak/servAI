import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * CRITICAL: Maximum safe integer for Redis INCR
 * Redis uses signed 64-bit integers: -2^63 to 2^63-1
 */
const REDIS_MAX_SAFE_INT = 9223372036854775807n; // 2^63 - 1
const REDIS_SAFE_INCREMENT_LIMIT = 9223372036854775000n; // Leave some headroom

/**
 * Validate Redis key to prevent injection attacks
 * CRITICAL: Only allow safe characters in keys
 */
function validateRedisKey(key: string): string {
  if (typeof key !== 'string') {
    throw new Error('Redis key must be a string');
  }
  
  // Check length (Redis max key length is 512MB, but we limit to 1KB)
  if (key.length === 0) {
    throw new Error('Redis key cannot be empty');
  }
  if (key.length > 1024) {
    throw new Error('Redis key too long (max 1024 characters)');
  }
  
  // CRITICAL: Sanitize key to prevent injection
  // Only allow: alphanumeric, dash, underscore, colon, dot
  const sanitized = key.replace(/[^a-zA-Z0-9:._-]/g, '');
  
  if (sanitized !== key) {
    logger.warn('Redis key contained invalid characters', { 
      original: key.substring(0, 100),
      sanitized: sanitized.substring(0, 100)
    });
  }
  
  // Prevent wildcard patterns in keys
  if (sanitized.includes('*') || sanitized.includes('?') || sanitized.includes('[')) {
    throw new Error('Redis key cannot contain wildcard characters');
  }
  
  return sanitized;
}

/**
 * Validate Redis value
 */
function validateRedisValue(value: string): string {
  if (typeof value !== 'string') {
    throw new Error('Redis value must be a string');
  }
  
  // Check size (limit to 10MB to prevent memory issues)
  if (value.length > 10 * 1024 * 1024) {
    throw new Error('Redis value too large (max 10MB)');
  }
  
  return value;
}

/**
 * Redis client with security enhancements
 */
class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisUrl = config.redis.url;
    
    // CRITICAL: Enforce TLS in production
    if (config.env === 'production' || config.env === 'staging') {
      if (!redisUrl.startsWith('rediss://')) {
        throw new Error(
          'CRITICAL SECURITY: Redis must use TLS (rediss://) in production/staging environment'
        );
      }
    }
    
    // Parse TLS options
    const tlsOptions = redisUrl.startsWith('rediss://') ? {
      rejectUnauthorized: true, // Verify certificates
      minVersion: 'TLSv1.2' as const, // Minimum TLS 1.2
    } : undefined;
    
    this.client = new Redis(redisUrl, {
      keyPrefix: config.redis.keyPrefix,
      
      // TLS configuration
      tls: tlsOptions,
      
      // Connection pool
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      
      // Retry strategy with exponential backoff
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis max retries exceeded');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 5000); // Max 5 seconds
        logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      
      // Reconnect on error
      reconnectOnError: (err) => {
        logger.error('Redis connection error', { error: err.message });
        
        // Reconnect on specific errors
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(target => err.message.includes(target))) {
          return true;
        }
        return false;
      },
      
      // Command timeout
      commandTimeout: 5000, // 5 seconds
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected', { 
        tls: redisUrl.startsWith('rediss://'),
        keyPrefix: config.redis.keyPrefix 
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis error', { error: error.message });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });
    
    this.client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Health check
   */
  async ping(): Promise<string> {
    try {
      return await this.client.ping();
    } catch (error) {
      logger.error('Redis ping failed', { error });
      throw error;
    }
  }

  /**
   * Get value with key validation
   */
  async get(key: string): Promise<string | null> {
    const sanitizedKey = validateRedisKey(key);
    return await this.client.get(sanitizedKey);
  }

  /**
   * Set value with optional TTL and validation
   */
  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    const sanitizedKey = validateRedisKey(key);
    const sanitizedValue = validateRedisValue(value);
    
    if (ttl !== undefined) {
      // Validate TTL
      if (ttl <= 0 || ttl > 31536000) { // Max 1 year
        throw new Error('Invalid TTL (must be 1 second to 1 year)');
      }
      return await this.client.set(sanitizedKey, sanitizedValue, 'EX', ttl);
    }
    
    return await this.client.set(sanitizedKey, sanitizedValue);
  }

  /**
   * Delete key with validation
   */
  async del(key: string): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    return await this.client.del(sanitizedKey);
  }

  /**
   * Increment with overflow protection
   * CRITICAL: Prevents integer overflow attacks
   */
  async incr(key: string): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    
    // Check current value before incrementing
    const current = await this.client.get(sanitizedKey);
    
    if (current !== null) {
      const currentValue = BigInt(current);
      
      // Check if increment would cause overflow
      if (currentValue >= REDIS_SAFE_INCREMENT_LIMIT) {
        logger.warn('Redis INCR approaching overflow, resetting counter', {
          key: sanitizedKey,
          currentValue: current
        });
        
        // Reset to 1 instead of overflowing
        await this.client.set(sanitizedKey, '1');
        return 1;
      }
    }
    
    return await this.client.incr(sanitizedKey);
  }
  
  /**
   * Decrement with underflow protection
   */
  async decr(key: string): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    
    // Check current value
    const current = await this.client.get(sanitizedKey);
    
    if (current !== null) {
      const currentValue = BigInt(current);
      
      // Prevent going below 0 for counters
      if (currentValue <= 0n) {
        logger.warn('Redis DECR would go negative, keeping at 0', {
          key: sanitizedKey
        });
        await this.client.set(sanitizedKey, '0');
        return 0;
      }
    }
    
    return await this.client.decr(sanitizedKey);
  }

  /**
   * Set expiry with validation
   */
  async expire(key: string, seconds: number): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    
    if (seconds <= 0 || seconds > 31536000) {
      throw new Error('Invalid expiry time (must be 1 second to 1 year)');
    }
    
    return await this.client.expire(sanitizedKey, seconds);
  }
  
  /**
   * Get TTL
   */
  async ttl(key: string): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    return await this.client.ttl(sanitizedKey);
  }
  
  /**
   * Check if key exists
   */
  async exists(key: string): Promise<number> {
    const sanitizedKey = validateRedisKey(key);
    return await this.client.exists(sanitizedKey);
  }

  /**
   * Close connection gracefully
   */
  async close(): Promise<void> {
    logger.info('Closing Redis connection...');
    await this.client.quit();
  }
  
  /**
   * Force disconnect (for emergency)
   */
  async disconnect(): Promise<void> {
    logger.warn('Force disconnecting Redis...');
    await this.client.disconnect();
  }
}

// Export singleton
export const redis = new RedisClient();

// Export validation functions for testing
export { validateRedisKey, validateRedisValue };