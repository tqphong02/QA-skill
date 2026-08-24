import { test, expect } from '../../fixtures/pom';
import { LoginPage } from '../../pages/example.page';
import { DashboardPage } from '../../pages/dashboard.page';
import { ENV } from '../../fixtures/env';

/**
 * UI test mẫu — Login flow đầy đủ với Annotations kiểu TestNG.
 * Tag @ui để filter trong CI:  npm run qa:test:ui
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  ANNOTATIONS — Playwright tương đương TestNG                 │
 * │                                                              │
 * │  TestNG Java              │  Playwright TypeScript           │
 * │  ─────────────────────────┼─────────────────────────        │
 * │  @Test(groups="smoke")    │  test('name @smoke', ...)       │
 * │  @BeforeClass             │  test.beforeAll(...)            │
 * │  @AfterClass              │  test.afterAll(...)             │
 * │  @BeforeMethod            │  test.beforeEach(...)           │
 * │  @AfterMethod             │  test.afterEach(...)            │
 * │  @Test(priority=1)        │  test.info().annotations.push() │
 * │  @Test(enabled=false)     │  test.skip(reason) inside test  │
 * │  @Test(description="...") │  allure.description("...")      │
 * │  @Severity(CRITICAL)      │  allure.severity('critical')    │
 * │  @Feature("Login")        │  allure.feature('Login')        │
 * │  @Story("Happy path")     │  allure.story('Happy path')     │
 * │  @Owner("QA Team")        │  allure.owner('QA Team')        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Convention:
 *  - Page Object = nơi chứa locators + actions (KHÔNG expect).
 *  - expect() ở ĐÂY (spec), không ở page method.
 *  - 1 intent / test (login form OK = 1 test; login fail = 1 test khác).
 */

// ─────────────────────────────────────────────────────────────
// Suite-level metadata — tương đương @Feature + @Suite (TestNG)
// ─────────────────────────────────────────────────────────────
test.describe('Login @ui', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  // @BeforeClass — chạy 1 lần trước tất cả tests trong describe block.
  // Dùng khi cần: tạo user test, lấy token chung, seed data.
  // Xoá hook này nếu không cần setup chung.
  // test.beforeAll(async () => { ... });

  // @AfterClass — cleanup data sau tất cả tests.
  // test.afterAll(async () => { ... });

  // @BeforeMethod — chạy trước MỖI test (tương đương @BeforeMethod TestNG)
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.open();
  });

  // ─────────────────────────────────────────────────────────────
  // Test cases với Allure annotations
  // ─────────────────────────────────────────────────────────────

  // @Test(priority=1, groups={"smoke","ui"})
  // @Severity(CRITICAL) @Feature("Login") @Story("Happy path")
  test('TC-UI-LOGIN-SUCCESS-001 | happy path — credentials đúng → redirect dashboard + welcome', async ({ page }) => {
    // Allure annotations — tương đương @Severity, @Feature, @Story, @Owner (TestNG)
    // Playwright native annotation — hiển thị trong HTML report
    // PHẢI gọi trong async test body (không gọi ngoài test block)
    test.info().annotations.push({
      type: 'priority',
      description: 'P1 — smoke',
    });

    // @Step — tương đương @Step annotation trong Allure-TestNG
    await test.step('Fill credentials and submit', async () => {
      await loginPage.login(
        ENV.testUser,
        ENV.testPass,
      );
    });

    await test.step('Assert redirect to dashboard', async () => {
      await expect(page).toHaveURL(/dashboard|home/i);
    });

    await test.step('Assert dashboard heading visible', async () => {
      await expect(dashboardPage.headerTitle).toBeVisible();
    });
  });

  // @Test(priority=2, groups={"regression","ui"})
  // @Severity(NORMAL) @Story("Negative — wrong password")
  test('TC-UI-LOGIN-WRONG-PASSWORD-001 | negative — sai password → error message hiển thị', async () => {
    await test.step('Submit wrong credentials', async () => {
      await loginPage.fillCredentials('wrong@example.com', 'wrong-password-xyz');
      await loginPage.submit();
    });

    await test.step('Assert error message visible and correct', async () => {
      await expect(loginPage.errorMessage).toBeVisible();
      const err = await loginPage.getError();
      expect(err).toMatch(/invalid|sai|incorrect|wrong/i);
    });
  });

  // @Test(priority=3, groups={"regression","ui"})
  // @Severity(MINOR) @Story("Negative — empty fields")
  test('TC-UI-LOGIN-EMPTY-001 | negative — bỏ trống field → submit disabled', async ({ page }) => {
    await loginPage.fillCredentials('', '');

    await expect(loginPage.submitButton).toBeDisabled();
    await expect(page).toHaveURL(/login/);
  });

  // @Test(enabled=false) — skip có điều kiện theo environment
  // CÚ PHÁP ĐÚNG: test.skip() phải nằm TRONG test body (không phải standalone)
  test('TC-UI-LOGIN-FLAKY-001 | flaky test example — skip khi SKIP_FLAKY=true @ui', async ({ page }) => {
    // Tương đương @Test(enabled=false) trong TestNG
    // test.skip() trong body = conditional skip — không phải bỏ test hoàn toàn
    test.skip(
      process.env.SKIP_FLAKY === 'true',
      'Skipped in CI when SKIP_FLAKY=true — tương đương @Test(enabled=false) TestNG'
    );

    // ... nội dung test thật ở đây
    await expect(page).toHaveURL(/login/i);
  });
});
