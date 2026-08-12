---
name: dynamic-web-exploratory
description: Run UI-first exploratory browser QA and generic web tasks from a URL and natural-language objective. Trigger on open/read/extract/click/fill/download, app discovery, exploratory/ad-hoc, sanity, ticket retest, UI/UX, browser network/console errors, business-flow discovery, triage, or sign-off. Not for deterministic testcase execution, POM/automation code, native mobile, or testcase documents; route testcase BUILD/RUN to dynamic-web-automation. Auto-route; do not require the skill name.
mode: dynamic
surface: web
role: executor
legacy_aliases: qa-run
---

# QA Run

**Core principle:** Không full regression mỗi cycle

## Senior QA operating layer

Load [references/SENIOR-QA-OPERATING-MODEL.md](references/SENIOR-QA-OPERATING-MODEL.md) when the request includes planning, release readiness, defect triage, environment/data readiness, RCA, metrics or post-release verification. Keep this operating layer separate from the browser execution layer

Before execution, establish a versioned plan containing scope, risk, build, environment, role, data, dependencies, entry/exit criteria and stop conditions. After execution, reconcile evidence into defect decisions, quality metrics and a release or post-release owner

Use [references/RELEASE-QUALITY-METRICS.md](references/RELEASE-QUALITY-METRICS.md) when handing aggregated evidence to `governance-release-quality`. Preserve numerator, denominator, source run ID and limitations for every metric

## Optional memory

When agentmemory is available, recall only project/feature context and treat it as historical. Save only verified decisions, constraints and `qa-knowledge/` pointers; never save secrets, raw responses, media, personal data or guesses. Memory is optional and never blocks execution

Resolve `<skill-root>` from the directory containing the loaded `SKILL.md`. **Data is fetched based on the working directory** (cwd or `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` are in the tested project folder — DO NOT mutate the skill folder. When loading knowledge, prioritize `qa-knowledge/knowledge-index.json` before reading specific scope files.

## Workflow composition router

### Public exploratory browser mode

Use `EXPLORATORY_BROWSER_QA` when the user provides a web URL or reachable browser target and a testing objective. Role, test data, requirements and source documentation are optional inputs. The skill starts with the live UI, discovers the visible navigation, controls, states and feedback, then continues with the autonomous browser QA loop. `EXPLORATORY_ADHOC` remains a backward-compatible alias and is normalized to `EXPLORATORY_BROWSER_QA`

Use the `FAST` execution profile inside `EXPLORATORY_BROWSER_QA` when the user asks for a short generic browser task such as opening a URL, reading or extracting visible information, checking a page, navigating, searching, scrolling or downloading a non-sensitive file. `BROWSER_TASK_FAST` is only the human-friendly/backward-compatible label for this profile, not a separate skill or top-level QA workflow. It skips the business brief and uses a bounded same-session browser task contract. Prefer `native-browser-runtime.mjs quick-start` to validate the URL/domain, create the FAST manifest, launch, navigate and return the first agent packet in one command. Use `extract` for structured visible data and `batch` only for up to five read-only actions; writes remain one action per observation. Read [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md). Switch to the normal exploratory profile as soon as the user asks for bug discovery, business-rule verification, expected-versus-actual, regression, retest or a QA verdict

Choose one entrypoint, then expand every required layer in its stack. Layers are internal capabilities of the single public `dynamic-web-exploratory` skill, not separate skills.

```text
DISCOVERY_CORE =
  Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX

RETEST_PLUS =
  Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE

SHEET_EXECUTION_PLUS =
  Compatibility label owned by dynamic-web-automation BUILD_AND_RUN

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
  -> State Delta/Progress -> Compact Memory -> Complete | Replan | Stop
  -> Independent Success-Signal Judge
```

| User entrypoint | Required stack | Read now |
|---|---|---|
| Exploratory browser QA, ad-hoc, bug hunting, UI/UX or business discovery | `DISCOVERY_CORE`; add `AGENTIC_TASK_EXECUTION` when the path is non-deterministic | Always read [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md); add [references/AGENTIC-TASK-PLANNING.md](references/AGENTIC-TASK-PLANNING.md) only for a non-deterministic path, [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md) only when an applicable hidden-rule probe needs its payload/evidence contract, and [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) only when optional source/knowledge exists |
| Generic browser agent or simple browser task | `EXPLORATORY_BROWSER_QA` + `FAST` profile (`BROWSER_TASK_FAST` label) | Read [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md) and [references/BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md); read [references/NATIVE-BROWSER-RUNTIME.md](references/NATIVE-BROWSER-RUNTIME.md) only for non-default auth/session, worker, recovery or troubleshooting behavior |
| Plane ticket plus retest, re-test, verify, PASS, FAILED or BLOCKED | `RETEST_PLUS` | [references/RETEST-PLUS.md](references/RETEST-PLUS.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Google Sheet URL/ID plus execute or run deterministic testcases | Exit `dynamic-web-exploratory` | Route to `dynamic-web-automation` BUILD_AND_RUN; it owns POM code, browser evidence, verdict and optional Sheet result projection |
| Sanity, smoke, impacted or recurring regression | `SANITY_REGRESSION_PLUS = Sanity + Impacted Regression + DISCOVERY_CORE` | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| First exploration of an app or feature | `APP_BASELINE_DISCOVERY = DISCOVERY_CORE` at app/feature scope | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md), [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md), [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md), and [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md) |
| Analyze repository business logic | `REPO_BUSINESS_DISCOVERY`; add `DISCOVERY_CORE` when a live runtime is in scope | [references/TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md), [references/PIPELINE.md](references/PIPELINE.md), and [references/GRAPHIFY-EFFECTIVE-HTML.md](references/GRAPHIFY-EFFECTIVE-HTML.md) |
| Reconcile UI with source, docs or runtime | `UI_BUSINESS_RECONCILIATION + DISCOVERY_CORE` | [references/PIPELINE.md](references/PIPELINE.md) and [references/PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Write or run deterministic testcase/POM automation | Exit `dynamic-web-exploratory` | Route to `dynamic-web-automation` |

Create a ledger row for every expanded layer. Every user-facing exploratory result must be exactly `PASS`, `FAILED`, `N/A`, or `UNTEST`. Technical safety and coverage records may retain internal blocker/partial classifications, but they are normalized to `UNTEST` at the run/charter result boundary.

### Human-facing role naming contract

Before the first browser action, resolve each test identity to its confirmed business-role display name from the permission matrix, saved knowledge or the authenticated UI. Human-facing reports, summaries, ledger tables, comments, coverage labels and verdicts must use the concrete role name, for example `Nhân viên kinh doanh / Rep`, `Trưởng nhóm / Lead`, `Admin tổng kiểm` or `Giám đốc kinh doanh / Người ký` when those are the confirmed roles

Do not expose opaque account aliases such as `U1`, `U2`, `U3` or `U4` as the role label in human-facing output. If a machine runner needs an internal identity or comparison key, keep it only in redacted machine-readable evidence and add the resolved `role_display_name` to the record. Never persist credentials, raw email addresses or secrets

Every human-facing QA report must start with a `Role/Data mapping` table containing `Vai trò nghiệp vụ`, `Tài khoản tham chiếu đã che`, `Phạm vi hoặc quyền` and `Kết quả`. If the role cannot be confirmed, write `Vai trò chưa xác định`, preserve the exact missing signal and return `UNTEST`; do not infer a role from an alias

Use the four values consistently: `PASS` means the scoped UI behavior was executed and supported by same-session evidence; `FAILED` means it was executed and contradicted the visible or supplied oracle; `N/A` means the scope or check does not apply; `UNTEST` means it should be tested but execution or conclusion was not possible because of a missing target, session, authority, data, oracle, observer, evidence or budget

For every live browser route, also create one `BROWSER_OBSERVABILITY` ledger row and read [references/BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md). Use the observer attached to the same page/session as the UI driver. Route native Android/iOS traffic to `dynamic-mobile`.

Network, console and page-error evidence must come from the same session as the UI action; an isolated browser observer cannot prove the transition

Before every executable browser route, validate the target URL/domain boundary and objective. For full `EXPLORATORY_BROWSER_QA`/`EXPLORATORY_ADHOC`, start UI-first discovery directly when no requirements, source or saved knowledge is available; the live page supplies the initial flow, targets and visible oracles. If optional source/requirements/knowledge exist, `prepare-test-intelligence.mjs` may enrich risk ranking but is not a gate for exploratory execution. The `FAST` profile remains the low-friction utility path. Do not replace purposeful UI exploration with a generic element checklist

For the full `EXPLORATORY_BROWSER_QA` profile, `EXPLORATORY_ADHOC` alias and `APP_BASELINE_DISCOVERY`, after the target/domain gate read [references/EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md), declare a compact rule plan before the first browser action and drive the active UI-derived charter with its bounded observe → plan → act → verify → recover → re-rank loop. Read [references/BUSINESS-RULE-DISCOVERY.md](references/BUSINESS-RULE-DISCOVERY.md) only when uniqueness, authorization, side-effect or ambiguous-oracle probing is applicable and needs the full contract. The `FAST` profile uses [references/FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md) instead. `RETEST_PLUS` reuses this loop only as its `DISCOVERY_CORE` layer

When the user gives a natural-language objective and the action path is not already deterministic, read [references/AGENTIC-TASK-PLANNING.md](references/AGENTIC-TASK-PLANNING.md). After the first live observation, decompose the objective into bounded goals with observable success signals, record one compact decision before each action, evaluate progress from the runtime's deterministic `state_delta` and replan after repeated no-progress. Store concise rationale and compact memory only; never persist raw chain-of-thought. After `COMPLETE`, record `task-judge`; a full QA `PASS` requires an independent `SATISFIED` judgement with evidence for every success signal. Agentic task completion does not bypass the QA verdict gates

## Token-efficient execution contract

Use progressive disclosure without weakening QA gates:

- Start native observations with `detail=compact` and combine the latest packet with `exploratory-runner.mjs agent-context <RUN_ID>`; do not reload full run history, raw DOM, traces or old observations before every decision
- Read packet `truncation` and `context_budget`; escalate to `standard`, then `full`, only when the current semantic target or expected signal is absent or ambiguous
- Prefer target-scoped `extract` for large lists/tables. Keep screenshots, locator attempts, runtime events and full traces file-backed and retrieve them only for verification, diagnosis or final reconciliation
- Keep one current goal, one action, up to two alternatives, four new memory facts and eight deduplicated carry-forward facts. Compaction never removes re-observation, independent judge, same-session observability, hidden-rule evidence, coverage or verdict requirements
- A compact packet that lacks proof triggers escalation or `UNTEST`; it never permits `PASS`

Read [references/RUN-OPTIMIZATION.md](references/RUN-OPTIMIZATION.md) when measuring token savings, cache behavior, repeated-run cost or model routing

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

Never load or expose `vendor/**/SKILL.md`; vendor code is not a public QA skill

## Cross-model hard gates

Apply this order for every host and model

1. Route and scope
   - Select one entrypoint, expand its stack and create a ledger row for each required layer
   - If deterministic testcase, Sheet, Excel, POM, BUILD, RUN or BUILD_AND_RUN is requested, exit before browser action and route to `dynamic-web-automation`
   - Validate the exact target, allowed domain, objective, authority and stop conditions
2. Resolve the oracle
   - Full exploratory/ad-hoc and app baseline are UI-first. Start from the live page; requirements, source, guides, role/data and a Business Execution Brief are optional enrichment
   - Never invent expected behavior. If neither visible UI nor supplied context gives a reliable oracle, return `UNTEST` with the missing signal
   - Retest, supplied-oracle sanity/regression and source-driven routes run `context-builder.mjs`; normal execution requires a current Business Execution Brief `READY` and must stop on named missing fields
   - When optional source or knowledge exists, use `prepare-test-intelligence.mjs` only to rank risks. Static evidence remains candidate context until runtime confirmation
3. Start one observable session
   - Initialize `run-manifest.mjs` after the target gate with the selected mode/profile and independently resolved browser driver, browser observer and network observer
   - Default exploratory, FAST and app-baseline execution to `playwright-runtime`; only explicit `auto` enables the documented fallback chain. The host model does not select a different browser
   - Start network, console and page-error observation before critical actions in the same page/session. Cross-session evidence cannot support `PASS`; missing required observation produces `UNTEST`
   - For full exploratory and app baseline, start `exploratory-runner.mjs` with the same `RUN_ID`, create `rule-plan`, then use compact observe/agent-context → plan/decision → one action → state delta → replan/complete → independent task judge
   - For FAST, use `native-browser-runtime.mjs quick-start`, target-scoped `extract`, at most five read-only `batch` actions and `quick-finish`; do not create the full QA ledger. FAST `PASS` proves task completion only
4. Execute and verify
   - Record expected/actual/basis, evidence pointer and verdict immediately after each layer. Applicable hidden-rule probes require safe strategies and same-session before/after evidence
   - RETEST_PLUS always has six distinct rows: Retest, Sanity, Impacted regression, Exploratory, Ad-hoc and UI/UX
   - A full QA `PASS` requires resolved target/oracle/observer, screenshot or video, applicable rule probes, coverage, complete high-priority charters and a `SATISFIED` independent judge
   - Timeout, budget stop, unresolved truncation, missing data/role/authority/oracle/evidence, retry-only recovery or flaky behavior cannot become a clean `PASS`
5. Finish and hand off
   - Reconcile findings, collect evidence and finish the manifest. Full QA profiles update and validate `qa-knowledge/<feature>-business-guide.md`; FAST does not write business knowledge
   - Complete the senior operating ledger when planning, release, triage, metrics or post-release ownership is in scope
   - Keep the exploratory result exactly `PASS`, `FAILED`, `N/A` or `UNTEST`. Plane applies its separate mapping: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`

Read detailed references only when the matching condition in the workflow router or optional-reference list occurs

## Knowledge scope decision

- `APP_BASELINE_DISCOVERY`: bootstrap project lacking `qa-knowledge/knowledge-index.json`. Run `scripts/helpers/extract-flow.mjs` first; map modules → traverse accessible main business flows, role/state/input/side-effect/integration/UI/UX and coverage gaps.
- `REPO_BUSINESS_DISCOVERY`: run `node scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode <full|incremental> --parallel auto --graphify auto`. Incremental mode collects committed, staged, unstaged and untracked changes, selects conservative API/UI/DB/RBAC/state scanner impact, and fails closed on scanner/artifact errors. Graphify runs code-only when available and contributes dependency candidates; canonical QA-skill scanners still produce rules, flows, contracts and permissions. Use `--graphify required` only when Graphify itself is required by the user
- `SHEET_TESTCASE_EXECUTION`: compatibility label only; route deterministic BUILD/RUN and Sheet result projection to `dynamic-web-automation`
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

## Artifacts and scripts

Write runtime artifacts only under the tested project (`cwd` or `QA_DATA_DIR`). Keep media/traces file-backed and put compact redacted summaries plus relative evidence pointers into model context. Read [references/ARTIFACTS-AND-SCRIPTS.md](references/ARTIFACTS-AND-SCRIPTS.md) only when locating artifacts, diagnosing helpers or extending the skill; `scripts/registry.mjs` is the script-path source of truth

## Output format

- Plane comments and testcase prose must have no `.` at end of sentence and no emojis/icons
- Human-facing report/comment role labels must use confirmed business-role names, never opaque test-account aliases; keep aliases only in redacted machine evidence when traceability requires them
- Preserve ID, URL, filename, formula, code, decimal number and machine-readable values
- PASS comment: Result + Conclusion + inline image only
- FAILED comment: adds Actual + Expected
- BLOCKED comment: adds Blocker only

## Related skills

- [dynamic-web-automation](../web-automation/SKILL.md) — build and run deterministic testcase automation with evidence/verdict (DIFFERENT from this exploratory skill)
- [support-testcase-authoring](../../support/testcase-authoring/SKILL.md) — document Excel test cases (DIFFERENT from this bug hunting)
- [support-testcase-authoring execution contract](../../support/testcase-authoring/references/execution-contract.md) — structured steps shared by Sheet execution and POM automation
- [support-document-conversion](../../support/document-conversion/SKILL.md) — convert PDF/DOCX to MD for AI to read spec
- [dynamic-mobile](../mobile/SKILL.md) — native Android/iOS Appium execution and authorized proxy interception
