---
name: qa-run
description: Execute browser QA with same-session network and console observation for app discovery, Plane ticket retest, Sheet testcase execution, sanity, impacted regression, exploratory/ad-hoc testing, UI/UX audit, evidence, release sign-off, and business-flow knowledge handoff. Trigger on retest, re-test, verify bug/ticket, a Plane ticket URL with validation language, a Sheet URL with execute/run language, sanity, regression, exploratory, ad-hoc, UI/UX, browser response errors, or business discovery; do not require the skill name. Compose shared discovery/exploratory layers into RETEST_PLUS and SHEET_EXECUTION_PLUS. Not for writing automation, native-mobile traffic interception, or testcase documents.
---

# QA Run

**Core principle:** Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. **Data is fetched based on the working directory** (cwd or `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` are in the tested project folder — DO NOT mutate the skill folder. When loading knowledge, prioritize `qa-knowledge/knowledge-index.json` before reading specific scope files.

> **When to use**: discovering new bugs, verifying bugs, ad-hoc UI/API poking on a web app, sanity/risk-based recurring runs, regression (fixed testcases) placed in the project instance.
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI.

## Workflow composition router

Choose one entrypoint, then expand every required layer in its stack. Layers are internal capabilities of the single public `qa-run` skill, not separate skills.

```text
DISCOVERY_CORE =
  Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX

RETEST_PLUS =
  Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE

SHEET_EXECUTION_PLUS =
  Sheet Testcase Execution + Sanity + Impacted Regression + DISCOVERY_CORE
  + Original Retest only for rows linked to a ticket or previous failure

BROWSER_OBSERVABILITY =
  Same-session Network + Console + Page Error correlation
  Applied to every live browser stack without changing DISCOVERY_CORE
```

| User entrypoint | Required stack | Read now |
|---|---|---|
| Exploratory, ad-hoc, bug hunting, UI/UX or business discovery | `DISCOVERY_CORE` | [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Plane ticket plus retest, re-test, verify, PASS, FAILED or BLOCKED | `RETEST_PLUS` | [references/RETEST-PLUS.md](references/RETEST-PLUS.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Google Sheet URL/ID plus execute or run testcases | `SHEET_EXECUTION_PLUS` | [references/TESTCASE_SHEET_SCHEMA.json](references/TESTCASE_SHEET_SCHEMA.json), [references/SHEET_WORKER_RESULT_SCHEMA.json](references/SHEET_WORKER_RESULT_SCHEMA.json), [references/RETEST-PLUS.md](references/RETEST-PLUS.md), and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Sanity, smoke, impacted or recurring regression | `SANITY_REGRESSION_PLUS = Sanity + Impacted Regression + DISCOVERY_CORE` | [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| First exploration of an app or feature | `APP_BASELINE_DISCOVERY = DISCOVERY_CORE` at app/feature scope | [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Analyze repository business logic | `REPO_BUSINESS_DISCOVERY`; add `DISCOVERY_CORE` when a live runtime is in scope | [references/PIPELINE.md](references/PIPELINE.md) |
| Reconcile UI with source, docs or runtime | `UI_BUSINESS_RECONCILIATION + DISCOVERY_CORE` | [references/PIPELINE.md](references/PIPELINE.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Write Playwright automation or POM | Exit `qa-run` | Route to `playwright-pom-automation` |

Create a ledger row for every expanded layer. Do not conclude the parent workflow while any required layer lacks `PASS`, `FAILED`, `BLOCKED`, `PARTIAL`, or `N/A` with a reason.

For every live browser route, also create one `BROWSER_OBSERVABILITY` ledger row and read [references/BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md). Use the observer attached to the same page/session as the UI driver. Route native Android/iOS traffic to `mobile-qa`.

Load optional references only when their condition occurs:

- Tool choice is unresolved → [references/MCP-CHEATSHEET.md](references/MCP-CHEATSHEET.md)
- Project accounts, environment or Plane handoff must be bootstrapped → [references/PROJECT-SETUP.md](references/PROJECT-SETUP.md)
- Test data is the current blocker → [references/TEST-DATA.md](references/TEST-DATA.md)
- A workflow step failed → [references/COMMON-MISTAKES.md](references/COMMON-MISTAKES.md)
- Playwright was proven unavailable → [references/ANTIGRAVITY-FALLBACK.md](references/ANTIGRAVITY-FALLBACK.md)
- A verdict is shallow, contradictory or unsupported → [references/INTELLIGENCE-BOOST.md](references/INTELLIGENCE-BOOST.md)

Treat `qa-run` as one public skill. Never load or expose `vendor/**/SKILL.md`; vendor code is an optional development dependency, not a user-selectable QA skill.

## Cross-model hard gates

Apply the following exact order for all models, especially fast or small-context models:

1. Select the user entrypoint, expand its complete workflow stack, and initialize a ledger row for every required layer before opening the browser. If the route exits to another skill, stop `qa-run`.
2. **[BEFORE BROWSER — BUILD business context]** Derive the narrow feature slug from the ticket, Sheet row, URL, or user scope, then run:
   ```bash
   node scripts/helpers/context-builder.mjs \
     --intent <RETEST_TICKET|SHEET_TESTCASE_EXECUTION|SANITY_REGRESSION|EXPLORATORY_ADHOC> \
     --scope <feature-slug> \
     --target <route-or-ticket-url-if-known> \
     --expected <ticket-or-testcase-expected-if-known> \
     --role <role-if-known> \
     --impact <comma-separated-impacted-areas-if-known>
   ```
   Read both generated files under `qa-knowledge/context/`. `Business Execution Brief` is the machine gate, not an optional summary:
   - `READY` → use its exact `Target`, `Role/Data`, `Original flow`, `Expected`, `Impact area`, source hashes and known issues
   - `NEEDS_DISCOVERY` → run only `SCOPED_BUSINESS_DISCOVERY`, update knowledge, then rebuild the brief
   - `BLOCKED` → stop normal execution and report `missing_required`; never invent a route, role, rule, flow or expected result
   - Discovery modes may start without `READY` only to produce the missing knowledge. No normal browser action is allowed before the desired run's brief is `READY`
3. **Initialize Run Manifest** only after the business gate:
   ```bash
   node scripts/helpers/run-manifest.mjs start \
     --mode <MODE> \
     --business-context qa-knowledge/context/business-execution-brief.json \
     --browser-observer <playwright-mcp|chrome-devtools-mcp|playwright-runtime|unavailable|not-applicable>
   ```
   `run-manifest.mjs` must reject every non-discovery run whose brief is missing, invalid or not `READY`.
   - Resolve the observer before opening the page. Prefer Playwright network/console tools when Playwright MCP drives the UI; prefer Chrome DevTools network/console tools only when Chrome DevTools drives or is attached to that exact page
   - Never use an isolated Chrome DevTools browser to claim network evidence for a Playwright browser
   - Start observation before the first critical action. After each submit, save, delete, calculation, navigation, upload, retry, permission change, or other business transition, inspect matching XHR/fetch/document requests and console/page errors
   - Inspect response bodies only for failed or contract-relevant requests, including GraphQL HTTP 200 responses with `errors`; redact secrets and personal data before persistence
   - If browser observability is unavailable, mark its ledger row `BLOCKED`. Continue functional testing only when network verification is not part of the requested or business contract
4. With `SHEET_TESTCASE_EXECUTION` (when user provides a Google Sheet URL/ID containing testcases):
   - **Standard schema is pre-baked** — read [references/TESTCASE_SHEET_SCHEMA.json](references/TESTCASE_SHEET_SCHEMA.json); DO NOT rescan headers each time. Schema summary:
     ```
     Sheet: "Test cases_App"  |  Header row: 9 (0-indexed: 8)
     B=Scenario ID  C=Scenario Name  D=Test case ID  E=Description
     F=Pre-condition  G=Procedure  H=Expected Results
     I=Result  J=Priority  K=Date  L=Tester  M=Notes
     ```
     Columns I-M (idx 8-12) are **write columns**; columns B-H (idx 1-7) are **read-only design**.
   - Generate the functional-group worker plan first:
     ```bash
     node scripts/helpers/execute-sheet.mjs \
       --sheet-url <URL> \
       --module <requested-module-if-known> \
       --parallel \
       --plan-only
     ```
   - Read `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/sheet-worker-plan.json`, show `Requested module`, exact `Resolved functional groups`, available groups, testcase count and proposed shards, then stop for three explicit user confirmations:
     1. Confirm the exact module/functional-group scope, for example `LOGIN`
     2. Ask how many workers to use from 1 to 4; do not provide a final execution command with a default worker count
     3. Ask whether to run `all`, selected worker IDs such as `1,2`, or `cancel`
   - These confirmations are mandatory in Antigravity and every other host. A module named in the original prompt is a requested filter, not confirmation. Do not silently confirm the module, choose the worker count, or choose all workers
   - Resume with `--module <requested> --confirmed-module <confirmed> --workers <confirmed-count> --selected-workers <all|1,2>`. Missing any confirmation is `BLOCKED` before browser action or write-back
   - When a single module such as `LOGIN` is assigned multiple workers, shard its testcases across the confirmed worker count without duplicating rows; when assignments exceed the concurrency limit, run later waves
   - After the user confirms, delegate each selected assignment to an independent browser sub-agent/worker when the host supports parallel agents
   - Every worker must return JSON matching [references/SHEET_WORKER_RESULT_SCHEMA.json](references/SHEET_WORKER_RESULT_SCHEMA.json). Every `Pass` and `Fail` testcase must include at least one final-state screenshot or video (`png`, `jpg`, `jpeg`, `webp`, `gif`, `mp4`, `webm`, `mov`, `m4v`); JSON, trace, console or network evidence alone is insufficient. `Fail`, `Untest`, and `N/A` require Note
   - Store local media under the assigned `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/` or return an `image:`/`video:` remote URL. Store plan, assignments, worker results and write-back JSON separately under `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/`. The executor rejects local media outside the testcase's assigned function/date directory and appends valid media references to the Sheet Note
   - Merge worker outputs and import with `--results-file <JSON>`, or supply a real external executor with `--worker-script <PATH>`. Without valid media evidence, no `Pass`/`Fail` cell may be changed
   - **Write-back rules**: `Result` col I: exactly `Pass`, `Fail`, `N/A`, `Untest` (case-sensitive). `Priority` col J: exactly `Critical`, `High`, `Medium`, `Low`. `Note` col M: mandatory when Fail/Untest/N/A — concise manual-friendly context (no stacktraces, no raw HTTP codes).
   - After row execution, complete the remaining `SHEET_EXECUTION_PLUS` layers: Sanity, Impacted Regression, Scoped Business Discovery, Exploratory, Ad-hoc, and UI/UX
   - Add Original Retest only for rows tied to a Plane ticket or previously failed execution; do not perform Plane comment/state mutations without a ticket
5. **[BEFORE TEST — VERIFY loaded knowledge]** The brief builder must resolve `<project-root>/qa-knowledge/knowledge-index.json` first:
   - If index exists: load only the shard(s) matching the feature/ticket scope — DO NOT load the full guide
   - If index missing: read `app-business-guide.md` as fallback; then read `<feature-slug>-business-guide.md` if it exists
   - Read `permission-matrix.json` (machine-readable, NOT `rbac-matrix.md`) when preparing role-based or security tests
   - Extract and reuse: routes, roles, state transitions, validation rules, API contracts, reusable assets
   - If guide is older than current sprint or environment has changed: flag fields as `unresolved` and re-verify during test
   - If NO guide exists at all: run scoped discovery for a retest; use `APP_BASELINE_DISCOVERY` only for an explicit full-app/bootstrap request
6. With `RETEST_TICKET` -> read ticket via `plane-qa`, record scoped Business Discovery as the shared foundation, then create the mandatory RETEST_PLUS ledger with all 6 items: **Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX**. Full workflow: [references/RETEST-PLUS.md](references/RETEST-PLUS.md).
7. Copy the test contract from the `READY` brief. Do not rewrite it from memory or replace missing fields with generic steps.
8. Run CLI/scripts for clear and repetitive flows; only use browser agent/MCP for interactive branches not yet understood.
9. Update verdict/evidence into the ledger immediately after each layer; do not conclude if any item lacks a verdict or `BLOCKED/PARTIAL` reason.
10. Separate the original ticket verdict from new bugs, then apply the fixed state map via `plane-qa`.
11. After every run, run `node scripts/analysis/finding-reconciler.mjs --findings evidence/<run-res>.json --permission-matrix <pm.json>` to close the feedback loop, bundle evidence via `scripts/helpers/collect-evidence.mjs`, and finalize via `scripts/helpers/run-manifest.mjs finish <RUN_ID>`.
12. **[AFTER EVERY RUN — WRITE knowledge]** Update the business guide before closing the session — this is mandatory, not optional:
    ```bash
    # Step 1: write/merge the knowledge update
    node scripts/writers/write-business-guide.mjs guide-update.json <project-root>
    # Step 2: validate the written guide reads back correctly
    node scripts/writers/write-business-guide.mjs --check <project-root>/qa-knowledge/<feature-slug>-business-guide.md
    ```
    Minimum facts to record after each run:
    - Confirmed happy flow steps (with routes and roles)
    - Business rules verified or disproved
    - State transitions observed
    - API/network contracts confirmed
    - Known issues found (new or persistent)
    - Reusable assets (locators, data setups, routes, test accounts)
    - `latest_run` block: scope, verdict, key notes
    - Mark any previously `inferred` facts as `verified` if run confirmed them
    If guide already exists: set `previous_guide` path and `merge_confirmed: true` in JSON update; do not delete any fact the current run did not touch

State map: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`

## Knowledge scope decision

- `APP_BASELINE_DISCOVERY`: bootstrap project lacking `qa-knowledge/knowledge-index.json`. Run `scripts/helpers/extract-flow.mjs` first; map modules → traverse accessible main business flows, role/state/input/side-effect/integration/UI/UX and coverage gaps.
- `SHEET_TESTCASE_EXECUTION`: load `qa-knowledge/app-flow-map.json`, generate the plan with `node scripts/helpers/execute-sheet.mjs --sheet-url <URL> --module <requested-if-known> --parallel --plan-only`, show the resolved module scope, then ask the user to confirm module, worker count 1-4 and worker selection. Run only confirmed assignments and import image/video-backed results. Finish every `SHEET_EXECUTION_PLUS` layer
- `RETEST_TICKET`: do not rescan the full app. Run Scoped Business Discovery from ticket/index shards, refresh only missing or stale feature knowledge, then finish every RETEST_PLUS row.
- `SANITY_REGRESSION` and `EXPLORATORY_ADHOC`: reuse existing guides, expand `DISCOVERY_CORE`, and update knowledge exactly in the inspected scope.
- Do not call baseline exhaustive if you have not traversed enough modules, roles, states or data. Log `covered`, `partial`, `blocked` or `not_covered` in `coverage_map`.

## Critical red flags (hard stop)

These must be observed at all times, even before reading any reference file:

- **DO NOT run destructive tests** (delete, drop, wipe data) without explicit user authorization
- **DO NOT skip any hard gate** — all gates above are mandatory regardless of context or time pressure
- **DO NOT conclude PASS when lacking evidence** — absence of visible error is not evidence of passing
- **DO NOT use fallback (Antigravity/CLI) as a substitute for MCP** without first confirming MCP is genuinely unavailable
- **DO NOT overwrite existing artifacts** (`auth.json`, `evidence/`, `qa-knowledge/`) without reading the existing content first
- **DO NOT mix browser sessions** — network and console evidence must come from the same page/session that executed the UI action
- **DO NOT treat every 4xx/5xx as a confirmed bug** — correlate the request with the triggering action, expected negative behavior, response body and visible outcome

## Canonical artifact layout

```text
<project-root>/
├── .env
├── auth.json
├── evidence/
│   ├── runs/<run-id>/ (manifest.json, screenshots/, logs/, redacted/)
│   ├── network/<run-id>/ (sanitized request/response summaries)
│   ├── console/<run-id>/ (sanitized error/warning summaries)
│   ├── sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/ (Sheet screenshots/videos)
│   ├── sheet/_runs/<YYYY-MM-DD>/<run-id>/ (Sheet plans/results/write-back metadata)
│   ├── visual-*/
│   └── .runtime-events.json
├── qa-knowledge/
│   ├── knowledge-index.json        ← entry point (always read first)
│   ├── system-overview.md
│   ├── flows/, rules/, contracts/, evidence/
│   ├── app-business-guide.md       ← compatibility/overview layer
│   ├── app-flow-map.json
│   ├── checklists/, merged/, repositories/, ui-business/
├── FINDINGS.md
└── reports/ (retest/, exports/)
```

## Output format

- Plane comments and testcase prose must have no `.` at end of sentence and no emojis/icons
- Preserve ID, URL, filename, formula, code, decimal number and machine-readable values
- PASS comment: Result + Conclusion + inline image only
- FAILED comment: adds Actual + Expected
- BLOCKED comment: adds Blocker only

## Scripts reference

> **Lưu ý kiến trúc thư mục**: Toàn bộ script trong `qa-run/scripts/` được chia thành 7 nhóm (`discovery/`, `rbac/`, `ui-reconciliation/`, `writers/`, `analysis/`, `orchestrators/`, `helpers/`). Các orchestrator được hỗ trợ bởi `scripts/registry.mjs` cho phép gọi script con bằng tên ngắn gọn hoặc đầy đủ.

| Script | Purpose |
|---|---|
| `scripts/helpers/context-builder.mjs` | Build the deterministic Business Execution Brief and return `READY`, `NEEDS_DISCOVERY`, or `BLOCKED` |
| `scripts/helpers/run-manifest.mjs` | Initialize & log Run Manifest for full traceability |
| `scripts/helpers/runtime-observer.mjs` | Capture and redact same-session HTTP failures, GraphQL errors, request failures, console warnings/errors and page exceptions |
| `scripts/helpers/extract-flow.mjs` | Extract business flows from web app (DOM + network + CDP) |
| `scripts/helpers/execute-sheet.mjs` | Resolve and confirm module scope, worker count and selection; shard assignments; require image/video evidence; write back validated verdicts |
| `scripts/helpers/generate-checklist.mjs` | Auto-scan 100% items on screen → Markdown Checklist |
| `scripts/helpers/visual-audit.mjs` | Visual Heuristic Audit: overflow/clipping/touch targets/z-index |
| `scripts/analysis/attack-surface.mjs` | Classify Action Safety, auto-inject mutations |
| `scripts/rbac/rbac-api-tester.mjs` | Test API endpoints against expected roles (5 conflict types) |
| `scripts/analysis/finding-reconciler.mjs` | Reconcile runtime evidence into KB and feedback Q&A to BA |
| `scripts/writers/write-rbac-matrix.mjs` | Generate human-readable RBAC Markdown report with Section 5 |
| `scripts/helpers/data-factory.mjs` | Isolate accounts & data namespace per worker |
| `scripts/writers/validate-knowledge.mjs` | Check knowledge freshness, hash routes & git commit |
| `scripts/helpers/collect-evidence.mjs` | Bundle screenshots, traces, logs into artifact package |
| `scripts/writers/write-business-guide.mjs` | Deterministic renderer/validator for business guide |
| `scripts/helpers/log-bug.mjs` | Log Plane bug with inline image evidence |
| `scripts/helpers/login.mjs` | Create auth.json |
| `lib/driver.mjs` | Headless browser + screenshot to file |
| `lib/ui.mjs` | Scope snapshot, network recording, `withRevert` |
| `lib/assert.mjs` | `check/eq/summary` compact |

## Related skills

- [playwright-pom-automation](../playwright-pom-automation/SKILL.md) — write deterministic test-as-code (DIFFERENT from this live exploratory)
- [testcase-template](../testcase-template/SKILL.md) — document Excel test cases (DIFFERENT from this bug hunting)
- [doc-to-md](../doc-to-md/SKILL.md) — convert PDF/DOCX to MD for AI to read spec
- [mobile-qa](../mobile-qa/SKILL.md) — native Android/iOS Appium execution and authorized proxy interception
