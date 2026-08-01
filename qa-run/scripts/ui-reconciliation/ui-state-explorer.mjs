#!/usr/bin/env node
/** Build a bounded UI state inventory without executing business mutations. */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromiumLaunchOptions } from '../helpers/browser-launch.mjs';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const TARGET_URL = getArg('--url');
const SNAPSHOT = getArg('--snapshot') || getArg('--fixture');
const STORAGE_STATE = getArg('--storage-state');
const PAGE_SLUG = getArg('--page', 'page-ui');
const ROLE = getArg('--role', 'unknown');
const OUTPUT_FILE = getArg('--output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();

const LIMITS = { maxDepth: 3, maxStates: 50, maxActionsPerState: 15, mode: 'read_only_inventory' };
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);

function buildFromComponents(components, route, evidenceLevel) {
  const states = [{
    id: 'STATE_INITIAL', name: 'Initial observed state', type: 'page_load', depth: 0,
    role: ROLE, route, uiHash: hash({ route, role: ROLE, components }), evidenceLevel,
  }];
  const transitions = [];
  if (components.some(c => c.category === 'form_field' && c.fieldType === 'select')) {
    states.push({ id: 'STATE_SELECT_AVAILABLE', name: 'Select control available', type: 'control_available', depth: 0, role: ROLE, evidenceLevel });
  }
  if (components.some(c => c.category === 'dialog')) {
    states.push({ id: 'STATE_DIALOG_VISIBLE', name: 'Dialog observed', type: 'dialog_visible', depth: 0, role: ROLE, evidenceLevel });
  }
  return { states, transitions };
}

async function exploreLive(url) {
  const browser = await chromium.launch(chromiumLaunchOptions());
  const context = await browser.newContext(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const components = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, [role="dialog"], .badge, [data-status]')]
      .filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; })
      .map(el => ({ category: el.matches('select') ? 'form_field' : (el.matches('[role="dialog"]') ? 'dialog' : el.tagName.toLowerCase()), fieldType: el.tagName.toLowerCase(), label: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim() })));
    return buildFromComponents(components, page.url(), 'ui_observed');
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!TARGET_URL && !SNAPSHOT) throw new Error('Missing explicit input: provide --url or --snapshot/--fixture');
  let graph;
  if (TARGET_URL) {
    graph = await exploreLive(TARGET_URL);
  } else {
    if (!fs.existsSync(SNAPSHOT)) throw new Error(`Snapshot not found: ${SNAPSHOT}`);
    const data = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    graph = buildFromComponents(data.components || data, SNAPSHOT, 'ui_observed');
  }
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  fs.mkdirSync(uiDir, { recursive: true });
  const result = { tool: 'ui-state-explorer.mjs', pageSlug: PAGE_SLUG, exploredAt: new Date().toISOString(), limits: LIMITS, totalStates: graph.states.length, totalTransitions: graph.transitions.length, ...graph };
  const outputPath = OUTPUT_FILE || path.join(uiDir, 'ui-state-graph.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-state-explorer] Saved ${result.totalStates} observed states to: ${outputPath}`);
}

main().catch(err => { console.error('[ui-state-explorer] FATAL:', err.message); process.exit(1); });
