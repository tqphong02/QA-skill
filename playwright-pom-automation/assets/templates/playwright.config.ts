import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config chuẩn (generic).
 * Đổi baseURL / projects / reporter theo project thật.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // cấm test.only trên CI
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  // Reporter: list (console) + HTML + JUnit + Allure (bật allure-playwright khi đã cài).
  // Allure raw results → reports/allure-results; HTML generate bằng:
  //   allure generate reports/allure-results -o reports/allure-report --clean
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    // ['allure-playwright', { outputFolder: 'reports/allure-results' }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // { name: 'setup', testMatch: /.*\.setup\.ts/ }, // login → storageState (nếu cần)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // dependencies: ['setup'], // chạy sau setup project
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } }, // Safari support
  ],
});
