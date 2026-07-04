---
name: playwright-pom-automation
description: Use when scaffolding a new Playwright + Page Object Model project, writing UI/API/performance tests, or setting up CI for a QA project. Not for ad-hoc exploratory clicks or production app debugging.
---

# Playwright POM Automation

**Core principle:** Mọi selector phải đi qua Page Object — không viết `page.locator()` trực tiếp trong spec.

Bao gồm 4 loại test: **UI · API · Performance · CI/CD**. **Project-agnostic**: KHÔNG hardcode domain/URL/business logic.

> **Khi nào dùng**: Khi user muốn automate web/API test hoặc setup test pipeline.
> **KHÁC** `qa-run` (live AI-driven exploratory) và `testcase-template` (document test case): skill này = **deterministic test-as-code chạy trong CI**.
> **API key**: dùng chung từ `../config/api_keys.json` (xem scripts/ai_provider.py).

## The trap this skill exists to prevent

**Flat selector soup** — tests with no POM layer, raw `page.locator()` chains scattered across spec files, leading to brittle suites that break on every UI redesign. Centralize selectors in `selectors/` repo, route through Page Object classes, spec files import from there.

## Process

### 1. Quick start
Đọc **Decision tree** dưới → chọn đúng reference → copy template → adapt.

### 2. Decision tree

| User muốn | Đọc reference | Copy template |
|---|---|---|
| UI test, page object, locator, click/fill flow | `references/ui-testing.md` | `pages/base.page.ts`, `pages/example.page.ts`, `tests/ui/example.ui.spec.ts` |
| API test, HTTP request, auth/token, schema | `references/api-testing.md` | `fixtures/api-client.ts`, `tests/api/example.api.spec.ts` |
| Functional/E2E, business flow spanning UI+API | `references/ui-testing.md` + `references/api-testing.md` | `tests/functional/example.functional.spec.ts` |
| Perf/load/timing/SLA | `references/performance-testing.md` | `tests/performance/k6-load-test.js` (Tier 2) |
| Selector repo, locator centralized | (dưới) → `selectors/login.selectors.ts`, `selectors/index.ts` | - |
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
├── fixtures/          # Auth, test data, API request context
├── utils/             # Config, generators, allure helpers
├── reports/           # html/, allure-results/, allure-report/
├── playwright.config.ts
└── package.json       # scripts: test:ui / test:api / test:functional / lint
```

**Khi nào dùng folder nào**:
- `tests/ui/` - 1 page/component, 1 intent, fast, browser-driven
- `tests/api/` - 1 endpoint, request-level, không browser
- `tests/functional/` - full business flow spanning multiple steps
- `tests/performance/` - Tier 1 Playwright + Tier 2 k6

### 4. Define selector strategy (centralized repo)
**MỌI locator nên sống trong `selectors/`** - single source of truth. Khi UI đổi, update 1 chỗ; page objects + specs auto pick-up.

```
selectors/
├── login.selectors.ts
├── dashboard.selectors.ts
├── ...
└── index.ts           # barrel export
```

Mỗi `<feature>.selectors.ts` exports:
1. **Raw selector strings** - `id`, `xpath`, `css` (user yêu cầu cụ thể)
2. **Locator factory** - `getByRole/getByLabel/getByTestId` (ưu tiên)

**Strategy priority** (bền vững nhất → dễ vỡ nhất):
1. `getByRole` / `getByLabel` / `getByTestId` (⭐⭐⭐⭐⭐) - LUÔN ƯU TIÊN 1
2. `id` (`#email`) - ⭐⭐⭐⭐
3. `xpath` - ⭐⭐
4. `css class` (`.btn-primary`) - ⭐ - TRÁNH, class thường auto-generated

**Pattern tốt cho Page Object** (tự-heal khi UI đổi):
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

### 5. Build Page Object classes (POM conventions)
| Convention | Chi tiết |
|---|---|
| 1 class = 1 page | File `login.page.ts` → class `LoginPage` |
| Locators ở `selectors/` | Page objects import từ `../selectors`. KHÔNG hardcode locator trong page |
| Action methods KHÔNG `expect()` | Page object = click/fill/read + return. **Assertions ở spec file**. |
| `BasePage` | Shared helpers: `waitForLoad`, navigation, `waitForResponse`, text extraction |
| `data-testid` | Đặt tên `<component>-<element>`, thống nhất với FE team |

### 6. Add API layer (API testing conventions)
- Default dùng Playwright `request` fixture (`APIRequestContext`).
- Validate response schema với `zod` (ưu tiên) — fail fast on contract drift
- Auth/token fixture reusable: login once in `beforeAll`, share `token` / storage state
- CRUD lifecycle: create → use → **delete in `afterAll`** (no test data pollution)

### 7. Add performance harness (optional — 2 tiers)
| Tier | Khi nào | Tool |
|---|---|---|
| 1 (Playwright) | Smoke perf gate, 1 user, trong main suite | Playwright native (`page.timing`, `performance`) |
| 2 (k6) | Cần >1 user, p95/p99 SLA, chạy riêng | k6 |

**Escalation Tier 1 → 2 khi**: cần >1 concurrent user, p95/p99 threshold formal, standalone CI job.
Xem `references/performance-testing.md` để biết template + escalation matrix.

### 8. Wire up Allure + CI (reporting & platform-NEUTRAL CI/CD)

**Reporting — Allure:**
- Annotate với `allure.step()`, `allure.attachment()` trong UI/API/perf tests
- Playwright reporter: `allure-playwright`
- k6 → Allure qua JSON output + converter (hoặc Grafana cho live dashboard)
- Cấu trúc `reports/`: `html/`, `allure-results/`, `allure-report/`

**CI/CD — platform selection:**
| Platform | Khi nào |
|---|---|
| **Jenkins** | `Jenkinsfile` exists trong repo |
| **GitHub Actions** | `.github/workflows/` exists |
| **Mới / chưa có** | Hỏi user chọn platform trước khi gen |

**5 stages chuẩn** (cú pháp khác nhau, logic giống):
1. Checkout code
2. Install (`npm ci`) + cache `node_modules` & Playwright browsers
3. Lint (optional, fail-fast)
4. `test:ui` + `test:api` song song
5. Publish Allure report

**k6**: chạy job/job stage RIÊNG, KHÔNG block main pipeline.

**Secrets** (token, BASE_URL, TEST_USER/PASS):
- GitHub Actions → Repository Secrets (`secrets.*`)
- Jenkins → Credentials (`credentials('id')`)
- **KHÔNG hardcode** trong pipeline file hoặc commit

### 9. Setup (one-time per project)
```bash
npm init -y
npm i -D @playwright/test allure-playwright zod
npx playwright install chromium      # + firefox / webkit nếu cần
# Tier 2: brew install k6 (mac) / xem `references/performance-testing.md` (Linux/Windows)

# Thêm scripts vào package.json
# "test:ui":        "playwright test --grep @ui"
# "test:api":       "playwright test --grep @api"
# "test:functional":"playwright test --grep @functional"
# "allure:gen":     "allure generate reports/allure-results -o reports/allure-report --clean"
# "lint":           "tsc --noEmit && eslint ."
```

### 10. Tagging convention
```typescript
test('login happy path @ui', async ({ page }) => { ... });
test('create user @api', async ({ request }) => { ... });
test('order flow @functional', async ({ page }) => { ... });
```
Filter:
- `npx playwright test --grep @ui`
- `npx playwright test --grep @api`
- `npx playwright test --grep @functional`

### 11. Self-check trước khi trả file
- [ ] **Đã tạo `selectors/` repo** cho mỗi page - KHÔNG hardcode locator
- [ ] Page Object KHÔNG có `expect()` trong action methods
- [ ] CR**U**D test có `afterAll` cleanup (delete created data)
- [ ] `data-testid` đặt tên theo convention `<component>-<element>`
- [ ] CI/CD có 2 platforms: Jenkins + GitHub Actions templates
- [ ] Secrets qua env vars/credentials, KHÔNG hardcode
- [ ] Allure annotations (step, attachment) cho UI/API/perf
- [ ] Tests **sắp theo type order** (nếu có nhiều type)
- [ ] Cover metadata đúng (đặc biệt **C3 = project code**)
- [ ] Dropdown I (Results) + J (Priority) hoạt động
- [ ] Procedure có steps đánh số; Expected cụ thể đo được

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| Spec dùng `page.locator('.btn-primary')` trực tiếp trong spec | Class CSS auto-generated, brittle | Move vào `selectors/`, dùng `getByRole`/`getByTestId` |
| Page Object method có `expect()` bên trong | Action methods phải thuần túy return, assertion ở spec | Tách expect ra spec file |
| Test tạo data nhưng không cleanup | DB pollution, test sau fail vì data cũ | Thêm `afterAll` delete |
| CI/CD hardcode `API_BASE_URL` hoặc credentials trong YAML | Secret leak, không rotate được | Dùng `secrets.*` (GitHub) hoặc `credentials()` (Jenkins) |
| Test chỉ assert `status === 200` | Không verify business rule, chỉ check route có respond | Thêm schema validation (zod), check field quan trọng |
| Tier 1 perf test chạy 50 concurrent user | Playwright không scale được | Escalate lên k6 (Tier 2) |

## Common mistakes

- **Project-agnostic**: code mẫu KHÔNG chứa domain/URL/business logic cụ thể. Mỗi project adapt.

- **Script mới cần test idempotent**: chạy nhiều lần không tạo data rác. Dùng `withRevert()` hoặc cleanup `afterAll`.

- **JSON config** nếu có thay vì hardcode URL/credentials.

- **Tagging convention**: dùng `@ui`, `@api`, `@functional`, `@performance` để filter. Không tag = không filter được = CI chạy tất cả mỗi lần.

- **Allure annotations**: bỏ qua `allure.step()` = report khó debug. Tag mỗi bước có ý nghĩa.

- **API key**: 1 file config chung `../config/api_keys.json` (gitignored), dùng cho cả 3 skill. Xem [README.md](../README.md).

- **Self-check quan trọng**: nhiều khi AI gen xong quên cleanup hook, hardcode secret, hoặc thiếu selector repo. Chạy qua checklist 11 mục trước khi commit.

## References

### Templates (copy từ `assets/templates/`)
- `assets/templates/Jenkinsfile`
- `assets/templates/github-actions-ci.yml`
- `assets/templates/playwright.config.ts`
- `assets/templates/scripts/check-placeholders.sh` — CI guard chống placeholder chưa fill
- `assets/templates/fixtures/api-client.ts`
- `assets/templates/pages/base.page.ts`, `pages/example.page.ts`
- `assets/templates/selectors/index.ts`, `selectors/login.selectors.ts`
- `assets/templates/tests/api/example.api.spec.ts`
- `assets/templates/tests/ui/example.ui.spec.ts`
- `assets/templates/tests/functional/example.functional.spec.ts`
- `assets/templates/tests/performance/k6-load-test.js`

### Reference docs (`references/`)
- [references/ui-testing.md](references/ui-testing.md) — UI test patterns, page object examples
- [references/api-testing.md](references/api-testing.md) — API test với zod schema, auth fixtures
- [references/performance-testing.md](references/performance-testing.md) — Playwright perf + k6, escalation matrix
- [references/cicd.md](references/cicd.md) — Jenkins + GitHub Actions templates, secrets management

### Related skills
- [qa-run](../qa-run/SKILL.md) — live AI-driven exploratory (KHÁC với deterministic test-as-code này)
- [testcase-template](../testcase-template/SKILL.md) — document test case Excel (KHÁC với code automation `.spec.ts`)