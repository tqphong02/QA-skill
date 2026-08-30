#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const AUTH_MODES = new Set(['none', 'bearer', 'cookie', 'api-key', 'basic', 'oauth2']);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const TESTCASE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/;
const OPERATION_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const SIDE_EFFECT_TYPES = new Set([
  'READ_AFTER_WRITE', 'DATABASE_STATE', 'EVENT_PUBLISHED', 'WEBHOOK_SENT',
  'TRANSACTION_ROLLBACK', 'NO_UNEXPECTED_MUTATION',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

function violation(code, message, details = {}) {
  return { code, message, ...details };
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInside(root, relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error(label + ' must be a non-empty path');
  }
  const resolved = path.resolve(root, relativePath);
  if (!isInside(root, resolved)) {
    throw new Error(label + ' resolves outside project root: ' + relativePath);
  }
  if (!fs.existsSync(root)) throw new Error('project root does not exist: ' + root);
  let existingAncestor = resolved;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const canonicalRoot = fs.realpathSync.native(root);
  const canonicalAncestor = fs.realpathSync.native(existingAncestor);
  if (!isInside(canonicalRoot, canonicalAncestor)) {
    throw new Error(label + ' resolves outside project root through a link: ' + relativePath);
  }
  return resolved;
}

function normalizePath(value) {
  let normalized = String(value ?? '').trim();
  const queryIndex = normalized.indexOf('?');
  if (queryIndex >= 0) normalized = normalized.slice(0, queryIndex);
  const hashIndex = normalized.indexOf('#');
  if (hashIndex >= 0) normalized = normalized.slice(0, hashIndex);
  normalized = normalized.replace(/\$\{[^}]+\}/g, '{*}');
  normalized = normalized.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{*}');
  normalized = normalized.replace(/\{[^}]+\}/g, '{*}');
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

function operationKey(operation) {
  return operation.method + ' ' + operation.path + '#' + operation.operation;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function schemaName(value) {
  return typeof value === 'string' && IDENTIFIER.test(value) ? value : null;
}

function normalizeOperation(raw, index) {
  const violations = [];
  const prefix = { operation_index: index };
  if (!isObject(raw)) {
    return {
      index,
      required: true,
      method: '',
      path: '',
      operation: '',
      testcase_id: '',
      spec: '',
      violations: [violation('API_OPERATION_INVALID', 'Operation row must be an object', prefix)],
    };
  }

  const method = typeof raw.method === 'string' ? raw.method.trim().toUpperCase() : '';
  const apiPath = typeof raw.path === 'string' ? raw.path.trim() : '';
  const operation = typeof raw.operation === 'string' ? raw.operation.trim() : '';
  const testcaseId = typeof raw.testcase_id === 'string' ? raw.testcase_id.trim() : '';
  const spec = typeof raw.spec === 'string' ? raw.spec.trim().replace(/\\/g, '/') : '';

  if (!HTTP_METHODS.has(method)) {
    violations.push(violation('API_METHOD_INVALID', 'method must be GET, POST, PUT, PATCH or DELETE', prefix));
  }
  if (!apiPath.startsWith('/') || apiPath.includes('?') || apiPath.includes('#')) {
    violations.push(violation(
      'API_PATH_INVALID',
      'path must be an absolute API path without query/hash',
      { ...prefix, path: apiPath },
    ));
  }
  if (!OPERATION_ID.test(operation)) {
    violations.push(violation('API_OPERATION_ID_INVALID', 'operation must be a stable identifier', prefix));
  }
  if (!TESTCASE_ID.test(testcaseId)) {
    violations.push(violation('API_TESTCASE_ID_INVALID', 'testcase_id is missing or invalid', prefix));
  }
  if (!/^tests\/(api|functional)\/.+\.spec\.ts$/.test(spec)) {
    violations.push(violation(
      'API_SPEC_PATH_INVALID',
      'spec must point to tests/api or tests/functional and end in .spec.ts',
      { ...prefix, spec },
    ));
  }
  if (typeof raw.required !== 'boolean') {
    violations.push(violation('API_REQUIRED_FLAG_MISSING', 'required must be an explicit boolean', prefix));
  }
  if (typeof raw.mutates !== 'boolean') {
    violations.push(violation('API_MUTATES_FLAG_MISSING', 'mutates must be an explicit boolean', prefix));
  }

  const client = isObject(raw.client) ? raw.client : {};
  const clientType = typeof client.type === 'string' ? client.type.trim() : '';
  const clientFixture = typeof client.fixture === 'string' ? client.fixture.trim() : '';
  const clientInstance = typeof client.instance === 'string' ? client.instance.trim() : '';
  const clientSource = typeof client.source === 'string' ? client.source.trim().replace(/\\/g, '/') : '';
  const clientMethod = typeof client.method === 'string' ? client.method.trim() : '';
  const clientHttpMethod = typeof client.http_method === 'string'
    ? client.http_method.trim().toLowerCase()
    : clientMethod.toLowerCase();
  if (!IDENTIFIER.test(clientType) || !IDENTIFIER.test(clientFixture)) {
    violations.push(violation(
      'API_CLIENT_MAPPING_INVALID',
      'client.type and client.fixture must be explicit TypeScript identifiers',
      prefix,
    ));
  }
  if (!IDENTIFIER.test(clientMethod)) {
    violations.push(violation('API_CLIENT_METHOD_INVALID', 'client.method must be a TypeScript identifier', prefix));
  }
  if (clientInstance && (
    !IDENTIFIER.test(clientInstance)
    || !/^(?:clients\/.+|src\/modules\/[^/]+\/[^/]+\/api\/.+)\.client\.ts$/.test(clientSource)
  )) {
    violations.push(violation(
      'API_MODULE_CLIENT_MAPPING_INVALID',
      'Module clients require client.instance and a module-owned *.client.ts source',
      prefix,
    ));
  }
  if (clientHttpMethod !== method.toLowerCase()) {
    violations.push(violation(
      'API_CLIENT_METHOD_MISMATCH',
      'client.http_method must match the HTTP method',
      { ...prefix, expected: method.toLowerCase(), actual: clientHttpMethod },
    ));
  }

  const auth = isObject(raw.auth) ? raw.auth : {};
  const authMode = typeof auth.mode === 'string' ? auth.mode.trim().toLowerCase() : '';
  const role = typeof auth.role === 'string' ? auth.role.trim() : '';
  if (!AUTH_MODES.has(authMode) || !role) {
    violations.push(violation(
      'API_AUTH_MAPPING_INVALID',
      'auth.mode and auth.role must be explicit',
      prefix,
    ));
  }
  if (authMode === 'none' && role !== 'unauthenticated') {
    violations.push(violation(
      'API_UNAUTHENTICATED_ROLE_MISMATCH',
      'auth.mode none requires role unauthenticated',
      prefix,
    ));
  }

  const expectedStatus = Array.isArray(raw.expected_status)
    ? [...new Set(raw.expected_status.filter(value => Number.isInteger(value) && value >= 100 && value <= 599))]
    : [];
  if (
    !Array.isArray(raw.expected_status)
    || expectedStatus.length === 0
    || expectedStatus.length !== raw.expected_status.length
  ) {
    violations.push(violation(
      'API_EXPECTED_STATUS_INVALID',
      'expected_status must be a non-empty array of unique HTTP status integers',
      prefix,
    ));
  }

  const schemas = isObject(raw.schemas) ? raw.schemas : {};
  for (const key of ['request', 'response', 'error']) {
    if (!own(schemas, key) || (schemas[key] !== null && !schemaName(schemas[key]))) {
      violations.push(violation(
        'API_SCHEMA_MAPPING_INVALID',
        'schemas.' + key + ' must be an explicit schema identifier or null',
        { ...prefix, schema: key },
      ));
    }
  }
  if (BODY_METHODS.has(method) && !schemaName(schemas.request)) {
    violations.push(violation(
      'API_REQUEST_SCHEMA_REQUIRED',
      method + ' operations require schemas.request',
      prefix,
    ));
  }
  if (expectedStatus.some(status => status >= 200 && status < 400 && status !== 204 && status !== 304)
    && !schemaName(schemas.response)) {
    violations.push(violation(
      'API_RESPONSE_SCHEMA_REQUIRED',
      'Successful body responses require schemas.response',
      prefix,
    ));
  }
  if (expectedStatus.some(status => status >= 400) && !schemaName(schemas.error)) {
    violations.push(violation(
      'API_ERROR_SCHEMA_REQUIRED',
      'Error responses require schemas.error',
      prefix,
    ));
  }

  const sideEffects = [];
  if (raw.side_effects !== undefined && !Array.isArray(raw.side_effects)) {
    violations.push(violation('API_SIDE_EFFECT_MAPPING_INVALID', 'side_effects must be an array', prefix));
  }
  const seenSideEffects = new Set();
  for (const [sideEffectIndex, item] of (Array.isArray(raw.side_effects) ? raw.side_effects : []).entries()) {
    const effect = isObject(item) ? item : {};
    const id = typeof effect.id === 'string' ? effect.id.trim() : '';
    const type = typeof effect.type === 'string' ? effect.type.trim().toUpperCase() : '';
    const marker = typeof effect.marker === 'string' ? effect.marker.trim() : '';
    const implementationExport = typeof effect.implementation_export === 'string'
      ? effect.implementation_export.trim()
      : '';
    if (!/^SE[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(id) || seenSideEffects.has(id)) {
      violations.push(violation('API_SIDE_EFFECT_MAPPING_INVALID', 'side-effect IDs must be valid and unique', { ...prefix, side_effect_index: sideEffectIndex }));
    }
    seenSideEffects.add(id);
    if (!SIDE_EFFECT_TYPES.has(type) || !marker || !IDENTIFIER.test(implementationExport)) {
      violations.push(violation('API_SIDE_EFFECT_MAPPING_INVALID', 'side-effects require type, marker and implementation_export', { ...prefix, side_effect_id: id }));
    }
    sideEffects.push({ id, type, marker, implementation_export: implementationExport });
  }

  const cleanup = isObject(raw.cleanup) ? raw.cleanup : {};
  if (typeof cleanup.required !== 'boolean') {
    violations.push(violation(
      'API_CLEANUP_MAPPING_INVALID',
      'cleanup.required must be an explicit boolean',
      prefix,
    ));
  }
  if (raw.mutates === true && cleanup.required !== true) {
    violations.push(violation(
      'API_MUTATION_CLEANUP_REQUIRED',
      'Mutating operations require same-test cleanup',
      prefix,
    ));
  }
  if (cleanup.required === true) {
    if (
      cleanup.owner !== 'same_test'
      || !IDENTIFIER.test(String(cleanup.client ?? ''))
      || !IDENTIFIER.test(String(cleanup.method ?? ''))
      || !HTTP_METHODS.has(String(cleanup.http_method ?? cleanup.method ?? '').toUpperCase())
      || typeof cleanup.path !== 'string'
      || !cleanup.path.startsWith('/')
    ) {
      violations.push(violation(
        'API_CLEANUP_MAPPING_INVALID',
        'Required cleanup needs owner=same_test, client, method and absolute path',
        prefix,
      ));
    }
  } else if (cleanup.required === false && (
    typeof cleanup.reason !== 'string' || !cleanup.reason.trim()
  )) {
    violations.push(violation(
      'API_CLEANUP_REASON_REQUIRED',
      'Non-required cleanup needs an explicit reason',
      prefix,
    ));
  }

  return {
    index,
    method,
    path: apiPath,
    operation,
    required: raw.required === true,
    mutates: raw.mutates === true,
    testcase_id: testcaseId,
    spec,
    client: {
      type: clientType,
      fixture: clientFixture,
      method: clientMethod,
      instance: clientInstance || null,
      source: clientSource || null,
      http_method: clientHttpMethod,
    },
    auth: { mode: authMode, role },
    expected_status: expectedStatus,
    schemas: {
      request: schemas.request ?? null,
      response: schemas.response ?? null,
      error: schemas.error ?? null,
    },
    side_effects: sideEffects,
    cleanup: cleanup.required === true
      ? {
          required: true,
          owner: cleanup.owner,
          client: String(cleanup.client ?? ''),
          method: String(cleanup.method ?? ''),
          http_method: String(cleanup.http_method ?? cleanup.method ?? '').toLowerCase(),
          path: String(cleanup.path ?? ''),
        }
      : {
          required: false,
          reason: typeof cleanup.reason === 'string' ? cleanup.reason.trim() : '',
        },
    violations,
  };
}

function readStringLiteral(source, start) {
  const quote = source[start];
  if (quote !== "'" && quote !== '"' && quote?.charCodeAt(0) !== 96) return null;
  let value = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      value += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      value += character;
      escaped = true;
      continue;
    }
    if (character === quote) return { value, end: index + 1 };
    value += character;
  }
  return null;
}

function collectTestBlocks(source) {
  const starts = [];
  const pattern = /^[ \t]*test\s*\(/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    starts.push({ index: match.index, afterOpen: pattern.lastIndex });
  }
  return starts.map((start, index) => {
    let cursor = start.afterOpen;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const titleLiteral = readStringLiteral(source, cursor);
    return {
      title: titleLiteral?.value ?? null,
      source: source.slice(start.index, starts[index + 1]?.index ?? source.length),
      index: start.index,
    };
  });
}

function findClientCalls(block, fixture, method) {
  if (!IDENTIFIER.test(fixture) || !IDENTIFIER.test(method)) return [];
  const pattern = new RegExp(
    '\\b' + escapeRegex(fixture) + '\\s*\\.\\s*' + escapeRegex(method) + '\\s*\\(',
    'g',
  );
  const calls = [];
  let match;
  while ((match = pattern.exec(block)) !== null) {
    let cursor = pattern.lastIndex;
    while (/\s/.test(block[cursor] ?? '')) cursor += 1;
    const requestPath = readStringLiteral(block, cursor);
    if (!requestPath) continue;
    const prefix = block.slice(Math.max(0, match.index - 160), match.index);
    const assignment = prefix.match(
      /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*await\s*$/,
    );
    calls.push({
      index: match.index,
      path: requestPath.value,
      responseVariable: assignment?.[1] ?? null,
    });
  }
  return calls;
}

function findMethodCalls(block, objectName, method) {
  if (!IDENTIFIER.test(objectName) || !IDENTIFIER.test(method)) return [];
  const pattern = new RegExp(
    '\\b' + escapeRegex(objectName) + '\\s*\\.\\s*' + escapeRegex(method) + '\\s*\\(',
    'g',
  );
  const calls = [];
  let match;
  while ((match = pattern.exec(block)) !== null) {
    const prefix = block.slice(Math.max(0, match.index - 160), match.index);
    const assignment = prefix.match(
      /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*await\s*$/,
    );
    calls.push({ index: match.index, responseVariable: assignment?.[1] ?? null });
  }
  return calls;
}

function statusAssertions(block, responseVariable) {
  if (!responseVariable) return [];
  const pattern = new RegExp(
    'expect\\s*\\(\\s*'
      + escapeRegex(responseVariable)
      + '\\s*\\.\\s*status\\s*\\(\\s*\\)\\s*\\)\\s*\\.\\s*toBe\\s*\\(\\s*(\\d{3})\\s*\\)',
    'g',
  );
  const statuses = [];
  let match;
  while ((match = pattern.exec(block)) !== null) statuses.push(Number(match[1]));
  return [...new Set(statuses)];
}

function validatedSchemas(block) {
  const names = new Set();
  const pattern = /\bApiClient\s*\.\s*validate\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match;
  while ((match = pattern.exec(block)) !== null) names.add(match[1]);
  const parsePattern = /\b([A-Za-z_$][A-Za-z0-9_$]*Schema)\s*\.\s*parse\s*\(/g;
  while ((match = parsePattern.exec(block)) !== null) names.add(match[1]);
  return [...names];
}

function inspectModuleClient(projectRoot, client, operationMethod, apiPath, httpMethod) {
  const violations = [];
  let sourcePath;
  try {
    sourcePath = resolveInside(projectRoot, client.source, 'client.source');
  } catch (error) {
    return { violations: [violation('API_MODULE_CLIENT_SOURCE_UNSAFE', error.message)] };
  }
  if (!fs.existsSync(sourcePath)) {
    return { violations: [violation('API_MODULE_CLIENT_SOURCE_MISSING', 'Generated module client source does not exist')] };
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const methodStart = source.search(new RegExp(`\\b${escapeRegex(operationMethod)}\\s*\\(`));
  if (methodStart < 0) {
    return { violations: [violation('API_MODULE_CLIENT_METHOD_MISSING', 'Mapped module client method does not exist')] };
  }
  const nextMethod = source.slice(methodStart + operationMethod.length).search(/\n\s{2}[A-Za-z_$][A-Za-z0-9_$]*\s*\(/);
  const methodBlock = nextMethod < 0
    ? source.slice(methodStart)
    : source.slice(methodStart, methodStart + operationMethod.length + nextMethod);
  if (!methodBlock.includes(`this.resolvePath(${JSON.stringify(apiPath)}`)) {
    violations.push(violation('API_MODULE_CLIENT_PATH_MISMATCH', 'Module client method does not map the inventory API path'));
  }
  if (!methodBlock.includes(`this.api.fetch(${JSON.stringify(httpMethod)}`)) {
    violations.push(violation('API_MODULE_CLIENT_HTTP_METHOD_MISMATCH', 'Module client method does not map the inventory HTTP method'));
  }
  return { violations };
}

function containsTestcase(title, testcaseId) {
  if (!title) return false;
  return new RegExp(
    '(^|[^A-Za-z0-9_.-])' + escapeRegex(testcaseId) + '($|[^A-Za-z0-9_.-])',
  ).test(title);
}

function inspectImplementation(projectRoot, operation) {
  const violations = [...operation.violations];
  const details = { testcase_id: operation.testcase_id, operation: operationKey(operation) };
  let specPath;
  try {
    specPath = resolveInside(projectRoot, operation.spec, 'spec');
  } catch (error) {
    violations.push(violation('API_SPEC_PATH_UNSAFE', error.message, details));
    return { status: 'BLOCKED', violations, checks: {} };
  }
  if (!fs.existsSync(specPath)) {
    violations.push(violation('API_SPEC_MISSING', 'Mapped spec does not exist', {
      ...details,
      spec: operation.spec,
    }));
    return { status: 'BLOCKED', violations, checks: {} };
  }

  const source = fs.readFileSync(specPath, 'utf8');
  const canonicalImport = /from\s+['"][^'"]*fixtures\/pom['"]/.test(source);
  if (!canonicalImport) {
    violations.push(violation(
      'API_SPEC_BYPASSES_POM_FIXTURE',
      'Mapped spec must import test/expect from fixtures/pom',
      details,
    ));
  }
  const blocks = collectTestBlocks(source).filter(block => (
    containsTestcase(block.title, operation.testcase_id)
  ));
  if (blocks.length !== 1) {
    violations.push(violation(
      'API_TESTCASE_MAPPING_COUNT',
      'testcase_id must map to exactly one literal test title',
      { ...details, count: blocks.length },
    ));
    return {
      status: 'BLOCKED',
      violations,
      checks: { canonical_fixture_import: canonicalImport, testcase_count: blocks.length },
    };
  }

  const block = blocks[0].source;
  const headerEnd = block.indexOf('=>');
  const fixtureHeader = headerEnd >= 0 ? block.slice(0, headerEnd) : '';
  const fixturePresent = new RegExp('\\b' + escapeRegex(operation.client.fixture) + '\\b')
    .test(fixtureHeader);
  if (!fixturePresent) {
    violations.push(violation(
      'API_CLIENT_FIXTURE_MISSING',
      'Mapped client fixture is not declared by the test',
      { ...details, fixture: operation.client.fixture },
    ));
  }
  if (!new RegExp('\\b' + escapeRegex(operation.client.type) + '\\b').test(source)) {
    violations.push(violation(
      'API_CLIENT_TYPE_MISSING',
      'Mapped client type is not present in the spec',
      { ...details, client_type: operation.client.type },
    ));
  }

  const expectedApiMarker = '[' + operation.testcase_id + ':API] '
    + operation.method + ' ' + operation.path + ' ' + operation.operation;
  const apiMarkerPresent = block.includes(expectedApiMarker);
  if (!apiMarkerPresent) {
    violations.push(violation(
      'API_OPERATION_MARKER_MISSING',
      'Canonical API operation marker is missing',
      { ...details, marker: expectedApiMarker },
    ));
  }
  const expectedRoleMarker = '[' + operation.testcase_id + ':ROLE] ' + operation.auth.role;
  const roleMarkerPresent = block.includes(expectedRoleMarker);
  if (!roleMarkerPresent) {
    violations.push(violation(
      'API_ROLE_MARKER_MISSING',
      'Canonical role marker is missing',
      { ...details, marker: expectedRoleMarker },
    ));
  }

  let matchingCalls;
  if (operation.client.instance) {
    const constructorPattern = new RegExp(
      `\\bconst\\s+${escapeRegex(operation.client.instance)}\\s*=\\s*new\\s+${escapeRegex(operation.client.type)}`
      + `\\s*\\(\\s*${escapeRegex(operation.client.fixture)}\\s*\\)`,
    );
    if (!constructorPattern.test(block)) {
      violations.push(violation(
        'API_MODULE_CLIENT_BINDING_MISSING',
        'Module client must be constructed from the canonical API fixture',
        details,
      ));
    }
    matchingCalls = findMethodCalls(block, operation.client.instance, operation.client.method);
    const moduleInspection = inspectModuleClient(
      projectRoot,
      operation.client,
      operation.client.method,
      operation.path,
      operation.method,
    );
    violations.push(...moduleInspection.violations.map(item => ({ ...item, ...details })));
  } else {
    matchingCalls = findClientCalls(
      block,
      operation.client.fixture,
      operation.client.method,
    ).filter(call => normalizePath(call.path) === normalizePath(operation.path));
  }
  if (matchingCalls.length !== 1) {
    violations.push(violation(
      'API_CLIENT_CALL_MISMATCH',
        'Mapped client operation must appear exactly once in the testcase',
      { ...details, count: matchingCalls.length },
    ));
  }
  const operationCall = matchingCalls[0];
  const actualStatuses = operationCall
    ? statusAssertions(block, operationCall.responseVariable)
    : [];
  for (const status of operation.expected_status) {
    if (!actualStatuses.includes(status)) {
      violations.push(violation(
        'API_STATUS_ASSERTION_MISSING',
        'Expected HTTP status assertion is missing',
        { ...details, status },
      ));
    }
  }
  if (operationCall && !operationCall.responseVariable) {
    violations.push(violation(
      'API_RESPONSE_VARIABLE_MISSING',
      'Operation response must be assigned before status/schema assertions',
      details,
    ));
  }

  const schemas = validatedSchemas(block);
  for (const [kind, name] of Object.entries(operation.schemas)) {
    if (name && !schemas.includes(name)) {
      violations.push(violation(
        'API_SCHEMA_VALIDATION_MISSING',
        'Mapped ' + kind + ' schema is not validated with ApiClient.validate or Zod.parse',
        { ...details, schema_kind: kind, schema: name },
      ));
    }
  }

  const sideEffectChecks = [];
  for (const effect of operation.side_effects) {
    const markerPresent = block.includes(effect.marker);
    const implementationCalled = new RegExp(`\\.${escapeRegex(effect.implementation_export)}\\s*\\(`).test(block);
    const assertionPresent = new RegExp(
      `sideEffectResult\\d+\\)\\.toEqual\\s*\\(`,
    ).test(block);
    if (!markerPresent) {
      violations.push(violation('API_SIDE_EFFECT_MARKER_MISSING', 'Canonical side-effect marker is missing', { ...details, side_effect_id: effect.id }));
    }
    if (!implementationCalled) {
      violations.push(violation('API_SIDE_EFFECT_IMPLEMENTATION_MISSING', 'Side-effect oracle helper is not called', { ...details, side_effect_id: effect.id }));
    }
    if (!assertionPresent) {
      violations.push(violation('API_SIDE_EFFECT_ASSERTION_MISSING', 'Side-effect oracle result is not asserted', { ...details, side_effect_id: effect.id }));
    }
    sideEffectChecks.push({ id: effect.id, marker_present: markerPresent, implementation_called: implementationCalled, assertion_present: assertionPresent });
  }

  let cleanupCallPresent = true;
  let cleanupMarkerPresent = true;
  if (operation.cleanup.required) {
    const expectedCleanupMarker = '[' + operation.testcase_id + ':CLEANUP] '
      + operation.cleanup.http_method.toUpperCase() + ' ' + operation.cleanup.path
      + ' ' + operation.cleanup.owner;
    cleanupMarkerPresent = block.includes(expectedCleanupMarker);
    if (!cleanupMarkerPresent) {
      violations.push(violation(
        'API_CLEANUP_MARKER_MISSING',
        'Canonical cleanup marker is missing',
        { ...details, marker: expectedCleanupMarker },
      ));
    }
    const finallyIndex = block.indexOf('finally');
    const cleanupBlock = finallyIndex >= 0 ? block.slice(finallyIndex) : '';
    if (operation.client.instance) {
      cleanupCallPresent = finallyIndex >= 0
        && findMethodCalls(cleanupBlock, operation.cleanup.client, operation.cleanup.method).length === 1;
      const cleanupInspection = inspectModuleClient(
        projectRoot,
        operation.client,
        operation.cleanup.method,
        operation.cleanup.path,
        operation.cleanup.http_method.toUpperCase(),
      );
      violations.push(...cleanupInspection.violations.map(item => ({ ...item, ...details })));
    } else {
      cleanupCallPresent = finallyIndex >= 0 && findClientCalls(
        cleanupBlock,
        operation.cleanup.client,
        operation.cleanup.method,
      ).some(call => normalizePath(call.path) === normalizePath(operation.cleanup.path));
    }
    if (!cleanupCallPresent) {
      violations.push(violation(
        'API_CLEANUP_IMPLEMENTATION_MISSING',
        'Required exact-resource cleanup must run from finally',
        details,
      ));
    }
  }

  return {
    status: violations.length === 0 ? 'COVERED' : 'BLOCKED',
    violations,
    checks: {
      canonical_fixture_import: canonicalImport,
      testcase_count: blocks.length,
      client_fixture_present: fixturePresent,
      api_marker_present: apiMarkerPresent,
      role_marker_present: roleMarkerPresent,
      client_call_count: matchingCalls.length,
      asserted_statuses: actualStatuses,
      validated_schemas: schemas,
      side_effects: sideEffectChecks,
      cleanup_marker_present: cleanupMarkerPresent,
      cleanup_call_present: cleanupCallPresent,
    },
  };
}

function listSpecFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && entry.name.endsWith('.spec.ts')) files.push(candidate);
    }
  };
  visit(root);
  return files.sort();
}

function discoverUnmappedTests(projectRoot, operations, scopedIds) {
  const violations = [];
  const knownIds = new Set(operations.map(item => item.testcase_id));
  const files = [
    ...listSpecFiles(path.join(projectRoot, 'tests', 'api')),
    ...listSpecFiles(path.join(projectRoot, 'tests', 'functional')),
  ];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    const isApiFile = relative.startsWith('tests/api/');
    for (const block of collectTestBlocks(source)) {
      const marker = block.source.match(
        /\[([A-Za-z0-9][A-Za-z0-9_.-]{1,127}):API\]\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)\s+([A-Za-z][A-Za-z0-9_.-]*)/,
      );
      if (!isApiFile && !marker) continue;
      const titleId = block.title?.match(
        /^([A-Za-z0-9][A-Za-z0-9_.-]{1,127})\s*(?:\||—)/,
      )?.[1];
      const testcaseId = marker?.[1] ?? titleId;
      if (!testcaseId) {
        violations.push(violation(
          'API_TESTCASE_ID_MISSING',
          'Every API test needs a stable testcase ID in its literal title',
          { spec: relative, title: block.title },
        ));
        continue;
      }
      if (scopedIds.size > 0 && !scopedIds.has(testcaseId)) continue;
      if (!knownIds.has(testcaseId)) {
        violations.push(violation(
          'API_TEST_UNMAPPED',
          'API testcase is not present in the operation inventory',
          { spec: relative, testcase_id: testcaseId },
        ));
      }
      if (!marker) {
        violations.push(violation(
          'API_OPERATION_MARKER_MISSING',
          'API testcase has no canonical [testcase:API] marker',
          { spec: relative, testcase_id: testcaseId },
        ));
      }
    }
  }
  return violations;
}

export function verifyApiOperationCoverage({
  projectRoot = process.cwd(),
  inventoryPath = 'tests/api/api-operation-inventory.json',
  testcaseIds = [],
  operationIds = [],
} = {}) {
  const root = path.resolve(projectRoot);
  const reportViolations = [];
  let resolvedInventory;
  try {
    resolvedInventory = resolveInside(root, inventoryPath, 'inventory');
  } catch (error) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      mode: testcaseIds.length || operationIds.length ? 'scoped' : 'full',
      coverage_percent: 0,
      operations: [],
      violations: [violation('API_INVENTORY_PATH_UNSAFE', error.message)],
    };
  }
  if (!fs.existsSync(resolvedInventory)) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      mode: testcaseIds.length || operationIds.length ? 'scoped' : 'full',
      inventory: path.relative(root, resolvedInventory).replace(/\\/g, '/'),
      coverage_percent: 0,
      operations: [],
      violations: [violation('API_OPERATION_INVENTORY_MISSING', 'API operation inventory does not exist')],
    };
  }

  let inventory;
  try {
    inventory = JSON.parse(fs.readFileSync(resolvedInventory, 'utf8'));
  } catch (error) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      mode: testcaseIds.length || operationIds.length ? 'scoped' : 'full',
      inventory: path.relative(root, resolvedInventory).replace(/\\/g, '/'),
      coverage_percent: 0,
      operations: [],
      violations: [violation('API_OPERATION_INVENTORY_INVALID', error.message)],
    };
  }
  if (!isObject(inventory) || inventory.schema_version !== 1 || !Array.isArray(inventory.operations)) {
    return {
      schema_version: 1,
      status: 'BLOCKED',
      mode: testcaseIds.length || operationIds.length ? 'scoped' : 'full',
      inventory: path.relative(root, resolvedInventory).replace(/\\/g, '/'),
      coverage_percent: 0,
      operations: [],
      violations: [violation(
        'API_OPERATION_INVENTORY_INVALID',
        'Inventory requires schema_version=1 and operations[]',
      )],
    };
  }

  const normalized = inventory.operations.map(normalizeOperation);
  const keys = new Map();
  const ids = new Map();
  for (const operation of normalized) {
    const key = operationKey(operation);
    if (keys.has(key)) {
      reportViolations.push(violation(
        'API_OPERATION_DUPLICATE',
        'method/path/operation must be unique',
        { operation: key },
      ));
    }
    keys.set(key, operation.index);
    if (ids.has(operation.testcase_id)) {
      reportViolations.push(violation(
        'API_TESTCASE_MAPPING_DUPLICATE',
        'One testcase ID cannot ambiguously cover multiple operation rows',
        { testcase_id: operation.testcase_id },
      ));
    }
    ids.set(operation.testcase_id, operation.index);
  }

  const testcaseFilter = new Set(testcaseIds.map(String).map(value => value.trim()).filter(Boolean));
  const operationFilter = new Set(operationIds.map(String).map(value => value.trim()).filter(Boolean));
  const scoped = testcaseFilter.size > 0 || operationFilter.size > 0;
  const selected = normalized.filter(operation => {
    if (!scoped && !operation.required) return false;
    if (testcaseFilter.size > 0 && !testcaseFilter.has(operation.testcase_id)) return false;
    if (
      operationFilter.size > 0
      && !operationFilter.has(operation.operation)
      && !operationFilter.has(operationKey(operation))
    ) return false;
    return true;
  });
  if (selected.length === 0) {
    reportViolations.push(violation(
      'API_OPERATION_FILTER_EMPTY',
      'No operation matches the requested scope',
    ));
  }

  const operationReports = selected.map(operation => {
    const implementation = inspectImplementation(root, operation);
    return {
      key: operationKey(operation),
      method: operation.method,
      path: operation.path,
      operation: operation.operation,
      required: operation.required,
      mutates: operation.mutates,
      testcase_id: operation.testcase_id,
      spec: operation.spec,
      client: operation.client,
      auth: operation.auth,
      expected_status: operation.expected_status,
      schemas: operation.schemas,
      side_effects: operation.side_effects,
      cleanup: operation.cleanup,
      ...implementation,
    };
  });
  reportViolations.push(...operationReports.flatMap(item => item.violations));
  reportViolations.push(...discoverUnmappedTests(root, normalized, testcaseFilter));

  const covered = operationReports.filter(item => item.status === 'COVERED').length;
  const coveragePercent = operationReports.length === 0
    ? 0
    : Number(((covered / operationReports.length) * 100).toFixed(2));
  if (operationReports.length > 0 && coveragePercent !== 100) {
    reportViolations.push(violation(
      'API_OPERATION_COVERAGE_INCOMPLETE',
      'Selected API operation coverage must be 100%',
      { covered, selected: operationReports.length, coverage_percent: coveragePercent },
    ));
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: reportViolations.length === 0 ? 'PASS' : 'BLOCKED',
    mode: scoped ? 'scoped' : 'full',
    inventory: path.relative(root, resolvedInventory).replace(/\\/g, '/'),
    selected_testcase_ids: [...testcaseFilter].sort(),
    selected_operation_ids: [...operationFilter].sort(),
    required_operation_count: normalized.filter(item => item.required).length,
    selected_operation_count: operationReports.length,
    covered_operation_count: covered,
    coverage_percent: coveragePercent,
    operations: operationReports,
    violations: reportViolations,
  };
}

function splitValues(value) {
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

export function parseApiCoverageArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    inventoryPath: 'tests/api/api-operation-inventory.json',
    outputPath: 'reports/api-operation-coverage.json',
    testcaseIds: [],
    operationIds: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { ...options, help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + argument);
    if (argument === '--project-root') options.projectRoot = value;
    else if (argument === '--inventory') options.inventoryPath = value;
    else if (argument === '--output') options.outputPath = value;
    else if (argument === '--testcase-id') options.testcaseIds.push(...splitValues(value));
    else if (argument === '--operation') options.operationIds.push(...splitValues(value));
    else throw new Error('Unknown option: ' + argument);
    index += 1;
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/verify-api-operation-coverage.mjs [options]',
    '',
    '  --project-root <dir>      Automation project root (default: cwd)',
    '  --inventory <file>        Inventory relative to project root',
    '  --output <file>           JSON report relative to project root',
    '  --testcase-id <id,...>    Verify only exact testcase IDs (repeatable)',
    '  --operation <id,...>      Verify operation IDs or METHOD path#operation keys',
  ].join('\n');
}

export function runApiCoverageCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseApiCoverageArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const root = path.resolve(options.projectRoot);
  let output;
  try {
    output = resolveInside(root, options.outputPath, 'output');
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const report = verifyApiOperationCoverage(options);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(
    'API operation coverage ' + report.status
      + ': ' + report.covered_operation_count + '/' + report.selected_operation_count
      + ' (' + report.coverage_percent + '%)',
  );
  console.log('Report: ' + output);
  return report.status === 'PASS' ? 0 : 2;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) process.exitCode = runApiCoverageCli();
