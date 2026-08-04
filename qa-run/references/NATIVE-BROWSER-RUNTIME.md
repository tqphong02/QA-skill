# Native Browser Runtime

This is the first-party browser execution layer for `qa-run` exploratory and ad-hoc testing. It uses the Playwright package already installed by this repository, the Chrome DevTools Protocol Accessibility domain and the existing same-session runtime observer

It does not install, import, invoke or depend on Browser Use. The runtime keeps the useful execution properties of a persistent browser agent while preserving `qa-run` safety, business-oracle, evidence, coverage and provenance gates

For headless runs, the launch helper leaves browser selection to Playwright so it uses the matching `chromium_headless_shell` instead of the full `Google Chrome for Testing.app` bundle. This avoids transient macOS Dock icons and crash-report dialogs. It never auto-discovers the user's system Google Chrome. `PLAYWRIGHT_EXECUTABLE_PATH` is an explicit opt-in override for a caller that supplies a compatible custom binary

## Contents

- [Capability target](#capability-target)
- [Quick start](#quick-start)
- [Observe before action](#observe-before-action)
- [Structured extraction and read-only batches](#structured-extraction-and-read-only-batches)
- [Selector resolution contract](#selector-resolution-contract)
- [Action contract](#action-contract)
- [Session and authentication lifecycle](#session-and-authentication-lifecycle)
- [Recovery contract](#recovery-contract)
- [Parallel worker pool](#parallel-worker-pool)
- [Exploratory ledger integration](#exploratory-ledger-integration)
- [Evidence and privacy](#evidence-and-privacy)
- [Fail-closed conditions](#fail-closed-conditions)
- [Token and runtime telemetry](#token-and-runtime-telemetry)
- [Troubleshooting](#troubleshooting)

## Capability target

The runtime closes three execution gaps in `EXPLORATORY_BROWSER_QA` (`EXPLORATORY_ADHOC` legacy alias)

| Gap | Native implementation |
|---|---|
| Browser interaction | Live Playwright actions, popup/tab binding, bounded waits and screenshot evidence |
| CDP/AX tree and recovery | `Accessibility.getFullAXTree`, compact interactive refs, stale-ref rejection, bounded re-observation and safe recovery |
| Multi-agent/browser scale | One isolated browser context and evidence directory per worker, worker assignments and concurrency up to four |

The runtime does not replace the business-intelligence gate. A DOM or AX observation is still a runtime observation, not proof of a hidden business rule. The agent must continue using the rule plan, explicit oracle and `exploratory-runner.mjs`

The runtime also does not choose the next action by itself. For a non-deterministic objective, the host agent reads each `observe` packet and applies [AGENTIC-TASK-PLANNING.md](AGENTIC-TASK-PLANNING.md): evaluate the previous goal, update compact memory, choose the next goal/action, record `decision`, execute it, then observe again

## Quick start

Run the native runtime from the tested project directory or set `QA_DATA_DIR` to that project. The daemon and evidence are written under the tested project's `evidence/`, never under the skill folder

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs start \
  run-orders-001 --workers 1
```

Observe the active page

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs observe \
  run-orders-001 --worker-id 1
```

Use the returned `ref` only for the next action. The action must be followed by another `observe` before a later target action

```json
{
  "type": "click",
  "worker_id": 1,
  "target_ref": "e3",
  "action": "Open order details",
  "intent": "Reach the order detail risk boundary",
  "charter_id": "C-ORDER-001",
  "step_id": "open-order",
  "decision_id": "DEC-0001",
  "expected_signal": "Order detail heading is visible",
  "http_method": "GET",
  "capture_media": true
}
```

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs action \
  run-orders-001 --worker-id 1 --action-file action.json
```

Recover a stale or loading page once, then observe again

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs recover \
  run-orders-001 --worker-id 1 --reason "target became stale" --strategy reload
```

Close the daemon after the run

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs close run-orders-001
```

The `start` command is idempotent while a matching loopback daemon is healthy. A stale state file is not reused as a live session

For a generic FAST task, prefer the combined entrypoint

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs quick-start \
  run-read-001 --url https://app.example/page \
  --objective "Read the visible status and links" \
  --allowed-domain https://app.example
```

It creates the FAST manifest/task contract, launches, navigates and observes in one command. Finish and close with `quick-finish <RUN_ID> --verdict PASS|FAILED|N/A|UNTEST`. The runtime rejects navigation outside the declared origin

## Observe before action

`observe` performs a bounded readiness check and returns a compact state packet containing

- explicit `session_id`, `page_id` and observation `revision`
- current URL and title
- visible interactive controls without input values
- semantic role and accessible name candidates
- CDP Accessibility Tree availability and compact role/name nodes
- candidate locator order for each interactive reference
- open tabs/pages and the active page
- runtime observer cursor
- compact visible page content: text, headings, links and tables

Use progressive observation profiles:

| Detail | Default bounds | Use |
|---|---|---|
| `compact` | 32 controls, 2,200 text chars, 16 links, 2 tables, 20 AX nodes; locator strategy names only | Default for every next-action decision |
| `standard` | 80 controls, 8,000 chars, 50 links, 6 tables, 80 AX nodes; locator candidates included | Required target/oracle is missing from a truncated compact packet |
| `full` | Up to 200 controls, 16,000 chars, 120 links, 10 tables, 120 AX nodes | Standard remains insufficient or failure diagnosis needs full locator detail |

Every packet reports `truncation` and `context_budget.estimated_tokens_utf8_div4`. Truncation is a retrieval signal, not a test failure. Escalate only when it can hide the current semantic target or expected signal; otherwise continue compact. Prefer a target-scoped `extract` over a full observation for large tables or lists

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs observe \
  <RUN_ID> --detail compact --max-items 32 --max-chars 2200
```

The session keeps full locator candidates behind each ephemeral ref even when the compact model packet exposes only locator strategy names. Action results still return the verified winning locator and attempt evidence, so compaction does not weaken selector validation

The reference is intentionally ephemeral. Every successful action marks the page state stale. Reusing `e1` without a new observation fails with `STALE_TARGET`, so the agent cannot silently click an element that moved or changed meaning

Every action result also contains `state_delta`: deterministic URL/title/content/control changes, new headings/alerts, runtime failures and a bounded progress classification. Use it to evaluate the previous goal and decide whether to continue or replan; do not treat the score as a QA oracle

## Structured extraction and read-only batches

`extract` reads visible text, links, lists and tables from the page or one resolved semantic target. It does not execute arbitrary page JavaScript supplied by the caller. Bound extraction with `max_items` and `max_chars`; extracted content is task context and does not replace screenshot/video evidence for QA verdicts

`batch` executes up to five actions without another model round-trip. Only `navigate`, `back`, `reload`, `wait`, page-level `scroll`, `switch_page`, `screenshot` and `extract` are accepted. The runtime re-observes after every action and stops early on a runtime failure. Clicks, form input, selection, download and other write-like interactions are rejected from batches and stay one-action-per-observation

## Selector resolution contract

The runtime uses the following exact order for a live target

1. `DATA_TEST_ID` — `[data-testid]` or `[data-test-id]`
2. `ID` — a unique live DOM id
3. `STABLE_CSS` — stable `name`, `aria-label`, `placeholder`, `title` or non-generated class attributes
4. `AX_SEMANTIC` — role plus accessible name, corroborated by the AX tree when available
5. `ROLE_LABEL_TEXT` — label, placeholder or exact visible text
6. `DOM_JS` — an explicitly supplied DOM selector that passed uniqueness checks
7. `XPATH` — last resort only, with a recorded fallback reason

The resolver never selects the first element from an ambiguous locator. It checks count, visibility and enabled state and returns the complete attempt ledger when resolution fails

An XPath action must carry `allow_xpath: true` when supplied directly and must include `xpath_reason` or `fallback_reason`. A generated structural XPath is only attempted after the higher-priority candidates fail

Coordinates are not a normal selector strategy. If a future driver needs coordinate fallback, the caller must provide a verified bounding box and visual evidence; native runtime actions remain DOM/AX based

## Action contract

Supported action types are `navigate`, `click`, `fill`, `type`, `press`, `check`, `uncheck`, `select`, `scroll`, `back`, `reload`, `wait`, `screenshot`, `switch_page`, read-only `extract`, single-step `download` and single-step `upload`. Download resolves a semantic target, waits for the browser download event, saves the file under the worker evidence directory and returns `attachments`; it is never batchable. Upload accepts one absolute `file_path` that resolves to a regular file inside `QA_DATA_DIR`, enforces `max_upload_bytes` with a 25 MB default, uses either a visible file input or a visible control that opens a file chooser, and returns only redacted filename/path/size evidence; it never returns file content and is never batchable

Every action is checked by `attack-surface.mjs` before browser execution

- external targets are blocked
- production mutations are blocked
- payment, publish, invite, permission and other external effects are blocked
- destructive actions require the existing explicit policy
- writes carry the run/worker test-data namespace in the result
- sensitive values are never copied into the action result or ledger
- upload paths outside `QA_DATA_DIR`, missing files, directories and files above the declared size limit are blocked before the chooser receives data

The result contains the action ID, same-session identifiers, safety decision, locator evidence, before/after visible state, deterministic state delta, optional structured extraction, readiness result, runtime failure summary, screenshot reference and the `next_observation_required` marker

The result is the source for the ledger adapter

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs native-action \
  run-orders-001 --result-file native-action-result.json \
  --charter-id C-ORDER-001 --step-id open-order --decision-id DEC-0001 \
  --expected "Order detail heading is visible" --verdict CONFIRMED
```

## Session and authentication lifecycle

The runtime has four explicit modes

| Mode | Input | Safety behavior |
|---|---|---|
| `isolated` | no auth input | New browser and context per worker |
| `storage_state` | `<QA_DATA_DIR>/auth.json` or `storageStatePath` | Loads the supplied state into a new isolated context |
| `persistent_profile` | `QA_BROWSER_PROFILE_DIR` or `--profile-dir` | Uses the explicitly selected Chromium profile |
| `cdp_attach` | `QA_CDP_URL` or `--cdp-url` | Attaches to the exact existing Chromium session |

Cookies, storage state and credentials are not returned by `health`, `observe`, action results or session state. A CDP attach does not close the user's browser context when the daemon exits; it disconnects only

`QA_CDP_URL` and `QA_BROWSER_PROFILE_DIR` are mutually exclusive. A live profile or CDP session cannot be shared across parallel workers. If `workers > 1` with either input, startup fails closed with `SHARED_BROWSER_STATE_UNSAFE`

The daemon is loopback-only and uses an ephemeral token for local process authorization. The token is not an application credential and must not be copied into QA reports

## Recovery contract

Recovery is bounded to two attempts by default and never retries a write automatically

| Condition | Native response |
|---|---|
| Stale reference | Reject action, require `observe` |
| Closed active page | Select a still-open page or create a blank page |
| Safe read-only loading issue | Optional bounded reload, then require observation |
| Write or destructive failure | Preserve first evidence and stop; no blind retry |
| Ambiguous target | Return all locator attempts and stop |
| Missing session/worker | Return a typed blocker |

A recovery result is not a PASS. It records the reason and recovery count, then the next observation and action must be recorded by the exploratory ledger

## Parallel worker pool

Use `--workers 1` through `--workers 4`. Each worker receives

- a distinct Playwright browser and context
- a distinct session ID and test-data namespace
- a distinct `evidence/native-browser/<run-id>/worker-<id>/` directory
- a distinct runtime event file

Assignments are executed sequentially inside one worker and concurrently across workers

```json
{
  "assignments": [
    {
      "worker_id": 1,
      "actions": [{ "type": "observe" }, { "type": "screenshot", "capture_media": true }]
    },
    {
      "worker_id": 2,
      "actions": [{ "type": "observe" }]
    }
  ]
}
```

```bash
node <skill-root>/scripts/helpers/native-browser-runtime.mjs execute \
  run-orders-001 --assignments-file assignments.json
```

Worker sharding must still come from the confirmed Sheet/charter assignment. The pool never duplicates a testcase row and never shares a page, cookie jar, profile or evidence path between workers

## Exploratory ledger integration

The native runtime and `exploratory-runner.mjs` have separate responsibilities

1. Optional `prepare-test-intelligence.mjs` context is loaded when present; otherwise the exploratory runner creates a UI-derived charter from the live page
2. `run-manifest.mjs` records the resolved native driver and observer
3. `exploratory-runner.mjs start` creates the scope, rule plan and evidence gate
4. native runtime `start` creates the browser session/pool
5. `observe → action → observe → verify` executes the live flow
6. For agentic objectives, `task-plan → decision → action → observe` records why each live action was selected and triggers bounded replan on repeated no-progress
7. `native-action` imports each action result into the QA ledger and links its `decision_id` when provided
8. rule probes, coverage, charter verdict and final finish remain mandatory

The native runtime may produce a technically successful click while the ledger marks the business action `UNRESOLVED` or `FAILED`. That distinction is intentional

## Evidence and privacy

Screenshots are saved as files, not returned as model-inline images. Password fields, elements marked `data-sensitive="true"`, password labels and payment-card autocomplete fields are masked in native screenshots

The shared `runtime-observer.mjs` writes sanitized event summaries for HTTP failures, failed requests, GraphQL errors, console errors, page errors and WebSocket errors. It persists only redacted response previews for failed or GraphQL responses; request bodies are not persisted. Events are correlated by the same session and action cursor

The runtime state contains IDs, URLs, role/name metadata, timestamps and relative evidence paths. It does not contain cookies, authorization headers, storage state, input values or raw response bodies

## Fail-closed conditions

Keep the technical layer unavailable or internally blocked when any item below prevents safe proof, then expose the final exploratory result as `UNTEST` with the exact reason

- no authorized account/session for a protected flow
- external or production mutation requested without explicit policy
- two visible elements match the target
- target ref is stale and observation cannot be refreshed
- worker count is outside 1–4
- parallel execution attempts to reuse a profile or CDP session
- browser process or CDP attach cannot be established
- evidence path cannot be written
- same-session runtime observer is unavailable

Do not convert a daemon health response into a business PASS. Health proves transport/session availability only

## Token and runtime telemetry

The native browser runtime does not call an LLM and therefore does not directly consume model tokens for `observe`, `action`, `recover` or `execute`. Its JSON output can become host-model input, so compact observations report their estimated packet cost and support explicit standard/full escalation

Model token usage is still measured by the host provider through `QA_TOKEN_USAGE_FILE` and `record-model-usage.mjs`. The business-intelligence card has its own deterministic context estimate. Browser runtime telemetry records action count, elapsed time, worker count, event count, screenshot count and recovery count, not invented model usage

## Troubleshooting

| Symptom | Check |
|---|---|
| `BROWSER_RUNTIME_PERMISSION_DENIED` | The host sandbox denied Chromium Mach/IPC registration. Do not retry in a loop; use an approved unsandboxed runtime or a loaded browser MCP. Final exploratory result is `UNTEST` if no browser route remains |
| `Target page, context or browser has been closed` | Run the local browser doctor and use the repository-supported Chromium/Playwright installation |
| `SHARED_BROWSER_STATE_UNSAFE` | Use `workers=1` for profile/CDP attach or provide isolated `auth.json` storage state for each worker |
| `STALE_TARGET` | Call `observe` again and use the new ref |
| `TARGET_AMBIGUOUS` | Add a stable `data-testid`, id or unique semantic target; do not force the first match |
| `NATIVE_ACTION_BLOCKED` | Resolve the business authorization and explicit safety policy before retrying |
| daemon state is `FAILED` | Read the redacted `daemon.log`, fix the browser/runtime layer and start a new run ID |
