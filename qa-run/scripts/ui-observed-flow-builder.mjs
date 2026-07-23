#!/usr/bin/env node
/**
 * ui-observed-flow-builder.mjs — UI Observed Business Flow & State Sequence Builder
 *
 * Dựng UI Observed Flow & State Sequence từ các UI action buttons, form status, badges & modals:
 *   Ví dụ UI trang Order có các nút: Save Draft, Submit, Approve, Complete, Cancel
 *   -> Skill dựng:
 *      observedStates: ["DRAFT", "SUBMITTED", "APPROVED", "COMPLETED", "CANCELLED"]
 *      observedActions: ["Save Draft", "Submit", "Approve", "Complete", "Cancel"]
 *      transitions: [ { from, action, to }, ... ]
 *
 * Usage:
 *   node ui-observed-flow-builder.mjs --input qa-knowledge/ui-business/order-detail/ui-components.json
 *   node ui-observed-flow-builder.mjs --page order-detail --output qa-knowledge/ui-business/order-detail/observed-flow.json
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const INPUT_FILE  = getArg('--input', null);
const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function resolveInputFile() {
  if (INPUT_FILE && fs.existsSync(INPUT_FILE)) return INPUT_FILE;
  const defaultPath = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG, 'ui-components.json');
  if (fs.existsSync(defaultPath)) return defaultPath;
  console.error(`[ui-flow-builder] ❌ Input file not found: ${INPUT_FILE || defaultPath}`);
  process.exit(1);
}

function buildObservedFlow(components) {
  const observedStates = new Set();
  const observedActions = [];
  const transitions = [];

  // Extract explicit badges/status values
  components.filter(c => c.category === 'status_badge').forEach(c => {
    if (c.statusValue) observedStates.add(c.statusValue);
  });

  // Extract action intents and infer state transitions
  components.filter(c => ['primary_action_button', 'secondary_action_button'].includes(c.category)).forEach(c => {
    observedActions.push(c.label);
    if (c.expectedState) observedStates.add(c.expectedState);

    // Build transition mapping heuristically
    let fromState = 'CURRENT_STATE';
    let toState = c.expectedState || 'UNKNOWN_STATE';

    switch (c.intent) {
      case 'SAVE_DRAFT':
        transitions.push({ from: 'INITIAL', action: c.label, to: 'DRAFT', component: c.label });
        break;
      case 'SUBMIT':
        transitions.push({ from: 'DRAFT', action: c.label, to: 'SUBMITTED', component: c.label });
        break;
      case 'APPROVE':
        transitions.push({ from: 'SUBMITTED', action: c.label, to: 'APPROVED', component: c.label });
        break;
      case 'REJECT':
        transitions.push({ from: 'SUBMITTED', action: c.label, to: 'REJECTED', component: c.label });
        break;
      case 'DELETE':
        transitions.push({ from: 'ANY', action: c.label, to: 'DELETED', component: c.label });
        break;
      case 'CANCEL':
        transitions.push({ from: 'DRAFT', action: c.label, to: 'CANCELLED', component: c.label });
        break;
      default:
        transitions.push({ from: fromState, action: c.label, to: toState, component: c.label });
        break;
    }
  });

  return {
    flowName: `${PAGE_SLUG} lifecycle observed from UI`,
    pageSlug: PAGE_SLUG,
    observedAt: new Date().toISOString(),
    observedStates: [...observedStates],
    observedActions: [...new Set(observedActions)],
    transitions,
  };
}

async function main() {
  const inputFile = resolveInputFile();
  console.log(`[ui-flow-builder] Reconstructing UI observed flow from: ${inputFile}`);

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const components = data.components || [];

  const flow = buildObservedFlow(components);

  const outDir = path.dirname(inputFile);
  const outputPath = OUTPUT_FILE || path.join(outDir, 'observed-flow.json');

  fs.writeFileSync(outputPath, JSON.stringify(flow, null, 2), 'utf8');
  console.log(`[ui-flow-builder] ✅ Saved UI observed flow to: ${outputPath}`);
  console.log(`  States: [${flow.observedStates.join(', ')}]`);
  console.log(`  Actions: [${flow.observedActions.join(', ')}]`);
}

main().catch(err => {
  console.error('[ui-flow-builder] FATAL:', err.message);
  process.exit(1);
});
