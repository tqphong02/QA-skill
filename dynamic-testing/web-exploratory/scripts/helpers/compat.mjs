// compat.mjs — Compatibility testing: cross-BROWSER + cross-DEVICE.
// Chạy qua npm playwright (script portable). Bắt khác biệt render/console/HTTP
// giữa các browser engine + device emulation.
//
// CÁCH DÙNG:
//   node <skill-root>/scripts/compat.mjs <path> [engines] [devices]
//   node <skill-root>/scripts/compat.mjs <path> --matrix matrix-v2.json
//   node compat.mjs /dashboard chromium,firefox,webkit iphone-12,ipad-11
//
// Mặc định: engines = chromium,firefox,webkit ; devices = (empty)
//   (firefox/webkit cần `npx playwright install firefox webkit` 1 lần)
//
// ĐO mỗi combo:
//   - Load OK? (status nav, time)
//   - Console errors + HTTP≥400
//   - Screenshot vào evidence/compat-<engine>-<device>.png
// In matrix tóm tắt để AI/user so sánh nhanh.
//
// DEP: playwright (đã có trong skill). Browser binary: chromium có sẵn;
//      firefox/webkit cần `npx playwright install firefox webkit`.

import { chromium, firefox, webkit } from 'playwright';
import fs from 'fs';
import path from 'path';
import { installNetworkTracker, waitForUiReady } from '../../lib/wait.mjs';

const DATA = path.resolve(process.env.QA_DATA_DIR || process.cwd());
let env = {};
try { env = Object.fromEntries(fs.readFileSync(path.join(DATA, '.env'), 'utf8').split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))); }
catch { /* optional */ }
const BASE  = process.env.QA_BASE_URL || env.QA_BASE_URL || '';
const AUTH  = path.join(DATA, 'auth.json');
const EVID  = path.join(DATA, 'evidence');
fs.mkdirSync(EVID, { recursive: true });
if (!BASE) { console.error('❌ Thiếu QA_BASE_URL trong .env'); process.exit(1); }

const getArg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
};
const VALUE_FLAGS = new Set(['--matrix', '--ready-timeout', '--workers']);
const positional = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument.startsWith('--')) {
    if (VALUE_FLAGS.has(argument)) index += 1;
    continue;
  }
  positional.push(argument);
}
const urlPath = positional[0] || '/';
const engines = (positional[1] || 'chromium,firefox,webkit').split(',').map(s => s.trim()).filter(Boolean);
const devices = (positional[2] || '').split(',').map(s => s.trim()).filter(Boolean);
const MATRIX_PATH = getArg('--matrix', '');
let MATRIX = null;
if (MATRIX_PATH) {
  try {
    MATRIX = JSON.parse(fs.readFileSync(path.resolve(MATRIX_PATH), 'utf8'));
    if (!MATRIX || typeof MATRIX !== 'object' || !Array.isArray(MATRIX.cases) || !MATRIX.cases.length) {
      throw new Error('matrix phải là object có cases không rỗng');
    }
  } catch (error) {
    console.error(`❌ Không đọc được compatibility matrix: ${error.message}`);
    process.exit(1);
  }
}
const READY_TIMEOUT_MS = Number.parseInt(
  getArg('--ready-timeout', process.env.QA_READY_TIMEOUT_MS || '12000'),
  10,
);
const WORKERS = Math.max(1, Math.min(
  4,
  Number.parseInt(getArg('--workers', process.env.QA_COMPAT_WORKERS || '2'), 10) || 2,
));

// Device preset (viewport + userAgent + isMobile + hasTouch). Mở rộng tuỳ nhu cầu.
const DEVICE_PRESET = {
  'iphone-12':     { viewport: { width: 390, height: 844 },  userAgent: 'iPhone', isMobile: true,  hasTouch: true },
  'iphone-se':     { viewport: { width: 375, height: 667 },  userAgent: 'iPhone', isMobile: true,  hasTouch: true },
  'pixel-7':       { viewport: { width: 412, height: 915 },  userAgent: 'Android', isMobile: true, hasTouch: true },
  'ipad-11':       { viewport: { width: 834, height: 1194 }, userAgent: 'iPad',   isMobile: true,  hasTouch: true },
  'ipad-mini':     { viewport: { width: 768, height: 1024 }, userAgent: 'iPad',   isMobile: true,  hasTouch: true },
  'galaxy-s9':     { viewport: { width: 360, height: 740 },  userAgent: 'Android', isMobile: true, hasTouch: true },
};

const ENGINES = { chromium, firefox, webkit };

function matrixCombos(matrix) {
  const profiles = new Map((Array.isArray(matrix.browser_profiles) ? matrix.browser_profiles : [])
    .filter(profile => profile && profile.id)
    .map(profile => [profile.id, profile]));
  const viewports = new Map((Array.isArray(matrix.viewports) ? matrix.viewports : [])
    .filter(viewport => viewport && viewport.id)
    .map(viewport => [viewport.id, viewport]));
  return matrix.cases.map((testCase, index) => {
    if (!testCase || typeof testCase !== 'object') throw new Error(`case ${index} phải là object`);
    const profile = profiles.get(testCase.browser_profile);
    const viewport = viewports.get(testCase.viewport);
    if (!profile) throw new Error(`case ${testCase.id || index} dùng browser_profile chưa khai báo`);
    if (!viewport) throw new Error(`case ${testCase.id || index} dùng viewport chưa khai báo`);
    return {
      caseId: testCase.id || `matrix-case-${index + 1}`,
      engine: profile.engine,
      device: testCase.device || viewport.device || 'desktop',
      viewport: { width: viewport.width, height: viewport.height },
      userAgent: profile.userAgent,
      channel: profile.channel,
      browserProfile: profile.id,
      vendor: profile.vendor,
      version: profile.version,
      os: testCase.os || profile.os,
      locale: testCase.locale,
      timezone: testCase.timezone,
      expected: testCase.expected || [],
    };
  });
}

let matrixCases = [];
if (MATRIX) {
  try {
    matrixCases = matrixCombos(MATRIX);
  } catch (error) {
    console.error(`❌ Compatibility matrix không hợp lệ: ${error.message}`);
    process.exit(1);
  }
}

async function probeOne(combo) {
  const engineName = combo.engine;
  const deviceName = combo.device;
  const launcher = ENGINES[engineName];
  if (!launcher) return { ...combo, engine: engineName, device: deviceName, error: 'engine không hỗ trợ' };
  let b;
  const preset = deviceName ? DEVICE_PRESET[deviceName] : null;
  const out = {
    ...combo,
    engine: engineName,
    device: deviceName || 'desktop',
    viewport: combo.viewport || preset?.viewport || { width: 1440, height: 900 },
    runtimeHostOs: process.platform,
    osVerified: false,
  };
  try {
    const launchOptions = { headless: true };
    if (combo.channel && engineName === 'chromium') launchOptions.channel = combo.channel;
    b = await launcher.launch(launchOptions);
    const ctx = await b.newContext({
      viewport: out.viewport,
      userAgent: combo.userAgent || (preset?.userAgent ? `Mozilla/5.0 (${preset.userAgent}) CompatTest` : undefined),
      isMobile: preset?.isMobile || out.device === 'mobile' || out.device === 'tablet',
      hasTouch: preset?.hasTouch || out.device === 'mobile' || out.device === 'tablet',
      locale: combo.locale || undefined,
      timezoneId: combo.timezone || undefined,
      storageState: fs.existsSync(AUTH) ? AUTH : undefined,
    });
    ctx.setDefaultTimeout(15000);
    const page = await ctx.newPage();
    installNetworkTracker(page);
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 100)); });
    page.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 100)));
    page.on('response', r => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 70)}`); });

    const t0 = Date.now();
    const resp = await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForUiReady(page, { timeout: READY_TIMEOUT_MS });
    out.navStatus = resp ? resp.status() : '?';
    out.loadMs = Date.now() - t0;
    out.title = await page.title();
    out.errors = [...new Set(errs)].slice(0, 8);
    const tag = `compat-${combo.caseId || engineName + '-' + (deviceName || 'desktop')}`.replace(/[^a-zA-Z0-9_.-]+/g, '-');
    out.shot = path.join(EVID, tag + '.png');
    await page.screenshot({ path: out.shot, fullPage: false });
  } catch (e) {
    out.error = e.message.split('\n')[0].slice(0, 100);
  } finally {
    if (b) await b.close();
  }
  return out;
}

console.log(`\n=== COMPAT: ${urlPath} | ${MATRIX ? `matrix v${MATRIX.matrix_version || 1}: ${MATRIX_PATH}` : `engines: ${engines.join(',')} | devices: ${devices.join(',') || '(none)'}`} ===\n`);

// Combo: mỗi engine × (desktop + mỗi device)
const combos = MATRIX ? matrixCases : [];
if (!MATRIX) {
  for (const eng of engines) {
    combos.push({ engine: eng, device: null });
    for (const dev of devices) {
      if (DEVICE_PRESET[dev]) combos.push({ engine: eng, device: dev });
      else console.warn(`⚠️ Device "${dev}" không có preset (có: ${Object.keys(DEVICE_PRESET).join(', ')})`);
    }
  }
}

const results = new Array(combos.length);
let nextIndex = 0;
async function runWorker() {
  while (true) {
    const index = nextIndex++;
    if (index >= combos.length) return;
    const combo = combos[index];
    process.stdout.write(`→ ${combo.caseId || combo.engine}/${combo.device || 'desktop'}… `);
    const r = await probeOne(combo);
    results[index] = r;
    const ok = !r.error;
    const errN = r.errors?.length || 0;
    console.log(ok ? `${r.navStatus} (${r.loadMs}ms)${errN ? ` ⚠️ ${errN} err` : ' ✓'}` : `❌ ${r.error}`);
  }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, combos.length) }, () => runWorker()));

// Matrix tóm tắt
console.log(`\n--- MATRIX ---`);
console.log('case/profile'.padEnd(28), 'browser'.padEnd(18), 'viewport'.padEnd(14), 'nav'.padEnd(6), 'errs'.padEnd(6), 'note');
for (const r of results) {
  const key = `${r.caseId || r.engine}/${r.device || 'desktop'}`;
  const browser = `${r.vendor || r.engine}${r.version ? `@${r.version}` : ''}`;
  const viewport = r.viewport ? `${r.viewport.width}x${r.viewport.height}` : '-';
  if (r.error) { console.log(key.padEnd(28), browser.padEnd(18), viewport.padEnd(14), '-'.padEnd(6), '-'.padEnd(6), `❌ ${r.error}`); continue; }
  const note = (r.errors?.length ? r.errors.join(' ; ').slice(0, 60) : 'OK');
  console.log(key.padEnd(28), browser.padEnd(18), viewport.padEnd(14), String(r.navStatus).padEnd(6), String(r.errors?.length || 0).padEnd(6), note);
}
console.log(`\n📸 Evidence: ${EVID}/compat-*.png`);
if (MATRIX) console.log('ℹ️ OS trong matrix là target metadata; runner không ảo hoá OS, nên osVerified=false nếu chưa chạy trên host/device tương ứng');
console.log(`\n=== So sánh screenshot các combo bằng mắt để bắt khác biệt render ===\n`);
