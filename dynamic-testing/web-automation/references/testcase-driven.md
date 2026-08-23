# Testcase-driven Automation — workflow chính

> Companion to `SKILL.md`. Read this trước khi viết automation — KHÔNG BAO GIỜ viết test trước khi có testcase.
>
> **Quan trọng**: Automation PHẢI cover đủ **8 loại testcase** theo `support-testcase-authoring` skill:
> `happy → alternative → validation → edge → negative → error → ui → additional`
> Xem `@references/test-types.md` của `support-testcase-authoring` để biết định nghĩa.

## TOC
1. Tại sao testcase-driven?
2. **8 loại testcase ↔ Playwright patterns**
3. Testcase template (chuẩn)
4. Workflow 4 bước
5. Mapping table — TestCase ID → files
6. Ví dụ đầy đủ: Login feature (cover cả 8 loại)
7. Allure labels mapping
8. Anti-patterns

---

## 1. Tại sao testcase-driven?

**Nguyên tắc vàng**: Manual testcase là **source of truth**. Automation chỉ là cách chạy testcase tự động.

| Viết test trước (sai) | Viết testcase trước (đúng) |
|---|---|
| Code lái testcase → testcase bị ép theo code | Testcase lái code → code phản ánh đúng yêu cầu |
| Khó traceability: "test này test cái gì?" | Mỗi test có TestCase ID rõ ràng |
| Dễ miss edge case | Testcase buộc cover đủ scenarios |
| Không align với QA team | QA + Dev cùng đọc testcase |

---

## 2. 8 loại testcase ↔ Playwright patterns

Mỗi loại testcase trong `support-testcase-authoring` ánh xạ sang 1 pattern Playwright cụ thể:

| # | Type | Test cái gì | Playwright pattern | Tag |
|---|---|---|---|---|
| 1 | **`happy`** | Flow đúng, input hợp lệ | Action thường, assert success state | `@smoke` |
| 2 | **`alternative`** | Cách khác cùng kết quả OK | Click vs Enter, button vs keyboard shortcut | `@alt` |
| 3 | **`validation`** | Required/format/constraint | Empty input, format sai → button disabled / inline error | `@validation` |
| 4 | **`edge`** | Boundary: min/max/empty/long | String đúng min length, đúng max length, 0, 1 | `@edge` |
| 5 | **`negative`** | Input sai, unauthorized, sai flow | Wrong password, invalid token | `@negative` |
| 6 | **`error`** | Server/network fail | 500, timeout, disconnect, throttle 3G | `@error` |
| 7 | **`ui`** | Display/layout | Element hiển thị, position, color, font | `@ui-display` |
| 8 | **`additional`** | AI thêm ngoài AC — flag rõ | Spec không yêu cầu nhưng đoán có thể xảy ra | `@additional` |

### Chi tiết pattern cho mỗi loại

#### 1. `happy` — flow chính
```typescript
test('TC_LOGIN_01 [happy] — Login thành công @smoke', async ({ page }) => {
  await loginPage.login('valid@test.com', 'P@ss123');
  await expect(page).toHaveURL(/dashboard/i);
});
```

#### 2. `alternative` — cách khác cùng kết quả
```typescript
test('TC_LOGIN_02 [alternative] — Submit bằng Enter thay vì click @alt', async ({
  page,
}) => {
  await loginPage.emailInput.fill('valid@test.com');
  await loginPage.passwordInput.fill('P@ss123');
  await loginPage.passwordInput.press('Enter'); // thay vì click
  await expect(page).toHaveURL(/dashboard/i);
});
```

#### 3. `validation` — required/format/constraint
```typescript
test('TC_LOGIN_03 [validation] — Email trống → submit disabled @validation', async () => {
  await loginPage.fillCredentials('', 'P@ss123');
  await expect(loginPage.submitButton).toBeDisabled();
});
```

#### 4. `edge` — boundary
```typescript
test('TC_LOGIN_04 [edge] — Password đúng 8 ký tự (boundary min) @edge', async ({
  page,
}) => {
  await loginPage.login('valid@test.com', 'Aa1!aaaa'); // 8 chars
  await expect(page).toHaveURL(/dashboard/i);
});
```

#### 5. `negative` — input sai
```typescript
test('TC_LOGIN_05 [negative] — Sai password → error message @negative', async () => {
  await loginPage.fillCredentials('valid@test.com', 'wrong');
  await loginPage.submit();
  await expect(loginPage.errorMessage).toBeVisible();
  expect(await loginPage.getError()).toMatch(/invalid|sai/i);
});
```

#### 6. `error` — server/network fail
```typescript
test('TC_LOGIN_06 [error] — Server 500 → error message @error', async ({ page }) => {
  await page.route('**/api/login', (route) => route.fulfill({ status: 500 }));
  await loginPage.login('valid@test.com', 'P@ss123');
  await expect(loginPage.errorMessage).toBeVisible();
});
```

#### 7. `ui` — display/layout
```typescript
test('TC_LOGIN_07 [ui] — Logo hiển thị đúng vị trí @ui-display', async () => {
  await expect(loginPage.logo).toBeVisible();
  const box = await loginPage.logo.boundingBox();
  expect(box?.x).toBeGreaterThan(0);
});
```

#### 8. `additional` — AI thêm (flag rõ)
```typescript
// ⚠️ Additional case — KHÔNG có trong AC gốc, AI đoán có thể xảy ra
test('TC_LOGIN_08 [additional] — SQL injection bị reject @additional', async ({ page }) => {
  await loginPage.fillCredentials("' OR '1'='1", 'any');
  await loginPage.submit();
  await expect(page).toHaveURL(/login/); // flag rõ trong Allure
});
```

---

## 3. Testcase template (chuẩn)

Mỗi testcase nên có format thống nhất (theo `support-testcase-authoring`). Lưu trong `testcases/` dạng `.md` hoặc `.csv`.

### Bảng testcase (table format — khuyến khích)

| Field | Bắt buộc | Mô tả |
|---|---|---|
| **ID** | ✅ | `TC_<FEATURE>_<NN>` (vd: `TC_LOGIN_01`) |
| **Type** | ✅ | 1 trong 8: `happy`/`alternative`/`validation`/`edge`/`negative`/`error`/`ui`/`additional` |
| **Description** | ✅ | Tóm tắt intent trong 1 câu |
| **Pre-conditions** | ✅ | Trạng thái trước khi chạy |
| **Test data** | ✅ | Input cụ thể (email, password,...) |
| **Steps** | ✅ | Đánh số, mỗi step 1 hành động |
| **Expected** | ✅ | Kết quả mong đợi, đo được |
| **Execution contract** | ✅ cho case mới | Entry route/role/state/data, `[S##]` steps, semantic target, wait signal, step assertions, outcome and cleanup |
| **Priority** | ✅ | High / Medium / Low |

### Ví dụ testcase cho Login (cover cả 8 loại)

| ID | Type | Description | Test data | Expected |
|---|---|---|---|---|
| TC_LOGIN_01 | happy | Login thành công | valid@test.com / P@ss123 | Redirect /dashboard |
| TC_LOGIN_02 | alternative | Submit bằng Enter | valid@test.com / P@ss123 | Redirect /dashboard |
| TC_LOGIN_03 | validation | Email trống | "" / P@ss123 | Submit disabled |
| TC_LOGIN_04 | edge | Password 8 chars (boundary) | valid@test.com / Aa1!aaaa | Login OK |
| TC_LOGIN_05 | negative | Sai password | valid@test.com / wrong | Error "Invalid" |
| TC_LOGIN_06 | error | Server 500 | valid@test.com / P@ss123 | Error message |
| TC_LOGIN_07 | ui | Logo hiển thị đúng vị trí | - | Logo visible, x>0 |
| TC_LOGIN_08 | additional | SQL injection | ' OR '1'='1 / any | Không login được |

---

## 4. Workflow 4 bước

### Bước 1 — Thu thập testcase
- Đọc Markdown để hiểu testcase và dùng `.automation.json` cùng basename làm machine source lossless; Excel là artifact cho manual execution/write-back
- Chạy `npm run pom-plan -- --manifest testcases/<feature>.automation.json` trước khi viết spec, rồi giữ nguyên source hash và behavior/RBAC markers trong code
- Nếu chỉ có Excel, dừng ở bước normalize/export sang Markdown; không tự đoán `target.key`, route hoặc locator từ cell F/G/H thiếu contract
- **Đảm bảo đủ 8 loại** — nếu thiếu, bổ sung hoặc ghi rõ "không áp dụng cho feature này".
- Mục tiêu: biết **bao nhiêu testcase, bao nhiêu page, bao nhiêu flow, bao nhiêu error path**.

### Bước 2 — Resolve Selectors từ testcase + runtime DOM
Từ mỗi `execution.steps[].target.key`, identify semantic target cần tương tác từ Steps, sau đó inspect **live DOM trong đúng environment/role/route**. Testcase không cung cấp bằng chứng đủ để tự suy ra XPath

```typescript
// selectors/login.selectors.ts — locators sau khi runtime verification
export const loginSelectors = {
  emailInput: (page: Page) => page.getByLabel('Email'),
  passwordInput: (page: Page) => page.getByLabel('Mật khẩu'),
  submitButton: (page: Page) => page.getByRole('button', { name: 'Đăng nhập' }),
} as const;
```

Selector selection is a verification task, not a text-generation task. Browser
MCP (Playwright MCP by default) is the discovery source of truth for the live
accessibility snapshot and DOM. Use `browser_navigate` → `browser_snapshot` →
`browser_evaluate` or the provider-equivalent tools in the same session before
generating selector code:

1. Inspect existing FE-owned test-id, stable ID, stable CSS attributes/classes, role/name, label, placeholder, text and DOM scope through Browser MCP
2. Verify in that same Browser MCP session that the candidate has `count=1`, its visibility matches the expected state, and it is actionable for the requested action
3. Select by `data-testid → id → CSS → role/label/placeholder/text → XPath`; if no FE source/contract exists, do not create a test-id and continue at the next candidate
4. Record `target_key`, ordered candidates, selected strategy, locator, Browser MCP provider/tools, route/state and verification in `selector-evidence/<feature>.json`
5. If the target is ambiguous, block and request a stable test-id/id/CSS/semantic scope; never add `.first()` or a full XPath to make the test compile

Read [selector-discovery.md](selector-discovery.md) for the complete gate and evidence format

### Bước 3 — Derive Page Object từ testcase
- 1 page → 1 class, **properties readonly**.
- **Action methods** map từ Steps (input/click/submit).
- **Read methods** map từ Expected (text/URL/state).

### Bước 4 — Derive Spec từ testcase
Mỗi testcase row → 1 `test()`. **Name = `<TC_ID> [<type>] — <Description>`** để traceability + sort theo type.

```typescript
// tests/ui/login.ui.spec.ts — derived từ TC_LOGIN_01..08
test.describe('Login @ui', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.open();
  });

  // Happy
  test('TC_LOGIN_01 [happy] — Login thành công @smoke', async ({ page }) => {
    await loginPage.login('valid@test.com', 'P@ss123');
    await expect(page).toHaveURL(/dashboard/i);
  });

  // Alternative
  test('TC_LOGIN_02 [alternative] — Submit bằng Enter @alt', async ({ page }) => {
    await loginPage.emailInput.fill('valid@test.com');
    await loginPage.passwordInput.fill('P@ss123');
    await loginPage.passwordInput.press('Enter');
    await expect(page).toHaveURL(/dashboard/i);
  });

  // Validation
  test('TC_LOGIN_03 [validation] — Email trống → submit disabled @validation', async () => {
    await loginPage.fillCredentials('', 'P@ss123');
    await expect(loginPage.submitButton).toBeDisabled();
  });

  // Edge
  test('TC_LOGIN_04 [edge] — Password 8 chars (boundary) @edge', async ({ page }) => {
    await loginPage.login('valid@test.com', 'Aa1!aaaa');
    await expect(page).toHaveURL(/dashboard/i);
  });

  // Negative
  test('TC_LOGIN_05 [negative] — Sai password @negative', async () => {
    await loginPage.fillCredentials('valid@test.com', 'wrong');
    await loginPage.submit();
    await expect(loginPage.errorMessage).toBeVisible();
  });

  // Error
  test('TC_LOGIN_06 [error] — Server 500 → error @error', async ({ page }) => {
    await page.route('**/api/login', (route) => route.fulfill({ status: 500 }));
    await loginPage.login('valid@test.com', 'P@ss123');
    await expect(loginPage.errorMessage).toBeVisible();
  });

  // UI
  test('TC_LOGIN_07 [ui] — Logo hiển thị đúng vị trí @ui-display', async () => {
    await expect(loginPage.logo).toBeVisible();
    const box = await loginPage.logo.boundingBox();
    expect(box?.x).toBeGreaterThan(0);
  });

  // Additional (flag rõ trong Allure)
  test('TC_LOGIN_08 [additional] — SQL injection bị reject @additional', async ({ page }) => {
    await loginPage.fillCredentials("' OR '1'='1", 'any');
    await loginPage.submit();
    await expect(page).toHaveURL(/login/);
  });
});
```

---

## 5. Mapping table — TestCase ID → files

| TestCase ID | Type | Selector file | Page file | Spec file | Allure Labels |
|---|---|---|---|---|---|
| TC_LOGIN_01 | happy | `selectors/login.selectors.ts` | `pages/login.page.ts` | `tests/ui/login.ui.spec.ts` | epic=Auth, feature=Login, story=Smoke |
| TC_LOGIN_02 | alternative | (same) | (same) | (same) | epic=Auth, feature=Login, story=Alt |
| TC_LOGIN_03 | validation | (same) | (same) | (same) | epic=Auth, feature=Login, story=Validation |
| TC_LOGIN_04 | edge | (same) | (same) | (same) | epic=Auth, feature=Login, story=Edge |
| TC_LOGIN_05 | negative | (same) | (same) | (same) | epic=Auth, feature=Login, story=Negative |
| TC_LOGIN_06 | error | (same) | (same) | (same) | epic=Auth, feature=Login, story=Error |
| TC_LOGIN_07 | ui | (same) | (same) | (same) | epic=Auth, feature=Login, story=UIDisplay |
| TC_LOGIN_08 | additional | (same) | (same) | (same) | epic=Auth, feature=Login, story=Additional |

---

## 6. Ví dụ đầy đủ: Login feature (cover cả 8 loại)

### Testcase gốc (8 cases từ `support-testcase-authoring`)
```
TC_LOGIN_01 [happy]        → Login OK
TC_LOGIN_02 [alternative]  → Submit bằng Enter
TC_LOGIN_03 [validation]   → Email trống
TC_LOGIN_04 [edge]         → Password 8 chars boundary
TC_LOGIN_05 [negative]     → Sai password
TC_LOGIN_06 [error]        → Server 500
TC_LOGIN_07 [ui]           → Logo hiển thị
TC_LOGIN_08 [additional]   → SQL injection
```

### Files tạo ra
```
selectors/login.selectors.ts              # ← từ 8 TC, identify 5 elements
pages/login.page.ts                      # ← action methods + read methods
tests/ui/login.ui.spec.ts                # ← 8 test() blocks, mỗi test 1 TC + type
```

### Verify traceability
```bash
# Đếm testcase manual
grep -c "^TC_LOGIN_" testcases/login.md
# → 8

# Đếm test() trong spec
grep -c "test('TC_LOGIN_" tests/ui/login.ui.spec.ts
# → 8 (khớp)

# Verify đủ 8 loại
grep -E "\[(happy|alternative|validation|edge|negative|error|ui|additional)\]" tests/ui/login.ui.spec.ts | wc -l
# → 8 (đủ cả 8 loại)

# Audit machine-readable: source hash + ID mapping + target key + selector evidence
npm run traceability -- --testcases testcases/login.md --manifest testcases/login.automation.json
```

---

## 7. Allure labels mapping (optional)

Labels such as epic/feature/story are optional filters only. They do not define the report contract. The shared POM fixture always owns the required `account`, `url`, `evidence_image`, `evidence_video`, `evidence-image` and `evidence-video` fields; do not add per-spec screenshot/video or parameter hooks. See `references/allure-playwright-mapping.md` for the single canonical format.

Mỗi test có metadata để filter trên Allure dashboard. Xem chi tiết ở `references/allure-playwright-mapping.md`.

```typescript
test('TC_LOGIN_01 [happy] — Login thành công @smoke', async ({ page }) => {
  await allure.epic('Auth');
  await allure.feature('Login');
  await allure.story('Smoke');
  await allure.severity('critical');
  await allure.owner('qa-team');
  await allure.tag('happy');
  await allure.tms('TC_LOGIN_01'); // link tới test management system
  await allure.issue('AUTH-123'); // link tới Jira/Plane issue

  await loginPage.login('valid@test.com', 'P@ss123');
  await expect(page).toHaveURL(/dashboard/i);
});
```

**Allure dashboard sẽ show**:
- Epic: Auth → tất cả testcase liên quan Auth
- Feature: Login → drilldown vào Login
- Story: Smoke → chỉ smoke tests
- Severity: critical → filter theo mức độ
- TMS link → click là nhảy về testcase gốc

---

## 8. Anti-patterns

| Anti-pattern | Hậu quả | Fix |
|---|---|---|
| Viết test trước, viết testcase sau | Testcase bị ép theo code, miss requirements | Luôn có testcase trước |
| Chỉ cover happy + negative | Miss alternative/validation/edge/error/ui | Cover đủ 8 loại |
| Test name không có TestCase ID | Không traceability, audit khó | `test('TC_LOGIN_01 [happy] — ...')` |
| Page Object không `readonly` | Locator bị reassign → bug khó reproduce | `private readonly locs` + getter |
| 1 page Object chứa nhiều page | Khó maintain, vi phạm SRP | 1 class = 1 page |
| Action method chứa `expect()` | Page object không reuse được | Return data, expect ở spec |
| Selector hardcode trong page | Khi UI đổi phải sửa nhiều chỗ | Centralized trong `selectors/` |
| `additional` không flag | Không phân biệt được case spec vs case đoán | Tag `@additional` + ghi chú Allure |
| `error` không mock | Phụ thuộc backend thật, flaky | `page.route()` mock response |
| Test cover 5 intent trong 1 test | Khó debug, 1 fail block cả 5 | 1 test = 1 intent (1 TestCase) |

---

## 9. Checklist trước khi bàn giao automation

- [ ] Testcase manual đã có, đủ **8 loại** (hoặc giải thích tại sao thiếu)
- [ ] Số `test()` blocks khớp số testcase rows
- [ ] Mỗi `test()` name có format `<TC_ID> [<type>] — <Description>`
- [ ] Type được tag (1 trong 8) + tag phụ (`@smoke`, `@validation`,...)
- [ ] Allure labels đầy đủ (epic/feature/story/severity)
- [ ] Mỗi page có 1 Page Object với readonly properties
- [ ] Mỗi module có file `selectors/<module-slug>.selectors.ts`, với slug suy ra duy nhất từ `testcase.group`
- [ ] Mỗi `target.key` có selector evidence runtime với `count=1`, visibility khớp expected state và actionable khi cần
- [ ] Không có XPath/CSS đoán từ prose, full XPath, generated class hoặc positional selector
- [ ] `tsconfig.json` strict mode (template trong SKILL.md)
- [ ] `error` tests có mock `page.route()`, không phụ thuộc backend
- [ ] `additional` tests có ghi chú rõ trong Allure
