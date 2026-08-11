<!--
Mirror of ./<skill>/SKILL.md — keep in sync.
23 skills; use the router below and README.md for the complete list.
-->

# QA-skill — Instructions for AI coding agents

This repository distributes 23 Quality Engineering (QE), Security Engineering and MCP integration skills for Claude Code, Codex, Gemini/Antigravity, Cursor, Windsurf and Copilot. OpenAI Codex CLI reads this file automatically, and other tools also use the standard `AGENTS.md` contract.

## Language policy

Keep internal instructions, execution notes and agent-facing contracts in English for compact and consistent model context. Unless the user requests another language, write final explanations, summaries and human-facing QA output in Vietnamese. Preserve exact UI/source strings, URLs, IDs, filenames, commands, verdict values and other machine-readable values.

## Cross-model deterministic mode

This section is a mandatory execution contract for every model, especially fast or small-context models such as Gemini Flash/Pro. Do not skip a step because the model believes it already understands the request.

### Model-neutral Plane inline evidence

Apply these rules identically on GLM, Gemini, Codex, Claude, and every other provider

- Read `integration/plane/QUICK_REF.md` after `integration/plane/SKILL.md` whenever Plane is routed
- For an existing ticket with an image in Description or Comment, build `integration/plane/inline-evidence-template.json`, run `node integration/plane/scripts/browser-inline-evidence.mjs --input <request.json>` first, then add `--apply` only for the authorized write
- Use exact `{{PLANE_DESCRIPTION_IMAGE_N}}` and `{{PLANE_COMMENT_IMAGE_N}}` placeholders; do not rely on the current ProseMirror cursor after pasting large HTML
- Accept success only when read-back proves exact ticket/comment IDs, expected image-node counts, visible previews, expected state, `attachments_count: 0`, empty `issue_attachment_requests`, and no placeholders
- Never click ticket-level `Attach`, call `/issue-attachments/`, copy credentials between hosts, or substitute an attachment when browser staging fails

### URL/artifact-first dispatch

Always scan the user's message verbatim before responding. The user does not need to name a skill or provide a complete command. URLs, IDs, filenames, extensions and business verbs in the router are sufficient signals to load the matching skill.

Apply these read-only defaults:

- Chỉ có Plane URL hoặc ticket ID → load `integration-plane`, parse the target, run doctor and read the ticket
- A Plane URL/ticket ID with `retest`, `re-test`, `verify`, `kiểm tra lại`, `PASS`, `FAILED` or `BLOCKED` → `integration-plane` doctor/read → `dynamic-web-exploratory` RETEST_PLUS → `integration-plane` comment/state
- Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID → load `integration-google-drive`, resolve it and read metadata/content through Drive MCP
- A GitHub repository/PR/Issue/Actions URL only → load `integration-github` and inspect the resource read-only
- A URL or artifact with an explicit mutation verb → perform the requested operation only after exact-target validation; link đứng một mình không cấp quyền write

After routing, start the appropriate read-only action or canonical doctor. Do not stop at introducing a skill, ask the user to call `$skill-name`, or ask which skill to use. If the runtime/tool is unavailable, run the relevant doctor and report the exact failing layer.

### Fixed router

| Request signal | Skill to read | First action |
|---|---|---|
| Plane URL (`projects.metasolutions.ai`, path containing `/issues/` or `/work-items/`), ticket ID, bug logging, PASS/FAILED/BLOCKED comment | `integration/plane/SKILL.md` | Parse the URL, then run Plane doctor; for a bare URL/ID, read the ticket |
| Retest, re-test, verify a bug/ticket | `integration/plane/SKILL.md` + `dynamic-testing/web-exploratory/SKILL.md` | Plane doctor/read → RETEST_PLUS |
| Generic browser task, open/read/extract/search/scroll/click/fill a simple page | `dynamic-testing/web-exploratory/SKILL.md` (`EXPLORATORY_BROWSER_QA` + FAST profile; `BROWSER_TASK_FAST` label) | Validate URL/domain, prefer native `quick-start`, use structured `extract`, read-only `batch` with at most 5 actions and `quick-finish`; no business brief is required and FAST PASS means task completion only |
| App baseline discovery, sanity, exploratory, ad-hoc, UI/UX, browser response/network/console error | `dynamic-testing/web-exploratory/SKILL.md` | Start from URL + objective and inspect the UI flow; use `prepare-test-intelligence.mjs` only as enrichment when requirements/knowledge/source exist; resolve the browser observer in the same session |
| Analyze a repository, learn business flows from source, scan system logic or create a business guide from code | `dynamic-testing/web-exploratory/SKILL.md` (`REPO_BUSINESS_DISCOVERY`) | Run `scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode full --parallel auto --graphify auto`; incremental mode collects committed/staged/unstaged/untracked deltas, selects scanners by impact and fails closed; Graphify code-only adds dependency candidates while Phases 2+3 still produce and merge canonical business sources into `qa-knowledge/merged/system-business-guide.md` |
| Infer a flow from UI, reconcile Source Code + Docs + Runtime, find UI vs Backend/BRD conflicts, or generate BA/PO/Dev questions | `dynamic-testing/web-exploratory/SKILL.md` (`UI_BUSINESS_RECONCILIATION`) | Run `scripts/orchestrators/ui-business-reconciliation.mjs --url <url> --page <slug> --requirements <registry.json>`; map each UI item through 7 statuses, check 10 ambiguity patterns, and write traceability JSON plus the 12-section guide |
| Figma, design tokens, design-to-code fidelity, responsive visual review, interaction state or UX specification | `hybrid-testing/ui-ux-review/SKILL.md` | Validate review packet requirement/viewport/state/media first; route live browser execution to `dynamic-web-exploratory` and accessibility to `hybrid-accessibility` |
| Release readiness, go/no-go, quality gate, exit criteria, risk acceptance or sign-off | `governance/release-quality/SKILL.md` | Evaluate the local release packet first; missing evidence/approval is `BLOCKED` and must not change deployment/ticket state automatically |
| SAST, SCA, SBOM, secret scan, dependency/license or secure CI | `static-testing/supply-chain-security/SKILL.md` | Run a redacted local preflight; do not read secrets/keychain/registry; route exploit validation to `dynamic-security-pentest` |
| Resilience, chaos, fault injection, failover, recovery, RTO/RPO, retry or timeout | `dynamic-testing/resilience/SKILL.md` | Validate the plan and stop condition first; active injection requires target, rollback, owner approval and an execution contract |
| Cross-browser, device/OS, locale, i18n/l10n, timezone, currency or RTL | `dynamic-testing/compatibility/SKILL.md` | Validate the matrix first; route live web to `dynamic-web-exploratory`, native mobile to `dynamic-mobile`, and missing targets to `BLOCKED` |
| Write/edit/review testcases, Scenario ID/Name, or explicitly write API/OpenAPI/Swagger/Postman/curl testcases | `support/testcase-authoring/SKILL.md` | Read existing testcase Markdown when present; the generator must create Markdown, lossless automation manifest, then Excel |
| `drive.google.com`, `docs.google.com/document`, `docs.google.com/spreadsheets`, `docs.google.com/presentation`, Drive ID, Docs, Sheets, Slides, upload/share/CRUD | `integration/google-drive/SKILL.md` | Resolve the URL/ID and use Drive MCP; for a bare URL/ID, read the object |
| Write or execute deterministic testcase/Excel/Sheet automation, Playwright or POM | `dynamic-testing/web-automation/SKILL.md` | Run unified BUILD, RUN or BUILD_AND_RUN; browser execution must produce evidence and `PASS|FAILED|N/A|UNTEST` |
| adapter-browser-session, ego-lite, task space, browser automation without Playwright MCP, or reuse of the user's real login state | `adapter/browser-session/SKILL.md` | Check installation with `ego-browser nodejs <<'EOF' cliLog(typeof snapshotText) EOF`; if absent, read `adapter/browser-session/references/install.md` |
| Convert PDF/DOCX/PPTX to Markdown | `support/document-conversion/SKILL.md` | Select the converter for the file type |
| Analyze business documents, build business flows, or create XMind/Q&A Markdown/Excel | `static-testing/requirements-analysis/SKILL.md` + `support/document-conversion/SKILL.md` when the source is not Markdown | Convert first, review all 18 areas and generate the three matching outputs |
| Authorized pentest, security assessment, bug bounty, source-security scan, Codex Security, recon, IDOR, SSRF, SSTI, JWT, GraphQL, race condition, Burp, Raccoon, DockerScan or GhidraGPT | `dynamic-testing/security-pentest/SKILL.md` | Read the engagement contract and run doctor; for source scans on Antigravity without an API key, read `references/PENTEST_SECURITY.md` → `antigravity-host` |
| GitHub MCP, repository API, PR, Issues, Actions, CI/CD, OAuth/PAT or MCP account switching | `integration/github/SKILL.md` | Distinguish MCP auth from Git SSH |
| Database, ETL/ELT, reconciliation, lineage, freshness, schema drift or read-only Database MCP | `dynamic-testing/data-quality/SKILL.md` | Confirm the real source/destination and read-only DB boundary |
| LLM, chatbot, RAG, agent or prompt/model evaluation | `dynamic-testing/ai-evaluation/SKILL.md` | Define the golden dataset and metric before the run |
| WCAG, axe, keyboard, focus or screen reader | `hybrid-testing/accessibility/SKILL.md` | Combine automated scans with manual interaction |
| Latency, load, stress, spike, soak, k6, JMeter, `.jmx`, JTL, Chrome DevTools MCP, k6 MCP or bottleneck | `dynamic-testing/performance/SKILL.md` | Select the internal engine, confirm the common workload contract and stop condition; use `wizard --env-file` when `.env` exists |
| Postman setup, Postman MCP/CLI, Newman, OAuth, collection run, workspace, environment, spec, mock or monitor operation | `integration/postman/SKILL.md` | Bootstrap MCP, run the runtime doctor, prefer Postman CLI and use Newman only as a fallback for collection v2/v2.1 |
| OpenAPI, Swagger, Postman contract/collection validation, GraphQL, gRPC or webhook contract | `hybrid-testing/api-contract/SKILL.md` | Validate the spec and compare it with the implementation |
| Android/iOS, APK/IPA, Appium, emulator, real device, scrcpy, `scrcpy-wifi`, Proxyman, Charles, mitmproxy, HTTP Toolkit, Fiddler, HAR or mobile network traffic | `dynamic-testing/mobile/SKILL.md` | Run the appropriate mobile/network doctor, select the device matrix, lifecycle and authorized capture scope |
| White-box, glass-box, branch/path/decision coverage, TypeScript/JavaScript/Python/Java/Go/C#/Dart, call graph, NestJS DI, Jest/Vitest or runtime coverage | `hybrid-testing/source-coverage/SKILL.md` | Run `find` → compact `analyze`; use full JSON only for graph/test/coverage/handoff, and route testcase documents through `support-testcase-authoring` |
| Create/import/run a JMeter `.jmx` | `dynamic-testing/performance/SKILL.md` | Use the internal JMeter adapter and smoke one thread before approved load |

### Hard gates

1. Read only skills matching the router and references required by those skills; do not search for other implementations
2. Before a mutation, record an execution contract containing `Target`, `Operation`, `Required inputs`, `Write action` and `Verification`
3. Use canonical/dry-run scripts when provided; do not invent API payloads
4. After a mutation, read the object back and compare ID, content, evidence, state or permission
5. If target, expected result, role/data or access is missing, record the exact missing field; for exploratory/ad-hoc, the user-facing result is `UNTEST` and `BLOCKED` is technical/internal only; do not guess
6. For business analysis, do not generate testcases before important Q&A is answered or assumptions are explicitly marked
7. For pentest, require `.pentest/engagement.md`, target, authorization, exclusions and rate limit before network requests; request approval immediately before Level 2/3 actions
8. A cloned pentest source is only `source_available`; run tools only when the doctor confirms the executable and dependency are `available`
9. Skill Markdown does not replace MCP runtime; before reporting an integration failure, distinguish `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded` and `permission_denied`
10. For dynamic-web-exploratory QA routes, exploratory/ad-hoc and app baseline are UI-first: only an exact target URL/reachable target, objective and domain boundary are mandatory; documents/source/role/test data/brief/guide are optional enrichment. Source-driven and retest routes still use the card/brief contract; deterministic Sheet/testcase routes exit to `dynamic-web-automation` and require the exact manifest, target, role/data and cleanup contract there. Full `EXPLORATORY_BROWSER_QA`/`EXPLORATORY_ADHOC`/`APP_BASELINE_DISCOVERY` always read `EXPLORATORY-AGENT-LOOP.md`; read `AGENTIC-TASK-PLANNING.md` only for non-deterministic paths, `BUSINESS-RULE-DISCOVERY.md` when an applicable hidden-rule probe needs its full payload/evidence contract, and `NATIVE-BROWSER-RUNTIME.md` for non-default auth/session/worker/recovery/troubleshooting. Start the runner with the same `RUN_ID`, create `rule-plan`, use compact native `observe` + `agent-context` → `task-plan`/`decision` → action → deterministic `state_delta` → replan/complete → independent `task-judge`; escalate observation to `standard/full` only when truncation hides the target/oracle. Do not reload the full ledger/raw trace at every step. QA PASS still requires `SATISFIED` judge, same-session observer, evidence, applicable `rule-probe`, coverage and complete high-priority charters. Missing target/session/authority/oracle/evidence/budget or unresolved truncation is user-facing `UNTEST`; the only results are `PASS`, `FAILED`, `N/A`, `UNTEST`. FAST is bounded task completion: prefer `quick-start`, target-scoped `extract`, read-only `batch` of at most 5 actions and `quick-finish`, then raise to the full profile when QA requirements appear
11. Live browser dynamic-web-exploratory must observe network, console and page errors in the exact session executing the UI; do not combine evidence from another browser MCP session
12. Graphify is an optional static discovery provider: do not run installer/hook/AGENTS mutations; default to `--code-only`; retain all normalized project nodes/relations; separate token-limited `contextSlice`; preserve `EXTRACTED`/`INFERRED`/`AMBIGUOUS`; and never promote a relation to business truth, runtime evidence or measured coverage
13. effective-html only affects companion HTML generated from validated JSON; every interactive companion must use `render-intelligence-html.mjs` with `catalog-v2` layout synchronized with `QA-skill.html`, two-finger pan, pinch/`Ctrl`/`Cmd`+wheel zoom, a route chip highlighting the end-to-end path, hover/active edge-label pills and node-click path highlighting with a detail drawer containing `Làm được gì`, flow information and related paths, then pass `--check`; JSON, Markdown, Excel, XMind and standard evidence remain the sources of truth
14. For adapter-browser-session, run `node adapter/browser-session/scripts/detect.mjs` first; do not use `drainEvents()` to claim request/response bodies; do not perform destructive actions with a real session without user confirmation; resolve `browser-driver` and `network-observer` independently according to `BROWSER-DRIVER-RESOLUTION.md`. `EXPLORATORY_BROWSER_QA` (including FAST/`BROWSER_TASK_FAST` and `EXPLORATORY_ADHOC`) and `APP_BASELINE_DISCOVERY` default to native `playwright-runtime`; only an explicit `auto` enables Chrome DevTools/Playwright MCP fallback. Native runtime uses `native-browser-runtime.mjs`, AX/CDP in the same session, bounded stale-reference recovery and worker isolation; do not install or call Browser Use
15. For `pentest-security` on Antigravity without an API key, run `detect --engine antigravity-host` → `prepare` → let the active host agent complete the exact assignment result → `status` → `finalize`; do not read tokens/keychain, call the Gemini API or claim that the OpenAI `codex-security` CLI is running with Gemini
16. UI business reconciliation requires a real URL/snapshot and a requirement registry with stable ID/source_ref; fail closed when either is missing, do not use hidden fixtures, and require `--verify-runtime` plus an exact user-approved selector for runtime clicks
17. UI/UX review must keep design source, requirement, implementation and runtime provenance separate; screenshot/video is mandatory for visual `PASS`
18. Release governance must not turn missing evidence or approval into PASS; distinguish `FAILED` from `BLOCKED`
19. AppSec local scans must be redacted; every scanner alert is `Candidate` until reproduction and control comparison
20. Do not run resilience fault injection or concurrency without target, rollback, stop condition and owner approval
21. Compatibility must state supported browsers/devices/locales/timezones; a matrix plan must not be called runtime execution PASS

### Required invariants

- `DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- `BROWSER_OBSERVABILITY` = same-session Network + Console + Page Error correlation, applied to every live browser workflow without changing the number of `DISCOVERY_CORE` layers
- `EXPLORATORY_AGENT_LOOP` = Observe → Plan → Act → Verify → Recover → Re-rank; `exploratory-runner.mjs` enforces ledger/budget/evidence boundaries; native `playwright-runtime` provides session daemon, AX/CDP references, selector priority and isolated worker pool; the loop adds browser-agent capability but does not replace business oracle, same-session observability, safety, evidence or provenance gates
- `AGENTIC_TASK_EXECUTION` = Objective + Live Page State → bounded Task Plan → Previous-goal Evaluation + Compact Memory + Next Goal + One Action → deterministic State Delta → Complete | Replan | Stop → independent Success-Signal Judge; task completion is not automatically QA PASS
- `TEST_INTELLIGENCE` = Requirement + Runtime Knowledge + Current Source + UI Observation → provenance-aware business model/brief → ranked risks → exploratory charters; static code/UI is read-only candidate context until runtime confirms it
- `HIDDEN_RULE_DISCOVERY` = Rule Plan → Safe Probe → Same-session Evidence → Provenance Classification → Scoped Coverage; `COMPLETE_FOR_SCOPE` does not mean full-system coverage
- `dynamic-performance` là public skill duy nhất cho performance; JMeter and k6 are internal engines sharing config, smoke gates and result schema
- Performance `.env` is only an ignored `PERF_*` input layer; generated YAML remains the canonical config, request/body/secret values use placeholders and credentials must not be committed
- Retest ticket = Original Retest + Sanity + Impacted Regression + `DISCOVERY_CORE`; retain the separate 6-row RETEST_PLUS ledger
- Deterministic Sheet execution = unified POM BUILD_AND_RUN with exact Testcase IDs, browser evidence and verdict projection; run `DISCOVERY_CORE` separately only when exploratory coverage is explicitly requested, and use RETEST_PLUS for ticket/previous-failure rows
- Business Execution Brief là `READY` before retest, Sheet and source-driven execution; copy its test contract with the same source hash
- Không được tự thay business flow thiếu bằng flow generic; exploratory/ad-hoc UI-first may derive a flow directly from the runtime UI and must mark the oracle as `UI_DERIVED`
- Retest tickets always run Retest, Sanity, Impacted Regression, Exploratory, Ad-hoc and UI/UX
- PASS → `Done`
- FAILED → `In Progress`
- BLOCKED → giữ nguyên trạng thái
- Exploratory/ad-hoc user-facing verdicts are only `PASS`, `FAILED`, `N/A`, `UNTEST`; the Plane mapping above does not create a fifth verdict
- Bug mới → `Todo`
- Plane comments, testcase prose and reader-visible content created/edited through Drive CRUD must not end sentences with `.` and must not contain emoji/icons
- Preserve IDs, URLs, filenames, sheet/tab names, formulas, code, decimal numbers and machine-readable values
- Business analysis must generate `.xmind`, Q&A Markdown and Q&A Excel from the same JSON; Question IDs must match across both Q&A outputs
- Pentest scanner alerts remain `Candidate` until reproduction evidence and control comparison exist
- Antigravity host-native source scan is a Codex Security-compatible pipeline, not a provider replacement inside OpenAI `codex-security`; host-model findings remain `unverified` after finalization
- Static Whitebox paths/testcases are always `source-derived-candidate`; claim measured coverage only after `coverage`/`run-coverage`, keep `unknown` distinct from `uncovered`, and do not create testcase templates outside `support-testcase-authoring`
- Graphify relations are always `source-derived-candidate`; `EXTRACTED` is still only a static relationship, while `INFERRED` and `AMBIGUOUS` always require review
- Full-project Graphify artifacts retain all nodes/relations by default; `contextSlice` and HTML overviews are retrieval/presentation windows, not project coverage
- Interactive HTML is a derived presentation artifact and must pass `render-intelligence-html.mjs --check` before handoff
- adapter-browser-session is a separate browser driver, not merely a Playwright fallback; `browser-driver` and `network-observer` resolve independently; adapter-browser-session provides only basic network events through `drainEvents()` and has no request/response bodies
- adapter-browser-session `drainEvents()` is always `reduced_confidence` for network assertions; attach `chrome-devtools-mcp` to the exact ego-lite CDP port when bodies/headers are required
- adapter-browser-session is unavailable on Windows/Linux; resolve `unsupported_platform` and fall back to `playwright-mcp` or `chrome-devtools-mcp`
- adapter-browser-session carries the user's real login state; follow the 8 hard gates in `adapter/browser-session/SKILL.md` before any action with effects outside the app
- Do not enable `/yolo` outside an explicitly permitted isolated lab
- Do not treat `source_available` as an installed or authorized tool

## Playwright POM Automation

### Use when

- Scaffold a new Playwright project
- Write UI/API/performance tests
- Execute testcase Markdown/Excel/Sheet or `.automation.json` through Playwright
- Produce browser evidence and testcase verdicts
- Set up CI for QA

### Do not use for

- Exploratory/ad-hoc clicks (use `dynamic-web-exploratory`)
- Production-app debugging

### Must do

- Use the Page Object Model; do not write `page.locator()` or `page.getBy*()` directly in specs
- Separate selectors from specs under `selectors/`
- Tag tests (`@ui`, `@api`, `@functional`)
- For testcase-driven work, run a target-scoped `pom-plan` with `--group` or `--testcase-id`; the default batch guard is 20 cases
- Map every step to `<action><PascalTargetKey>`, preserve value fingerprints and use assertion-kind-compatible matchers
- Require selector evidence with `captured_at`, same-browser `run_id` and current `app_build`
- Default testcase workflow is BUILD_AND_RUN: traceability → browser run → screenshot/video + same-session trace → `PASS|FAILED|N/A|UNTEST`
- Retry-pass is `FAILED`/flaky; missing test, browser target, report, visual or trace is `UNTEST`
- Sheet module, worker count 1–4 and worker selection require confirmation before execution/write-back
- Wire Allure and CI only when pipeline/release delivery is in scope

### Core principle

> Every selector must go through a Page Object; do not write `page.locator()` or `page.getBy*()` directly in a spec.

Read [`dynamic-testing/web-automation/SKILL.md`](dynamic-testing/web-automation/SKILL.md)

## QA Run

### Use when

- Plan or execute a QA cycle
- Select test techniques
- Run sanity/regression
- Perform release sign-off

### Do not use for

- Writing new automation scripts (→ `dynamic-web-automation`)
- Executing deterministic testcase/POM suites (→ `dynamic-web-automation`)
- Creating testcase documents (→ `support-testcase-authoring`)

### Must do

- Layer Sanity → Smoke → Regression; do not run full regression every cycle
- Every retest-ticket request automatically runs RETEST_PLUS: original retest flow, sanity, impacted regression, exploratory, ad-hoc and UI/UX
- Exploratory/ad-hoc browser actions must resolve semantic targets in the same session, prefer accessibility/DOM evidence, adaptive waits and bounded recovery; coordinates or XPath must not be automatically promoted to POM selectors
- Human-facing reports must begin with a `Role/Data mapping` table and use concrete business-role names; do not display shortened account codes such as `U1`, `U2`, `U3` or `U4`. Keep aliases only in redacted evidence JSON when machine traceability requires them
- The exploratory runner must record page/action/charter ledgers, enforce numeric action/time budgets and fail-closed `PASS` when a high-priority verdict, resolved observer, screenshot/video or clean retry quality is missing
- The exploratory runner must block browser actions before a rule plan; applicable probes need `safe_strategy`, `not_applicable` needs a reason and applicability basis; uniqueness needs two attempts, authorization needs the same target with role comparison, side effects need before/after/read-back, and the oracle needs expected/actual/basis with runtime-verified `COMPLETE_FOR_SCOPE` for `PASS`
- Every critical browser transition must check network, console and page errors in the same session; Playwright MCP uses Playwright tools, and Chrome DevTools MCP is used only when it controls or attaches to the exact tab
- Every testcase `Pass`/`Fail` needs at least one existing screenshot or video; JSON/trace/network alone is insufficient evidence; append the media reference to Note before write-back
- Evidence Sheets must use `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/`; plan/result metadata goes to `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/`; do not combine media from multiple functions in one folder
- Optimize token/time through progressive disclosure: execution card, compact `observe` + `agent-context`, target-scoped extract, escalation to `standard/full` only when truncation hides target/oracle, context-budget telemetry, stat-fast cache, change-impact incremental mode, `run-mode auto|fast|scoped|deep` and adaptive same-session waits; never cut oracle/observer/evidence/verdict gates
- Record provider-reported usage separately through `record-model-usage.mjs`/`QA_TOKEN_USAGE_FILE`; measure business-flow intelligence with a golden dataset, not test count
- Fall back to Antigravity when Claude Code + Playwright is unavailable
- Antigravity can PASS only after live same-session smoke and `validate-host-smoke.mjs`; missing evidence is `BLOCKED`
- Read `qa-knowledge/<feature>-business-guide.md` before browser action when present
- After every run, write and validate the business guide through `scripts/writers/write-business-guide.mjs`
- For total exploration or app bootstrap, create `qa-knowledge/app-business-guide.md` with a module coverage map; retests do not repeat full-app baseline
- When REPO_BUSINESS_DISCOVERY needs a cross-file graph, use `graphify-adapter.mjs` through the orchestrator with `--graphify auto|required|off`; never call `graphify codex install` or `graphify hook install`
- When the user requests an HTML report/diagram, run `render-intelligence-html.mjs` only after canonical JSON validation and keep HTML as a companion output
- `prepare-test-intelligence.mjs` must use cache when source inventory and invocation fingerprint are unchanged; stale/missing source must escalate and must not silently reuse an old oracle
- `repo-business-discovery.mjs` may run independent scanners in parallel (`--parallel auto|on|off`) but must keep the reconciliation barrier, record timing/change-impact telemetry, never skip a dirty tree merely because `HEAD` is unchanged and fail closed on scanner/artifact errors
- Adaptive wait may replace fixed sleep only with bounded document/XHR/fetch quiet-state; timeout is not PASS and must not remove same-session network/console/page-error/evidence gates

### Senior QA operating layer

- For planning, release gates, triage, RCA, metrics or post-release verification, read `dynamic-testing/web-exploratory/references/SENIOR-QA-OPERATING-MODEL.md`
- Every cycle must record scope/risk, build/environment/data readiness, entry/exit criteria, executed versus blocked counts, evidence completeness, defect decision and post-release owner when applicable
- Use `dynamic-testing/web-exploratory/references/RELEASE-QUALITY-METRICS.md` to preserve numerator/denominator, source run ID and limitations; do not use test count as risk coverage
- Defects must distinguish severity/priority, retain actual/expected/evidence/repro and record root-cause/prevention for escaped or reopened defects

### Core principle

> Run the right scope at the right time — do not run full regression every cycle.

Read [`dynamic-testing/web-exploratory/SKILL.md`](dynamic-testing/web-exploratory/SKILL.md)

## Automation quality gates

- Read `dynamic-testing/web-automation/references/AUTOMATION-QUALITY-GATES.md` and `FLAKY-TEST-MANAGEMENT.md` before creating CI automation
- After generating POM, create a bounded deterministic plan from `.automation.json`, then run `scripts/verify-testcase-traceability.mjs` with Markdown plus manifest and current `--app-build`; archive `reports/testcase-automation-traceability.json` with source hash, action/value/assertion/RBAC markers, TestCase ID mapping, fresh selector evidence and staged token measurement
- Unified POM BUILD_AND_RUN owns deterministic browser execution and verdict; it must not reconstruct testcase flow when the shared manifest exists
- The fixed POM locator priority is `data-testid → id → stable CSS → role/label/placeholder/text → XPath`; use `data-testid` only when present in FE source/contract or verified live DOM; do not insert test IDs into the app
- The skill repository keeps only reusable templates (`.env.example`, `fixtures/`, `test-data/`); project `.env`, credentials, auth state, live evidence and testcase/runtime data belong in the scaffolded automation project
- Classify retry-pass as `flaky`, preserve first-attempt and retry evidence, and never turn it into a clean PASS automatically
- CI must check compile/lint, placeholder/secret, failed test, flaky rate, evidence, duration, declared coverage and supported browser matrix
- Use component/contract/API at lower levels; UI should contain only critical business journeys; service virtualization must include at least one real-dependency check
- Visual baselines must include commit/browser/viewport/locale/theme; axe does not replace keyboard/focus/manual evidence

## Test Case Template

### Use when

- Generate testcase documents (Excel / CSV / MD)
- Consistent columns and shared keys are required
- Explicitly generate API testcases for an endpoint, OpenAPI/Swagger, Postman or curl

### Do not use for

- Exploratory notes
- Bug reports

### Must do

- Use the fixed column schema (see `assets/Template.xlsx`)
- Share keys across the three skills (config from `../config/api_keys.json`)
- Clean output automatically before handoff
- Do not end testcase content with `.` or add emoji/icons
- Keep the current flow as default; read `references/api-testcases.md` and create an `api` object only when the user explicitly requests API testcase writing; merely mentioning an API artifact does not change mode
- Always run `scripts/import-api-spec.py` for API files; run Excel only when `review_required` is empty
- Markdown trước Excel remains mandatory: generate complete Markdown first, then the lossless `.automation.json`, then Excel; use the manifest for unified POM BUILD_AND_RUN and Markdown for human/AI reading
- New executable cases require a non-empty requirements registry, stable Scenario ID/Name, one matching AC per scenario, a valid type and `bb_technique`
- Reuse genuinely identical flows through `execution_templates` plus `execution_ref`/`execution_overrides`; do not duplicate full entry/steps across cases

### Core principle

> Use one column set — do not invent new columns.

Read [`support/testcase-authoring/SKILL.md`](support/testcase-authoring/SKILL.md)

## Doc to MD

### Use when

- Convert PDF / DOCX / PPTX / HTML to Markdown
- Feed converted content to another skill such as `support-testcase-authoring` or `dynamic-web-exploratory`

### Do not use for

- Editing an existing Markdown file
- Scraping a web page

### Must do

- Preserve heading/table structure
- Use the correct converter for each file type (MarkItDown)
- On macOS, use `--only-binary=:all:` to avoid building the cryptography wheel

### Core principle

> Convert structure correctly — do not retype from a PDF.

Read [`support/document-conversion/SKILL.md`](support/document-conversion/SKILL.md)

## Business Analysis

### Use when

- Read BRD/SRS/FRS or business documents to model system flows
- Create editable XMind and Q&A Markdown/Excel
- Find ambiguity, contradiction, missing rules or hard-to-test expected results

### Must do

- Run `support-document-conversion` first when the source is not Markdown
- Review all 18 areas in the senior fullstack QA/QC checklist
- Create one analysis JSON and run `static-testing/requirements-analysis/scripts/generate.sh`
- Read back `.xmind`, Q&A Markdown and Q&A Excel before handoff
- If `graphify-discovery.json` exists, use it only to find related functions or missing Q&A; do not mark it `verified`
- Generate HTML companion only when requested and only from validated analysis JSON

Read [`static-testing/requirements-analysis/SKILL.md`](static-testing/requirements-analysis/SKILL.md)

## Pentest Run

### Use when

- Authorized pentest or bug bounty work
- Recon, permission testing, injection, race condition or container security
- Burp traffic or supplied binary analysis

### Must do

- Create or read `.pentest/engagement.md`
- Run `dynamic-testing/security-pentest/scripts/doctor.sh` before network requests
- Distinguish `source_available` from executable `available`
- Start with passive or low-impact discovery
- Request approval immediately before state-changing, exploit-validation, concurrency or high-volume actions
- Confirm a finding only with reproduction evidence and control comparison

Read [`dynamic-testing/security-pentest/SKILL.md`](dynamic-testing/security-pentest/SKILL.md)

## Plane QA

### Use when

- Read or CRUD Plane tickets in one or more workspaces
- Log bugs, comment PASS/FAILED/BLOCKED and upload inline evidence
- Write daily or test reports on Plane
- Change state and attach evidence after a retest

### Must do

- Parse workspace/project/ticket from the URL before using defaults
- Run `scripts/doctor.sh` before live read/write
- Use `post-result.py` for PASS/FAILED/BLOCKED and read back the comment and state
- Use the authenticated browser editor for every image in a Description or Comment; never click ticket-level `Attach` or call `/issue-attachments/`
- Use `browser-inline-evidence.mjs` with exact placeholders for the final browser-inline write; do not improvise editor cursor placement
- Keep `Attachments 0` for inline evidence; if browser authentication is unavailable, return `BLOCKED` and do not fall back to an attachment
- If the browser shows the Plane login screen and the user explicitly authorizes auto-login, use `PLANE_EMAIL` and `PLANE_PASSWORD` only from the ignored Plane skill `.env`, never print them, save the authenticated browser state, then resume
- PASS → `Done`; FAILED → `In Progress`; BLOCKED remains unchanged; new bug → `Todo`
- Keep browser passwords only in the ignored local `.env`; never put passwords in tracked files, logs, Plane content, screenshots, reports, or shell arguments; API operations use only the Personal API Key

Read [`integration/plane/SKILL.md`](integration/plane/SKILL.md)

## Google Drive QA

### Use when

- CRUD Drive files/folders, Docs, Sheets, Slides or permissions
- Read, store or archive QA reports/evidence on Drive
- Recover when OAuth/MCP permission has expired or is not loaded

### Must do

- Prefer `google-drive` MCP and native tools by file type
- Resolve the exact file/folder before writing; confirm destructive operations using `references/CRUD.md`
- Read back ID, name, parent/location and changed content/permission after a write
- Do not use web search instead of private Drive
- Never commit OAuth client secrets, access tokens or refresh tokens

Read [`integration/google-drive/SKILL.md`](integration/google-drive/SKILL.md)

## GitHub MCP QA

### Use when

- Configure or diagnose GitHub MCP for the active host
- Manage repositories, PRs, Issues or Actions CI/CD through the GitHub API
- Switch the MCP account while keeping Git SSH separate

### Must do

- Use the official endpoint `https://api.githubcopilot.com/mcp/x/all`
- Never commit OAuth credentials or PATs
- Distinguish Git SSH from MCP OAuth/PAT
- Confirm account, repository and branch before writes; read back after mutations

Read [`integration/github/SKILL.md`](integration/github/SKILL.md)

## General setup and configuration

- **API key**: one shared `config/api_keys.json` (gitignored) for AI helpers. Plane and Drive use separate environment/MCP credentials; never commit secrets. See [`README.md`](README.md) section “API Keys” and `scripts/ai_provider.py`
- **Canonical source**: edit skills only under this `QA-Skill` repository; project-local copies are not canonical
- **Publish after every new or updated skill**: run `./scripts/setup.sh --agent=<host> --profile=full --skip-deps --skip-mcp-setup --yes`; `full` dynamically discovers every top-level folder containing `SKILL.md`
- **Codex discovery**: publish QA skills to `$HOME/.agents/skills`; do not create another QA copy under `$HOME/.codex/skills`
- **New skill catalog**: after publishing a newly named skill, start a new agent session if the host does not show it immediately
- **Clone**: `git clone git@github.com:tqphong02/QA-skill.git`, then run `./scripts/setup.sh --agent=<host> --profile=full --yes`
- **Detailed setup**: see [`SETUP-GUIDE.md`](SETUP-GUIDE.md)
