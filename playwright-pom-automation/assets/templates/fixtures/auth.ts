import { test as base, type Page, type APIRequestContext, type APIResponse, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { ApiClient } from './api-client';

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
    email: process.env.TEST_USER ?? '<ADMIN_TEST_COM>', // ← AI fill
    password: process.env.TEST_PASS ?? '<ADMIN_123>',   // ← AI fill
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Helper: login qua API, lưu storageState (cho UI tests)
// ─────────────────────────────────────────────────────────────
export async function setupStorageState(): Promise<string> {
  const sessionDir = path.dirname(AUTH_CONFIG.storageStatePath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Nếu đã có session hợp lệ → reuse
  if (fs.existsSync(AUTH_CONFIG.storageStatePath)) {
    return AUTH_CONFIG.storageStatePath;
  }

  // Login qua API → lấy token → set vào localStorage/cookie
  const browser = await (await import('@playwright/test')).chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const api = new ApiClient(page.request, AUTH_CONFIG.apiBaseUrl);
  const res = await api.post(AUTH_CONFIG.loginPath, AUTH_CONFIG.credentials);
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
  await context.storageState({ path: AUTH_CONFIG.storageStatePath });
  await browser.close();

  return AUTH_CONFIG.storageStatePath;
}

// ─────────────────────────────────────────────────────────────
// Custom fixtures — extend base test với auth helpers
// ─────────────────────────────────────────────────────────────
type AuthFixtures = {
  authenticatedPage: Page;       // Page đã login (UI test)
  apiToken: string;              // Token cho API call
  authenticatedApi: ApiClient;   // ApiClient kèm token
};

export const test = base.extend<AuthFixtures>({
  // ─── Fixture: apiToken ───────────────────────────────────
  // Login 1 lần per worker, share token cho mọi test trong file
  apiToken: async ({ request }: { request: APIRequestContext }, use: (r: string) => Promise<void>) => {
    const api = new ApiClient(request, AUTH_CONFIG.apiBaseUrl);
    const res = await api.post(AUTH_CONFIG.loginPath, AUTH_CONFIG.credentials);
    expect(res.status()).toBe(200);
    const token = (await res.json()).accessToken as string;
    await use(token);
  },

  // ─── Fixture: authenticatedApi ───────────────────────────
  authenticatedApi: async ({ request }: { request: APIRequestContext }, use: (r: ApiClient) => Promise<void>) => {
    const api = new ApiClient(request, AUTH_CONFIG.apiBaseUrl);
    const loginRes = await api.post(AUTH_CONFIG.loginPath, AUTH_CONFIG.credentials);
    expect(loginRes.status()).toBe(200);
    const token = (await loginRes.json()).accessToken as string;

    // Wrap api với token mặc định — không cần truyền token mỗi lần
    const authedApi = new AuthedApiClient(request, AUTH_CONFIG.apiBaseUrl, token);
    await use(authedApi);
  },

  // ─── Fixture: authenticatedPage ─────────────────────────
  // Browser context với storageState đã login
  authenticatedPage: async ({ browser }, use: (r: Page) => Promise<void>) => {
    const storageState = await setupStorageState();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await use(page);
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