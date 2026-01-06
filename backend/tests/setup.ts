import { db } from '../src/db';
import { redis } from '../src/utils/redis';

// Setup before all tests
beforeAll(async () => {
  // Wait for DB connection
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// Cleanup after all tests
afterAll(async () => {
  await redis.close();
  await db.end();
});

// Reset test data before each test
beforeEach(async () => {
  // Clean test data (only in test database!)
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must run in test environment!');
  }
});
