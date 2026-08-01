#!/usr/bin/env node
/**
 * extract-flow.mjs — QA Business Flow Extractor
 *
 * Tự động trích xuất business flow, module map, API contracts và UI patterns
 * từ web app đang chạy vào qa-knowledge/ mà không cần đọc source code FE/BE.
 *
 * Cơ chế:
 *   1. Playwright headless: duyệt qua toàn bộ navigation, thu thập DOM có chọn lọc
 *   2. CDP (Chrome DevTools Protocol): intercept toàn bộ network để map API contracts
 *   3. JS Evaluate probes: đọc router, state, config, feature flags từ runtime
 *   4. Output: app-flow-map.json (AI load nhanh) + app-business-guide.md (human readable)
 *
 * Usage:
 *   cd <project-root>
 *   QA_RUN_SKILL_DIR=/path/to/qa-run node <skill-root>/scripts/extract-flow.mjs
 *   QA_RUN_SKILL_DIR=... node extract-flow.mjs --max-pages 20 --wait 1500
 *
 * .env required: QA_BASE_URL, QA_EMAIL (optional), QA_PASSWORD (optional)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ─── Config ──────────────────────────────────────────────────────────────────

const SKILL_DIR = process.env.QA_RUN_SKILL_DIR
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = process.env.QA_DATA_DIR || process.cwd();

// Load .env from project root
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE     = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const EMAIL    = process.env.QA_EMAIL || '';
const PASS     = process.env.QA_PASSWORD || '';
const AUTH     = path.join(DATA, 'auth.json');
const OUT_DIR  = path.join(DATA, 'qa-knowledge');
const JSON_OUT = path.join(OUT_DIR, 'app-flow-map.json');

// CLI flags
const args       = process.argv.slice(2);
const MAX_PAGES  = parseInt(find(args, '--max-pages', 1) ?? '30', 10);
const WAIT_MS    = parseInt(find(args, '--wait', 1) ?? '1200', 10);
const FORCE_AUTH = args.includes('--reauth');
const DRY_RUN    = args.includes('--dry-run');
const TODAY      = new Date().toISOString().slice(0, 10);

function find(arr, flag, offset = 0) {
  const i = arr.indexOf(flag);
  return i !== -1 ? arr[i + offset] : undefined;
}

if (!BASE) {
  console.error('[extract-flow] QA_BASE_URL chưa set trong .env của project');
  process.exit(1);
}

// ─── DOM extractor (injected into page) ───────────────────────────────────────

/**
 * Được inject vào browser context qua page.evaluate().
 * Thu thập có chọn lọc: chỉ lấy thứ có giá trị cho business understanding.
 */
function extractPageContext() {
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0
      && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const txt = el => (el.innerText || el.textContent || el.getAttribute('aria-label')
    || el.getAttribute('placeholder') || el.getAttribute('title') || '')
    .trim().replace(/\s+/g, ' ').slice(0, 100);
  const uniq = arr => [...new Set(arr.filter(Boolean))];

  // Navigation structure (sidebar, topbar, tabs)
  const navLinks = [];
  document.querySelectorAll('nav a, [role=navigation] a, aside a, .sidebar a, .menu a').forEach(a => {
    if (!vis(a)) return;
    const label = txt(a);
    const href  = a.getAttribute('href') || '';
    if (label && href && !href.startsWith('javascript')) navLinks.push({ label, href });
  });

  // Page structure: headings hierarchy
  const headings = [];
  document.querySelectorAll('h1,h2,h3,h4,[role=heading]').forEach(h => {
    if (vis(h) && txt(h)) headings.push({ level: h.tagName || 'heading', text: txt(h) });
  });

  // Forms and their fields (understand what data the feature handles)
  const forms = [];
  document.querySelectorAll('form, [role=form]').forEach(form => {
    const fields = [];
    form.querySelectorAll('input,textarea,select').forEach(inp => {
      if (!vis(inp)) return;
      fields.push({
        type:        inp.type || inp.tagName.toLowerCase(),
        name:        inp.name || inp.id || inp.getAttribute('data-testid') || '',
        placeholder: inp.placeholder || '',
        required:    inp.required || false,
        label:       (form.querySelector(`label[for="${inp.id}"]`) || {}).innerText?.trim() || '',
      });
    });
    const submitBtn = form.querySelector('[type=submit], button:last-of-type');
    if (fields.length) forms.push({ action: form.action || '', fields, submit: txt(submitBtn) });
  });

  // Action buttons outside forms (workflow triggers)
  const actions = [];
  document.querySelectorAll('button, [role=button], a[role=button]').forEach(b => {
    if (!vis(b) || !txt(b)) return;
    const t = txt(b);
    // Skip purely navigational or generic
    if (/^(home|dashboard|menu|close|cancel|×|‹|›|<|>)$/i.test(t)) return;
    actions.push(t);
  });

  // Status badges, chips, tabs (reveal state machine)
  const statuses = [];
  document.querySelectorAll('[class*=badge i],[class*=chip i],[class*=status i],[class*=tag i],[role=tab]').forEach(el => {
    if (vis(el) && txt(el)) statuses.push(txt(el));
  });

  // Table columns (reveal data schema)
  const tableHeaders = [];
  document.querySelectorAll('th, [role=columnheader]').forEach(th => {
    if (vis(th) && txt(th)) tableHeaders.push(txt(th));
  });

  // Alert / toast / notification (reveal business rules and error states)
  const alerts = [];
  document.querySelectorAll('[role=alert],[role=status],[class*=toast i],[class*=alert i],[class*=error i],[class*=success i],[class*=warning i]').forEach(el => {
    if (vis(el) && txt(el)) alerts.push(txt(el));
  });

  // Filter / search widgets (reveal filterable dimensions)
  const filters = [];
  document.querySelectorAll('select,[role=combobox],[data-filter],[class*=filter i]').forEach(el => {
    if (!vis(el)) return;
    const label = txt(el) || el.getAttribute('aria-label') || el.name || '';
    if (label) filters.push(label);
  });

  // Try reading JS runtime for router, feature flags, app config
  let runtimeHints = {};
  try {
    runtimeHints = {
      vueRouter:    typeof window.__vue_router__ !== 'undefined' || typeof window.$router !== 'undefined',
      reactRouter:  typeof window.__reactRouterVersion !== 'undefined',
      nextJs:       typeof window.__NEXT_DATA__ !== 'undefined' ? 'detected' : null,
      nuxtJs:       typeof window.__NUXT__ !== 'undefined' ? 'detected' : null,
      featureFlags: typeof window.featureFlags !== 'undefined' ? Object.keys(window.featureFlags || {}).slice(0, 20) : [],
      appConfig:    typeof window.APP_CONFIG !== 'undefined' ? Object.keys(window.APP_CONFIG || {}).slice(0, 20) : [],
      appEnv:       typeof window.ENV !== 'undefined' ? (window.ENV.APP_ENV || window.ENV.ENVIRONMENT || '') : '',
    };
  } catch (_) { /* ignore */ }

  return {
    url:          location.href,
    title:        document.title,
    navLinks:     uniq(navLinks.map(l => JSON.stringify(l))).slice(0, 60).map(l => JSON.parse(l)),
    headings:     headings.slice(0, 30),
    forms,
    actions:      uniq(actions).slice(0, 40),
    statuses:     uniq(statuses).slice(0, 30),
    tableHeaders: uniq(tableHeaders).slice(0, 30),
    alerts:       uniq(alerts).slice(0, 10),
    filters:      uniq(filters).slice(0, 20),
    runtimeHints,
  };
}

// ─── Network interceptor ──────────────────────────────────────────────────────

function makeNetworkCollector() {
  const calls = new Map(); // key = METHOD+path → aggregated entry

  function recordRequest(request) {
    try {
      const u = new URL(request.url());
      const path = u.pathname.replace(BASE, '');
      if (/\.(png|jpg|gif|svg|woff|woff2|ttf|ico|css|js)(\?|$)/i.test(path)) return;
      if (u.hostname !== new URL(BASE).hostname && !path.startsWith('/api')) return;

      const key = `${request.method()} ${path}`;
      if (!calls.has(key)) {
        calls.set(key, {
          method:      request.method(),
          path,
          queryKeys:   [...u.searchParams.keys()],
          bodyKeys:    [],
          statusCodes: [],
          count:       0,
        });
      }
      calls.get(key).count++;

      // Sample request body keys (avoid capturing actual values)
      try {
        const body = request.postDataJSON();
        if (body && typeof body === 'object') {
          const entry = calls.get(key);
          const newKeys = Object.keys(body).filter(k => !entry.bodyKeys.includes(k));
          entry.bodyKeys.push(...newKeys.slice(0, 20));
        }
      } catch (_) { /* non-JSON */ }
    } catch (_) { /* URL parse error */ }
  }

  function recordResponse(response) {
    try {
      const u = new URL(response.url());
      const path = u.pathname;
      const key = `${response.request().method()} ${path}`;
      if (calls.has(key)) {
        const entry = calls.get(key);
        if (!entry.statusCodes.includes(response.status())) {
          entry.statusCodes.push(response.status());
        }
      }
    } catch (_) { /* ignore */ }
  }

  return { recordRequest, recordResponse, get: () => [...calls.values()] };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function ensureAuth(browser) {
  if (!FORCE_AUTH && fs.existsSync(AUTH)) {
    console.log('[extract-flow] Reusing saved auth.json');
    return;
  }
  if (!EMAIL || !PASS) {
    console.log('[extract-flow] No credentials — running unauthenticated');
    return;
  }
  console.log('[extract-flow] Logging in...');
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const emailSels = ['input[type=email]','input[name*=email i]','input[placeholder*=email i]','input[name=username]'];
  const passSels  = ['input[type=password]','input[name*=pass i]','input[placeholder*=pass i]'];
  for (const s of emailSels) { const e = page.locator(s).first(); if (await e.count()) { await e.fill(EMAIL); break; } }
  for (const s of passSels)  { const e = page.locator(s).first(); if (await e.count()) { await e.fill(PASS);  break; } }

  const btn = page.locator('button[type=submit],button:has-text("Sign in"),button:has-text("Log in"),button:has-text("Đăng nhập"),button:has-text("Login")').first();
  if (await btn.count()) await btn.click(); else await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  const url = page.url();
  if (!/\/login/.test(url)) {
    await ctx.storageState({ path: AUTH });
    console.log('[extract-flow] Login OK, auth.json saved');
  } else {
    console.warn('[extract-flow] Login may have failed — still on login page. Continuing unauthenticated.');
  }
  await ctx.close();
}

// ─── Discover navigation links ────────────────────────────────────────────────

async function discoverNavLinks(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(WAIT_MS);

  const result = await page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const txt = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const links = [];
    document.querySelectorAll('nav a,[role=navigation] a,aside a,.sidebar a,.menu a,header a,[role=menuitem]').forEach(a => {
      if (!vis(a)) return;
      const label = txt(a);
      const href  = (a.getAttribute('href') || '').trim();
      if (!label || !href || href === '#' || href.startsWith('javascript') || href.startsWith('mailto')) return;
      links.push({ label, href: href.startsWith('http') ? href : href });
    });
    return [...new Map(links.map(l => [l.href, l])).values()].slice(0, 60);
  });

  // Resolve relative hrefs
  return result.map(l => ({
    label: l.label,
    url: l.href.startsWith('http') ? l.href : new URL(l.href, BASE).href,
  })).filter(l => l.url.startsWith(BASE));
}

// ─── Extract single page ──────────────────────────────────────────────────────

async function extractPage(page, url, netCollector) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(WAIT_MS);
    // Extra wait for async renders
    try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch { /* ok */ }

    const ctx = await page.evaluate(extractPageContext);
    return { url, ...ctx };
  } catch (err) {
    console.warn(`[extract-flow] Skip ${url}: ${err.message.slice(0, 80)}`);
    return null;
  }
}

// ─── Analyse and synthesize ───────────────────────────────────────────────────

function synthesize(pages, netCalls) {
  const moduleMap = new Map();
  const allActions = new Set();
  const allStatuses = new Set();
  const allTableHeaders = new Set();
  const allForms = [];
  const allAlerts = new Set();

  for (const p of pages) {
    if (!p) continue;
    // Derive module name from URL path segment
    const seg = new URL(p.url).pathname.split('/').filter(Boolean)[0] || 'home';
    if (!moduleMap.has(seg)) {
      moduleMap.set(seg, {
        module:  seg,
        label:   p.headings[0]?.text || seg,
        url:     p.url,
        headings: [],
        actions: [],
        statuses: [],
        tableHeaders: [],
        forms: [],
        alerts: [],
      });
    }
    const m = moduleMap.get(seg);
    m.headings.push(...p.headings.map(h => h.text));
    m.actions.push(...p.actions);
    m.statuses.push(...p.statuses);
    m.tableHeaders.push(...p.tableHeaders);
    m.forms.push(...p.forms);
    m.alerts.push(...p.alerts);

    p.actions.forEach(a => allActions.add(a));
    p.statuses.forEach(s => allStatuses.add(s));
    p.tableHeaders.forEach(h => allTableHeaders.add(h));
    p.forms.forEach(f => allForms.push(f));
    p.alerts.forEach(a => allAlerts.add(a));
  }

  // Group API calls by domain area
  const apiByModule = {};
  for (const call of netCalls) {
    const seg = call.path.split('/').filter(Boolean)[1] || call.path.split('/').filter(Boolean)[0] || 'root';
    if (!apiByModule[seg]) apiByModule[seg] = [];
    apiByModule[seg].push(call);
  }

  return {
    modules:     [...moduleMap.values()].map(m => ({
      ...m,
      headings:    [...new Set(m.headings)].slice(0, 10),
      actions:     [...new Set(m.actions)].slice(0, 20),
      statuses:    [...new Set(m.statuses)].slice(0, 15),
      tableHeaders:[...new Set(m.tableHeaders)].slice(0, 15),
      forms:       m.forms.slice(0, 5),
      alerts:      [...new Set(m.alerts)].slice(0, 8),
    })),
    global: {
      allActions:     [...allActions].slice(0, 60),
      allStatuses:    [...allStatuses].slice(0, 40),
      allTableHeaders:[...allTableHeaders].slice(0, 40),
    },
    apiContracts:    netCalls.slice(0, 200),
    apiByModule,
    pagesScanned:    pages.filter(Boolean).length,
  };
}

// ─── Render Markdown guide ─────────────────────────────────────────────────────

function renderMarkdown(synthesis, today) {
  const ms = synthesis.modules;
  const api = synthesis.apiContracts;

  const coverageMap = ms.map(m => ({
    title:  m.label || m.module,
    status: 'partial',
    source: 'inferred from DOM + network',
    evidence: m.url,
  }));

  const roles = [];  // Cannot be inferred without auth context
  const entryPoints = ms.map(m => ({
    route:   new URL(m.url).pathname,
    title:   m.label,
    actions: m.actions.slice(0, 5).join(', '),
  }));

  const happyFlow = [{
    action:    'APP_BASELINE_DISCOVERY chạy extract-flow.mjs',
    status:    'inferred',
    source:    'DOM + network extraction',
    expected:  'Xem từng module trong coverage_map bên dưới',
  }];

  const businessRules = [];
  // Business rules inferred from status labels (e.g. "Pending", "Approved", "Rejected")
  const statusWords = synthesis.global.allStatuses;
  if (statusWords.length) {
    businessRules.push({
      rule:   `Trạng thái hệ thống: ${statusWords.slice(0, 10).join(', ')}`,
      status: 'inferred',
      source: 'status badges/chips trong DOM',
    });
  }

  const states = statusWords.slice(0, 20).map(s => ({
    state:  s,
    status: 'inferred',
    source: 'DOM badge/chip/tab',
  }));

  const inputs = [];
  for (const form of synthesis.global.allTableHeaders.length ? [] : []) {
    inputs.push({ input: form, status: 'inferred', source: 'table header' });
  }
  for (const m of ms) {
    for (const form of m.forms) {
      for (const field of (form.fields || [])) {
        inputs.push({
          input:    field.label || field.name || field.placeholder || field.type,
          type:     field.type,
          required: String(field.required),
          status:   'inferred',
          source:   `form on ${new URL(m.url).pathname}`,
        });
      }
    }
  }

  const apiNetwork = api.slice(0, 50).map(c => ({
    endpoint:   `${c.method} ${c.path}`,
    query_keys: c.queryKeys.join(', ') || 'none',
    body_keys:  c.bodyKeys.join(', ')  || 'none',
    status_codes: c.statusCodes.join(', ') || 'unknown',
    count:      `${c.count} calls`,
    status:     'inferred',
    source:     'network intercept',
  }));

  const uiUx = synthesis.global.allActions.slice(0, 20).map(a => ({
    behavior: a,
    status:   'inferred',
    source:   'button/action in DOM',
  }));

  const unresolved = [
    { question: 'Role-based permissions chưa được xác minh — cần test từng role riêng', status: 'unresolved' },
    { question: 'Business rules ẩn trong server-side logic chưa được map — cần đọc spec hoặc test thực tế', status: 'unresolved' },
    { question: 'Side effects (email, webhook, queue) chưa được xác minh qua network', status: 'unresolved' },
  ];

  const guideData = {
    guide_kind:    'app',
    project:       process.env.QA_PROJECT_NAME || new URL(BASE).hostname,
    feature:       'Application overview',
    slug:          'app',
    environment:   process.env.QA_ENV || 'UAT',
    base_url:      BASE,
    last_verified: today,
    confidence:    'inferred',
    source_refs: [{
      title:  'extract-flow.mjs DOM + network extraction',
      status: 'inferred',
      source: `${synthesis.pagesScanned} pages scanned at ${today}`,
    }],
    coverage_map:    coverageMap,
    roles,
    entry_points:    entryPoints,
    happy_flow:      happyFlow,
    business_rules:  businessRules,
    states,
    inputs,
    side_effects:    [],
    integrations:    [],
    api_network:     apiNetwork,
    ui_ux:           uiUx,
    known_issues:    [],
    reusable_assets: [{
      asset:  `qa-knowledge/app-flow-map.json`,
      status: 'verified',
      source: 'extract-flow.mjs output — AI load nhanh, không cần re-scan',
    }],
    unresolved,
    latest_run: {
      scope:   `APP_BASELINE_DISCOVERY — extract-flow.mjs scanned ${synthesis.pagesScanned} pages`,
      verdict: 'PARTIAL',
      notes: [
        `Confidence: inferred — chưa có human verify`,
        `Pages scanned: ${synthesis.pagesScanned}`,
        `API contracts collected: ${api.length}`,
        `Re-run với --reauth nếu cần refresh session`,
      ],
    },
  };

  return guideData;
}

// ─── Write outputs ─────────────────────────────────────────────────────────────

async function writeOutputs(synthesis, today) {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Raw JSON (for AI fast load)
  const jsonOut = { extractedAt: today, base_url: BASE, ...synthesis };
  fs.writeFileSync(JSON_OUT, JSON.stringify(jsonOut, null, 2), 'utf8');
  console.log(`[extract-flow] JSON written: ${JSON_OUT}`);

  // 2. Markdown guide via write-business-guide.mjs
  const guideData = renderMarkdown(synthesis, today);
  const tmpJson = path.join(OUT_DIR, '.extract-flow-tmp.json');
  fs.writeFileSync(tmpJson, JSON.stringify(guideData, null, 2), 'utf8');

  const writeTool = path.join(SKILL_DIR, 'scripts', 'writers', 'write-business-guide.mjs');
  if (!fs.existsSync(writeTool)) {
    console.warn('[extract-flow] write-business-guide.mjs not found — skip markdown render');
    fs.unlinkSync(tmpJson);
    return;
  }

  // If guide already exists, add merge fields
  const guidePath = path.join(OUT_DIR, 'app-business-guide.md');
  if (fs.existsSync(guidePath)) {
    guideData.previous_guide = 'qa-knowledge/app-business-guide.md';
    guideData.merge_confirmed = true;
    fs.writeFileSync(tmpJson, JSON.stringify(guideData, null, 2), 'utf8');
  }

  try {
    execSync(`node "${writeTool}" "${tmpJson}" "${DATA}"`, { stdio: 'inherit' });
  } finally {
    try { fs.unlinkSync(tmpJson); } catch { /* ok */ }
  }

  // Validate
  try {
    execSync(`node "${writeTool}" --check "${guidePath}"`, { stdio: 'inherit' });
  } catch { /* validation warnings already printed */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[extract-flow] START — base: ${BASE}, max-pages: ${MAX_PAGES}, wait: ${WAIT_MS}ms`);
  if (DRY_RUN) console.log('[extract-flow] DRY RUN — no files will be written');

  const browser = await chromium.launch({ headless: true });

  // Step 1: Ensure authenticated session
  await ensureAuth(browser);

  // Step 2: Create context
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(25000);
  const page = await ctx.newPage();

  // Step 3: Setup network collector
  const net = makeNetworkCollector();
  page.on('request',  r => net.recordRequest(r));
  page.on('response', r => net.recordResponse(r));

  // Step 4: Discover navigation structure from home
  console.log('[extract-flow] Discovering navigation...');
  let navLinks = [];
  try {
    navLinks = await discoverNavLinks(page);
    console.log(`[extract-flow] Found ${navLinks.length} nav links`);
    navLinks.forEach(l => console.log(`  - ${l.label} → ${l.url}`));
  } catch (err) {
    console.warn(`[extract-flow] Nav discovery failed: ${err.message.slice(0, 80)}`);
  }

  // Step 5: Collect pages to visit (home + nav links + dedup)
  const toVisit = [{ label: 'Home', url: BASE }];
  const seen = new Set([BASE]);
  for (const link of navLinks) {
    if (!seen.has(link.url)) { toVisit.push(link); seen.add(link.url); }
  }
  const limited = toVisit.slice(0, MAX_PAGES);
  console.log(`[extract-flow] Pages to scan: ${limited.length}`);

  // Step 6: Extract each page
  const pages = [];
  for (let i = 0; i < limited.length; i++) {
    const { label, url } = limited[i];
    console.log(`[extract-flow] (${i + 1}/${limited.length}) ${label} — ${url}`);
    if (!DRY_RUN) {
      const result = await extractPage(page, url, net);
      pages.push(result);
    }
  }

  await ctx.close();
  await browser.close();

  if (DRY_RUN) {
    console.log('[extract-flow] DRY RUN complete — no output written');
    return;
  }

  // Step 7: Synthesize findings
  const netCalls   = net.get();
  const synthesis  = synthesize(pages, netCalls);

  console.log(`\n[extract-flow] SUMMARY`);
  console.log(`  Pages scanned:      ${synthesis.pagesScanned}`);
  console.log(`  Modules detected:   ${synthesis.modules.length}`);
  console.log(`  API calls captured: ${netCalls.length}`);
  console.log(`  Status labels:      ${synthesis.global.allStatuses.slice(0, 8).join(', ')}`);
  console.log(`  Actions found:      ${synthesis.global.allActions.slice(0, 8).join(', ')}`);

  // Step 8: Write JSON + Markdown
  await writeOutputs(synthesis, TODAY);

  console.log('\n[extract-flow] DONE');
  console.log(`  JSON (AI fast load): ${JSON_OUT}`);
  console.log(`  Markdown (human):    ${path.join(OUT_DIR, 'app-business-guide.md')}`);
  console.log(`\nLần test tiếp theo, AI đọc qa-knowledge/app-flow-map.json thay vì scan lại từ đầu.`);
}

main().catch(err => {
  console.error('[extract-flow] FATAL:', err.message);
  process.exit(1);
});
