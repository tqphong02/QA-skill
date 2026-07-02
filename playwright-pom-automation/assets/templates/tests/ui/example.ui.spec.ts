import { test, expect } from '@playwright/test';
// Bỏ comment khi đã cài allure-playwright:
// import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';

/**
 * UI test mẫu — tag @ui để filter trong CI:  npx playwright test --grep @ui
 * Đặc điểm: test per-page/component, browser-driven, assert DOM trực tiếp.
 * Assertion nằm ở ĐÂY (spec), KHÔNG nằm trong page object.
 */
test.describe('Login @ui', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.open();
  });

  test('happy path — đăng nhập thành công chuyển tới dashboard', async ({ page }) => {
    // allure.step('Login with valid credentials', async () => { ... });
    await loginPage.login(process.env.TEST_USER!, process.env.TEST_PASS!);

    // Assertion ở spec
    await expect(page).toHaveURL(/dashboard|home/i);
  });

  test('negative — sai password hiện error message', async () => {
    await loginPage.fillCredentials('user@example.com', 'wrong-password');
    await loginPage.submit();

    await expect(loginPage.errorMessage).toBeVisible();
    const err = await loginPage.getError();
    expect(err).toMatch(/invalid|sai|incorrect/i);
  });

  test('negative — bỏ trống field → nút submit disabled hoặc chặn', async ({ page }) => {
    await loginPage.fillCredentials('', '');
    const disabled = await loginPage.submitButton.isDisabled();
    if (!disabled) {
      await loginPage.submit();
      await expect(page).toHaveURL(/login/); // vẫn ở trang login
    }
  });
});
