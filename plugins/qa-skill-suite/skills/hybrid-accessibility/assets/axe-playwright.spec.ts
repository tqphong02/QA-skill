import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const targetUrl = process.env.A11Y_URL;

test.describe('accessibility baseline @a11y', () => {
  test.skip(!targetUrl, 'Set A11Y_URL to the page under test');

  test('WCAG 2.2 A and AA automated rules', async ({ page }, testInfo) => {
    await page.goto(targetUrl!);
    await page.waitForLoadState('networkidle');

    // Open required menus, dialogs, validation, or error states before analyze()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    await testInfo.attach('axe-results', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
