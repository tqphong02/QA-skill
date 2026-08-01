---
name: playwright-pom-automation
description: Scaffold or extend Playwright Page Object Model automation for UI, API, component, contract, visual, accessibility, performance and CI quality-gate tests. Trigger on writing Playwright tests/specs, Page Object Model, selectors, automation scaffolding, Allure, flaky-test management, service virtualization, coverage, visual regression, axe, or CI setup; do not require the skill name. Keep selectors out of specs. Not for ad-hoc exploratory clicks, ticket retest execution, or production app debugging; use qa-run for those.
---

# Playwright POM Automation

**Core principle:** All selectors must go through a Page Object — never write `page.locator()` directly in spec files.

Covers **UI · API · component · contract · visual · accessibility · performance · CI/CD**, plus **Data-Driven Testing (DDT)** and parallel-safe test-data isolation. **Project-agnostic**: do NOT hardcode domain/URL/business logic.

> **When to use**: When the user wants to automate web/API tests or set up a test pipeline.
> **Different from** `qa-run` (live AI-driven exploratory) and `testcase-template` (testcase documents): this skill = **deterministic test-as-code running in CI**.
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py).

## Hard gates

1. Resolve the application, environment, test account and requested test type before scaffolding
2. Keep every selector in `selectors/` or a Page Object; never put raw `page.locator()` in a spec
3. Keep assertions in specs, tag each executable test, and isolate data by worker and retry
4. Do not run against production or create external state without an explicit target and cleanup contract
5. Run placeholder, TypeScript and relevant test checks before handing the suite to CI

## The trap this skill exists to prevent

**Flat selector soup** — tests with no POM layer, raw `page.locator()` chains scattered across spec files, leading to brittle suites that break on every UI redesign. Centralize selectors in `selectors/` repo, route through Page Object classes, spec files import from there.

## Process

### 1. Quick start
Read the **Decision tree** below → pick the right reference → copy the template → adapt.

### 2. Decision tree

| What the user wants | Read reference | Copy template |
|---|---|---|
| UI test, page object, locator, click/fill flow | `references/ui-testing.md` | `pages/base.page.ts`, `pages/example.page.ts`, `tests/ui/example.ui.spec.ts` |
| API test, HTTP request, auth/token, schema | `references/api-testing.md` | `fixtures/api-client.ts`, `tests/api/example.api.spec.ts` |
| Functional/E2E, business flow spanning UI+API | `references/ui-testing.md` + `references/api-testing.md` | `tests/functional/example.functional.spec.ts` |
| Data-driven/parameterized test, dataset, parallel data isolation | `references/data-driven-testing.md` | `fixtures/data-driven.ts`, `test-data/cases/login.cases.ts`, `tests/ui/example.data-driven.ui.spec.ts` |
| Perf/load/timing/SLA | `references/performance-testing.md` | `tests/performance/k6-load-test.js` (Tier 2) |
| Selector repo, centralized locators | (below) → `selectors/login.selectors.ts`, `selectors/index.ts` | - |
| Pipeline, CI/CD, Jenkins, GitHub Actions, schedule | `references/cicd.md` | `github-actions-ci.yml`, `Jenkinsfile`, `playwright.config.ts` |

### 3. Standard project structure (POM, separated folders)
```
project-root/
├── tests/
│   ├── ui/            # *.ui.spec.ts        — per-page/component browser tests
│   ├── api/           # *.api.spec.ts       — request-level API tests
│   ├── functional/    # *.functional.spec.ts— E2E business flows
│   └── performance/   # *.perf.spec.ts (Tier 1) + k6/*.js (Tier 2)
├── pages/             # Page Object classes (POM) — one class per page
├── selectors/         # Centralized selector repo (NEW) ← single source of truth
├── fixtures/          # Auth, isolated runtime data, API request context
├── test-data/         # Versioned typed datasets/cases (read-only inputs)
├── testdata/          # Runtime-generated data (gitignored)
├── utils/             # Config, generators, allure helpers
├── reports/           # html/, allure-results/, allure-report/
├── playwright.config.ts
└── package.json       # scripts: test:ui / test:api / test:functional / lint
```

**When to use which folder**:
- `tests/ui/` - one page/component, one intent, fast, browser-driven
- `tests/api/` - one endpoint, request-level, no browser
- `tests/functional/` - full business flow spanning multiple steps
- `tests/performance/` - Tier 1 Playwright + Tier 2 k6

### 4. Define selector strategy (centralized repo)
**ALL locators must live in `selectors/`** — single source of truth. When UI changes, update one place; page objects and specs pick up automatically.

```
selectors/
├── login.selectors.ts
├── dashboard.selectors.ts
├── ...
└── index.ts           # barrel export
```

Each `<feature>.selectors.ts` exports:
1. **Raw selector strings** - `id`, `xpath`, `css` (when user specifies explicitly)
2. **Locator factory** - `getByRole/getByLabel/getByTestId` (preferred)

**Strategy priority** (most stable → most brittle):
1. `getByRole` / `getByLabel` / `getByTestId` (⭐⭐⭐⭐⭐) - ALWAYS FIRST PRIORITY
2. `id` (`#email`) - ⭐⭐⭐⭐
3. `xpath` - ⭐⭐
4. `css class` (`.btn-primary`) - ⭐ - AVOID, usually auto-generated

**Pattern for Page Object** (self-healing when UI changes):
```typescript
// pages/base.page.ts
protected heal(primary, fallbacks, description) {
  return primary.or(...fallbacks.map(f => f.describe(`fallback for: ${description}`)));
}

protected get loginBtn() {
  return this.heal(
    this.page.getByRole('button', { name: /login|đăng nhập/i }),
    [
      this.page.getByTestId('login-submit'),
      this.page.locator('#login-btn'),
      this.page.getByText('Đăng nhập', { exact: true }),
    ],
    'login button'
  );
}
```

### 4b. TypeScript `readonly` pattern (mandatory cho mọi POM)

**Mục đích:** Ngăn selector hoặc locator bị gán đè ngoài ý muốn — tương đương `private final` + `static final` trong Java/TestNG.

| Vị trí | Pattern TypeScript | Tương đương Java |
|---|---|---|
| Raw selector string | `export const sel = { id: '#btn' } as const` | `public static final String BTN = "#btn"` |
| Locator object trong POM | `private readonly locs: LoginLocators` | `private final LoginLocators locs` |
| Expose locator ra spec | `get submitButton(): Locator { return this.locs.submitButton; }` | `public WebElement getSubmitButton() { return submitButton; }` |

**Rule bắt buộc:**
- Tất cả selector file dùng `as const` ở object cuối.
- Tất cả Page Object class dùng `private readonly locs` — **KHÔNG** dùng `public locs` hay `protected locs`.
- Expose ra ngoài chỉ qua `getter` — không expose raw field public.
- Spec KHÔNG được import `buildLoginLocators` trực tiếp — phải qua Page Object.

### 4c. Annotations kiểu TestNG (mapping sang Playwright + Allure)

| TestNG Java | Playwright TypeScript | Mục đích |
|---|---|---|
| `@Test(groups="smoke")` | `test('name @smoke', ...)` + `--grep @smoke` | Group/tag để filter CI |
| `@BeforeClass` | `test.beforeAll(async () => {})` | Setup 1 lần cho cả describe block |
| `@AfterClass` | `test.afterAll(async () => {})` | Teardown / cleanup data sau cả block |
| `@BeforeMethod` | `test.beforeEach(async ({ page }) => {})` | Reset state trước mỗi test |
| `@AfterMethod` | `test.afterEach(async ({ page }, info) => {})` | Screenshot on fail, cleanup per-test |
| `@Test(enabled=false)` | `test.skip(() => condition, 'reason')` | Bỏ qua test theo điều kiện |
| `@Severity(CRITICAL)` | `allure.severity('critical')` | Mức độ nghiêm trọng của test |
| `@Feature("Login")` | `allure.feature('Login')` | Nhóm theo chức năng |
| `@Story("Happy path")` | `allure.story('Happy path')` | Sub-feature / user story |
| `@Owner("QA Team")` | `allure.owner('QA Team')` | Người sở hữu test |
| `@Description("...")` | `allure.description('...')` | Mô tả chi tiết |
| `@Step("Click login")` | `await allure.step('Click login', async () => {})` | Bước test hiện trong report |

**Rule bắt buộc:**
- Mọi spec file phải có ít nhất `allure.severity` + `allure.feature` + `allure.story`.
- Mọi test quan trọng phải wrap action chính bằng `allure.step(...)`.
- `afterEach` phải có block chụp screenshot khi test fail (xem template).
- Không dùng `test.only()` trong code commit lên CI (bẫy chỉ chạy 1 test).

### 5. Build Page Object classes (POM conventions)
| Convention | Details |
|---|---|
| 1 class = 1 page | File `login.page.ts` → class `LoginPage` |
| Locators in `selectors/` | Page objects import from `../selectors`. DO NOT hardcode locator in page |
| Action methods NO `expect()` | Page object = click/fill/read + return. **Assertions in spec file**. |
| `BasePage` | Shared helpers: `waitForLoad`, navigation, `waitForResponse`, text extraction |
| `data-testid` | Name as `<component>-<element>`, consistent with FE team |

### 6. Add API layer (API testing conventions)
- Default to using Playwright `request` fixture (`APIRequestContext`).
- Validate response schema with `zod` (priority) — fail fast on contract drift
- Auth/token fixture reusable: worker-scoped token/storage state, with a standalone request context and optional per-slot account pool
- CRUD lifecycle: create → use → delete in the same test's `finally`/fixture teardown. Use `afterAll` only for a serial, worker-owned lifecycle

### 7. Add Data-Driven Testing + parallel isolation

Separate two kinds of data:

1. **Case data** — versioned, typed, read-only rows under `test-data/cases/`
2. **Runtime data** — unique entities created by `fixtures/data-driven.ts`

Generate one Playwright test per case at collection time with a synchronous `for...of`. Every case must have a unique stable ID in the test title. Never let two parallel tests mutate the same account, record, cart, tenant, filename, or JSON store.

The runtime namespace must include:

```text
<runId>-<project>-p<parallelIndex>-w<workerIndex>-t<testIdHash>-r<retry>-e<repeatEachIndex>
```

Rules:
- Use the test-scoped `testData` fixture for unique email/string/resource keys
- Use `TEST_ACCOUNTS_JSON` to allocate a different account per parallel slot when scenarios mutate account-owned state
- Do not cycle/reuse an undersized account pool; fail with a clear configuration error
- Store runtime JSON in a namespace-specific file; never use one shared read-modify-write JSON file across workers
- Cleanup per test in fixture teardown/`afterEach`; use `afterAll` only for resources owned exclusively by that worker
- A browser context is isolated, but backend data is not; fresh contexts alone do not prevent conflicts
- Retries must create a new retry-scoped identity and cleanup only resources created by that attempt

See `references/data-driven-testing.md` for the full pattern and templates.

### 8. Add performance harness (optional — 2 tiers)
| Tier | When | Tool |
|---|---|---|
| 1 (Playwright) | Smoke perf gate, 1 user, in main suite | Playwright native (`page.timing`, `performance`) |
| 2 (k6) | Need >1 user, p95/p99 SLA, run separately | k6 |

**Escalate Tier 1 → 2 when**: >1 concurrent user needed, formal p95/p99 threshold, standalone CI job.
See `references/performance-testing.md` for template + escalation matrix.

### 9. Wire up Allure + CI (reporting & platform-NEUTRAL CI/CD)

**Reporting — Allure:**
- Annotate with `allure.step()`, `allure.attachment()` in UI/API/perf tests
- Playwright reporter: `allure-playwright`
- k6 -> Allure via JSON output + converter (or Grafana for live dashboard)
- `reports/` structure: `html/`, `allure-results/`, `allure-report/`

**CI/CD — platform selection:**
| Platform | When |
|---|---|
| **Jenkins** | `Jenkinsfile` exists in the repo |
| **GitHub Actions** | `.github/workflows/` exists |
| **New / none** | Ask user to choose platform before generating |

**5 standard stages** (different syntax, same logic):
1. Checkout code
2. Install (`npm ci`) + cache `node_modules` & Playwright browsers
3. Lint (optional, fail-fast)
4. `test:ui` + `test:api` in parallel
5. Publish Allure report

**k6**: run standalone job/stage, DO NOT block main pipeline.

### 9b. Enforce automation quality gates

Read [references/AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md) and [references/FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) before finalizing CI. Copy `assets/templates/quality-gates.json` and `assets/templates/scripts/quality-gate.mjs` into the automation project

The blocking lane must check compile/lint, placeholders/secrets, failed tests, retry-derived flaky tests, evidence completeness, duration budget, declared coverage and the supported browser matrix. Preserve first-attempt and retry artifacts. A retry must never silently convert a failure to PASS

Use component or service-level tests for deterministic rules, contract/API tests for boundaries, and a small UI suite for critical journeys. Use mocks/service virtualization only with at least one approved real-dependency check

**Secrets** (token, BASE_URL, TEST_USER/PASS):
- GitHub Actions → Repository Secrets (`secrets.*`)
- Jenkins → Credentials (`credentials('id')`)
- **DO NOT hardcode** in pipeline file or commit

### 10. Setup (one-time per project)
```bash
npm init -y
npm i -D @playwright/test allure-playwright zod
npx playwright install chromium      # + firefox / webkit if needed
# Tier 2: brew install k6 (mac) / see `references/performance-testing.md` (Linux/Windows)

# Add scripts to package.json
# "test:ui":        "playwright test --grep @ui"
# "test:api":       "playwright test --grep @api"
# "test:functional":"playwright test --grep @functional"
# "allure:gen":     "allure generate reports/allure-results -o reports/allure-report --clean"
# "lint":           "tsc --noEmit && eslint ."
```

### 11. Tagging convention
```typescript
test('login happy path @ui', async ({ page }) => { ... });
test('create user @api', async ({ request }) => { ... });
test('order flow @functional', async ({ page }) => { ... });
```
Filter:
- `npx playwright test --grep @ui`
- `npx playwright test --grep @api`
- `npx playwright test --grep @functional`

### 12. Self-check before delivering
- [ ] **`selectors/` repo created** for every page — NO hardcoded locators
- [ ] Page Object has NO `expect()` in action methods
- [ ] CRUD tests clean exact created IDs in `finally`/fixture teardown; `afterAll` is limited to worker-owned serial lifecycles
- [ ] DDT rows are typed, read-only, have unique stable IDs, and generate one test per row
- [ ] Mutating parallel tests use `testData` namespace or a non-shared account from `TEST_ACCOUNTS_JSON`
- [ ] Runtime stores/files are isolated by worker/test; no shared JSON read-modify-write
- [ ] Retry/repeat data keys include `retry` and `repeatEachIndex`
- [ ] `data-testid` named by convention `<component>-<element>`
- [ ] CI/CD has 2 platform templates: Jenkins + GitHub Actions
- [ ] Secrets via env vars/credentials, NOT hardcoded
- [ ] Allure annotations (step, attachment) for UI/API/perf
- [ ] `quality-gates.json` copied and quality-gate result is archived
- [ ] Retry-derived flaky tests are classified, owned and not silently passed
- [ ] Component/contract/service-virtualization level is selected for each major risk
- [ ] Visual baseline and axe accessibility checks are tied to browser, viewport, locale and commit
- [ ] First-attempt and retry artifacts are preserved for every flaky result
- [ ] Tests **sorted by type order** (if multiple types)
- [ ] Cover metadata correct (especially **C3 = project code**)
- [ ] Dropdown I (Results) + J (Priority) working
- [ ] Procedure has numbered steps; Expected is specific and measurable

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| Spec uses `page.locator('.btn-primary')` directly in spec | CSS class auto-generated, brittle | Move to `selectors/`, use `getByRole`/`getByTestId` |
| Page Object method has `expect()` inside | Action methods must be purely return, assertions in spec | Extract expect to spec file |
| Test creates data but no cleanup | DB pollution, subsequent tests fail due to old data | Delete exact owned IDs in `finally`/fixture teardown |
| DDT loop reuses one mutable payload object | Rows/workers overwrite each other | Keep case rows `readonly`; build a fresh runtime payload inside each test |
| Parallel tests reuse one account/record/cart | Backend state conflicts although browser contexts are fresh | Allocate per-worker accounts or create per-test resources with `testData` |
| Workers write the same JSON file | Lost updates/corrupt JSON from read-modify-write races | Include the data namespace in the filename; never share mutable runtime files |
| Fixture says “per worker” but has no `{ scope: 'worker' }` | Fixture actually runs per test | Declare a worker fixture and avoid test-scoped dependencies |
| CI/CD hardcodes `API_BASE_URL` or credentials in YAML | Secret leak, cannot be rotated | Use `secrets.*` (GitHub) or `credentials()` (Jenkins) |
| Test only asserts `status === 200` | Does not verify business rule, only checks if route responds | Add schema validation (zod), check critical fields |
| Tier 1 perf test runs 50 concurrent users | Playwright cannot scale | Escalate to k6 (Tier 2) |

## Common mistakes

- **Project-agnostic**: sample code must NOT contain specific domain/URL/business logic. Each project adapts.

- **New scripts must be idempotent**: running multiple times must not create stale data. Use `withRevert()`, fixture teardown, or exact-ID cleanup in `finally`.

- **JSON config** where possible instead of hardcoding URL/credentials.

- **Tagging convention**: use `@ui`, `@api`, `@functional`, `@performance` to filter. No tag = no filter = CI runs everything every time.

- **Allure annotations**: skipping `allure.step()` = report hard to debug. Tag every meaningful step.

- **API key**: one shared config file `../config/api_keys.json` (gitignored), used by all 3 skills. See [README.md](../README.md).

- **Self-check is critical**: AI often forgets cleanup hooks, hardcodes secrets, or omits the selector repo. Run through the full checklist before committing.

## References

### Templates (copy from `assets/templates/`)
- `assets/templates/Jenkinsfile`
- `assets/templates/github-actions-ci.yml`
- `assets/templates/playwright.config.ts`
- `assets/templates/scripts/check-placeholders.sh` — CI guard preventing unfilled placeholders
- `assets/templates/fixtures/api-client.ts`
- `assets/templates/fixtures/data-driven.ts`
- `assets/templates/test-data/cases/login.cases.ts`
- `assets/templates/pages/base.page.ts`, `pages/example.page.ts`
- `assets/templates/selectors/index.ts`, `selectors/login.selectors.ts`
- `assets/templates/tests/api/example.api.spec.ts`
- `assets/templates/tests/ui/example.ui.spec.ts`
- `assets/templates/tests/ui/example.data-driven.ui.spec.ts`
- `assets/templates/tests/functional/example.functional.spec.ts`
- `assets/templates/tests/performance/k6-load-test.js`

### Reference docs (`references/`)
- [references/ui-testing.md](references/ui-testing.md) — UI test patterns, page object examples
- [references/api-testing.md](references/api-testing.md) — API tests with zod schema, auth fixtures
- [references/data-driven-testing.md](references/data-driven-testing.md) — typed datasets, worker/test namespaces, account pools, cleanup
- [references/performance-testing.md](references/performance-testing.md) — Playwright perf + k6, escalation matrix
- [references/cicd.md](references/cicd.md) — Jenkins + GitHub Actions templates, secrets management

### Related skills
- [qa-run](../qa-run/SKILL.md) — live AI-driven exploratory (DIFFERENT from this deterministic test-as-code)
- [testcase-template](../testcase-template/SKILL.md) — document test case Excel (KHÁC với code automation `.spec.ts`)
