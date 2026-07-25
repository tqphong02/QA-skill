/**
 * Env Template — centralized environment config.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project
 *   2. Sửa ENV theo project (base URLs, credentials, feature flags)
 *   3. Import { ENV } from '../fixtures/env' trong mọi test
 *
 * Quy tắc:
 *   - KHÔNG hardcode URL/token trong test code
 *   - Tất cả env qua biến môi trường hoặc file này
 *   - Validate env khi load (fail fast nếu thiếu config)
 */

export function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(
      `Missing required env var: ${name}. Set in .env or CI secrets.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const ENV = {
  // ─── API ──────────────────────────────────────────────────
  apiBaseUrl: optional('API_BASE_URL', 'http://localhost:3000'),
  apiTimeout: Number(optional('API_TIMEOUT_MS', '30000')),

  // ─── UI ───────────────────────────────────────────────────
  uiBaseUrl: optional('UI_BASE_URL', 'http://localhost:3000'),

  // ─── Auth ─────────────────────────────────────────────────
  testUser: optional('TEST_USER', '<ADMIN_TEST_COM>'),      // ← AI fill default
  testPass: optional('TEST_PASS', '<ADMIN_123>'),           // ← AI fill default

  // ─── Feature flags ────────────────────────────────────────
  // Bật/tắt feature qua env var (vd: CI=true, DEBUG=true)
  isCI: process.env.CI === 'true',
  isDebug: process.env.DEBUG === 'true',

  // ─── Allure ───────────────────────────────────────────────
  allureResultsDir: optional('ALLURE_RESULTS_DIR', 'reports/allure-results'),

  // ─── Helpers ──────────────────────────────────────────────
  /** Get header Authorization (Bearer) */
  authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Validate required env khi load (fail fast)
// ─────────────────────────────────────────────────────────────
// Bỏ comment nếu project yêu cầu bắt buộc:
// required('API_BASE_URL');
// required('TEST_USER');
// required('TEST_PASS');

// ─────────────────────────────────────────────────────────────
// Type — giúp IDE autocomplete
// ─────────────────────────────────────────────────────────────
export type Env = typeof ENV;