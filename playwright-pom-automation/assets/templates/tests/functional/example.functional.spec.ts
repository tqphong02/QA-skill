import { test, expect } from '@playwright/test';
// import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';
import { ApiClient } from '../../fixtures/api-client';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

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
  let api: ApiClient;
  let token: string;
  let orderId: string | number | undefined;

  test.beforeAll(async ({ request }) => {
    api = new ApiClient(request, API_BASE);
    const res = await api.post('/auth/login', {
      email: process.env.TEST_USER,
      password: process.env.TEST_PASS,
    });
    token = (await res.json()).accessToken;
  });

  test.afterAll(async () => {
    if (orderId !== undefined) await api.delete(`/orders/${orderId}`, token);
  });

  test('UI login → tạo order qua UI → verify qua API → UI', async ({ page, request }) => {
    // 1. UI: login
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(process.env.TEST_USER!, process.env.TEST_PASS!);
    await expect(page).toHaveURL(/dashboard/i);

    // 2. UI: tạo order (flow nghiệp vụ)
    await page.goto('/orders/new');
    await page.getByRole('textbox', { name: /item/i }).fill('QA Test Item');
    await page.getByRole('spinbutton', { name: /quantity/i }).fill('2');
    await page.getByRole('button', { name: /create|submit|add/i }).click();

    // 3. Verify UI: order xuất hiện ở list
    await expect(page.getByText('QA Test Item')).toBeVisible();
    const idText = await page.getByTestId('order-id').first().innerText();
    orderId = idText.replace(/[^\d]/g, '');

    // 4. Cross-verify qua API: order thật sự persist ở backend
    const apiCheck = new ApiClient(request, API_BASE);
    const res = await apiCheck.get(`/orders/${orderId}`, token);
    expect(res.status()).toBe(200);
    expect((await res.json()).item).toBe('QA Test Item');
    // Cleanup chạy ở afterAll
  });
});
