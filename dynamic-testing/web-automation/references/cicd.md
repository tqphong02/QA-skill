# CI/CD contract for deterministic Playwright POM

Read this reference for GitHub Actions, GitLab CI, Jenkins, scheduled execution, Allure
publication or flaky-test handling. The copyable templates live under
`assets/templates/`.

## Stable project interface

The package scripts are the only interface used by developers and CI. They
wrap project-local binaries through `scripts/qa.mjs`, so the workflow does not
duplicate Playwright arguments or depend on a globally installed CLI.

| Command | Contract |
|---|---|
| `npm run qa:lint` | TypeScript `--noEmit` followed by ESLint |
| `npm run qa:test:ui` | UI tests with the `@ui` tag |
| `npm run qa:test:api` | API tests with the `@api` tag |
| `npm run qa:test:functional` | Functional tests with the `@functional` tag |
| `npm run qa:test -- --surface all` | Full deterministic suite |
| `npm run qa:quality -- --surface <surface> --project <browser>` | Enforce minimum executed tests, required surface tags and expected browser projects |
| `npm run qa:contract -- --mode <mode>` | Validate the canonical Allure result shape |
| `npm run qa:report -- --mode mixed --contract-output <file> --report-output <dir>` | Validate then generate the canonical Allure HTML report; ambiguous `--output`/`--no-media` are blocked |
| `npm run qa:merge-allure -- --expect-artifact <name>` | Merge every expected downloaded job result without overwriting collisions; missing jobs/results are blocked |
| `npm run qa:preflight -- --surface <surface> --require-auth` | Validate project layout, lockfile, scripts, URLs and CI auth inputs without printing secrets |
| `npm run qa:clean` | Remove only known generated output directories |
| `npm run toolchain:check` | Validate `package.json` dependency parity against `dependency-versions.json` before install |

Additional Playwright options are forwarded after `--`, for example:

```bash
npm run qa:test:ui -- --project=firefox --grep @smoke
```

Direct `npx playwright test` is reserved for local debugging. CI uses the
stable `qa:*` commands; `qa:install:browsers` is the single browser-provisioning
entrypoint.

## Project root and lockfile contract

The quickstart places the automation project in `<repository>/qa`. The
GitHub/Jenkins templates therefore define `QA_PROJECT_DIR=qa`. If the
automation `package.json` is at repository root, set `QA_PROJECT_DIR=.` in the
workflow and Jenkinsfile and keep all artifact paths aligned with that value.

The selected project directory must contain `package.json`,
`package-lock.json`, `quality-gates.json` and `scripts/qa.mjs`. Commit the
lockfile after the first `npm install`; CI intentionally uses `npm ci` and
does not silently fall back to a mutable install. Run `npm run toolchain:check`
before `npm ci`; dependency drift is fail-closed. The static preflight checks
the lockfile and unresolved placeholders before dependency installation, while
`qa:preflight` checks surface-specific URLs and optional authentication inputs.

## Required output layout

Every job writes to the same paths:

| Path | Contents |
|---|---|
| `reports/playwright.json` | Playwright machine report |
| `reports/junit.xml` | JUnit report |
| `reports/quality-gate.json` | Threshold evaluation |
| `reports/allure-results/` | Raw canonical Allure results and attachments |
| `reports/allure-contract.json` | `PASS` or `BLOCKED` contract result |
| `reports/module-artifact-layout.json` | Surface-aware generated module layout gate |
| `reports/automation-complexity.json` | Route, selector, action, API operation, schema variant and generated file-length gate |
| `reports/api-operation-coverage.json` | Exact selected API operation coverage when applicable |
| `evidence/` | HTML, trace and unified screenshot/video evidence |

The runner clears stale raw results before a deterministic run. UI and
functional results require `account`, `url`, `evidence_image`,
`evidence_video`, `evidence-image` and `evidence-video`. A failed contract is
`UNTEST` for the deterministic verdict and must not be hidden by an HTML report.

## GitHub Actions topology

`assets/templates/github-actions-ci.yml` uses this dependency graph:

```text
preflight ── lint ── test-ui [chromium/firefox, max 1]
                     ── test-functional [chromium/firefox, max 1]
                     ── test-api ── report (always; consumes every artifact)
```

The browser and surface jobs are deliberately sequential because they receive
the same finite account/data secrets. This prevents five independent jobs from
all leasing slot `parallelIndex=0`. Playwright workers remain parallel inside
each job. Functional/API jobs use `always()` plus successful static gates, so a
failed live test delays but does not hide later surface evidence. Enable
job-level concurrency only when every job is wired to a separately leased
account/data pool or tenant.

The workflow-level concurrency group is repository-wide and does not cancel an
active run. This also prevents two branches or reruns from leasing the same
static pools at once. Add a ref/environment component to the group only after
the corresponding runs receive independent pools and cleanup ownership.

Each test job:

1. runs the static layout/lockfile/placeholder preflight;
2. runs `npm ci` from the committed lockfile;
3. validates the surface URL and authentication inputs without echoing values;
4. installs only the required project-local browser;
5. runs one surface through `npm run qa:test:*`;
6. evaluates the quality gate and Allure contract with `if: always()`;
7. uploads `reports/` and `evidence/`, including failed-run diagnostics;
8. fails explicitly after artifact upload when a test or gate failed.

The final `report` job also runs with `if: always()`. It downloads all `qa-*`
artifacts into `ci-artifacts/`, runs:

```bash
npm run qa:merge-allure -- \
  --input ci-artifacts \
  --output reports/allure-results \
  --summary reports/allure-merge.json \
  --expect-artifact qa-ui-chromium-<run-id> \
  --expect-artifact qa-ui-firefox-<run-id> \
  --expect-artifact qa-functional-chromium-<run-id> \
  --expect-artifact qa-functional-firefox-<run-id> \
  --expect-artifact qa-api-<run-id>
npm run qa:report -- --mode mixed
```

`merge-allure-results.mjs` deduplicates byte-identical files and blocks a
conflicting filename instead of silently replacing evidence. A missing job
artifact or missing canonical result therefore remains visible as `BLOCKED`.

Use repository/environment secrets for `BASE_URL`, `UI_BASE_URL`,
`API_BASE_URL`, `TEST_USER` and `TEST_PASS`, or `TEST_ACCOUNTS_JSON` for a
parallel account pool. Set `TEST_DATASETS_JSON` as the matching isolated data
pool before increasing `PW_WORKERS`; account capacity without data/cleanup
capacity remains a one-worker run. Every live job sets a distinct
`QA_RUN_ID`/`RUN_ID` from the workflow run, attempt, surface and browser. The
workflow tests an already reachable application;
it does not start or deploy the application. Never write credentials to
Allure parameters, source files, storage state or workflow logs.

Live UI/API/functional jobs are skipped for pull requests from forks because GitHub does
not expose repository secrets to fork workflows. Static preflight and lint
still run. If a live test job is red, fix the first failing step in this order:
layout/lockfile, `npm ci`, placeholder check, `qa:lint`, CI input preflight,
browser/test execution, then quality/Allure projection. Quality or Allure
errors after a missing Playwright report are secondary evidence, not the root
cause.

## Local PASS, CI FAIL diagnostic runbook

Debug the exact failing commit, job, browser/project and testcase. Start at the
first failed command in the job, not at a downstream quality/report error. A
manual rerun that happens to pass is evidence of instability; it does not turn
the original result into `PASS`.

Check parity in this order:

1. **Source and install:** confirm the CI checkout SHA, `QA_PROJECT_DIR`,
   committed `package-lock.json` and generated inputs. Reproduce with `npm ci`;
   do not compare CI with a mutable local `npm install` or an uncommitted file.
2. **Runtime and browser:** compare Node/npm, `@playwright/test`, the installed
   Playwright browser revision, OS/architecture and required system libraries.
   Provision browsers through `npm run qa:install:browsers` from the same
   lockfile; do not use a global Playwright installation.
3. **Inputs and identity:** compare the presence—not the values—of base URLs,
   environment flags, secret names, role/account and dataset slot. Run the same
   `qa:preflight -- --surface <surface>` arguments used by CI and keep all
   credentials redacted.
4. **Rendering environment:** compare headless/headed mode, browser project,
   viewport/device, locale, timezone, fonts, color scheme and reduced-motion
   settings. Fix the product expectation or locator when the UI legitimately
   differs; do not copy a positional selector from one environment.
5. **Network and dependencies:** check DNS, proxy, TLS certificates, firewall,
   service health, redirects, rate limits and third-party availability. Use the
   same-session trace/network response to distinguish an application failure
   from a locator failure.
6. **Concurrency and data:** compare workers, sharding, retries and execution
   order. Confirm one isolated account/data/cleanup slot per parallel worker.
   Re-run the smallest failing slice with one worker to expose a race, but fix
   the shared state instead of permanently serializing independent tests.
7. **Resources and timing:** compare runner CPU, memory, disk and service
   latency. Wait for a semantic state/response and inspect where time was spent;
   do not raise global timeouts or retries before identifying the missing
   condition.
8. **Evidence:** inspect `reports/playwright.json`, JUnit, the first-attempt
   error, `trace.zip`, `evidence-image`, `evidence-video`, console/page errors
   and network responses from the same attempt. Preserve the original failed
   artifact when a retry also exists.

Reproduce through the same public interface and the narrowest failing slice:

```bash
# Set CI=true, PW_WORKERS=1 and the same redacted CI inputs in the shell/job environment.
npm ci
npm run qa:preflight -- --surface ui --require-auth
npm run qa:test:ui -- --project=chromium --workers=1 --grep "<testcase-id-or-title>"
```

Use the same runner image/container when available. For browser launch failures,
enable `DEBUG=pw:browser` only for the diagnostic run. Once the cause is fixed,
rerun the exact failing slice under the original CI worker count and then the
full failed job. Classify missing environment/authority/data as `UNTEST`, a
violated product expectation as `FAILED`, and a retry-pass as `FAILED` with
`flaky=true`; never make CI green by deleting evidence or rerunning until pass.

## Jenkins

`assets/templates/Jenkinsfile` uses the same `qa:*` commands and output paths:
layout/lockfile preflight, one tagged all-surface Playwright invocation,
`qa:quality`, `qa:report`, JUnit publication and archived
`reports/**, evidence/**` under `QA_PROJECT_DIR`. Playwright owns safe file-level
parallelism inside that invocation. This avoids concurrent UI/API reporters
overwriting the same workspace paths. `disableConcurrentBuilds()` prevents two
builds from leasing the same static backend pools, and `BUILD_TAG` supplies the
run namespace. Configure the `Node-24` NodeJS
installation and credential IDs in Jenkins; do not change the test contract per
platform.

## GitLab CI

`assets/templates/.gitlab-ci.yml` provides the same stable project interface for
merge requests, pushes, schedules and manual pipelines. It uses a pinned
Playwright image, `npm ci`, static preflight, lint, one all-surface Chromium run,
the quality gate, the Allure contract/report and `artifacts: when: always`

`resource_group: qa-static-test-pool` serializes jobs that share the same finite
account/data pool. Remove or partition that resource group only when each
concurrent pipeline receives separately leased accounts, datasets and cleanup
ownership. Store `BASE_URL`, `UI_BASE_URL`, `API_BASE_URL`, account pools and
credentials as protected or environment-scoped GitLab CI variables; never put
their values in the YAML

## Flaky policy and cross-skill handoff

Performance/load/JMeter/k6 belongs to `dynamic-performance` and is absent from
this automation CI template. Playwright retries are bounded by `PW_RETRIES` (0–2); a retry-pass remains
`FAILED` with `flaky=true`, never a clean `PASS`. The executable quality gate
reads the real Playwright `suites/specs/tests` report shape, blocks an empty
report and counts a retry-pass in `failed` even when `maxFlakeRate` itself is
below threshold. Keep configurable thresholds in `quality-gates.json`, not in
YAML or Jenkinsfile logic.

## CI anti-patterns

- Do not launch independent Playwright reporters concurrently in one workspace.
  The `qa:*` runner owns an execution lock for the fixed report paths. Use
  isolated workspaces/artifacts, or one canonical tagged all-surface invocation.
- Do not run matrix/surface jobs concurrently against the same finite account or
  dataset pool. Serialize them or lease dedicated pools per job.
- Do not generate Allure only on success; upload evidence with `always()`.
- Do not use a global Playwright or Gemini/Antigravity browser override.
- Do not overwrite a downloaded Allure attachment on filename collision.
- Do not commit `.env`, credentials, storage state, reports or runtime data.
