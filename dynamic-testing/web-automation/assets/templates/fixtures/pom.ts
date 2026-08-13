import { test as base, expect } from '@playwright/test';
import {
  bindPomRuntime,
  createPomRuntimeContext,
  type PomRuntimeContext,
} from './runtime-context';

type PomFixtures = {
  pomRuntime: PomRuntimeContext;
};

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

  page: async ({ context, pomRuntime }, use) => {
    const page = await context.newPage();
    bindPomRuntime(page, pomRuntime);
    await use(page);
  },
});

export { expect };
