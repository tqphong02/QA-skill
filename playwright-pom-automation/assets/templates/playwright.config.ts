import { defineConfig, devices } from '@playwright/test';

// Set once in the config process; every worker inherits the same run ID.
process.env.RUN_ID ??= `local-${Date.now()}-${process.pid}`;

function resolveRetries(): number {
  if (!process.env.CI) return 0;
  const retries = Number.parseInt(process.env.PW_RETRIES ?? '1', 10);
  if (!Number.isInteger(retries) || retries < 0 || retries > 2) {
    throw new Error(`PW_RETRIES must be an integer from 0 to 2, received: ${process.env.PW_RETRIES}`);
  }
  return retries;
}

function resolveWorkers(): number {
  if (!process.env.PW_WORKERS) return process.env.CI ? 4 : 1;
  const workers = Number.parseInt(process.env.PW_WORKERS, 10);
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(`PW_WORKERS must be a positive integer, received: ${process.env.PW_WORKERS}`);
  }
  return workers;
}

/**
 * Playwright config chuẩn (generic).
 * Đổi baseURL / projects / reporter theo project thật.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // cấm test.only trên CI
  retries: resolveRetries(),
  // Override locally/CI with PW_WORKERS. Parallel mutating tests must have
  // isolated runtime data and, when needed, one account per parallel slot.
  workers: resolveWorkers(),

  // Reporter: list (console) + HTML + JUnit + Allure (bật allure-playwright khi đã cài).
  // Allure raw results → reports/allure-results; HTML generate bằng:
  //   allure generate reports/allure-results -o reports/allure-report --clean
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['json', { outputFile: 'reports/playwright.json' }],
    ['allure-playwright', { outputFolder: 'reports/allure-results' }],
  ],

  use: {
    baseURL: process.env.UI_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
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
    ...(process.env.ENABLE_WEBKIT === 'true' ? [{
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }] : []),
  ],
});
