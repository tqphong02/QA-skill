# Performance Testing — two tiers (Playwright native + k6)

> Companion to `SKILL.md`. Read this when the user wants perf checks, load tests, timing, SLA, or k6.

## TOC
1. Tier 1 vs Tier 2 — when to use which
2. Escalation matrix
3. Tier 1 — Playwright native patterns
4. Tier 2 — k6 patterns
5. Allure reporting for perf
6. Common anti-patterns

---

## 1. Tier 1 vs Tier 2 — when to use which

| | Tier 1 — Playwright native | Tier 2 — k6 |
|---|---|---|
| **Purpose** | Smoke perf gate per page; regression catch "this got 3× slower" | Load / stress / soak; find breaking point; formal SLA |
| **Concurrency** | 1 user (the test browser) | 1 → thousands of virtual users (VUs) |
| **Where it runs** | Inside `npx playwright test` suite | Standalone (`k6 run`) — separate CI job |
| **Metrics** | Navigation timing, per-response ms, trace | p95/p99 latency, RPS, error rate, throughput |
| **Speed** | Fast (part of normal run) | Slow (minutes) — scheduled/manual |
| **Setup cost** | Zero (already using Playwright) | Install k6, write script |

**Rule of thumb:** start Tier 1. Escalate to Tier 2 only when you hit an escalation criterion.

## 2. Escalation matrix

**Move Tier 1 → Tier 2 when ANY is true:**
- Need **>1 concurrent user** (concurrency bugs, connection pool limits, race conditions).
- Need **p95/p99 thresholds** (formal SLA in contract).
- Need **stress/soak** (find breaking point, memory leak over time).
- Need **standalone run** outside main CI suite (perf test takes >2 min, would slow PR pipeline).
- Need **dedicated perf env** (load test against staging, not local).

**Stay Tier 1 when:**
- Single-user timing regression detection.
- Quick smoke ("homepage loads < 2s").
- Want it inside the normal CI gate.

## 3. Tier 1 — Playwright native patterns

### (a) Navigation timing via Performance API
```typescript
test('homepage loads fast @perf', async ({ page }) => {
  await page.goto('/');
  const nav = await page.evaluate(() => {
    const [n] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return { ttfb: n.responseStart - n.requestStart, dom: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  expect(nav.ttfb).toBeLessThan(800);  // TTFB < 800ms
  expect(nav.load).toBeLessThan(3000); // full load < 3s
});
```

### (b) Per-response timing via `page.on('response')`
```typescript
test('API responses under threshold @perf', async ({ page }) => {
  const slow: string[] = [];
  page.on('response', async r => {
    const ms = r.request().timing()?.responseEnd ?? 0;
    if (ms > 1000) slow.push(`${r.status()} ${r.url()} (${ms}ms)`);
  });
  await page.goto('/dashboard');
  expect(slow, `Slow responses: ${slow.join(', ')}`).toHaveLength(0);
});
```

### (c) Trace for slow interactions
```typescript
test('checkout flow trace @perf', async ({ page, context }) => {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await page.goto('/checkout');
  // ... interaction ...
  await context.tracing.stop({ path: 'reports/checkout-trace.zip' });
});
```

## 4. Tier 2 — k6 patterns

### Anatomy of a k6 script
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // ramp-up
    { duration: '1m',  target: 50 },  // hold at target VUs
    { duration: '30s', target: 0 },   // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed:   ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/`);
  check(res, { 'status 200': r => r.status === 200 });
  sleep(1);  // think time between iterations
}
```

- **`stages`** — ramp profile (ramp-up → hold → ramp-down). For stress test, push `target` higher until break.
- **`thresholds`** — pass/fail criteria (p95/p99 latency, error rate). k6 exits non-zero if threshold breached → CI fails.
- **`checks`** — per-request assertions (status, body content). Don't fail the run alone (use thresholds for that).
- **`__ENV`** — pass `BASE_URL`, tokens via env (`k6 run -e BASE_URL=... script.js`).

### Test types
- **Load** — expected peak traffic (normal `stages`).
- **Stress** — push beyond peak until break (keep ramping `target`).
- **Soak** — long duration (hours) at moderate load → find memory leaks.
- **Spike** — sudden huge jump (`target: 1000` instantly) → resilience.

Template: `assets/templates/k6-load-test.js`.

### Running
```bash
# Local
k6 run tests/performance/k6-load-test.js

# With env
k6 run -e BASE_URL=https://staging.example.com tests/performance/k6-load-test.js

# In CI — separate job/stage, never blocking main pipeline (see cicd.md)
```

## 5. Allure reporting for perf

- **Tier 1:** `allure.step('measure TTFB')` around timing logic; `allure.attachment('timings.json', JSON.stringify(nav))`.
- **Tier 2:** k6 → JSON output, convert to Allure/JUnit via tooling; OR push to **Grafana** dashboard for live monitoring (more common for load tests).

## 6. Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| Load test on prod without coordination | Test against staging/perf env; warn stakeholders before load runs |
| k6 inside the main CI test suite (blocks PRs) | Separate scheduled/manual job |
| No thresholds → can't fail CI | Define `p(95)<X`, `rate<Y` thresholds |
| Testing 1 user and calling it "load test" | That's Tier 1 smoke — use Playwright native, not k6 |
| Ignoring ramp-up (instant max VUs) | Use `stages` ramp-up to model realistic traffic & avoid thundering herd |
| Hardcoding BASE_URL in script | Use `__ENV.BASE_URL` |
| Perf gate without baseline | Record baseline; threshold = baseline × tolerance (e.g. 1.5×) |
