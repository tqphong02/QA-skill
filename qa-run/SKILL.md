---
name: qa-run
description: Plan or execute browser QA on an existing project, including app baseline discovery to learn business flows and logic, ticket retest, sanity, impacted regression, exploratory/ad-hoc testing, UI/UX audit, evidence capture, release sign-off, and persistent business-flow knowledge handoff. Read the app guide then matching feature guide before testing and update affected guides after every run. Every ticket retest automatically runs RETEST_PLUS. Not for writing new automation scripts or creating testcase documents.
---

# QA Run

**Core principle:** Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. **Data is fetched based on the working directory** (cwd or `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` are in the tested project folder — DO NOT mutate the skill folder. When loading knowledge, prioritize `qa-knowledge/knowledge-index.json` before reading specific scope files.

> **When to use**: discovering new bugs, verifying bugs, ad-hoc UI/API poking on a web app, sanity/risk-based recurring runs, regression (fixed testcases) placed in the project instance.
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI.

## Reference Router

Read only the file(s) matching the current task:

> **Model note**: If running on a fast or small-context model (Gemini Flash, GPT-4o-mini, etc.), ALWAYS load [references/INTELLIGENCE-BOOST.md](references/INTELLIGENCE-BOOST.md) alongside the task-specific file below. Do not skip this even if the task seems simple.

| Situation | File to read |
|---|---|
| Running full QA pipeline, REPO_BUSINESS_DISCOVERY or UI_BUSINESS_RECONCILIATION | [references/PIPELINE.md](references/PIPELINE.md) |
| Executing UI testing — Steps A-D, charter, UI/UX audit, technique selection | [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Choosing MCP/Playwright tool or optimizing speed and intelligence | [references/MCP-CHEATSHEET.md](references/MCP-CHEATSHEET.md) |
| Retesting a bug ticket or running impacted regression | [references/RETEST-PLUS.md](references/RETEST-PLUS.md) |
| Setting up QA for a new project, deep dive, logging bugs, handoff to Plane | [references/PROJECT-SETUP.md](references/PROJECT-SETUP.md) |
| Preparing test data or optimizing token usage | [references/TEST-DATA.md](references/TEST-DATA.md) |
| Encountering a common workflow error or troubleshooting | [references/COMMON-MISTAKES.md](references/COMMON-MISTAKES.md) |
| Playwright MCP unavailable or switching to Antigravity | [references/ANTIGRAVITY-FALLBACK.md](references/ANTIGRAVITY-FALLBACK.md) |
| Using fast/small model, getting shallow verdicts, or model hallucinates PASS | [references/INTELLIGENCE-BOOST.md](references/INTELLIGENCE-BOOST.md) |

## Cross-model hard gates

Apply the following exact order for all models, especially fast or small-context models:

1. **Initialize Run Manifest**: Always call `node scripts/helpers/run-manifest.mjs start` before running tests.
2. Classify the request before opening the browser: `APP_BASELINE_DISCOVERY`, `RETEST_TICKET`, `SANITY_REGRESSION`, `EXPLORATORY_ADHOC`, `SHEET_TESTCASE_EXECUTION` or `AUTOMATION_BUILD`.
3. With `SHEET_TESTCASE_EXECUTION` (when user provides a Google Sheet URL/ID containing testcases):
   - **Standard schema is pre-baked** — read [references/TESTCASE_SHEET_SCHEMA.json](references/TESTCASE_SHEET_SCHEMA.json); DO NOT rescan headers each time. Schema summary:
     ```
     Sheet: "Test cases_App"  |  Header row: 9 (0-indexed: 8)
     B=Scenario ID  C=Scenario Name  D=Test case ID  E=Description
     F=Pre-condition  G=Procedure  H=Expected Results
     I=Result  J=Priority  K=Date  L=Tester  M=Notes
     ```
     Columns I-M (idx 8-12) are **write columns**; columns B-H (idx 1-7) are **read-only design**.
   - Run `node scripts/helpers/execute-sheet.mjs --sheet-url <URL>`
   - For full suite execution -> add `--parallel --workers 4`
   - **Write-back rules**: `Result` col I: exactly `Pass`, `Fail`, `N/A`, `Untest` (case-sensitive). `Priority` col J: exactly `Critical`, `High`, `Medium`, `Low`. `Note` col M: mandatory when Fail/Untest/N/A — concise manual-friendly context (no stacktraces, no raw HTTP codes).
4. **[BEFORE TEST — READ knowledge]** Resolve `<project-root>/qa-knowledge/knowledge-index.json` first:
   - If index exists: load only the shard(s) matching the feature/ticket scope — DO NOT load the full guide
   - If index missing: read `app-business-guide.md` as fallback; then read `<feature-slug>-business-guide.md` if it exists
   - Read `permission-matrix.json` (machine-readable, NOT `rbac-matrix.md`) when preparing role-based or security tests
   - Extract and reuse: routes, roles, state transitions, validation rules, API contracts, reusable assets
   - If guide is older than current sprint or environment has changed: flag fields as `unresolved` and re-verify during test
   - If NO guide exists at all: run `APP_BASELINE_DISCOVERY` for the feature scope first
5. With `RETEST_TICKET` -> read ticket via `plane-qa`, create a ledger with all 6 items: **Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX**. Full workflow: [references/RETEST-PLUS.md](references/RETEST-PLUS.md).
6. Write the test contract including `Target`, `Role/Data`, `Original flow`, `Expected`, `Impact area`, `Stop condition` and reused knowledge.
7. Run CLI/scripts for clear and repetitive flows; only use browser agent/MCP for interactive branches not yet understood.
8. Update verdict/evidence into the ledger immediately after each layer; do not conclude if any item lacks a verdict or `BLOCKED/PARTIAL` reason.
9. Separate the original ticket verdict from new bugs, then apply the fixed state map via `plane-qa`.
10. After every run, run `node scripts/analysis/finding-reconciler.mjs --findings evidence/<run-res>.json --permission-matrix <pm.json>` to close the feedback loop, bundle evidence via `scripts/helpers/collect-evidence.mjs`, and finalize via `scripts/helpers/run-manifest.mjs finish <RUN_ID>`.
11. **[AFTER EVERY RUN — WRITE knowledge]** Update the business guide before closing the session — this is mandatory, not optional:
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
- `SHEET_TESTCASE_EXECUTION`: always load `qa-knowledge/app-flow-map.json` before interacting. Run `node scripts/helpers/execute-sheet.mjs --sheet-url <URL> --parallel --workers 4`.
- `RETEST_TICKET`: do not rescan the full app. Read index shards for ticket scope. If index/guide is missing, discover enough to create/refresh the feature guide, then run RETEST_PLUS.
- `SANITY_REGRESSION` and `EXPLORATORY_ADHOC`: reuse existing guides and expand knowledge exactly in the inspected scope.
- Do not call baseline exhaustive if you have not traversed enough modules, roles, states or data. Log `covered`, `partial`, `blocked` or `not_covered` in `coverage_map`.

## Critical red flags (hard stop)

These must be observed at all times, even before reading any reference file:

- **DO NOT run destructive tests** (delete, drop, wipe data) without explicit user authorization
- **DO NOT skip any hard gate** — all 10 gates above are mandatory regardless of context or time pressure
- **DO NOT conclude PASS when lacking evidence** — absence of visible error is not evidence of passing
- **DO NOT use fallback (Antigravity/CLI) as a substitute for MCP** without first confirming MCP is genuinely unavailable
- **DO NOT overwrite existing artifacts** (`auth.json`, `evidence/`, `qa-knowledge/`) without reading the existing content first

## Canonical artifact layout

```text
<project-root>/
├── .env
├── auth.json
├── evidence/
│   ├── runs/<run-id>/ (manifest.json, screenshots/, logs/, redacted/)
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
| `scripts/helpers/run-manifest.mjs` | Initialize & log Run Manifest for full traceability |
| `scripts/helpers/extract-flow.mjs` | Extract business flows from web app (DOM + network + CDP) |
| `scripts/helpers/execute-sheet.mjs` | Run testcases from Google Sheet with parallel workers |
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
