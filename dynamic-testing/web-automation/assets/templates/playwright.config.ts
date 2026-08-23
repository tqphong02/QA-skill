import { defineConfig, devices } from '@playwright/test';
import {
  configuredPool,
  packageProjectKey,
  poolCapacity,
} from './fixtures/parallel-pool.js';

// Set once in the config process; every worker inherits the same run ID.
process.env.RUN_ID ??= process.env.QA_RUN_ID ?? `local-${Date.now()}-${process.pid}`;
process.env.QA_RUN_ID ??= process.env.RUN_ID;
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

function resolveWorkers(): number {
  if (!process.env.PW_WORKERS) {
    const projectRoot = process.cwd();
    const projectKey = packageProjectKey(projectRoot);
    const accountPool = configuredPool('ACCOUNTS', projectKey);
    const datasetPool = configuredPool('DATASETS', projectKey);
    const accountCapacity = poolCapacity(accountPool?.raw, 'ACCOUNTS', projectRoot);
    const datasetCapacity = poolCapacity(datasetPool?.raw, 'DATASETS', projectRoot);
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

  // Reporter outputs are fixed. The Allure result shape is enforced by
  // scripts/verify-allure-contract.mjs after every deterministic run.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'evidence/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['json', { outputFile: 'reports/playwright.json' }],
    ['allure-playwright', {
      resultsDir: 'reports/allure-results',
      detail: true,
      suiteTitle: false,
    }],
  ],

  use: {
    baseURL: process.env.UI_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000',
    // The POM fixture owns the canonical evidence-image attachment. Keep the
    // Playwright screenshot reporter off to avoid a second screenshot format.
    trace: unifiedEvidence ? 'on' : 'retain-on-failure',
    screenshot: 'off',
    // The POM fixture closes the page and attaches this recording as
    // evidence-video, so PASS and FAILED have the same visible media contract.
    video: 'on',
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
