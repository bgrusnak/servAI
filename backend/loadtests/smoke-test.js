import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'],   // Error rate should be less than 1%
    errors: ['rate<0.01'],
  },
};

// Environment variables
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  // Test 1: Health check
  let response = http.get(`${BASE_URL}/health`);
  check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
  }) || errorRate.add(1);

  sleep(1);

  // Test 2: Liveness probe
  response = http.get(`${BASE_URL}/health/liveness`);
  check(response, {
    'liveness status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test 3: Readiness probe
  response = http.get(`${BASE_URL}/health/readiness`);
  check(response, {
    'readiness status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test 4: Register new user
  const randomEmail = `smoke-test-${Date.now()}-${Math.random()}@example.com`;
  response = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      email: randomEmail,
      password: 'SmokeTest123!',
      first_name: 'Smoke',
      last_name: 'Test',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
  check(response, {
    'register status is 201': (r) => r.status === 201,
    'register returns access_token': (r) => JSON.parse(r.body).tokens?.access_token !== undefined,
  }) || errorRate.add(1);

  sleep(2);
}

export function handleSummary(data) {
  return {
    'smoke-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  let summary = `\n${indent}Smoke Test Results\n${indent}${'='.repeat(50)}\n`;
  
  summary += `${indent}Duration: ${data.state.testRunDurationMs / 1000}s\n`;
  summary += `${indent}VUs: ${options.vus || 5}\n\n`;
  
  summary += `${indent}HTTP Metrics:\n`;
  summary += `${indent}  Requests: ${data.metrics.http_reqs?.values.count || 0}\n`;
  summary += `${indent}  Failed: ${(data.metrics.http_req_failed?.values.rate * 100 || 0).toFixed(2)}%\n`;
  summary += `${indent}  Duration (avg): ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms\n`;
  summary += `${indent}  Duration (p95): ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms\n`;
  
  return summary;
}
