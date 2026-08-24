#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertionMatcherTokens,
  parseAutomationManifest,
  stepMethodName,
  valueFingerprint,
} from './verify-testcase-traceability.mjs';
import { resolveModuleSlug } from './artifact-naming.mjs';

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function defaultPomPlanPath(manifestPath, group = '') {
  const defaultModuleName = group || path.basename(manifestPath).replace(/\.automation\.json$/i, '');
  return path.resolve('plans', `${resolveModuleSlug(defaultModuleName)}.pom-plan.json`);
}

function moduleDescriptor(group) {
  const name = String(group || 'Other').trim() || 'Other';
  return { group: name, slug: resolveModuleSlug(name) };
}

function testcaseCapabilities(testcase) {
  return [
    ...(testcase?.structured ? ['ui'] : []),
    ...(testcase?.api ? ['api'] : []),
  ];
}

function planSurface(capabilities) {
  if (capabilities.length === 1) return capabilities[0];
  if (capabilities.length === 2) return 'functional';
  return null;
}

function targetHints(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return null;
  const fields = ['key', 'kind', 'name', 'role', 'label', 'placeholder', 'test_id', 'id', 'route'];
  const hints = {};
  for (const field of fields) {
    if (target[field] !== undefined && target[field] !== null && target[field] !== '') {
      hints[field] = target[field];
    }
  }
  return Object.keys(hints).length > 0 ? hints : null;
}

function buildPomPlan(manifestPath, options = {}) {
  const parsed = parseAutomationManifest(manifestPath);
  const sourceHash = sha256(manifestPath);
  const testcaseIds = new Set(options.testcaseIds || []);
  const group = String(options.group || '').trim().toLowerCase();
  const selected = parsed.cases.filter(testcase => (
    (testcaseIds.size === 0 || testcaseIds.has(testcase.id))
    && (!group || String(testcase.group || '').trim().toLowerCase() === group)
  ));
  const maxCases = Number(options.maxCases ?? 20);
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 20) {
    throw new Error('BLOCKED: maxCases must be an integer from 1 to 20');
  }
  if (testcaseIds.size > 0) {
    const missing = [...testcaseIds].filter(id => !selected.some(testcase => testcase.id === id));
    if (missing.length > 0) throw new Error(`BLOCKED: testcase IDs not found in selection: ${missing.join(', ')}`);
  }
  const modules = [];
  const moduleBySlug = new Map();
  for (const testcase of selected) {
    const descriptor = moduleDescriptor(testcase.group);
    const previous = moduleBySlug.get(descriptor.slug);
    if (previous && previous.group !== descriptor.group) {
      throw new Error(
        `BLOCKED: MODULE_SLUG_COLLISION for "${previous.group}" and "${descriptor.group}" -> ${descriptor.slug}`,
      );
    }
    if (!previous) {
      moduleBySlug.set(descriptor.slug, descriptor);
      modules.push(descriptor);
    }
  }
  if (selected.length === 0) throw new Error('BLOCKED: selection contains no testcases');
  if (selected.length > maxCases) {
    throw new Error(
      `BLOCKED: selection contains ${selected.length} cases; use group/testcaseIds to stay within the hard limit 20`,
    );
  }
  if (modules.length !== 1) {
    throw new Error(
      `BLOCKED: PLAN_REQUIRES_EXACTLY_ONE_MODULE; selection contains ${modules.length} modules`,
    );
  }
  const capabilities = ['ui', 'api'].filter(capability => (
    selected.some(testcase => testcaseCapabilities(testcase).includes(capability))
  ));
  if (capabilities.length === 2) {
    const uncomposed = selected.filter(testcase => {
      const testcaseCaps = testcaseCapabilities(testcase);
      const order = testcase.capability_order || [];
      return testcaseCaps.length !== 2
        || order.length !== 2
        || !order.includes('ui')
        || !order.includes('api');
    });
    if (uncomposed.length > 0) {
      throw new Error(
        'BLOCKED: FUNCTIONAL_FLOW_NOT_COMPOSED; mixed standalone UI/API cases '
        + 'cannot be inferred as one functional flow',
      );
    }
  }
  return {
    schema_version: 1,
    source_manifest: path.basename(manifestPath),
    source_manifest_sha256: sourceHash,
    source_marker: `[AUTOMATION_SOURCE:${sourceHash}]`,
    module: modules.length === 1 ? modules[0] : null,
    modules,
    capabilities,
    surface: planSurface(capabilities),
    selection: {
      requested_testcase_ids: [...testcaseIds],
      requested_group: options.group || null,
      selected_count: selected.length,
      total_count: parsed.cases.length,
    },
    testcases: selected.map(testcase => ({
      testcase_id: testcase.id,
      source_index: testcase.source_index,
      group: testcase.group,
      section_kind: testcase.section_kind,
      capabilities: testcaseCapabilities(testcase),
      capability_order: testcase.capability_order,
      scenario_id: testcase.scenario_id,
      case_ref: testcase.case_ref,
      type: testcase.type,
      bb_technique: testcase.bb_technique,
      requirement: testcase.requirement,
      priority: testcase.priority,
      role_key: testcase.role_key,
      rbac_refs: testcase.rbac_refs,
      entry: testcase.entry,
      required_markers: testcase.required_markers,
      steps: testcase.steps.map((step, index) => ({
        order: index + 1,
        id: step.id,
        marker: testcase.required_markers.steps[index],
        action: step.action,
        required_method: stepMethodName(step),
        target_key: step?.target?.key || null,
        target_hints: targetHints(step?.target),
        value: step.value ?? null,
        value_fingerprint: valueFingerprint(step.value),
        wait_for: step.wait_for ?? null,
        assertions: (step.assertions || []).map((assertion, assertionIndex) => ({
          marker: testcase.required_markers.step_assertions[index][assertionIndex],
          assertion,
          required_matchers: assertionMatcherTokens(assertion.kind),
        })),
      })),
      outcome_assertions: testcase.outcome_assertions.map((assertion, index) => ({
        marker: testcase.required_markers.outcomes[index],
        assertion,
        required_matchers: assertionMatcherTokens(assertion.kind),
      })),
      outcome_route: testcase.outcome_route,
      cleanup: testcase.cleanup,
      mutates: testcase.mutates,
      api: testcase.api,
      ui_function_keys: testcase.ui_function_keys,
      selector_target_keys: testcase.target_keys,
      selector_target_routes: testcase.target_routes,
    })),
  };
}

function printUsage() {
  console.log(`Usage: node scripts/generate-pom-plan.mjs --manifest <file> [--testcase-id <id[,id]>] [--group <name>] [--max-cases <n>] [--output <file>]`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }
  const manifestArg = getArg('--manifest');
  if (!manifestArg) throw new Error('BLOCKED: --manifest is required');
  const manifestPath = path.resolve(manifestArg);
  if (!fs.existsSync(manifestPath)) throw new Error(`BLOCKED: manifest not found: ${manifestPath}`);
  const group = getArg('--group');
  const outputPath = path.resolve(getArg(
    '--output',
    defaultPomPlanPath(manifestPath, group),
  ));
  const testcaseIds = getArg('--testcase-id')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const maxCases = Number(getArg('--max-cases', '20'));
  if (!Number.isInteger(maxCases) || maxCases <= 0 || maxCases > 20) {
    throw new Error('BLOCKED: --max-cases must be an integer from 1 to 20');
  }
  const plan = buildPomPlan(manifestPath, { testcaseIds, group, maxCases });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'PASS',
    output: outputPath,
    source_manifest_sha256: plan.source_manifest_sha256,
    testcase_count: plan.testcases.length,
    total_testcase_count: plan.selection.total_count,
  }, null, 2));
}

export {
  buildPomPlan,
  defaultPomPlanPath,
  planSurface,
  targetHints,
  testcaseCapabilities,
};

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[pom-plan] ${error.message}`);
    process.exitCode = 2;
  });
}
