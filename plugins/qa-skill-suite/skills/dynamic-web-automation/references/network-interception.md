# Network interception and HAR playback

Read this reference when a UI testcase must observe a request, simulate a deterministic response, reproduce an error, or replay approved staging traffic

Mocking is not primary evidence for a critical business flow. Every `MOCK` or `HAR` testcase must name a different real-environment sibling testcase in `real_flow_testcase_id`

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
- `FULFILL` fixtures must be JSON files below `test-data/fixtures/`
- Use `CONTINUE` only when the real request is intentionally part of the test
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
    "service_workers": "block",
    "real_flow_testcase_id": "TC_CHECKOUT_REAL_001",
    "implementation_file": "src/shared/helpers/checkout-har.ts",
    "implementation_export": "setupCheckoutHar"
  }
}
```

Before committing a HAR, remove cookies, authorization headers, tokens, personal data, production hosts, and response bodies outside the testcase scope. `sanitized: true` is an explicit review assertion, not an automatic sanitizer

## Fail-closed checks

The advanced contract gate blocks unsafe paths, missing fixtures/HAR files, absent helper implementations, unknown real-flow testcase IDs, unconfirmed HAR sanitization, and HAR playback without `service_workers=block`

Evidence requirements do not change: mocked UI tests still need the canonical screenshot/video and same-session trace. A mock proves error handling behavior; the real-flow sibling proves integration behavior
