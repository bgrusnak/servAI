import { db } from '../src/db';
import { redis } from '../src/utils/redis';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_32_characters_long_for_testing_purposes';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://servai:servai_dev_pass@localhost:5432/servai_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global setup
beforeAll(async () => {
  // Run migrations for test database
  console.log('Setting up test database...');
  // await runMigrations(); // Uncomment when migrations are stable
});

// Clean up after each test
afterEach(async () => {
  // Clean test data
  // Preserve seed data, only delete test-created data
});

// Global teardown
afterAll(async () => {
  await db.end();
  await redis.close();
  console.log('Test database cleaned up');
});
