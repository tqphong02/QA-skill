import { test, expect } from '@playwright/test';
import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';

/**
 * UI test mẫu — Login flow đầy đủ với Annotations kiểu TestNG.
 * Tag @ui để filter trong CI:  npx playwright test --grep @ui
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

  // @BeforeClass — chạy 1 lần trước tất cả tests trong describe block.
  // Dùng khi cần: tạo user test, lấy token chung, seed data.
  // Xoá hook này nếu không cần setup chung.
  // test.beforeAll(async () => { ... });

  // @AfterClass — cleanup data sau tất cả tests.
  // test.afterAll(async () => { ... });

  // @BeforeMethod — chạy trước MỖI test (tương đương @BeforeMethod TestNG)
  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.open();
  });

  // @AfterMethod — screenshot khi fail, tương đương ITestListener trong TestNG
  // `_page` prefix → TypeScript biết param có chủ đích không dùng (noUnusedLocals)
  test.afterEach(async ({ page: _page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshot = await _page.screenshot();
      await testInfo.attach('screenshot-on-failure', {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Test cases với Allure annotations
  // ─────────────────────────────────────────────────────────────

  // @Test(priority=1, groups={"smoke","ui"})
  // @Severity(CRITICAL) @Feature("Login") @Story("Happy path")
  test('happy path — credentials đúng → redirect dashboard + welcome', async ({ page }) => {
    // Allure annotations — tương đương @Severity, @Feature, @Story, @Owner (TestNG)
    allure.severity('critical');
    allure.feature('Login');
    allure.story('Happy path');
    allure.owner('QA Team');
    allure.description('Valid credentials should redirect to dashboard and show welcome message');

    // Playwright native annotation — hiển thị trong HTML report
    // PHẢI gọi trong async test body (không gọi ngoài test block)
    test.info().annotations.push({
      type: 'priority',
      description: 'P1 — smoke',
    });

    // @Step — tương đương @Step annotation trong Allure-TestNG
    await allure.step('Fill credentials and submit', async () => {
      await loginPage.login(
        process.env.TEST_USER ?? 'demo@example.com',
        process.env.TEST_PASS ?? 'Demo@123',
      );
    });

    await allure.step('Assert redirect to dashboard', async () => {
      await expect(page).toHaveURL(/dashboard|home/i);
    });

    await allure.step('Assert welcome message visible (if element exists)', async () => {
      const welcome = page.getByTestId('welcome-msg');
      if (await welcome.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(welcome).toBeVisible();
      }
    });
  });

  // @Test(priority=2, groups={"regression","ui"})
  // @Severity(NORMAL) @Story("Negative — wrong password")
  test('negative — sai password → error message hiển thị', async () => {
    allure.severity('normal');
    allure.feature('Login');
    allure.story('Negative — wrong credentials');

    await allure.step('Submit wrong credentials', async () => {
      await loginPage.fillCredentials('wrong@example.com', 'wrong-password-xyz');
      await loginPage.submit();
    });

    await allure.step('Assert error message visible and correct', async () => {
      await expect(loginPage.errorMessage).toBeVisible();
      const err = await loginPage.getError();
      expect(err).toMatch(/invalid|sai|incorrect|wrong/i);
    });
  });

  // @Test(priority=3, groups={"regression","ui"})
  // @Severity(MINOR) @Story("Negative — empty fields")
  test('negative — bỏ trống field → submit disabled HOẶC chặn + vẫn ở /login', async ({ page }) => {
    allure.severity('minor');
    allure.feature('Login');
    allure.story('Negative — empty fields');

    await loginPage.fillCredentials('', '');

    const disabled = await loginPage.submitButton.isDisabled().catch(() => false);
    if (!disabled) {
      await loginPage.submit();
      await expect(page).toHaveURL(/login/);
    } else {
      expect(disabled).toBe(true);
    }
  });

  // @Test(enabled=false) — skip có điều kiện theo environment
  // CÚ PHÁP ĐÚNG: test.skip() phải nằm TRONG test body (không phải standalone)
  test('flaky test example — skip khi SKIP_FLAKY=true @ui', async ({ page }) => {
    // Tương đương @Test(enabled=false) trong TestNG
    // test.skip() trong body = conditional skip — không phải bỏ test hoàn toàn
    test.skip(
      process.env.SKIP_FLAKY === 'true',
      'Skipped in CI when SKIP_FLAKY=true — tương đương @Test(enabled=false) TestNG'
    );

    allure.severity('minor');
    allure.feature('Login');
    allure.story('Flaky scenario');

    // ... nội dung test thật ở đây
    await expect(page).toHaveURL(/login/i);
  });
});
