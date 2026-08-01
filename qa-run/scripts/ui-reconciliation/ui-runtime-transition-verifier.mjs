#!/usr/bin/env node
/** Verify one explicitly authorized UI action against same-session network and persistence evidence. */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromiumLaunchOptions } from '../helpers/browser-launch.mjs';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const TARGET_URL = getArg('--url');
const ACTION_SELECTOR = getArg('--action-selector');
const ACTION_LABEL = getArg('--action-label');
const STATUS_SELECTOR = getArg('--status-selector', '#order-status, .badge.status, [data-status]');
const SUCCESS_SELECTOR = getArg('--success-selector', '#toast-message, .alert-success, [role="status"]');
const EXPECTED_STATE = getArg('--expected-state');
const STORAGE_STATE = getArg('--storage-state');
const PAGE_SLUG = getArg('--page', 'page-ui');
const OUTPUT_FILE = getArg('--output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();
const uiHash = content => crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 12);
const redact = value => String(value || '').replace(/(Bearer\s+)[A-Za-z0-9._=-]+/gi, '$1[REDACTED]').replace(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g, '[REDACTED_EMAIL]');

async function verify() {
  const browser = await chromium.launch(chromiumLaunchOptions());
  const context = await browser.newContext(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();
  const responses = [];
  page.on('response', response => responses.push({ method: response.request().method(), url: redact(response.url()), status: response.status() }));
  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const locator = page.locator(ACTION_SELECTOR).first();
    if (!(await locator.isVisible())) throw new Error(`Authorized action selector is not visible: ${ACTION_SELECTOR}`);
    const beforeUrl = page.url();
    const beforeUiHash = uiHash(await page.content());
    const beforeResponseCount = responses.length;
    const beforeState = await page.locator(STATUS_SELECTOR).first().innerText().catch(() => null);
    await locator.click();
    await page.waitForTimeout(750);
    const actionResponses = responses.slice(beforeResponseCount);
    const successLocator = page.locator(SUCCESS_SELECTOR).first();
    const uiSuccessVisible = await successLocator.isVisible().catch(() => false);
    const toast = uiSuccessVisible ? await successLocator.innerText().catch(() => '') : '';
    await page.reload({ waitUntil: 'domcontentloaded' });
    const persistedState = await page.locator(STATUS_SELECTOR).first().innerText().catch(() => null);
    const failedResponse = actionResponses.find(item => item.status >= 400);
    const persistenceVerified = EXPECTED_STATE ? String(persistedState || '').trim().toUpperCase() === EXPECTED_STATE.toUpperCase() : null;
    return [{
      action: ACTION_LABEL || ACTION_SELECTOR, actionSelector: ACTION_SELECTOR,
      from: beforeState, to: persistedState, expectedState: EXPECTED_STATE,
      beforeUrl, afterUrl: page.url(), beforeUiHash, afterUiHash: uiHash(await page.content()),
      network: actionResponses, request: failedResponse ? `${failedResponse.method} ${failedResponse.url}` : null,
      responseStatus: failedResponse?.status ?? actionResponses.at(-1)?.status ?? null,
      uiToastMessage: toast, uiSuccessVisible, postReloadStatus: persistedState,
      persistenceVerified,
      hasMismatch: Boolean((uiSuccessVisible && failedResponse) || (EXPECTED_STATE && persistenceVerified === false)),
      evidenceType: 'runtime_verified', confidence: actionResponses.length ? 0.99 : 0.7,
    }];
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!TARGET_URL || !ACTION_SELECTOR) throw new Error('Runtime verification requires --url and explicit --action-selector authorization');
  const transitions = await verify();
  const uiDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  fs.mkdirSync(uiDir, { recursive: true });
  const result = { tool: 'ui-runtime-transition-verifier.mjs', pageSlug: PAGE_SLUG, verifiedAt: new Date().toISOString(), totalVerifiedTransitions: transitions.length, mismatchesFound: transitions.filter(t => t.hasMismatch).length, transitions };
  const outputPath = OUTPUT_FILE || path.join(uiDir, 'transition-evidence.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[runtime-verifier] Saved ${transitions.length} verified transition to: ${outputPath}`);
}

main().catch(err => { console.error('[runtime-verifier] FATAL:', err.message); process.exit(1); });
