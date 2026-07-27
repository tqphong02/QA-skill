import { test, expect } from '../../fixtures/data-driven';
// import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';

/**
 * Functional / E2E test mẫu — tag @functional:  npx playwright test --grep @functional
 *
 * Đặc điểm (khác UI/API test):
 *  - Test theo BUSINESS FLOW end-to-end, SPAN nhiều step / nhiều page / cả UI + API.
 *  - Verify STATE CHUYỂN qua các bước (state machine), không chỉ 1 assertion cuối.
 *  - Chậm hơn UI/API test → chạy ít hơn, dùng cho critical path (regression cốt lõi).
 *
 * Phân biệt:
 *  - tests/ui      → per-page, 1 intent, nhanh
 *  - tests/api     → per-endpoint, request-level
 *  - tests/functional → full business journey (login → tạo → verify → cleanup)
 */
test.describe.serial('Order flow @functional', () => {
  test('UI login → tạo order qua UI → verify qua API → UI', async ({
    page,
    authenticatedApi,
    workerAccount,
    testData,
  }) => {
    let orderId: string | number | undefined;
    const itemName = testData.uniqueString('qa-item');

    // 1. UI: login
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(workerAccount.email, workerAccount.password);
    await expect(page).toHaveURL(/dashboard/i);

    try {
      // 2. UI: tạo order (flow nghiệp vụ)
      await page.goto('/orders/new');
      await page.getByRole('textbox', { name: /item/i }).fill(itemName);
      await page.getByRole('spinbutton', { name: /quantity/i }).fill('2');
      await page.getByRole('button', { name: /create|submit|add/i }).click();

      // 3. Verify UI: order xuất hiện ở list
      await expect(page.getByText(itemName)).toBeVisible();
      const idText = await page.getByTestId('order-id').first().innerText();
      orderId = idText.replace(/[^\d]/g, '');

      // 4. Cross-verify qua API: order thật sự persist ở backend
      const res = await authenticatedApi.get(`/orders/${orderId}`);
      expect(res.status()).toBe(200);
      expect((await res.json()).item).toBe(itemName);
    } finally {
      if (orderId !== undefined) {
        await authenticatedApi.delete(`/orders/${orderId}`);
      }
    }
  });
});
