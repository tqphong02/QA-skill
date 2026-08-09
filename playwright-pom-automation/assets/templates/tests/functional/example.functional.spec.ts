import { test, expect } from '../../fixtures/data-driven';
// import { allure } from 'allure-playwright';
import { LoginPage } from '../../pages/example.page';
import { DashboardPage } from '../../pages/dashboard.page';

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
  test('UI login → lọc dữ liệu qua POM → đối chiếu API', async ({
    page,
    authenticatedApi,
    workerAccount,
    testData,
  }) => {
    const searchValue = testData.uniqueString('qa-search');

    // 1. UI: login
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(workerAccount.email, workerAccount.password);
    await expect(page).toHaveURL(/dashboard/i);

    // 2. UI: mọi selector đi qua DashboardPage
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.filterBy(searchValue);
    await expect(dashboardPage.filterInput).toHaveValue(searchValue);

    // 3. Cross-verify cùng điều kiện qua API
    const res = await authenticatedApi.get(`/orders?search=${encodeURIComponent(searchValue)}`);
    expect(res.status()).toBe(200);
  });
});
