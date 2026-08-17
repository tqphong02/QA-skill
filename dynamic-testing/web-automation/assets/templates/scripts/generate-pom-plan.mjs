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

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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
  if (testcaseIds.size > 0) {
    const missing = [...testcaseIds].filter(id => !selected.some(testcase => testcase.id === id));
    if (missing.length > 0) throw new Error(`BLOCKED: testcase IDs not found in selection: ${missing.join(', ')}`);
  }
  return {
    schema_version: 1,
    source_manifest: path.basename(manifestPath),
    source_manifest_sha256: sourceHash,
    source_marker: `[AUTOMATION_SOURCE:${sourceHash}]`,
    selection: {
      requested_testcase_ids: [...testcaseIds],
      requested_group: options.group || null,
      selected_count: selected.length,
      total_count: parsed.cases.length,
    },
    testcases: selected.map(testcase => ({
      testcase_id: testcase.id,
      group: testcase.group,
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
      cleanup: testcase.cleanup,
      mutates: testcase.mutates,
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
  const outputPath = path.resolve(getArg(
    '--output',
    manifestPath.replace(/\.automation\.json$/i, '.pom-plan.json'),
  ));
  const testcaseIds = getArg('--testcase-id')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const group = getArg('--group');
  const maxCases = Number(getArg('--max-cases', '20'));
  if (!Number.isInteger(maxCases) || maxCases <= 0) {
    throw new Error('BLOCKED: --max-cases must be a positive integer');
  }
  const plan = buildPomPlan(manifestPath, { testcaseIds, group });
  if (plan.testcases.length === 0) throw new Error('BLOCKED: selection contains no testcases');
  if (plan.testcases.length > maxCases) {
    throw new Error(
      `BLOCKED: selection contains ${plan.testcases.length} cases; use --group/--testcase-id or raise --max-cases explicitly`,
    );
  }
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

export { buildPomPlan, targetHints };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[pom-plan] ${error.message}`);
    process.exitCode = 2;
  });
}
