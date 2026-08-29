# Playwright POM project template

This folder is the copyable automation framework. Keep the project-specific
manifest, selectors, credentials, test data and Browser MCP evidence in the
target repository; this template only supplies the runtime contract.

## Public commands

Use the `qa:*` commands in local development and CI. They are the stable
interface around the project-local Playwright, TypeScript, Allure and quality
gate tools.

```bash
npm install
npm run qa:install:browsers -- --browser chromium
npm run qa:lint
npm run qa:test:ui
npm run qa:test:api
npm run qa:test:functional
npm run qa:contract
npm run qa:report
npm run qa:clean

# In CI (or a shell with the CI URLs/credentials exported):
npm run qa:preflight -- --surface all --require-auth
```

Commit the generated `package-lock.json` after the first install. The GitHub,
GitLab and Jenkins templates intentionally use `npm ci` for reproducible builds and
fail early when the lockfile is missing or invalid. `qa:preflight` checks the
project layout, npm scripts, URLs and (when requested) CI authentication
inputs without printing secret values.

Additional Playwright flags are passed after `--`:

```bash
npm run qa:test:ui -- --project=firefox --grep @smoke
```

CI templates are available for GitHub Actions (`github-actions-ci.yml`), GitLab
CI (`.gitlab-ci.yml`) and Jenkins (`Jenkinsfile`). Set `QA_PROJECT_DIR` to the
directory containing this generated automation project

Parallelism is worker-level inside one `qa:*` invocation. When `PW_WORKERS` is
omitted, the config uses at most four workers and only up to the unique capacity
shared by both account and dataset pools; otherwise it uses one worker. Pool
lookup order is `<QA_PROJECT_KEY>_TEST_*_JSON`, `QA_TEST_*_JSON`, then
`TEST_*_JSON`, ignoring blank values. A second runner in the same project root
is blocked because the JSON/JUnit/Allure reporter paths are fixed.

The framework keeps one generated-output layout:

| Output | Purpose |
|---|---|
| `plans/` | Bounded, auditable POM plans derived from the manifest |
| `reports/` | JSON/JUnit/quality/Allure results and contract files |
| `evidence/` | Playwright HTML, trace, screenshot and video evidence |
| `selector-evidence/` | Browser MCP selector and UI-function records |
| `sessions/`, `runtime-data/` | Generated auth/data; sensitive and gitignored |

`reports/allure-results` is cleared before a deterministic run. UI and
functional results must pass the canonical Allure contract with the required
`account`, `url`, `evidence_image`, `evidence_video` parameters and the
`evidence-image`/`evidence-video` attachments.

`reports/`, `evidence/`, `sessions/` and `runtime-data/` are generated paths and
are not shipped as source folders. `sessions/` may contain authenticated
storage state, cookies or tokens and must never be committed.

## Adding a module

1. Inventory the complete route/role/state with Browser MCP.
2. Add the bounded automation manifest and UI-function inventory.
3. Prefer explicit manifest `domain` and `feature`; legacy groups map to
   `app/<group>` and `Domain / Feature` maps to two canonical path segments.
4. Keep generated UI/API code in `src/modules/<domain>/<feature>/`. Put only
   reusable manual components in `src/shared/components/` and register their
   owner and purpose in `src/shared/ownership.json`.
5. Add one tagged spec at
   `tests/<surface>/<domain>/<feature>.<surface>.spec.ts`. API schemas are split
   under `api/schemas/<resource>/<operation>.schema.ts`, never by testcase ID.
6. Run `npm run runtime-scaffold`, `npm run module-layout`, `npm run complexity-gate` and the relevant
   traceability/coverage commands before opening a pull request.

The canonical identity is used for generated module paths. Batch names are intermediate
only; they are forbidden in final source filenames. A module has exactly one
final Page Object, selector registry, client and spec. The layout validator
blocks missing, extra, batch-leaked, colliding or unowned manual artifacts.

`test-data/` is committed/static data. `runtime-data/` is generated data and
is not a second source-data folder.

Copy `github-actions-ci.yml` to `.github/workflows/qa.yml`. The workflow
assumes the automation project is in `<repository>/qa`; change
`QA_PROJECT_DIR` to `.` when `package.json` is at repository root. It validates
the lockfile and placeholders before install, then separates lint, UI browser
matrix, functional browser matrix, API and unified Allure report jobs on Node
24 LTS. Browser/surface jobs consume shared secret pools sequentially; each
Playwright invocation may still use multiple isolated workers. A repository-wide
workflow concurrency group also prevents separate refs/reruns from sharing the
static pool at the same time. Each live test
job validates `UI_BASE_URL`/`API_BASE_URL` and test
credentials before running, and uploads `reports/` and `evidence/` even after a
test failure. Pull requests from forks skip live UI/API/functional jobs because
GitHub does not expose repository secrets to them; the static preflight and lint
job still run.

The workflow tests an already reachable application; it does not start or
deploy the product under test. Configure `BASE_URL`, `UI_BASE_URL`,
`API_BASE_URL`, `TEST_USER`, `TEST_PASS` or `TEST_ACCOUNTS_JSON` as repository
or environment secrets. Add `TEST_DATASETS_JSON` with an isolated dataset per
account before enabling multiple workers. Jenkins disables concurrent builds
that would lease the same static pools and uses the same `QA_PROJECT_DIR`
convention, a single tagged all-surface Playwright invocation and the equivalent
credential IDs in `Jenkinsfile`.
