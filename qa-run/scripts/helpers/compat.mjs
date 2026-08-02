// compat.mjs — Compatibility testing: cross-BROWSER + cross-DEVICE.
// Chạy qua npm playwright (script portable). Bắt khác biệt render/console/HTTP
// giữa các browser engine + device emulation.
//
// CÁCH DÙNG:
//   node <skill-root>/scripts/compat.mjs <path> [engines] [devices]
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

const urlPath = process.argv[2] || '/';
const engines = (process.argv[3] || 'chromium,firefox,webkit').split(',').map(s => s.trim()).filter(Boolean);
const devices = (process.argv[4] || '').split(',').map(s => s.trim()).filter(Boolean);
const getArg = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
};
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

async function probeOne(engineName, deviceName) {
  const launcher = ENGINES[engineName];
  if (!launcher) return { engine: engineName, device: deviceName, error: 'engine không hỗ trợ' };
  const b = await launcher.launch({ headless: true });
  const preset = deviceName ? DEVICE_PRESET[deviceName] : null;
  const ctx = await b.newContext({
    viewport: preset?.viewport || { width: 1440, height: 900 },
    userAgent: preset?.userAgent ? `Mozilla/5.0 (${preset.userAgent}) CompatTest` : undefined,
    isMobile: preset?.isMobile,
    hasTouch: preset?.hasTouch,
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
  const out = { engine: engineName, device: deviceName || 'desktop' };
  try {
    const resp = await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await waitForUiReady(page, { timeout: READY_TIMEOUT_MS });
    out.navStatus = resp ? resp.status() : '?';
    out.loadMs = Date.now() - t0;
    out.title = await page.title();
    out.errors = [...new Set(errs)].slice(0, 8);
    const tag = `compat-${engineName}-${deviceName || 'desktop'}`.replace(/\s+/g, '-');
    out.shot = path.join(EVID, tag + '.png');
    await page.screenshot({ path: out.shot, fullPage: false });
  } catch (e) {
    out.error = e.message.split('\n')[0].slice(0, 100);
  } finally {
    await b.close();
  }
  return out;
}

console.log(`\n=== COMPAT: ${urlPath} | engines: ${engines.join(',')} | devices: ${devices.join(',') || '(none)'} ===\n`);

// Combo: mỗi engine × (desktop + mỗi device)
const combos = [];
for (const eng of engines) {
  combos.push([eng, null]);
  for (const dev of devices) {
    if (DEVICE_PRESET[dev]) combos.push([eng, dev]);
    else console.warn(`⚠️ Device "${dev}" không có preset (có: ${Object.keys(DEVICE_PRESET).join(', ')})`);
  }
}

const results = new Array(combos.length);
let nextIndex = 0;
async function runWorker() {
  while (true) {
    const index = nextIndex++;
    if (index >= combos.length) return;
    const [eng, dev] = combos[index];
    process.stdout.write(`→ ${eng}/${dev || 'desktop'}… `);
    const r = await probeOne(eng, dev);
    results[index] = r;
    const ok = !r.error;
    const errN = r.errors?.length || 0;
    console.log(ok ? `${r.navStatus} (${r.loadMs}ms)${errN ? ` ⚠️ ${errN} err` : ' ✓'}` : `❌ ${r.error}`);
  }
}
await Promise.all(Array.from({ length: Math.min(WORKERS, combos.length) }, () => runWorker()));

// Matrix tóm tắt
console.log(`\n--- MATRIX ---`);
console.log('engine/device'.padEnd(28), 'nav'.padEnd(6), 'load'.padEnd(8), 'errs'.padEnd(6), 'note');
for (const r of results) {
  const key = `${r.engine}/${r.device}`;
  if (r.error) { console.log(key.padEnd(28), '-'.padEnd(6), '-'.padEnd(8), '-'.padEnd(6), `❌ ${r.error}`); continue; }
  const note = (r.errors?.length ? r.errors.join(' ; ').slice(0, 60) : 'OK');
  console.log(key.padEnd(28), String(r.navStatus).padEnd(6), `${r.loadMs}ms`.padEnd(8), String(r.errors?.length || 0).padEnd(6), note);
}
console.log(`\n📸 Evidence: ${EVID}/compat-*.png`);
console.log(`\n=== So sánh screenshot các combo bằng mắt để bắt khác biệt render ===\n`);
