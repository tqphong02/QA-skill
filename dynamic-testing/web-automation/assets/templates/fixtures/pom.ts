import { test as base, expect } from '@playwright/test';
import {
  bindPomRuntime,
  createPomRuntimeContext,
  type PomRuntimeContext,
} from './runtime-context';

type PomFixtures = {
  pomRuntime: PomRuntimeContext;
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

/**
 * Mandatory fixture entrypoint for deterministic manifest-generated POM specs.
 * It assigns one account/data slot per parallelIndex, creates a fresh context,
 * and binds testcase runtime data to every generated Page Object.
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

  storageState: async ({ pomRuntime }, use) => {
    await use(pomRuntime.storageStatePath ?? { cookies: [], origins: [] });
  },

  page: async ({ context, pomRuntime }, use, testInfo) => {
    const page = await context.newPage();
    bindPomRuntime(page, pomRuntime);
    await use(page);
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

// Keep generated specs with historical per-test timeouts compatible with
// bounded upload/DSL/run waits configured by the target project.
test.beforeEach(async ({}, testInfo) => {
  testInfo.setTimeout(Math.max(testInfo.timeout, asyncUiTestTimeout()));
});

export { expect };
