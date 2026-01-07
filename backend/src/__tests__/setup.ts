import { DataSource } from 'typeorm';
import { createTestDataSource } from './utils/test-db';

let testDataSource: DataSource;

beforeAll(async () => {
  testDataSource = await createTestDataSource();
});

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
});

beforeEach(async () => {
  // Clear all tables before each test
  if (testDataSource?.isInitialized) {
    const entities = testDataSource.entityMetadatas;
    for (const entity of entities) {
      const repository = testDataSource.getRepository(entity.name);
      await repository.clear();
    }
  }
});

export { testDataSource };
