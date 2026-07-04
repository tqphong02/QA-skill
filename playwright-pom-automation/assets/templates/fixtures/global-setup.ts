import { chromium, FullConfig } from '@playwright/test';
import { ApiClient } from './api-client';
import { cleanupOldSessions } from './session';
import fs from 'fs';
import path from 'path';

/**
 * Global Setup Template — chạy 1 lần TRƯỚC KHI bắt đầu test suite.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project (đã reference trong playwright.config.ts)
 *   2. Customize AUTH_URL, credentials theo project
 *   3. Setup xong: storageState sẵn sàng cho UI tests dùng
 *
 * Workflow:
 *   1. Cleanup old sessions (>7 ngày)
 *   2. Login → save storageState vào sessions/auth-storage.json
 *   3. Set RUN_ID env var để tests/cleanup track data của run này
 *
 * Lưu ý:
 *   - Chạy 1 lần per worker — KHÔNG per test
 *   - Fail ở đây → toàn bộ suite không chạy
 *   - KHÔNG dùng page fixtures ở đây (chỉ dùng standalone API)
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n[global-setup] Starting...');

  // ─────────────────────────────────────────────────────────
  // 1. Generate RUN_ID cho test data tagging
  // ─────────────────────────────────────────────────────────
  const RUN_ID = process.env.RUN_ID || `local-${Date.now()}`;
  process.env.RUN_ID = RUN_ID;
  console.log(`[global-setup] RUN_ID: ${RUN_ID}`);

  // ─────────────────────────────────────────────────────────
  // 2. Cleanup old sessions (giữ disk sạch)
  // ─────────────────────────────────────────────────────────
  try {
    const removed = cleanupOldSessions(7);
    console.log(`[global-setup] Cleaned ${removed} old session(s)`);
  } catch (e) {
    console.warn('[global-setup] Failed to cleanup old sessions:', e);
    // Không fail — best effort
  }

  // ─────────────────────────────────────────────────────────
  // 3. Setup storageState (login → save)
  // ─────────────────────────────────────────────────────────
  const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';
  const LOGIN_PATH = process.env.LOGIN_PATH ?? '/auth/login';

  // Skip storageState nếu project không cần UI auth (vd: API-only project)
  if (process.env.SKIP_STORAGE_STATE === 'true') {
    console.log('[global-setup] Skipping storageState setup (SKIP_STORAGE_STATE=true)');
    return;
  }

  try {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const api = new ApiClient(page.request, API_BASE);
    const loginRes = await api.post(LOGIN_PATH, {
      email: process.env.TEST_USER ?? '<ADMIN_TEST_COM>',
      password: process.env.TEST_PASS ?? '<ADMIN_123>',
    });

    if (loginRes.status() !== 200) {
      throw new Error(`Login failed: ${loginRes.status()} - ${await loginRes.text()}`);
    }

    const { accessToken, refreshToken } = await loginRes.json();

    // Set token vào localStorage/cookie (tùy project)
    await page.goto(config.projects[0]?.use.baseURL?.toString() ?? '/');

    // ───────────────────────────────────────────────────────
    // AI customize phần này theo cách project lưu auth:
    //   - localStorage:  await page.evaluate(...)
    //   - cookie:        await context.addCookies(...)
    //   - HttpOnly:      cần qua backend, không setup được
    // ───────────────────────────────────────────────────────
    await page.evaluate(
      ({ accessToken, refreshToken }) => {
        localStorage.setItem('accessToken', accessToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      },
      { accessToken, refreshToken },
    );

    // Save storageState
    const sessionsDir = path.resolve(__dirname, '../sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    const storageStatePath = path.join(sessionsDir, 'auth-storage.json');
    await context.storageState({ path: storageStatePath });
    console.log(`[global-setup] Storage state saved: ${storageStatePath}`);

    await context.close();
    await browser.close();
  } catch (e) {
    console.error('[global-setup] Failed to setup storageState:', e);
    // Throw → suite không chạy → fail CI fast
    throw e;
  }

  console.log('[global-setup] Done.\n');
}