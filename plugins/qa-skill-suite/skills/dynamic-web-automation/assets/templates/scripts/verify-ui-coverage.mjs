#!/usr/bin/env node

/**
 * Verify that a Browser MCP UI function inventory is fully represented by the
 * testcase manifest. Selector traceability can only audit known targets; this
 * gate also detects UI functions that never made it into the manifest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseAutomationManifest } from './verify-testcase-traceability.mjs';

const BROWSER_MCP_PROVIDERS = new Set(['playwright-mcp', 'chrome-devtools-mcp']);
const BROWSER_MCP_TOOLS = Object.freeze({
  'playwright-mcp': ['browser_navigate', 'browser_snapshot', 'browser_evaluate'],
  'chrome-devtools-mcp': ['navigate_page', 'take_snapshot', 'evaluate_script'],
});
const COVERAGE_ACTIONS = new Set([
  'click', 'fill', 'select', 'select_option', 'check', 'uncheck', 'press',
  'hover', 'drag', 'upload', 'download', 'dialog_accept', 'dialog_dismiss',
  'popup', 'navigate', 'assert', 'wait', 'observe',
]);
const ACTION_ALIASES = Object.freeze({
  input: 'fill',
  type: 'fill',
  selectoption: 'select_option',
  'select-option': 'select_option',
  tap: 'click',
  inspect: 'observe',
});

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function list(value) {
  return (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value])
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeProvider(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (normalized === 'playwright' || normalized === 'playwrightmcp') return 'playwright-mcp';
  if (normalized === 'chromedevtools' || normalized === 'chromedevtoolsmcp') return 'chrome-devtools-mcp';
  return normalized;
}

function normalizeAction(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  return ACTION_ALIASES[raw] || raw;
}

function normalizeRoute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withoutBasePlaceholder = raw
    .replace(/^<BASE_URL>/i, '')
    .replace(/^\{\{BASE_URL\}\}/i, '');
  try {
    const parsed = new URL(withoutBasePlaceholder);
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return withoutBasePlaceholder.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  }
}

function routeMatches(left, right) {
  const a = normalizeRoute(left);
  const b = normalizeRoute(right);
  return !a || !b || a === b;
}

function sameValue(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function browserMcpTools(inventory) {
  return unique([
    ...list(inventory.tools_used),
    ...list(inventory.mcp?.tools_used),
  ]);
}

function validIso(value) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function flattenInventoryFunctions(inventory) {
  if (Array.isArray(inventory.functions)) return inventory.functions;
  if (!Array.isArray(inventory.routes)) return [];
  return inventory.routes.flatMap(route => {
    const routeFunctions = route.functions || route.controls || route.actions || [];
    return (Array.isArray(routeFunctions) ? routeFunctions : []).map(item => ({
      ...item,
      route: item.route ?? route.route ?? route.path,
      state: item.state ?? route.state ?? route.state_key,
      role_key: item.role_key ?? route.role_key ?? route.role,
    }));
  });
}

function normalizeFunctions(inventory, violations) {
  const rawFunctions = flattenInventoryFunctions(inventory);
  const seen = new Set();
  const functions = [];
  for (const [index, raw] of rawFunctions.entries()) {
    const functionKey = String(raw?.function_key || raw?.key || raw?.id || '').trim();
    if (!functionKey) {
      violations.push({ code: 'UI_FUNCTION_KEY_MISSING', index });
      continue;
    }
    if (seen.has(functionKey)) {
      violations.push({ code: 'UI_FUNCTION_KEY_DUPLICATE', function_key: functionKey });
      continue;
    }
    seen.add(functionKey);
    const targetKeys = unique(list(raw.target_keys ?? raw.target_key ?? raw.targets));
    const actions = unique(list(raw.required_actions ?? raw.actions ?? raw.action).map(normalizeAction));
    const route = normalizeRoute(raw.route ?? raw.path);
    const state = String(raw.state_key ?? raw.state ?? '').trim();
    const roleKey = String(raw.role_key ?? raw.role ?? '').trim();
    const coverageRequired = raw.coverage_required !== false;
    const exemptionReason = String(raw.exemption_reason || raw.exempt_reason || '').trim();
    if (!route) violations.push({ code: 'UI_FUNCTION_ROUTE_MISSING', function_key: functionKey });
    if (!state) violations.push({ code: 'UI_FUNCTION_STATE_MISSING', function_key: functionKey });
    if (targetKeys.length === 0) violations.push({ code: 'UI_FUNCTION_TARGET_MISSING', function_key: functionKey });
    if (coverageRequired === false && !exemptionReason) {
      violations.push({ code: 'UI_FUNCTION_EXEMPTION_REASON_MISSING', function_key: functionKey });
    }
    if (actions.some(action => !COVERAGE_ACTIONS.has(action))) {
      violations.push({
        code: 'UI_FUNCTION_ACTION_INVALID',
        function_key: functionKey,
        actions,
      });
    }
    functions.push({
      function_key: functionKey,
      name: String(raw.name || raw.label || functionKey).trim(),
      kind: String(raw.kind || 'action').trim(),
      route,
      state,
      role_key: roleKey || null,
      target_keys: targetKeys,
      actions,
      coverage_required: coverageRequired,
      exemption_reason: exemptionReason || null,
      source: raw.source || raw.source_ref || null,
    });
  }
  if (functions.length === 0) violations.push({ code: 'UI_FUNCTION_INVENTORY_EMPTY' });
  return functions;
}

function caseReferences(testcase) {
  return new Set(list(testcase.ui_function_keys));
}

function caseClaims(testcase) {
  return Object.entries(testcase.actions_by_target || {})
    .map(([targetKey, records]) => ({
      testcase_id: testcase.id,
      target_key: targetKey,
      actions: unique((Array.isArray(records) ? records : []).map(item => normalizeAction(item.action))),
      route: testcase.target_routes?.[targetKey] || testcase.entry?.route || '',
      role_key: testcase.role_key || testcase.entry?.role_key || '',
    }))
    .filter(claim => claim.actions.some(action => COVERAGE_ACTIONS.has(action)));
}

function functionMatchesClaim(item, claim) {
  if (item.target_keys.length > 0 && !item.target_keys.includes(claim.target_key)) return false;
  if (item.actions.length > 0 && !item.actions.some(action => claim.actions.includes(action))) return false;
  if (!routeMatches(item.route, claim.route)) return false;
  if (item.role_key && claim.role_key && !sameValue(item.role_key, claim.role_key)) return false;
  return true;
}

function selectedCases(cases, testcaseIds, group) {
  const ids = new Set(list(testcaseIds));
  const normalizedGroup = String(group || '').trim().toLowerCase();
  return cases.filter(testcase => (
    (ids.size === 0 || ids.has(testcase.id))
    && (!normalizedGroup || String(testcase.group || '').trim().toLowerCase() === normalizedGroup)
  ));
}

function addViolation(violations, violation) {
  const signature = JSON.stringify(violation);
  if (!violations.some(item => JSON.stringify(item) === signature)) violations.push(violation);
}

export function buildUiCoverage({
  manifestPath,
  inventoryPath,
  expectedAppBuild = '',
  maxAgeHours = 168,
  testcaseIds = [],
  group = '',
  requireExplicit = false,
} = {}) {
  const violations = [];
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { schema_version: 1, artifact: 'UI_FUNCTION_COVERAGE', status: 'BLOCKED', violations: [{ code: 'MANIFEST_MISSING' }] };
  }
  if (!inventoryPath || !fs.existsSync(inventoryPath)) {
    return { schema_version: 1, artifact: 'UI_FUNCTION_COVERAGE', status: 'BLOCKED', violations: [{ code: 'UI_FUNCTION_INVENTORY_MISSING' }] };
  }

  let parsed;
  let inventory;
  try {
    parsed = parseAutomationManifest(manifestPath);
    inventory = readJson(inventoryPath);
  } catch (error) {
    return {
      schema_version: 1,
      artifact: 'UI_FUNCTION_COVERAGE',
      status: 'BLOCKED',
      violations: [{ code: 'UI_COVERAGE_INPUT_INVALID', message: error.message }],
    };
  }

  if (inventory.schema_version !== 1 || inventory.artifact !== 'UI_FUNCTION_INVENTORY') {
    addViolation(violations, { code: 'UI_FUNCTION_INVENTORY_SCHEMA_INVALID' });
  }
  const provider = normalizeProvider(inventory.provider || inventory.browser_driver);
  const requiredTools = BROWSER_MCP_TOOLS[provider] || [];
  const tools = browserMcpTools(inventory);
  if (!BROWSER_MCP_PROVIDERS.has(provider) || !requiredTools.every(tool => tools.includes(tool))) {
    addViolation(violations, {
      code: 'UI_FUNCTION_INVENTORY_BROWSER_MCP_PROVENANCE_MISSING',
      provider,
      required_tools: requiredTools,
      tools_used: tools,
    });
  }
  if (!inventory.run_id || !inventory.mcp?.session_id) {
    addViolation(violations, { code: 'UI_FUNCTION_INVENTORY_SESSION_MISSING' });
  }
  if (!inventory.app_build) addViolation(violations, { code: 'UI_FUNCTION_INVENTORY_BUILD_MISSING' });
  if (expectedAppBuild && inventory.app_build !== expectedAppBuild) {
    addViolation(violations, {
      code: 'UI_FUNCTION_INVENTORY_BUILD_MISMATCH',
      expected: expectedAppBuild,
      actual: inventory.app_build,
    });
  }
  if (!validIso(inventory.captured_at)) {
    addViolation(violations, { code: 'UI_FUNCTION_INVENTORY_CAPTURE_TIME_INVALID' });
  } else if (Number.isFinite(Number(maxAgeHours)) && maxAgeHours >= 0) {
    const ageHours = (Date.now() - Date.parse(inventory.captured_at)) / 3_600_000;
    if (ageHours > maxAgeHours) {
      addViolation(violations, {
        code: 'UI_FUNCTION_INVENTORY_STALE',
        age_hours: Math.round(ageHours * 100) / 100,
        max_age_hours: maxAgeHours,
      });
    }
  }

  const functions = normalizeFunctions(inventory, violations);
  const byKey = new Map(functions.map(item => [item.function_key, item]));
  const selected = selectedCases(parsed.cases, testcaseIds, group);
  const fullScope = list(testcaseIds).length === 0 && !String(group || '').trim();
  const claims = selected.flatMap(caseItem => caseClaims(caseItem));
  const allExplicitRefs = new Set(parsed.cases.flatMap(caseItem => [...caseReferences(caseItem)]));
  const selectedExplicitRefs = new Set(selected.flatMap(caseItem => [...caseReferences(caseItem)]));

  for (const ref of allExplicitRefs) {
    if (!byKey.has(ref)) addViolation(violations, { code: 'UI_FUNCTION_REFERENCE_UNKNOWN', function_key: ref });
  }

  const functionCoverage = new Map(functions.map(item => [item.function_key, {
    explicit: [],
    inferred: [],
  }]));
  const inScopeKeys = new Set();
  const unmappedClaims = [];
  for (const claim of claims) {
    const testcase = selected.find(item => item.id === claim.testcase_id);
    const references = testcase ? caseReferences(testcase) : new Set();
    const explicitMatches = functions.filter(item => references.has(item.function_key));
    const inferredMatches = functions.filter(item => functionMatchesClaim(item, claim));
    const matches = explicitMatches.length > 0 ? explicitMatches : inferredMatches;
    for (const item of matches) inScopeKeys.add(item.function_key);
    if (explicitMatches.length === 0 && inferredMatches.length > 1) {
      addViolation(violations, {
        code: 'UI_FUNCTION_MAPPING_AMBIGUOUS',
        testcase_id: claim.testcase_id,
        target_key: claim.target_key,
        function_keys: inferredMatches.map(item => item.function_key),
      });
    }
    if (matches.length === 0) {
      const unmapped = { testcase_id: claim.testcase_id, target_key: claim.target_key, route: claim.route };
      unmappedClaims.push(unmapped);
      addViolation(violations, { code: 'UI_TARGET_NOT_IN_INVENTORY', ...unmapped });
    }
    for (const item of explicitMatches) functionCoverage.get(item.function_key).explicit.push(claim.testcase_id);
    if (explicitMatches.length === 0 && inferredMatches.length === 1) {
      functionCoverage.get(inferredMatches[0].function_key).inferred.push(claim.testcase_id);
    }
  }

  const functionReports = functions.map(item => {
    const coverage = functionCoverage.get(item.function_key);
    const explicit = unique(coverage.explicit);
    const inferred = unique(coverage.inferred);
    const inScope = fullScope || inScopeKeys.has(item.function_key) || selectedExplicitRefs.has(item.function_key);
    let status = 'out_of_scope';
    if (item.coverage_required === false) status = 'exempt';
    else if (explicit.length > 0 || inferred.length > 0) status = 'covered';
    else if (inScope) {
      status = 'uncovered';
      addViolation(violations, { code: 'UI_FUNCTION_UNCOVERED', function_key: item.function_key });
    }
    if (requireExplicit && item.coverage_required !== false && explicit.length === 0 && inScope) {
      addViolation(violations, { code: 'UI_FUNCTION_EXPLICIT_REFERENCE_MISSING', function_key: item.function_key });
    }
    return {
      ...item,
      scope: inScope ? 'selected' : 'out_of_scope',
      status,
      covered_by: unique([...explicit, ...inferred]),
      coverage_mode: explicit.length > 0 ? 'explicit' : inferred.length > 0 ? 'inferred' : null,
    };
  });

  const requiredInScope = functionReports.filter(item => item.coverage_required && item.scope === 'selected');
  const covered = requiredInScope.filter(item => item.status === 'covered').length;
  const coveragePercent = requiredInScope.length === 0 ? 100 : Math.round((covered / requiredInScope.length) * 10000) / 100;
  return {
    schema_version: 1,
    artifact: 'UI_FUNCTION_COVERAGE',
    status: violations.length === 0 ? 'PASS' : 'BLOCKED',
    scope: fullScope ? 'full' : 'selected',
    source: {
      manifest: path.basename(manifestPath),
      inventory: path.basename(inventoryPath),
      provider,
      run_id: inventory.run_id || null,
      app_build: inventory.app_build || null,
    },
    summary: {
      inventory_function_count: functions.length,
      required_function_count: requiredInScope.length,
      covered_function_count: covered,
      uncovered_function_count: requiredInScope.filter(item => item.status === 'uncovered').length,
      out_of_scope_function_count: functionReports.filter(item => item.status === 'out_of_scope').length,
      coverage_percent: coveragePercent,
      testcase_count: selected.length,
      unmapped_target_count: unmappedClaims.length,
    },
    functions: functionReports,
    unmapped_targets: unmappedClaims,
    violations,
  };
}

function main() {
  const manifestPath = path.resolve(getArg('--manifest'));
  const inventoryPath = path.resolve(getArg('--inventory', getArg('--ui-inventory')));
  if (!getArg('--manifest') || !getArg('--inventory', getArg('--ui-inventory'))) {
    throw new Error('BLOCKED: --manifest and --inventory are required');
  }
  const outputPath = path.resolve(getArg('--output', 'reports/ui-function-coverage.json'));
  const report = buildUiCoverage({
    manifestPath,
    inventoryPath,
    expectedAppBuild: getArg('--app-build'),
    maxAgeHours: Number(getArg('--max-age-hours', '168')),
    testcaseIds: getArg('--testcase-id').split(',').map(value => value.trim()).filter(Boolean),
    group: getArg('--group'),
    requireExplicit: process.argv.includes('--require-explicit'),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, output: outputPath, summary: report.summary }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 2;
}

export { normalizeAction, normalizeFunctions };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`[ui-coverage] ${error.message}`);
    process.exitCode = 2;
  }
}
