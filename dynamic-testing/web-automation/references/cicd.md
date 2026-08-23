# CI/CD contract for deterministic Playwright POM

Read this reference for GitHub Actions, Jenkins, scheduled execution, Allure
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
| `npm run qa:quality` | Evaluate `reports/playwright.json` against `quality-gates.json` |
| `npm run qa:contract -- --mode <mode>` | Validate the canonical Allure result shape |
| `npm run qa:report -- --mode mixed` | Validate then generate `reports/allure-report` |
| `npm run qa:merge-allure` | Merge downloaded job results without overwriting collisions |
| `npm run qa:preflight -- --surface <surface> --require-auth` | Validate project layout, lockfile, scripts, URLs and CI auth inputs without printing secrets |
| `npm run qa:clean` | Remove only known generated output directories |

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
does not silently fall back to a mutable install. The static preflight checks
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
| `evidence/` | HTML, trace and unified screenshot/video evidence |

The runner clears stale raw results before a deterministic run. UI and
functional results require `account`, `url`, `evidence_image`,
`evidence_video`, `evidence-image` and `evidence-video`. A failed contract is
`UNTEST` for the deterministic verdict and must not be hidden by an HTML report.

## GitHub Actions topology

`assets/templates/github-actions-ci.yml` uses this dependency graph:

```text
preflight ── lint ──┬── test-ui (chromium) ──┐
                    ├── test-ui (firefox) ───┼── report (always)
                    └── test-api ────────────┘
```

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
  --summary reports/allure-merge.json
npm run qa:report -- --mode mixed
```

`merge-allure-results.mjs` deduplicates byte-identical files and blocks a
conflicting filename instead of silently replacing evidence. A missing job
artifact or missing canonical result therefore remains visible as `BLOCKED`.

Use repository/environment secrets for `BASE_URL`, `UI_BASE_URL`,
`API_BASE_URL`, `TEST_USER` and `TEST_PASS`, or `TEST_ACCOUNTS_JSON` for a
parallel account pool. The workflow tests an already reachable application;
it does not start or deploy the application. Never write credentials to
Allure parameters, source files, storage state or workflow logs.

Live UI/API jobs are skipped for pull requests from forks because GitHub does
not expose repository secrets to fork workflows. Static preflight and lint
still run. If a live test job is red, fix the first failing step in this order:
layout/lockfile, `npm ci`, placeholder check, `qa:lint`, CI input preflight,
browser/test execution, then quality/Allure projection. Quality or Allure
errors after a missing Playwright report are secondary evidence, not the root
cause.

## Jenkins

`assets/templates/Jenkinsfile` uses the same `qa:*` commands and output paths:
layout/lockfile preflight, parallel UI/API stages, `qa:quality`, `qa:report`,
JUnit publication and archived `reports/**, evidence/**` under
`QA_PROJECT_DIR`. Configure the NodeJS installation and credential IDs in
Jenkins; do not change the test contract per platform.

## Performance and flaky policy

k6 is a separate manual/scheduled job and does not run on every pull request.
Playwright retries are bounded by `PW_RETRIES` (0–2); a retry-pass remains
`FAILED` with `flaky=true`, never a clean `PASS`. Keep thresholds in
`quality-gates.json`, not in YAML or Jenkinsfile logic.

## CI anti-patterns

- Do not merge UI and API into one opaque step; preserve separate artifacts.
- Do not generate Allure only on success; upload evidence with `always()`.
- Do not use a global Playwright or Gemini/Antigravity browser override.
- Do not overwrite a downloaded Allure attachment on filename collision.
- Do not commit `.env`, credentials, storage state, reports or runtime data.
