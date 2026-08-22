---
name: dynamic-web-automation
description: Build and execute deterministic testcase-driven Playwright Page Object Model automation with browser evidence and PASS, FAILED, N/A, or UNTEST verdicts. Trigger on running testcase Markdown, Excel, Sheet, or automation manifests; Playwright specs, POM, selectors, traceability, regression, Allure, flaky tests, visual, accessibility, performance, or CI; do not require the skill name. Use dynamic-web-exploratory only for exploratory/ad-hoc browser QA without a deterministic automation suite and support-testcase-authoring for testcase documents.
mode: dynamic
surface: web
role: executor
legacy_aliases: playwright-pom-automation
---

# Testcase Execution and Playwright POM

Own the deterministic path from the `.automation.json` automation manifest to a reusable POM, Playwright evidence and verdict. Keep selectors in `selectors/`, actions in Page Objects, assertions in specs, and preserve `AUTOMATION_SOURCE`, testcase IDs and RBAC markers

## Mandatory workflow

1. Resolve `BUILD`, `RUN` or default `BUILD_AND_RUN`, target, environment, account/data, production boundary and cleanup
2. Select at most 20 cases by group or testcase ID; use the manifest as the only execution/POM source
3. Before planning UI work, build the current-build Browser MCP `UI_FUNCTION_INVENTORY` for every allowed route/role/state. Read [ui-coverage-discovery.md](references/ui-coverage-discovery.md); block when required functions are absent from the manifest
4. Run `testcase-workflow --phase plan --require-ui-coverage`, resolve selectors from same-session Browser MCP evidence, then generate selectors → Page Objects → tagged specs and consolidate by business module
5. Copy the runtime scaffold: `fixtures/pom.ts`, `fixtures/runtime-context.ts`, dynamic `playwright.config.ts` and `scripts/verify-runtime-scaffold.mjs`. Generated specs import `test`/`expect` from `fixtures/pom`, never directly from `@playwright/test`
6. Bootstrap project-local Playwright with `scripts/bootstrap-playwright.mjs`; install declared dependencies and Chromium before typecheck/provision/test
7. Pass UI-function coverage, runtime scaffold, placeholder, TypeScript/lint and traceability gates
8. Run `testcase-workflow --phase execute --require-ui-coverage`; read `reports/ui-function-coverage.json` and `reports/testcase-pom-execution.json`
9. Report only `PASS`, `FAILED`, `N/A` or `UNTEST`. For Sheet/Excel, write back exact row verdicts only after confirmation and validation

Do not run production or create external state without explicit target, data ownership and cleanup

## Target-scoped planning

Never load a large manifest or raw DOM into model context. Let the deterministic script read it and emit a bounded `pom-plan`:

```text
npm run testcase-workflow -- --phase plan --mode ui \
  --manifest testcases/<feature>.automation.json \
  --group LOGIN --ui-inventory selector-evidence/<feature>.ui-function-inventory.json \
  --require-ui-coverage --max-cases 20 --output testcases/login.pom-plan.json
```

Use `--testcase-id` for a smaller slice. Generate one bounded group at a time; batching is internal only and must not leak `batch-NN` into final code. Run `scripts/verify-module-artifact-layout.mjs` after BUILD

## Module and testcase contracts

- One business module owns one final `tests/<surface>/<module>.<surface>.spec.ts`, one Page Object and one selector registry. Preserve manifest module/testcase order and make generation deterministic/idempotent
- `testcase ID → one test()`; `entry` maps to fixtures; role/RBAC remain metadata; cleanup maps to `finally` or fixture teardown
- Plan steps carry `action`, `target_key`, value fingerprint, marker, Page Object method and allowed assertion matcher. Use deterministic names such as `fillEmailInput` and `clickLoginSubmit`
- Resolve runtime data by `target_key`; do not reconstruct values from prose. Legacy text-only cases are not automatable until normalized
- Specs contain no raw locators or `expect()`-free Page Object violations; Page Object locators stay `private readonly`; selectors use `as const`
- Ordered/mutating modules use `test.describe.serial` unless data and cleanup are independently owned. Do not remove serial grouping as a parallelism shortcut
- Parallel mutation needs one storage-state account and one isolated data/cleanup slot per worker; shortage is `UNTEST`, never silent reuse

## Browser MCP selector contract

Browser MCP is the selector source of truth. Read [selector-discovery.md](references/selector-discovery.md) and [ui-coverage-discovery.md](references/ui-coverage-discovery.md) before UI/POM work. Use this priority:

`existing testid → stable id → stable CSS → role/label/placeholder/text → short anchored XPath`

Never invent `data-testid`; reject generated classes, positional CSS, `.first()`, `.last()`, full XPath and ambiguous targets. Verify count, visibility and actionability in the intended route/role/state. Promote only the selected runtime-verified locator into `selectors/`

For every target, use the same Browser MCP page/session:

1. `browser_navigate` to the declared route
2. `browser_snapshot` after the declared ready state
3. `browser_evaluate` to inspect attributes, semantic relationships and a short anchored XPath when needed
4. Prove `count=1`, visibility and actionability
5. Export records to `scripts/discover-runtime-selectors.mjs --browser-mcp-evidence <file>`

Evidence must retain `provider`, `browser_driver`, `browser_observer`, `tools_used`, `run_id`, `app_build`, route/state, ordered candidates, exact locator and verification. The default provider is Playwright MCP; Chrome DevTools MCP is valid only when attached to the exact inspected page

If Browser MCP is unavailable, classify selector work `BLOCKED`/`UNTEST`. Use local discovery only with explicit `--provider playwright-runtime` and never label it Browser MCP. When XPath is required, it must be short, anchored to a stable attribute/semantic relationship and unique in the live DOM

Static route capture and stateful controls are module-scoped. Stateful dialogs/upload/Gate 1/Gate 2/run-result targets require the smallest one-worker testcase slice and runtime attachment; this supplements, never replaces, the Browser MCP record

## Evidence and verdict contract

Run through `scripts/run-testcase-pom.mjs`; it sets `QA_UNIFIED_EVIDENCE=true`. UI/functional `PASS` or `FAILED` requires screenshot/video and Playwright trace from the same run. Missing target, data, report, visual evidence, trace, timeout, interruption or stale selector evidence is `UNTEST`

Retry-pass is `FAILED` with `flaky=true`, not clean `PASS`. A suite preserves the strongest selected verdict: `FAILED` > `UNTEST` > `N/A` > `PASS`. Sheet write-back uses the exact unified report projection; no second judgement

Use bounded state waits for async upload, validation, generation, save and run actions. Wait for a semantic route/region/state transition, not `body` attachment, `networkidle` or fixed `waitForTimeout()`. Preserve entity ID across redirects, rediscover generated forms after transitions, and retry only bounded timeout/`408`/`429`/`5xx` cases—not business `4xx` validation failures

## Mode routing and references

| Need | Read |
|---|---|
| BUILD/RUN/BUILD_AND_RUN or Sheet/Excel | [testcase-execution.md](references/testcase-execution.md) |
| UI/POM and complete UI coverage | [ui-testing.md](references/ui-testing.md), [selector-discovery.md](references/selector-discovery.md), [ui-coverage-discovery.md](references/ui-coverage-discovery.md) |
| API | [api-testing.md](references/api-testing.md) |
| Data-driven/parallel | [data-driven-testing.md](references/data-driven-testing.md) |
| Traceability/token telemetry | [automation-audit.md](references/automation-audit.md) |
| CI/Allure/flaky management | [cicd.md](references/cicd.md), [AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md), [FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) |
| Performance | [performance-testing.md](references/performance-testing.md) |

## Hard gates

- `pom-plan`, runtime scaffold and module layout pass before delivery
- A current Browser MCP UI function inventory covers every allowed route/role/state; no-filter full runs reach 100% required-function coverage
- Every inventory function maps to a testcase/POM action and every actionable testcase target appears in the inventory
- Testcase IDs, source hash, action methods, values, assertions, RBAC, cleanup and `AUTOMATION_SOURCE` pass traceability
- All UI targets have fresh current-build selector evidence with Browser MCP provenance when `--require-browser-mcp` is enabled
- Selected tests actually run in Playwright and receive `PASS`, `FAILED`, `N/A` or `UNTEST`; UI/functional results retain same-session visual media and trace
- No placeholder, secret, `test.only()`, raw selector in specs, unowned mutable data or shared runtime JSON
- Record provider usage by stage when available: `testcase_generation`, `selector_discovery`, `pom_generation`, `repair`; do not report a source-size estimate as model usage

Read [testcase-execution.md](references/testcase-execution.md) for deterministic execution and Sheet integration. Do not load `dynamic-testing/web-exploratory/SKILL.md` for this deterministic workflow
