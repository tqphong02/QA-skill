// Tier 2 — k6 load test (chạy NGOÀI suite Playwright, job CI riêng).
// Cài k6:  brew install k6  (mac) / xem docs k6 cho Linux/Windows
// Baseline an toàn một user:
//   k6 run -e BASE_URL=https://staging.example.com tests/performance/k6-load-test.js
// Load đã được duyệt:
//   k6 run -e BASE_URL=https://staging.example.com \
//     -e PERFORMANCE_CONTRACT=tests/performance/performance-contract.json \
//     -e K6_LOAD_APPROVED=true tests/performance/k6-load-test.js
//
// Mục đích: load/stress test, nhiều virtual user, kiểm SLA (p95/p99).
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

const errorRate = new Rate('errors');
const latency = new Trend('page_latency_ms');

function fail(message) {
  throw new Error(`K6 GUARDRAIL: ${message}`);
}

function loadContract() {
  const path = __ENV.PERFORMANCE_CONTRACT;
  if (!path) return null;

  try {
    return JSON.parse(open(path));
  } catch (error) {
    fail(`không đọc được performance contract tại ${path}: ${error.message}`);
  }
}

const contract = loadContract();
const stages = contract?.workload?.stages || [{ duration: '30s', target: 1 }];
const maxVus = Math.max(...stages.map((stage) => Number(stage.target || 0)));
const baseUrl = __ENV.BASE_URL || contract?.target;

if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  fail('phải truyền BASE_URL hoặc target URL hợp lệ trong performance contract');
}

if (maxVus > 1) {
  if (!contract) fail('load lớn hơn một user bắt buộc có PERFORMANCE_CONTRACT');
  if (__ENV.K6_LOAD_APPROVED !== 'true') {
    fail('load lớn hơn một user bắt buộc có K6_LOAD_APPROVED=true sau khi được duyệt');
  }
  if (!contract.authorization_reference || /ticket or written approval/i.test(contract.authorization_reference)) {
    fail('performance contract thiếu authorization_reference thật');
  }
  if (!Array.isArray(contract.abort_conditions) || contract.abort_conditions.length === 0) {
    fail('performance contract thiếu abort_conditions');
  }
}

const p95 = Number(contract?.thresholds?.p95_ms || 1000);
const allowedErrorRate = Number(contract?.thresholds?.error_rate ?? 0.01);

export const options = {
  stages,
  thresholds: {
    http_req_duration: [`p(95)<${p95}`],
    http_req_failed: [`rate<${allowedErrorRate}`],
  },
};

const BASE = baseUrl.replace(/\/$/, '');

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
