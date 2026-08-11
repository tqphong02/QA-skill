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
3. Run the unified workflow with `--phase plan`; generate selectors → Page Objects → tagged specs from that plan
4. Verify UI locators in the live DOM and record current-build selector evidence
5. Pass placeholder, TypeScript/lint and traceability gates
6. Run the unified workflow with `--phase execute`; it executes Playwright with same-session visual and trace evidence
7. Read `reports/testcase-pom-execution.json` and report only `PASS`, `FAILED`, `N/A` or `UNTEST`
8. For Sheet/Excel, project the same result to row IDs and perform write-back only after confirmation and validation
9. Add CI/Allure/quality gates only when the request includes pipeline/release delivery

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

Use `--testcase-id TC-01,TC-02` for a smaller slice. The CLI blocks selections over 20 cases unless `--max-cases` is raised explicitly. Generate and verify one bounded group/slice at a time; do not reread the whole Markdown, manifest, repository or raw DOM after each case.

## Testcase-to-code contract

BUILD and RUN share the same `entry`, steps, values, assertions, cleanup and selected IDs. Never create a second runtime interpretation from Markdown/Excel prose.

- One testcase ID maps to one `test()` unless the user explicitly requests another grouping
- `entry` maps to fixtures/setup; role and RBAC refs remain metadata
- Each plan step provides exact `action`, `target_key`, `value_fingerprint`, marker and required Page Object method
- Name action methods deterministically as `<action><PascalTargetKey>`, for example `fillEmailInput`, `clickLoginSubmit`, `navigateLoginPage`
- Each step assertion and outcome provides a marker and allowed matcher such as `toHaveValue`, `toBeVisible` or `toHaveURL`
- Use the exact structured value/data reference from the plan; do not reconstruct it from prose
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
- Retry-pass is `FAILED` with `flaky=true`, never clean `PASS`
- Missing test, traceability, target, data, report, visual, trace, timeout or interruption is `UNTEST`
- Skipped by an applicable suite condition is `N/A`
- Sheet write-back uses the exact verdict projection from the unified report; no second agent judgement

## POM invariants

- `selectors/<feature>.selectors.ts` uses `as const`
- Page Objects keep locator collections `private readonly` and expose getters/actions
- Specs never import selector builders or call `page.locator()`/`page.getBy*()`
- Page Object action methods contain no `expect()`
- Every test has an appropriate tag such as `@ui`, `@api`, `@functional`, `@smoke`
- Runtime data is unique by run/project/parallel/worker/test/retry/repeat; browser isolation alone does not isolate backend state
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
| Data-driven/parallel | [references/data-driven-testing.md](references/data-driven-testing.md) | `fixtures/data-driven.ts`, `test-data/` |
| Testcase traceability/token telemetry | [references/automation-audit.md](references/automation-audit.md) | `scripts/generate-pom-plan.mjs`, `scripts/verify-testcase-traceability.mjs` |
| CI/CD | [references/cicd.md](references/cicd.md) + [references/AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md) + [references/FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) | selected platform template |
| Performance | [references/performance-testing.md](references/performance-testing.md) | k6/Playwright perf template |

Use component/API/contract tests for deterministic lower-level rules and keep UI suites focused on critical journeys. Run k6 separately when concurrency or p95/p99 is required.

## Hard gates

- `pom-plan` succeeds for every selected testcase slice
- TypeScript/lint and relevant tests pass
- Testcase IDs, source hash, action methods, values, assertions, role/RBAC and cleanup pass traceability
- All UI target keys have fresh current-build selector evidence and appear in selector code
- The selected tests actually run in Playwright and every testcase receives `PASS`, `FAILED`, `N/A` or `UNTEST`
- UI/functional PASS/FAILED has existing visual media plus same-session trace; missing evidence is UNTEST
- No raw selector in specs, placeholder, secret, `test.only()`, unowned mutable data or shared runtime JSON
- CI delivery additionally preserves retry evidence, flaky classification, duration/coverage/browser gates and selected platform credentials
- Provider usage is recorded by stage when available: `testcase_generation`, `selector_discovery`, `pom_generation`, `repair`; never report a source-size estimate as actual model usage
