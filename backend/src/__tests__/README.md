# Backend Tests

## Overview

Comprehensive test suite for servAI backend covering:
- Unit tests for services
- Integration tests for API endpoints
- Database operations
- Business logic validation

## Test Structure

```
__tests__/
├── setup.ts                    # Global test setup
├── utils/
│   ├── test-db.ts             # Test database configuration
│   └── fixtures.ts            # Test data factories
├── services/                   # Unit tests
│   ├── auth.service.test.ts
│   ├── meter.service.test.ts
│   ├── invoice.service.test.ts
│   ├── poll.service.test.ts
│   └── ticket.service.test.ts
└── integration/                # Integration tests
    ├── auth.api.test.ts
    ├── meters.api.test.ts
    └── invoices.api.test.ts
```

## Setup

### 1. Create Test Database

```bash
# Create test database
creatdb servai_test

# Or using PostgreSQL
psql -U postgres
CREATE DATABASE servai_test;
\q
```

### 2. Configure Environment

Create `.env.test` file:

```env
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_USER=servai_test
TEST_DB_PASSWORD=servai_test
TEST_DB_NAME=servai_test
JWT_SECRET=test-secret-key
```

### 3. Install Dependencies

```bash
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific test file
npm test -- auth.service.test
```

## Coverage Goals

- **Target:** 70% code coverage minimum
- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

## Test Categories

### Unit Tests (services/)

Test business logic in isolation:
- ✅ Auth: Registration, login, tokens, verification
- ✅ Meters: Creation, readings, OCR, validation
- ✅ Invoices: Creation, items, payments, status
- ✅ Polls: Creation, voting, quorum, lifecycle
- ✅ Tickets: Creation, assignment, comments, lifecycle

### Integration Tests (integration/)

Test API endpoints end-to-end:
- ✅ Auth API: Register, login, refresh
- ✅ Meters API: List, create readings, OCR
- ✅ Invoices API: List, details, payments

## Test Data

### Fixtures

Use test data factories from `utils/fixtures.ts`:

```typescript
import { createTestUser, createTestCondo } from '../utils/fixtures';

const user = await createTestUser(userRepo, {
  email: 'test@example.com',
  password: 'SecurePass123!',
});

const condo = await createTestCondo(condoRepo, companyId);
```

### Database Cleanup

Database is automatically cleaned before each test:
- All tables cleared in `beforeEach`
- Fresh data for each test
- No test interdependencies

## Writing Tests

### Unit Test Example

```typescript
import { testDataSource } from '../setup';
import { User } from '../../entities/User';
import { createTestUser } from '../utils/fixtures';

describe('My Service', () => {
  let userRepo: any;

  beforeAll(() => {
    userRepo = testDataSource.getRepository(User);
  });

  it('should do something', async () => {
    const user = await createTestUser(userRepo);
    expect(user.id).toBeDefined();
  });
});
```

### Integration Test Example

```typescript
import request from 'supertest';
import { app } from '../../server';

describe('GET /api/v1/resource', () => {
  it('should return 200', async () => {
    const response = await request(app)
      .get('/api/v1/resource')
      .expect(200);

    expect(response.body).toBeDefined();
  });
});
```

## Best Practices

1. **Isolate tests** - Each test should be independent
2. **Use fixtures** - Reuse test data factories
3. **Clear naming** - Describe what is being tested
4. **Arrange-Act-Assert** - Structure tests clearly
5. **Test edge cases** - Not just happy path
6. **Mock external services** - Don't call real APIs

## Troubleshooting

### Database connection errors

```bash
# Check PostgreSQL is running
pg_isready

# Verify test database exists
psql -U postgres -l | grep servai_test
```

### TypeORM errors

- Ensure entities are imported in `test-db.ts`
- Check synchronize: true in test config
- Verify migrations are not interfering

### Jest configuration

- Check `jest.config.js` paths
- Verify `ts-jest` is installed
- Clear Jest cache: `npm test -- --clearCache`

## CI/CD Integration

Tests will run automatically in CI:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    npm install
    npm run test:coverage
```

## Next Steps

- [ ] Add more integration tests for all endpoints
- [ ] Add E2E tests with real HTTP requests
- [ ] Add load tests for performance
- [ ] Add security tests (SQL injection, XSS)
- [ ] Set up continuous testing in CI
