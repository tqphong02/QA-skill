#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveModuleIdentity } from './artifact-naming.mjs';

const LIMIT_KEYS = [
  'routes_per_module',
  'selectors_per_module',
  'actions_per_page',
  'api_operations_per_client',
  'schema_variants_per_operation',
  'lines_per_generated_file',
];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value ?? null))).digest('hex');
}

function getArgs(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function getArg(flag, fallback = '') {
  return getArgs(flag)[0] || fallback;
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) {
    throw new Error(`BLOCKED: ${label}_INVALID_JSON: ${filePath}: ${error.message}`);
  }
}

function loadLimits(configPath) {
  const config = readJson(configPath, 'COMPLEXITY_CONFIG');
  if (config.schema_version !== 1 || !config.limits || typeof config.limits !== 'object') {
    throw new Error('BLOCKED: COMPLEXITY_CONFIG_SCHEMA_INVALID');
  }
  for (const key of LIMIT_KEYS) {
    if (!Number.isInteger(config.limits[key]) || config.limits[key] < 1) {
      throw new Error(`BLOCKED: COMPLEXITY_LIMIT_INVALID: ${key}`);
    }
  }
  return config.limits;
}

function apiContract(testcase) {
  const api = testcase?.api && typeof testcase.api === 'object' ? testcase.api : null;
  if (!api) return null;
  return {
    method: String(api.method || '').toUpperCase(),
    endpoint: String(api.endpoint || api.path || ''),
    expected_status: Number(api.expected_status),
    request_schema: api.request_schema ?? api.body,
    response_schema: api.expected_schema ?? api.expected_body,
    has_body: api.body !== undefined,
    cleanup: api.cleanup,
  };
}

function verifyAutomationComplexity({ planPaths, projectRoot = '.', configPath, codegenReportPath }) {
  if (!planPaths?.length) throw new Error('BLOCKED: COMPLEXITY_PLAN_REQUIRED');
  const root = path.resolve(projectRoot);
  const resolvedConfig = path.resolve(configPath || path.join(root, 'automation-complexity.json'));
  const limits = loadLimits(resolvedConfig);
  const plans = planPaths.map(input => readJson(path.resolve(input), 'POM_PLAN'));
  const identity = resolveModuleIdentity(plans[0]?.module);
  if (plans.some(plan => resolveModuleIdentity(plan.module).key !== identity.key)) {
    throw new Error('BLOCKED: COMPLEXITY_REQUIRES_ONE_MODULE');
  }
  const testcases = plans.flatMap(plan => plan.testcases || []);
  const routes = new Set();
  const selectors = new Set();
  const actions = new Set();
  const apiOperations = new Set();
  const variants = new Map();
  for (const testcase of testcases) {
    if (testcase.entry?.route) routes.add(String(testcase.entry.route));
    if (testcase.outcome_route) routes.add(String(testcase.outcome_route));
    for (const route of Object.values(testcase.selector_target_routes || {})) if (route) routes.add(String(route));
    for (const selector of testcase.selector_target_keys || []) selectors.add(String(selector));
    for (const step of testcase.steps || []) if (step.required_method) actions.add(String(step.required_method));
    const api = apiContract(testcase);
    if (!api) continue;
    const operationKey = `${api.method} ${api.endpoint}`;
    apiOperations.add(operationKey);
    if (!variants.has(operationKey)) variants.set(operationKey, new Set());
    if (api.has_body) variants.get(operationKey).add(`request:${fingerprint(api.request_schema)}`);
    variants.get(operationKey).add(`response:${api.expected_status}:${fingerprint(api.response_schema)}`);
    if (api.cleanup && typeof api.cleanup === 'object') {
      apiOperations.add(`${String(api.cleanup.method || '').toUpperCase()} ${String(api.cleanup.endpoint || api.cleanup.path || '')}`);
    }
  }

  const metrics = {
    routes_per_module: routes.size,
    selectors_per_module: selectors.size,
    actions_per_page: actions.size,
    api_operations_per_client: apiOperations.size,
    schema_variants_per_operation: Math.max(0, ...[...variants.values()].map(items => items.size)),
    lines_per_generated_file: 0,
  };
  const files = [];
  const violations = [];
  if (codegenReportPath && !fs.existsSync(codegenReportPath)) {
    violations.push({ code: 'COMPLEXITY_CODEGEN_REPORT_MISSING', file: codegenReportPath });
  } else if (codegenReportPath) {
    const report = readJson(codegenReportPath, 'CODEGEN_REPORT');
    for (const artifact of report.artifacts || []) {
      const filePath = path.resolve(root, artifact.path);
      const relative = path.relative(root, filePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        violations.push({ code: 'COMPLEXITY_ARTIFACT_OUTSIDE_PROJECT', file: artifact.path });
        continue;
      }
      if (!fs.existsSync(filePath)) {
        violations.push({ code: 'COMPLEXITY_ARTIFACT_MISSING', file: artifact.path });
        continue;
      }
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
      files.push({ path: artifact.path, lines });
      metrics.lines_per_generated_file = Math.max(metrics.lines_per_generated_file, lines);
    }
  }
  for (const key of LIMIT_KEYS) {
    if (metrics[key] > limits[key]) {
      violations.push({ code: 'COMPLEXITY_LIMIT_EXCEEDED', metric: key, actual: metrics[key], limit: limits[key] });
    }
  }
  for (const file of files.filter(item => item.lines > limits.lines_per_generated_file)) {
    violations.push({ code: 'GENERATED_FILE_TOO_LONG', file: file.path, actual: file.lines, limit: limits.lines_per_generated_file });
  }
  return {
    schema_version: 1,
    status: violations.length ? 'BLOCKED' : 'PASS',
    module: identity,
    limits,
    metrics,
    generated_files: files,
    violations,
  };
}

function main() {
  const projectRoot = path.resolve(getArg('--project-root', '.'));
  const result = verifyAutomationComplexity({
    planPaths: getArgs('--plan'),
    projectRoot,
    configPath: getArg('--config', path.join(projectRoot, 'automation-complexity.json')),
    codegenReportPath: getArg('--codegen-report', path.join(projectRoot, 'reports', 'pom-codegen.json')),
  });
  const outputPath = path.resolve(getArg('--output', path.join(projectRoot, 'reports', 'automation-complexity.json')));
  const outputRelative = path.relative(projectRoot, outputPath);
  if (!outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) {
    throw new Error(`BLOCKED: COMPLEXITY_OUTPUT_OUTSIDE_PROJECT: ${outputPath}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 2;
}

export { LIMIT_KEYS, loadLimits, verifyAutomationComplexity };

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  try { main(); } catch (error) {
    console.error(`[automation-complexity] ${error.message}`);
    process.exitCode = 2;
  }
}
