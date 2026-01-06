import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

// Spike test - sudden traffic increase
export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Low baseline
    { duration: '30s', target: 300 },  // SPIKE!
    { duration: '2m', target: 300 },   // Stay at spike
    { duration: '1m', target: 10 },    // Recovery
    { duration: '1m', target: 0 },     // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

export default function () {
  const response = http.get(`${BASE_URL}/health`);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 1000,
  }) || errorRate.add(1);
  
  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'spike-test-results.json': JSON.stringify(data, null, 2),
  };
}
