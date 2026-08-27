#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SELECTION_DECISIONS = new Set(['AUTOMATE', 'DEFER', 'REJECT']);
const RETIREMENT_STATUSES = new Set(['ACTIVE', 'RETIRED']);
const NETWORK_MODES = new Set(['MOCK', 'HAR', 'OBSERVE']);
const ROUTE_ACTIONS = new Set(['FULFILL', 'ABORT', 'CONTINUE', 'HAR']);
const DB_MODES = new Set(['INTERNAL_API', 'DIRECT_SQL']);
const DB_DRIVERS = new Set(['pg', 'mysql2', 'knex']);
const WRITE_SQL_RE = /\b(?:insert|update|delete|merge|upsert|replace|alter|drop|truncate|create|grant|revoke|call|execute|exec)\b/i;
const SQL_PARAMETER_RE = /(?:\$\d+|\?|:\w+|@\w+)/;
const SENSITIVE_NAMES = new Set([
  'access_token', 'apikey', 'api_key', 'auth', 'authorization', 'cookie', 'password',
  'proxy-authorization', 'refresh_token', 'secret', 'session', 'set-cookie', 'token', 'x-api-key',
]);

function text(value) {
  return String(value ?? '').trim();
}

function safeRelativePath(value, allowedPrefixes, extensions = []) {
  const candidate = text(value).replaceAll('\\', '/');
  if (!candidate || path.isAbsolute(candidate) || candidate.startsWith('../') || candidate.includes('/../')) {
    return false;
  }
  if (!allowedPrefixes.some(prefix => candidate.startsWith(prefix))) return false;
  return extensions.length === 0 || extensions.some(extension => candidate.toLowerCase().endsWith(extension));
}

function selectionEvaluation(testcase) {
  const contract = testcase?.automation_selection;
  if (contract === undefined || contract === null) {
    return { status: 'LEGACY_INCLUDE', eligible: true, score: null, violations: [] };
  }
  const violations = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return {
      status: 'INVALID', eligible: false, score: null,
      violations: ['automation_selection must be an object'],
    };
  }
  const decision = text(contract.decision).toUpperCase();
  if (!SELECTION_DECISIONS.has(decision)) violations.push('decision must be AUTOMATE, DEFER or REJECT');
  const factors = ['execution_frequency', 'manual_cost', 'business_risk', 'maintenance_cost'];
  for (const factor of factors) {
    const value = Number(contract[factor]);
    if (!Number.isInteger(value) || value < 1 || value > 5) violations.push(`${factor} must be an integer from 1 to 5`);
  }
  if (!text(contract.rationale)) violations.push('rationale is required');
  const retirement = contract.retirement;
  let retirementStatus = 'ACTIVE';
  if (retirement !== undefined && retirement !== null) {
    if (!retirement || typeof retirement !== 'object' || Array.isArray(retirement)) {
      violations.push('retirement must be an object');
    } else {
      retirementStatus = text(retirement.status).toUpperCase();
      if (!RETIREMENT_STATUSES.has(retirementStatus)) violations.push('retirement.status must be ACTIVE or RETIRED');
      if (retirementStatus === 'RETIRED') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text(retirement.date))) violations.push('retirement.date must use YYYY-MM-DD');
        if (!text(retirement.reason)) violations.push('retirement.reason is required when status is RETIRED');
      }
    }
  }
  const maintenance = Number(contract.maintenance_cost);
  const score = factors.every(factor => Number.isInteger(Number(contract[factor]))) && maintenance > 0
    ? Number(((Number(contract.execution_frequency) * Number(contract.manual_cost) * Number(contract.business_risk)) / maintenance).toFixed(2))
    : null;
  return {
    status: violations.length > 0 ? 'INVALID' : decision,
    eligible: violations.length === 0 && decision === 'AUTOMATE' && retirementStatus !== 'RETIRED',
    decision,
    retirement_status: retirementStatus,
    score,
    violations,
  };
}

function violation(violations, testcaseId, code, message) {
  violations.push({ testcase_id: testcaseId, code, message });
}

function normalizeSensitiveName(value) {
  return text(value).toLowerCase().replaceAll('-', '_');
}

function isSensitiveName(value) {
  const normalized = normalizeSensitiveName(value);
  return SENSITIVE_NAMES.has(text(value).toLowerCase()) || SENSITIVE_NAMES.has(normalized);
}

function normalizeAllowedHost(value) {
  const candidate = text(value).toLowerCase();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.host.toLowerCase();
  } catch {
    return '';
  }
}

function collectSensitiveJsonKeys(value, prefix = '', findings = []) {
  if (!value || typeof value !== 'object') return findings;
  for (const [key, nested] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (isSensitiveName(key)) findings.push(field);
    collectSensitiveJsonKeys(nested, field, findings);
  }
  return findings;
}

function inspectJsonText(value, location, entryIndex, findings) {
  if (!text(value)) return;
  try {
    const parsed = JSON.parse(value);
    for (const field of collectSensitiveJsonKeys(parsed)) {
      findings.push({
        code: 'HAR_SENSITIVE_BODY_FIELD',
        message: `HAR entry ${entryIndex} contains sensitive JSON field ${field} in ${location}`,
      });
    }
  } catch {
    // Non-JSON bodies are allowed; deterministic secret-field inspection is not possible for them.
  }
}

function inspectHarArtifact(harPath, { allowedHosts = [] } = {}) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  } catch {
    return { status: 'BLOCKED', entry_count: 0, findings: [{ code: 'HAR_INVALID_JSON', message: 'HAR file must contain valid JSON' }] };
  }
  const entries = parsed?.log?.entries;
  if (!Array.isArray(entries)) {
    return { status: 'BLOCKED', entry_count: 0, findings: [{ code: 'HAR_ENTRIES_MISSING', message: 'HAR log.entries[] is required' }] };
  }
  if (entries.length === 0) {
    return { status: 'BLOCKED', entry_count: 0, findings: [{ code: 'HAR_ENTRIES_MISSING', message: 'HAR log.entries[] must contain at least one entry' }] };
  }
  const hostSet = new Set(allowedHosts.map(normalizeAllowedHost).filter(Boolean));
  for (const [entryIndex, entry] of entries.entries()) {
    const request = entry?.request || {};
    const response = entry?.response || {};
    let requestUrl;
    try {
      requestUrl = new URL(text(request.url));
      if (requestUrl.username || requestUrl.password) {
        findings.push({ code: 'HAR_EMBEDDED_CREDENTIAL', message: `HAR entry ${entryIndex} URL contains embedded credentials` });
      }
      if (!hostSet.has(requestUrl.host.toLowerCase())) {
        findings.push({ code: 'HAR_HOST_NOT_ALLOWED', message: `HAR entry ${entryIndex} host ${requestUrl.host} is not in allowed_hosts` });
      }
      for (const name of requestUrl.searchParams.keys()) {
        if (isSensitiveName(name)) {
          findings.push({ code: 'HAR_SENSITIVE_QUERY', message: `HAR entry ${entryIndex} URL contains sensitive query field ${name}` });
        }
      }
    } catch {
      findings.push({ code: 'HAR_REQUEST_URL_INVALID', message: `HAR entry ${entryIndex} request URL is invalid` });
    }
    for (const [side, message] of [[request, 'request'], [response, 'response']]) {
      for (const header of Array.isArray(side.headers) ? side.headers : []) {
        if (isSensitiveName(header?.name)) {
          findings.push({ code: 'HAR_SENSITIVE_HEADER', message: `HAR entry ${entryIndex} ${message} contains sensitive header ${text(header.name)}` });
        }
      }
      if (Array.isArray(side.cookies) && side.cookies.length > 0) {
        findings.push({ code: 'HAR_COOKIE_PRESENT', message: `HAR entry ${entryIndex} ${message} contains cookies` });
      }
    }
    for (const parameter of Array.isArray(request.queryString) ? request.queryString : []) {
      if (isSensitiveName(parameter?.name)) {
        findings.push({ code: 'HAR_SENSITIVE_QUERY', message: `HAR entry ${entryIndex} queryString contains sensitive field ${text(parameter.name)}` });
      }
    }
    for (const parameter of Array.isArray(request.postData?.params) ? request.postData.params : []) {
      if (isSensitiveName(parameter?.name)) {
        findings.push({ code: 'HAR_SENSITIVE_BODY_FIELD', message: `HAR entry ${entryIndex} postData contains sensitive field ${text(parameter.name)}` });
      }
    }
    inspectJsonText(request.postData?.text, 'request body', entryIndex, findings);
    inspectJsonText(response.content?.text, 'response body', entryIndex, findings);
  }
  return { status: findings.length === 0 ? 'PASS' : 'BLOCKED', entry_count: entries.length, findings };
}

function implementationExports(filePath, exportName) {
  if (!fs.existsSync(filePath)) return false;
  const source = fs.readFileSync(filePath, 'utf8');
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b`).test(source)
    || new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
}

function stripSqlCommentsAndStrings(sql) {
  const source = String(sql);
  let output = '';
  let state = 'NORMAL';
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === 'LINE_COMMENT') {
      if (current === '\n' || current === '\r') {
        state = 'NORMAL';
        output += current;
      }
      continue;
    }
    if (state === 'BLOCK_COMMENT') {
      if (current === '*' && next === '/') {
        state = 'NORMAL';
        output += ' ';
        index += 1;
      }
      continue;
    }
    if (state === 'SINGLE_QUOTE') {
      if (current === "'" && next === "'") {
        index += 1;
      } else if (current === "'") {
        state = 'NORMAL';
        output += "''";
      }
      continue;
    }
    if (state === 'DOUBLE_QUOTE') {
      if (current === '"' && next === '"') {
        index += 1;
      } else if (current === '"') {
        state = 'NORMAL';
        output += '""';
      }
      continue;
    }
    if (current === '-' && next === '-') {
      state = 'LINE_COMMENT';
      output += ' ';
      index += 1;
    } else if (current === '/' && next === '*') {
      state = 'BLOCK_COMMENT';
      output += ' ';
      index += 1;
    } else if (current === "'") {
      state = 'SINGLE_QUOTE';
      output += ' ';
    } else if (current === '"') {
      state = 'DOUBLE_QUOTE';
      output += ' ';
    } else {
      output += current;
    }
  }
  return output;
}

function validateNetwork(testcase, context, violations) {
  const contract = testcase.network_interception;
  if (contract === undefined || contract === null) return;
  const id = testcase.testcase_id || testcase.id;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    violation(violations, id, 'NETWORK_CONTRACT_INVALID', 'network_interception must be an object');
    return;
  }
  const mode = text(contract.mode).toUpperCase();
  if (!NETWORK_MODES.has(mode)) violation(violations, id, 'NETWORK_MODE_INVALID', 'mode must be MOCK, HAR or OBSERVE');
  if (!(testcase.capabilities || []).includes('ui')) {
    violation(violations, id, 'NETWORK_UI_CAPABILITY_REQUIRED', 'page interception requires UI capability');
  }
  const routes = Array.isArray(contract.routes) ? contract.routes : [];
  if (routes.length === 0) violation(violations, id, 'NETWORK_ROUTES_MISSING', 'routes[] must contain at least one route');
  const actionsByMode = {
    MOCK: new Set(['FULFILL', 'ABORT']),
    HAR: new Set(['HAR']),
    OBSERVE: new Set(['CONTINUE']),
  };
  for (const [index, route] of routes.entries()) {
    const action = text(route?.action).toUpperCase();
    if (!text(route?.pattern)) violation(violations, id, 'NETWORK_ROUTE_PATTERN_MISSING', `routes[${index}].pattern is required`);
    if (!ROUTE_ACTIONS.has(action)) violation(violations, id, 'NETWORK_ROUTE_ACTION_INVALID', `routes[${index}].action is invalid`);
    if (actionsByMode[mode] && !actionsByMode[mode].has(action)) {
      violation(violations, id, 'NETWORK_MODE_ACTION_MISMATCH', `routes[${index}].action=${action || 'missing'} is incompatible with mode=${mode}`);
    }
    if (action === 'FULFILL') {
      if (!Number.isInteger(route.status) || route.status < 100 || route.status > 599) {
        violation(violations, id, 'NETWORK_FULFILL_STATUS_INVALID', `routes[${index}].status must be an integer from 100 to 599`);
      }
      if (!safeRelativePath(route.fixture_file, ['test-data/fixtures/'], ['.json'])) {
        violation(violations, id, 'NETWORK_FIXTURE_PATH_INVALID', `routes[${index}].fixture_file must be a JSON file below test-data/fixtures/`);
      } else if (context.checkRuntimeAssets && !fs.existsSync(path.resolve(context.projectRoot, route.fixture_file))) {
        violation(violations, id, 'NETWORK_FIXTURE_MISSING', `${route.fixture_file} does not exist`);
      }
    }
  }
  if (['MOCK', 'HAR'].includes(mode)) {
    const realId = text(contract.real_flow_testcase_id);
    if (!realId || realId === id) {
      violation(violations, id, 'REAL_FLOW_TESTCASE_REQUIRED', 'mock/HAR cases require a different real_flow_testcase_id');
    } else if (context.availableTestcaseIds.size > 0 && !context.availableTestcaseIds.has(realId)) {
      violation(violations, id, 'REAL_FLOW_TESTCASE_UNKNOWN', `real_flow_testcase_id ${realId} is not present in the source manifest`);
    }
  }
  if (mode === 'HAR') {
    if (text(contract.service_workers).toLowerCase() !== 'block') {
      violation(violations, id, 'HAR_SERVICE_WORKERS_NOT_BLOCKED', 'HAR playback requires service_workers=block');
    }
    if (contract.sanitized !== true) violation(violations, id, 'HAR_SANITIZATION_UNCONFIRMED', 'HAR playback requires sanitized=true');
    const allowedHosts = Array.isArray(contract.allowed_hosts) ? contract.allowed_hosts : [];
    if (allowedHosts.length === 0 || allowedHosts.some(host => !normalizeAllowedHost(host))) {
      violation(violations, id, 'HAR_ALLOWED_HOSTS_INVALID', 'HAR playback requires non-empty allowed_hosts with exact approved hosts');
    }
    if (!safeRelativePath(contract.har_file, ['test-data/hars/'], ['.har'])) {
      violation(violations, id, 'HAR_PATH_INVALID', 'har_file must be an inspectable .har JSON file below test-data/hars/');
    } else if (context.checkRuntimeAssets) {
      const harPath = path.resolve(context.projectRoot, contract.har_file);
      if (!fs.existsSync(harPath)) {
        violation(violations, id, 'HAR_FILE_MISSING', `${contract.har_file} does not exist`);
      } else if (allowedHosts.length > 0) {
        const inspection = inspectHarArtifact(harPath, { allowedHosts });
        for (const finding of inspection.findings) violation(violations, id, finding.code, finding.message);
      }
    }
  }
  const implementationPathValid = safeRelativePath(contract.implementation_file, ['src/shared/helpers/'], ['.ts', '.js', '.mjs']);
  if (!implementationPathValid) {
    violation(violations, id, 'NETWORK_IMPLEMENTATION_PATH_INVALID', 'implementation_file must stay below src/shared/helpers/');
  } else if (context.checkRuntimeAssets) {
    const implementationPath = path.resolve(context.projectRoot, contract.implementation_file);
    if (!fs.existsSync(implementationPath)) {
      violation(violations, id, 'NETWORK_IMPLEMENTATION_MISSING', `${contract.implementation_file} does not exist`);
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text(contract.implementation_export))
      && !implementationExports(implementationPath, text(contract.implementation_export))) {
      violation(violations, id, 'NETWORK_IMPLEMENTATION_EXPORT_MISSING', `${contract.implementation_export} is not exported by ${contract.implementation_file}`);
    }
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text(contract.implementation_export))) {
    violation(violations, id, 'NETWORK_IMPLEMENTATION_EXPORT_INVALID', 'implementation_export must be a valid exported identifier');
  }
}

function packageDependencies(projectRoot) {
  const packagePath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return new Set([
    ...Object.keys(parsed.dependencies || {}),
    ...Object.keys(parsed.devDependencies || {}),
  ]);
}

function validateDb(testcase, context, violations) {
  const contract = testcase.db_verification;
  if (contract === undefined || contract === null) return;
  const id = testcase.testcase_id || testcase.id;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    violation(violations, id, 'DB_CONTRACT_INVALID', 'db_verification must be an object');
    return;
  }
  const mode = text(contract.mode).toUpperCase();
  if (!DB_MODES.has(mode)) violation(violations, id, 'DB_MODE_INVALID', 'mode must be INTERNAL_API or DIRECT_SQL');
  if (contract.read_only !== true) violation(violations, id, 'DB_READ_ONLY_REQUIRED', 'db_verification requires read_only=true');
  const implementationPathValid = safeRelativePath(contract.implementation_file, ['src/shared/helpers/'], ['.ts', '.js', '.mjs']);
  if (!implementationPathValid) {
    violation(violations, id, 'DB_IMPLEMENTATION_PATH_INVALID', 'implementation_file must stay below src/shared/helpers/');
  } else if (context.checkRuntimeAssets) {
    const implementationPath = path.resolve(context.projectRoot, contract.implementation_file);
    if (!fs.existsSync(implementationPath)) {
      violation(violations, id, 'DB_IMPLEMENTATION_MISSING', `${contract.implementation_file} does not exist`);
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text(contract.implementation_export))
      && !implementationExports(implementationPath, text(contract.implementation_export))) {
      violation(violations, id, 'DB_IMPLEMENTATION_EXPORT_MISSING', `${contract.implementation_export} is not exported by ${contract.implementation_file}`);
    }
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text(contract.implementation_export))) {
    violation(violations, id, 'DB_IMPLEMENTATION_EXPORT_INVALID', 'implementation_export must be a valid exported identifier');
  }
  const polling = contract.polling;
  if (polling !== undefined) {
    const timeout = Number(polling?.timeout_ms);
    const intervals = polling?.intervals_ms;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
      violation(violations, id, 'DB_POLL_TIMEOUT_INVALID', 'polling.timeout_ms must be an integer from 100 to 60000');
    }
    if (!Array.isArray(intervals) || intervals.length === 0 || intervals.some(value => !Number.isInteger(Number(value)) || Number(value) < 50)) {
      violation(violations, id, 'DB_POLL_INTERVALS_INVALID', 'polling.intervals_ms must contain positive integer intervals >= 50');
    }
  }
  if (mode === 'INTERNAL_API') {
    if (!text(contract.operation_ref)) violation(violations, id, 'DB_INTERNAL_OPERATION_MISSING', 'INTERNAL_API requires operation_ref');
    if (text(contract.proof_kind).toUpperCase() !== 'PERSISTENCE_READ_MODEL') {
      violation(violations, id, 'DB_PROOF_KIND_INVALID', 'INTERNAL_API requires proof_kind=PERSISTENCE_READ_MODEL and is not direct SQL evidence');
    }
  }
  if (mode === 'DIRECT_SQL') {
    const driver = text(contract.driver);
    if (!DB_DRIVERS.has(driver)) violation(violations, id, 'DB_DRIVER_INVALID', 'DIRECT_SQL driver must be pg, mysql2 or knex');
    if (!/^[A-Z][A-Z0-9_]*$/.test(text(contract.credential_env))) {
      violation(violations, id, 'DB_CREDENTIAL_ENV_INVALID', 'credential_env must be an environment variable name, not a connection string');
    } else if (context.checkCredentials && !text(context.env[text(contract.credential_env)])) {
      violation(violations, id, 'DB_CREDENTIAL_MISSING', `${contract.credential_env} is not available for RUN`);
    }
    if (contract.parameterized !== true) violation(violations, id, 'DB_PARAMETERIZATION_REQUIRED', 'DIRECT_SQL requires parameterized=true');
    if (!safeRelativePath(contract.query_file, ['test-data/sql/'], ['.sql'])) {
      violation(violations, id, 'DB_QUERY_PATH_INVALID', 'query_file must be a .sql file below test-data/sql/');
    } else if (context.checkRuntimeAssets) {
      const queryPath = path.resolve(context.projectRoot, contract.query_file);
      if (!fs.existsSync(queryPath)) {
        violation(violations, id, 'DB_QUERY_MISSING', `${contract.query_file} does not exist`);
      } else {
        const sql = fs.readFileSync(queryPath, 'utf8');
        const executableSql = stripSqlCommentsAndStrings(sql).trim();
        const withoutFinalSemicolon = executableSql.replace(/;\s*$/, '');
        if (WRITE_SQL_RE.test(executableSql)) violation(violations, id, 'DB_WRITE_SQL_FORBIDDEN', 'query_file contains a write/admin SQL keyword');
        if (!/^select\b/i.test(executableSql)) violation(violations, id, 'DB_SELECT_REQUIRED', 'query_file must start with SELECT');
        if (withoutFinalSemicolon.includes(';')) violation(violations, id, 'DB_MULTIPLE_STATEMENTS_FORBIDDEN', 'query_file must contain exactly one SELECT statement');
        if (!SQL_PARAMETER_RE.test(executableSql)) violation(violations, id, 'DB_QUERY_NOT_PARAMETERIZED', 'query_file must contain a parameter placeholder');
      }
      if (driver && !context.dependencies.has(driver)) {
        violation(violations, id, 'DB_DRIVER_MISSING', `${driver} is not declared in package.json`);
      }
    }
  }
  if (text(contract.scope).toUpperCase() === 'RECONCILIATION') {
    violation(violations, id, 'DB_RECONCILIATION_HANDOFF', 'large source-to-target reconciliation must route to dynamic-data-quality');
  }
}

function verifyAdvancedTestContracts({
  plan,
  projectRoot = process.cwd(),
  checkRuntimeAssets = false,
  checkCredentials = false,
  env = process.env,
}) {
  const testcases = Array.isArray(plan?.testcases) ? plan.testcases : [];
  const availableTestcaseIds = new Set(plan?.selection?.available_testcase_ids || testcases.map(item => item.testcase_id));
  const context = {
    projectRoot: path.resolve(projectRoot),
    checkRuntimeAssets,
    checkCredentials,
    env,
    availableTestcaseIds,
    dependencies: checkRuntimeAssets ? packageDependencies(projectRoot) : new Set(),
  };
  const violations = [];
  for (const testcase of testcases) {
    const selection = selectionEvaluation(testcase);
    for (const message of selection.violations) violation(violations, testcase.testcase_id, 'SELECTION_CONTRACT_INVALID', message);
    if (testcase.automation_selection && !selection.eligible) {
      violation(violations, testcase.testcase_id, 'SELECTION_NOT_AUTOMATABLE', 'selected testcase must use decision=AUTOMATE and must not be RETIRED');
    }
    validateNetwork(testcase, context, violations);
    validateDb(testcase, context, violations);
  }
  return {
    schema_version: 1,
    status: violations.length === 0 ? 'PASS' : 'BLOCKED',
    runtime_assets_checked: checkRuntimeAssets,
    credentials_checked: checkCredentials,
    testcase_count: testcases.length,
    contracts: {
      selection: testcases.filter(item => item.automation_selection).length,
      network_interception: testcases.filter(item => item.network_interception).length,
      db_verification: testcases.filter(item => item.db_verification).length,
    },
    violations,
  };
}

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

async function main() {
  const planPath = path.resolve(getArg('--plan'));
  if (!getArg('--plan') || !fs.existsSync(planPath)) throw new Error('BLOCKED: --plan must reference an existing POM plan');
  const projectRoot = path.resolve(getArg('--project-root', '.'));
  const report = verifyAdvancedTestContracts({
    plan: JSON.parse(fs.readFileSync(planPath, 'utf8')),
    projectRoot,
    checkRuntimeAssets: process.argv.includes('--check-runtime-assets'),
    checkCredentials: process.argv.includes('--check-credentials'),
  });
  const output = getArg('--output');
  if (output) {
    const outputPath = path.resolve(output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'PASS') process.exitCode = 2;
}

export { inspectHarArtifact, selectionEvaluation, stripSqlCommentsAndStrings, verifyAdvancedTestContracts };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[advanced-test-contracts] ${error.message}`);
    process.exitCode = 2;
  });
}
