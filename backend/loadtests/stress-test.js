import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Stress test configuration - find breaking point
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Warm up
    { duration: '5m', target: 200 },   // Normal load
    { duration: '5m', target: 400 },   // Stress
    { duration: '5m', target: 600 },   // Heavy stress
    { duration: '2m', target: 800 },   // Breaking point
    { duration: '5m', target: 0 },     // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.1'],  // Allow 10% errors in stress test
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  const scenario = Math.random();
  
  if (scenario < 0.3) {
    // Heavy read load
    group('Heavy Reads', () => {
      const response = http.get(`${BASE_URL}/health`);
      check(response, {
        'status is 200': (r) => r.status === 200,
      }) || errorRate.add(1);
    });
  } else if (scenario < 0.6) {
    // Mixed operations
    group('Mixed Operations', () => {
      const email = `stress-${Date.now()}-${Math.random()}@example.com`;
      const response = http.post(
        `${BASE_URL}/api/v1/auth/register`,
        JSON.stringify({
          email,
          password: 'StressTest123!',
          first_name: 'Stress',
          last_name: 'Test',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      check(response, {
        'register successful or rate limited': (r) => [201, 429].includes(r.status),
      }) || errorRate.add(1);
    });
  } else {
    // Burst traffic
    group('Burst Traffic', () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(['GET', `${BASE_URL}/health`, null, {}]);
      }
      
      const responses = http.batch(requests);
      responses.forEach((response) => {
        check(response, {
          'status is 200': (r) => r.status === 200,
        }) || errorRate.add(1);
      });
    });
  }
  
  sleep(0.1 + Math.random() * 0.5); // Very short sleep for stress
}

export function handleSummary(data) {
  const summary = generateStressSummary(data);
  
  return {
    'stress-test-results.json': JSON.stringify(data, null, 2),
    'stress-test-summary.txt': summary,
    stdout: summary,
  };
}

function generateStressSummary(data) {
  const p95 = data.metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = data.metrics.http_req_duration?.values['p(99)'] || 0;
  const errorRate = (data.metrics.http_req_failed?.values.rate || 0) * 100;
  const rps = data.metrics.http_reqs?.values.rate || 0;
  
  let summary = `\n${'='.repeat(70)}\n`;
  summary += `STRESS TEST RESULTS\n`;
  summary += `${'='.repeat(70)}\n\n`;
  
  summary += `📊 Performance Metrics:\n`;
  summary += `   Requests/sec: ${rps.toFixed(2)}\n`;
  summary += `   Total Requests: ${data.metrics.http_reqs?.values.count || 0}\n`;
  summary += `   Error Rate: ${errorRate.toFixed(2)}%\n`;
  summary += `   p95 Latency: ${p95.toFixed(2)}ms\n`;
  summary += `   p99 Latency: ${p99.toFixed(2)}ms\n\n`;
  
  summary += `🎯 Breaking Point Analysis:\n`;
  
  if (errorRate < 5 && p95 < 500) {
    summary += `   ✅ System handled stress exceptionally well\n`;
    summary += `   ✅ No breaking point found (can handle more load)\n`;
    summary += `   💡 Recommendation: System is ready for production\n`;
  } else if (errorRate < 10 && p95 < 1000) {
    summary += `   ✅ System handled stress adequately\n`;
    summary += `   ⚠️  Some degradation at peak load\n`;
    summary += `   💡 Recommendation: Monitor closely, consider scaling\n`;
  } else {
    summary += `   ⚠️  System showed stress under load\n`;
    summary += `   ❌ Breaking point reached\n`;
    summary += `   💡 Recommendation: Optimize before production\n`;
  }
  
  summary += `\n${'='.repeat(70)}\n`;
  
  return summary;
}
