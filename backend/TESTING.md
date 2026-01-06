# Testing Guide for servAI

## Overview

This project uses **Jest** with **TypeScript** for comprehensive testing.

**Coverage Target:** 70%+ across all metrics (branches, functions, lines, statements)

---

## Test Structure

```
backend/tests/
├── setup.ts                 # Global test setup
├── unit/                    # Unit tests (isolated)
│   └── services/
│       ├── auth.service.test.ts
│       └── invite.service.test.ts
├── integration/             # Integration tests (API flows)
│   └── invite-flow.test.ts
└── security/               # Security tests (vulnerabilities)
    ├── race-conditions.test.ts
    ├── rate-limiting.test.ts
    └── sql-injection.test.ts
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

### Coverage Report
```bash
npm run test:coverage
```

### Specific Test Suites
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Security tests only
npm run test:security
```

### Single Test File
```bash
npm test -- invite.service.test
```

---

## Test Categories

### 1. Unit Tests

**Purpose:** Test individual functions/methods in isolation

**Characteristics:**
- Mock external dependencies (database, Redis, etc.)
- Fast execution (< 1s per test)
- Focus on business logic

**Example:**
```typescript
describe('AuthService.validatePassword', () => {
  it('should reject password without uppercase', () => {
    expect(() => 
      AuthService.validatePassword('lowercase123!')
    ).toThrow('uppercase letter');
  });
});
```

---

### 2. Integration Tests

**Purpose:** Test complete API flows end-to-end

**Characteristics:**
- Real database connections (test DB)
- Test entire request/response cycle
- Verify data persistence

**Example:**
```typescript
describe('Invite Flow', () => {
  it('should complete full invite acceptance', async () => {
    // 1. Admin creates invite
    const createRes = await request(app)
      .post('/api/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unit_id: testUnitId });
    
    // 2. User accepts invite
    const acceptRes = await request(app)
      .post(`/api/invites/accept/${createRes.body.token}`)
      .set('Authorization', `Bearer ${userToken}`);
    
    // 3. Verify resident created
    expect(acceptRes.status).toBe(201);
  });
});
```

---

### 3. Security Tests

**Purpose:** Test for vulnerabilities and attack vectors

**Covered Threats:**
- Race conditions (CRIT-001, CRIT-002)
- Rate limiting bypass (CRIT-003)
- SQL injection
- Brute force attacks
- Token enumeration

**Example:**
```typescript
describe('Race Conditions', () => {
  it('should prevent concurrent invite acceptance', async () => {
    const promises = [
      InviteService.acceptInvite(token, user1),
      InviteService.acceptInvite(token, user2),
    ];
    
    const results = await Promise.allSettled(promises);
    
    // One succeeds, one fails
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  });
});
```

---

## Test Environment Setup

### Prerequisites

1. **Test Database**
   ```bash
   createdb servai_test
   ```

2. **Environment Variables**
   ```bash
   # .env.test
   NODE_ENV=test
   DATABASE_URL=postgresql://user:pass@localhost:5432/servai_test
   REDIS_URL=redis://localhost:6379/1
   JWT_SECRET=test-secret-key
   ```

3. **Run Migrations**
   ```bash
   NODE_ENV=test npm run migrate
   ```

---

## Writing Tests

### Best Practices

1. **AAA Pattern** (Arrange, Act, Assert)
   ```typescript
   it('should do something', async () => {
     // Arrange
     const input = 'test';
     
     // Act
     const result = await service.doSomething(input);
     
     // Assert
     expect(result).toBe('expected');
   });
   ```

2. **Test One Thing**
   - Each test should verify one behavior
   - Use multiple assertions for related checks

3. **Descriptive Names**
   ```typescript
   // ✅ Good
   it('should reject password without uppercase letter')
   
   // ❌ Bad
   it('password test')
   ```

4. **Setup/Teardown**
   ```typescript
   let testUserId: string;
   
   beforeEach(async () => {
     // Create test data
     testUserId = await createTestUser();
   });
   
   afterEach(async () => {
     // Clean up
     await deleteTestUser(testUserId);
   });
   ```

5. **Test Error Cases**
   ```typescript
   it('should throw error for invalid input', async () => {
     await expect(
       service.doSomething(null)
     ).rejects.toThrow('Input required');
   });
   ```

---

## Critical Tests Checklist

### Security (Must Pass)

- [ ] Race condition prevention (invite acceptance)
- [ ] Duplicate prevention (resident creation)
- [ ] Rate limiting (public endpoints)
- [ ] SQL injection protection
- [ ] Auth bypass attempts
- [ ] CSRF protection
- [ ] XSS prevention

### Business Logic

- [ ] User registration & authentication
- [ ] Invite creation & validation
- [ ] Invite acceptance flow
- [ ] Resident management
- [ ] Role assignment
- [ ] Soft delete cascading

### Edge Cases

- [ ] Expired invites
- [ ] Max uses reached
- [ ] Deleted entities
- [ ] Invalid input formats
- [ ] Concurrent operations

---

## Debugging Failed Tests

### 1. Run Single Test
```bash
npm test -- --testNamePattern="should prevent race condition"
```

### 2. Enable Verbose Logging
```bash
DEBUG=* npm test
```

### 3. Check Test Database
```bash
psql servai_test
```

### 4. Inspect Fixtures
```typescript
afterEach(async () => {
  // Don't clean up - inspect data
  const residents = await db.query('SELECT * FROM residents');
  console.log('Residents:', residents.rows);
});
```

---

## Coverage Reports

### View in Terminal
```bash
npm run test:coverage
```

### HTML Report
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
- name: Run tests with coverage
  run: npm run test:coverage
  
- name: Check coverage threshold
  run: |
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$COVERAGE < 70" | bc -l) )); then
      echo "Coverage $COVERAGE% is below 70% threshold"
      exit 1
    fi
```

---

## Continuous Improvement

### Adding New Tests

1. **For new features:**
   - Write tests FIRST (TDD)
   - Cover happy path + error cases
   - Add security tests if relevant

2. **For bug fixes:**
   - Write failing test reproducing bug
   - Fix bug
   - Verify test passes

3. **For refactoring:**
   - Ensure existing tests pass
   - Add tests for new edge cases
   - Maintain coverage %

### Code Review Checklist

- [ ] All tests pass
- [ ] Coverage doesn't decrease
- [ ] New features have tests
- [ ] Tests follow naming conventions
- [ ] No commented-out tests
- [ ] No `.only()` or `.skip()` in commits

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Guide](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Questions?** Check existing tests for examples or ask in team chat!
