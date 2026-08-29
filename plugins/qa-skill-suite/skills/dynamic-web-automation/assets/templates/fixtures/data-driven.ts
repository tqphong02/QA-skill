import { createHash, randomUUID } from 'node:crypto';
import type { TestInfo } from '@playwright/test';
import type { PomRuntimeContext } from './runtime-context';

/** Static case rows describe what to test; this object owns attempt-local data. */
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
  build<T extends Record<string, unknown>>(defaults: T, overrides?: Partial<T>): T;
}>;

function safeSegment(value: string, maxLength = 80): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'data';
}

function shortHash(value: string, length = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

/** Internal builder used by fixtures/pom; it is not a second test entrypoint. */
export function createTestData(runtime: PomRuntimeContext, testInfo: TestInfo): TestData {
  let sequence = 0;
  const runId = safeSegment(process.env.QA_RUN_ID ?? process.env.RUN_ID ?? `local-${process.pid}`);
  const project = safeSegment(testInfo.project.name);
  const workerNamespace = [
    runId,
    project,
    `p${runtime.parallelIndex}`,
    `w${runtime.workerIndex}`,
  ].join('-');
  const worker = Object.freeze({
    runId,
    project,
    parallelIndex: runtime.parallelIndex,
    workerIndex: runtime.workerIndex,
    namespace: workerNamespace,
  });
  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  return Object.freeze({
    namespace: runtime.namespace,
    worker,
    uniqueEmail(domain = 'example.com'): string {
      return `qa-${shortHash(runtime.namespace)}-${nextSequence()}@${domain}`;
    },
    uniqueString(prefix = 'qa'): string {
      return `${safeSegment(prefix, 24)}-${runtime.namespace}-${nextSequence()}`;
    },
    uuid(): string {
      return randomUUID();
    },
    caseKey(caseId: string): string {
      return `${safeSegment(caseId, 40)}-${shortHash(runtime.namespace)}-${nextSequence()}`;
    },
    build<T extends Record<string, unknown>>(defaults: T, overrides: Partial<T> = {}): T {
      return { ...defaults, ...overrides };
    },
  });
}
