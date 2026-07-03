---
name: playwright-pom-automation
description: Scaffold & write Playwright + TypeScript test automation using Page Object Model (POM), covering UI testing, API testing, performance testing (Playwright native + k6), and CI/CD pipelines (Jenkins + GitHub Actions). Use this skill whenever the user wants to automate web/API tests or set up a test pipeline — EVEN IF they never type the word "Playwright". Trigger phrases include (EN + VI): "viết test cho trang login", "test API tạo user", "viết UI test", "API automation", "kiểm tra tốc độ load trang chủ", "load test", "setup Jenkins chạy test tự động", "tạo test case", "CI/CD pipeline cho test", "Page Object", "POM", "k6", "Jenkinsfile", "GitHub Actions workflow", "Allure report", "test scaffolding", "regression suite". Use for DETERMINISTIC, repeatable test-as-code that runs in CI — distinct from live AI-driven exploratory QA.
---

# playwright-pom-automation

Generic skill for **deterministic test automation**: Playwright + TypeScript + **Page Object Model (POM)**. Four pillars — **UI · API · Performance · CI/CD**. Project-agnostic: no hardcoded domains, URLs, or business logic.

> **Use this vs `qa-run`:**
> - **This skill** = write/scaffold **test suites as checked-in code** (regression, CI gates, repeatable). Output: `.spec.ts` files, page objects, pipeline files.
> - **`qa-run`** = **AI-driven live exploratory/ad-hoc** bug hunting via MCP Playwright (interactive, no test code).
> Same tool (Playwright), different mode. Often used together: explore with `qa-run` → promote stable scenarios into regression here.

---

## Decision tree — read the right reference FIRST

| User wants | Read this | Copy template |
|---|---|---|
| UI test, page object, locator, click/fill flow | `references/ui-testing.md` | `pages/base.page.ts`, `pages/example.page.ts`, `tests/ui/example.ui.spec.ts` |
| API test, HTTP request, auth/token, schema | `references/api-testing.md` | `fixtures/api-client.ts`, `tests/api/example.api.spec.ts` |
| Functional/E2E, business flow spanning UI+API | `references/ui-testing.md` + `api-testing.md` | `tests/functional/example.functional.spec.ts` |
| Perf/load/timing/SLA, k6, response time | `references/performance-testing.md` | `tests/performance/k6-load-test.js` (Tier 2) |
| Selector repo, locator centralized | (below — Selectors convention) | `selectors/login.selectors.ts`, `selectors/index.ts` |
| Pipeline, CI/CD, Jenkins, GitHub Actions, schedule | `references/cicd.md` | `github-actions-ci.yml`, `Jenkinsfile`, `playwright.config.ts` |

**Default flow:** (1) classify the request via the tree → (2) read the matching reference → (3) copy the template(s) from the matching folder → (4) adapt names/values to the project (never hardcode project domain).

---

## Standard project structure (generic, POM, separated folders)

```
project-root/
├── tests/
│   ├── ui/            # *.ui.spec.ts        — per-page/component browser tests
│   ├── api/           # *.api.spec.ts       — request-level API tests
│   ├── functional/    # *.functional.spec.ts— E2E business flows (UI+API span)
│   └── performance/   # *.perf.spec.ts (Tier 1 Playwright) + k6/*.js (Tier 2)
├── pages/             # Page Object classes (POM) — one class per page/component
├── selectors/         # Centralized selector repo (id, xpath, css, role strategies) ← NEW
├── fixtures/          # Auth, test data, API request context (ApiClient)
├── utils/             # Config, generators, allure helpers
├── reports/
│   ├── html/          # Playwright HTML report
│   ├── allure-results/# Allure raw results (CI consumes this)
│   └── allure-report/ # Allure generated HTML (CI publishes this)
├── playwright.config.ts
└── package.json       # scripts: test:ui / test:api / test:functional / test:perf / lint
```

**Test folder split — when to use which:**
- `tests/ui/` — single page/component, one intent, fast, browser-driven. Assert DOM directly.
- `tests/api/` — single endpoint, request-level (no browser), schema validation.
- `tests/functional/` — **full business flow** spanning multiple steps/pages and often both UI + API (e.g. login → create order via UI → verify via API). Slower; reserve for critical paths.
- `tests/performance/` — Tier 1 Playwright perf (`*.perf.spec.ts`) + Tier 2 k6 (`k6/*.js`).

> When the project already has a structure, **follow it** instead of imposing this. Only scaffold fresh layout for new projects.

---

## Selectors convention (centralized repo) — NEW

All locators live in **`selectors/`** — single source of truth. When UI changes, update selectors in ONE place; page objects + specs auto-pick-up.

```
selectors/
├── login.selectors.ts     # one file per page/feature
├── dashboard.selectors.ts
├── ...
└── index.ts               # barrel export
```

**Each `<feature>.selectors.ts` exports:**
1. **Raw selector strings** — `id`, `xpath`, `css` (what user asked for): used via `page.locator(SELECTOR)`.
2. **Locator factory** — preferred Playwright APIs (`getByRole`/`getByLabel`/`getByTestId`), more resilient than id/xpath.

**Strategy priority (top = most resilient):**
1. `getByRole` / `getByLabel` / `getByTestId` — **preferred**
2. `id` (`#email`) — stable if frontend sets it
3. `xpath` (`//label[contains(.,"X")]/input`) — only for complex structure, use sparingly
4. `css class` (`.btn-primary`) — **avoid**, auto-generated classes break often

**Page objects import from `selectors/`** — they do NOT hardcode locators:
```typescript
import { buildLoginLocators } from '../selectors';
// in constructor: this.locs = buildLoginLocators(page);
```
This keeps selector maintenance out of page logic. See `assets/templates/selectors/login.selectors.ts` + `pages/example.page.ts`.

---

## POM conventions (UI)

1. **One class = one page/component.** File `login.page.ts` → class `LoginPage`.
2. **Locators centralized in `selectors/`** (preferred) — page imports from there. Locators exposed as readonly properties / getters.
3. **Prefer `getByRole` / `getByLabel` / `getByTestId`** over raw CSS — survives styling churn. Use `id`/`xpath` from `selectors/` only when role-based isn't available.
4. **Action methods do NOT `expect()`.** Page object = click/fill/read + return data. **Assertions live in the spec file.**
5. **`BasePage`** holds shared helpers: `waitForLoad`, navigation, `waitForResponse`, text extraction. All pages `extends BasePage`.
6. **`data-testid` convention** for elements without stable text/role — agree with frontend team on naming (`<component>-<element>`).

Details + anti-patterns: `references/ui-testing.md`.

---

## POM conventions (UI)

1. **One class = one page/component.** File `login.page.ts` → class `LoginPage`.
2. **Locators are `readonly` properties.** Prefer `getByRole` / `getByLabel` / `getByTestId` over raw CSS — survives styling churn.
3. **Action methods do NOT `expect()`.** Page object = click/fill/read + return data. **Assertions live in the spec file.** This keeps pages reusable and tests readable.
4. **`BasePage`** holds shared helpers: `waitForLoad`, navigation, `waitForResponse`, text extraction. All pages `extends BasePage`.
5. **`data-testid` convention** for elements without stable text/role — agree with frontend team on naming (`<component>-<element>`).

Details + anti-patterns: `references/ui-testing.md`.

---

## API testing conventions

1. **Default to Playwright `request` fixture** (`APIRequestContext`). Use `axios`/`got` **only if the project already depends on it** — don't introduce a second HTTP client.
2. **Validate response schema** with `zod` (preferred) — fail fast on contract drift. Schema per endpoint, kept next to the test.
3. **Auth/token fixture reusable** across tests: login once in `beforeAll`, share `token` / storage state. Never re-login per test.
4. **CRUD lifecycle**: create → use → **delete in `afterAll`** (no test data pollution).

Details: `references/api-testing.md`.

---

## Performance testing — TWO tiers (choose deliberately)

### Tier 1 — Playwright native (quick, per-page, inside functional suite)
- `context.tracing.start/stop` → capture trace for slow interactions.
- `page.evaluate(() => performance.getEntriesByType('navigation'))` → DNS/TTFB/DOM timings.
- `page.on('response', r => ...)` → response time per request.
- **Use when:** smoke-level perf gate, single user, want it inside the main `npx playwright test` run.

### Tier 2 — k6 (load/stress, many VUs, SLA thresholds)
- **Escalate from Tier 1 → Tier 2 when ANY of:**
  - Need **>1 concurrent user** (concurrency / bottleneck hunting).
  - Need **p95/p99 thresholds** (formal SLA).
  - Need a **standalone run outside** the main CI test suite (long-running, scheduled).
- Template: `assets/templates/k6-load-test.js` (stages + thresholds + checks).

Details + escalation matrix: `references/performance-testing.md`.

---

## Reporting — Allure across all 3 test types

- Annotate with `allure.step()`, `allure.attachment()` in UI/API/perf tests.
- Playwright reporter: `allure-playwright` (add to `reporter` in `playwright.config.ts`).
- k6 → Allure via `k6`'s JSON output + converter (or Grafana for live dashboards).
- CI publishes the report (see `cicd.md`).

---

## CI/CD — platform-NEUTRAL (Jenkins AND GitHub Actions)

### How to pick platform (don't assume)
- `Jenkinsfile` exists in repo → **Jenkins**.
- `.github/workflows/` exists → **GitHub Actions**.
- **New project / neither exists → ASK the user** which platform before generating. Offer both if unsure.

### Standard stages (both platforms — only syntax differs)
1. **Checkout** code.
2. **Install** (`npm ci`) + **cache** `node_modules` & Playwright browsers.
3. **Lint** (optional, fail-fast).
4. **`test:ui` + `test:api` in parallel** — GitHub Actions: matrix `chromium`/`firefox`; Jenkins: `parallel { }`.
5. **Publish Allure** report (GH: upload-artifact + Allure action; Jenkins: Allure plugin).
6. **Archive** `trace.zip` / screenshots / videos on fail.
7. **k6 load test in a SEPARATE job/stage** — **never blocks** the main pipeline; runs on `schedule` or manual trigger.

### Secrets (token, BASE_URL, TEST_USER/PASS)
- GitHub Actions → **Repository Secrets** (`secrets.*`).
- Jenkins → **Credentials** (`credentials('id')`).
- **Never hardcode** in pipeline file or commit.

Templates: `assets/templates/github-actions-ci.yml` + `assets/templates/Jenkinsfile`. Full breakdown: `references/cicd.md`.

---

## Tagging convention

- Tag tests in title: `@ui` / `@api` / `@functional` / `@perf`.
  - `test('login happy path @ui', ...)`
  - `test('create user @api', ...)`
  - `test('order flow @functional', ...)`
  - `test('homepage timing @perf', ...)`
- Filter at run/CI with `--grep`:
  - UI only: `npx playwright test --grep @ui`
  - API only: `--grep @api`
  - Functional only: `--grep @functional`
  - Perf only: `--grep @perf`
- Works identically in both pipelines → same command in GH Actions matrix and Jenkins `parallel` stages.

---

## Setup (one-time per project)

```bash
npm init -y
npm i -D @playwright/test allure-playwright zod
npx playwright install chromium              # + firefox / webkit as needed
# For Tier 2: brew install k6 (mac) / see k6 docs for Linux/Windows
```

Copy templates from `assets/templates/` → adapt to project layout. Define `npm scripts`:
```json
{
  "scripts": {
    "test:ui":        "playwright test --grep @ui",
    "test:api":       "playwright test --grep @api",
    "test:functional":"playwright test --grep @functional",
    "test:perf":      "playwright test --grep @perf",
    "test:k6":        "k6 run tests/performance/k6-load-test.js",
    "allure:gen":     "allure generate reports/allure-results -o reports/allure-report --clean",
    "allure:open":    "allure open reports/allure-report",
    "lint":           "tsc --noEmit && eslint ."
  }
}
```

---

## Self-check — before finishing, mentally run these 4 prompts

1. **"Write a page object for the login page"** → follows POM conventions; uses `BasePage`; `getByRole`/`getByTestId`; action methods no `expect`. ✓
2. **"Write an API test for POST /users with auth"** → uses `APIRequestContext` (not axios); `zod` schema; auth fixture shared; cleanup in `afterAll`. ✓
3. **"Performance check for homepage + k6 script for 50 VUs"** → Tier 1 snippet (perf API + response timing) AND Tier 2 k6 with `stages`/`thresholds`/`checks`. ✓
4. **"Setup Jenkinsfile running UI + API tests, publish Allure"** → Declarative Pipeline, `parallel{}`, `post{always{}}` archive + Allure plugin, k6 in separate stage/`Jenkinsfile.perf`. Equivalent for GitHub Actions provided too. ✓

If any check would produce hardcoded project data → **generalize it** before output.

---

## Notes

- **Generic only** — no project name, domain, or business logic in any output.
- **Web scope only** — no mobile (Appium) coverage.
- **CI/CD neutral** — always provide BOTH Jenkins and GitHub Actions templates; pick by context, ask if new project.
- **Body language: English** (code convention); brief Vietnamese comments allowed for clarity.

---

# Appendix — Merge từ `anhtester/codex-testing-kit`

> Nguồn: repo `anhtester/codex-testing-kit` (Anh Tester, MIT, 7⭐). Mượn concept, viết lại native cho Claude Code + Playwright TS. License gốc giữ nguyên.

## A.1 Locator Strategy + Healer (từ `$generate-locator` + `$smart-locator-agent` + `$locator-healer-agent`)

### Thứ tự ưu tiên locator (BẮT BUỘC)

Khi viết page object, dùng locator theo thứ tự **từ bền vững nhất → dễ vỡ nhất**:

| # | Loại | Ví dụ | Độ bền | Khi nào dùng |
|---|---|---|---|---|
| 1 | `getByRole` | `page.getByRole('button', { name: 'Login' })` | ⭐⭐⭐⭐⭐ | Luôn ưu tiên #1 |
| 2 | `getByLabel` | `page.getByLabel('Email')` | ⭐⭐⭐⭐⭐ | Form input có `<label>` |
| 3 | `getByTestId` | `page.getByTestId('submit-btn')` | ⭐⭐⭐⭐ | Khi FE team set `data-testid` (xin convention) |
| 4 | `getByText` | `page.getByText('Đăng nhập')` | ⭐⭐⭐⭐ | Link/button có text unique |
| 5 | `getByPlaceholder` | `page.getByPlaceholder('Nhập email')` | ⭐⭐⭐ | Input có placeholder |
| 6 | `id` (`#email`) | `page.locator('#email')` | ⭐⭐⭐ | Khi FE set id ổn định |
| 7 | `name` attribute | `page.locator('input[name="email"]')` | ⭐⭐⭐ | Form input |
| 8 | `xpath` | `page.locator('//label[contains(.,"Email")]/input')` | ⭐⭐ | Chỉ khi structure phức tạp, dùng ít |
| 9 | `css class` (`.btn-primary`) | `page.locator('.btn-primary')` | ⭐ | **TRÁNH** — class thường auto-generated |

### Pattern ưu tiên trong Page Object

```typescript
// ✅ TỐT — dùng role + name
this.loginBtn = page.getByRole('button', { name: /đăng nhập|login/i });

// ✅ TỐT — dùng testid nếu có convention
this.emailInput = page.getByTestId('login-email');

// ⚠ CHẤP NHẬN — dùng id khi không có testid
this.passwordInput = page.locator('#password');

// ❌ XẤU — css class
this.submitBtn = page.locator('.btn.btn-primary.submit');

// ❌ XẤU — xpath phức tạp
this.emailInput = page.locator('/html/body/div[2]/form/div[1]/input');
```

### Khi UI đổi → locator fail → AUTO-HEAL pattern

```typescript
// pages/base.page.ts — thêm helper self-heal
import { Page, Locator } from '@playwright/test';

export class BasePage {
  constructor(protected page: Page) {}

  /** Tìm element với fallback chain — thử locator chính trước, fallback khi fail */
  protected heal<T>(
    primary: Locator,
    fallbacks: Locator[],
    description: string
  ): Locator {
    return primary.or(
      ...fallbacks.map(f => f.describe(`fallback for: ${description}`))
    );
  }

  /** Pattern dùng: loginBtn thử role trước, fallback id/text */
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
}
```

### Selector repo (bổ sung từ codex) — pattern khi UI thay đổi nhiều

```typescript
// selectors/login.selectors.ts — single source of truth
export const LOGIN_SELECTORS = {
  emailInput: {
    primary: 'input[type="email"]',
    fallbacks: ['#email', '[data-testid="email"]', 'input[name="email"]'],
    getByRole: { role: 'textbox', name: /email/i },
  },
  passwordInput: {
    primary: 'input[type="password"]',
    fallbacks: ['#password', '[data-testid="password"]'],
  },
  submitBtn: {
    primary: 'button[type="submit"]',
    fallbacks: ['#login-submit', 'button:has-text("Login")'],
    getByRole: { role: 'button', name: /login|đăng nhập/i },
  },
};

// pages/login.page.ts
import { LOGIN_SELECTORS } from '../selectors/login.selectors';

export class LoginPage extends BasePage {
  async login(email: string, password: string) {
    const sel = LOGIN_SELECTORS.emailInput;
    await this.page.locator(sel.primary)
      .or(this.page.locator(sel.fallbacks.join(',')))
      .fill(email);
    // ... rest
  }
}
```

→ Khi UI đổi class/id → sửa 1 chỗ ở `selectors/`, page object tự pick up.

## A.2 UI Flow Generator (từ `$generate-automation-from-ui-flow`)

### Vấn đề giải quyết
Codex skill này: AI lái UI thật qua browser → record các bước → trích locators từ DOM → sinh page object skeleton + spec file. **Dùng khi page chưa có page object** (greenfield) hoặc khi muốn **mở rộng coverage** mà không biết bắt đầu từ đâu.

### Workflow (4 bước)

**Bước 1 — Khai báo flow + chạy mẫu**
User nói: *"Generate automation cho flow login → dashboard → tạo order"*. AI:
1. Hỏi (nếu thiếu): URL base, auth, scope (1 flow hay full app).
2. Mở browser, navigate, thực hiện đúng flow 1 lần để hiểu DOM.

**Bước 2 — Trích locators từ DOM thật**
```typescript
// scripts/extract-locators.ts — chạy 1 lần, output JSON
import { chromium } from '@playwright/test';
import fs from 'node:fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(process.env.BASE_URL!);

  // Click qua flow, mỗi trang extract
  const loginForm = await page.locator('form').first().evaluate((form) => {
    const inputs = Array.from(form.querySelectorAll('input, button, select, textarea'));
    return inputs.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.getAttribute('id'),
      testId: el.getAttribute('data-testid'),
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      text: el.textContent?.trim().slice(0, 50),
    }));
  });
  fs.writeFileSync('selectors/login.json', JSON.stringify(loginForm, null, 2));
  await browser.close();
})();
```

**Bước 3 — Generate page object từ JSON**
```typescript
// scripts/gen-page-from-selectors.ts — đọc selectors/*.json → sinh pages/*.page.ts
import fs from 'node:fs';
import path from 'node:path';

function genPage(className: string, selectorsPath: string) {
  const selectors = JSON.parse(fs.readFileSync(selectorsPath, 'utf-8'));
  const props = selectors
    .filter(s => s.name || s.testId || s.id)
    .map(s => {
      const name = camelCase(s.name || s.testId || s.id);
      const locator = s.testId
        ? `getByTestId('${s.testId}')`
        : s.id
        ? `locator('#${s.id}')`
        : s.ariaLabel
        ? `getByLabel('${s.ariaLabel}')`
        : s.name
        ? `locator('[name="${s.name}"]')`
        : `getByText('${s.text}')`;
      return `  readonly ${name} = this.page.${locator};`;
    })
    .join('\n');

  return `import { BasePage } from './base.page';
import { Page } from '@playwright/test';

export class ${className} extends BasePage {
  constructor(page: Page) { super(page); }
${props}
}
`;
}

// Dùng:
// $ tsx scripts/gen-page-from-selectors.ts login 'selectors/login.json' > pages/login.page.ts
```

**Bước 4 — Generate spec mẫu (happy path)**
```typescript
// AI đọc page object vừa tạo → sinh spec happy path
// tests/ui/login.ui.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';

test('user can login with valid credentials', async ({ page }) => {
  const login = new LoginPage(page);
  await page.goto('/login');
  await login.email.fill(process.env.TEST_USER!);
  await login.password.fill(process.env.TEST_PASS!);
  await login.submit.click();
  await expect(page).toHaveURL(/dashboard/);
});
```

### Khi nào dùng UI Flow Generator
- ✅ Page mới chưa có page object (greenfield module)
- ✅ Muốn nhanh có baseline spec (happy path) trước, refine sau
- ❌ KHÔNG dùng cho page đã có page object (sửa tay sẽ tốt hơn)
- ❌ KHÔNG dùng cho flow phức tạp > 10 bước (tách nhỏ trước)

## A.3 API Test Generator (từ `$generate-api-tests-from-swagger`)

### Vấn đề giải quyết
Có OpenAPI/Swagger spec (`.yaml`/`.json`) → sinh test files (request, schema validation, status code) mà không phải gõ tay cho từng endpoint.

### Setup
```bash
npm install -D @apidevtools/swagger-parser openapi-types
```

### Pattern sinh test từ spec

```typescript
// scripts/gen-api-tests.ts — chạy 1 lần, output tests/api/*.spec.ts
import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'node:fs';
import path from 'node:path';

(async () => {
  const api = await SwaggerParser.validate('./openapi.yaml');
  const paths = api.paths;

  for (const [route, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods as any)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;

      const opId = (op as any).operationId || `${method}_${route.replace(/\W/g, '_')}`;
      const tags = (op as any).tags?.[0] || 'default';
      const responses = (op as any).responses || {};
      const requestBody = (op as any).requestBody;

      const testContent = `import { test, expect } from '@playwright/test';

test.describe('${tags} > ${opId}', () => {
  test('${method.toUpperCase()} ${route} — 200 happy path', async ({ request }) => {
    const res = await request.${method}('\${BASE_URL}${route}', {
      ${requestBody ? `data: ${JSON.stringify(exampleFromSchema(requestBody), null, 8)}` : ''}
    });
    expect(res.status()).toBe(200);
    ${Object.keys(responses).filter(c => c.startsWith('2')).map(c =>
      `expect(res.json()).toMatchSchema(/* schema for ${c} */);`
    ).join('\n    ')}
  });

  test('${method.toUpperCase()} ${route} — 401 unauthorized', async ({ request }) => {
    const res = await request.${method}('\${BASE_URL}${route}');
    expect(res.status()).toBe(401);
  });
});
`;
      const dir = `tests/api/${tags}`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${opId}.spec.ts`), testContent);
    }
  }
  console.log('✓ Generated tests in tests/api/');
})();

function exampleFromSchema(body: any): any {
  // Sinh data mẫu từ JSON Schema (rút gọn, cần refine tay)
  const schema = body?.content?.['application/json']?.schema || {};
  if (schema.example) return schema.example;
  if (schema.properties) {
    const obj: any = {};
    for (const [k, v] of Object.entries(schema.properties as any)) {
      obj[k] = (v as any).example || `<${(v as any).type || 'string'}>`;
    }
    return obj;
  }
  return {};
}
```

### Test pattern bổ sung (cho mỗi endpoint)

```typescript
// tests/api/users/users_list.spec.ts — generated, sau đó refine
import { test, expect } from '@playwright/test';
import { tdata } from '../../utils/tdata'; // xem qa-run Appendix A.1

test('GET /users — 200 + page shape', async ({ request }) => {
  const res = await request.get('/api/v1/users?page=1&limit=10');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    data: expect.any(Array),
    total: expect.any(Number),
    page: 1,
  });
});

test('POST /users — 201 + created user', async ({ request }) => {
  const email = `${tdata('api', 'createUser')}@test.local`;
  const res = await request.post('/api/v1/users', {
    data: { name: 'Test User', email },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.email).toBe(email);
});

test('POST /users — 400 missing email', async ({ request }) => {
  const res = await request.post('/api/v1/users', { data: { name: 'No Email' } });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.errors).toContainEqual(expect.objectContaining({ field: 'email' }));
});

test('POST /users — 401 no auth', async ({ request }) => {
  // Override fixture to no-auth
  const res = await request.post('/api/v1/users', {
    data: { name: 'X', email: 'x@x.com' },
    headers: {}, // no Authorization
  });
  expect(res.status()).toBe(401);
});
```

### Khi nào dùng API Test Generator
- ✅ Project có OpenAPI spec sẵn (Swagger UI, Stoplight, …)
- ✅ Onboarding dự án mới cần smoke test API nhanh
- ✅ Cần test schema validation (response shape)
- ❌ KHÔNG dùng nếu spec outdated / không khớp code (refactor spec trước)
- ❌ KHÔNG thay thế test business logic phức tạp (vẫn viết tay)

---

## API Key (chung cho cả 3 skill)

Skill này dùng API key từ `../config/api_keys.json` (chung trong repo `qa-skill`). 

**3 cách config** (ưu tiên từ cao xuống thấp):
1. **Env var** (override): `ANTHROPIC_API_KEY=sk-ant-...`
2. **Config file**: `cp config/api_keys.example.json config/api_keys.json` rồi paste key
3. **Auto-detect**: Nếu dùng Copilot Pro / Antigravity / Claude Code CLI → KHÔNG cần key

Chi tiết xem [README.md](../README.md) và `scripts/ai_provider.py`.
