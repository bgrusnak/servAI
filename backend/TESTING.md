# servAI Testing Guide

## Overview

Comprehensive test suite covering unit tests, integration tests, and security tests.

**Target Coverage: 70%+**

---

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup Test Database

```bash
# Create test database
createdb servai_test

# Run migrations
DATABASE_URL="postgresql://servai:servai_dev_pass@localhost:5432/servai_test" npm run migrate
```

### 3. Setup Test Redis

```bash
# Use Redis database 1 for testing (default is 0)
export TEST_REDIS_URL="redis://localhost:6379/1"
```

### 4. Environment Variables

Create `.env.test` file:

```env
NODE_ENV=test
JWT_SECRET=test_jwt_secret_32_characters_long_for_testing_purposes_only
DATABASE_URL=postgresql://servai:servai_dev_pass@localhost:5432/servai_test
REDIS_URL=redis://localhost:6379/1
```

---

## Running Tests

### All Tests

```bash
npm test
```

### Watch Mode (for development)

```bash
npm run test:watch
```

### Unit Tests Only

```bash
npm run test:unit
```

### Integration Tests Only

```bash
npm run test:integration
```

### Security Tests Only

```bash
npm run test:security
```

### With Coverage Report

```bash
npm run test:coverage
```

Coverage report will be generated in `coverage/` directory.

---

## Test Structure

```
__tests__/
├── setup.ts                          # Global test setup
├── unit/                            # Unit tests (isolated)
│   ├── services/
│   │   ├── invite.service.test.ts   # InviteService tests
│   │   ├── resident.service.test.ts # ResidentService tests
│   │   └── auth.service.test.ts     # AuthService tests
│   └── middleware/
│       ├── rateLimiter.test.ts      # Rate limiter tests
│       └── auth.test.ts             # Auth middleware tests
├── integration/                      # Integration tests (full flow)
│   ├── invite-flow.test.ts          # Complete invite acceptance flow
│   ├── auth-flow.test.ts            # Registration -> Login -> Refresh
│   └── resident-flow.test.ts        # Resident management flow
└── security/                         # Security tests (attack vectors)
    ├── race-condition.test.ts       # CRIT-001, CRIT-002 verification
    ├── authentication.test.ts       # JWT validation, token tampering
    ├── sql-injection.test.ts        # SQL injection prevention
    └── rate-limiting.test.ts        # CRIT-003 verification
```

---

## Test Coverage Requirements

### Minimum Thresholds (enforced by Jest)

- **Branches:** 70%
- **Functions:** 70%
- **Lines:** 70%
- **Statements:** 70%

### Priority Areas (must be 100%)

- ✅ Authentication & Authorization
- ✅ Invite acceptance flow
- ✅ Resident creation
- ✅ Rate limiting
- ✅ Transaction safety

---

## Writing Tests

### Unit Test Example

```typescript
import { InviteService } from '../../../src/services/invite.service';
import { db } from '../../../src/db';

jest.mock('../../../src/db');

describe('InviteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create invite with valid data', async () => {
    // Arrange
    const mockData = { /* ... */ };
    (db.query as jest.Mock).mockResolvedValue({ rows: [mockData] });

    // Act
    const result = await InviteService.createInvite(/* ... */);

    // Assert
    expect(result).toEqual(mockData);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Test Example

```typescript
import request from 'supertest';
import { app } from '../../src/server';

describe('Invite Flow', () => {
  it('should complete full invite acceptance', async () => {
    // Create invite
    const inviteResponse = await request(app)
      .post('/api/v1/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({ unit_id: unitId })
      .expect(201);

    // Accept invite
    const acceptResponse = await request(app)
      .post(`/api/v1/invites/accept/${inviteResponse.body.token}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(201);

    expect(acceptResponse.body).toHaveProperty('resident');
  });
});
```

### Security Test Example

```typescript
describe('Race Condition Prevention', () => {
  it('should allow only ONE user to accept single-use invite', async () => {
    const results = await Promise.allSettled([
      InviteService.acceptInvite(token, user1),
      InviteService.acceptInvite(token, user2),
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBe(1);
  });
});
```

---

## Testing Best Practices

### 1. Isolation
- Each test should be independent
- Use `beforeEach` to reset state
- Mock external dependencies

### 2. AAA Pattern
- **Arrange:** Set up test data
- **Act:** Execute the function
- **Assert:** Verify the result

### 3. Test Names
- Use descriptive names: `should [expected behavior] when [condition]`
- Example: `should reject expired JWT token`

### 4. Coverage
- Test happy path
- Test error cases
- Test edge cases (null, empty, invalid input)

### 5. Database
- Use transactions for integration tests
- Clean up test data in `afterEach` or `afterAll`
- Never use production database

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: servai_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: cd backend && npm ci
      
      - name: Run migrations
        run: cd backend && npm run migrate
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/servai_test
      
      - name: Run tests
        run: cd backend && npm run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/servai_test
          REDIS_URL: redis://localhost:6379/1
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./backend/coverage/lcov.info
```

---

## Troubleshooting

### Tests Hang
- Check if test database connections are closed
- Verify `afterAll` cleanup is running
- Increase `jest.setTimeout()`

### Redis Connection Errors
- Ensure Redis is running: `redis-cli ping`
- Check `TEST_REDIS_URL` environment variable
- Use different database number for testing (not 0)

### Database Errors
- Verify test database exists: `psql -l | grep servai_test`
- Check migrations are applied
- Ensure proper cleanup in tests

### Coverage Not Meeting Threshold
- Run `npm run test:coverage` to see report
- Focus on uncovered lines (shown in red)
- Add tests for error paths and edge cases

---

## Performance Testing

### Load Testing with k6

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:3000/api/v1/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

Run: `k6 run loadtest.js`

---

## Next Steps

1. ✅ **Run tests:** `npm test`
2. ✅ **Check coverage:** `npm run test:coverage`
3. ✅ **Fix failing tests**
4. ✅ **Add missing tests for uncovered code**
5. ✅ **Integrate into CI/CD**
6. ✅ **Set up code coverage reporting** (Codecov, Coveralls)
7. ✅ **Run load tests** (k6, Artillery)
8. ✅ **Security scan** (npm audit, Snyk)

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
