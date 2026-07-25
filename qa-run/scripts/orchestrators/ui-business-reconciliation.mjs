#!/usr/bin/env node
/**
 * ui-business-reconciliation.mjs — Orchestrator for UI_BUSINESS_RECONCILIATION Phase 2
 *
 * Coordinates the full 13-step UI Business Reconciliation pipeline:
 *   1. Load Documents & Source Knowledge
 *   2. Open Browser with Role & Test Data
 *   3. Capture DOM, Accessibility & Screenshot
 *   4. Segment Business Regions (ui-region-segmenter.mjs)
 *   5. Explore UI States (ui-state-explorer.mjs)
 *   6. Extract Business Components (ui-business-component-extractor.mjs)
 *   7. Extract Visual Signals (visual-business-signal-extractor.mjs)
 *   8. Build Observed Action Graph (ui-observed-flow-builder.mjs)
 *   9. Capture Evidence Crops (capture-ui-business-evidence.mjs)
 *  10. Reconcile 3 Angles (ui-business-reconciler.mjs)
 *  11. Detect Ambiguity Patterns (ui-business-ambiguity-detector.mjs)
 *  12. Manage Q&A Lifecycle (ui-business-qna-generator.mjs)
 *  13. Write 12-Section Guide (write-ui-business-guide.mjs)
 *
 * Usage:
 *   node ui-business-reconciliation.mjs --page order-detail
 *   node ui-business-reconciliation.mjs --url http://localhost:9876 --page order-detail
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveScriptPath } from '../registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const TARGET_URL = getArg('--url', null);
const SNAPSHOT   = getArg('--snapshot', null);
const PAGE_SLUG  = getArg('--page', 'page-ui');

function runScript(scriptName, extraArgs = []) {
  const scriptPath = resolveScriptPath(scriptName);
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
  console.log(`[ui-orchestrator] 🚀 UI_BUSINESS_RECONCILIATION Pipeline (Phase 2)`);
  console.log(`  Page Slug: ${PAGE_SLUG}`);
  console.log(`  Target:    ${TARGET_URL || SNAPSHOT || 'fixture snapshot'}`);
  console.log('═'.repeat(60) + '\n');

  const startTime = Date.now();
  const extractorArgs = ['--page', PAGE_SLUG];
  if (TARGET_URL) extractorArgs.push('--url', TARGET_URL);
  if (SNAPSHOT) extractorArgs.push('--snapshot', SNAPSHOT);

  // 1. Extract Components
  runScript('ui-business-component-extractor.mjs', extractorArgs);

  // 2. Segment Regions
  runScript('ui-region-segmenter.mjs', ['--page', PAGE_SLUG]);

  // 3. Classify Action Intents
  runScript('ui-action-intent-classifier.mjs', ['--page', PAGE_SLUG]);

  // 4. Explore Multi-State UI Graph
  runScript('ui-state-explorer.mjs', extractorArgs);

  // 5. Extract Visual Signals & Anomalies
  runScript('visual-business-signal-extractor.mjs', ['--page', PAGE_SLUG]);

  // 5b. Route Visual Evidence via Microsoft OmniParser (Zero Vision Token Grounding)
  runScript('visual-evidence-router.mjs', ['--page', PAGE_SLUG]);

  // 6. Build UI Observed Flow
  runScript('ui-observed-flow-builder.mjs', ['--page', PAGE_SLUG]);

  // 7. Reconcile 3 Angles (Actual vs Implemented vs Expected)
  runScript('ui-business-reconciler.mjs', ['--page', PAGE_SLUG]);

  // 8. Detect 10 Ambiguity Patterns
  runScript('ui-business-ambiguity-detector.mjs', ['--page', PAGE_SLUG]);

  // 9. Capture Evidence Screenshot Crops
  if (TARGET_URL) {
    runScript('capture-ui-business-evidence.mjs', extractorArgs);
  }

  // 10. Manage Q&A Lifecycle
  runScript('ui-business-qna-generator.mjs', ['--page', PAGE_SLUG]);

  // 11. Write 12-Section Guide
  runScript('write-ui-business-guide.mjs', ['--page', PAGE_SLUG]);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const outDir = path.join(process.env.QA_DATA_DIR || process.cwd(), 'qa-knowledge', 'ui-business', PAGE_SLUG);

  console.log('\n' + '═'.repeat(60));
  console.log(`[ui-orchestrator] ✅ UI_BUSINESS_RECONCILIATION COMPLETE in ${duration}s`);
  console.log(`  Output Directory: ${outDir}`);
  if (fs.existsSync(outDir)) {
    fs.readdirSync(outDir).forEach(f => {
      const stat = fs.statSync(path.join(outDir, f));
      console.log(`    📄 ${f.padEnd(32)} ${(stat.size / 1024).toFixed(1)}KB`);
    });
  }
  console.log('═'.repeat(60));
  process.exit(0);
}

main().catch(err => {
  console.error('[ui-orchestrator] FATAL:', err.message);
  process.exit(1);
});
