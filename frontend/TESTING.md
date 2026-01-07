# 🧪 Testing Guide

## Overview

This guide covers testing strategies and best practices for the ServAI frontend.

## Test Structure

```
src/
├── utils/
│   ├── validators.js
│   └── __tests__/
│       └── validators.test.js
├── stores/
│   ├── auth.js
│   └── __tests__/
│       └── auth.test.js
└── components/
    ├── MyComponent.vue
    └── __tests__/
        └── MyComponent.test.js
```

## Running Tests

### Run All Tests

```bash
npm run test
```

### Run Tests in Watch Mode

```bash
npm run test -- --watch
```

### Run Tests with UI

```bash
npm run test:ui
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

**Coverage Targets:**
- Lines: 60%+
- Functions: 60%+
- Branches: 60%+
- Statements: 60%+

## Test Examples

### Testing Utilities

```javascript
import { describe, it, expect } from 'vitest';
import { validateEmail } from '../validators';

describe('validateEmail', () => {
  it('should validate correct emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
});
```

### Testing Components

```javascript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MyButton from '../MyButton.vue';

describe('MyButton', () => {
  it('renders properly', () => {
    const wrapper = mount(MyButton, {
      props: { label: 'Click me' }
    });
    expect(wrapper.text()).toContain('Click me');
  });

  it('emits click event', async () => {
    const wrapper = mount(MyButton);
    await wrapper.trigger('click');
    expect(wrapper.emitted()).toHaveProperty('click');
  });
});
```

### Testing Composables

```javascript
import { describe, it, expect } from 'vitest';
import { useDebounceFn } from '../useDebounce';

describe('useDebounceFn', () => {
  it('should debounce function calls', async () => {
    let callCount = 0;
    const { debouncedFn } = useDebounceFn(() => {
      callCount++;
    }, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    expect(callCount).toBe(0);

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(callCount).toBe(1);
  });
});
```

### Testing Stores (Pinia)

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../auth';

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should set user on login', async () => {
    const store = useAuthStore();
    
    // Mock API response
    // ...
    
    await store.login({ email: 'test@test.com', password: 'pass' });
    
    expect(store.isAuthenticated).toBe(true);
    expect(store.user).toBeDefined();
  });
});
```

### Testing API Calls

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../client';

vi.mock('../client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data', async () => {
    apiClient.get.mockResolvedValue({ data: { id: 1 } });
    
    const result = await fetchData();
    
    expect(apiClient.get).toHaveBeenCalledWith('/api/data');
    expect(result).toEqual({ id: 1 });
  });
});
```

### Testing Async Operations

```javascript
import { describe, it, expect } from 'vitest';

describe('Async operations', () => {
  it('should handle async data loading', async () => {
    const data = await loadData();
    expect(data).toBeDefined();
  });

  it('should handle errors', async () => {
    await expect(loadInvalidData()).rejects.toThrow('Error message');
  });
});
```

## Mocking

### Mock Modules

```javascript
import { vi } from 'vitest';

vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));
```

### Mock Functions

```javascript
import { vi } from 'vitest';

const mockFn = vi.fn();
mockFn.mockReturnValue('mocked value');
mockFn.mockResolvedValue({ data: 'async data' });
mockFn.mockRejectedValue(new Error('error'));
```

### Mock Quasar

```javascript
import { vi } from 'vitest';

const mockNotify = vi.fn();

vi.mock('quasar', () => ({
  useQuasar: () => ({
    notify: mockNotify,
    loading: {
      show: vi.fn(),
      hide: vi.fn()
    }
  })
}));
```

## Best Practices

### 1. Test Behavior, Not Implementation

```javascript
// ❌ Bad - testing implementation
it('calls internal method', () => {
  expect(component.internalMethod).toHaveBeenCalled();
});

// ✅ Good - testing behavior
it('displays success message after save', async () => {
  await wrapper.find('button').trigger('click');
  expect(wrapper.text()).toContain('Saved successfully');
});
```

### 2. Use Descriptive Test Names

```javascript
// ❌ Bad
it('works', () => { ... });

// ✅ Good
it('should display error message when email is invalid', () => { ... });
```

### 3. Arrange-Act-Assert Pattern

```javascript
it('should update user profile', async () => {
  // Arrange
  const store = useUserStore();
  const newProfile = { name: 'John' };

  // Act
  await store.updateProfile(newProfile);

  // Assert
  expect(store.profile.name).toBe('John');
});
```

### 4. Test Edge Cases

```javascript
describe('validateEmail', () => {
  it('handles empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('handles null', () => {
    expect(validateEmail(null)).toBe(false);
  });

  it('handles very long emails', () => {
    const longEmail = 'a'.repeat(300) + '@example.com';
    expect(validateEmail(longEmail)).toBe(false);
  });
});
```

### 5. Keep Tests Fast

```javascript
// ❌ Bad - real setTimeout
it('waits for animation', async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// ✅ Good - mock timers
it('waits for animation', async () => {
  vi.useFakeTimers();
  // test logic
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
});
```

### 6. Clean Up After Tests

```javascript
import { afterEach } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
```

## Coverage Reports

After running `npm run test:coverage`, open:

```
frontend/coverage/index.html
```

### Interpreting Coverage

- **Green (80%+):** Well tested
- **Yellow (60-80%):** Acceptable
- **Red (<60%):** Needs more tests

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm run test:coverage
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### VS Code Debug Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test"],
  "console": "integratedTerminal"
}
```

### Console Output

```javascript
it('debug test', () => {
  console.log('Debug output:', someVariable);
  expect(true).toBe(true);
});
```

## Testing Checklist

- [ ] All utilities have unit tests
- [ ] All stores have unit tests
- [ ] Critical components have tests
- [ ] API calls are mocked
- [ ] Edge cases are covered
- [ ] Coverage is 60%+
- [ ] Tests run in CI/CD
- [ ] No flaky tests
- [ ] Tests are fast (<5s total)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Testing Library](https://testing-library.com/)
- [Kent C. Dodds - Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
