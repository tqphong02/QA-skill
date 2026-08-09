#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAutomationManifest } from './verify-testcase-traceability.mjs';

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildPomPlan(manifestPath) {
  const parsed = parseAutomationManifest(manifestPath);
  const sourceHash = sha256(manifestPath);
  return {
    schema_version: 1,
    source_manifest: path.basename(manifestPath),
    source_manifest_sha256: sourceHash,
    source_marker: `[AUTOMATION_SOURCE:${sourceHash}]`,
    testcases: parsed.cases.map(testcase => ({
      testcase_id: testcase.id,
      case_ref: testcase.case_ref,
      type: testcase.type,
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
        target_key: step?.target?.key || null,
        value: step.value ?? null,
        wait_for: step.wait_for ?? null,
        assertions: step.assertions || [],
      })),
      outcome_assertions: testcase.outcome_assertions.map((assertion, index) => ({
        marker: testcase.required_markers.outcomes[index],
        assertion,
      })),
      cleanup: testcase.cleanup,
      mutates: testcase.mutates,
      selector_target_keys: testcase.target_keys,
      selector_target_routes: testcase.target_routes,
    })),
  };
}

function printUsage() {
  console.log(`Usage: node scripts/generate-pom-plan.mjs --manifest <file> [--output <file>]`);
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
  const plan = buildPomPlan(manifestPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'PASS',
    output: outputPath,
    source_manifest_sha256: plan.source_manifest_sha256,
    testcase_count: plan.testcases.length,
  }, null, 2));
}

export { buildPomPlan };

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[pom-plan] ${error.message}`);
    process.exitCode = 2;
  });
}
