import { DataSource } from 'typeorm';
import { createTestDataSource } from './utils/test-db';

let testDataSource: DataSource;

// Mock Redis for tests
jest.mock('../utils/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    setex: jest.fn().mockResolvedValue('OK'),
    exists: jest.fn().mockResolvedValue(0),
  },
}));

// Mock token blacklist service
jest.mock('../services/token-blacklist.service', () => ({
  tokenBlacklistService: {
    isTokenRevoked: jest.fn().mockResolvedValue(false),
    revokeToken: jest.fn().mockResolvedValue(undefined),
  },
}));

beforeAll(async () => {
  testDataSource = await createTestDataSource();
}, 30000);

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
}, 10000);

// Optimized: only clear critical tables that accumulate across tests
beforeEach(async () => {
  if (testDataSource?.isInitialized) {
    const criticalTables = [
      'refresh_tokens',
      'audit_logs',
      'telegram_messages',
    ];
    
    for (const tableName of criticalTables) {
      try {
        await testDataSource.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
      } catch (err) {
        // Table might not exist yet, that's ok
      }
    }
  }
});

export { testDataSource };
