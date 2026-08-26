#!/usr/bin/env node
/** Orchestrate fail-closed UI item to requirement reconciliation. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveScriptPath } from '../registry.mjs';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const hasFlag = flag => args.includes(flag);
const TARGET_URL = getArg('--url');
const SNAPSHOT = getArg('--snapshot') || getArg('--fixture');
const REQUIREMENTS = getArg('--requirements');
const STORAGE_STATE = getArg('--storage-state');
const PAGE_SLUG = getArg('--page', 'page-ui');
const ROLE = getArg('--role');
const VERIFY_RUNTIME = hasFlag('--verify-runtime');
const ACTION_SELECTOR = getArg('--runtime-action-selector');
const ACTION_LABEL = getArg('--runtime-action-label');
const EXPECTED_STATE = getArg('--runtime-expected-state');

function runScript(scriptName, extraArgs = []) {
  const scriptPath = resolveScriptPath(scriptName);
  if (!fs.existsSync(scriptPath)) throw new Error(`Required script not found: ${scriptName}`);
  const result = spawnSync('node', [scriptPath, ...extraArgs], { stdio: 'inherit', env: { ...process.env } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${scriptName} failed with exit ${result.status}`);
}

async function main() {
  if (!TARGET_URL && !SNAPSHOT) throw new Error('Provide explicit --url or --snapshot/--fixture');
  if (!REQUIREMENTS) throw new Error('Provide --requirements; browser-to-document mapping cannot run without a requirement registry');
  if (!fs.existsSync(REQUIREMENTS)) throw new Error(`Requirement registry not found: ${REQUIREMENTS}`);
  if (VERIFY_RUNTIME && (!TARGET_URL || !ACTION_SELECTOR)) {
    throw new Error('--verify-runtime requires --url and --runtime-action-selector (explicit state-changing authorization)');
  }

  const inputArgs = ['--page', PAGE_SLUG];
  if (TARGET_URL) inputArgs.push('--url', TARGET_URL);
  if (SNAPSHOT) inputArgs.push('--snapshot', SNAPSHOT);
  if (STORAGE_STATE) inputArgs.push('--storage-state', STORAGE_STATE);
  if (ROLE) inputArgs.push('--role', ROLE);

  console.log(`[ui-orchestrator] Start page=${PAGE_SLUG} input=${TARGET_URL || SNAPSHOT} requirements=${REQUIREMENTS}`);
  runScript('ui-business-component-extractor.mjs', inputArgs);
  runScript('ui-region-segmenter.mjs', ['--page', PAGE_SLUG]);
  runScript('ui-action-intent-classifier.mjs', ['--page', PAGE_SLUG]);
  runScript('ui-state-explorer.mjs', inputArgs);
  runScript('visual-business-signal-extractor.mjs', ['--page', PAGE_SLUG]);
  runScript('visual-evidence-router.mjs', ['--page', PAGE_SLUG]);
  runScript('ui-observed-flow-builder.mjs', ['--page', PAGE_SLUG]);

  if (VERIFY_RUNTIME) {
    const runtimeArgs = ['--page', PAGE_SLUG, '--url', TARGET_URL, '--action-selector', ACTION_SELECTOR];
    if (ACTION_LABEL) runtimeArgs.push('--action-label', ACTION_LABEL);
    if (EXPECTED_STATE) runtimeArgs.push('--expected-state', EXPECTED_STATE);
    if (STORAGE_STATE) runtimeArgs.push('--storage-state', STORAGE_STATE);
    runScript('ui-runtime-transition-verifier.mjs', runtimeArgs);
  }

  const reconcileArgs = ['--page', PAGE_SLUG, '--requirements', REQUIREMENTS];
  if (ROLE) reconcileArgs.push('--role', ROLE);
  runScript('ui-business-reconciler.mjs', reconcileArgs);
  runScript('ui-business-ambiguity-detector.mjs', ['--page', PAGE_SLUG]);
  if (TARGET_URL) runScript('capture-ui-business-evidence.mjs', inputArgs);
  runScript('ui-business-qna-generator.mjs', ['--page', PAGE_SLUG]);
  runScript('write-ui-business-guide.mjs', ['--page', PAGE_SLUG]);

  const outDir = path.join(process.env.QA_DATA_DIR || process.cwd(), 'qa-knowledge', 'ui-business', PAGE_SLUG);
  console.log(`[ui-orchestrator] Complete: ${path.join(outDir, 'ui-requirement-traceability.json')}`);
}

main().catch(err => { console.error('[ui-orchestrator] FATAL:', err.message); process.exit(1); });
