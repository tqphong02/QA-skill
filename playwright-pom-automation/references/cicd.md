# CI/CD — platform-neutral pipelines (Jenkins + GitHub Actions)

> Companion to `SKILL.md`. Read this when the user wants pipelines, CI, Jenkins, GitHub Actions, or scheduled test runs.

## TOC
1. Pick the platform (never assume)
2. Standard stages (both platforms)
3. GitHub Actions specifics
4. Jenkins specifics
5. Secrets management
6. Tagging & filtering in CI
7. k6 as a separate job
8. Common anti-patterns

---

## 1. Pick the platform (never assume)

```
Repo has Jenkinsfile?              → Jenkins
Repo has .github/workflows/?       → GitHub Actions
New project / neither?             → ASK user which platform (offer both)
```

**Always provide BOTH templates** even when you pick one — the user may switch later. Keep pipeline logic identical across both; only syntax differs.

## 2. Standard stages (both platforms — only syntax differs)

| # | Stage | Why |
|---|---|---|
| 1 | **Checkout** | Get code |
| 2 | **Install** (`npm ci`) + **cache** node_modules & browsers | Speed; `npm ci` = reproducible from lockfile |
| 3 | **Lint** (optional) | Fail fast on type/syntax errors |
| 4 | **test:ui + test:api in parallel** | Browser matrix + parallel API → faster feedback |
| 5 | **Publish Allure** | Human-readable report per run |
| 6 | **Archive** trace.zip / screenshots / video on fail | Debug failures without re-running |
| 7 | **k6 load test** — **separate job/stage** | Long-running; must NOT block main pipeline |

Templates: `assets/templates/github-actions-ci.yml` + `assets/templates/Jenkinsfile`.

## 3. GitHub Actions specifics

- **Triggers:** `push` (main), `pull_request`, `workflow_dispatch` (manual), `schedule` (cron for perf).
- **Matrix** for browsers:
  ```yaml
  strategy:
    fail-fast: false
    matrix:
      browser: [chromium, firefox]
  ```
- **Cache** via `actions/setup-node@v4` (`cache: 'npm'`) + Playwright browser cache.
- **Install browsers:** `npx playwright install --with-deps ${{ matrix.browser }}`.
- **Parallelism:** each matrix job runs independently; within a job, Playwright shards (`--shard=${GITHUB_SHARD}`) if needed.
- **Artifacts:** `actions/upload-artifact@v4` with `if: always()` so failures still upload reports/traces.
- **Allure:** use `simple-elf/allure-report-action` or similar to generate + publish GH Pages report.
- **k6:** separate job gated by `if: github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'`, using `grafana/k6-action`.

## 4. Jenkins specifics (Declarative Pipeline)

- **Agent:** `agent any` (or a labeled node with browsers pre-installed).
- **Node tool:** declare under `tools { nodejs 'Node-20' }` (configure NodeJS Installation in Jenkins).
- **Parallel UI + API:**
  ```groovy
  stage('Test') {
    parallel {
      stage('UI')  { steps { sh 'npx playwright test --grep @ui' } }
      stage('API') { steps { sh 'npx playwright test --grep @api' } }
    }
  }
  ```
- **Browser matrix:** replicate via separate `stage`s or a `matrix` directive (Declarative `matrix { axes { ... } }`).
- **`post { always { } }`:** archive artifacts + publish Allure via the **Allure Jenkins plugin** (`allure results: 'allure-results'`) + publish JUnit (`junit 'reports/junit.xml'`).
- **Timeout & build discarder:** keep build history bounded.
- **k6:** separate `Jenkinsfile.perf` triggered by `cron`/TimerTrigger, OR a `when { triggeredBy 'TimerTrigger' }` stage. Never in the main PR pipeline.

## 5. Secrets management

| Secret | GitHub Actions | Jenkins |
|---|---|---|
| BASE_URL | `secrets.BASE_URL` | `credentials('base-url')` |
| API token / user pass | `secrets.TEST_USER`, `secrets.TEST_PASS` | `credentials('test-user')`, `credentials('test-pass')` |
| k6 cloud token | `secrets.K6_CLOUD_TOKEN` | `credentials('k6-cloud-token')` |

**Rules:**
- Never hardcode secrets in pipeline files.
- Never echo secrets in logs (mask via plugin/feature).
- Scope: repo-level for dev, environment/protected for prod-like.
- Inject as env vars → tests read `process.env.*`.

## 6. Tagging & filtering in CI

Same `--grep` command works in both platforms:

```bash
npx playwright test --grep @ui        # UI only
npx playwright test --grep @api       # API only
npx playwright test --grep @perf      # Perf (Tier 1) only
npx playwright test --grep '@ui|@api' # UI + API together
npx playwright test --grep-invert @slow  # exclude slow
```

Map CI stages to tags: GH matrix job / Jenkins `stage` runs one tag group → parallel + clear pass/fail per category.

## 7. k6 as a separate job (do NOT block main pipeline)

**Why separate:** load tests take minutes, need a perf-grade environment, and their failure shouldn't block a code PR.

| Platform | How |
|---|---|
| GitHub Actions | Dedicated job: `if: github.event_name == 'workflow_dispatch' \|\| github.event_name == 'schedule'`, uses `grafana/k6-action` |
| Jenkins | Separate `Jenkinsfile.perf` with `triggers { cron('0 2 * * *') }`, OR `when { triggeredBy 'TimerTrigger' }` stage |

Both: run against **staging/perf env** (not prod), warn stakeholders before scheduled runs, archive k6 summary as artifact.

## 8. Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| k6 stage blocking PR pipeline | Move to separate scheduled/manual job |
| No cache → slow pipelines (re-download browsers every run) | Cache node_modules + `~/.cache/ms-playwright` |
| `npm install` instead of `npm ci` | `npm ci` for reproducible installs |
| Hardcoded BASE_URL/token | Secrets (GH) / Credentials (Jenkins) |
| Single huge stage doing everything | Split: lint / test:ui / test:api parallel / report / archive |
| Allure report only on success | `if: always()` / `post { always {} }` so failures still get reports |
| No browser matrix (only chromium) | Matrix `chromium, firefox` (webkit too if Safari support needed) |
| Traces not archived | Upload `test-results/` artifact on failure |
| Assuming platform without checking | Detect Jenkinsfile vs .github/workflows/; ask if new |
