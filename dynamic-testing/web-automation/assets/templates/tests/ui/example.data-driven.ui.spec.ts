import { test, expect } from '../../fixtures/pom';
import { LoginPage } from '../../pages/example.page';
import { loginValidationCases } from '../../test-data/cases/login.cases';

test.describe('Login validation data-driven @ui @data-driven', () => {
  for (const data of loginValidationCases) {
    test(`${data.id} — rejects ${data.emailDomain}`, async ({ page, testData }) => {
      const loginPage = new LoginPage(page);
      const email = testData.uniqueEmail(data.emailDomain);

      await test.step(`Open login for ${data.id}`, async () => {
        await loginPage.open();
      });

      await test.step('Submit an isolated invalid identity', async () => {
        await loginPage.login(email, data.password);
      });

      await test.step('Verify the configured error rule', async () => {
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
