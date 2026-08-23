# Unified testcase execution and POM

Use this reference when the request includes executing deterministic testcases, generating POM, or both. Do not load `dynamic-testing/web-exploratory/SKILL.md` for this workflow.

## One workflow

```text
.automation.json
  → bounded plans
  → consolidate plans by business module
  → one selector + Page Object + spec file per module
  → traceability PASS
  → Playwright browser run
  → screenshot/video + trace from that run
  → PASS | FAILED | N/A | UNTEST
  → optional Sheet write-back
```

Modes:

- `BUILD`: create the plan and reusable POM code; no runtime verdict
- `RUN`: execute an existing traced POM suite and produce evidence/verdict
- `BUILD_AND_RUN`: default; complete BUILD then RUN without reinterpreting the manifest

Before `execute`, the unified runner bootstraps the target project-local runtime through `scripts/bootstrap-playwright.mjs`. It adds missing Playwright/TypeScript development dependencies, installs all declared package dependencies when local modules are absent, invokes `npx --no-install playwright install chromium`, and runs `tsc --noEmit` when the project has a `tsconfig.json`. Generated targets also wire this bootstrap to direct typecheck, provisioning and test npm entrypoints so editor/test commands do not depend on a pre-existing global install. It then runs `scripts/verify-runtime-scaffold.mjs`; browser execution is blocked when generated specs bypass `fixtures/pom` or screenshot/video/trace output is not configured. Use `--skip-bootstrap` only after those checks have passed independently

## Commands

Create the bounded plan before code generation:

```bash
npm run testcase-workflow -- \
  --phase plan \
  --manifest testcases/login.automation.json \
  --group LOGIN \
  --max-cases 20
```

The 20-case ceiling bounds each planning artifact, not the final source-file layout. When one module contains more than 20 testcases, create multiple `plans/<module-slug>.batch-NN.pom-plan.json` inputs, then deterministically merge them into:

```text
selectors/<module-slug>.selectors.ts
pages/<module-slug>.page.ts
tests/<surface>/<module-slug>.<surface>.spec.ts
```

`<module-slug>` is derived only from `testcase.group`: ASCII lowercase
`kebab-case`, accents removed, `&` becomes `and`, non-alphanumeric runs become
`-`, and a leading digit receives the `module-` prefix. Empty groups map to
`other`; `base` is reserved. If different groups produce the same slug, stop
with `MODULE_SLUG_COLLISION`. Do not derive filenames from testcase IDs,
scenario titles, routes, timestamps, workers or model output.

Do not emit `tests/**/<module-slug>.batch-NN.*.spec.ts`, one global Page Object,
or one global selector registry. Validate that every module has exactly one
final file of each kind and every Testcase ID appears in exactly one `test()`.

The generated `pom-plan` records the canonical identity for a bounded module:

```json
{
  "module": {
    "group": "Quản lý đơn hàng & Đổi trả",
    "slug": "quan-ly-don-hang-and-doi-tra"
  }
}
```

All downstream artifact builders consume `module.slug`; they must not
normalize `module.group` independently.

BUILD must also copy `fixtures/pom.ts`, `fixtures/runtime-context.ts`, `fixtures/allure-contract.ts`, `scripts/artifact-naming.mjs`, `scripts/verify-runtime-scaffold.mjs` and `scripts/verify-allure-contract.mjs` into the target project. Every generated spec imports `test` and `expect` from the relative `fixtures/pom` path. Keep ordered/mutating tests serial inside their business module; module files may run in parallel when the configured account and dataset pools have enough slots.

After generating selectors, Page Objects and specs, execute the same IDs:

```bash
npm run testcase-workflow -- \
  --phase execute \
  --manifest testcases/login.automation.json \
  --testcases testcases/login.md \
  --project-root . \
  --group LOGIN \
  --app-build "$QA_APP_BUILD" \
  --browser-project chromium
```

The runner sets `QA_UNIFIED_EVIDENCE=true`; the POM fixture records canonical `evidence-image` and `evidence-video` plus same-session trace for the selected tests. Raw Allure results are cleared into `reports/allure-results/`, validated into `reports/allure-contract.json`, HTML is under `evidence/html/`, and machine-readable execution output is under `reports/`. These folders appear only after a browser test starts; `fixtures/` is source code created during BUILD, not an evidence folder. The runner blocks browser execution when runtime scaffold, traceability or the Allure contract is not `PASS`.

## Verdict gate

- `PASS`: Playwright passed with canonical Allure parameters, image/video and same-session trace
- `FAILED`: assertion/action failed with canonical evidence, or a retry-pass is flaky
- `N/A`: the Playwright test was skipped by an applicable suite condition
- `UNTEST`: missing test, selector/build traceability, target, data, browser report, visual evidence, trace, timeout or interruption

For UI/functional tests, JSON, logs or an Allure HTML page without `reports/allure-contract.json: PASS`, canonical image/video and same-session trace cannot support `PASS` or `FAILED`.

## Google Sheet or Excel

Use the existing Sheet adapter only as an internal read/write integration; execution ownership stays in this skill.

1. Create a Sheet plan with the workspace compatibility adapter `dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --plan-only` and confirm module, worker count `1-4`, and worker selection; invoke the script directly without loading the dynamic-web-exploratory skill or browser workflow
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
