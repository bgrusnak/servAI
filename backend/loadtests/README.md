# Load Testing Guide 🔥

## Overview

This directory contains load testing scenarios using [k6](https://k6.io/) to validate servAI's performance under various conditions.

## Prerequisites

```bash
# Install k6
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

## Test Scenarios

### 1. Smoke Test (smoke-test.js)
**Purpose:** Verify basic functionality with minimal load
**Duration:** 1 minute
**VUs:** 1-5
**When:** After every deployment

```bash
k6 run smoke-test.js
```

### 2. Load Test (load-test.js)
**Purpose:** Test expected production load
**Duration:** 10 minutes
**VUs:** 50-200
**When:** Before major releases

```bash
k6 run load-test.js
```

### 3. Stress Test (stress-test.js)
**Purpose:** Find breaking point
**Duration:** 15 minutes
**VUs:** 50-500+
**When:** Capacity planning

```bash
k6 run stress-test.js
```

### 4. Spike Test (spike-test.js)
**Purpose:** Test sudden traffic spikes
**Duration:** 5 minutes
**VUs:** 10-300-10
**When:** Before Black Friday, marketing campaigns

```bash
k6 run spike-test.js
```

### 5. Soak Test (soak-test.js)
**Purpose:** Test stability over time
**Duration:** 2-4 hours
**VUs:** 100
**When:** Before major releases, monthly

```bash
k6 run soak-test.js
```

## Environment Variables

```bash
# Set target API endpoint
export API_BASE_URL=http://localhost:3000

# Or for production
export API_BASE_URL=https://api.servai.app

# Test user credentials (create test user first)
export TEST_EMAIL=loadtest@example.com
export TEST_PASSWORD=LoadTest123!
```

## Running Tests

### Quick Start

```bash
# 1. Start your backend
cd backend
npm run dev

# 2. In another terminal, run smoke test
cd backend/loadtests
k6 run smoke-test.js
```

### Full Test Suite

```bash
# Run all tests in sequence
./run-all-tests.sh
```

### CI/CD Integration

```yaml
# .github/workflows/load-test.yml
name: Load Tests
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1' # Weekly on Monday 2 AM

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install k6
        run: |
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      - name: Run smoke test
        run: k6 run backend/loadtests/smoke-test.js
      - name: Run load test
        run: k6 run backend/loadtests/load-test.js
```

## Performance Targets

### Response Time Targets

| Endpoint | p95 | p99 | Max |
|----------|-----|-----|-----|
| GET /health | 10ms | 20ms | 50ms |
| POST /auth/login | 100ms | 200ms | 500ms |
| POST /auth/register | 200ms | 400ms | 1000ms |
| GET /companies | 50ms | 100ms | 300ms |
| POST /invites | 100ms | 200ms | 500ms |

### Throughput Targets

| Load | Target RPS | Success Rate |
|------|------------|-------------|
| Normal | 500-1000 | >99% |
| Peak | 1500-2000 | >95% |
| Stress | 2000+ | >90% |

### Error Rate Targets

- **Normal load:** <0.1% error rate
- **Peak load:** <1% error rate
- **Stress test:** <5% error rate

## Interpreting Results

### Key Metrics

```
http_req_duration..........: avg=45ms  min=10ms med=40ms max=500ms p(90)=80ms p(95)=120ms
http_req_failed............: 0.05%   ✓ 50     ✗ 99950
http_reqs..................: 100000  1666.67/s
iterations.................: 10000   166.67/s
vus........................: 100     min=100  max=100
```

**Good indicators:**
- ✅ p95 < 200ms
- ✅ Error rate < 1%
- ✅ Throughput > 1000 RPS

**Warning signs:**
- ⚠️ p95 > 500ms
- ⚠️ Error rate > 5%
- ⚠️ Throughput < 500 RPS

**Critical issues:**
- 🔴 p95 > 1000ms
- 🔴 Error rate > 10%
- 🔴 Connection errors

## Troubleshooting

### High Response Times

1. Check database query performance
2. Enable query logging
3. Review slow query log
4. Add missing indexes
5. Check connection pool size

### High Error Rates

1. Check application logs
2. Review rate limiting settings
3. Check database connection limits
4. Monitor memory usage
5. Review error responses

### Connection Errors

1. Check server capacity (CPU, Memory)
2. Review connection pool settings
3. Check network limits
4. Verify firewall rules
5. Monitor file descriptors

## Best Practices

1. **Always start with smoke tests**
2. **Run tests in isolated environment** (not production)
3. **Monitor server metrics** during tests (CPU, Memory, DB)
4. **Gradually increase load** (don't jump to max)
5. **Clean up test data** after tests
6. **Document baseline results** for comparison
7. **Run tests regularly** (weekly/monthly)

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [Performance Testing Guidance](https://k6.io/docs/testing-guides/)
