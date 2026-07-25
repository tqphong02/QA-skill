---
name: qa-run
description: Plan or execute browser QA on an existing project, including app baseline discovery to learn business flows and logic, ticket retest, sanity, impacted regression, exploratory/ad-hoc testing, UI/UX audit, evidence capture, release sign-off, and persistent business-flow knowledge handoff. Read the app guide then matching feature guide before testing and update affected guides after every run. Every ticket retest automatically runs RETEST_PLUS. Not for writing new automation scripts or creating testcase documents.
---

# QA Run

**Core principle:** Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. **Data is fetched based on the working directory** (cwd or `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` are in the tested project folder — DO NOT mutate the skill folder. Do not assume the engine is located in `.claude`, `.codex`, `.gemini` or a specific home directory. When loading knowledge, prioritize `qa-knowledge/knowledge-index.json` before reading specific scope files

> **When to use**: discovering new bugs, verifying bugs, ad-hoc UI/API poking on a web app, sanity/risk-based recurring runs, regression (fixed testcases) placed in the project instance.
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI.

## Enterprise QE Pipeline (15 Tầng Khép kín)

```
Intent Router → Run Planner & Dependency Graph → Manifest Initializer (run-manifest.mjs)
  → Safety Guard (Default BLOCKED) → Knowledge Validator (validate-knowledge.mjs)
  → Worker Account & Data Isolation (data-factory.mjs) → Runtime Observer (runtime-observer.mjs)
  → Executors (Checklist / Mutation / Visual Audit / Visual Regression / UX Journey)
  → Evidence Redaction & Packaging (collect-evidence.mjs) → AI Analyzer & Oracle
  → Result Normalizer → Idempotent Exporters → Cleanup & Orphan Verification → Knowledge Delta Update → Manifest Finalizer
```

## REPO_BUSINESS_DISCOVERY (Static Source Code Analysis Pipeline)

Activated when the user requests: `Analyze this repo`, `Learn business flow from source code`, `Scan system logic`, `Update knowledge from repository`, `Create business guide from code`.

```bash
# Analyze a repo
node scripts/repo-business-discovery.mjs --repo /path/to/backend --mode full

# Only update changes
node scripts/repo-business-discovery.mjs --repo /path/to/backend --mode incremental

# Analyze multiple repos simultaneously
node scripts/repo-business-discovery.mjs --workspace /path/to/project --repos frontend,backend --mode full
```

Output: `qa-knowledge/repositories/<repo-name>/` includes:
- `repo-metadata.json` — repo type, framework, modules, commit
- `symbol-index.json` — class, function, enum, route, decorator, validation
- `architecture-map.json` — Module → Controller/Service/Repository + integrations
- `api-contracts.json` — endpoint, method, auth, roles
- `business-rules.json` — rule with ruleId, category, condition, failureResult, confidence
- `knowledge-index.json` — entry index for scope load, pointing to flow/rule/contract shards
- `system-overview.md` — compatible summary for human reading
- `flows/`, `rules/`, `contracts/`, `evidence/` — shard knowledge by scope
- `business-guide.md` *(Phase 3, compatibility)* — guide tổng hợp 18 sections khi cần bàn giao hoặc fallback

When `system-business-guide.md` exists at `qa-knowledge/merged/`, `qa-run` and `business-analysis` read from it for enriched context. When the project already has `qa-knowledge/knowledge-index.json`, only load the shards pointed to by the index instead of reading the entire large guide

## UI_BUSINESS_RECONCILIATION (UI vs Source/Docs/Runtime Reconciliation Pipeline)

Activated when the user requests: `Infer flow from UI`, `Reconcile UI with backend/BRD`, `Find UI vs Source Code conflicts`, `Generate questions for BA/PO/Dev from UI`.

```bash
# Scan a live page or snapshot and run the 7-step pipeline:
node scripts/ui-business-reconciliation.mjs --page order-detail
node scripts/ui-business-reconciliation.mjs --url https://app.example.com/orders/123 --page order-detail
```

5-tier reconciliation source priority: **Runtime Verified → Source Code & API → BRD/SRS Docs → UI Observed → AI Inference**.

Output: `qa-knowledge/ui-business/<page-slug>/` includes:
- `ui-components.json` — Filter components with business meaning & intent
- `observed-flow.json` — UI observed flow & state sequence (DRAFT → SUBMITTED → APPROVED → COMPLETED / CANCELLED)
- `business-conflicts.json` — Report classifying 9 results (`MATCHED`, `UI_ONLY`, `DOC_ONLY`, `CODE_ONLY`, `CONFLICT`, `AMBIGUOUS`, `UNREACHABLE`, `MISSING_TRANSITION`, `PERMISSION_CONFLICT`)
- `unresolved-rules.json` — Detect 10 specific ambiguity patterns
- `clarification-qna.json` — Clarification questions for BA, PO, Dev
- `ui-business-guide.md` — Full 12-section Markdown report

## Cross-model hard gates

Apply the following exact order for all models, especially fast or small-context models:

1. **Initialize Run Manifest**: Always call `node scripts/run-manifest.mjs start` before running tests to support full traceability within the collected evidence scope.
2. Classify the request before opening the browser: `APP_BASELINE_DISCOVERY`, `RETEST_TICKET`, `SANITY_REGRESSION`, `EXPLORATORY_ADHOC`, `SHEET_TESTCASE_EXECUTION` hoặc `AUTOMATION_BUILD`
3. Với `SHEET_TESTCASE_EXECUTION` (when user provides a Google Sheet URL/ID containing testcases):
   - **Standard schema is pre-baked** — read `references/TESTCASE_SHEET_SCHEMA.json` for columns/rows; DO NOT rescan headers from the Excel/Sheet file each time unless the template uses non-standard custom headers. Schema summary:
     ```
     Sheet: "Test cases_App"  |  Header row: 9 (0-indexed: 8)
     B=Scenario ID  C=Scenario Name  D=Test case ID  E=Description
     F=Pre-condition  G=Procedure  H=Expected Results
     I=Result  J=Priority  K=Date  L=Tester  M=Notes
     ```
     Columns I-M (idx 8-12) are **write columns** the AI writes back to; columns B-H (idx 1-7) are **read-only design** created by testcase-template.
   - Chạy `node scripts/execute-sheet.mjs --sheet-url <URL>`
   - When the user requests to run the entire testcase execution -> add the `--parallel --workers 4` flag to automatically split modules across multiple parallel workers (significantly reducing data conflict risk thanks to the data-factory namespace).
   - **Standard rules for writing results back to the Sheet**:
     - Column `Result` (col I): **MUST EXACTLY MATCH** one of: `Pass`, `Fail`, `N/A`, `Untest` (case-sensitive).
     - Column `Priority` (col J): **MUST EXACTLY MATCH** one of: `Critical`, `High`, `Medium`, `Low`.
     - Column `Note` (col M): Mandatory when Result is `Fail`, `Untest` or `N/A`. **Content must be concise, manual-friendly context (DO NOT write stacktraces, DO NOT expose raw HTTP status codes or raw JSON)**.
4. Resolve `<project-root>/qa-knowledge/knowledge-index.json` first, then only read the shards pointed to by the index; if the project still uses a monolithic guide, read `app-business-guide.md` / `<feature>-business-guide.md` as a compatibility layer and verify 6 hashes via `validate-knowledge.mjs --check`
5. Với `RETEST_TICKET`, read the ticket via `plane-qa`, then create a ledger with all 6 items: Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX
6. Write the test contract including `Target`, `Role/Data`, `Original flow`, `Expected`, `Impact area`, `Stop condition` and reused knowledge
7. Run CLI/scripts for clear and repetitive flows; only use the browser agent/MCP for interactive branches that are not yet understood
8. Update verdict/evidence into the ledger immediately after each layer; do not conclude if any item lacks a verdict or `BLOCKED/PARTIAL` reason
9. Separate the original ticket verdict from new bugs, then apply the fixed state map via `plane-qa`
10. After every run, bundle secrets-scrubbed evidence via `collect-evidence.mjs` and finalize the manifest via `run-manifest.mjs finish <RUN_ID>`

State map: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`

Do not guess PASS when lacking evidence. Do not stop after the happy path. Do not mark the original ticket FAILED due to a new bug with a different root cause.

## Canonical artifact layout

Each project shares a fixed layout so generated files are not scattered:

```text
<project-root>/
├── .env
├── auth.json
├── evidence/
│   ├── runs/
│   │   └── <run-id>/
│   │       ├── manifest.json
│   │       ├── screenshots/
│   │       ├── logs/
│   │       └── redacted/
│   ├── visual-*/
│   └── .runtime-events.json
├── qa-knowledge/
│   ├── knowledge-index.json
│   ├── system-overview.md
│   ├── flows/
│   ├── rules/
│   ├── contracts/
│   ├── evidence/
│   ├── app-business-guide.md
│   ├── app-flow-map.json
│   ├── checklists/
│   ├── merged/
│   ├── repositories/
│   └── ui-business/
├── FINDINGS.md
└── reports/
  ├── retest/
  └── exports/
```

- `qa-knowledge/` prioritize index-first: `knowledge-index.json` is the entry point, shards in `flows/`, `rules/`, `contracts/` are the primary source; `app-business-guide.md` is the compatibility/overview layer
- `evidence/runs/<run-id>/` contains only artifacts for a single run, do not mix different runs
- `FINDINGS.md` at the root is merely a short index for current bugs/live issues, do not stuff long logs here
- `reports/` used for PDF reports or markdown handoffs if the project needs them stored separately
- Do not generate QA files into random folders outside these zones unless mandated by existing scripts for compatibility
- If legacy files are misplaced, prioritize moving them to the standard folder before handoff

When the model has a small context, read only the needed skill/reference parts and keep the ledger on disk or in working notes; do not load the entire snapshot, images, or all references into context.

## Knowledge scope decision

- `APP_BASELINE_DISCOVERY`: use when the user requests overall testing/exploration of a web app, bootstrap project lacking `qa-knowledge/knowledge-index.json`, or explicitly requests index/guide refresh.
  - **Prioritize running `scripts/extract-flow.mjs` first** to extract business flows from DOM + network + JS runtime in a single sweep without reading FE/BE source code.
  - Script auto-logins, browses all navigation, intercepts API calls, maps state machines from status labels, writes `qa-knowledge/app-flow-map.json` (fast AI load) and output shards of `qa-knowledge/knowledge-index.json`.
  - `app-business-guide.md` only serves as a compatibility summary; the main knowledge lies in the index and the shards it points to.
  - **Once the index exists, every subsequent run only reads the index + scope-specific shard — 0 browser actions for the \"understanding context\" phase**; only open the browser when actual verification is needed.
  - Map modules first, then traverse accessible main business flows, role/state/input/side-effect/integration/UI/UX and coverage gaps
- `SHEET_TESTCASE_EXECUTION`: use when user provides a Google Sheet URL or Spreadsheet ID containing the testcase suite.
  - **Read business flows before testing**: Always load `qa-knowledge/app-flow-map.json` (or `app-business-guide.md`) so AI understands the entire app business logic, route, role and state transition before interacting.
  - **Execute UI/UX & Functional in parallel**: When the user requests to run the entire testcase execution, automatically activate `--parallel --workers 4`. Workers divide the testing simultaneously for both **UI/UX** (layout, overflow, truncation via `visual-audit.mjs`) and **Functional** (business logic, mutation, validation via `attack-surface.mjs`).
  - Run `node scripts/execute-sheet.mjs --sheet-url <URL> --parallel --workers 4` to read, divide workers and execute.
  - After testing, auto-update back to Google Sheet with Result (`Pass`/`Fail`/`N/A`/`Untest`), Priority (`Critical`/`High`/`Medium`/`Low`), and Note (manual-friendly context, DO NOT write dry stacktraces or error codes).
- `RETEST_TICKET`: do not rescan the full app. Read `knowledge-index.json` to get relevant shards, then read compatible app/feature guides if available, then run RETEST_PLUS for the ticket and impacted areas. If index/guide is missing, only discover enough to understand the current feature then create the index + shard
- `SANITY_REGRESSION` và `EXPLORATORY_ADHOC`: reuse existing guides and expand knowledge exactly in the inspected scope
- Do not call baseline exhaustive if you have not traversed enough modules, roles, states or data. Log `covered`, `partial`, `blocked` or `not_covered` in `coverage_map`

## The trap this skill exists to prevent

**Test everything every cycle** — running full regression on every change, exhausting time budget, missing real regressions in noise. Skill enforces risk-based, scoped cycles: tiering Sanity -> Smoke -> Regression, only running what's necessary for the context.

## Process

### 1. Understand context first (Principle #1)
\"Smart\" = **no blind clicking**. AI must read & understand logic first, then poke. MANDATORY order:

#### Step 0 — Read saved business guides
- Đọc [references/KNOWLEDGE_HANDOFF.md](references/KNOWLEDGE_HANDOFF.md)
- Read `qa-knowledge/knowledge-index.json` first if present, then only load the exact shards/guides the index points to
- Reuse still-valid flows, roles/data, routes/APIs, state transitions and reusable assets
- Do not read other features' guides and do not skip verification just because the old guide says PASS

#### Step A — Read requirement / spec / AC (IF present)
- Spec/PRD/ticket/AC (file local, URL, hoặc user paste)
- Extract into a list of requirements with IDs: `{ "id":"AC1", "text":"..." }`
- If NO document is provided -> **ask the user** to provide one, or agree to test based on the existing UI
- Details for fetching from Plane: xem `scripts/fetch-plane-issue.sh`

#### Step B — Extract the \"logic map\" before testing
1. **Happy path**: step 1 -> 2 -> 3 -> … -> result
2. **State / role**: who can do what? (admin/user/guest; pending/active/closed)
3. **Inputs & constraints**: what data is valid, ranges, formats
4. **Side-effects**: where does this operation write? (DB, API, queue, email, webhook)
5. **Suspicious edge cases**: concurrency, boundary, timeout, role khác
6. **3rd party integration**: payment, email, calendar, notification, search, AI

#### Step C — Form a charter (purposeful exploratory goal)
Một dòng: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*
- A good charter clearly states the **risk** (not just \"testing for fun\")

#### Step D — Goal-oriented UI driving (via MCP Playwright)
- Happy path -> snapshot every step -> verify state changes correctly
- **Purposeful deviations** at each step: try invalid / boundary / concurrent inputs
- Note exposed console/HTTP errors (`browser_console_messages`, `browser_network_requests`)

### 2. Drive UI via MCP Playwright (Principle #2)

| Task | Method |
|---|---|
| Open page | `browser_navigate` |
| View interactive DOM (headings, buttons, inputs, toasts, console err, HTTP>=400) | `browser_snapshot` |
| Click button / link / text | `browser_click` |
| Fill form | `browser_fill_form` or `browser_type` |
| Run arbitrary JS (probe API, read state) | `browser_evaluate` |
| Wait for text / state | `browser_wait_for` stable text (no hard `wait_for_timeout`) |
| Test multiple pages / endpoints | `browser_tabs` (open in parallel) |
| View network + console | `browser_network_requests` / `browser_console_messages` |
| Compare baseline | `browser_take_screenshot` (when pixel comparison is needed) |

### 3. Speed & Intelligence Optimization

#### Increase speed (reduce round-trips, reduce payload)
| Pattern | Instead of | Benefit |
|---|---|---|
| Scope snapshot | snapshot full page | Small payload 5-20x |
| Batch fill | multiple `browser_type` | 3 round-trips -> 1 |
| Batch evaluate | N lần `browser_evaluate` | 1 round-trip |
| Wait deterministic | `wait_for_timeout` hard | No redundant waiting |
| Parallel tabs | sequential navigate | Parallel probe |
| Block heavy resource | load full assets | 2-5x faster |
| Reuse context | login per probe | Skip login |

#### Increase intelligence
1. **Heuristic checklist by feature type** - Form/Table/Filter/Auth/Modal/Async/Data
2. **Cross-verify (DO NOT only trust snapshot)** - DOM + network + console ≥ 2 sources
3. **Pattern memory** - read matching feature business guide first, then read `FINDINGS.md` + related evidence when needed
4. **Parallel agent fan-out** - 3-5 agents probe simultaneously (only when user opts in)
5. **Charter with risk taxonomy** - H/M/L priority probe first
6. **Screenshot-first evidence** - if there are image evidences, prioritize `visual-evidence-router.mjs` / OmniParser to ground elements, labels and bounding boxes first; only fallback to OCR or general vision when OmniParser is unavailable or exact characters need extracting, do not convert whole PNG/JPG to markdown

### 4. UI/UX & Interaction testing
During retest/sanity: always scatter 2-3 UX checks in the fix area (because functional fixes sometimes cause UX issues).

**Correct UI/UX workflow:**
1. **Run `visual-audit.mjs` first** — script automatically measures overflow, clipping, touch targets, loading states, empty states, z-index conflicts on both desktop and mobile
2. **Read JSON findings** — AI knows exactly which element has issues without full page snapshot
3. **Embed 2 screenshots** (desktop + mobile) into context — AI vision analyzes real images instead of guessing from DOM text
4. **Check AI Vision Checklist** in JSON output — 8 specific items for AI to look at in the image
5. **If screenshot is the main evidence** — run OmniParser/`visual-evidence-router.mjs` first to get bounding box + label + interactable state; only OCR when image contains text needing exact matching or OmniParser lacks context, do not use `doc-to-md` to convert image to markdown

```bash
cd <project-root>
QA_RUN_SKILL_DIR=/path/to/qa-run node /path/to/qa-run/scripts/visual-audit.mjs --path /dashboard
# Output: evidence/visual-1440-*.png + evidence/visual-375-*.png + evidence/visual-audit-*.json
```

**Top 4 common UI bugs** (see `references/UI-BUG-CATALOG.md`):
1. Action safety (delete without confirm)
2. Overlap-z-index (modal/tooltip obscures important button)
3. Overflow-truncation (text cuts off amount/name/ID)
4. State-loading (loading state missing, fake \"0\")

**3 measurable bug types** (see `browser_evaluate`):
- Unresponsive click: 250ms latency / double-fire / pointer-events:none
- Lag/Jitter: long-task > 100ms
- Spam button: request > 1 in a single click

**When image files exist in evidence**
- Use screenshot as the direct source of truth for UI state, do not force convert to text before analyzing
- If the image is a flow/UI screenshot, prioritize `visual-audit.mjs`, `visual-evidence-router.mjs` or an image viewer tool to ground elements, labels and layout
- Only convert image to text when needing OCR for image content, e.g. text on banner, toast, modal, QR, or when DOM/network isn't enough to verify
- Do not save images as intermediate text files unless necessary, as it loses visual context


### 5. Technique Selection (12 techniques)
See `TESTING-TECHNIQUES.md` for details + coverage matrix.

12 techniques: Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression).

**Hard gate for Exploratory/Ad-hoc (MANDATORY):**
1. Read `qa-knowledge/knowledge-index.json` first; only if absent, use `app-flow-map.json` or `app-business-guide.md` as fallback.
2. **Auto-generate Markdown Checklist for page/feature**:
   - Chạy `node scripts/generate-checklist.mjs --path /feature-path --feature "feature-name"`
   - Output: `qa-knowledge/checklists/<feature-slug>-checklist.md`
   - Script automatically scans 100% of items, buttons, input fields, tables, modals on screen and generates a ready-to-test checklist.
3. Determine feature type to test (Form? Table? Modal? Auth? CRUD? Async? File?) from `references/ATTACK-TAXONOMY.md` — select 3-5 priority attack vectors.
4. For Form/Auth: run `attack-surface.mjs` to auto-inject mutations before manual clicking.
5. For UI/UX: run `visual-audit.mjs` first — read JSON + view real image.
6. AI goes through each line in the generated `<feature-slug>-checklist.md` file, tests and marks `[x]` PASS or `[ ]` FAIL with a brief reason. Do not blind-click and do not miss any elements/buttons on the UI.


### 6. RETEST_PLUS workflow (when user provides a ticket or requests a retest)
This is the most common case: *"Dev says fix is done, please retest this ticket"* → user just pastes URL.

RETEST_PLUS uses app/feature guides to reduce redundant exploration and does not auto-run full-app baselines. Only expand discovery when the ticket hits an area lacking knowledge or with a stale guide.

#### Step 0 — Confirm scope
- If user explicitly states "retest #X" / "verify fix #X" → straight to step 1
- If only saying "test #X" → ask 1 question: *"Retest fix #X or explore feature #X to find new bugs?"*

#### Step 1 — Fetch ticket (DO NOT ask again)
- Parse Plane URL -> call API -> extract AC, steps, expected, dev notes
- Error 401/404/403 -> tell user to check API key + URL

#### Step 1.5 — Load business context before browser action
- Read [references/KNOWLEDGE_HANDOFF.md](references/KNOWLEDGE_HANDOFF.md) first to know the knowledge merge protocol
- Read `qa-knowledge/knowledge-index.json` then only read the exact shard/guide for the ticket scope
- If guide is missing or stale, only open discovery enough to create/refresh feature guide for the ticket scope, do not rescan full app
- Extract test contract including role, state transition, validation, side effect, API/network and impacted dependency before the first click
- If the business flow cannot be described in 1-2 clear sentences, stop and add context before verifying

#### Step 2 — Extract AC
- Main AC (happy path): \"When user does X, system must do Y\" -> case MUST PASS
- Secondary AC (edge case): empty input, concurrent, different role -> must also test
- Repro steps of original bug (if bug ticket) -> run exact steps again
- Adjacent area (AI infer): what flow is the fix in? -> poke to see if it breaks
- Interpret AC into testable business rules, do not stick to ambiguous wording in ticket if context is missing

#### Step 3 — Verify each AC
For each AC:
1. Setup conditions (login correct role, clear localStorage, **prepare test data**)
2. Execute exact repro steps (DO NOT arbitrarily add weird steps)
3. Snapshot after each step -> compare with \"Expected\" in AC
4. Verify network response too (if AC involves persist/calculation)
5. Mark PASS/FAILED for each AC — DO NOT lump into \"overall OK\"

#### Step 4 — RETEST_PLUS coverage (MANDATORY)
- Retest exact original flow
- Sanity main happy path of module
- Impacted regression by fix area and dependency
- Exploratory includes boundary, negative, alternate sequence, refresh/retry
- Ad-hoc includes adjacent controls, cancel/reopen, double action, appropriate navigation/session
- UI/UX includes overlap, clipping, overflow, modal/dropdown/popup, viewport, loading/error/focus

Adjacent area check in the above layers:
- Click related buttons/tabs/lists -> snapshot -> any new bugs?
- Create 1 record via different flow (e.g. import file instead of form) -> share validation?
- Refresh/back mid-flow -> is state dirty?
- Change user role (e.g. guest views admin page) -> permission leak?
- `browser_console_messages` + `browser_network_requests` at end of session -> any weird warning/error?

#### Step 5 — Verdict + report
```
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAILED>
**Requirement source:** <URL ticket fetched>
**Business flow:** <1-2 sentence summary of confirmed flow>
**AC1 (<mô tả>):** PASS  — <1 line evidence>
**AC2 (<mô tả>):** FAILED  — <observed deviation>
**Adjacent:** PASS — <short note>
**Verdict:** PASS (if all main ACs PASS) / FAILED (if >=1 main AC FAILED)
```
- Write `FINDINGS.md` in standard format (`report/REPORT-TEMPLATE.md`)
- Merge confirmed knowledge according to `references/KNOWLEDGE_HANDOFF.md`; prioritize updating `knowledge-index.json` and shards, only use `app-business-guide.md` / feature guide as compatibility layer when handoff or fallback is needed
- Chạy `node scripts/write-business-guide.mjs --check <guide.md>` and read guide again before handoff
- If FAILED -> comment evidence and drag original ticket to In Progress
- If PASS -> comment evidence and drag original ticket to Done
- If BLOCKED -> keep state
- Bug with different root cause -> open new bug in Todo

### 7. Process for 1 project

#### 0. Setup (1 time per project)
In the **project's QA folder** (vd `MyProject/qa/`), tạo `.env`:
```
QA_BASE_URL=https://app-cua-du-an.com
QA_EMAIL=...
QA_PASSWORD=...
QA_PROJECT_NAME=MyProject
```

**Step 0.1 — Run extractor once to bootstrap all business knowledge:**
```bash
cd MyProject/qa
QA_RUN_SKILL_DIR=/path/to/qa-run node /path/to/qa-run/scripts/extract-flow.mjs
# Kết quả: qa-knowledge/knowledge-index.json + qa-knowledge/app-flow-map.json + shard guides tương ứng
```
Options:
```bash
--max-pages 20    # limit scanned pages (default: 30)
--wait 1500       # ms wait after each navigate (default: 1200)
--reauth          # force re-login even if auth.json exists
--dry-run         # only print navigation, do not write files
```

**Sau khi có guide**, AI sẽ đọc `qa-knowledge/app-flow-map.json` instead of rescan —
saves 80-90% tokens in \"context understanding\" phase, only open browser when actual verification needed.

Then (run FROM that folder so data writes to correct project) — use MCP Playwright to login:
- `browser_navigate(BASE + '/login')` → `browser_snapshot` → `browser_fill_form` (email/password) → `browser_click` submit → `browser_wait_for` url changes -> save cookie (Playwright MCP auto manages session).

> If project needs auth.json for npm Playwright scripts to run (regression/batch): `node scripts/login.mjs` -> create `auth.json` + `evidence/` here.

#### 1. Broad discovery (default: UNDERSTAND first -> DRIVE later)
See @Step A-D above.

With `APP_BASELINE_DISCOVERY`, create coverage ledger by module and traverse entry point, happy flow, role/permission, state/persistence, validation/boundary, side effect/integration, API/network and observable UI/UX. Every discovered module must have status `covered`, `partial`, `blocked` or `not_covered` with reason/evidence before stopping.

#### 2. Deep dive into 1 doubt
**Before diving**: reload logic map (Principle #1 Step B) for the doubtful area.

**Method 1** (preferred, fast & \"smart\") — use MCP Playwright interactively:
1. Hypothesize from logic map (no blind guessing) → `browser_click` / `browser_type` / `browser_evaluate` to verify
2. `browser_snapshot` re-read DOM (avoid guessing) — compare with expected state in map
3. `browser_network_requests` view response body / status — verify side-effect (DB persist, message queue, webhook)
4. `browser_wait_for` text appears or changes (không sleep hard)
5. When verdict is clear -> `browser_take_screenshot` only concluding step -> write `FINDINGS.md` in standard format

**Method 2** (needs recurring run / CI) — write short script:
```js
// MyProject/qa/probe-x.mjs  — only write when RECURRING RUN needed (risk-based / sanity / regression)
const skillRoot = process.env.QA_RUN_SKILL_DIR;
if (!skillRoot) throw new Error('QA_RUN_SKILL_DIR is required');
const { browser, snap, shot, BASE } = await import(`${skillRoot}/lib/driver.mjs`);
const { recordNet, waitForStable, withRevert } = await import(`${skillRoot}/lib/ui.mjs`);
const { eq, check, summary } = await import(`${skillRoot}/lib/assert.mjs`);
const { b, page } = await browser();
const net = recordNet(page, /api\/v1/i, { withBody:true });
await page.goto(BASE + '/path');
const total = await waitForStable(() => page.evaluate(readTotal));
printSnap(await snap(page), 'STATE');
eq('Total sau filter', total, 6);
check('Backend persist', net.some(c => c.status===200 && !/\[\]/.test(c.body)));
await shot(page, 'probe-x'); process.exit(summary('#<ticket>') ? 0 : 1);
```
Chạy: `cd MyProject/qa && node probe-x.mjs`. REAL data WRITE operations -> wrap in `withRevert(mutate, revert)`.

#### 3. Log -> `FINDINGS.md` (in project folder)
Each bug: **Quan sát → Expected → Evidence:<png> → Severity → TC**. Group by root-cause.
Report & comment following **standard format** in `report/REPORT-TEMPLATE.md` — rule number 1: **Actual & Steps must newline each point (bullet/numbered), DO NOT write in a single paragraph**.
If it's a retest ticket, report must include: requirement source, business flow, AC-by-AC verdict, adjacent check and distinct evidence paths; do not merge multiple verdicts into one line.

#### 4. Package / handoff — log Plane bug with INLINE image preview
**Mục tiêu**: open Plane ticket -> scroll description -> **see image preview immediately**, NO need to click download file.

**Method**  (verified with Plane self-hosted):
1. Upload image to Plane via endpoint `issues/{id}/issue-attachments/` (S3 presigned) → returns asset URL
2. In `description_html`, embed that URL with `<img src="<plane-asset-url>">`
3. When rendering, Plane displays image inline in description + simultaneously lists in Attachments

> ⚠️ **DO NOT use base64 data URI** in description — Plane self-hosted will **strip image when rendering**. Must use asset URL after upload.

Wrapper script `scripts/log-bug.mjs` is ready:
```bash
node <project>/qa/log-bug.mjs --title "[W26][Login] Email validation sai" \
  --module "Login" --severity "High" --screenshots "evidence/probe-430.png" \
  --steps "1. Mở /login\n2. Để trống Email\n3. Click Login" \
  --expected "Show prompt requesting Email" \
  --actual "No prompt, still submitted" \
  --assign "hungtn,phongtq" --state "Todo"
```

### 8. Test data — when lacking data

**When lacking** (common):
- Test filter `Status=Pending` but system has **0 Pending records**
- Test edit/delete but **no record** to edit/delete
- Test boundary but real data **does not touch boundary**

**2 option**:
- **Ask user** (when needing real data, unfakeable, ambiguous)
- **Self-create** (priority - via app's own UI/API)

Self-create qua API (nhanh, ưu tiên):
```js
fetch('/api/events', {
  method: 'POST',
  credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...})
}).then(r => r.json())
```

**Quy tắc khi tự tạo**:
- Idempotent / unique: tên + timestamp
- MANDATORY Cleanup (withRevert) - DO NOT leave junk data
- NO real side-effect: do not send production mail/WhatsApp/SMS
- Moderate volume: 1-3 records are enough
- Correct role

Optional helper: `seed.mjs` in project - function to create test data + cleanup.

### 9. Token-frugal (MANDATORY to keep when writing scripts)
Xem `lib/driver.mjs` + `lib/ui.mjs` + `lib/assert.mjs`:
- `lib/driver.mjs`: headless, screenshot to file (do not return image bytes into context)
- `lib/ui.mjs`: `snap()` only print interactive elements + main text + console/HTTP>=400
- `lib/assert.mjs`: `check/eq/summary` - compact
- Slice response body `.slice(0,200)`; print compactly
- **Golden rule**: 1 probe = 1 question. Name it `probe-<ticket>-<aspect>.mjs`

### 10. Regression (deterministic)
Fixed TC suite, deterministic recurring runs, placed in project instance (e.g. `MyProject/qa/regression/`). DO NOT put in global engine.

Data-driven structure: `cases.mjs` + `run.mjs`, idempotent (withRevert), verdict CI (`process.exit(summary()?0:1)`). Xem `TESTING-TECHNIQUES.md` §5.

### 11. API key configuration
Configure key once at `../config/api_keys.json` (gitignored), usable for all 3 skills in qa-skill repo. See [README.md](../README.md) \"API Keys\" section and `scripts/ai_provider.py`.

### Appendix — ported modules
Ported modules:
- **A.1 Test Data Generator** — standard format `[prefix]_[testName]_[timestamp]_[random]`, helper tại `lib/tdata.mjs`

Unported concepts (for roadmap): A.2 Flaky Detector, A.2 Locator Healer, A.3 UI/API Flow Generator.

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| `Cannot find .env` | wrong cwd | `cd ~/Documents/QA-MDS/<project>` before running |
| `401 Unauthorized` (Plane) | wrong/expired API key | Rotate key in Plane Profile |
| Skill not appearing | Folder in wrong location | Run `scripts/doctor-agent.sh --agent=<host>` from repository then open new agent session |
| AI blind clicks without understanding | Skips Step A-D | MANDATORY to read spec first |
| Push to GitHub but leak auth.json | Forgot `.gitignore` | `git rm --cached auth.json` + rotate key |
| Self-create data rác không cleanup | DB pollution, affects other tests | Wrap in `withRevert()` or use `afterAll` |
| Click → sleep(500) hard | Flaky CI | Use `browser_wait_for` text to appear |
| Snapshot full page every time | Large payload, slow | Scope snapshot: only interactive elements |
| Image in Plane bug appears broken | Used base64 data URI instead of asset URL | Upload via `issues/{id}/issue-attachments/` then embed URL |

## Output format

- Plane comments and testcase prose must have no `.` at end of sentence and no emojis/icons
- Preserve ID, URL, filename, formula, code, decimal number and machine-readable values
- PASS comment only has Result + Conclusion + inline image
- FAILED comment only adds Actual + Expected
- BLOCKED comment only adds Blocker

## Common mistakes

- **Google Antigravity Fallback** if Claude Code + Playwright MCP is NO longer available:
  - If Claude Code loses access, or Playwright MCP is removed/broken -> **skill still runs on Antigravity** (Google's agentic platform: CLI + IDE + Gemini-in-Chrome). Most skill assets are **portable** — only swapping the \"UI driving brain\".

  - **Portable assets** (runs in any env with Node >= 18):
    | Asset | Portability Reason |
    |---|---|
    | `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm |
    | `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, call `node <script>` |
    | `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API |
    | `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib |
    | **Nguyên tắc #1** (hiểu ngữ cảnh trước khi lái), 5 kỹ thuật testing, workflow retest/sanity | **Methodology** — tool-independent |
    | `.env`, `auth.json`, `evidence/` | Located in project folder, DOES NOT depend on Claude Code |

  - **Needs swapping (only \"UI driving brain\")**:
    | Task | Claude Code (default) | Antigravity (fallback) |
    |---|---|---|
    | Interactive UI driving | `mcp__playwright__browser_*` | **Gemini-in-Chrome** (Antigravity controls Chrome itself) |
    | Fetch ticket from URL | `WebFetch` | Antigravity web tool / `curl` in terminal |
    | Agent reasoning | Claude (model này) | Gemini 3 (Antigravity default) |
    | Run probe script | `node scripts/x.mjs` via Bash tool | `node scripts/x.mjs` via terminal |
    | Log bug | `node log-bug.mjs ...` | `node log-bug.mjs ...` |

  - **Workflow on Antigravity:**
    1. Open Antigravity IDE -> open project folder (vd `MyProject/qa/`)
    2. Agent (Gemini) uses **Gemini-in-Chrome** itself to navigate/click/snapshot/probe API
    3. When needing batch/regression -> agent runs `node <skill-root>/scripts/sweep.mjs`
    4. When logging bug -> agent runs `node log-bug.mjs ...` (portable script)
    5. Verdict + report in same format (`report/REPORT-TEMPLATE.md`)

  - **Notes on fallback:**
    - `auth.json` must exist (Antigravity running npm Playwright scripts needs `auth.json`)
    - Antigravity's Gemini-in-Chrome **DOES NOT** auto-share with playwright headless -> must re-login using `login.mjs`
    - Different model prompt: Gemini 3 understands this workflow if prompted clearly

- **Blind clicking without reading spec** — AI generates wrong verdict (mistaking PASS for FAILED or vice versa). MANDATORY to go through Step A-D.

- **Skip adjacent area check** — functional fixes sometimes break UI elsewhere. Step 4 is MANDATORY.

- **Snapshot full page every time** — payload lớn, tốn token. Scope snapshot chỉ phần tử tương tác.

- **Use hard `wait_for_timeout`** — flaky CI. Always `browser_wait_for` text/event.

- **Hardcode URL/auth in prompt** — secret leak. Use `.env` + auth.json in project folder.

- **Skip teardown** — when poking production apps with side-effects (DB, queue, mail), wrap in `withRevert()` to cleanup.

- **Not writing business guide after run** — AI has to re-explore from scratch next time. Always merge valid knowledge, write guide and validate read-back.

- **Absolute trust in old guides** — environment/version can change. Check verify date, source and confidence then re-verify parts within current scope.

- **Lumped \"overall OK\" verdict** — hides individual failed ACs. MUST mark PASS/FAILED per AC.

## References

### Scripts (`scripts/`)
- [scripts/run-manifest.mjs](scripts/run-manifest.mjs) — **initialize & log Run Manifest (run_id, environment, git_commit, app_version, data_namespace, duration) to trace 100% bugs**
- [scripts/data-factory.mjs](scripts/data-factory.mjs) — **isolate accounts & data namespace for each worker, set retry rules (only retry infra errors, DO NOT retry assertion fails)**
- [scripts/validate-knowledge.mjs](scripts/validate-knowledge.mjs) — **check knowledge freshness, hash routes & git commit, supports module re-discovery on app release**
- [scripts/extract-flow.mjs](scripts/extract-flow.mjs) — **extract business flows from web app (DOM + network + CDP) -> JSON + Markdown, no source code reading needed**
- [scripts/generate-checklist.mjs](scripts/generate-checklist.mjs) — **automatically scan 100% items, buttons, inputs, tables on screen -> create Markdown Checklist (.md) for Exploratory & Ad-hoc testing missing no cases**
- [scripts/attack-surface.mjs](scripts/attack-surface.mjs) — **classify Action Safety (READ_ONLY, SAFE_WRITE, DESTRUCTIVE, EXTERNAL_EFFECT, PAYMENT), auto-inject mutations for READ_ONLY/SAFE_WRITE — 0 tokens**
- [scripts/visual-audit.mjs](scripts/visual-audit.mjs) — **Visual Heuristic Audit: measure overflow/clipping/touch targets/z-index, capture desktop+mobile screenshots**
- [scripts/visual-regression.mjs](scripts/visual-regression.mjs) — **Visual Regression Baseline: compare current image with baseline, pixel diff, mask dynamic areas, new baseline approval process**
- [scripts/journey-audit.mjs](scripts/journey-audit.mjs) — **UX Journey Audit: evaluate user goals end-to-end (Next step clarity, visual hierarchy, feedback quality, actionable error guidance)**
- [scripts/collect-evidence.mjs](scripts/collect-evidence.mjs) — **bundle all screenshots, traces, logs, manifest into complete artifact package `evidence/bundles/<run_id>/`**
- [scripts/execute-sheet.mjs](scripts/execute-sheet.mjs) — **run testcases from Google Sheet, divide parallel workers, batch update standardized results**
- [scripts/login.mjs](scripts/login.mjs) — create auth.json
- [scripts/sweep.mjs](scripts/sweep.mjs) — sweep multiple pages
- [scripts/explore.mjs](scripts/explore.mjs) — exploratory helper
- [scripts/api-health.mjs](scripts/api-health.mjs) — API probe
- [scripts/ux-health.mjs](scripts/ux-health.mjs) — UX heuristic check (performance metrics)
- [scripts/compat.mjs](scripts/compat.mjs) — compat check

### Libraries (`lib/`)
- [lib/driver.mjs](lib/driver.mjs) — headless browser + screenshot to file
- [lib/ui.mjs](lib/ui.mjs) — scope snapshot, network recording, `withRevert`
- [lib/assert.mjs](lib/assert.mjs) — `check/eq/summary` compact
- [lib/tdata.mjs](lib/tdata.mjs) — test data generator `[prefix]_[name]_[ts]_[rand]`

### Reference docs
- [references/UI-BUG-CATALOG.md](references/UI-BUG-CATALOG.md) — Top 4 common UI bugs
- [references/KNOWLEDGE_HANDOFF.md](references/KNOWLEDGE_HANDOFF.md) — protocol to read first, merge and write business guide after run
- [scripts/write-business-guide.mjs](scripts/write-business-guide.mjs) — deterministic renderer/validator for business guide
- [report/REPORT-TEMPLATE.md](report/REPORT-TEMPLATE.md) — format FINDINGS.md
- [TESTING-TECHNIQUES.md](TESTING-TECHNIQUES.md) — 12 detailed testing techniques
- [GUIDE.md](GUIDE.md) — engine setup guide
- [README.md](README.md) — overview qa-run skill

### Related skills
- [playwright-pom-automation](../playwright-pom-automation/SKILL.md) — write deterministic test-as-code (DIFFERENT from this live exploratory)
- [testcase-template](../testcase-template/SKILL.md) — document Excel test cases (DIFFERENT from this bug hunting)
- [doc-to-md](../doc-to-md/SKILL.md) — convert PDF/DOCX to MD for AI to read spec
