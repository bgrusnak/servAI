import { DataSource } from 'typeorm';
import { createTestDataSource } from './utils/test-db';

let testDataSource: DataSource;

beforeAll(async () => {
  testDataSource = await createTestDataSource();
}, 30000);

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
}, 10000);

// Optimized: only clear tables that are actually used in tests
beforeEach(async () => {
  if (testDataSource?.isInitialized) {
    // Instead of clearing all tables, we'll use transactions in individual tests
    // This significantly speeds up test execution
    // For now, only clear critical tables
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
