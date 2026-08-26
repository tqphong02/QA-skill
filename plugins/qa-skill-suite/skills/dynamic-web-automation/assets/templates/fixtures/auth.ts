import fs from 'node:fs';
import path from 'node:path';
import {
  chromium,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { ApiClient } from './api-client';
import {
  assertParallelPool,
  assertPoolCapacity,
  configuredPool,
  packageProjectKey,
  selectPoolSlots,
} from './parallel-pool.js';

export const AUTH_CONFIG = {
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  loginPath: process.env.API_LOGIN_PATH ?? '/auth/login',
  storageStatePath: path.resolve(__dirname, '../sessions/auth-storage.json'),
} as const;

export type TestCredentials = Readonly<{
  email: string;
  password: string;
}>;

export type TestAccount = TestCredentials & Readonly<{
  id: string;
  role: string;
}>;

type AccountSlot = Record<string, unknown> & {
  id?: string;
  role?: string;
  roles?: string[];
  email?: string;
  password?: string;
};

export type WorkerAccountOptions = Readonly<{
  parallelIndex: number;
  workers: number;
  role: string;
  projectRoot?: string;
}>;

function safeLabel(value: unknown, fallback: string): string {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

/**
 * Select the credential row that owns the current parallel slot.
 * This is deliberately a helper rather than a second Playwright test fixture:
 * generated specs have exactly one public entrypoint, fixtures/pom.
 */
export function resolveWorkerAccount(options: WorkerAccountOptions): TestAccount {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const projectKey = packageProjectKey(projectRoot);
  const accountEnvironment = configuredPool('ACCOUNTS', projectKey);
  const workers = Math.max(1, options.workers);
  const role = options.role.trim() || 'default';

  if (!accountEnvironment) {
    if (workers > 1) {
      throw new Error(
        'UNTEST: parallel authenticated tests require one account per worker in '
        + `${projectKey}_TEST_ACCOUNTS_JSON, QA_TEST_ACCOUNTS_JSON or TEST_ACCOUNTS_JSON`,
      );
    }
    const email = process.env.TEST_USER?.trim() ?? '';
    const password = process.env.TEST_PASS ?? '';
    if (!email || !password) {
      throw new Error(
        'UNTEST: authenticatedApi/workerAccount requires TEST_USER and TEST_PASS '
        + 'or an account pool with email/password',
      );
    }
    return Object.freeze({ id: 'legacy-account-0', role, email, password });
  }

  assertParallelPool(
    accountEnvironment.raw,
    workers,
    accountEnvironment.name,
    'ACCOUNTS',
    projectRoot,
  );
  const accounts = selectPoolSlots(
    accountEnvironment.raw,
    accountEnvironment.name,
    role,
    true,
  ) as AccountSlot[];
  assertPoolCapacity(accounts, workers, accountEnvironment.name, 'ACCOUNTS', projectRoot);

  const account = accounts[options.parallelIndex];
  if (!account) {
    throw new Error(
      `UNTEST: ${accountEnvironment.name} has ${accounts.length} account(s), but parallel slot `
      + `${options.parallelIndex} needs its own account`,
    );
  }
  const email = typeof account.email === 'string' ? account.email.trim() : '';
  const password = typeof account.password === 'string' ? account.password : '';
  if (!email || !password) {
    throw new Error(
      `UNTEST: ${accountEnvironment.name} slot ${options.parallelIndex} for role ${role} `
      + 'must contain email and password',
    );
  }

  return Object.freeze({
    id: safeLabel(account.id, `account-slot-${options.parallelIndex}`),
    role,
    email,
    password,
  });
}

export class AuthedApiClient extends ApiClient {
  constructor(
    request: APIRequestContext,
    baseUrl: string,
    private readonly token: string,
  ) {
    super(request, baseUrl, token);
  }

  override get(requestPath: string): Promise<APIResponse> {
    return super.get(requestPath, this.token);
  }

  override post(requestPath: string, body: unknown): Promise<APIResponse> {
    return super.post(requestPath, body, this.token);
  }

  override put(requestPath: string, body: unknown): Promise<APIResponse> {
    return super.put(requestPath, body, this.token);
  }

  override patch(requestPath: string, body: unknown): Promise<APIResponse> {
    return super.patch(requestPath, body, this.token);
  }

  override delete(requestPath: string): Promise<APIResponse> {
    return super.delete(requestPath, this.token);
  }
}

const workerTokenCache = new Map<string, Promise<string>>();

async function loginForToken(account: TestAccount): Promise<string> {
  const requestContext = await playwrightRequest.newContext();
  try {
    const api = new ApiClient(requestContext, AUTH_CONFIG.apiBaseUrl);
    const response = await api.post(AUTH_CONFIG.loginPath, {
      email: account.email,
      password: account.password,
    });
    if (response.status() !== 200) {
      throw new Error(`UNTEST: API login returned HTTP ${response.status()}`);
    }
    const body = await response.json() as { accessToken?: unknown };
    if (typeof body.accessToken !== 'string' || !body.accessToken) {
      throw new Error('UNTEST: API login response does not contain a non-empty accessToken');
    }
    return body.accessToken;
  } finally {
    await requestContext.dispose();
  }
}

/** Login once per worker process/account without exposing the token to reports. */
export async function apiTokenFor(account: TestAccount): Promise<string> {
  const cacheKey = `${AUTH_CONFIG.apiBaseUrl}\u0000${account.role}\u0000${account.id}\u0000${account.email}`;
  let pending = workerTokenCache.get(cacheKey);
  if (!pending) {
    pending = loginForToken(account);
    workerTokenCache.set(cacheKey, pending);
  }
  try {
    return await pending;
  } catch (error) {
    workerTokenCache.delete(cacheKey);
    throw error;
  }
}

/**
 * Optional project bootstrap helper for a UI storage state. Runtime tests still
 * consume the project-local storageState selected by fixtures/runtime-context.
 */
export async function setupStorageState(
  credentials: TestCredentials,
  storageStatePath = AUTH_CONFIG.storageStatePath,
): Promise<string> {
  const resolvedPath = path.resolve(storageStatePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  if (fs.existsSync(resolvedPath)) return resolvedPath;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: process.env.UI_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000',
    });
    try {
      const page = await context.newPage();
      const api = new ApiClient(page.request, AUTH_CONFIG.apiBaseUrl);
      const response = await api.post(AUTH_CONFIG.loginPath, credentials);
      if (response.status() !== 200) {
        throw new Error(`UNTEST: API login returned HTTP ${response.status()}`);
      }
      const body = await response.json() as { accessToken?: unknown };
      if (typeof body.accessToken !== 'string' || !body.accessToken) {
        throw new Error('UNTEST: API login response does not contain a non-empty accessToken');
      }
      await page.goto('/');
      await page.evaluate(({ token }) => {
        localStorage.setItem('accessToken', token);
      }, { token: body.accessToken });
      await context.storageState({ path: resolvedPath });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return resolvedPath;
}
