#!/usr/bin/env node
/**
 * capture-ui-business-evidence.mjs — Component-level Screenshot Evidence Cropper
 *
 * Captures screenshot crops for UI components associated with business conflicts or ambiguities:
 *   - Crops element by selector or bounding box
 *   - Saves evidence to `qa-knowledge/ui-business/<page-slug>/evidence/<component-id>.png`
 *
 * Usage:
 *   node capture-ui-business-evidence.mjs --url http://localhost:9876 --page order-detail
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { chromiumLaunchOptions } from '../helpers/browser-launch.mjs';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const TARGET_URL = getArg('--url', null);
const PAGE_SLUG  = getArg('--page', 'page-ui');
const STORAGE_STATE = getArg('--storage-state', null);
const DATA_DIR   = process.env.QA_DATA_DIR || process.cwd();

async function main() {
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  const evidenceDir = path.join(uiDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const conflictsPath = path.join(uiDir, 'business-conflicts.json');
  let conflicts = [];
  if (fs.existsSync(conflictsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
      conflicts = data.conflicts || [];
    } catch {}
  }

  if (!TARGET_URL) {
    console.log('[capture-evidence] ℹ️ No --url provided. Skipped live screenshot cropping.');
    process.exit(0);
  }

  console.log(`[capture-evidence] Capturing visual evidence crops from: ${TARGET_URL}`);

  const browser = await chromium.launch(chromiumLaunchOptions());
  const context = await browser.newContext(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const evidenceMap = [];

  // Take full page screenshot
  const fullPagePath = path.join(evidenceDir, 'full-page.png');
  await page.screenshot({ path: fullPagePath, fullPage: true });
  evidenceMap.push({ id: 'FULL_PAGE', path: fullPagePath });

  // Crop elements for conflicts
  for (const c of conflicts) {
    const selector = c.evidenceBundle?.selector || c.selector;
    if (!selector) continue;
    const cropName = `${c.issueId || 'crop'}.png`;
    const cropPath = path.join(evidenceDir, cropName);

    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible()) {
        await locator.screenshot({ path: cropPath });
        c.screenshotCrop = cropPath;
        evidenceMap.push({ issueId: c.issueId, component: c.component, cropPath });
        console.log(`  📸 Cropped evidence for ${c.component} -> ${cropName}`);
      }
    } catch {
      // Fallback
    }
  }

  await browser.close();

  // Save evidence map
  const result = {
    tool: 'capture-ui-business-evidence.mjs',
    pageSlug: PAGE_SLUG,
    capturedAt: new Date().toISOString(),
    totalCrops: evidenceMap.length,
    evidenceMap,
  };

  const mapPath = path.join(uiDir, 'visual-business-evidence.json');
  fs.writeFileSync(mapPath, JSON.stringify(result, null, 2), 'utf8');

  // Update business-conflicts.json with crop paths
  if (conflicts.length > 0) {
    const updatedConflictsData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
    updatedConflictsData.conflicts = conflicts;
    fs.writeFileSync(conflictsPath, JSON.stringify(updatedConflictsData, null, 2), 'utf8');
  }

  console.log(`[capture-evidence] ✅ Saved ${evidenceMap.length} evidence crops. Index saved to: ${mapPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[capture-evidence] FATAL:', err.message);
  process.exit(1);
});
