import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

/**
 * Redis-based token blacklist service
 * Replaces in-memory Set for production-ready token revocation
 */
export class TokenBlacklistService {
  private readonly prefix = 'blacklist:token:';
  
  /**
   * Add token to blacklist with TTL matching JWT expiry
   */
  async revokeToken(tokenId: string, expiresInSeconds: number): Promise<void> {
    try {
      const key = `${this.prefix}${tokenId}`;
      await redis.set(key, '1', expiresInSeconds);
      logger.info('Token revoked', { tokenId });
    } catch (error) {
      logger.error('Failed to revoke token', { error, tokenId });
      throw error;
    }
  }
  
  /**
   * Check if token is in blacklist
   */
  async isTokenRevoked(tokenId: string): Promise<boolean> {
    try {
      const key = `${this.prefix}${tokenId}`;
      const result = await redis.get(key);
      return result === '1';
    } catch (error) {
      logger.error('Failed to check token blacklist', { error, tokenId });
      // Fail secure: if Redis is down, treat as revoked
      return true;
    }
  }
  
  /**
   * Remove token from blacklist (rarely needed)
   */
  async unrevoke Token(tokenId: string): Promise<void> {
    try {
      const key = `${this.prefix}${tokenId}`;
      await redis.del(key);
      logger.info('Token unrevoked', { tokenId });
    } catch (error) {
      logger.error('Failed to unrevoke token', { error, tokenId });
      throw error;
    }
  }
}

export const tokenBlacklistService = new TokenBlacklistService();
