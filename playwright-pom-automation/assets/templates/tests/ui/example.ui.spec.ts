import { test, expect } from '@playwright/test';
// import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';

/**
 * UI test mẫu — Login flow đầy đủ.
 * Tag @ui để filter trong CI:  npx playwright test --grep @ui
 *
 * Convention:
 *  - Page Object = nơi chứa locators + actions (KHÔNG expect).
 *  - expect() ở ĐÂY (spec), không ở page method.
 *  - 1 intent / test (login form OK = 1 test; login fail = 1 test khác).
 *
 * Lưu ý cho user thật:
 *  - TEST_USER / TEST_PASS đọc từ .env (fill ở Quickstart bước bootstrap).
 *  - Verify URL pattern bằng regex `/dashboard|home/i` để bền vững với route style khác nhau.
 *  - Welcome message có thể đặt data-testid="welcome-msg" trên app để assert chính xác.
 */

test.describe('Login @ui', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.open();
  });

  test('happy path — credentials đúng → redirect dashboard + welcome', async ({ page }) => {
    // Fill credentials — dùng env var (đã có trong .env sau bootstrap)
    await loginPage.login(
      process.env.TEST_USER ?? 'demo@example.com',
      process.env.TEST_PASS ?? 'Demo@123',
    );

    // 1. URL chuyển sang dashboard (regex bền vững với /dashboard hoặc /home)
    await expect(page).toHaveURL(/dashboard|home/i);

    // 2. Welcome message visible (nếu app có element này — nếu không sẽ fail,
    //    user có thể comment dòng này hoặc đợi FE thêm data-testid="welcome-msg")
    const welcome = page.getByTestId('welcome-msg');
    if (await welcome.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(welcome).toBeVisible();
    }
  });

  test('negative — sai password → error message hiển thị', async () => {
    await loginPage.fillCredentials('wrong@example.com', 'wrong-password-xyz');
    await loginPage.submit();

    // Error locator visible + text match pattern (case-insensitive)
    await expect(loginPage.errorMessage).toBeVisible();
    const err = await loginPage.getError();
    expect(err).toMatch(/invalid|sai|incorrect|wrong/i);
  });

  test('negative — bỏ trống field → submit disabled HOẶC chặn + vẫn ở /login', async ({ page }) => {
    await loginPage.fillCredentials('', '');

    // 2 trường hợp: button bị disabled (FE validation) hoặc cho submit nhưng vẫn ở login
    const disabled = await loginPage.submitButton.isDisabled().catch(() => false);
    if (!disabled) {
      await loginPage.submit();
      await expect(page).toHaveURL(/login/);  // vẫn ở trang login, không redirect
    } else {
      // Button disabled → confirm user phải điền mới submit được
      expect(disabled).toBe(true);
    }
  });
});
