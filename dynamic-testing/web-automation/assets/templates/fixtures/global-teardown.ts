import { request, FullConfig } from '@playwright/test';
import { ApiClient } from './api-client';
import fs from 'fs';
import path from 'path';

/**
 * Global Teardown Template — chạy 1 lần SAU KHI test suite kết thúc.
 *
 * AI đọc skill này sẽ:
 *   1. Copy file này về project (đã reference trong playwright.config.ts)
 *   2. Customize cleanup endpoint theo backend
 *   3. (Optional) Save test summary vào runtime-data/ để debug
 *
 * Workflow:
 *   1. Cleanup test data theo RUN_ID (best-effort)
 *   2. Save test summary → runtime-data/last-run.json
 *   3. Cleanup expired sessions
 *
 * Lưu ý:
 *   - Chạy NGAY CẢ KHI test fail
 *   - Best-effort: KHÔNG throw error nếu cleanup fail
 *   - Dùng standalone API request (không có browser context)
 */
export default async function globalTeardown(_config: FullConfig): Promise<void> {
  console.log('\n[global-teardown] Starting...');

  const RUN_ID = process.env.RUN_ID || `local-${Date.now()}`;
  const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

  // ─────────────────────────────────────────────────────────
  // 1. Cleanup test data theo RUN_ID
  // ─────────────────────────────────────────────────────────
  // Skip nếu project muốn giữ data (vd: manual inspection)
  if (process.env.SKIP_GLOBAL_CLEANUP === 'true') {
    console.log('[global-teardown] Skipping cleanup (SKIP_GLOBAL_CLEANUP=true)');
  } else {
    try {
      const ctx = await request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.TEST_TOKEN ?? ''}`,
        },
      });

      const api = new ApiClient(ctx, API_BASE);

      // ─────────────────────────────────────────────────────
      // Approach 1: Batch cleanup endpoint (PREFERRED)
      // Backend expose endpoint xóa theo runId/tag
      // ─────────────────────────────────────────────────────
      try {
        const res = await api.post('/api/test/cleanup-by-run', {
          runId: RUN_ID,
          tags: ['test-data', `run-${RUN_ID}`],
        });

        if (res.status() === 200) {
          const body = await res.json();
          console.log(`[global-teardown] Cleaned ${body.deleted ?? 0} test records`);
        } else if (res.status() === 404) {
          // Endpoint không tồn tại → fallback
          console.warn('[global-teardown] Cleanup endpoint not found, skipping');
        } else {
          console.warn(`[global-teardown] Cleanup returned ${res.status()}`);
        }
      } catch (e) {
        // Endpoint không tồn tại hoặc network error → fallback
        console.warn('[global-teardown] Batch cleanup failed:', e);

        // ─────────────────────────────────────────────────
        // Approach 2: Query + delete fallback
        // ─────────────────────────────────────────────────
        // Nếu project không có batch endpoint, query test data rồi delete từng cái
        // await cleanupIndividualRecords(api, RUN_ID);
      }

      await ctx.dispose();
    } catch (e) {
      // KHÔNG throw — best-effort cleanup
      console.warn('[global-teardown] Cleanup error (ignored):', e);
    }
  }

  // ─────────────────────────────────────────────────────────
  // 2. Save test summary → runtime-data/last-run.json
  // ─────────────────────────────────────────────────────────
  try {
    const runtimeDataDir = path.resolve(__dirname, '../runtime-data');
    if (!fs.existsSync(runtimeDataDir)) {
      fs.mkdirSync(runtimeDataDir, { recursive: true });
    }

    const summary = {
      runId: RUN_ID,
      timestamp: new Date().toISOString(),
      // AI có thể đọc reports/junit.xml để lấy pass/fail counts
    };

    fs.writeFileSync(
      path.join(runtimeDataDir, 'last-run.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log(`[global-teardown] Test summary saved`);
  } catch (e) {
    console.warn('[global-teardown] Failed to save summary:', e);
  }

  console.log('[global-teardown] Done.\n');
}

/**
 * Approach 2 helper — query + delete fallback.
 * AI uncomment + customize nếu backend KHÔNG có batch endpoint.
 */
// async function cleanupIndividualRecords(api: ApiClient, runId: string): Promise<void> {
//   console.log(`[global-teardown] Fallback: cleaning up test data for run ${runId}`);
//   try {
//     const listRes = await api.get(`/api/test/data?runId=${runId}&tags=test-data`);
//     const list = await listRes.json();
//
//     for (const item of list.data) {
//       try {
//         await api.delete(`${item.endpoint}/${item.id}`);
//       } catch (e) {
//         console.warn(`[global-teardown] Failed to delete ${item.id}:`, e);
//       }
//     }
//   } catch (e) {
//     console.warn('[global-teardown] Fallback cleanup failed:', e);
//   }
// }
