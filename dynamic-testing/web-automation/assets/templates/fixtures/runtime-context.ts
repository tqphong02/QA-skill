import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

type JsonObject = Record<string, unknown>;

type AutomationTestcase = {
  testcase_id: string;
  execution?: {
    mutates?: boolean;
    entry?: {
      role_key?: string;
      route?: string;
    };
  };
};

type RuntimeSlot = {
  id?: string;
  role?: string;
  roles?: string[];
  storageState?: string;
  storage_state?: string;
  data?: JsonObject;
  values?: JsonObject;
  dataRoot?: string;
  data_root?: string;
};

type DataReference = {
  data_ref: string;
  field?: string;
};

export type SelectorEvidenceRecord = Record<string, unknown>;

export type PomRuntimeContext = Readonly<{
  testcaseId: string;
  role: string;
  mutates: boolean;
  namespace: string;
  parallelIndex: number;
  workerIndex: number;
  accountSlot: string | null;
  datasetSlot: string | null;
  storageStatePath: string | null;
  manifestPath: string;
  resolveValue(value: unknown, targetKey?: string): string;
  resolveFile(value: unknown, targetKey?: string): string;
  recordSelectorEvidence(record: SelectorEvidenceRecord): void;
  selectorEvidenceSnapshot(): SelectorEvidenceRecord[];
}>;

const pageRuntime = new WeakMap<Page, PomRuntimeContext>();

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeSegment(value: string, maxLength = 80): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'slot';
}

function envSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function shortHash(value: string, length = 12): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`UNTEST: cannot parse ${filePath}: ${(error as Error).message}`);
  }
}

function packageProjectKey(projectRoot: string): string {
  if (process.env.QA_PROJECT_KEY) return envSegment(process.env.QA_PROJECT_KEY);
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return 'QA';
  const parsed = readJson(packagePath);
  if (!isObject(parsed) || typeof parsed.name !== 'string') return 'QA';
  return envSegment(parsed.name.split(/[^A-Za-z0-9]+/)[0] || 'QA');
}

function poolEnvironment(kind: 'ACCOUNTS' | 'DATASETS', projectKey: string): { name: string; raw: string } | null {
  const candidates = [
    `QA_TEST_${kind}_JSON`,
    `TEST_${kind}_JSON`,
    `${projectKey}_TEST_${kind}_JSON`,
  ];
  for (const name of [...new Set(candidates)]) {
    const raw = process.env[name];
    if (raw) return { name, raw };
  }
  return null;
}

function normalizePool(raw: string, envName: string, role: string, required: boolean): RuntimeSlot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`UNTEST: ${envName} must contain valid JSON`);
  }

  let candidates: unknown;
  if (Array.isArray(parsed)) {
    const typed = parsed.filter(isObject);
    const hasRoleMetadata = typed.some(slot => typeof slot.role === 'string' || Array.isArray(slot.roles));
    candidates = hasRoleMetadata
      ? typed.filter(slot => slot.role === role || (Array.isArray(slot.roles) && slot.roles.includes(role)))
      : typed;
  } else if (isObject(parsed)) {
    candidates = parsed[role] ?? parsed.default;
  }

  if (candidates === undefined && !required) return [];
  if (!Array.isArray(candidates) || candidates.some(slot => !isObject(slot))) {
    throw new Error(
      `UNTEST: ${envName} must be an array or a role map containing arrays; missing role pool: ${role}`,
    );
  }
  return candidates as RuntimeSlot[];
}

function slotName(slot: RuntimeSlot, index: number): string {
  return typeof slot.id === 'string' && slot.id.trim() ? slot.id.trim() : `slot-${index}`;
}

function dataRoot(slot: RuntimeSlot | null): string | null {
  const value = slot?.dataRoot ?? slot?.data_root;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function storageState(slot: RuntimeSlot | null): string | null {
  const value = slot?.storageState ?? slot?.storage_state;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assertPoolCapacity(
  slots: RuntimeSlot[],
  workers: number,
  envName: string,
  identity: (slot: RuntimeSlot, index: number) => string,
): void {
  if (slots.length < workers) {
    throw new Error(
      `UNTEST: ${envName} has ${slots.length} slot(s), but ${workers} Playwright workers require one slot each`,
    );
  }
  const identities = slots.slice(0, workers).map(identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error(`UNTEST: ${envName} reuses a slot across parallel workers`);
  }
}

function publicRoute(route: string): boolean {
  const configured = (process.env.QA_PUBLIC_ROUTES ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const known = configured.length > 0
    ? configured
    : ['/login', '/register', '/forgot-password', '/reset-password'];
  let pathname = route;
  try {
    pathname = new URL(route).pathname;
  } catch {
    // Relative routes are already path-like.
  }
  return known.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function manifestFiles(projectRoot: string): string[] {
  if (process.env.QA_AUTOMATION_MANIFEST) {
    const explicit = path.resolve(projectRoot, process.env.QA_AUTOMATION_MANIFEST);
    if (!fs.existsSync(explicit)) throw new Error(`UNTEST: QA_AUTOMATION_MANIFEST does not exist: ${explicit}`);
    return [explicit];
  }
  const testcasesDir = path.join(projectRoot, 'testcases');
  if (!fs.existsSync(testcasesDir)) return [];
  return fs.readdirSync(testcasesDir)
    .filter(name => name.endsWith('.automation.json'))
    .sort()
    .map(name => path.join(testcasesDir, name));
}

function findTestcase(projectRoot: string, title: string): { testcase: AutomationTestcase; manifestPath: string } {
  const matches: Array<{ testcase: AutomationTestcase; manifestPath: string }> = [];
  for (const manifestPath of manifestFiles(projectRoot)) {
    const manifest = readJson(manifestPath);
    if (!isObject(manifest) || !Array.isArray(manifest.testcases)) continue;
    for (const candidate of manifest.testcases) {
      if (!isObject(candidate) || typeof candidate.testcase_id !== 'string') continue;
      const id = candidate.testcase_id;
      const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_-])`);
      if (pattern.test(title)) {
        matches.push({ testcase: candidate as AutomationTestcase, manifestPath });
      }
    }
  }
  const match = matches[0];
  if (!match || matches.length !== 1) {
    throw new Error(
      `UNTEST: test title must match exactly one testcase in .automation.json; title=${JSON.stringify(title)}, matches=${matches.length}`,
    );
  }
  return match;
}

function objectValue(source: JsonObject, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  const normalized = envSegment(key);
  const actual = Object.keys(source).find(candidate => envSegment(candidate) === normalized);
  return actual ? source[actual] : undefined;
}

function valueFromSource(source: JsonObject, reference: DataReference, targetKey?: string): unknown {
  if (targetKey) {
    const byTarget = objectValue(source, targetKey);
    if (byTarget !== undefined) return byTarget;
  }
  if (reference.field) {
    for (const composite of [
      `${reference.data_ref}.${reference.field}`,
      `${reference.data_ref}:${reference.field}`,
      `${reference.data_ref}_${reference.field}`,
    ]) {
      const direct = objectValue(source, composite);
      if (direct !== undefined) return direct;
    }
  }
  const group = objectValue(source, reference.data_ref);
  if (reference.field && isObject(group)) return objectValue(group, reference.field);
  return group;
}

function renderTokens(value: string, context: {
  namespace: string;
  parallelIndex: number;
  workerIndex: number;
  testcaseId: string;
}): string {
  return value
    .replaceAll('{{namespace}}', context.namespace)
    .replaceAll('{{parallelIndex}}', String(context.parallelIndex))
    .replaceAll('{{workerIndex}}', String(context.workerIndex))
    .replaceAll('{{testcaseId}}', context.testcaseId);
}

export function createPomRuntimeContext(testInfo: TestInfo, projectRoot = process.cwd()): PomRuntimeContext {
  const title = testInfo.title;
  const { testcase, manifestPath } = findTestcase(projectRoot, title);
  const role = testcase.execution?.entry?.role_key || 'unauthenticated';
  const mutates = testcase.execution?.mutates === true;
  const route = testcase.execution?.entry?.route || '';
  const workers = Math.max(1, testInfo.config.workers);
  const projectKey = packageProjectKey(projectRoot);
  const accountEnvironment = poolEnvironment('ACCOUNTS', projectKey);
  const datasetEnvironment = poolEnvironment('DATASETS', projectKey);
  const needsAuthentication = role !== 'unauthenticated' && !publicRoute(route);

  let accountPool: RuntimeSlot[] = [];
  if (accountEnvironment) {
    accountPool = normalizePool(accountEnvironment.raw, accountEnvironment.name, role, needsAuthentication);
    if (needsAuthentication) {
      assertPoolCapacity(accountPool, workers, accountEnvironment.name, (slot, index) => {
        const state = storageState(slot);
        return state ? path.resolve(projectRoot, state) : `missing-${index}`;
      });
    }
  } else if (needsAuthentication) {
    throw new Error(
      `UNTEST: authenticated role ${role} requires QA_TEST_ACCOUNTS_JSON with one storageState per parallel slot`,
    );
  }

  let datasetPool: RuntimeSlot[] = [];
  if (datasetEnvironment) {
    datasetPool = normalizePool(
      datasetEnvironment.raw,
      datasetEnvironment.name,
      role,
      workers > 1 && mutates,
    );
    if (workers > 1 && mutates) {
      assertPoolCapacity(datasetPool, workers, datasetEnvironment.name, (slot, index) => (
        typeof slot.id === 'string' && slot.id.trim()
          ? slot.id.trim()
          : `${dataRoot(slot) ?? ''}:${shortHash(JSON.stringify(slot.values ?? {}))}:${index}`
      ));
    }
  } else if (workers > 1 && mutates) {
    throw new Error(
      `UNTEST: mutating testcase ${testcase.testcase_id} requires QA_TEST_DATASETS_JSON for parallel execution`,
    );
  }

  const account = accountPool[testInfo.parallelIndex] ?? null;
  const dataset = datasetPool[testInfo.parallelIndex] ?? null;
  const selectedStorageState = storageState(account);
  const storageStatePath = selectedStorageState ? path.resolve(projectRoot, selectedStorageState) : null;
  if (needsAuthentication && (!storageStatePath || !fs.existsSync(storageStatePath))) {
    throw new Error(
      `UNTEST: account slot ${testInfo.parallelIndex} for role ${role} needs an existing project-local storageState file`,
    );
  }

  const namespace = [
    safeSegment(process.env.RUN_ID ?? process.env.QA_RUN_ID ?? `local-${process.pid}`),
    safeSegment(testInfo.project.name),
    `p${testInfo.parallelIndex}`,
    `w${testInfo.workerIndex}`,
    `t${shortHash(testInfo.testId)}`,
    `r${testInfo.retry}`,
    `e${testInfo.repeatEachIndex}`,
  ].join('-');

  const accountData = isObject(account?.data) ? account.data : {};
  const datasetValues = isObject(dataset?.values) ? dataset.values : {};
  const cache = new Map<string, string>();
  const selectorEvidence = new Map<string, SelectorEvidenceRecord>();
  const tokenContext = {
    namespace,
    parallelIndex: testInfo.parallelIndex,
    workerIndex: testInfo.workerIndex,
    testcaseId: testcase.testcase_id,
  };

  const resolveValue = (value: unknown, targetKey?: string): string => {
    const sourceKey = JSON.stringify(value) ?? String(value);
    const targetCacheKey = `${targetKey ?? ''}:${sourceKey}`;
    if (cache.has(targetCacheKey)) return cache.get(targetCacheKey) as string;
    if (!targetKey && cache.has(sourceKey)) return cache.get(sourceKey) as string;

    let resolved: unknown = value;
    if (isObject(value) && typeof value.data_ref === 'string') {
      const reference = value as DataReference;
      resolved = valueFromSource(datasetValues, reference, targetKey);
      if (resolved === undefined) resolved = valueFromSource(accountData, reference, targetKey);
      if (resolved === undefined) {
        const referenceKey = envSegment(reference.data_ref);
        const fieldKey = reference.field ? `_${envSegment(reference.field)}` : '';
        const environmentNames = [
          `${projectKey}_DATA_${referenceKey}${fieldKey}`,
          `QA_DATA_${referenceKey}${fieldKey}`,
          `${projectKey}_DATA_${referenceKey}`,
          `QA_DATA_${referenceKey}`,
        ];
        const environmentName = environmentNames.find(name => process.env[name] !== undefined);
        if (environmentName) resolved = process.env[environmentName];
      }
      if (resolved === undefined) {
        throw new Error(
          `UNTEST: missing data for ${reference.data_ref}${reference.field ? `.${reference.field}` : ''}; `
          + `provide ${datasetEnvironment?.name ?? 'QA_TEST_DATASETS_JSON'} values or a project data environment variable`,
        );
      }
    } else if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
      resolved = value.value;
    } else if (targetKey) {
      const targetValue = objectValue(datasetValues, targetKey) ?? objectValue(accountData, targetKey);
      if (targetValue !== undefined) resolved = targetValue;
    }

    if (isObject(resolved) || Array.isArray(resolved)) {
      throw new Error(`UNTEST: resolved data for ${targetKey ?? sourceKey} must be a scalar value`);
    }
    const rendered = renderTokens(String(resolved ?? ''), tokenContext);
    cache.set(targetCacheKey, rendered);
    // Assertion code may resolve the same structured value without targetKey
    // immediately after a Page Object action; retain that latest target value.
    cache.set(sourceKey, rendered);
    return rendered;
  };

  const resolveFile = (value: unknown, targetKey?: string): string => {
    const rendered = resolveValue(value, targetKey);
    const root = dataRoot(dataset) ?? dataRoot(account) ?? 'testdata';
    const sourcePath = path.isAbsolute(rendered)
      ? rendered
      : path.resolve(projectRoot, root, rendered);
    if (!fs.existsSync(sourcePath)) throw new Error(`UNTEST: upload fixture does not exist: ${sourcePath}`);
    if (workers === 1 && !mutates) return sourcePath;
    const extension = path.extname(sourcePath);
    const basename = safeSegment(path.basename(sourcePath, extension), 40);
    const isolatedPath = testInfo.outputPath(`input-${namespace}-${basename}${extension}`);
    fs.mkdirSync(path.dirname(isolatedPath), { recursive: true });
    fs.copyFileSync(sourcePath, isolatedPath);
    return isolatedPath;
  };

  const recordSelectorEvidence = (record: SelectorEvidenceRecord): void => {
    if (process.env.QA_SELECTOR_EVIDENCE_CAPTURE !== 'true') return;
    const targetKey = typeof record.target_key === 'string' ? record.target_key.trim() : '';
    if (!targetKey) return;
    const key = [
      targetKey,
      String(record.route ?? ''),
      String(record.state ?? ''),
      JSON.stringify(record.locator ?? ''),
    ].join('|');
    const enriched: SelectorEvidenceRecord = {
      ...record,
      testcase_id: testcase.testcase_id,
      role: record.role ?? role,
      run_id: record.run_id ?? process.env.RUN_ID ?? process.env.QA_RUN_ID ?? null,
      app_build: record.app_build ?? process.env.QA_APP_BUILD ?? 'unknown-build',
    };
    const existing = selectorEvidence.get(key);
    if (!existing || (existing.status !== 'runtime_verified' && enriched.status === 'runtime_verified')) {
      selectorEvidence.set(key, enriched);
    }
  };

  return Object.freeze({
    testcaseId: testcase.testcase_id,
    role,
    mutates,
    namespace,
    parallelIndex: testInfo.parallelIndex,
    workerIndex: testInfo.workerIndex,
    accountSlot: account ? slotName(account, testInfo.parallelIndex) : null,
    datasetSlot: dataset ? slotName(dataset, testInfo.parallelIndex) : null,
    storageStatePath,
    manifestPath,
    resolveValue,
    resolveFile,
    recordSelectorEvidence,
    selectorEvidenceSnapshot: () => [...selectorEvidence.values()],
  });
}

export function bindPomRuntime(page: Page, runtime: PomRuntimeContext): void {
  pageRuntime.set(page, runtime);
}

export function pomRuntimeFor(page: Page): PomRuntimeContext | undefined {
  return pageRuntime.get(page);
}
