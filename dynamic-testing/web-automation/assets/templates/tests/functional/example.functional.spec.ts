import { z } from 'zod';
import { test, expect } from '../../fixtures/pom';
import { ApiClient } from '../../fixtures/api-client';
import { LoginPage } from '../../pages/example.page';
import { DashboardPage } from '../../pages/dashboard.page';

const OrderListSchema = z.array(z.object({
  id: z.union([z.string(), z.number()]),
}));

test.describe.serial('Order flow @functional', () => {
  test('TC-FUNCTIONAL-ORDERS-SEARCH-001 | search orders through UI and API @functional', async ({
    page,
    authenticatedApi,
    workerAccount,
    testData,
  }) => {
    test.info().annotations.push(
      {
        type: 'api-operation',
        description: '[TC-FUNCTIONAL-ORDERS-SEARCH-001:API] GET /orders searchOrders',
      },
      { type: 'contract', description: '[TC-FUNCTIONAL-ORDERS-SEARCH-001:ROLE] admin' },
    );
    const searchValue = testData.uniqueString('qa-search');

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(workerAccount.email, workerAccount.password);
    await expect(page).toHaveURL(/dashboard/i);

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.filterBy(searchValue);
    await expect(dashboardPage.filterInput).toHaveValue(searchValue);

    const response = await authenticatedApi.get(`/orders?search=${encodeURIComponent(searchValue)}`);
    expect(response.status()).toBe(200);
    ApiClient.validate(OrderListSchema, await response.json());
  });
});
