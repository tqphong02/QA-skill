#!/usr/bin/env node
/**
 * ui-business-reconciliation.mjs — Orchestrator for UI_BUSINESS_RECONCILIATION
 *
 * Coordinates the full 7-step UI Business Reconciliation pipeline:
 *   1. ui-business-component-extractor.mjs
 *   2. ui-action-intent-classifier.mjs
 *   3. ui-observed-flow-builder.mjs
 *   4. ui-business-reconciler.mjs
 *   5. ui-business-ambiguity-detector.mjs
 *   6. ui-business-qna-generator.mjs
 *   7. write-ui-business-guide.mjs
 *
 * Usage:
 *   node ui-business-reconciliation.mjs --page order-detail
 *   node ui-business-reconciliation.mjs --url https://app.example.com/orders/123 --page order-detail
 *   node ui-business-reconciliation.mjs --snapshot /path/to/dom.json --page order-detail
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const TARGET_URL = getArg('--url', null);
const SNAPSHOT   = getArg('--snapshot', null);
const PAGE_SLUG  = getArg('--page', 'page-ui');

function runScript(scriptName, extraArgs = []) {
  const scriptPath = path.join(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[ui-orchestrator] ⚠️ Script not found: ${scriptName} — skipping`);
    return false;
  }
  const result = spawnSync('node', [scriptPath, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error(`[ui-orchestrator] ❌ ${scriptName} failed (exit ${result.status})`);
    return false;
  }
  return true;
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(`[ui-orchestrator] 🚀 UI_BUSINESS_RECONCILIATION Pipeline`);
  console.log(`  Page Slug: ${PAGE_SLUG}`);
  console.log(`  Target:    ${TARGET_URL || SNAPSHOT || 'fixture snapshot'}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();

  const extractorArgs = ['--page', PAGE_SLUG];
  if (TARGET_URL) extractorArgs.push('--url', TARGET_URL);
  if (SNAPSHOT) extractorArgs.push('--snapshot', SNAPSHOT);

  // Step 1: Extract Components
  runScript('ui-business-component-extractor.mjs', extractorArgs);

  // Step 2: Classify Action Intents
  runScript('ui-action-intent-classifier.mjs', ['--page', PAGE_SLUG]);

  // Step 3: Build UI Observed Flow
  runScript('ui-observed-flow-builder.mjs', ['--page', PAGE_SLUG]);

  // Step 4: Reconcile 5 Tiers & 9 Result Types
  runScript('ui-business-reconciler.mjs', ['--page', PAGE_SLUG]);

  // Step 5: Detect 10 Ambiguity Patterns
  runScript('ui-business-ambiguity-detector.mjs', ['--page', PAGE_SLUG]);

  // Step 6: Generate Clarification Q&A
  runScript('ui-business-qna-generator.mjs', ['--page', PAGE_SLUG]);

  // Step 7: Generate 12-Section Markdown Guide
  runScript('write-ui-business-guide.mjs', ['--page', PAGE_SLUG]);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const outDir = path.join(process.env.QA_DATA_DIR || process.cwd(), 'qa-knowledge', 'ui-business', PAGE_SLUG);

  console.log('\n' + '═'.repeat(60));
  console.log(`[ui-orchestrator] ✅ UI_BUSINESS_RECONCILIATION COMPLETE in ${duration}s`);
  console.log(`  Output Directory: ${outDir}`);
  if (fs.existsSync(outDir)) {
    fs.readdirSync(outDir).forEach(f => {
      const stat = fs.statSync(path.join(outDir, f));
      console.log(`    📄 ${f.padEnd(30)} ${(stat.size / 1024).toFixed(1)}KB`);
    });
  }
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('[ui-orchestrator] FATAL:', err.message);
  process.exit(1);
});
