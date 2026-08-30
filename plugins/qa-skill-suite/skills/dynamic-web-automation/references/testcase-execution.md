# Unified testcase execution and POM

Use this reference when the request includes executing deterministic testcases, generating POM, or both. Do not load `../../dynamic-web-exploratory/SKILL.md` for this workflow.

## One workflow

```text
.automation.json
  → one immutable bounded module plan
  → deterministic surface-specific codegen
  → UI function coverage and/or API operation coverage PASS
  → module layout + complexity + runtime scaffold + traceability PASS
  → Playwright surface run
  → canonical same-run evidence
  → PASS | FAILED | N/A | UNTEST
  → optional Sheet write-back
```

Modes:

- `BUILD`: create the immutable plan and reusable UI/API/functional code; no runtime verdict
- `RUN`: require that exact plan through `--plan-input`, validate its manifest hash, then execute the existing generated suite
- `BUILD_AND_RUN`: default; complete BUILD then RUN without reinterpreting the manifest

Before planning, validate source coverage bidirectionally: every in-spec testcase references at least one `COV-*` item, every coverage-ledger item names its testcase IDs, and both sides agree. Preserve those refs in the immutable POM plan and generated spec annotations so an executable test cannot silently drift away from the documented obligation

For API/functional execution, the runner reads each `stability_gate`, passes the largest bounded `repeat_count` to Playwright as `--repeat-each`, and writes `reports/stability-gate.json`. A testcase is promoted only when it has enough attempts, the required clean-pass suffix, and a flaky rate at or below its threshold. Missing attempts produce `UNTEST`; a failed or retry-pass attempt remains `FAILED`

Before `execute`, the unified runner bootstraps the target project-local runtime through `scripts/bootstrap-playwright.mjs`. It adds missing Playwright/TypeScript development dependencies, installs all declared package dependencies when local modules are absent, invokes `npx --no-install playwright install chromium`, and runs `tsc --noEmit` when the project has a `tsconfig.json`. Generated targets also wire this bootstrap to direct typecheck, provisioning and test npm entrypoints so editor/test commands do not depend on a pre-existing global install. It then runs `scripts/verify-runtime-scaffold.mjs`; browser execution is blocked when generated specs bypass `fixtures/pom` or screenshot/video/trace output is not configured. Use `--skip-bootstrap` only after those checks have passed independently

## Commands

Inspect the bounded plan without writing code:

```bash
npm run testcase-workflow -- \
  --phase plan \
  --mode api \
  --manifest testcases/login.automation.json \
  --group LOGIN \
  --max-cases 20
```

The hard 20-case ceiling bounds each plan and a plan contains exactly one module. When one module contains more than 20 testcases, create multiple `plans/<module-slug>.batch-NN.pom-plan.json` inputs; the standalone code generator may deterministically consolidate those batches. Final files remain surface-specific:

```text
ui: src/modules/<domain>/<feature>/ui/{<feature>.selectors.ts,<feature>.page.ts}
api: src/modules/<domain>/<feature>/api/<feature>.client.ts plus schemas/<resource>/<operation>.schema.ts
tests: tests/<surface>/<domain>/<feature>.<surface>.spec.ts
API sidecar: operation-inventory/<domain>/<feature>.api-operations.json
```

Prefer explicit `domain` and `feature`; a legacy single group maps to
`app/<group>`, and `Domain / Feature` maps to two path segments. Both segments
are canonical ASCII `kebab-case`. Stop on identity collisions or reserved
segments. Do not derive paths or schemas from testcase IDs, scenario titles,
routes, timestamps, workers or model output.

Do not emit `tests/**/<module-slug>.batch-NN.*.spec.ts`, a global Page Object/client,
or a global selector registry. Validate exactly one required artifact of each
surface kind and exactly one `test()` per Testcase ID

The generated `pom-plan` records the canonical identity for a bounded module:

```json
{
  "module": {
    "group": "Quản lý đơn hàng & Đổi trả",
    "domain": "commerce",
    "feature": "order-returns",
    "key": "commerce/order-returns",
    "slug": "commerce-order-returns"
  }
}
```

All downstream artifact builders consume the canonical module identity; they
must not normalize `module.group` independently.

BUILD uses the template runtime scaffold and keeps `fixtures/pom.ts` as the only public fixture entrypoint. Every generated spec imports `test` and `expect` from it. API/module clients wrap `api` or `authenticatedApi`; generated specs never destructure raw Playwright `request`. Keep ordered/mutating tests serial inside their business module; module files may run in parallel only when configured account and dataset pools have enough unique slots. One `qa:*`/testcase runner owns fixed reporter paths per project root; a concurrent second invocation is `BLOCKED` while Playwright workers inside the owner invocation remain parallel

Build reusable API code and its operation inventory:

```bash
npm run testcase-workflow -- \
  --phase build \
  --mode api \
  --manifest testcases/orders.automation.json \
  --group ORDERS \
  --plan-output plans/orders.pom-plan.json
```

After generating selectors, Page Objects and specs, execute the same IDs:

```bash
npm run testcase-workflow -- \
  --phase execute \
  --manifest testcases/login.automation.json \
  --plan-input plans/login.pom-plan.json \
  --testcases testcases/login.md \
  --project-root . \
  --group LOGIN \
  --app-build "$QA_APP_BUILD" \
  --browser-project chromium
```

The runner sets `QA_UNIFIED_EVIDENCE=true`; UI/functional fixtures record canonical `evidence-image`, `evidence-video` and same-session trace. API results keep the same parameter contract with browser media marked `N/A`. Raw Allure results are cleared into `reports/allure-results/`, validated into `reports/allure-contract.json`, HTML is under `evidence/html/`, and machine output is under `reports/`. The runner blocks execution unless module layout, `reports/automation-complexity.json`, runtime scaffold, scoped traceability, applicable UI coverage and `reports/api-operation-coverage.json` are `PASS`

## Verdict gate

- `PASS`: Playwright passed with canonical Allure parameters, image/video and same-session trace
- `FAILED`: assertion/action failed with canonical evidence, or a retry-pass is flaky
- `N/A`: the skipped test carries an explicit `N/A`/`not_applicable` annotation; an unmarked skip is `UNTEST`
- `UNTEST`: missing test, selector/build traceability, target, data, browser report, visual evidence, trace, timeout or interruption

For UI/functional tests, JSON, logs or an Allure HTML page without `reports/allure-contract.json: PASS`, canonical image/video and same-session trace cannot support `PASS` or `FAILED`.

## Google Sheet or Excel

Use the existing Sheet adapter only as an internal read/write integration; execution ownership stays in this skill.

1. Create a Sheet plan with the workspace compatibility adapter `../../dynamic-web-exploratory/scripts/helpers/execute-sheet.mjs --plan-only` and confirm module, worker count `1-4`, and worker selection; invoke the script directly without loading the dynamic-web-exploratory skill or browser workflow
2. Pass its `sheet-worker-plan.json` to unified execution with `--sheet-plan`; the runner creates `reports/sheet-worker-results.json`
3. Validate the result file, then pass it back to `execute-sheet.mjs --results-file` for authorized write-back

The same Testcase ID must resolve in the Sheet plan, automation manifest, POM spec and execution report. Never parse F/G/H to replace a supplied manifest.

## Safety

- Do not execute production or destructive/mutating cases without exact target, data ownership, cleanup and approval
- Run one bounded group/slice at a time
- Consolidate bounded slices into one final code set per business module
- Use current-build selector evidence from the same target state
- Keep retry evidence and never promote flaky to clean PASS
- Write runtime artifacts under the automation project, not this skill repository
