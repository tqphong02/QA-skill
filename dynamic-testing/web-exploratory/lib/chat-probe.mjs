// Reusable chat-bot probe helpers for Cluedog/pulse-bot style apps.
//
// Replaces the fixed-sleep, CSS-class-guessing pattern that made the early
// pw-cg-* scripts flaky: adaptive reply detection (diff + stability, not a
// hardcoded sleep), accessibility-first input discovery (role/label before
// CSS), explicit auth-expired detection, and bounded retry on navigation.

import fs from 'fs';
import path from 'path';
import { normalizeQaResultVerdict } from './verdicts.mjs';

/**
 * Launch (or reuse) a persistent Chromium profile and navigate to the bot URL
 * with one bounded retry on transient navigation failure. Returns an explicit
 * `authExpired` flag instead of silently producing empty responses later.
 */
export async function openPersistentBot(chromium, { profileDir, botUrl, headless = false, navTimeoutMs = 25000 }) {
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const pages = browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('requestfailed', r => networkErrors.push(r.url().slice(0, 120)));
  page.on('response', r => { if (r.status() >= 400) networkErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`); });

  let lastError = null;
  let status = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await page.goto(botUrl, { waitUntil: 'load', timeout: navTimeoutMs });
      status = resp?.status() || 0;
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      if (attempt < 2) await page.waitForTimeout(1500);
    }
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});

  const url = page.url();
  const authExpired = /\/login|\/auth|\/sign-?in/i.test(url);

  return {
    browser, page, status, url, authExpired,
    navError: lastError ? lastError.message.slice(0, 160) : null,
    consoleErrors, networkErrors,
  };
}

/**
 * Accessibility-first chat input discovery: try role+name, then placeholder,
 * then a generic CSS fallback. A role/label match is far less likely to break
 * when the app's CSS-module class hashes change on every build.
 */
export async function findChatInput(page, { nameHint = /khung chat|chat|message|nhắn tin|tin nhắn/i } = {}) {
  const candidates = [
    () => page.getByRole('textbox', { name: nameHint }),
    () => page.getByPlaceholder(nameHint),
    () => page.locator('textarea, [contenteditable="true"], input[type="text"]'),
    () => page.locator('[class*="chat-input"], [class*="message-input"]'),
  ];
  for (const make of candidates) {
    try {
      const loc = make().first();
      if (await loc.isVisible({ timeout: 3000 })) return loc;
    } catch { /* try next strategy */ }
  }
  return null;
}

/**
 * Send a message into an already-resolved chat input locator.
 */
export async function sendChatMessage(inputLocator, message) {
  await inputLocator.click();
  await inputLocator.fill(message);
  await inputLocator.press('Enter');
}

/**
 * Wait for a bot reply by diffing the page's visible text against a baseline
 * captured before sending, then requiring the diffed text to stay unchanged
 * for `stablePolls` consecutive reads. This replaces a fixed `waitForTimeout`:
 * a fast reply returns as soon as it stabilizes, a slow or streamed reply
 * still gets up to `timeoutMs` instead of being read mid-stream.
 */
export async function waitForBotReply(page, baselineText, {
  timeoutMs = 30000,
  stablePolls = 3,
  pollMs = 500,
} = {}) {
  const readAll = () => page.locator('body').innerText().catch(() => '');
  const startedAt = Date.now();
  let lastSnapshot = null;
  let stableCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const current = await readAll();
    const changed = current !== baselineText;
    if (changed && current === lastSnapshot) {
      stableCount += 1;
      if (stableCount >= stablePolls) {
        return { text: diffTail(baselineText, current), changed: true, timedOut: false, elapsedMs: Date.now() - startedAt };
      }
    } else {
      stableCount = changed ? 1 : 0;
      lastSnapshot = current;
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }

  const finalText = lastSnapshot ?? baselineText;
  return {
    text: finalText !== baselineText ? diffTail(baselineText, finalText) : null,
    changed: finalText !== baselineText,
    timedOut: true,
    elapsedMs: Date.now() - startedAt,
  };
}

/** Best-effort diff: return the tail of `after` that is new relative to `before`. */
function diffTail(before, after) {
  if (!after) return '';
  if (!before) return after.trim().slice(-800);
  const commonPrefixLen = Math.min(before.length, after.length);
  let i = 0;
  while (i < commonPrefixLen && before[i] === after[i]) i += 1;
  const appended = after.slice(i).trim();
  return (appended || after.trim()).slice(-800);
}

/**
 * Persist a run report with a normalized, user-facing verdict per record.
 * `verdict` on each record may be an internal value (OBS, AUTH_EXPIRED, ...);
 * the report also carries `userVerdict`, normalized to the QA_RESULT_VERDICTS
 * set, so downstream consumers never see a drifted label.
 */
export function writeChatProbeReport(runDir, fileName, records) {
  fs.mkdirSync(runDir, { recursive: true });
  const normalized = records.map(r => ({ ...r, userVerdict: normalizeQaResultVerdict(r.verdict) }));
  const payload = { schema_version: '1.0', generatedAt: new Date().toISOString(), records: normalized };
  fs.writeFileSync(path.join(runDir, fileName), JSON.stringify(payload, null, 2), 'utf8');
  return normalized;
}
