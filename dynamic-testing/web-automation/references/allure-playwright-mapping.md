# Allure ↔ Playwright Mapping Reference

> Companion to `SKILL.md`. Read this khi setup Allure report cho Playwright test.
>
> **Câu hỏi chính**: Result Playwright trả ra có mapping đúng với Allure report không?
> **Trả lời ngắn**: CÓ — qua `@playwright/test` reporter + `allure-playwright` adapter. Mapping rõ ràng từng field.

## TOC
1. Tổng quan flow
2. Cài đặt Allure cho Playwright
3. **Mapping chi tiết** Playwright result → Allure
4. Allure labels (epic/feature/story/severity/owner/tag)
5. Steps + attachments
6. Categories & severity
7. Test history & retries
8. Verify mapping (debug khi mismatch)
9. Anti-patterns

---

## 1. Tổng quan flow

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Playwright     │ →  │  allure-         │ →  │  Allure          │
│  test result    │    │  playwright      │    │  Report HTML     │
│  (JSON)         │    │  (adapter)       │    │                  │
└─────────────────┘    └──────────────────┘    └──────────────────┘
  - test() status       - Đọc result           - Dashboard
  - steps               - Gắn labels           - Trend graph
  - attachments         - Sinh allure-results  - Categories
  - error/stack         - JSON output          - Timeline
```

**Mapping có sẵn** — `allure-playwright` tự map hầu hết fields. Bạn chỉ cần thêm labels để có filter/sort đẹp trên dashboard.

---

## 2. Cài đặt Allure cho Playwright

```bash
# Cài package
npm i -D @playwright/test allure-playwright
npx playwright install

# Cài Allure CLI (gen report)
npm i -D allure-commandline
# hoặc global: npm i -g allure-commandline
```

### `playwright.config.ts` — enable Allure reporter

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],                          // console output
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['allure-playwright', {
      outputFolder: 'reports/allure-results',
      detail: true,                   // attach steps, screenshots, traces
      output: 'allure',               // dùng 'allure' (v2) hoặc 'allure1'
      suiteTitle: false,
    }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
```

### Generate + open report

```bash
# Chạy test
npx playwright test

# Generate Allure report từ results
npx allure generate reports/allure-results -o reports/allure-report --clean

# Open report (serve + browser)
npx allure open reports/allure-report

# Hoặc 1-step serve
npx allure serve reports/allure-results
```

---

## 3. Mapping chi tiết Playwright result → Allure

| Playwright result field | Allure field | Auto/Manual | Ghi chú |
|---|---|---|---|
| `test.title` | **Test name** | Auto | Tên hiển thị trên report |
| `test.titlePath` | **Suites** (tree) | Auto | `describe('Login @ui')` → suite "Login" |
| `test.file` | **Test class** (source) | Auto | Đường dẫn file .spec.ts |
| `test.status` (passed/failed/timedOut/skipped) | **Status** (passed/failed/broken/skipped) | Auto | Map 1:1 |
| `test.error.message` | **Failure message** | Auto | |
| `test.error.stack` | **Stack trace** | Auto | |
| `test.annotations` | **Description / Links** | Auto (partial) | Type, TMS link |
| **Custom Allure labels** | epic / feature / story | **Manual** | Cần gọi `allure.epic(...)` |
| **Custom severity** | Severity badge | **Manual** | Cần `allure.severity(...)` |
| `screenshot on failure` | **Attachment** | Auto (via reporter) | |
| `trace.zip on failure` | **Attachment** | Auto (via reporter) | |
| `test.steps` (via `allure.step`) | **Steps** trong test | **Manual** | Cần `allure.step(...)` |
| `test.retries` | **History** (multiple runs) | Auto | Allure show history tự động |

### Verify mapping (khi nghi ngờ)

```bash
# 1. Check raw result file
cat reports/allure-results/<test-uuid>-result.json | jq

# Sẽ thấy:
# {
#   "uuid": "...",
#   "historyId": "...",
#   "testCaseId": "...",
#   "fullName": "Login > TC_LOGIN_01 [happy] — Login thành công",
#   "status": "passed",
#   "stage": "finished",
#   "steps": [...],
#   "labels": [
#     { "name": "epic", "value": "Auth" },
#     { "name": "feature", "value": "Login" },
#     ...
#   ],
#   "parameters": [...],
#   "attachments": [
#     { "name": "screenshot", "source": "...", "type": "image/png" }
#   ]
# }

# 2. Check field cụ thể
cat reports/allure-results/<test-uuid>-result.json | jq '.labels'
```

---

## 4. Allure labels (epic/feature/story/severity/owner/tag)

Đây là phần **PHẢI làm thủ công** trong test code — Allure adapter không tự sinh.

### Pattern 1 — Direct API (allure-playwright)

```typescript
import { test, expect } from '@playwright/test';
import { allure } from 'allure-playwright';

test('TC_LOGIN_01 [happy] — Login thành công @smoke', async ({ page }) => {
  await allure.epic('Auth');
  await allure.feature('Login');
  await allure.story('Smoke');
  await allure.severity('critical');
  await allure.owner('qa-team');
  await allure.tag('happy', 'login', 'P0');
  await allure.tms('TC_LOGIN_01', 'https://plane.so/...'); // link tới TMS
  await allure.issue('AUTH-123', 'https://jira...');       // link tới issue tracker

  // ... test body
});
```

### Pattern 2 — Annotation (Playwright native → Allure pick up)

```typescript
test('TC_LOGIN_01 — Login thành công @smoke', async ({ page }, testInfo) => {
  testInfo.annotations.push(
    { type: 'epic', description: 'Auth' },
    { type: 'feature', description: 'Login' },
    { type: 'story', description: 'Smoke' },
    { type: 'severity', description: 'critical' },
    { type: 'owner', description: 'qa-team' },
    { type: 'tms', description: 'TC_LOGIN_01' },
  );
  // ... test body
});
```

### Pattern 3 — Custom fixture (DRY, dùng cho nhiều test)

```typescript
// fixtures/allure.ts
import { test as base } from '@playwright/test';
import { allure } from 'allure-playwright';

type AllureMeta = {
  epic: string;
  feature: string;
  story: string;
  severity: 'critical' | 'normal' | 'minor' | 'trivial' | 'blocker';
  owner: string;
  tcId: string;
};

export const test = base.extend<{ allureMeta: AllureMeta }>({
  allureMeta: async ({}, use) => {
    await use({
      epic: 'Auth',
      feature: 'Login',
      story: 'Smoke',
      severity: 'critical',
      owner: 'qa-team',
      tcId: 'TC_LOGIN_01',
    });
  },
});

test.beforeEach(async ({ allureMeta }) => {
  await allure.epic(allureMeta.epic);
  await allure.feature(allureMeta.feature);
  await allure.story(allureMeta.story);
  await allure.severity(allureMeta.severity);
  await allure.owner(allureMeta.owner);
  await allure.tms(allureMeta.tcId);
});
```

### Allure labels reference

| Label | Mục đích | Allure dashboard view |
|---|---|---|
| `epic` | Lớp lớn nhất (e.g. "Auth", "Order", "Payment") | Tab "Suites" tree |
| `feature` | Trong epic (e.g. "Login", "Logout", "Register") | Drilldown từ epic |
| `story` | User story / flow cụ thể | Drilldown từ feature |
| `severity` | `blocker` / `critical` / `normal` / `minor` / `trivial` | Filter "Severity" |
| `owner` | Người chịu trách nhiệm | Filter "Owner" |
| `tag` | Free-form tags (env, test type, priority) | Filter "Tags" |
| `tms` | Test Management System link | Icon TMS trên test detail |
| `issue` | Bug/Issue tracker link | Icon issue trên test detail |
| `lead` | Tên test lead | Filter "Lead" |
| `framework` | Test framework name | Filter "Framework" |

---

## 5. Steps + attachments

### Steps — chia nhỏ test body cho dễ debug

```typescript
import { allure } from 'allure-playwright';

test('TC_ORDER_01 — Create order [happy] @smoke', async ({ page }) => {
  await allure.step('Navigate to product page', async () => {
    await page.goto('/products/123');
  });

  await allure.step('Add to cart', async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click();
  });

  await allure.step('Go to checkout', async () => {
    await page.getByRole('link', { name: 'Checkout' }).click();
    await expect(page).toHaveURL(/checkout/);
  });

  await allure.step('Verify order summary', async () => {
    const total = await page.getByTestId('cart-total').innerText();
    expect(total).toBe('$99.00');
  });
});
```

→ Trên Allure: test detail sẽ show 4 steps với status pass/fail riêng → dễ debug.

### Attachments — gắn data vào test report

```typescript
import { allure } from 'allure-playwright';

test('TC_API_01 — Get user @api', async ({ request }) => {
  const res = await request.get('/api/users/1');
  const body = await res.json();

  // Attach response body
  await allure.attachment('Response body', JSON.stringify(body, null, 2), 'application/json');

  // Attach screenshot (UI test)
  // await allure.attachment('Screenshot', await page.screenshot(), 'image/png');

  expect(res.status()).toBe(200);
});
```

### Auto attachments (khi fail)

`allure-playwright` tự attach:
- **Screenshot** (nếu `screenshot: 'only-on-failure'`)
- **Trace.zip** (nếu `trace: 'retain-on-failure'`)
- **Video** (nếu `video: 'retain-on-failure'`)
- **Error message + stack trace**

---

## 6. Categories & severity

### Custom categories — phân loại lỗi

```typescript
// allure.config.ts hoặc in code
import { allure } from 'allure-playwright';

allure.categories.add({
  name: 'Login failures',
  messageRegex: '.*(login|auth|session).*',
  matchedStatuses: ['failed', 'broken'],
});

allure.categories.add({
  name: 'Network errors',
  messageRegex: '.*(timeout|ECONNREFUSED|network).*',
  matchedStatuses: ['failed'],
});
```

→ Dashboard tab "Categories" gom lỗi theo nhóm → dễ thấy pattern fail.

### Severity levels

| Severity | Khi nào dùng |
|---|---|
| `blocker` | Test fail → block release (e.g. login broken) |
| `critical` | Critical feature broken |
| `normal` | Default (nếu không set) |
| `minor` | Edge case, ít ảnh hưởng |
| `trivial` | Cosmetic, formatting |

```typescript
await allure.severity('critical');
```

---

## 7. Test history & retries

### History — Allure tự track

- Mỗi lần chạy test, Allure lưu history (status, duration, run id).
- Tab "History" trên test detail → graph pass/fail theo thời gian.
- Nếu test FLAKY (pass lúc fail lúc) → graph sẽ show rõ → engineer xử lý.

### Retries — config trong playwright.config.ts

```typescript
export default defineConfig({
  retries: {
    mode: 'on',
    // mode: 'off'   — không retry
    // mode: 'on'    — retry tất cả test fail 1 lần
  },
});
```

**Mapping**:
- Test fail → retry → nếu retry pass → Allure hiển thị `flaky` (passed after retry)
- `flaky` là status riêng → dashboard highlight → dễ thấy test không ổn định.

---

## 8. Verify mapping (debug khi mismatch)

### Checklist khi Allure report sai/missing

| Symptom | Nguyên nhân | Fix |
|---|---|---|
| Test name không có trên report | Reporter không được enable | Check `playwright.config.ts > reporter` |
| Labels (epic/feature) trống | Không gọi `allure.epic(...)` trong test | Thêm labels |
| Steps không hiển thị | Không dùng `allure.step()` | Wrap logic trong `allure.step` |
| Screenshot không attach | `screenshot: 'off'` trong config | Set `'only-on-failure'` |
| Trace.zip không attach | `trace: 'off'` | Set `'retain-on-failure'` |
| Status sai (broken vs failed) | Test có `expect()` fail → `failed`. Throw ngoài expect → `broken` | OK — là behavior đúng |
| Retries không track | `retries: 0` | Bật retry mode |
| History trống | Chỉ mới chạy 1 lần | Chạy lần 2, Allure tự so sánh |

### Debug command

```bash
# Inspect raw result file
ls reports/allure-results/
cat reports/allure-results/<uuid>-result.json | jq

# Regenerate report
rm -rf reports/allure-report
npx allure generate reports/allure-results -o reports/allure-report --clean

# Check labels cho 1 test cụ thể
cat reports/allure-results/<uuid>-result.json | jq '.labels[] | {name, value}'
```

---

## 9. Anti-patterns

| Anti-pattern | Hậu quả | Fix |
|---|---|---|
| Không gọi `allure.epic/feature/story` | Labels trống → Allure dashboard kém | Thêm labels đầy đủ |
| Dùng `@smoke` như epic | Epic quá nhỏ → khó drilldown | Epic = lớp nghiệp vụ lớn (Auth, Order) |
| `allure.step` cho mỗi `expect()` | Quá nhiều steps → report rối | Step cho phase lớn (Navigate, Submit, Verify) |
| Attach cả screenshot ở mọi test | Report nặng, chậm | Chỉ attach khi fail (`'only-on-failure'`) |
| Severity không phản ánh risk | "trivial" cho critical feature → bị ignore | Map severity theo impact |
| Không có `tms` link | Không nhảy về testcase gốc | `await allure.tms('TC_LOGIN_01')` |
| Categories mặc định | Fail do timeout/error không phân loại | Custom categories theo domain |
| Không set `epic` cho `additional` cases | Additional bị trộn với spec cases | Epic riêng "Additional/OutOfSpec" |

---

## 10. CI/CD — Allure trong pipeline

### GitHub Actions

```yaml
- name: Run tests
  run: npx playwright test

- name: Generate Allure report
  if: always()  # luôn chạy, kể cả test fail
  run: npx allure generate reports/allure-results -o reports/allure-report --clean

- name: Publish Allure report
  uses: simple-elf/allure-report-action@master
  if: always()
  with:
    allure_results: reports/allure-results
    allure_report: reports/allure-report
    # Optional: deploy lên GitHub Pages, Slack notification,...

- name: Upload artifacts
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: allure-results
    path: reports/allure-results
```

### Jenkins

```groovy
stage('Allure Report') {
  steps {
    script {
      allure([
        includeProperties: false,
        jdk: '',
        results: [[path: 'reports/allure-results']]
      ])
    }
  }
}
```

---

## 11. Quick reference — khi nào dùng gì

| Mục đích | API |
|---|---|
| Gắn epic/feature/story | `await allure.epic('Auth')` |
| Gắn severity | `await allure.severity('critical')` |
| Link tới testcase | `await allure.tms('TC_LOGIN_01')` |
| Link tới bug | `await allure.issue('AUTH-123')` |
| Chia test thành phases | `await allure.step('Phase name', async () => { ... })` |
| Attach response body | `await allure.attachment('Body', JSON.stringify(data), 'application/json')` |
| Add custom category | `allure.categories.add({...})` |
| Parametrize test | `test.describe('Login', () => { for (const data of cases) { test(...).each(...) } })` |
| Owner/lead | `await allure.owner('qa-team')` |
| Tag free-form | `await allure.tag('happy', 'login')` |

---

## 12. Setup checklist

- [ ] `npm i -D allure-playwright allure-commandline`
- [ ] `playwright.config.ts` có `allure-playwright` reporter
- [ ] `screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`
- [ ] Mỗi `test()` có đủ labels (epic/feature/story/severity)
- [ ] `allure.step()` cho mỗi phase lớn
- [ ] `allure.tms('TC_XXX_NN')` cho traceability
- [ ] `additional` cases có tag riêng + epic riêng (hoặc story riêng)
- [ ] Custom categories theo domain
- [ ] `npx allure generate` chạy OK
- [ ] Report show đúng status, labels, attachments