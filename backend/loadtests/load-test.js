import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const registerDuration = new Trend('register_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Spike to 200 users
    { duration: '5m', target: 100 },  // Back to 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    login_duration: ['p(95)<200'],
    register_duration: ['p(95)<400'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  // Scenario 1: User Registration (20%)
  if (Math.random() < 0.2) {
    group('User Registration', () => {
      const email = `loadtest-${Date.now()}-${Math.random()}@example.com`;
      const start = Date.now();
      
      const response = http.post(
        `${BASE_URL}/api/v1/auth/register`,
        JSON.stringify({
          email,
          password: 'LoadTest123!',
          first_name: 'Load',
          last_name: 'Test',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      registerDuration.add(Date.now() - start);
      
      check(response, {
        'register status is 201': (r) => r.status === 201,
        'register has tokens': (r) => JSON.parse(r.body).tokens !== undefined,
      }) || errorRate.add(1);
    });
  }
  // Scenario 2: User Login (30%)
  else if (Math.random() < 0.5) {
    group('User Login', () => {
      const start = Date.now();
      
      const response = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({
          email: __ENV.TEST_EMAIL || 'loadtest@example.com',
          password: __ENV.TEST_PASSWORD || 'LoadTest123!',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      loginDuration.add(Date.now() - start);
      
      const loginSuccess = check(response, {
        'login status is 200 or 201': (r) => [200, 201].includes(r.status),
      });
      
      if (!loginSuccess) {
        errorRate.add(1);
        return;
      }
      
      const body = JSON.parse(response.body);
      const token = body.tokens?.access_token;
      
      if (!token) {
        errorRate.add(1);
        return;
      }
      
      // Test authenticated endpoints
      group('Authenticated Requests', () => {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        };
        
        // Get companies
        let res = http.get(`${BASE_URL}/api/v1/companies`, { headers });
        check(res, {
          'companies status is 200': (r) => r.status === 200,
        }) || errorRate.add(1);
        
        sleep(0.5);
        
        // Get condos
        res = http.get(`${BASE_URL}/api/v1/condos`, { headers });
        check(res, {
          'condos status is 200': (r) => r.status === 200,
        }) || errorRate.add(1);
      });
    });
  }
  // Scenario 3: Health Checks (50%)
  else {
    group('Health Checks', () => {
      const response = http.get(`${BASE_URL}/health`);
      check(response, {
        'health status is 200': (r) => r.status === 200,
        'health response < 100ms': (r) => r.timings.duration < 100,
      }) || errorRate.add(1);
    });
  }
  
  sleep(Math.random() * 3 + 1); // Random sleep 1-4 seconds
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    'load-test-summary.txt': textSummary(data),
  };
}

function textSummary(data) {
  let summary = `\nLoad Test Results\n${'='.repeat(70)}\n\n`;
  
  summary += `Test Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n\n`;
  
  summary += `HTTP Metrics:\n`;
  summary += `  Total Requests: ${data.metrics.http_reqs?.values.count || 0}\n`;
  summary += `  Requests/sec: ${(data.metrics.http_reqs?.values.rate || 0).toFixed(2)}\n`;
  summary += `  Failed: ${((data.metrics.http_req_failed?.values.rate || 0) * 100).toFixed(2)}%\n\n`;
  
  summary += `Response Times:\n`;
  summary += `  Avg: ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms\n`;
  summary += `  Min: ${(data.metrics.http_req_duration?.values.min || 0).toFixed(2)}ms\n`;
  summary += `  Med: ${(data.metrics.http_req_duration?.values.med || 0).toFixed(2)}ms\n`;
  summary += `  Max: ${(data.metrics.http_req_duration?.values.max || 0).toFixed(2)}ms\n`;
  summary += `  p90: ${(data.metrics.http_req_duration?.values['p(90)'] || 0).toFixed(2)}ms\n`;
  summary += `  p95: ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += `  p99: ${(data.metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2)}ms\n\n`;
  
  summary += `Custom Metrics:\n`;
  summary += `  Login Duration (p95): ${(data.metrics.login_duration?.values['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += `  Register Duration (p95): ${(data.metrics.register_duration?.values['p(95)'] || 0).toFixed(2)}ms\n`;
  summary += `  Error Rate: ${((data.metrics.errors?.values.rate || 0) * 100).toFixed(2)}%\n\n`;
  
  // Performance assessment
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const errorRate = (data.metrics.http_req_failed?.values.rate || 0) * 100;
  
  summary += `Assessment:\n`;
  if (p95 < 200 && errorRate < 1) {
    summary += `  ✅ EXCELLENT - System performs exceptionally well\n`;
  } else if (p95 < 500 && errorRate < 5) {
    summary += `  ✅ GOOD - System meets performance targets\n`;
  } else if (p95 < 1000 && errorRate < 10) {
    summary += `  ⚠️  ACCEPTABLE - Consider optimization\n`;
  } else {
    summary += `  ❌ POOR - Immediate action required\n`;
  }
  
  return summary;
}
