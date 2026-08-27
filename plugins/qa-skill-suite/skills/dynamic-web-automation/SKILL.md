---
name: dynamic-web-automation
description: Build and run deterministic manifest-driven Playwright automation for UI, API, and composed functional flows with maintainable POM/module clients, exact coverage, canonical evidence, and PASS, FAILED, N/A, or UNTEST verdicts. Trigger on deterministic testcase, Excel, Sheet, Playwright, POM, API automation, BUILD, RUN, or BUILD_AND_RUN. Auto-route; do not require the skill name. Do not use for authoring-only testcases, contract-only API validation, exploratory QA, accessibility, visual design review, or performance testing.
mode: dynamic
surface: web
role: executor
legacy_aliases: playwright-pom-automation
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# Deterministic UI and API automation

Turn a bounded `.automation.json` manifest into maintainable Playwright code, execute the selected cases, and return evidence-backed verdicts. Use the scripts as the source of truth; do not recreate their naming, planning, coverage, or report logic in prose.

## Route and scope

- Resolve `BUILD`, `RUN`, or default `BUILD_AND_RUN`
- Resolve one surface: `ui`, `api`, or `functional`; functional means a composed UI and API flow in the same testcase
- Select exactly one business module and at most 20 cases by group or exact testcase ID
- Treat the automation manifest as the only code and execution source; legacy prose-only cases are not automatable until normalized
- Record target, environment, role/data, expected result, production boundary, cleanup, and stop condition before execution
- Do not create external state or run against production without an explicit target, owned data, and cleanup contract

## Canonical workflow

1. Run `npm run testcase-workflow -- --phase plan ...` through `scripts/run-testcase-pom.mjs`; the workflow invokes the `pom-plan` and `advanced-contracts` gates. UI coverage is mandatory by default
2. For UI/functional, create a current-build Browser MCP `UI_FUNCTION_INVENTORY` covering every allowed route, role, and state. For API/functional, require method, path, auth, expected status, schemas, mutation ownership, and cleanup in the manifest
3. Run `--phase build` or the default `--phase build-and-run`. The deterministic generator emits only the artifacts required by the selected surface
4. Bootstrap the pinned local toolchain and pass advanced testcase contracts, runtime scaffold, module layout, placeholder, TypeScript/ESLint, traceability, UI coverage, and API operation coverage gates as applicable
5. `RUN` requires the immutable BUILD `--plan-input`; reject a manifest hash mismatch
6. Read the generated codegen, coverage, layout, Allure, and execution reports. Return only `PASS`, `FAILED`, `N/A`, or `UNTEST`
7. Sheet/Excel write-back uses the exact execution projection and requires write confirmation plus read-back validation

## Generated project contract

One module is identified by `domain/feature`. Prefer explicit `domain` and `feature` manifest fields; legacy single-segment groups deterministically map to `app/<group>`, while `Domain / Feature` groups map to `<domain>/<feature>`:

```text
ui:         src/modules/<domain>/<feature>/ui/<feature>.selectors.ts
            src/modules/<domain>/<feature>/ui/<feature>.page.ts
            tests/ui/<domain>/<feature>.ui.spec.ts
api:        src/modules/<domain>/<feature>/api/<feature>.client.ts
            src/modules/<domain>/<feature>/api/schemas/<resource>/<operation>.schema.ts
            tests/api/<domain>/<feature>.api.spec.ts
functional: all module layers above
            tests/functional/<domain>/<feature>.functional.spec.ts
api map:    operation-inventory/<domain>/<feature>.api-operations.json
```

`scripts/artifact-naming.mjs` is the only identity/path resolver. Never derive schema names or files from testcase IDs; schemas are operation-owned and split by resource, method/path, status and deterministic shape variant. Reject identity collisions, reserved names, leaked batch names, non-codegen-owned target files, and symlink/junction output escapes.

Reusable manual code belongs only under `src/shared/{components,helpers,schemas,extensions}` or module-local `extensions/`. Every manual file must have one `src/shared/ownership.json` entry with `path`, `kind`, `owner`, and `purpose`; generated files cannot be claimed as manual extensions.

`automation-complexity.json` gates routes/module, selectors/module, actions/page, API operations/client, schema variants/operation, and generated file length. `reports/automation-complexity.json` must pass before RUN; split a feature or extract an owned shared component when a limit is exceeded.

Keep `fixtures/pom.ts` as the sole public Playwright fixture entrypoint. Generated specs import `test` and `expect` from it and consume `page`, `api`, or `authenticatedApi`. They must not import another fixture-owned `test`, destructure raw Playwright `request`, place locators in specs, or add per-spec Allure hooks.

Map each testcase ID to exactly one `test()`. Keep UI actions in Page Objects, API operations in module clients, request/response validation in Zod schemas, and assertions in specs. Preserve `AUTOMATION_SOURCE`, testcase IDs, `COV-*` source obligations, role/RBAC, values, cleanup, and operation markers. A manifest with `requirement_coverage` must have bidirectional testcase ↔ coverage-item links; generated specs carry `[TESTCASE:COVERAGE] COV-*` annotations and traceability fails when any link or marker is missing.

Parallel mutation requires one isolated account/storage state and dataset/cleanup slot per worker. Missing capacity is `UNTEST`; never cycle accounts, share mutable runtime JSON, or silently lower isolation.

## Browser MCP selector contract

For UI/POM work, read [selector-discovery.md](references/selector-discovery.md) and [ui-coverage-discovery.md](references/ui-coverage-discovery.md). Resolve selectors from the same Browser MCP page/session and current app build using this priority:

```text
existing testid -> stable id -> stable CSS -> role/label/placeholder/text -> short anchored XPath
```

Never invent `data-testid`. Reject generated classes, positional CSS, `.first()`, `.last()`, absolute/positional XPath, ambiguous matches, stale evidence, and a lower-priority locator when a verified higher-priority candidate exists. Prove count, visibility, and actionability in the intended route/role/state, then promote only the selected locator into `selectors/`.

Evidence retains provider, browser driver/observer, tools used, MCP session, run ID, app build, route/state, ordered candidates, selected locator, and verification. Playwright MCP is the default. Chrome DevTools MCP is valid only when attached to the exact inspected page. If Browser MCP is unavailable, return `BLOCKED`/`UNTEST`; local discovery must not be labelled Browser MCP.

## Evidence and verdicts

All deterministic surfaces use the canonical `fixtures/allure-contract.ts` and one Allure result format:

- Every executable result has `account`, `url`, `evidence_image`, and `evidence_video`
- UI/functional results additionally require the exact `evidence-image` and `evidence-video` attachments plus Playwright trace from the same run
- API results use `N/A` for browser-only media and never fabricate attachments
- Missing/stale evidence, target, data, report, timeout, interruption, or blocked contract produces `UNTEST`
- Retry-pass is `FAILED` with `flaky=true`; an unmarked Playwright skip is `UNTEST`, not `N/A`
- Suite precedence is `FAILED > UNTEST > N/A > PASS`

## Read only what the mode needs

| Need | Reference |
|---|---|
| BUILD/RUN/Sheet integration | [testcase-execution.md](references/testcase-execution.md) |
| UI/POM and waits | [ui-testing.md](references/ui-testing.md) |
| Browser MCP selectors | [selector-discovery.md](references/selector-discovery.md) |
| Complete UI-function coverage | [ui-coverage-discovery.md](references/ui-coverage-discovery.md) |
| API automation | [api-testing.md](references/api-testing.md) |
| Data-driven and parallel isolation | [data-driven-testing.md](references/data-driven-testing.md) |
| Traceability and token telemetry | [automation-audit.md](references/automation-audit.md) |
| CI, quality gates, Allure merge, flaky policy | [cicd.md](references/cicd.md), [AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md), [FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md), [allure-playwright-mapping.md](references/allure-playwright-mapping.md) |
| Deciding what to automate, automation value formula | [test-selection-strategy.md](references/test-selection-strategy.md) |
| Network interception, mocking, HAR playback | [network-interception.md](references/network-interception.md) |
| UI + API + DB cross-layer verification | [db-verification.md](references/db-verification.md) |

Handoff authoring-only work to `support-testcase-authoring`, contract-only validation to `hybrid-api-contract`, exploratory browser QA to `dynamic-web-exploratory`, WCAG to `hybrid-accessibility`, visual design review to `hybrid-ui-ux-review`, and load/performance work to `dynamic-performance`.

## Hard gates

- UI full runs require 100% UI-function inventory coverage and fresh same-session selector evidence
- Each selected API testcase maps exactly once to method, path, canonical fixture, auth/role, expected status, schemas, and required cleanup
- Runtime scaffold, module layout, complexity, traceability, applicable coverage, and `reports/allure-contract.json` must pass
- `AUTOMATE`/`ACTIVE` selection is required when selection metadata exists; `DEFER`, `REJECT`, and `RETIRED` are excluded from the plan and never projected as runtime `N/A`
- Mock/HAR and DB verification contracts must pass `reports/advanced-test-contracts.json`, including compatible route actions, inspected HAR content and approved hosts, real-flow sibling coverage, declared helper exports, one read-only parameterized SQL statement, declared drivers, RUN-time credential presence, and specialist-skill handoffs
- Generated specs use the canonical fixture, contain no raw selector/request, and selected tests actually execute
- Never claim `PASS` from static findings, generated code alone, or missing runtime evidence
