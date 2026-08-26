---
name: dynamic-web-exploratory
description: Run UI-first exploratory browser QA and generic web tasks from a URL and natural-language objective. Trigger on open/read/extract/click/fill/download, app discovery, exploratory/ad-hoc, sanity, ticket retest, UI/UX, browser network/console errors, business-flow discovery, triage, or sign-off. Not for deterministic testcase execution, POM/automation code, native mobile, or testcase documents; route testcase BUILD/RUN to dynamic-web-automation. Auto-route; do not require the skill name.
mode: dynamic
surface: web
role: executor
legacy_aliases: qa-run
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# QA Run

Use UI-first discovery for exploratory/ad-hoc browser QA and generic browser tasks. Do not turn every cycle into full regression

## Workflow composition router

Select one public entrypoint and create a ledger row for each required layer:

```text
DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
RETEST_PLUS = Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE
SHEET_EXECUTION_PLUS = Compatibility label owned by dynamic-web-automation BUILD_AND_RUN
BROWSER_OBSERVABILITY = same-session Network + Console + Page Error correlation
EXPLORATORY_BROWSER_QA = FAST profile | full EXPLORATORY profile
```

| Request | Route and references |
|---|---|
| Generic browser task | `FAST`; read [FAST-BROWSER-TASK.md](references/FAST-BROWSER-TASK.md) and [BROWSER-OBSERVABILITY.md](references/BROWSER-OBSERVABILITY.md) |
| Exploratory/ad-hoc, bug hunting, UI/UX or business discovery | `DISCOVERY_CORE`; always read [EXPLORATORY-AGENT-LOOP.md](references/EXPLORATORY-AGENT-LOOP.md) |
| Plane ticket plus retest | `RETEST_PLUS`; read [RETEST-PLUS.md](references/RETEST-PLUS.md) and [PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) |
| Sanity, smoke or impacted regression | `DISCOVERY_CORE` plus the applicable regression scope; read [TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) |
| First app/feature exploration | `APP_BASELINE_DISCOVERY`; use [PROCESS-GUIDE.md](references/PROCESS-GUIDE.md) and [TEST-INTELLIGENCE.md](references/TEST-INTELLIGENCE.md) |
| Repository business discovery | Run `scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode <full|incremental> --parallel auto --graphify auto`; read [PIPELINE.md](references/PIPELINE.md) |
| UI ↔ source/docs/runtime reconciliation | Run `scripts/orchestrators/ui-business-reconciliation.mjs --url <url> --page <slug> --requirements <registry.json>`; read [PIPELINE.md](references/PIPELINE.md) |
| Deterministic testcase, Sheet, Excel or POM | Exit to `dynamic-web-automation`; do not run a second browser interpretation here |

For FAST, validate URL/domain, prefer `native-browser-runtime.mjs quick-start`, use target-scoped `extract`, at most five read-only `batch` actions and `quick-finish`; writes remain one action per observation. FAST `PASS` proves task completion only

## Cross-model hard gates

1. Validate exact target URL/domain, objective, session, authority, role/data and stop conditions before browser action
2. Default to `playwright-runtime`/Playwright MCP. Gemini/Antigravity is the host model, not a browser override: never use Gemini-in-Chrome or `antigravity-native`; unavailable Playwright is `UNTEST`
3. Start Network, Console and Page Error observation in the same page/session as the UI driver. The observer and UI action must use the same session; cross-session evidence cannot support `PASS`
4. Full exploratory/app-baseline runs start `exploratory-runner.mjs` with the same `RUN_ID`, declare `rule-plan`, and use observe → plan → one action → verify/state delta → trajectory health/recovery → re-rank → complete/stop → independent task judge. The runner fingerprints actions, detects state stagnation and alternating loops, and blocks another `ACT` when `REPLAN_REQUIRED`; read [AGENTIC-TASK-PLANNING.md](references/AGENTIC-TASK-PLANNING.md) only for a non-deterministic path
5. Full exploratory/ad-hoc and app baseline are UI-first. Requirements, source, guides, role/data and a Business Execution Brief are optional enrichment; never invent an oracle
6. Retest, supplied-oracle regression and source-driven routes may use `context-builder.mjs`; a missing required brief field is `UNTEST`, not a generic fallback
7. Every live route gets one `BROWSER_OBSERVABILITY` row. A full QA `PASS` needs target, oracle, observer, evidence, applicable rule probes, high-priority coverage and a `SATISFIED` independent judge
8. Use only `PASS`, `FAILED`, `N/A` or `UNTEST` at the user-facing layer. A timeout, missing data/role/authority/oracle/evidence, unresolved truncation or flaky retry cannot become clean `PASS`

## Token-efficient execution

- Start observations at `detail=compact`; combine the latest packet with `exploratory-runner.mjs agent-context <RUN_ID>`, including its plan status, automatic action outcome, compact trajectory and recovery strategies
- Escalate to `standard`/`full` only when truncation hides the target or oracle
- Prefer target-scoped `extract`; keep screenshots, traces and runtime events file-backed
- Keep one current goal, one action and compact memory; compaction never removes evidence, observability, rule probes, coverage or judge requirements
- Read [RUN-OPTIMIZATION.md](references/RUN-OPTIMIZATION.md) only when token/cost measurement is in scope

For `UI_BUSINESS_RECONCILIATION`, require a real URL/snapshot and a registry with stable `uiItemId`/`source_ref`; fail closed when either is missing. Emit `MAPPED`, `UI_ONLY`, `REQ_ONLY`, `CONFLICT`, `AMBIGUOUS`, `UNREACHABLE` or `NOT_APPLICABLE`. Runtime actions require `--verify-runtime` and an exact user-authorized selector

## Knowledge and evidence boundaries

- `APP_BASELINE_DISCOVERY` may bootstrap missing `qa-knowledge/knowledge-index.json`; traverse accessible modules, roles, states, data, side effects, integrations, UI/UX and gaps
- `REPO_BUSINESS_DISCOVERY` keeps Graphify code-only relations as `source-derived-candidate`; it never proves business truth or coverage
- `RETEST_PLUS` has six rows: Retest, Sanity, Impacted regression, Exploratory, Ad-hoc and UI/UX. Do not silently run a full-app baseline
- Update only the inspected scope in `qa-knowledge/`; full profiles may write `qa-knowledge/<feature>-business-guide.md` with a non-empty `coverage_map`. FAST does not write business knowledge
- Read optional test-data guidance, [COMMON-MISTAKES.md](references/COMMON-MISTAKES.md), [ANTIGRAVITY-FALLBACK.md](references/ANTIGRAVITY-FALLBACK.md), [INTELLIGENCE-BOOST.md](references/INTELLIGENCE-BOOST.md) or [GRAPHIFY-EFFECTIVE-HTML.md](references/GRAPHIFY-EFFECTIVE-HTML.md) only when their condition occurs

## Critical red flags

- Do not run destructive tests or overwrite `auth.json`, `evidence/` or `qa-knowledge/` without explicit authorization and a read-first check
- Do not mix browser sessions or claim a static source/Graphify relation is runtime-verified
- Do not replace business-risk exploration with a generic element checklist or a missing oracle with a guessed flow
- Do not treat every 4xx/5xx as a bug; correlate action, expected negative behavior, response and visible outcome
- Do not let an HTML companion replace canonical JSON, Markdown, Excel, XMind or evidence
- Never load or expose `vendor/**/SKILL.md`

## Output contract

Keep artifacts under the tested project (`cwd` or `QA_DATA_DIR`), with media/traces file-backed and compact redacted evidence pointers. Human-facing role labels must use confirmed business names, not opaque account aliases

Preserve IDs, URLs, filenames, formulas, code and machine-readable values. Plane comments and testcase prose have no trailing `.` or emoji/icons. Report `Role/Data mapping` before a human-facing QA summary. Map Plane state only as `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, new bug → `Todo`

Related deterministic/document skills: [dynamic-web-automation](../dynamic-web-automation/SKILL.md), [support-testcase-authoring](../support-testcase-authoring/SKILL.md), [support-document-conversion](../support-document-conversion/SKILL.md), [dynamic-mobile](../dynamic-mobile/SKILL.md)
