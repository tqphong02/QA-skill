# Browser observability

Run this layer with every live `qa-run` browser workflow. It observes the same page/session used for UI actions and correlates browser state with network, console, and page errors.

## Contents

- [Same-session hard gate](#same-session-hard-gate)
- [Tool routing](#tool-routing)
- [Capture sequence](#capture-sequence)
- [Failure classification](#failure-classification)
- [Response inspection](#response-inspection)
- [GraphQL and WebSocket](#graphql-and-websocket)
- [Evidence and redaction](#evidence-and-redaction)
- [Completion checks](#completion-checks)

## Same-session hard gate

Resolve one observer before opening the target page:

```text
playwright-mcp
chrome-devtools-mcp
playwright-runtime
unavailable
not-applicable
```

Use `playwright-mcp` when Playwright MCP drives the UI. Use `chrome-devtools-mcp` only when Chrome DevTools drives or is attached to the exact target page. Use `playwright-runtime` for bundled CLI scripts that attach `scripts/helpers/runtime-observer.mjs` to their Playwright `page`.

Chrome DevTools MCP and Playwright MCP commonly launch separate isolated browsers. Never use network output from one to support UI actions executed in the other.

Use `not-applicable` only for static repository analysis without a live browser. Use `unavailable` when a live browser run lacks a same-session observer.

For Antigravity, install the `qa-run` skill through the repository setup or run the canonical bootstrap directly:

```bash
python3 scripts/helpers/configure-browser-mcp.py --agent antigravity
```

This enables Playwright MCP in `~/.gemini/config/mcp_config.json` while preserving all other MCP servers. Restart Antigravity after configuration so it loads the new server. Chrome DevTools MCP remains an optional fallback or deep-dive tool; do not start it as a second browser and use its evidence for Playwright-driven actions.

## Tool routing

### Playwright MCP

Use:

```text
browser_network_requests
browser_network_request
browser_console_messages
```

List requests without successful static resources by default. Filter to the feature endpoint when the flow is noisy. Use the returned request index to inspect only the necessary response headers or body.

### Chrome DevTools MCP

Use:

```text
list_network_requests
get_network_request
list_console_messages
get_console_message
```

Filter network resources to `document`, `xhr`, `fetch`, `websocket`, `eventsource`, `preflight`, or another contract-relevant type. Use preserved requests only when redirects or the previous navigation are relevant.

### Playwright runtime

Attach before the first action:

```javascript
import { createRuntimeObserver } from '<qa-run>/scripts/helpers/runtime-observer.mjs'

const observer = createRuntimeObserver(page)
```

The observer writes a bounded sanitized event stream to `evidence/.runtime-events.json`.

## Capture sequence

For every critical action:

1. Record the action name and expected UI/API transition
2. Ensure observation is already active
3. Execute the UI action
4. Assert visible or persisted state
5. List matching document/XHR/fetch requests
6. Inspect non-2xx, failed, cancelled, duplicated, retried, or contract-relevant responses
7. Inspect console `error` and `warning` plus uncaught page exceptions
8. Correlate findings with the action and expected result
9. Save a sanitized summary and required screenshot/video evidence

At the end of each workflow layer, sweep requests and console messages once more for late asynchronous failures.

## Failure classification

Classify before logging a bug:

| Observation | Classification |
|---|---|
| Expected negative request and correct UI handling | Expected behavior |
| HTTP 4xx/5xx contradicts the business contract | Candidate backend/API failure |
| HTTP 2xx with invalid business payload | Candidate contract or data failure |
| GraphQL HTTP 200 with non-empty `errors` | Candidate GraphQL failure |
| Request failed, cancelled, DNS/TLS error, or CORS block | Candidate transport/browser failure |
| Duplicate write, retry storm, polling leak | Candidate reliability/idempotency failure |
| Console exception after the action | Candidate frontend failure |
| Error exists but has no relation to tested scope | Background noise; record separately |

A network or console signal becomes a confirmed finding only after reproduction, action correlation, expected-versus-actual comparison, and visible or persisted impact when applicable.

## Response inspection

Inspect:

- Method, sanitized host/path, status and content type
- Response timing when available
- Retry, duplication, cancellation and cache behavior
- Response error code/message and schema shape
- Expected persistence or calculation fields

Do not collect every successful body. Read a body only when the request failed, the contract requires it, the UI result is inconsistent, or GraphQL semantics require inspection.

Never save raw `Authorization`, cookies, tokens, passwords, API keys, query values, personal data, or unrestricted response bodies.

## GraphQL and WebSocket

For GraphQL, verify both HTTP and envelope semantics:

- Operation name
- HTTP status
- `data`
- `errors`
- Partial data with errors
- Duplicate/retry/cache behavior

HTTP 200 does not imply GraphQL success.

For WebSocket, browser MCP may expose the handshake while message-level evidence depends on the active tool version. Record connection, failure, close, reconnect and ordering signals available in the same session. Report message-level coverage as `PARTIAL` when frames are unavailable.

## Evidence and redaction

Use a compact record:

```json
{
  "ui_step": "Submit checkout",
  "request": "POST /orders",
  "status": 500,
  "response_error": "ORDER_CREATE_FAILED",
  "console": "Unhandled order submission error",
  "ui_outcome": "Spinner remains indefinitely",
  "classification": "Candidate backend/API failure",
  "evidence": ["screenshots/checkout-submit-fail.png"]
}
```

Sanitize before writing. Network or console evidence supplements but does not replace required screenshot/video evidence for Sheet `Pass` or `Fail` verdicts.

## Completion checks

- Observer and UI driver used the same page/session
- Observation started before critical actions
- Every critical transition has a network/console correlation or explicit `N/A`
- Failed and contract-relevant responses were inspected
- GraphQL HTTP 200 errors were not missed
- Expected negative responses were not mislabeled as bugs
- Sensitive values were redacted
- Late asynchronous failures were swept
- Ledger row has `PASS`, `FAILED`, `BLOCKED`, `PARTIAL`, or justified `N/A`
