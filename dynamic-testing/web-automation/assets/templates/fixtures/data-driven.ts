import { createHash, randomUUID } from 'crypto';
import type { TestInfo, WorkerInfo } from '@playwright/test';
import { test as base, expect } from './auth';

/**
 * Parallel-safe Data-Driven Testing fixtures.
 *
 * Static case rows answer "what scenario should run".
 * This fixture answers "which unique runtime data belongs to this attempt".
 */

function safeSegment(value: string, maxLength = 80): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'data';
}

function shortHash(value: string, length = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

export type WorkerData = Readonly<{
  runId: string;
  project: string;
  parallelIndex: number;
  workerIndex: number;
  namespace: string;
}>;

export type TestData = Readonly<{
  namespace: string;
  worker: WorkerData;
  uniqueEmail(domain?: string): string;
  uniqueString(prefix?: string): string;
  uuid(): string;
  caseKey(caseId: string): string;
}>;

type DataDrivenFixtures = {
  testData: TestData;
};

type DataDrivenWorkerFixtures = {
  workerData: WorkerData;
};

function buildWorkerData(workerInfo: WorkerInfo): WorkerData {
  const runId = safeSegment(process.env.RUN_ID ?? `local-${process.pid}`);
  const project = safeSegment(workerInfo.project.name);
  const namespace = [
    runId,
    project,
    `p${workerInfo.parallelIndex}`,
    `w${workerInfo.workerIndex}`,
  ].join('-');

  return Object.freeze({
    runId,
    project,
    parallelIndex: workerInfo.parallelIndex,
    workerIndex: workerInfo.workerIndex,
    namespace,
  });
}

function buildTestData(workerData: WorkerData, testInfo: TestInfo): TestData {
  let sequence = 0;
  const namespace = [
    workerData.namespace,
    `t${shortHash(testInfo.testId)}`,
    `r${testInfo.retry}`,
    `e${testInfo.repeatEachIndex}`,
  ].join('-');

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  return Object.freeze({
    namespace,
    worker: workerData,
    uniqueEmail(domain = 'example.com'): string {
      return `qa-${shortHash(namespace)}-${nextSequence()}@${domain}`;
    },
    uniqueString(prefix = 'qa'): string {
      return `${safeSegment(prefix, 24)}-${namespace}-${nextSequence()}`;
    },
    uuid(): string {
      return randomUUID();
    },
    caseKey(caseId: string): string {
      return `${safeSegment(caseId, 40)}-${shortHash(namespace)}-${nextSequence()}`;
    },
  });
}

export const test = base.extend<DataDrivenFixtures, DataDrivenWorkerFixtures>({
  workerData: [
    async ({}, use, workerInfo) => {
      await use(buildWorkerData(workerInfo));
    },
    { scope: 'worker' },
  ],

  testData: async ({ workerData }, use, testInfo) => {
    await use(buildTestData(workerData, testInfo));
  },
});

export { expect };
