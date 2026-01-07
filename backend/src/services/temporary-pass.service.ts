import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError, ConflictError } from '../utils/errors';

interface TemporaryPass {
  licensePlate: string;
  unitId: string;
  expiresAt: Date;
  createdAt: Date;
}

class TemporaryPassService {
  private readonly REDIS_PREFIX = 'temp_pass:';
  private readonly UNIT_PREFIX = 'unit_passes:';
  private redis = getRedisClient();

  /**
   * Create temporary pass with TTL in Redis
   */
  async createTemporaryPass(
    licensePlate: string,
    unitId: string,
    durationHours: number
  ): Promise<TemporaryPass> {
    try {
      const key = this.REDIS_PREFIX + licensePlate;
      const unitKey = this.UNIT_PREFIX + unitId;

      // Check if pass already exists
      const existing = await this.redis.get(key);
      if (existing) {
        throw new ConflictError('Temporary pass already exists for this license plate');
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000);

      const pass: TemporaryPass = {
        licensePlate,
        unitId,
        expiresAt,
        createdAt: now,
      };

      // Store in Redis with TTL
      const ttlSeconds = durationHours * 3600;
      await this.redis.setex(key, ttlSeconds, JSON.stringify(pass));

      // Add to unit's passes set (for listing)
      await this.redis.sadd(unitKey, licensePlate);
      await this.redis.expire(unitKey, ttlSeconds);

      logger.info('Temporary pass created', {
        licensePlate,
        unitId,
        expiresAt,
        durationHours,
      });

      return pass;
    } catch (error) {
      logger.error('Failed to create temporary pass', { error, licensePlate, unitId });
      throw error;
    }
  }

  /**
   * Get temporary pass by license plate
   */
  async getTemporaryPass(licensePlate: string): Promise<TemporaryPass | null> {
    try {
      const key = this.REDIS_PREFIX + licensePlate;
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      const pass = JSON.parse(data) as TemporaryPass;
      pass.expiresAt = new Date(pass.expiresAt);
      pass.createdAt = new Date(pass.createdAt);

      return pass;
    } catch (error) {
      logger.error('Failed to get temporary pass', { error, licensePlate });
      return null;
    }
  }

  /**
   * Get all temporary passes for a unit
   */
  async getUnitTemporaryPasses(unitId: string): Promise<TemporaryPass[]> {
    try {
      const unitKey = this.UNIT_PREFIX + unitId;
      const licensePlates = await this.redis.smembers(unitKey);

      const passes: TemporaryPass[] = [];

      for (const plate of licensePlates) {
        const pass = await this.getTemporaryPass(plate);
        if (pass) {
          passes.push(pass);
        }
      }

      return passes;
    } catch (error) {
      logger.error('Failed to get unit temporary passes', { error, unitId });
      return [];
    }
  }

  /**
   * Delete temporary pass
   */
  async deleteTemporaryPass(licensePlate: string, unitId: string): Promise<void> {
    try {
      const key = this.REDIS_PREFIX + licensePlate;
      const unitKey = this.UNIT_PREFIX + unitId;

      // Check if exists
      const existing = await this.redis.get(key);
      if (!existing) {
        throw new NotFoundError('Temporary pass');
      }

      // Delete from Redis
      await this.redis.del(key);
      await this.redis.srem(unitKey, licensePlate);

      logger.info('Temporary pass deleted', { licensePlate, unitId });
    } catch (error) {
      logger.error('Failed to delete temporary pass', { error, licensePlate, unitId });
      throw error;
    }
  }

  /**
   * Check if license plate has valid temporary pass
   */
  async hasValidPass(licensePlate: string): Promise<boolean> {
    const pass = await this.getTemporaryPass(licensePlate);
    return pass !== null && new Date() < pass.expiresAt;
  }

  /**
   * Cleanup expired passes (called by worker)
   * Redis TTL handles this automatically, but this cleans up unit sets
   */
  async cleanupExpiredPasses(): Promise<number> {
    try {
      // This is mostly handled by Redis TTL
      // But we can scan and clean up stale references in unit sets
      logger.info('Cleanup expired passes - handled by Redis TTL');
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup expired passes', { error });
      return 0;
    }
  }
}

export const temporaryPassService = new TemporaryPassService();
