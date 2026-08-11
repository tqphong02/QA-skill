# Unified testcase execution and POM

Use this reference when the request includes executing deterministic testcases, generating POM, or both. Do not load `dynamic-testing/web-exploratory/SKILL.md` for this workflow.

## One workflow

```text
.automation.json
  → bounded plan
  → selectors + Page Objects + specs
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

## Commands

Create the bounded plan before code generation:

```bash
npm run testcase-workflow -- \
  --phase plan \
  --manifest testcases/login.automation.json \
  --group LOGIN \
  --max-cases 20
```

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

The runner sets `QA_UNIFIED_EVIDENCE=true`; Playwright records screenshot, video and trace for the selected tests. The runner blocks browser execution when traceability is not `PASS`.

## Verdict gate

- `PASS`: Playwright passed with required screenshot/video and same-session trace
- `FAILED`: assertion/action failed with required evidence, or a retry-pass is flaky
- `N/A`: the Playwright test was skipped by an applicable suite condition
- `UNTEST`: missing test, selector/build traceability, target, data, browser report, visual evidence, trace, timeout or interruption

For UI/functional tests, JSON, logs or a report without existing visual media and trace cannot support `PASS` or `FAILED`.

## Google Sheet or Excel

Use the existing Sheet adapter only as an internal read/write integration; execution ownership stays in this skill.

1. Create a Sheet plan with the workspace compatibility adapter `dynamic-testing/web-exploratory/scripts/helpers/execute-sheet.mjs --plan-only` and confirm module, worker count `1-4`, and worker selection; invoke the script directly without loading the dynamic-web-exploratory skill or browser workflow
2. Pass its `sheet-worker-plan.json` to unified execution with `--sheet-plan`; the runner creates `reports/sheet-worker-results.json`
3. Validate the result file, then pass it back to `execute-sheet.mjs --results-file` for authorized write-back

The same Testcase ID must resolve in the Sheet plan, automation manifest, POM spec and execution report. Never parse F/G/H to replace a supplied manifest.

## Safety

- Do not execute production or destructive/mutating cases without exact target, data ownership, cleanup and approval
- Run one bounded group/slice at a time
- Use current-build selector evidence from the same target state
- Keep retry evidence and never promote flaky to clean PASS
- Write runtime artifacts under the automation project, not this skill repository
