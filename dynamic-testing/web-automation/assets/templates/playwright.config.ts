import { defineConfig, devices } from '@playwright/test';

// Set once in the config process; every worker inherits the same run ID.
process.env.RUN_ID ??= `local-${Date.now()}-${process.pid}`;
// Evidence is on by default for direct `npm test` as well as the unified runner.
// Explicitly set QA_UNIFIED_EVIDENCE=false only for local debugging.
const unifiedEvidence = process.env.QA_UNIFIED_EVIDENCE !== 'false';

function resolveRetries(): number {
  if (!process.env.CI) return 0;
  const retries = Number.parseInt(process.env.PW_RETRIES ?? '1', 10);
  if (!Number.isInteger(retries) || retries < 0 || retries > 2) {
    throw new Error(`PW_RETRIES must be an integer from 0 to 2, received: ${process.env.PW_RETRIES}`);
  }
  return retries;
}

function poolCapacity(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') {
      const sizes = Object.values(parsed).filter(Array.isArray).map(items => items.length);
      return sizes.length > 0 ? Math.min(...sizes) : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

function configuredPool(kind: 'ACCOUNTS' | 'DATASETS'): string | undefined {
  const projectKey = (process.env.QA_PROJECT_KEY ?? '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return process.env[`QA_TEST_${kind}_JSON`]
    ?? process.env[`TEST_${kind}_JSON`]
    ?? (projectKey ? process.env[`${projectKey}_TEST_${kind}_JSON`] : undefined);
}

function resolveWorkers(): number {
  if (!process.env.PW_WORKERS) {
    const accountCapacity = poolCapacity(configuredPool('ACCOUNTS'));
    const datasetCapacity = poolCapacity(configuredPool('DATASETS'));
    const safeCapacity = Math.min(accountCapacity, datasetCapacity, 4);
    return safeCapacity >= 2 ? safeCapacity : 1;
  }
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
  // Test files can run concurrently. Keep each generated business module in
  // declared order unless that module explicitly proves per-test isolation.
  fullyParallel: false,
  forbidOnly: !!process.env.CI, // cấm test.only trên CI
  retries: resolveRetries(),
  // Override locally/CI with PW_WORKERS. Parallel mutating tests must have
  // isolated runtime data and, when needed, one account per parallel slot.
  workers: resolveWorkers(),
  outputDir: 'evidence/test-results',

  // Reporter: list (console) + HTML + JUnit + Allure (bật allure-playwright khi đã cài).
  // Allure raw results → reports/allure-results; HTML generate bằng:
  //   allure generate reports/allure-results -o reports/allure-report --clean
  reporter: [
    ['list'],
    ['html', { outputFolder: 'evidence/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['json', { outputFile: 'reports/playwright.json' }],
    ['allure-playwright', { outputFolder: 'reports/allure-results' }],
  ],

  use: {
    baseURL: process.env.UI_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000',
    // Unified testcase execution records browser evidence for PASS and FAILED
    trace: unifiedEvidence ? 'on' : 'retain-on-failure',
    screenshot: unifiedEvidence ? 'on' : 'only-on-failure',
    video: unifiedEvidence ? 'on' : 'retain-on-failure',
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
