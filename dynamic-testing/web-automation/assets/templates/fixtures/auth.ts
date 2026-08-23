import {
  test as base,
  request as playwrightRequest,
  type Page,
  type APIRequestContext,
  type APIResponse,
  type WorkerInfo,
  expect,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ApiClient } from './api-client';
import {
  addCanonicalAllureParameters,
  captureCanonicalUiEvidence,
  canonicalAccountLabel,
} from './allure-contract';

/**
 * Auth Fixture Template — quản lý authentication cho cả suite.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project
 *   2. Sửa AUTH_CONFIG theo project (login URL, credentials, storage path)
 *   3. Reuse `authenticatedPage` fixture trong mọi test cần login
 *
 * 2 patterns:
 *  - **Storage state** (UI): login 1 lần, save storageState → reuse cho nhiều test
 *  - **API token** (API call): login qua API, share token trong test
 */

// ─────────────────────────────────────────────────────────────
// CONFIG — AI FILL theo project
// ─────────────────────────────────────────────────────────────
const AUTH_CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  loginPath: '/auth/login', // ← AI fill endpoint login của project
  storageStatePath: path.resolve(__dirname, '../sessions/auth-storage.json'),
  credentials: {
    // CI preflight requires real values; these non-secret sentinels prevent
    // unresolved source placeholders from masking the missing-input error.
    email: process.env.TEST_USER ?? 'ci-user-required',
    password: process.env.TEST_PASS ?? 'ci-credential-required',
  },
} as const;

export type TestAccount = Readonly<{
  email: string;
  password: string;
}>;

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'default';
}

function resolveWorkerAccount(workerInfo: WorkerInfo): TestAccount {
  const rawPool = process.env.TEST_ACCOUNTS_JSON;
  if (!rawPool) return AUTH_CONFIG.credentials;

  let accounts: TestAccount[];
  try {
    accounts = JSON.parse(rawPool) as TestAccount[];
  } catch {
    throw new Error('TEST_ACCOUNTS_JSON must be a valid JSON array of { email, password }');
  }

  const invalid = !Array.isArray(accounts) || accounts.some(
    (account) => !account || typeof account.email !== 'string' || typeof account.password !== 'string',
  );
  if (invalid) {
    throw new Error('TEST_ACCOUNTS_JSON must contain only { email, password } objects');
  }

  const account = accounts[workerInfo.parallelIndex];
  if (!account) {
    throw new Error(
      `TEST_ACCOUNTS_JSON has ${accounts.length} account(s), but parallel slot `
      + `${workerInfo.parallelIndex} needs its own account; do not cycle shared accounts`,
    );
  }
  return account;
}

// ─────────────────────────────────────────────────────────────
// Helper: login qua API, lưu storageState (cho UI tests)
// ─────────────────────────────────────────────────────────────
export async function setupStorageState(
  credentials: TestAccount = AUTH_CONFIG.credentials,
  storageStatePath = AUTH_CONFIG.storageStatePath,
): Promise<string> {
  const sessionDir = path.dirname(storageStatePath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Nếu đã có session hợp lệ → reuse
  if (fs.existsSync(storageStatePath)) {
    return storageStatePath;
  }

  // Login qua API → lấy token → set vào localStorage/cookie
  const browser = await (await import('@playwright/test')).chromium.launch();
  const context = await browser.newContext({
    baseURL: process.env.UI_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000',
  });
  const page = await context.newPage();

  const api = new ApiClient(page.request, AUTH_CONFIG.apiBaseUrl);
  const res = await api.post(AUTH_CONFIG.loginPath, credentials);
  expect(res.status()).toBe(200);
  const { accessToken } = await res.json();

  // Set token vào localStorage/cookie tùy project
  await page.goto('/'); // về base URL trước
  await page.evaluate(
    ({ token }) => {
      localStorage.setItem('accessToken', token);
    },
    { token: accessToken },
  );

  // Save storageState
  await context.storageState({ path: storageStatePath });
  await browser.close();

  return storageStatePath;
}

// ─────────────────────────────────────────────────────────────
// Custom fixtures — extend base test với auth helpers
// ─────────────────────────────────────────────────────────────
type AuthFixtures = {
  authenticatedPage: Page;       // Page đã login (UI test)
  authenticatedApi: ApiClient;   // ApiClient kèm token
  canonicalAllure: void;
};

type AuthWorkerFixtures = {
  workerAccount: TestAccount;    // Account riêng cho parallel slot khi có pool
  apiToken: string;              // Token login 1 lần per worker
  workerStorageStatePath: string;// Storage state riêng cho worker/run
};

export const test = base.extend<AuthFixtures, AuthWorkerFixtures>({
  // Every fixture-based test gets the four parameter names. UI tests replace
  // the N/A media values in the page teardown below; API tests keep N/A.
  canonicalAllure: [
    async ({}, use, testInfo) => {
      await use();
      const hasCanonicalMetadata = testInfo.annotations.some(
        annotation => annotation.type === 'qa-allure-contract',
      );
      if (hasCanonicalMetadata) return;
      await addCanonicalAllureParameters({
        account: canonicalAccountLabel({
          accountSlot: process.env.QA_ALLURE_ACCOUNT ?? `account-slot-${testInfo.parallelIndex}`,
          parallelIndex: testInfo.parallelIndex,
        }),
        url: process.env.API_BASE_URL
          ?? process.env.UI_BASE_URL
          ?? process.env.BASE_URL
          ?? 'http://localhost:3000',
        evidenceImage: 'N/A',
        evidenceVideo: 'N/A',
        testcaseId: testInfo.title.match(/\bTC-[A-Za-z0-9_-]+\b/)?.[0],
        runId: process.env.QA_RUN_ID ?? process.env.RUN_ID ?? 'N/A',
        role: process.env.QA_ROLE ?? 'default',
        browser: testInfo.project.name,
        appBuild: process.env.QA_APP_BUILD ?? process.env.APP_BUILD ?? 'N/A',
      });
    },
    { auto: true },
  ],

  // Override the default page fixture so data-driven/legacy fixture tests use
  // the same canonical image/video evidence as manifest-generated POM tests.
  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();
    await use(page);
    await captureCanonicalUiEvidence({
      page,
      runtime: {
        accountSlot: `account-slot-${testInfo.parallelIndex}`,
        role: process.env.QA_ROLE ?? 'default',
        testcaseId: testInfo.title.match(/\bTC-[A-Za-z0-9_-]+\b/)?.[0],
        parallelIndex: testInfo.parallelIndex,
      },
      testInfo,
    });
  },

  // ─── Fixture: workerAccount ───────────────────────────────
  workerAccount: [
    async ({}, use, workerInfo) => {
      await use(resolveWorkerAccount(workerInfo));
    },
    { scope: 'worker' },
  ],

  // ─── Fixture: apiToken ───────────────────────────────────
  // Worker fixture không được phụ thuộc Playwright `request` test fixture.
  apiToken: [
    async ({ workerAccount }, use) => {
      const requestContext = await playwrightRequest.newContext();
      try {
        const api = new ApiClient(requestContext, AUTH_CONFIG.apiBaseUrl);
        const res = await api.post(AUTH_CONFIG.loginPath, workerAccount);
        expect(res.status()).toBe(200);
        const token = (await res.json()).accessToken as string;
        await use(token);
      } finally {
        await requestContext.dispose();
      }
    },
    { scope: 'worker' },
  ],

  // ─── Fixture: workerStorageStatePath ─────────────────────
  workerStorageStatePath: [
    async ({ workerAccount }, use, workerInfo) => {
      const runId = safeFileSegment(process.env.RUN_ID ?? `local-${process.pid}`);
      const project = safeFileSegment(workerInfo.project.name);
      const storagePath = path.resolve(
        __dirname,
        `../sessions/auth-${runId}-${project}-p${workerInfo.parallelIndex}-w${workerInfo.workerIndex}.json`,
      );
      await use(await setupStorageState(workerAccount, storagePath));
    },
    { scope: 'worker' },
  ],

  // ─── Fixture: authenticatedApi ───────────────────────────
  authenticatedApi: async ({ request, apiToken }, use: (r: ApiClient) => Promise<void>) => {
    // Wrap api với token mặc định — không cần truyền token mỗi lần
    const authedApi = new AuthedApiClient(request, AUTH_CONFIG.apiBaseUrl, apiToken);
    await use(authedApi);
  },

  // ─── Fixture: authenticatedPage ─────────────────────────
  // Browser context mới per test, storageState riêng per worker/run
  authenticatedPage: async ({ browser, workerStorageStatePath }, use: (r: Page) => Promise<void>, testInfo) => {
    const context = await browser.newContext({ storageState: workerStorageStatePath });
    const page = await context.newPage();
    await use(page);
    await captureCanonicalUiEvidence({
      page,
      runtime: {
        accountSlot: `account-slot-${testInfo.parallelIndex}`,
        role: process.env.QA_ROLE ?? 'default',
        testcaseId: testInfo.title.match(/\bTC-[A-Za-z0-9_-]+\b/)?.[0],
        parallelIndex: testInfo.parallelIndex,
      },
      testInfo,
    });
    await context.close();
  },
});

// ─────────────────────────────────────────────────────────────
// AuthedApiClient — wrapper có sẵn token
// ─────────────────────────────────────────────────────────────
class AuthedApiClient extends ApiClient {
  constructor(
    request: APIRequestContext,
    baseUrl: string,
    private readonly token: string,
  ) {
    super(request, baseUrl);
  }

  override get(path: string): Promise<APIResponse> {
    return super.get(path, this.token);
  }
  override post(path: string, body: unknown): Promise<APIResponse> {
    return super.post(path, body, this.token);
  }
  override put(path: string, body: unknown): Promise<APIResponse> {
    return super.put(path, body, this.token);
  }
  override patch(path: string, body: unknown): Promise<APIResponse> {
    return super.patch(path, body, this.token);
  }
  override delete(path: string): Promise<APIResponse> {
    return super.delete(path, this.token);
  }
}

export { expect };
