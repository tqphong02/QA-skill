import { test as base, expect, type TestInfo } from '@playwright/test';
import { ApiClient } from './api-client';
import {
  AUTH_CONFIG,
  AuthedApiClient,
  apiTokenFor,
  resolveWorkerAccount,
  type TestAccount,
} from './auth';
import { createTestData, type TestData } from './data-driven';
import {
  bindPomRuntime,
  createPomRuntimeContext,
  type PomRuntimeContext,
} from './runtime-context';
import {
  addCanonicalAllureParameters,
  canonicalAccountLabel,
  captureCanonicalUiEvidence,
} from './allure-contract';

export type PomFixtures = {
  pomRuntime: PomRuntimeContext;
  testData: TestData;
  workerAccount: TestAccount;
  api: ApiClient;
  authenticatedApi: ApiClient;
  canonicalAllure: void;
};

function asyncUiTestTimeout(): number {
  const configured = [
    'UI_WAIT_TIMEOUT_MS',
    'UPLOAD_WAIT_TIMEOUT_MS',
    'PROCEDURE_WAIT_TIMEOUT_MS',
    'DSL_GENERATION_TIMEOUT_MS',
    'RUN_WAIT_TIMEOUT_MS',
  ].map(name => Number.parseInt(process.env[name] ?? '0', 10))
    .filter(value => Number.isInteger(value) && value > 0);
  const bound = Math.max(120_000, ...configured);
  return Math.min(bound + 30_000, 900_000);
}

function annotateApiRequest(testInfo: TestInfo, client: ApiClient): void {
  const request = client.lastRequest();
  if (!request) return;
  testInfo.annotations.push({
    type: 'qa-api-request',
    description: JSON.stringify(request),
  });
}

function lastApiUrl(testInfo: TestInfo): string | undefined {
  const annotation = [...testInfo.annotations]
    .reverse()
    .find(item => item.type === 'qa-api-request' && item.description);
  if (!annotation?.description) return undefined;
  try {
    const parsed = JSON.parse(annotation.description) as { url?: unknown };
    return typeof parsed.url === 'string' ? parsed.url : undefined;
  } catch {
    return undefined;
  }
}

function fallbackUrl(testInfo: TestInfo): string {
  if (/\@api\b/.test(testInfo.title)) {
    return process.env.API_BASE_URL ?? 'http://localhost:3000';
  }
  return String(
    testInfo.project.use?.baseURL
      ?? process.env.UI_BASE_URL
      ?? process.env.BASE_URL
      ?? 'http://localhost:3000',
  );
}

/**
 * The sole public fixture graph for generated UI, API and functional specs.
 * Auth/data helpers do not export another Playwright test object, so one owner
 * controls runtime isolation and canonical Allure/page evidence.
 */
export const test = base.extend<PomFixtures>({
  pomRuntime: [
    async ({}, use, testInfo) => {
      const runtime = createPomRuntimeContext(testInfo);
      testInfo.annotations.push({
        type: 'qa-runtime',
        description: JSON.stringify({
          testcase_id: runtime.testcaseId,
          role: runtime.role,
          namespace: runtime.namespace,
          account_slot: runtime.accountSlot,
          dataset_slot: runtime.datasetSlot,
        }),
      });
      await testInfo.attach('qa-runtime-context', {
        body: Buffer.from(JSON.stringify({
          testcase_id: runtime.testcaseId,
          role: runtime.role,
          mutates: runtime.mutates,
          namespace: runtime.namespace,
          parallel_index: runtime.parallelIndex,
          worker_index: runtime.workerIndex,
          account_slot: runtime.accountSlot,
          dataset_slot: runtime.datasetSlot,
          manifest: runtime.manifestPath,
        }, null, 2)),
        contentType: 'application/json',
      });
      await use(runtime);
    },
    { auto: true },
  ],

  canonicalAllure: [
    async ({ pomRuntime }, use, testInfo) => {
      await use();
      const alreadyCaptured = testInfo.annotations.some(
        annotation => annotation.type === 'qa-allure-contract',
      );
      if (alreadyCaptured) return;
      await addCanonicalAllureParameters({
        account: canonicalAccountLabel({
          accountSlot: pomRuntime.accountSlot,
          role: pomRuntime.role,
          parallelIndex: pomRuntime.parallelIndex,
        }),
        url: lastApiUrl(testInfo) ?? fallbackUrl(testInfo),
        evidenceImage: 'N/A',
        evidenceVideo: 'N/A',
        testcaseId: pomRuntime.testcaseId,
        runId: process.env.QA_RUN_ID ?? process.env.RUN_ID ?? 'N/A',
        role: pomRuntime.role,
        browser: testInfo.project.name,
        appBuild: process.env.QA_APP_BUILD ?? process.env.APP_BUILD ?? 'N/A',
      });
      testInfo.annotations.push({
        type: 'qa-allure-contract',
        description: JSON.stringify({
          contract: 'allure-canonical-v1',
          account: canonicalAccountLabel(pomRuntime),
          url: lastApiUrl(testInfo) ?? fallbackUrl(testInfo),
          evidence_image: 'N/A',
          evidence_video: 'N/A',
        }),
      });
    },
    { auto: true },
  ],

  testData: async ({ pomRuntime }, use, testInfo) => {
    await use(createTestData(pomRuntime, testInfo));
  },

  workerAccount: async ({ pomRuntime }, use, testInfo) => {
    const account = resolveWorkerAccount({
      role: pomRuntime.role,
      parallelIndex: pomRuntime.parallelIndex,
      workers: Math.max(1, testInfo.config.workers),
    });
    await use(account);
  },

  api: async ({ request }, use, testInfo) => {
    const client = new ApiClient(request, AUTH_CONFIG.apiBaseUrl);
    try {
      await use(client);
    } finally {
      annotateApiRequest(testInfo, client);
    }
  },

  authenticatedApi: async ({ request, workerAccount }, use, testInfo) => {
    const token = await apiTokenFor(workerAccount);
    const client = new AuthedApiClient(request, AUTH_CONFIG.apiBaseUrl, token);
    try {
      await use(client);
    } finally {
      annotateApiRequest(testInfo, client);
    }
  },

  storageState: async ({ pomRuntime }, use) => {
    await use(pomRuntime.storageStatePath ?? { cookies: [], origins: [] });
  },

  page: async ({ context, pomRuntime }, use, testInfo) => {
    const page = await context.newPage();
    bindPomRuntime(page, pomRuntime);
    await use(page);
    await captureCanonicalUiEvidence({ page, runtime: pomRuntime, testInfo });
    if (process.env.QA_SELECTOR_EVIDENCE_CAPTURE === 'true') {
      await testInfo.attach('selector-runtime-evidence', {
        body: Buffer.from(JSON.stringify({
          schema_version: 1,
          testcase_id: pomRuntime.testcaseId,
          role: pomRuntime.role,
          targets: pomRuntime.selectorEvidenceSnapshot(),
        }, null, 2)),
        contentType: 'application/json',
      });
    }
  },
});

test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, asyncUiTestTimeout()));
});

export { expect };
export type { PomRuntimeContext, TestAccount, TestData };
