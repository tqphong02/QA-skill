// Tier 2 — k6 load test (chạy NGOÀI suite Playwright, job CI riêng).
// Cài k6:  brew install k6  (mac) / xem docs k6 cho Linux/Windows
// Chạy:    k6 run tests/performance/k6-load-test.js
//          k6 run -e BASE_URL=https://staging.example.com tests/performance/k6-load-test.js
//
// Mục đích: load/stress test, nhiều virtual user, kiểm SLA (p95/p99).
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const errorRate = new Rate('errors');
const latency = new Trend('page_latency_ms');

export const options = {
  // Ramp profile: 0 → 20 → 50 → 0 VUs. Đổi cho stress/soak tuỳ nhu cầu.
  stages: [
    { duration: '30s', target: 20 }, // ramp-up
    { duration: '1m', target: 50 }, // giữ ở target (50 VUs)
    { duration: '30s', target: 0 }, // ramp-down
  ],
  // SLA thresholds — k6 exit non-zero nếu breach → CI fail.
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'], // error rate < 1%
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('Homepage load', () => {
    const res = http.get(`${BASE}/`);
    latency.add(res.timings.duration);

    const ok = check(res, {
      'status 200': (r) => r.status === 200,
      'body has content': (r) => r.body && r.body.length > 0,
    });
    errorRate.add(!ok);
  });

  sleep(1); // think time giữa các iteration
}

// In summary ngọn ra stdout khi xong.
export function handleSummary(data) {
  return { stdout: textSummary(data, { indent: ' ', enableColors: false }) };
}
