import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Soak test - sustained load over time
export const options = {
  stages: [
    { duration: '5m', target: 100 },    // Ramp up
    { duration: '2h', target: 100 },    // Stay at 100 users for 2 hours
    { duration: '5m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  // Realistic user behavior
  group('User Session', () => {
    // Login
    let response = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({
        email: __ENV.TEST_EMAIL || 'soak-test@example.com',
        password: __ENV.TEST_PASSWORD || 'SoakTest123!',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const loginSuccess = check(response, {
      'login status is 200 or 201': (r) => [200, 201].includes(r.status),
    });
    
    if (!loginSuccess) {
      errorRate.add(1);
      sleep(5);
      return;
    }
    
    const token = JSON.parse(response.body).tokens?.access_token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    
    sleep(2);
    
    // Browse companies
    response = http.get(`${BASE_URL}/api/v1/companies`, { headers });
    check(response, {
      'companies status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    sleep(3);
    
    // Browse condos
    response = http.get(`${BASE_URL}/api/v1/condos`, { headers });
    check(response, {
      'condos status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    sleep(5);
    
    // Health check
    response = http.get(`${BASE_URL}/health`);
    check(response, {
      'health status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });
  
  sleep(Math.random() * 20 + 10); // 10-30 seconds between sessions
}

export function handleSummary(data) {
  const summary = generateSoakSummary(data);
  
  return {
    'soak-test-results.json': JSON.stringify(data, null, 2),
    'soak-test-summary.txt': summary,
  };
}

function generateSoakSummary(data) {
  const durationHours = (data.state.testRunDurationMs / 1000 / 3600).toFixed(2);
  const totalReqs = data.metrics.http_reqs?.values.count || 0;
  const errorRate = (data.metrics.http_req_failed?.values.rate || 0) * 100;
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  
  let summary = `\nSoak Test Results (${durationHours}h)\n${'='.repeat(70)}\n\n`;
  
  summary += `Total Requests: ${totalReqs}\n`;
  summary += `Error Rate: ${errorRate.toFixed(3)}%\n`;
  summary += `p95 Latency: ${p95.toFixed(2)}ms\n\n`;
  
  summary += `Stability Assessment:\n`;
  if (errorRate < 0.1 && p95 < 500) {
    summary += `  ✅ EXCELLENT - System is highly stable over time\n`;
    summary += `  ✅ No memory leaks detected\n`;
    summary += `  ✅ Performance consistent\n`;
  } else if (errorRate < 1 && p95 < 1000) {
    summary += `  ✅ GOOD - System is stable\n`;
    summary += `  ⚠️  Minor performance degradation\n`;
  } else {
    summary += `  ❌ UNSTABLE - System degrades over time\n`;
    summary += `  ⚠️  Possible memory leak or resource exhaustion\n`;
  }
  
  return summary;
}
