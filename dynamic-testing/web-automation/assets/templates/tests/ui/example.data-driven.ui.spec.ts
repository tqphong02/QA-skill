import { allure } from 'allure-playwright';
import { test, expect } from '../../fixtures/data-driven';
import { LoginPage } from '../../pages/example.page';
import { loginValidationCases } from '../../test-data/cases/login.cases';

test.describe('Login validation data-driven @ui @data-driven', () => {
  for (const data of loginValidationCases) {
    test(`${data.id} — rejects ${data.emailDomain}`, async ({ page, testData }) => {
      allure.severity('normal');
      allure.feature('Login');
      allure.story('Data-driven invalid credentials');

      const loginPage = new LoginPage(page);
      const email = testData.uniqueEmail(data.emailDomain);

      await allure.step(`Open login for ${data.id}`, async () => {
        await loginPage.open();
      });

      await allure.step('Submit an isolated invalid identity', async () => {
        await loginPage.login(email, data.password);
      });

      await allure.step('Verify the configured error rule', async () => {
        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toHaveText(data.expectedError);
      });

      await test.info().attach('data-namespace', {
        body: Buffer.from(testData.namespace),
        contentType: 'text/plain',
      });
    });
  }
});
