# servAI - Load Testing Guide 💥

**Purpose:** Performance testing and benchmarking for production readiness.  
**Tools:** k6, Apache Bench (ab), Artillery  
**Target:** 1,000 requests/second with <200ms latency  
**Last Updated:** January 6, 2026

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Testing Tools](#testing-tools)
3. [Test Scenarios](#test-scenarios)
4. [Running Tests](#running-tests)
5. [Interpreting Results](#interpreting-results)
6. [Performance Benchmarks](#performance-benchmarks)
7. [Optimization Tips](#optimization-tips)

---

## Prerequisites ✅

### Environment

```bash
# Test against staging, not production!
TEST_URL="https://staging.servai.app"

# Create test users and data
npm run seed:test
```

### Install Tools

```bash
# Option 1: k6 (recommended)
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Option 2: Apache Bench
sudo apt install apache2-utils

# Option 3: Artillery
npm install -g artillery
```

---

## Testing Tools 🛠️

### k6 (Recommended)

**Pros:**
- JavaScript-based scenarios
- Built-in metrics
- Grafana integration
- Load zones (distributed testing)

**Use Case:** Comprehensive load testing

### Apache Bench (ab)

**Pros:**
- Simple, quick tests
- Pre-installed on many systems
- Good for basic benchmarks

**Use Case:** Quick smoke tests

### Artillery

**Pros:**
- YAML configuration
- Easy to learn
- Good reporting

**Use Case:** Scenario-based testing

---

## Test Scenarios 🎯

### Scenario 1: Health Check (Baseline)

**Goal:** Measure raw performance without authentication.

```javascript
// k6-health-check.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up to 100 users
    { duration: '1m', target: 100 },    // Stay at 100 users
    { duration: '30s', target: 500 },   // Ramp up to 500 users
    { duration: '1m', target: 500 },    // Stay at 500 users
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests < 200ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

export default function () {
  const res = http.get('https://staging.servai.app/health');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  sleep(1);
}
```

### Scenario 2: Authentication Flow

**Goal:** Test login performance under load.

```javascript
// k6-auth-flow.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = 'https://staging.servai.app/api/v1';

export default function () {
  // Login
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: `test${__VU}@example.com`,
    password: 'TestPassword123'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'got access token': (r) => r.json('access_token') !== undefined,
  });
  
  if (loginRes.status === 200) {
    const accessToken = loginRes.json('access_token');
    
    // Fetch user profile
    const profileRes = http.get(`${BASE_URL}/companies`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    check(profileRes, {
      'profile fetch successful': (r) => r.status === 200,
    });
  }
  
  sleep(1);
}
```

### Scenario 3: CRUD Operations

**Goal:** Test database performance under load.

```javascript
// k6-crud-operations.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};

const BASE_URL = 'https://staging.servai.app/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN; // Set via environment

export default function () {
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  // List companies
  const listRes = http.get(`${BASE_URL}/companies`, { headers });
  check(listRes, { 'list companies': (r) => r.status === 200 });
  
  // Create company
  const createRes = http.post(`${BASE_URL}/companies`, JSON.stringify({
    name: `Test Company ${__VU}-${__ITER}`,
    email: `company${__VU}@test.com`,
    phone: '+1234567890',
  }), { headers });
  
  check(createRes, { 'create company': (r) => r.status === 201 });
  
  if (createRes.status === 201) {
    const companyId = createRes.json('id');
    
    // Get company
    const getRes = http.get(`${BASE_URL}/companies/${companyId}`, { headers });
    check(getRes, { 'get company': (r) => r.status === 200 });
    
    // Update company
    const updateRes = http.patch(`${BASE_URL}/companies/${companyId}`, JSON.stringify({
      name: `Updated Company ${__VU}-${__ITER}`,
    }), { headers });
    check(updateRes, { 'update company': (r) => r.status === 200 });
    
    // Delete company
    const deleteRes = http.del(`${BASE_URL}/companies/${companyId}`, { headers });
    check(deleteRes, { 'delete company': (r) => r.status === 204 });
  }
  
  sleep(2);
}
```

### Scenario 4: Rate Limiting

**Goal:** Verify rate limiting works correctly.

```javascript
// k6-rate-limiting.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '10s',
};

const BASE_URL = 'https://staging.servai.app/api/v1';

export default function () {
  // Rapid-fire requests to trigger rate limit
  for (let i = 0; i < 20; i++) {
    const res = http.post(`${BASE_URL}/password-reset/request`, JSON.stringify({
      email: 'test@example.com'
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (i < 3) {
      check(res, { 'allowed': (r) => r.status === 200 });
    } else {
      check(res, { 'rate limited': (r) => r.status === 429 });
    }
  }
}
```

### Scenario 5: Stress Test

**Goal:** Find breaking point.

```javascript
// k6-stress-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 500 },
    { duration: '5m', target: 1000 },
    { duration: '5m', target: 2000 },  // Push to breaking point
    { duration: '2m', target: 0 },
  ],
};

export default function () {
  const res = http.get('https://staging.servai.app/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```

---

## Running Tests 🏃

### k6 Tests

```bash
# Run basic health check
k6 run k6-health-check.js

# Run with custom duration
k6 run --duration 5m --vus 100 k6-health-check.js

# Run with environment variables
ACCESS_TOKEN="your_token" k6 run k6-crud-operations.js

# Run with output to InfluxDB + Grafana
k6 run --out influxdb=http://localhost:8086/k6 k6-health-check.js

# Run stress test
k6 run k6-stress-test.js

# Cloud execution (k6 Cloud)
k6 cloud k6-health-check.js
```

### Apache Bench Tests

```bash
# Simple test: 1000 requests, 10 concurrent
ab -n 1000 -c 10 https://staging.servai.app/health

# POST request test
ab -n 1000 -c 10 -p login.json -T application/json https://staging.servai.app/api/v1/auth/login

# With authentication header
ab -n 1000 -c 10 -H "Authorization: Bearer TOKEN" https://staging.servai.app/api/v1/companies

# Long duration test
ab -t 60 -c 50 https://staging.servai.app/health
```

### Artillery Tests

```yaml
# artillery-config.yml
config:
  target: "https://staging.servai.app"
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50
    - duration: 60
      arrivalRate: 100
  processor: "./helpers.js"

scenarios:
  - name: "Health Check"
    flow:
      - get:
          url: "/health"
          expect:
            - statusCode: 200
  
  - name: "Auth Flow"
    flow:
      - post:
          url: "/api/v1/auth/login"
          json:
            email: "test@example.com"
            password: "TestPassword123"
          capture:
            - json: "$.access_token"
              as: "token"
      - get:
          url: "/api/v1/companies"
          headers:
            Authorization: "Bearer {{ token }}"
```

```bash
# Run Artillery test
artillery run artillery-config.yml

# Run with report
artillery run --output report.json artillery-config.yml
artillery report report.json
```

---

## Interpreting Results 📈

### k6 Metrics

```
Metrics:
✓ http_req_duration.........: avg=45.2ms  min=12.3ms  med=38.1ms  max=234.5ms p(95)=98.7ms  p(99)=156.3ms
✓ http_req_failed...........: 0.12%  ✓ 35  ✗ 28965
  http_reqs..................: 29000  483.3/s
  vus........................: 100    min=0    max=100
  vus_max....................: 100    min=100  max=100
```

**What to look for:**

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| **P95 Latency** | <200ms | 200-500ms | >500ms |
| **P99 Latency** | <500ms | 500ms-1s | >1s |
| **Error Rate** | <1% | 1-5% | >5% |
| **Throughput** | >1000 req/s | 500-1000 | <500 |

### Apache Bench Metrics

```
Concurrency Level:      10
Time taken for tests:   20.456 seconds
Complete requests:      1000
Failed requests:        0
Total transferred:      345000 bytes
Requests per second:    48.89 [#/sec] (mean)
Time per request:       204.56 [ms] (mean)
Time per request:       20.46 [ms] (mean, across all concurrent requests)

Connection Times (ms)
              min  mean[+/-sd] median   max
Connect:       12   45   23.4     38    234
Processing:    23   67   34.2     59    345
Waiting:       18   56   28.9     48    298
Total:         45  112   51.3    103    489

Percentage of the requests served within a certain time (ms)
  50%    103
  66%    128
  75%    145
  80%    156
  90%    189
  95%    234
  98%    298
  99%    345
 100%    489 (longest request)
```

**Interpreting:**
- **Requests per second:** Should be >500 for simple endpoints
- **95th percentile:** Target <200ms
- **Failed requests:** Should be 0

---

## Performance Benchmarks 🎯

### Expected Performance (Single Server)

**Server Specs:** 4 vCPU, 8GB RAM

| Endpoint | Target RPS | P95 Latency | P99 Latency | Notes |
|----------|------------|-------------|-------------|-------|
| `/health` | 2000+ | <50ms | <100ms | No auth, no DB |
| `/api/v1/auth/login` | 500+ | <200ms | <500ms | DB lookup, bcrypt |
| `/api/v1/companies` (GET) | 1000+ | <100ms | <200ms | Simple query |
| `/api/v1/companies` (POST) | 500+ | <200ms | <500ms | DB write |
| `/api/v1/invites/accept` | 300+ | <300ms | <1s | Transaction, email |

### Database Performance

| Operation | Target Time | Notes |
|-----------|-------------|-------|
| Simple SELECT | <10ms | With indexes |
| JOIN query | <50ms | 2-3 tables |
| INSERT | <20ms | Single row |
| UPDATE | <20ms | Single row |
| Transaction | <100ms | Multiple operations |

### Redis Performance

| Operation | Target Time | Notes |
|-----------|-------------|-------|
| GET | <1ms | Cache hit |
| SET | <2ms | Write |
| INCR | <1ms | Rate limiting |

---

## Optimization Tips 🚀

### 1. Database Optimization

```sql
-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_invites_token ON invites(token) WHERE accepted_at IS NULL;

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM companies WHERE deleted_at IS NULL;

-- Enable pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- Find slow queries
SELECT 
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;
```

### 2. Connection Pool Tuning

```typescript
// Increase pool size for high concurrency
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,              // Increase from default 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 3. Redis Caching

```typescript
// Cache frequently accessed data
async function getCompany(id: string) {
  const cacheKey = `company:${id}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Fetch from database
  const company = await db.query('SELECT * FROM companies WHERE id = $1', [id]);
  
  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(company.rows[0]), 'EX', 300);
  
  return company.rows[0];
}
```

### 4. Cluster Mode

```javascript
// PM2 cluster mode
module.exports = {
  apps: [{
    name: 'servai-api',
    script: 'dist/server.js',
    instances: 4,          // Use all CPU cores
    exec_mode: 'cluster',
  }]
};
```

### 5. Response Compression

```typescript
import compression from 'compression';

app.use(compression());
```

### 6. Query Optimization

```typescript
// Bad: N+1 query problem
const companies = await getCompanies();
for (const company of companies) {
  company.condos = await getCondos(company.id); // N queries!
}

// Good: Single query with JOIN
const companies = await db.query(`
  SELECT 
    c.*,
    json_agg(co.*) as condos
  FROM companies c
  LEFT JOIN condos co ON co.company_id = c.id
  GROUP BY c.id
`);
```

---

## Continuous Load Testing 🔄

### CI/CD Integration

```yaml
# .github/workflows/load-test.yml
name: Load Testing

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install k6
        run: |
          sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      
      - name: Run Load Tests
        run: k6 run tests/load/k6-health-check.js
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: results/
```

---

## Troubleshooting Performance Issues 🔧

### Issue: High Latency

**Diagnosis:**
```bash
# Check slow queries
psql "$DATABASE_URL" -c "SELECT query, mean_time FROM pg_stat_statements WHERE mean_time > 100 ORDER BY mean_time DESC LIMIT 5;"

# Check system load
top
iostat

# Check database connections
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"
```

**Solutions:**
- Add database indexes
- Optimize queries
- Enable caching
- Scale vertically (more RAM/CPU)
- Scale horizontally (load balancer)

### Issue: High Error Rate

**Diagnosis:**
```bash
# Check application logs
pm2 logs servai-api --err --lines 100

# Check database errors
psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_database WHERE datname = 'servai_production';"
```

**Solutions:**
- Increase connection pool size
- Add circuit breakers
- Implement retry logic
- Fix application bugs

---

## Summary Checklist ✅

- [ ] Install load testing tools
- [ ] Create test data in staging
- [ ] Run health check baseline
- [ ] Run authentication flow test
- [ ] Run CRUD operations test
- [ ] Verify rate limiting works
- [ ] Run stress test to find limits
- [ ] Document baseline metrics
- [ ] Optimize bottlenecks
- [ ] Re-test after optimizations
- [ ] Set up continuous load testing
- [ ] Configure performance alerts

---

**Load Testing Guide Version:** 1.0  
**Last Updated:** January 6, 2026  
**Next Review:** After first production month
