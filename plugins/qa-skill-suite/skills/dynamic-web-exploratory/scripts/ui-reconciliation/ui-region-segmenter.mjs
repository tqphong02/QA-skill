#!/usr/bin/env node
/**
 * ui-region-segmenter.mjs — UI Business Region Segmenter
 *
 * Segments page components into functional business regions:
 *   - HEADER, SIDEBAR, TOOLBAR, FORM_REGION, TABLE_REGION, MODAL_REGION, FOOTER
 *
 * Usage:
 *   node ui-region-segmenter.mjs --page order-detail
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const PAGE_SLUG   = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output', null);
const DATA_DIR    = process.env.QA_DATA_DIR || process.cwd();

function detectRegion(c) {
  const cat = c.category || '';
  const sel = (c.selector || '').toLowerCase();
  const label = (c.label || '').toLowerCase();

  if (cat === 'navigation_menu' || sel.includes('sidebar') || sel.includes('nav')) {
    return 'SIDEBAR';
  }
  if (cat.includes('action_button') || sel.includes('toolbar') || sel.includes('btn')) {
    return 'TOOLBAR';
  }
  if (cat === 'form_field' || sel.includes('form') || sel.includes('input') || sel.includes('select')) {
    return 'FORM_REGION';
  }
  if (cat === 'confirm_modal' || sel.includes('modal') || sel.includes('dialog')) {
    return 'MODAL_REGION';
  }
  if (sel.includes('header') || cat === 'role_indicator') {
    return 'HEADER';
  }
  return 'MAIN_CONTENT';
}

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const compPath = path.join(uiDir, 'ui-components.json');

  if (!fs.existsSync(compPath)) {
    console.error(`[ui-region-segmenter] ❌ File not found: ${compPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(compPath, 'utf8'));
  const components = data.components || [];

  const segmented = components.map(c => ({
    ...c,
    region: c.region || detectRegion(c),
  }));

  const byRegion = segmented.reduce((acc, c) => {
    acc[c.region] = (acc[c.region] || 0) + 1;
    return acc;
  }, {});

  data.components = segmented;
  data.byRegion = byRegion;
  data.segmentedAt = new Date().toISOString();

  const outputPath = OUTPUT_FILE || compPath;
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

  console.log(`[ui-region-segmenter] ✅ Segmented ${segmented.length} components into ${Object.keys(byRegion).length} business regions`);
  console.log('By Region:', byRegion);
}

main().catch(err => {
  console.error('[ui-region-segmenter] FATAL:', err.message);
  process.exit(1);
});
