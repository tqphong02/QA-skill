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
  for (const [index, route] of routes.entries()) {
    const action = text(route?.action).toUpperCase();
    if (!text(route?.pattern)) violation(violations, id, 'NETWORK_ROUTE_PATTERN_MISSING', `routes[${index}].pattern is required`);
    if (!ROUTE_ACTIONS.has(action)) violation(violations, id, 'NETWORK_ROUTE_ACTION_INVALID', `routes[${index}].action is invalid`);
    if (action === 'FULFILL') {
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
    if (!safeRelativePath(contract.har_file, ['test-data/hars/'], ['.har', '.zip'])) {
      violation(violations, id, 'HAR_PATH_INVALID', 'har_file must stay below test-data/hars/');
    } else if (context.checkRuntimeAssets && !fs.existsSync(path.resolve(context.projectRoot, contract.har_file))) {
      violation(violations, id, 'HAR_FILE_MISSING', `${contract.har_file} does not exist`);
    }
  }
  if (!safeRelativePath(contract.implementation_file, ['src/shared/helpers/'], ['.ts', '.js', '.mjs'])) {
    violation(violations, id, 'NETWORK_IMPLEMENTATION_PATH_INVALID', 'implementation_file must stay below src/shared/helpers/');
  } else if (context.checkRuntimeAssets && !fs.existsSync(path.resolve(context.projectRoot, contract.implementation_file))) {
    violation(violations, id, 'NETWORK_IMPLEMENTATION_MISSING', `${contract.implementation_file} does not exist`);
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
  if (!safeRelativePath(contract.implementation_file, ['src/shared/helpers/'], ['.ts', '.js', '.mjs'])) {
    violation(violations, id, 'DB_IMPLEMENTATION_PATH_INVALID', 'implementation_file must stay below src/shared/helpers/');
  } else if (context.checkRuntimeAssets && !fs.existsSync(path.resolve(context.projectRoot, contract.implementation_file))) {
    violation(violations, id, 'DB_IMPLEMENTATION_MISSING', `${contract.implementation_file} does not exist`);
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
        if (WRITE_SQL_RE.test(sql)) violation(violations, id, 'DB_WRITE_SQL_FORBIDDEN', 'query_file contains a write/admin SQL keyword');
        if (!/^\s*(?:--[^\n]*\n\s*)*select\b/i.test(sql)) violation(violations, id, 'DB_SELECT_REQUIRED', 'query_file must start with SELECT');
        if (!/(?:\$\d+|\?|:\w+|@\w+)/.test(sql)) violation(violations, id, 'DB_QUERY_NOT_PARAMETERIZED', 'query_file must contain a parameter placeholder');
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

function verifyAdvancedTestContracts({ plan, projectRoot = process.cwd(), checkRuntimeAssets = false }) {
  const testcases = Array.isArray(plan?.testcases) ? plan.testcases : [];
  const availableTestcaseIds = new Set(plan?.selection?.available_testcase_ids || testcases.map(item => item.testcase_id));
  const context = {
    projectRoot: path.resolve(projectRoot),
    checkRuntimeAssets,
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

export { selectionEvaluation, verifyAdvancedTestContracts };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[advanced-test-contracts] ${error.message}`);
    process.exitCode = 2;
  });
}
