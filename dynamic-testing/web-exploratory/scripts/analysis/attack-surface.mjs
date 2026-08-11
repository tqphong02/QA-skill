#!/usr/bin/env node
/**
 * attack-surface.mjs — Systematic Mutation Attack Tester
 *
 * Tự động inject mutations vào mọi form và action button trên một trang.
 * Chạy headless, không tốn AI token trong khi thực thi.
 * AI chỉ đọc findings JSON/Markdown sau khi script xong.
 *
 * Usage:
 *   cd <project-root>
 *   QA_RUN_SKILL_DIR=/path/to/dynamic-web-exploratory node <skill>/scripts/attack-surface.mjs /path [options]
 *
 * Options:
 *   --path /dashboard      URL path to test (default: /)
 *   --selector "form"      Scope to specific form/section CSS selector
 *   --skip-destructive     Skip mutations that mutate server state
 *   --timeout 10000        Per-mutation timeout ms (default: 8000)
 *   --output findings.json Override output path
 *
 * Examples:
 *   node attack-surface.mjs --path /login
 *   node attack-surface.mjs --path /settings --skip-destructive
 *   node attack-surface.mjs --path /admin/users --selector "form.create-user"
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE    = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const AUTH    = path.join(DATA, 'auth.json');
const EVID    = path.join(DATA, 'evidence');
const TODAY   = new Date().toISOString().slice(0, 10);

// CLI Args helper
const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const URL_PATH      = getArg('--path', '/');
const SCOPE_SEL     = getArg('--selector', '');
const TIMEOUT_MS    = parseInt(getArg('--timeout', '8000'), 10);
const ALLOW_ACTION = getArg('--allow-action', ''); // Specific action opt-in e.g. "delete-test-record"
const OUTPUT_FILE  = getArg('--output', path.join(EVID, `attack-surface-${TODAY}.json`));

// Predefined Strict Action Policies Allowlist
export const ALLOWED_ACTION_POLICIES = new Set([
  'delete-test-record',
  'clear-test-cart',
  'purge-test-cache',
  'reset-test-user-password',
]);

export function evaluateActionSafety({ actionText, selector = '', httpMethod = 'GET', targetUrl = '', env = process.env.QA_ENV || 'UAT', allowAction = ALLOW_ACTION }) {
  const text = (actionText + ' ' + selector).toLowerCase();
  const url  = targetUrl.toLowerCase();
  const isProd = /prod|production|live/i.test(env);

  // 1. External Domain Check
  if (url && BASE && !url.includes(new URL(BASE).hostname)) {
    return { safety: 'BLOCKED', reason: 'External domain target is BLOCKED by default' };
  }

  // 2. Production Environment Check
  if (isProd && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod.toUpperCase())) {
    return { safety: 'BLOCKED', reason: 'Mutations on production environment are BLOCKED' };
  }

  // 3. Payment Category
  if (/pay|checkout|charge|deposit|transfer|momo|vnpay|paypal|credit|stripe/i.test(text)) {
    return { safety: 'PAYMENT', reason: 'Payment actions require sandbox/mock mode' };
  }

  // 4. External Effect Category
  // A login form's Email field is input data, not an outbound side effect.
  // Require an effect verb/object combination so semantic locator text such as
  // "textbox Email" does not block an otherwise read-only authentication step.
  const hasExternalEffect = [
    /\bsend(?:\s+\w+){0,3}\s+(?:email|mail|sms|notification|message)\b/i,
    /\b(?:email|mail)\s+(?:blast|campaign|all|customer|user|notification)\b/i,
    /\b(?:notify|webhook|sms|blast|broadcast|export[- ]all)\b/i,
  ].some(pattern => pattern.test(text));
  if (hasExternalEffect) {
    return { safety: 'EXTERNAL_EFFECT', reason: 'External side-effects require mock mode' };
  }

  // 5. Destructive Category with Strict Policy Allowlist Validation
  // Match destructive verbs as complete tokens. Upload controls commonly use
  // class names such as `dropzone`; substring matching `drop` there would
  // incorrectly block a scoped QA upload before POST safety is evaluated
  if (/\b(?:delete|remove|destroy|purge|drop|reset-db|clear-all|truncate)\b|xóa|xoá/i.test(text)) {
    if (allowAction && ALLOWED_ACTION_POLICIES.has(allowAction)) {
      return { safety: 'DESTRUCTIVE_ALLOWED', reason: `Opt-in action enabled via valid policy: ${allowAction}` };
    }
    return { safety: 'BLOCKED', reason: `Destructive action BLOCKED. Allowed policies: ${[...ALLOWED_ACTION_POLICIES].join(', ')}` };
  }

  // 6. Safe Write
  if (/save|submit|create|add|update|edit|lưu|tạo|thêm|sửa/i.test(text) || ['POST', 'PUT', 'PATCH'].includes(httpMethod.toUpperCase())) {
    return { safety: 'SAFE_WRITE', reason: 'Safe write with test data namespace' };
  }

  // 7. Read Only
  if (/search|filter|view|open|tab|find|tìm|lọc|xem/i.test(text) || httpMethod.toUpperCase() === 'GET') {
    return { safety: 'READ_ONLY', reason: 'Read only interaction' };
  }

  // Default Fallback: BLOCKED if unknown safety
  return { safety: 'BLOCKED', reason: 'Unknown action safety — BLOCKED by default' };
}

// ─── Mutation payloads ────────────────────────────────────────────────────────

const MUTATIONS = {
  empty:         [
    { label: 'empty string', value: '' },
    { label: 'whitespace only', value: '   ' },
    { label: 'newline only', value: '\n' },
    { label: 'tab only', value: '\t' },
  ],
  boundary:      [
    { label: '0 (zero)', value: '0' },
    { label: '-1 (negative)', value: '-1' },
    { label: '1 (min valid)', value: '1' },
    { label: '99999999 (large)', value: '99999999' },
    { label: '0.001 (float)', value: '0.001' },
    { label: '2147483647 (INT_MAX)', value: '2147483647' },
    { label: '2147483648 (INT_MAX+1)', value: '2147483648' },
  ],
  string_boundary: [
    { label: '1 char', value: 'a' },
    { label: '255 chars', value: 'a'.repeat(255) },
    { label: '256 chars', value: 'a'.repeat(256) },
    { label: '10000 chars', value: 'a'.repeat(10000) },
  ],
  special_chars: [
    { label: 'SQL injection basic', value: "' OR '1'='1" },
    { label: 'SQL comment', value: "admin'--" },
    { label: 'XSS basic', value: '<script>alert(1)</script>' },
    { label: 'XSS img', value: '<img src=x onerror=alert(1)>' },
    { label: 'Path traversal', value: '../../../etc/passwd' },
    { label: 'Null byte', value: 'test\x00value' },
    { label: 'Unicode RTL override', value: 'test\u202Evalue' },
    { label: 'Emoji', value: '😀🎉🔥' },
    { label: 'CRLF injection', value: 'test\r\nX-Injected: true' },
  ],
  type_mismatch: [
    { label: 'letters in number field', value: 'abc' },
    { label: 'symbols', value: '!@#$%^&*()' },
    { label: 'negative float', value: '-3.14' },
    { label: 'scientific notation', value: '1e999' },
    { label: 'NaN string', value: 'NaN' },
    { label: 'Infinity', value: 'Infinity' },
  ],
};

// ─── Findings tracker ─────────────────────────────────────────────────────────

const findings = [];

function addFinding({ severity, category, element, mutation, observed, expected, url, screenshot }) {
  const finding = {
    id:        `ATK-${String(findings.length + 1).padStart(3, '0')}`,
    severity,  // HIGH | MEDIUM | LOW | INFO
    category,
    element,
    mutation,
    observed,
    expected: expected || 'Validation error hoặc xử lý gracefully',
    url,
    screenshot: screenshot || null,
    timestamp: new Date().toISOString(),
  };
  findings.push(finding);
  const icon = severity === 'HIGH' ? '🔴' : severity === 'MEDIUM' ? '🟡' : '🔵';
  console.log(`  ${icon} [${finding.id}] ${severity} — ${category}: ${observed}`);
  return finding;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeScreenshot(page, label) {
  try {
    const fname = `attack-${label.replace(/[^a-z0-9]/gi, '-').slice(0, 50)}-${Date.now()}.png`;
    const p = path.join(EVID, fname);
    await page.screenshot({ path: p, fullPage: false });
    return fname;
  } catch { return null; }
}

async function getAlerts(page) {
  return page.evaluate(() => {
    const alerts = [];
    document.querySelectorAll('[role=alert],[role=status],[class*=error i],[class*=toast i],[class*=notification i],[class*=warning i]').forEach(el => {
      const txt = (el.innerText || '').trim();
      if (txt) alerts.push(txt.slice(0, 200));
    });
    return alerts;
  });
}

async function getNetworkCallCount(page, apiPattern, action) {
  let count = 0;
  const onReq = req => { if (new RegExp(apiPattern, 'i').test(req.url())) count++; };
  page.on('request', onReq);
  await action();
  await page.waitForTimeout(800);
  page.off('request', onReq);
  return count;
}

// ─── Attack: Form field mutations ─────────────────────────────────────────────

async function attackFormFields(page, url) {
  console.log('\n[attack] Form field mutations...');

  const forms = await page.evaluate((scope) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return [];
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const result = [];
    root.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea').forEach(inp => {
      if (!vis(inp)) return;
      result.push({
        selector: inp.id ? `#${inp.id}` : inp.name ? `[name="${inp.name}"]` : inp.type ? `input[type="${inp.type}"]` : 'input',
        type:     inp.type || 'text',
        name:     inp.name || inp.id || '',
        required: inp.required,
      });
    });
    return result.slice(0, 10); // max 10 fields to keep test fast
  }, SCOPE_SEL);

  if (!forms.length) {
    console.log('  [skip] No visible input fields found');
    return;
  }

  const submitSel = 'button[type=submit], input[type=submit], button:has-text("Save"), button:has-text("Submit"), button:has-text("Lưu"), button:has-text("Tạo"), button:has-text("Create"), button:has-text("Add")';

  for (const field of forms) {
    const mutationSets = field.type === 'number'
      ? [...MUTATIONS.boundary, ...MUTATIONS.type_mismatch]
      : [...MUTATIONS.empty, ...MUTATIONS.string_boundary, ...MUTATIONS.special_chars];

    // Only test a subset to keep runtime reasonable
    const toTest = mutationSets.slice(0, 6);

    for (const mutation of toTest) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const locator = page.locator(field.selector).first();
        if (!await locator.count()) continue;

        await locator.fill(mutation.value);
        await page.waitForTimeout(200);

        // Check for inline validation before submit
        const inlineErr = await page.evaluate((sel) => {
          const inp = document.querySelector(sel);
          if (!inp) return null;
          const validity = inp.validity;
          if (!validity.valid) return inp.validationMessage;
          const errEl = inp.closest('[class*=form-group i],[class*=field i]')
            ?.querySelector('[class*=error i],[class*=invalid i]');
          return errEl ? (errEl.innerText || '').trim() : null;
        }, field.selector);

        // Attempt submit
        const submitBtn = page.locator(submitSel).first();
        if (await submitBtn.count()) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
        }

        const alertsAfter = await getAlerts(page);
        const currentUrl = page.url();
        const navigatedAway = !currentUrl.includes(new URL(url).pathname);

        // Evaluate findings
        if (mutation.label.includes('SQL') || mutation.label.includes('XSS') || mutation.label.includes('traversal')) {
          const pageSource = await page.content();
          if (pageSource.includes('<script>alert') || pageSource.includes("' OR '1'='1")) {
            const ss = await safeScreenshot(page, `xss-reflected-${field.name}`);
            addFinding({
              severity: 'HIGH',
              category: 'XSS / Injection reflected',
              element: field.name || field.selector,
              mutation: mutation.label,
              observed: 'Payload reflected in page source without sanitization',
              url,
              screenshot: ss,
            });
          }
        }

        if (field.required && mutation.label.includes('empty') && navigatedAway && !alertsAfter.length) {
          const ss = await safeScreenshot(page, `required-bypass-${field.name}`);
          addFinding({
            severity: 'HIGH',
            category: 'Required field bypass',
            element: field.name || field.selector,
            mutation: mutation.label,
            observed: 'Form submitted and navigated away without error on required field',
            expected: 'Validation error: field is required',
            url,
            screenshot: ss,
          });
        }

        if (!inlineErr && !alertsAfter.length && !navigatedAway &&
            (mutation.label.includes('10000') || mutation.label.includes('INT_MAX+1'))) {
          addFinding({
            severity: 'MEDIUM',
            category: 'No boundary validation feedback',
            element: field.name || field.selector,
            mutation: mutation.label,
            observed: `No error shown for ${mutation.label} — silent failure or accepted without limit`,
            url,
          });
        }
      } catch (err) {
        // Mutation caused JS error → interesting
        addFinding({
          severity: 'LOW',
          category: 'JS error on input',
          element: field.name || field.selector,
          mutation: mutation.label,
          observed: `JS exception: ${err.message.slice(0, 100)}`,
          url,
        });
      }
    }
  }
}

// ─── Attack: Double-submit ─────────────────────────────────────────────────────

async function attackDoubleSubmit(page, url) {
  if (SKIP_DESTR) return;
  console.log('\n[attack] Double-submit race condition...');

  const submitSel = 'button[type=submit], input[type=submit], button:has-text("Save"), button:has-text("Lưu"), button:has-text("Tạo"), button:has-text("Create")';
  const btn = page.locator(submitSel).first();
  if (!await btn.count()) { console.log('  [skip] No submit button'); return; }

  // Count API calls during double-click
  let callCount = 0;
  const onReq = req => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) callCount++;
  };
  page.on('request', onReq);

  await btn.dblclick({ delay: 50 });
  await page.waitForTimeout(1500);
  page.off('request', onReq);

  if (callCount > 1) {
    const ss = await safeScreenshot(page, 'double-submit');
    addFinding({
      severity: 'HIGH',
      category: 'Double-submit: missing guard',
      element: 'Submit button',
      mutation: 'Double-click submit',
      observed: `${callCount} API mutation calls fired (expected: 1) — no debounce/disable guard`,
      expected: 'Button disabled after first click, only 1 API call',
      url,
      screenshot: ss,
    });
  } else if (callCount === 0) {
    console.log('  [info] No API calls on submit — may be client-side only or no data to submit');
  } else {
    console.log(`  [ok] Double-submit guarded: ${callCount} API call`);
  }
}

// ─── Attack: Back button state ─────────────────────────────────────────────────

async function attackBackButton(page, url) {
  console.log('\n[attack] Back button / browser history state...');
  const before = page.url();

  // Navigate somewhere then come back
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const after = page.url();
  const alerts = await getAlerts(page);
  const hasErrors = alerts.some(a => /error|lỗi|fail|500/i.test(a));

  if (hasErrors) {
    const ss = await safeScreenshot(page, 'back-button-error');
    addFinding({
      severity: 'MEDIUM',
      category: 'Back button causes error state',
      element: 'Browser back navigation',
      mutation: 'navigate away → back',
      observed: `Error alerts after back: ${alerts[0]?.slice(0, 100)}`,
      url: after,
      screenshot: ss,
    });
  } else {
    console.log('  [ok] Back button handled gracefully');
  }
}

// ─── Attack: Session / Auth boundary ──────────────────────────────────────────

async function attackSessionBoundary(page, url) {
  console.log('\n[attack] Session / auth boundary...');

  // Try clearing auth tokens from storage
  const hadAuth = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => /token|auth|session|jwt/i.test(k));
    if (keys.length) {
      keys.forEach(k => localStorage.removeItem(k));
      return keys.length;
    }
    return 0;
  });

  if (hadAuth > 0) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    const isOnProtected = !currentUrl.includes('/login') && !currentUrl.includes('/auth');

    if (isOnProtected) {
      const ss = await safeScreenshot(page, 'token-cleared-no-redirect');
      addFinding({
        severity: 'HIGH',
        category: 'Auth: page accessible after token cleared',
        element: 'localStorage auth tokens',
        mutation: `Cleared ${hadAuth} auth token(s) from localStorage`,
        observed: `Still on protected page ${currentUrl} after clearing tokens`,
        expected: 'Redirect to /login or show unauthenticated state',
        url,
        screenshot: ss,
      });
    } else {
      console.log('  [ok] Redirected to login after token clear');
    }
  } else {
    console.log('  [info] No auth tokens in localStorage — may use cookie-based auth');
  }
}

// ─── Attack: Admin URL direct access ─────────────────────────────────────────

async function attackDirectUrlAccess(page, url) {
  console.log('\n[attack] Direct URL access to admin/sensitive paths...');

  const sensitivePatterns = [
    '/admin', '/admin/users', '/admin/settings',
    '/settings/billing', '/settings/security', '/settings/team',
    '/api/admin', '/api/users', '/api/config',
    '/superadmin', '/manage', '/dashboard/admin',
  ];

  for (const path_ of sensitivePatterns.slice(0, 5)) {
    try {
      const resp = await page.goto(BASE + path_, { waitUntil: 'domcontentloaded', timeout: 6000 });
      const status = resp?.status() || 0;
      const currentUrl = page.url();

      // If we land on the page and it's not login/error → potential issue
      if (status === 200 && !currentUrl.includes('/login') && !currentUrl.includes('/error') && !currentUrl.includes('/404')) {
        const hasContent = await page.evaluate(() => document.body.innerText.trim().length > 100);
        if (hasContent) {
          const ss = await safeScreenshot(page, `direct-access-${path_.replace(/\//g, '-')}`);
          addFinding({
            severity: 'MEDIUM',
            category: 'Potential unauthorized direct access',
            element: path_,
            mutation: 'Direct URL navigation',
            observed: `HTTP 200 on ${path_} without redirect to login — may be accessible`,
            expected: 'Redirect to /login or HTTP 401/403',
            url: BASE + path_,
            screenshot: ss,
          });
        }
      }
    } catch { /* path not found = expected */ }
    await page.waitForTimeout(300);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const targetUrl = BASE + URL_PATH;
  console.log(`[attack-surface] TARGET: ${targetUrl}`);
  console.log(`[attack-surface] Skip destructive: ${SKIP_DESTR}`);
  console.log(`[attack-surface] Output: ${OUTPUT_FILE}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  ctx.setDefaultTimeout(TIMEOUT_MS);
  ctx.setDefaultNavigationTimeout(20000);
  const page = await ctx.newPage();

  // Baseline: navigate to target
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
  } catch (err) {
    console.error(`[attack-surface] Cannot reach ${targetUrl}: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  const pageTitle = await page.title();
  console.log(`[attack-surface] Page: "${pageTitle}" — ${page.url()}`);

  // Run attacks
  await attackFormFields(page, page.url());

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await attackDoubleSubmit(page, page.url());

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await attackBackButton(page, page.url());

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await attackSessionBoundary(page, page.url());

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await attackDirectUrlAccess(page, page.url());

  await ctx.close();
  await browser.close();

  // ── Output ──────────────────────────────────────────────────────────────────
  const summary = {
    tool:         'attack-surface.mjs',
    target_url:   targetUrl,
    tested_at:    new Date().toISOString(),
    total_findings: findings.length,
    by_severity: {
      HIGH:   findings.filter(f => f.severity === 'HIGH').length,
      MEDIUM: findings.filter(f => f.severity === 'MEDIUM').length,
      LOW:    findings.filter(f => f.severity === 'LOW').length,
      INFO:   findings.filter(f => f.severity === 'INFO').length,
    },
    findings,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n═══ ATTACK SURFACE SUMMARY ═══════════════════════════════');
  console.log(`Target:   ${targetUrl}`);
  console.log(`Findings: ${findings.length} total`);
  console.log(`  HIGH:   ${summary.by_severity.HIGH}`);
  console.log(`  MEDIUM: ${summary.by_severity.MEDIUM}`);
  console.log(`  LOW:    ${summary.by_severity.LOW}`);
  console.log(`Output:   ${OUTPUT_FILE}`);
  console.log('══════════════════════════════════════════════════════════');

  if (findings.length) {
    console.log('\nFindings:');
    for (const f of findings) {
      console.log(`\n  [${f.id}] ${f.severity} — ${f.category}`);
      console.log(`  Element:  ${f.element}`);
      console.log(`  Mutation: ${f.mutation}`);
      console.log(`  Observed: ${f.observed}`);
      if (f.screenshot) console.log(`  Evidence: evidence/${f.screenshot}`);
    }
  }
  process.exit(summary.by_severity.HIGH > 0 ? 1 : 0);
}

const SKIP_DESTR = !ALLOW_ACTION;

if (process.argv[1] && process.argv[1].endsWith('attack-surface.mjs')) {
  main().catch(err => {
    console.error('[attack-surface] FATAL:', err.message);
    process.exit(1);
  });
}
