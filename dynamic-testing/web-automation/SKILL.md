---
name: dynamic-web-automation
description: Build and execute deterministic testcase-driven Playwright Page Object Model automation with browser evidence and PASS, FAILED, N/A, or UNTEST verdicts. Trigger on running testcase Markdown, Excel, Sheet, or automation manifests; Playwright specs, POM, selectors, traceability, regression, Allure, flaky tests, visual, accessibility, performance, or CI; do not require the skill name. Use dynamic-web-exploratory only for exploratory/ad-hoc browser QA without a deterministic automation suite and support-testcase-authoring for testcase documents.
mode: dynamic
surface: web
role: executor
legacy_aliases: playwright-pom-automation
---

# Testcase Execution and Playwright POM

Own the complete deterministic workflow from shared automation manifest to reusable POM code, browser execution, evidence and verdict. Keep every selector in `selectors/`, actions in Page Objects and assertions in specs; preserve `AUTOMATION_SOURCE`, IDs and RBAC markers.

## Mandatory workflow

1. Resolve `BUILD`, `RUN` or default `BUILD_AND_RUN`, plus target, environment, account/data, production boundary and cleanup
2. Use `.automation.json` as the only execution/POM source and select at most 20 cases by group or Testcase ID
3. Run the unified workflow with `--phase plan`; generate selectors → Page Objects → tagged specs from that plan and consolidate emitted code by business module
4. Emit `fixtures/pom.ts`, `fixtures/runtime-context.ts`, dynamic `playwright.config.ts` and make every generated spec import `test`/`expect` from `fixtures/pom`
5. Verify UI locators in the live DOM and record current-build selector evidence
6. Bootstrap the target project-local Playwright runtime before typecheck/browser execution with `scripts/bootstrap-playwright.mjs`; it installs declared dependencies when missing, runs `npx --no-install playwright install chromium`, and checks `tsc --noEmit`
7. Pass runtime-scaffold, placeholder, TypeScript/lint and traceability gates
8. Run the unified workflow with `--phase execute`; it executes Playwright with same-session visual and trace evidence
9. Read `reports/testcase-pom-execution.json` and report only `PASS`, `FAILED`, `N/A` or `UNTEST`
10. For Sheet/Excel, project the same result to row IDs and perform write-back only after confirmation and validation
11. Add CI/Allure/quality gates only when the request includes pipeline/release delivery

Do not run against production or create external state without explicit target, data ownership and cleanup.

Read [references/testcase-execution.md](references/testcase-execution.md) for deterministic execution, verdict mapping and Sheet integration. Do not load `dynamic-testing/web-exploratory/SKILL.md` for this workflow.

## Token-efficient unified planning

Never load a large manifest into model context. Let the deterministic script read it and emit a target-scoped plan:

```bash
npm run testcase-workflow -- \
  --phase plan \
  --manifest testcases/<feature>.automation.json \
  --group LOGIN \
  --max-cases 20 \
  --output testcases/login.pom-plan.json
```

Use `--testcase-id TC-01,TC-02` for a smaller slice. The CLI blocks selections over 20 cases unless `--max-cases` is raised explicitly. Generate and verify one bounded group/slice at a time; do not reread the whole Markdown, manifest, repository or raw DOM after each case. This limit applies to planning context only and must not create `batch-01`, `batch-02` final code files.

The execute phase bootstraps the target project automatically. Run `node scripts/bootstrap-playwright.mjs --project-root <automation-root> --browsers chromium` directly when the editor must resolve generated imports immediately after BUILD. Use `--skip-bootstrap` only when the project-local runtime and typecheck have already passed

## Module artifact contract

Use `testcases[].group` as the business-module boundary unless the user supplies an explicit module map. For a full module/project BUILD:

- Create exactly one `tests/<surface>/<module>.<surface>.spec.ts` containing every selected testcase in that module; keep one testcase ID per `test()`
- Create exactly one `pages/<module>.page.ts` for module actions and one `selectors/<module>.selectors.ts` for that module's selector registry
- Keep shared base classes, fixtures and cross-module components in clearly named shared files; never place actions or selectors from every module in one `aifa.page.ts`, `app.page.ts` or global selector file
- Bounded plans may remain as multiple internal `plans/<module>.batch-NN.pom-plan.json` files, but merge their generated code into the module's single spec/Page Object/selector files
- Final module code filenames must not contain `batch-NN`; reject both one global mega-file and multiple final spec files for the same module
- Preserve manifest module order and testcase order inside each module; generation must be deterministic and rerunnable without duplicating IDs
- Run `scripts/verify-module-artifact-layout.mjs` after BUILD and block delivery when the module/file mapping fails
- Always copy the deterministic runtime scaffold into the target project: `fixtures/pom.ts`, `fixtures/runtime-context.ts` and `scripts/verify-runtime-scaffold.mjs`
- Generated specs must import `test` and `expect` from the relative `fixtures/pom` entrypoint; importing them from `@playwright/test` bypasses account/data isolation and is a delivery blocker
- Keep `test.describe.serial` for an ordered/mutating module unless every testcase in that module has independently owned data and cleanup; Playwright may still run separate module files concurrently

## Testcase-to-code contract

BUILD and RUN share the same `entry`, steps, values, assertions, cleanup and selected IDs. Never create a second runtime interpretation from Markdown/Excel prose.

- One testcase ID maps to one `test()` unless the user explicitly requests another grouping
- `entry` maps to fixtures/setup; role and RBAC refs remain metadata
- Each plan step provides exact `action`, `target_key`, `value_fingerprint`, marker and required Page Object method
- Name action methods deterministically as `<action><PascalTargetKey>`, for example `fillEmailInput`, `clickLoginSubmit`, `navigateLoginPage`
- Each step assertion and outcome provides a marker and allowed matcher such as `toHaveValue`, `toBeVisible` or `toHaveURL`
- Use the exact structured value/data reference from the plan; do not reconstruct it from prose
- Page Object value/file methods pass `target_key` into the runtime resolver so a dataset can override an exact field without changing generated source
- Map mutating cleanup to `finally` or fixture teardown
- Legacy text-only cases are not automatable until normalized

Traceability blocks generic `performStep()` mappings, wrong action method, missing value fingerprint, incompatible assertion matcher, stale source hash, incomplete role/RBAC/cleanup markers, and empty implementations.

## UI selector gate

Read [references/selector-discovery.md](references/selector-discovery.md) before UI selector work. Use this priority:

`existing testid → stable id → stable CSS → role/label/placeholder/text → short anchored XPath`

- Never invent or inject `data-testid`
- Verify count, visibility and actionability in the intended route/role/state
- Never use `.first()`, `.last()`, positional CSS, generated classes or full XPath to hide ambiguity
- Evidence must include `captured_at`, same-browser `run_id`, current `app_build`, ordered candidates and verification
- Commit only the selected runtime-verified locator to `selectors/`

Run traceability with the current build and freshness limit:

```bash
npm run traceability -- \
  --testcases testcases/<feature>.md \
  --manifest testcases/<feature>.automation.json \
  --app-build "$QA_APP_BUILD" \
  --max-evidence-age-hours 168
```

Selector JSON is evidence, not proof by itself; the unified Playwright run must reach the intended state and pass the business assertion.

## Execution evidence and verdict

- Run through `scripts/run-testcase-pom.mjs`; it sets `QA_UNIFIED_EVIDENCE=true`
- UI/functional `PASS` or `FAILED` requires an existing screenshot/video and Playwright trace from the same test run
- Direct Playwright runs also record screenshot, video and trace by default; artifacts are written to `evidence/test-results/`, HTML to `evidence/html/`, and JSON to `reports/playwright.json`
- Retry-pass is `FAILED` with `flaky=true`, never clean `PASS`
- Missing test, traceability, target, data, report, visual, trace, timeout or interruption is `UNTEST`
- Skipped by an applicable suite condition is `N/A`
- Sheet write-back uses the exact verdict projection from the unified report; no second agent judgement

## POM invariants

- `selectors/<feature>.selectors.ts` uses `as const`
- One business module owns one final spec, Page Object and selector file; plan batching never leaks into final code filenames
- Page Objects keep locator collections `private readonly` and expose getters/actions
- Specs never import selector builders or call `page.locator()`/`page.getBy*()`
- Page Object action methods contain no `expect()`
- Every test has an appropriate tag such as `@ui`, `@api`, `@functional`, `@smoke`
- Manifest-generated specs import from `fixtures/pom`; `scripts/verify-runtime-scaffold.mjs` rejects direct `@playwright/test` imports
- Runtime data is unique by run/project/parallel/worker/test/retry/repeat; browser isolation alone does not isolate backend state
- `parallelIndex` selects one non-cycling storage-state account and one dataset slot; pool shortage is `UNTEST`, never silent account reuse
- Retries use new data, preserve first-attempt evidence and are classified flaky rather than clean PASS
- Secrets stay in environment/CI credentials; project data, auth state and live evidence stay outside this skill repository

## Mode routing

Read only the selected references:

| Need | Read | Templates |
|---|---|---|
| Testcase execution, BUILD_AND_RUN or Sheet/Excel | [references/testcase-execution.md](references/testcase-execution.md) | `scripts/run-testcase-pom.mjs` |
| UI/POM | [references/ui-testing.md](references/ui-testing.md) + [references/selector-discovery.md](references/selector-discovery.md) | `pages/`, `selectors/`, `tests/ui/` |
| API | [references/api-testing.md](references/api-testing.md) | `fixtures/api-client.ts`, `tests/api/` |
| UI+API functional flow | UI + API references | `tests/functional/` |
| Data-driven/parallel | [references/data-driven-testing.md](references/data-driven-testing.md) | `fixtures/pom.ts`, `fixtures/runtime-context.ts`, `fixtures/data-driven.ts`, `test-data/` |
| Testcase traceability/token telemetry | [references/automation-audit.md](references/automation-audit.md) | `scripts/generate-pom-plan.mjs`, `scripts/verify-testcase-traceability.mjs` |
| CI/CD | [references/cicd.md](references/cicd.md) + [references/AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md) + [references/FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) | selected platform template |
| Performance | [references/performance-testing.md](references/performance-testing.md) | k6/Playwright perf template |

Use component/API/contract tests for deterministic lower-level rules and keep UI suites focused on critical journeys. Run k6 separately when concurrency or p95/p99 is required.

## Hard gates

- `pom-plan` succeeds for every selected testcase slice
- Runtime scaffold verification passes and every generated spec is wired through `fixtures/pom`
- TypeScript/lint and relevant tests pass
- Testcase IDs, source hash, action methods, values, assertions, role/RBAC and cleanup pass traceability
- All UI target keys have fresh current-build selector evidence and appear in selector code
- The selected tests actually run in Playwright and every testcase receives `PASS`, `FAILED`, `N/A` or `UNTEST`
- UI/functional PASS/FAILED has existing visual media plus same-session trace; missing evidence is UNTEST
- Parallel mutation runs have one existing storage-state account plus one independently owned dataset/cleanup slot per worker; missing capacity is UNTEST
- No raw selector in specs, placeholder, secret, `test.only()`, unowned mutable data or shared runtime JSON
- CI delivery additionally preserves retry evidence, flaky classification, duration/coverage/browser gates and selected platform credentials
- Provider usage is recorded by stage when available: `testcase_generation`, `selector_discovery`, `pom_generation`, `repair`; never report a source-size estimate as actual model usage
