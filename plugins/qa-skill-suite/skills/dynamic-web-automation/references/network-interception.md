# Network interception and HAR playback

Read this reference when a testcase needs to intercept, mock, stub or replay HTTP traffic inside a Playwright test.

Mocking is not primary evidence for a critical business flow. Every `MOCK` or `HAR` testcase must name a different real-environment sibling testcase in `real_flow_testcase_id`

## HAR recording workflow

Record a HAR from the live application before creating a HAR playback testcase. Never commit a hand-written HAR or copy one from another environment.

### Step 1 — Record

```typescript
// In a one-off helper script, not in the generated spec:
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext();
await context.routeFromHAR('test-data/fixtures/upload.har', { update: true });
const page = await context.newPage();
await page.goto('https://your-staging-url/upload');
// Perform the exact actions that the testcase will replay
await browser.close();
```

Run with:

```bash
node scripts/record-har.mjs --url https://staging/upload --output test-data/fixtures/upload.har
```

### Step 2 — Commit

- Place the recorded HAR under `test-data/fixtures/<feature>-<scenario>.har`
- Commit alongside the manifest and spec; never store HAR in `reports/` or `evidence/`
- Re-record when the API contract changes; a stale HAR is `UNTEST`
- Redact credentials, tokens and PII before committing: replace real values with `<redacted>` in the HAR JSON

### Step 3 — Playback in spec

Declare in the manifest `network_interception` block, then BUILD injects the helper:

```json
{
  "network_interception": {
    "mode": "HAR",
    "routes": [
      {
        "pattern": "**/api/upload",
        "action": "HAR",
        "har_file": "test-data/fixtures/upload.har"
      }
    ],
    "real_flow_testcase_id": "TC_UPLOAD_REAL_001",
    "implementation_file": "src/shared/helpers/upload-har.ts",
    "implementation_export": "setupUploadHar"
  }
}
```

The implementation helper must call `page.routeFromHAR(harPath, { notFound: 'abort' })` and return `Promise<void>`.

## Manifest contract

```json
{
  "network_interception": {
    "mode": "MOCK",
    "routes": [
      {
        "pattern": "**/api/upload",
        "action": "FULFILL",
        "status": 503,
        "fixture_file": "test-data/fixtures/upload-unavailable.json"
      }
    ],
    "real_flow_testcase_id": "TC_UPLOAD_REAL_001",
    "implementation_file": "src/shared/helpers/upload-network.ts",
    "implementation_export": "setupUploadFailure"
  }
}
```

The implementation file is a manually owned extension below `src/shared/helpers/`; register it in `src/shared/ownership.json`. Generated specs and POM files remain codegen-owned and must not be edited manually

BUILD imports the declared export and calls it before testcase actions with `{ page, client?, testcaseId, contract }`. The helper must return `Promise<void>` and must install only page-scoped handlers for the declared routes

## Route rules

- Every handler must resolve with `route.fulfill()`, `route.abort()`, or `route.continue()`
- `MOCK` accepts only `FULFILL` or `ABORT`; every `FULFILL` route declares an HTTP `status` from 100 to 599 and a JSON fixture below `test-data/fixtures/`
- `HAR` accepts only `HAR`; `OBSERVE` accepts only `CONTINUE`
- Use `ABORT` for an explicit network failure such as `route.abort('timedout')`
- Assert the UI or API business outcome after interception; installing a route is not a testcase assertion
- Page-scoped routes are automatically removed when the isolated page closes; manually remove handlers if the page/context is reused

## HAR recording and playback

Record against an approved test or staging environment with Playwright CLI

```bash
npx playwright open --save-har=test-data/hars/checkout.har --save-har-glob="**/api/**" https://staging.example.test
```

Replay with service workers blocked because service-worker traffic can bypass native routing

```typescript
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.routeFromHAR('test-data/hars/checkout.har', {
    url: '**/api/**',
    notFound: 'abort',
    update: false,
  });
});
```

HAR manifest example

```json
{
  "network_interception": {
    "mode": "HAR",
    "routes": [{ "pattern": "**/api/**", "action": "HAR" }],
    "har_file": "test-data/hars/checkout.har",
    "sanitized": true,
    "allowed_hosts": ["staging.example.test"],
    "service_workers": "block",
    "real_flow_testcase_id": "TC_CHECKOUT_REAL_001",
    "implementation_file": "src/shared/helpers/checkout-har.ts",
    "implementation_export": "setupCheckoutHar"
  }
}
```

Before committing a HAR, remove cookies, authorization headers, tokens, personal data, production hosts, and response bodies outside the testcase scope. `allowed_hosts` contains exact approved host names, without paths or wildcards

The gate reads `.har` JSON and rejects embedded credentials, cookies, sensitive headers/query fields/JSON keys, invalid URLs, and hosts outside `allowed_hosts`. `sanitized: true` remains a reviewer assertion and never replaces this inspection. Compressed `.zip` HAR files are not accepted because their contents cannot pass the dependency-free deterministic inspection; extract and review them as `.har` first

## Fail-closed checks

The advanced contract gate blocks mode/action mismatches, invalid fulfill status, unsafe paths, missing fixtures/HAR files, missing declared helper exports, unknown real-flow testcase IDs, unconfirmed or unsafe HAR content, and HAR playback without `service_workers=block`

Evidence requirements do not change: mocked UI tests still need the canonical screenshot/video and same-session trace. A mock proves error handling behavior; the real-flow sibling proves integration behavior
