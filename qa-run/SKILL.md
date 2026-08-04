---
name: qa-run
description: Run UI-first exploratory browser QA and generic browser tasks with autonomous task decomposition, live-state next-action selection, bounded replanning, and same-session network/console/page-error observation. EXPLORATORY_BROWSER_QA (legacy EXPLORATORY_ADHOC) can start from a URL and natural-language objective without requirements or source documentation, infer how to complete the task from the live UI, and return PASS, FAILED, N/A or UNTEST. Trigger on generic browser task, open URL, read, click, fill, download, app discovery, exploratory/ad-hoc, sanity/regression, retest, Sheet, UI/UX, browser errors, business analysis, triage, metrics or sign-off. Not for automation, native-mobile traffic interception or testcase documents.
---

# QA Run

**Core principle:** Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

## Senior QA operating layer

Load [references/SENIOR-QA-OPERATING-MODEL.md](references/SENIOR-QA-OPERATING-MODEL.md) when the request includes planning, release readiness, defect triage, environment/data readiness, RCA, metrics or post-release verification. Keep this operating layer separate from the browser execution layer

Before execution, establish a versioned plan containing scope, risk, build, environment, role, data, dependencies, entry/exit criteria and stop conditions. After execution, reconcile evidence into defect decisions, quality metrics and a release or post-release owner

Use [references/RELEASE-QUALITY-METRICS.md](references/RELEASE-QUALITY-METRICS.md) when handing aggregated evidence to `release-governance-qa`. Preserve numerator, denominator, source run ID and limitations for every metric

## Optional agentmemory context layer

When the agentmemory MCP is available, use `recall` or `memory_smart_search` before optional `prepare-test-intelligence` with the project and feature terms. Treat returned memories as historical context only; for UI-first exploratory work the live UI is the primary oracle, while current source, requirements and a `READY` Business Execution Brief are optional enrichment or route-specific contracts

After a run, use `remember` or `memory_save` only for verified business decisions, unresolved ambiguity, environment/data constraints and pointers to `qa-knowledge/` artifacts. Never save credentials, cookies, tokens, raw response bodies, screenshots, personal data or unverified guesses. If agentmemory is unavailable, continue the normal QA flow and do not mark the run `BLOCKED`

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. **Data is fetched based on the working directory** (cwd or `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` are in the tested project folder — DO NOT mutate the skill folder. When loading knowledge, prioritize `qa-knowledge/knowledge-index.json` before reading specific scope files.

> **When to use**: discovering new bugs, verifying bugs, ad-hoc UI/API poking on a web app, sanity/risk-based recurring runs, regression (fixed testcases) placed in the project instance.
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI.

## Workflow composition router

### Public exploratory browser mode

Use `EXPLORATORY_BROWSER_QA` when the user provides a web URL or reachable browser target and a testing objective. Role, test data, requirements and source documentation are optional inputs. The skill starts with the live UI, discovers the visible navigation, controls, states and feedback, then continues with the autonomous browser QA loop. `EXPLORATORY_ADHOC` remains a backward-compatible alias and is normalized to `EXPLORATORY_BROWSER_QA`

Use the `FAST` execution profile inside `EXPLORATORY_BROWSER_QA` when the user asks for a short generic browser task such as opening a URL, reading visible information, checking a page, navigating, searching, scrolling or downloading a non-sensitive file. `BROWSER_TASK_FAST` is only the human-friendly/backward-compatible label for this profile, not a separate skill or top-level QA workflow. It skips the business brief and uses a bounded same-session browser task contract; read [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md). Switch to the normal exploratory profile as soon as the user asks for bug discovery, business-rule verification, expected-versus-actual, regression, retest or a QA verdict

Choose one entrypoint, then expand every required layer in its stack. Layers are internal capabilities of the single public `qa-run` skill, not separate skills.

```text
DISCOVERY_CORE =
  UI Flow Discovery + Exploratory + Ad-hoc + UI/UX

RETEST_PLUS =
  Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE

SHEET_EXECUTION_PLUS =
  Sheet Testcase Execution + Sanity + Impacted Regression + DISCOVERY_CORE
  + Original Retest only for rows linked to a ticket or previous failure

BROWSER_OBSERVABILITY =
  Same-session Network + Console + Page Error correlation
  Applied to every live browser stack without changing DISCOVERY_CORE

TEST_INTELLIGENCE =
  Optional Requirement + Runtime Knowledge + Current Source + UI Observation
  -> UI/runtime flow + Ranked Risks -> Exploratory Charters

EXPLORATORY_BROWSER_QA =
  FAST profile (simple task) | EXPLORATORY profile (full discovery and QA)

AGENTIC_TASK_EXECUTION =
  Objective + Live Page State -> Task Plan -> Next Goal -> One Action
  -> State Delta -> Compact Memory -> Complete | Replan | Stop
```

| User entrypoint | Required stack | Read now |
|---|---|---|
| Exploratory browser QA, ad-hoc, bug hunting, UI/UX or business discovery | `DISCOVERY_CORE`; add `AGENTIC_TASK_EXECUTION` when the path is non-deterministic | [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md), [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md), [references/AGENTIC-TASK-PLANNING.md](references/AGENTIC-TASK-PLANNING.md), and [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md); use [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) only when optional source/knowledge exists |
| Generic browser agent or simple browser task | `EXPLORATORY_BROWSER_QA` + `FAST` profile (`BROWSER_TASK_FAST` label) | [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md), [references/BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md), and [references/NATIVE-BROWSER-RUNTIME.md](references/NATIVE-BROWSER-RUNTIME.md) |
| Plane ticket plus retest, re-test, verify, PASS, FAILED or BLOCKED | `RETEST_PLUS` | [references/RETEST-PLUS.md](references/RETEST-PLUS.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Google Sheet URL/ID plus execute or run testcases | `SHEET_EXECUTION_PLUS` | [references/TESTCASE_SHEET_SCHEMA.json](references/TESTCASE_SHEET_SCHEMA.json), [references/SHEET_WORKER_RESULT_SCHEMA.json](references/SHEET_WORKER_RESULT_SCHEMA.json), [references/RETEST-PLUS.md](references/RETEST-PLUS.md), [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md), and [testcase-template/references/execution-contract.md](../testcase-template/references/execution-contract.md) |
| Sanity, smoke, impacted or recurring regression | `SANITY_REGRESSION_PLUS = Sanity + Impacted Regression + DISCOVERY_CORE` | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| First exploration of an app or feature | `APP_BASELINE_DISCOVERY = DISCOVERY_CORE` at app/feature scope | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md), [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md), [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md), and [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md) |
| Analyze repository business logic | `REPO_BUSINESS_DISCOVERY`; add `DISCOVERY_CORE` when a live runtime is in scope | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md), [references/PIPELINE.md](references/PIPELINE.md), and [references/GRAPHIFY-EFFECTIVE-HTML.md](references/GRAPHIFY-EFFECTIVE-HTML.md) |
| Reconcile UI with source, docs or runtime | `UI_BUSINESS_RECONCILIATION + DISCOVERY_CORE` | [references/PIPELINE.md](references/PIPELINE.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Write Playwright automation or POM | Exit `qa-run` | Route to `playwright-pom-automation` |

Create a ledger row for every expanded layer. Every user-facing exploratory result must be exactly `PASS`, `FAILED`, `N/A`, or `UNTEST`. Technical safety and coverage records may retain internal blocker/partial classifications, but they are normalized to `UNTEST` at the run/charter result boundary.

Use the four values consistently: `PASS` means the scoped UI behavior was executed and supported by same-session evidence; `FAILED` means it was executed and contradicted the visible or supplied oracle; `N/A` means the scope or check does not apply; `UNTEST` means it should be tested but execution or conclusion was not possible because of a missing target, session, authority, data, oracle, observer, evidence or budget

For every live browser route, also create one `BROWSER_OBSERVABILITY` ledger row and read [references/BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md). Use the observer attached to the same page/session as the UI driver. Route native Android/iOS traffic to `mobile-qa`.

Network, console and page-error evidence must come from the same session as the UI action; an isolated browser observer cannot prove the transition

Before every executable browser route, validate the target URL/domain boundary and objective. For full `EXPLORATORY_BROWSER_QA`/`EXPLORATORY_ADHOC`, start UI-first discovery directly when no requirements, source or saved knowledge is available; the live page supplies the initial flow, targets and visible oracles. If optional source/requirements/knowledge exist, `prepare-test-intelligence.mjs` may enrich risk ranking but is not a gate for exploratory execution. The `FAST` profile remains the low-friction utility path. Do not replace purposeful UI exploration with a generic element checklist

For the full `EXPLORATORY_BROWSER_QA` profile, `EXPLORATORY_ADHOC` alias and `APP_BASELINE_DISCOVERY`, after the target/domain gate read [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md) and [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md), declare the rule plan before the first browser action and drive the active UI-derived charter with its bounded observe → plan → act → verify → recover → re-rank loop. The `FAST` profile uses [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md) instead. This makes browser interaction autonomous without requiring a document or weakening the oracle, observer, safety, evidence, coverage or provenance gates. `RETEST_PLUS` reuses this loop only as its `DISCOVERY_CORE` layer

When the user gives a natural-language objective and the action path is not already deterministic, read [references/AGENTIC-TASK-PLANNING.md](references/AGENTIC-TASK-PLANNING.md). After the first live observation, decompose the objective into bounded goals with observable success signals, record one compact decision before each action, evaluate progress from the resulting page/runtime delta and replan after repeated no-progress. Store concise rationale and compact memory only; never persist raw chain-of-thought. Agentic task completion does not bypass the QA verdict gates

For `UI_BUSINESS_RECONCILIATION`, require an explicit live URL or component snapshot plus an atomic requirement registry matching [references/UI_REQUIREMENT_TRACEABILITY_SCHEMA.json](references/UI_REQUIREMENT_TRACEABILITY_SCHEMA.json). Fail closed when either input is missing. Preserve a stable `uiItemId` and emit one row for every UI item and every requirement in `ui-requirement-traceability.json`; use only `MAPPED`, `UI_ONLY`, `REQ_ONLY`, `CONFLICT`, `AMBIGUOUS`, `UNREACHABLE`, or `NOT_APPLICABLE`. Runtime actions are opt-in and require `--verify-runtime` plus an exact user-authorized action selector immediately before execution

Load optional references only when their condition occurs:

- Tool choice is unresolved → [references/MCP-CHEATSHEET.md](references/MCP-CHEATSHEET.md)
- Project accounts, environment or Plane handoff must be bootstrapped → [references/PROJECT-SETUP.md](references/PROJECT-SETUP.md)
- Test data is the current blocker → [references/TEST-DATA.md](references/TEST-DATA.md)
- A workflow step failed → [references/COMMON-MISTAKES.md](references/COMMON-MISTAKES.md)
- Playwright was proven unavailable → [references/ANTIGRAVITY-FALLBACK.md](references/ANTIGRAVITY-FALLBACK.md)
- A verdict is shallow, contradictory or unsupported → [references/INTELLIGENCE-BOOST.md](references/INTELLIGENCE-BOOST.md)
- Speed, token budget, repeated runs or cross-project portability is in scope → [references/RUN-OPTIMIZATION.md](references/RUN-OPTIMIZATION.md)
- Business-flow intelligence comparison or model-quality measurement is in scope → [references/BUSINESS-INTELLIGENCE-EVAL.md](references/BUSINESS-INTELLIGENCE-EVAL.md)
- Repository-wide graph, cross-file impact, call-flow diagram or interactive intelligence report is requested → [references/GRAPHIFY-EFFECTIVE-HTML.md](references/GRAPHIFY-EFFECTIVE-HTML.md)

Treat `qa-run` as one public skill. Never load or expose `vendor/**/SKILL.md`; vendor code is an optional development dependency, not a user-selectable QA skill.

## Cross-model hard gates

Apply the following exact order for all models, especially fast or small-context models:

1. Select the user entrypoint, expand its complete workflow stack, and initialize a ledger row for every required layer before opening the browser. If the route exits to another skill, stop `qa-run`.
2. **[BEFORE BROWSER — UI-FIRST DISCOVERY]** Validate the target URL/browser target, allowed domain and testing objective. For `EXPLORATORY_BROWSER_QA` and `EXPLORATORY_ADHOC`, requirements, source code, saved guides, role and test data are optional. Open the page and derive the initial flow from the live UI: entry point, navigation, controls, forms, visible states, validation, feedback and reachable next steps
   - If optional source/requirements/knowledge exist, `prepare-test-intelligence.mjs` may be run to enrich risk ranking; its absence or `NEEDS_DISCOVERY` status must not stop UI-first exploratory execution
   - Do not invent a business expectation that is not visible or otherwise provided. When the UI does not expose a clear oracle, record the charter/run as `UNTEST` with the exact missing signal
   - Use the `business-execution-card.json` and full brief only when they already exist or when source/requirements reconciliation is explicitly requested. They are enrichment and audit context for exploratory work, not a prerequisite
   - For `RETEST_TICKET`, `SHEET_TESTCASE_EXECUTION`, `SANITY_REGRESSION` and source-driven routes, keep the existing preparation command and READY/NEEDS_DISCOVERY gates
   - If the repository is available for optional enrichment, pass `--repo`; dirty/staged/untracked source remains candidate context until the browser confirms it
3. **Initialize Run Manifest** after the target/domain gate:
   ```bash
   node scripts/helpers/run-manifest.mjs start \
     --mode <MODE> \
     --profile <FAST|EXPLORATORY|FULL> \
     --business-context <optional-existing-context-json> \
     --browser-driver <auto|playwright-mcp|playwright-runtime|ego-browser|chrome-devtools-mcp|antigravity-native|unavailable> \
     --browser-observer <auto|playwright-mcp|playwright-runtime|ego-browser|chrome-devtools-mcp|unavailable> \
     --network-observer <auto|chrome-devtools-mcp|playwright-mcp|playwright-runtime|ego-browser|unavailable>
   ```
   `run-manifest.mjs` records the canonical route as `EXPLORATORY_BROWSER_QA` and the selected `execution_profile`. UI-first `EXPLORATORY_ADHOC` may start without `--business-context`; the runner creates a UI-derived charter. `--mode BROWSER_TASK_FAST` remains an accepted compatibility alias and is normalized to `EXPLORATORY_BROWSER_QA` + `FAST`
   When an optional context card exists, it should match the full brief hash; a stale optional card is ignored for UI-first exploratory execution and does not replace live UI observation
   - `browser-driver` and `network-observer` are resolved **independently**; read [references/BROWSER-DRIVER-RESOLUTION.md](references/BROWSER-DRIVER-RESOLUTION.md) for the full flowchart and combination rules
   - `EXPLORATORY_BROWSER_QA` (including its `FAST` profile and `EXPLORATORY_ADHOC` alias) and `APP_BASELINE_DISCOVERY` default `browser-driver`, `browser-observer` and `network-observer` to `playwright-runtime`, which uses the bundled Playwright-managed browser and avoids system Chrome
   - Explicit `--browser-driver auto` (or `QA_BROWSER_DRIVER=auto`) resolves fallback priority: `chrome-devtools-mcp → playwright-mcp → playwright-runtime → ego-browser → antigravity-native → unavailable`
   - `auto` binds the network observer to the resolved driver first: `chrome-devtools-mcp → playwright-mcp → playwright-runtime → ego-browser → unavailable`; Chrome DevTools is used as a secondary observer only after same-page/session attach is verified
   - ego-browser provides basic network events via `drainEvents()` only (no request/response body); mark network assertions `reduced_confidence` when `network-observer: ego-browser`
   - ego-browser as driver requires macOS; on other platforms resolve to next available driver
   - Prefer Chrome DevTools tools when Chrome DevTools drives the UI; prefer Playwright tools when Playwright is the fallback driver; a cross-tool observer is valid only after attachment to that exact page/session is verified
   - Never use an isolated Chrome DevTools browser to claim network evidence for an ego-browser or Playwright session, or the reverse
   - Start observation before the first critical action. After each submit, save, delete, calculation, navigation, upload, retry, permission change, or other business transition, inspect matching XHR/fetch/document requests and console/page errors
   - Inspect response bodies only for failed or contract-relevant requests, including GraphQL HTTP 200 responses with `errors`; redact secrets and personal data before persistence
   - If browser observability is unavailable, record the technical layer as unavailable and finish the user-facing run as `UNTEST` when that observer is needed for the requested oracle
   - For the full `EXPLORATORY_BROWSER_QA` profile, `EXPLORATORY_ADHOC` alias and `APP_BASELINE_DISCOVERY`, start `scripts/helpers/exploratory-runner.mjs` with the same `RUN_ID` after the manifest; use its `rule-plan`, `page`, `task-plan`, `decision`, `action`, `rule-probe`, `coverage`, `charter` and `finish` commands as the runtime ledger boundary. For a deterministic supplied testcase, `task-plan`/`decision` may mirror the supplied steps; for an unknown path they must be derived from the current live observation. Use resolved driver/observer values, not `auto`, before a final `PASS`
   - For `EXPLORATORY_BROWSER_QA` with `execution_profile: FAST` (human label `BROWSER_TASK_FAST`), do not start `exploratory-runner.mjs` or create a full QA ledger; return the task result and normalize it to `PASS`, `FAILED`, `N/A` or `UNTEST` when it is presented as a QA result
   - When MCP drivers are unavailable, start `scripts/helpers/native-browser-runtime.mjs` with the same `RUN_ID`; use `observe → decision → action → observe → native-action` for agentic objectives and keep the daemon's `session_id`, `page_id`, `decision_id`, runtime cursor and media references attached to the ledger. Read [references/NATIVE-BROWSER-RUNTIME.md](references/NATIVE-BROWSER-RUNTIME.md) before using session/profile/CDP attach or workers
4. With `SHEET_TESTCASE_EXECUTION` (when user provides a Google Sheet URL/ID containing testcases):
   - **Standard schema is pre-baked** — read [references/TESTCASE_SHEET_SCHEMA.json](references/TESTCASE_SHEET_SCHEMA.json); DO NOT rescan headers each time. Schema summary:
     ```
     Sheet: "Test cases_App"  |  Header row: 9 (0-indexed: 8)
     B=Scenario ID  C=Scenario Name  D=Test case ID  E=Description
     F=Pre-condition  G=Procedure  H=Expected Results
     I=Result  J=Priority  K=Date  L=Tester  M=Notes
     ```
     Columns I-M (idx 8-12) are **write columns**; columns B-H (idx 1-7) are **read-only design**.
   - If G/H contain `[S01]`, `[S02]` markers, treat the row as a structured execution contract: execute each step in order, verify its matching H assertion before continuing, then verify `[OUTCOME]`. Do not collapse the row into one blind click sequence
   - Read [the shared execution contract](../testcase-template/references/execution-contract.md) when the testcase Markdown or JSON is available. `entry` is the required starting route/role/state/data, `target.key` identifies the semantic UI object, and `cleanup` is part of the contract for mutating flows
   - For a legacy text-only row, normalize the missing step IDs, target, wait signal or final oracle during scoped discovery. If the missing field cannot be resolved from requirements, knowledge or the live page, mark the case `Untest` or `N/A`; never invent an expected result or selector
   - A semantic target is not a locator. Resolve the target against the same browser session's DOM and use the locator only after uniqueness, visibility and actionability are verified
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
5. **[BEFORE TEST — VERIFY intelligence provenance]** The preparation command must resolve `<project-root>/qa-knowledge/knowledge-index.json` and current source artifacts before UI execution:
   - If index exists: load only the shard(s) matching the feature/ticket scope — DO NOT load the full guide
   - For the prepared run, read `business-execution-card.json` before any full brief or Markdown; do not load both projections simultaneously
   - If index missing: read `app-business-guide.md` as fallback; then read `<feature-slug>-business-guide.md` if it exists
   - Read `permission-matrix.json` (machine-readable, NOT `rbac-matrix.md`) when preparing role-based or security tests
   - Extract and reuse: routes, roles, state transitions, validation rules, API contracts, side effects, compact business-model nodes/relations/invariants, reusable assets, source file/line and confidence
   - When source or UI is available only for reading, use it to form candidate oracles and impacted areas; do not mutate code, app data or permissions and do not upgrade a static claim to runtime truth
   - When a hidden rule is applicable, schedule a safe runtime probe for uniqueness, authorization, side effects and oracle clarity. Every applicable plan entry needs a `safe_strategy`; every `not_applicable` entry needs a reason and applicability basis. If duplicate data, comparison role, before/after read-back or an explicit expected result is unavailable, preserve the claim as `CANDIDATE`, `INCONCLUSIVE` or `UNTEST` at the user-facing result boundary
   - If guide is older than current sprint or environment has changed: flag fields as `unresolved` and re-verify during test
   - If NO guide exists at all: run scoped discovery for a retest; use `APP_BASELINE_DISCOVERY` only for an explicit full-app/bootstrap request
   - If a discovery scanner exits non-zero or a canonical artifact is missing, keep the run `BLOCKED`; do not reuse an older artifact as a fresh oracle
6. With `RETEST_TICKET` -> read ticket via `plane-qa`, record scoped Business Discovery as the shared foundation, then create the mandatory RETEST_PLUS ledger with all 6 items: **Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX**. Full workflow: [references/RETEST-PLUS.md](references/RETEST-PLUS.md).
7. Copy the test contract from the `READY` brief. Do not rewrite it from memory or replace missing fields with generic steps.
8. Run CLI/scripts for clear and repetitive flows; only use browser agent/MCP for interactive branches not yet understood.
9. Update verdict/evidence into the ledger immediately after each layer; every user-facing result must be `PASS`, `FAILED`, `N/A` or `UNTEST` with a reason when it is not `PASS`
   - In exploratory mode, create `rule-plan` before browser action. For a natural-language/non-deterministic objective, observe the live page, create `task-plan`, write a `decision` before each autonomous action and link its `decision_id` to the verified `action`; after every action re-observe, evaluate the previous goal and update compact memory. Record applicable hidden-rule results with `rule-probe`, record the declared dimensions with `coverage`, decide each high-priority charter with `charter`, and finalize the runner before `run-manifest.mjs finish`. A budget stop, missing target, missing data, missing authority or missing oracle is `UNTEST`; retry-derived `RECOVERED`/`FLAKY` is not a clean `PASS`
10. Separate the original ticket verdict from new bugs, then apply the fixed state map via `plane-qa`.
11. After every QA run, run `node scripts/analysis/finding-reconciler.mjs --findings evidence/<run-res>.json --permission-matrix <pm.json>` to close the feedback loop, bundle evidence via `scripts/helpers/collect-evidence.mjs`, and finalize via `scripts/helpers/run-manifest.mjs finish <RUN_ID>`. The `FAST` profile finishes with its task result and evidence packet instead
12. **[AFTER EVERY QA RUN — WRITE knowledge]** Update the business guide before closing the session — this is mandatory for full QA profiles and does not apply to `EXPLORATORY_BROWSER_QA` with `execution_profile: FAST`:
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
13. Complete the senior operating ledger before sign-off: record environment/data readiness, executed versus untested counts, evidence completeness, flaky or infrastructure failures, defect triage decisions, risk coverage, unresolved limitations and the post-release owner when deployment is in scope. Do not report only a browser verdict
    If guide already exists: set `previous_guide` path and `merge_confirmed: true` in JSON update; do not delete any fact the current run did not touch

Exploratory result map: `PASS`, `FAILED`, `N/A`, `UNTEST`. Plane state transitions remain integration-specific and must not add a fifth exploratory result value

## Knowledge scope decision

- `APP_BASELINE_DISCOVERY`: bootstrap project lacking `qa-knowledge/knowledge-index.json`. Run `scripts/helpers/extract-flow.mjs` first; map modules → traverse accessible main business flows, role/state/input/side-effect/integration/UI/UX and coverage gaps.
- `REPO_BUSINESS_DISCOVERY`: run `node scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode <full|incremental> --parallel auto --graphify auto`. Incremental mode collects committed, staged, unstaged and untracked changes, selects conservative API/UI/DB/RBAC/state scanner impact, and fails closed on scanner/artifact errors. Graphify runs code-only when available and contributes dependency candidates; canonical QA-skill scanners still produce rules, flows, contracts and permissions. Use `--graphify required` only when Graphify itself is required by the user
- `SHEET_TESTCASE_EXECUTION`: load `qa-knowledge/app-flow-map.json`, generate the plan with `node scripts/helpers/execute-sheet.mjs --sheet-url <URL> --module <requested-if-known> --parallel --plan-only`, show the resolved module scope, then ask the user to confirm module, worker count 1-4 and worker selection. Run only confirmed assignments and import image/video-backed results. Finish every `SHEET_EXECUTION_PLUS` layer
- `RETEST_TICKET`: do not rescan the full app. Run Scoped Business Discovery from ticket/index shards, refresh only missing or stale feature knowledge, then finish every RETEST_PLUS row.
- `SANITY_REGRESSION` and the full `EXPLORATORY_BROWSER_QA` profile (`EXPLORATORY_ADHOC` alias): start from the live UI; reuse existing guides when present, expand `DISCOVERY_CORE`, and update knowledge exactly in the inspected scope. The `FAST` profile does not write business-guide facts.
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
- **DO NOT replace business-risk exploration with a generic element checklist** — derive charters from requirement, knowledge, source and runtime signals
- **DO NOT call a static source claim runtime-verified** — preserve provenance and reconcile contradictions explicitly
- **DO NOT treat Graphify output as a business rule, expected result or coverage proof** — keep every relation `source-derived-candidate` and preserve `EXTRACTED`, `INFERRED` or `AMBIGUOUS`
- **DO NOT confuse the bounded `contextSlice` or HTML overview canvas with project completeness** — retain all normalized nodes/relations by default and retrieve only the relevant slice into AI context
- **DO NOT let an optional HTML companion replace canonical JSON, Markdown, Excel or XMind** — render only after the source artifact validates

## Canonical artifact layout

```text
<project-root>/
├── .env
├── auth.json
├── evidence/
│   ├── exploratory/<run-id>/ (run.json, redacted action ledger and stop state)
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
│   ├── context/
│   │   ├── business-execution-brief.json  ← canonical gate/audit artifact
│   │   ├── business-execution-card.json   ← bounded model-facing projection
│   │   └── context-budget.json             ← deterministic budget/cache telemetry
│   ├── repositories/<repo>/graphify-discovery.json
│   ├── repositories/<repo>/graphify-code-only/graphify-out/
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
| `scripts/helpers/context-card.mjs` | Project a bounded model-facing execution card and write deterministic context-budget telemetry |
| `scripts/helpers/prepare-test-intelligence.mjs` | Refresh stale source knowledge, build the brief, rank risks and generate evidence-linked exploratory charters |
| `scripts/helpers/record-model-usage.mjs` | Ingest provider/host-reported token, latency and cost telemetry without putting it into the model-facing card |
| `scripts/helpers/evaluate-business-intelligence.mjs` | Compare a READY brief with a project golden dataset using deterministic precision/recall |
| `scripts/helpers/validate-host-smoke.mjs` | Fail-closed validation of Antigravity same-session smoke evidence |
| `scripts/helpers/exploratory-runner.mjs` | Runtime ledger, agentic task-plan/decision/replan state, rule-plan/probe/coverage gate, action/time budget, same-session page binding, selector/safety checks and exploratory PASS evidence gate |
| `scripts/helpers/native-browser-runtime.mjs` | First-party Playwright/CDP session daemon, AX observation, priority-based target resolution, bounded recovery and isolated 1–4 worker pool |
| `lib/native-browser.mjs` | Native browser session/pool implementation with masked screenshots and same-session observer |
| `scripts/discovery/graphify-adapter.mjs` | Run optional Graphify code-only discovery or import graph.json, retain the complete normalized project graph and produce a separate token-bounded context slice |
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
| `scripts/writers/render-intelligence-html.mjs` | Render and validate an optional self-contained interactive view from canonical QA intelligence JSON |
| `scripts/helpers/log-bug.mjs` | Log Plane bug with inline image evidence |
| `scripts/helpers/login.mjs` | Create auth.json |
| `lib/driver.mjs` | Headless browser + screenshot to file |
| `lib/ui.mjs` | Scope snapshot, network recording, `withRevert` |
| `lib/wait.mjs` | Same-session adaptive document/XHR/fetch readiness and bounded quiet-window telemetry |
| `lib/change-impact.mjs` | Conservative incremental scanner selection by changed-file business impact |
| `lib/git-changes.mjs` | Collect committed, staged, unstaged and untracked source paths |
| `lib/discovery-gate.mjs` | Fail-closed scanner result and canonical-artifact gate |
| `lib/model-telemetry.mjs` | Normalize optional provider-reported token/latency/cost telemetry |
| `lib/assert.mjs` | `check/eq/summary` compact |

## Related skills

- [playwright-pom-automation](../playwright-pom-automation/SKILL.md) — write deterministic test-as-code (DIFFERENT from this live exploratory)
- [testcase-template](../testcase-template/SKILL.md) — document Excel test cases (DIFFERENT from this bug hunting)
- [testcase-template execution contract](../testcase-template/references/execution-contract.md) — structured steps shared by Sheet execution and POM automation
- [doc-to-md](../doc-to-md/SKILL.md) — convert PDF/DOCX to MD for AI to read spec
- [mobile-qa](../mobile-qa/SKILL.md) — native Android/iOS Appium execution and authorized proxy interception
