// ux-health.mjs — Đo METRICS UX/interaction có thể lượng hoá (KHÔNG đoán mò).
// Chạy qua npm playwright (script portable). Dùng cho sanity/risk-based khi user báo
// "giật", "click không ăn", "chậm", hoặc khi exploratory thấy khu vực đáng nghi.
//
// CÁCH DÙNG:
//   node <skill-root>/scripts/ux-health.mjs <path> [sel1,sel2,...] [waitMs]
//   node ux-health.mjs /dashboard "button#save,a[data-action=delete]"
//
// ĐO:
//   1. CLS (layout shift tổng) — > 0.1 = giật layout
//   2. Long tasks (>50ms) — gây jank
//   3. Click latency cho từng selector (click → first network/DOM change)
//   4. Double-fire: double-click nhanh → đếm request (phải = 1, nếu 2 = thiếu debounce)
//   5. Click-target health: disabled? pointer-events:none? bị element khác che?
//   6. A11y quick-scan: button/link/input không có tên truy cập; tab order; focus visible
//   7. Horizontal overflow (content > viewport)
//   8. Truncation scan (text cắt bởi ellipsis)
//   9. Touch target size (<44×44px)
//  10. CTA overlap audit (nút có bị che bởi element khác không)
//  11. Sticky/fixed header offset (anchor có bị che khi scroll)
//
// SPAM MODE (test button spam → gọi nhiều API hay không):
//   node ux-health.mjs --spam "<selector>" "<endpoint-regex>" [count]
//   node ux-health.mjs --spam "button:has-text('Sync')" "/api/sync" 5
//   → click count lần nhanh, báo số API call (phải = 1, >1 = thiếu guard)
//
// DEP: playwright (đã có trong skill node_modules). Zero deps khác.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

let env = {};
try { env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(Boolean).map(l => l.split('=').map(s => s.trim()))); }
catch { /* optional */ }
const BASE  = process.env.QA_BASE_URL || env.QA_BASE_URL || '';
const AUTH  = path.join(process.env.QA_DATA_DIR || process.cwd(), 'auth.json');
const EVID  = path.join(process.env.QA_DATA_DIR || process.cwd(), 'evidence');
fs.mkdirSync(EVID, { recursive: true });
if (!BASE) { console.error('❌ Thiếu QA_BASE_URL trong .env'); process.exit(1); }

const urlPath = process.argv[2] || '/';
const sels    = (process.argv[3] || '').split(',').map(s => s.trim()).filter(Boolean);
const waitMs  = Number(process.argv[4] || 2000);

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: fs.existsSync(AUTH) ? AUTH : undefined,
});
ctx.setDefaultTimeout(8000);
const page = await ctx.newPage();

// ─────────────────────────────────────────────────────────────
// SPAM MODE: test button spam → đếm API call (phải = 1, >1 = thiếu guard)
//   node ux-health.mjs <path> --spam "<selector>" "<endpoint-regex>" [count]
// ─────────────────────────────────────────────────────────────
const spamIdx = process.argv.indexOf('--spam');
if (spamIdx !== -1) {
  const spamSel = process.argv[spamIdx + 1];
  const spamEp  = new RegExp(process.argv[spamIdx + 2] || '/api/');
  const spamN   = Number(process.argv[spamIdx + 3] || 5);
  if (!spamSel) { console.error('❌ --spam cần <selector> "<endpoint-regex>" [count]'); process.exit(1); }
  console.log(`\n=== SPAM TEST: ${spamSel} × ${spamN} (đếm API khớp ${spamEp}) ===\n`);
  await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
  let apiCalls = 0;
  const urls = [];
  page.on('request', (r) => {
    const u = r.url();
    if (spamEp.test(u) && /^(POST|PUT|PATCH|DELETE)$/i.test(r.method())) { apiCalls++; urls.push(`${r.method()} ${u.replace(BASE, '').slice(0, 60)}`); }
  });
  try {
    const el = page.locator(spamSel).first();
    if (!(await el.count())) { console.log(`⚠️ Không tìm thấy ${spamSel}`); await b.close(); process.exit(1); }
    for (let i = 0; i < spamN; i++) await el.click({ delay: 60 }).catch(() => {});
    await page.waitForTimeout(1500);
  } catch (e) { console.log('⚠️ Lỗi click:', e.message.split('\n')[0]); }
  console.log(`${apiCalls <= 1 ? '✓ ' : '⚠️ '}Spam ${spamN} lần → ${apiCalls} API call(s) ${apiCalls > 1 ? `— THIẾU DEBOUNCE/GUARD! (duplicate risk)` : '(có guard)'}`);
  if (urls.length) urls.slice(0, 8).forEach((u) => console.log(`     • ${u}`));
  const shot = path.join(EVID, 'spam' + urlPath.replace(/\W+/g, '_') + '.png');
  await page.screenshot({ path: shot });
  console.log(`\n📸 ${shot}\n`);
  await b.close();
  process.exit(apiCalls > 1 ? 1 : 0);
}

// (continue normal flow below)

// Bật observer cho layout-shift + long-task TRƯỚC khi navigate
await page.addInitScript(() => {
  window.__ux = { cls: 0, longTasks: [], inp: [] };
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__ux.cls += e.value)).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__ux.longTasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  } catch {}
  // INP-style: đo input delay mỗi interaction
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__ux.inp.push(Math.round(e.duration)))).observe({ type: 'event', buffered: true });
  } catch {}
});

console.log(`\n=== UX HEALTH: ${urlPath} ===\n`);
await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(waitMs);

// --- 1. CLS ---
const cls = await page.evaluate(() => window.__ux?.cls ?? 0);
console.log(`${cls > 0.1 ? '⚠️ ' : '✓  '}CLS (layout shift): ${cls.toFixed(3)}  ${cls > 0.1 ? '— GIẬT LAYOUT' : ''}`);

// --- 2. Long tasks ---
const longTasks = await page.evaluate(() => window.__ux?.longTasks ?? []);
const ltMax = longTasks.length ? Math.max(...longTasks) : 0;
console.log(`${ltMax > 100 ? '⚠️ ' : '✓  '}Long tasks (>50ms): ${longTasks.length} cái, max ${ltMax}ms ${ltMax > 100 ? '— JANK' : ''}`);

// --- 3-5. Per-selector checks ---
if (sels.length) {
  for (const sel of sels) {
    console.log(`\n— selector: ${sel} —`);
    let el;
    try { el = page.locator(sel).first(); if (!(await el.count())) { console.log('  ⚠️ Không tìm thấy element'); continue; } }
    catch (e) { console.log('  ⚠️ Selector lỗi:', e.message.split('\n')[0]); continue; }

    // Click-target health
    const health = await el.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
      const stack = document.elementsFromPoint(cx, cy);
      const top = stack[0];
      return {
        visible: rect.width > 0 && rect.height > 0,
        disabled: node.disabled === true,
        pointerEvents: getComputedStyle(node).pointerEvents,
        ariaDisabled: node.getAttribute('aria-disabled'),
        obscured: top && top !== node ? (top.tagName + (top.id ? '#' + top.id : '') + (top.className && typeof top.className === 'string' ? '.' + top.className.split(' ').join('.') : '')) : null,
        ariaLabel: node.getAttribute('aria-label') || node.title || (node.innerText || '').trim().slice(0, 30) || null,
      };
    }).catch(() => null);

    if (health) {
      const flags = [];
      if (!health.visible) flags.push('KHÔNG hiển thị');
      if (health.disabled) flags.push('disabled');
      if (health.pointerEvents === 'none') flags.push('pointer-events:none (click không ăn!)');
      if (health.obscured) flags.push(`bị che bởi <${health.obscured}> (click trượt!)`);
      if (!health.ariaLabel) flags.push('KHÔNG có tên truy cập (a11y)');
      console.log(`  ${flags.length ? '⚠️ ' : '✓  '}Target health: ${flags.length ? flags.join(' | ') : 'OK'}`);
    }

    // Click latency
    try {
      const lat = await page.evaluate(async (s) => {
        const t0 = performance.now();
        const node = document.querySelector(s);
        if (!node) return null;
        node.click();
        // chờ microtask + 1 frame
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return Math.round(performance.now() - t0);
      }, sel);
      if (lat !== null) console.log(`  ${lat > 200 ? '⚠️ ' : '✓  '}Click→paint latency: ${lat}ms ${lat > 200 ? '— CHẬM' : ''}`);
    } catch (e) { console.log('  ⚠️ Click latency đo fail:', e.message.split('\n')[0]); }

    // Double-fire: đếm request khi double-click nhanh
    try {
      let reqCount = 0;
      page.on('request', r => { if (/(api|graphql|action|save|delete|update)/i.test(r.url())) reqCount++; });
      await el.click({ clickCount: 2, delay: 50 });
      await page.waitForTimeout(500);
      console.log(`  ${reqCount > 1 ? '⚠️ ' : '✓  '}Double-click → ${reqCount} mutating request(s) ${reqCount > 1 ? '— THIẾU DEBOUNCE!' : ''}`);
    } catch (e) { console.log('  (skip double-fire:', e.message.split('\n')[0] + ')'); }
  }
} else {
  console.log('\n(thêm arg selectors để đo click latency / double-fire / target health từng nút)');
}

// --- 6. A11y quick scan (whole page) ---
const a11y = await page.evaluate(() => {
  const issues = [];
  document.querySelectorAll('button, a[href], input, [role=button]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // skip ẩn
    const name = el.getAttribute('aria-label') || el.title || (el.innerText || '').trim() || el.getAttribute('alt') || null;
    if (!name && el.tagName !== 'INPUT') issues.push(`${el.tagName.toLowerCase()} không có tên truy cập`);
  });
  // focus-visible check (có :focus-visible style không)
  const styleSheets = [...document.styleSheets];
  let hasFocusVisible = false;
  for (const ss of styleSheets) { try { for (const r of ss.cssRules) { if (r.cssText && r.cssText.includes(':focus-visible')) { hasFocusVisible = true; break; } } } catch {} if (hasFocusVisible) break; }
  return { unnamed: issues.length, hasFocusVisible };
});
console.log(`\n${a11y.unnamed > 0 ? '⚠️ ' : '✓  '}A11y: ${a11y.unnamed} element không có tên truy cập; focus-visible style: ${a11y.hasFocusVisible ? 'CÓ' : 'KHÔNG (keyboard user mù focus)'}`);

// --- 7-11. Layout / overlap / truncation / touch audit (whole page) ---
const layout = await page.evaluate(() => {
  const VW = window.innerWidth, VH = window.innerHeight;
  // Horizontal overflow
  const docW = document.documentElement.scrollWidth;
  const hOverflow = docW - VW;
  // Sticky/fixed header height (max của các phần tử fixed top)
  let headerH = 0;
  document.querySelectorAll('*').forEach(el => {
    const s = getComputedStyle(el);
    if ((s.position === 'sticky' || s.position === 'fixed') && s.top === '0px') {
      const r = el.getBoundingClientRect();
      if (r.width > VW * 0.5) headerH = Math.max(headerH, r.bottom); // header-ish (rộng > nửa viewport)
    }
  });
  // Truncation: text có scrollWidth > clientWidth (bị cut)
  const trunc = [];
  document.querySelectorAll('td,th,label,span,p,a,button,h1,h2,h3,h4').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (el.scrollWidth - el.clientWidth > 4 && el.childElementCount === 0) {
      const t = (el.innerText || '').trim().slice(0, 40);
      if (t) trunc.push(`${el.tagName.toLowerCase()}: "${t}${t.length === 40 ? '…' : ''}"`);
    }
  });
  // Touch target: interactive element < 44x44
  const smallTouch = [];
  document.querySelectorAll('button,a[href],[role=button],input[type=checkbox],input[type=radio]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.width < 44 || r.height < 44) smallTouch.push(`${el.tagName.toLowerCase()}${el.id ? '#'+el.id : ''} (${Math.round(r.width)}×${Math.round(r.height)})`);
  });
  // Content under fixed footer: last visible block bottom > viewport - footerH
  const footerH = (() => {
    let h = 0;
    document.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' && s.bottom === '0px') {
        const r = el.getBoundingClientRect();
        if (r.width > VW * 0.5) h = Math.max(h, r.height);
      }
    });
    return h;
  })();
  return {
    hOverflow, headerH, footerH,
    vw: VW, vh: VH, docW,
    trunc: [...new Set(trunc)].slice(0, 8),
    smallTouch: [...new Set(smallTouch)].slice(0, 8),
  };
});

console.log(`${layout.hOverflow > 2 ? '⚠️ ' : '✓  '}Horizontal overflow: ${layout.hOverflow}px ${layout.hOverflow > 2 ? '— CONTENT TRÀN VIEWPORT (xuất hiện scrollbar ngang)' : '(không)'}`);
console.log(`ℹ️  Sticky/fixed header: ${layout.headerH}px ${layout.footerH ? `| fixed footer: ${layout.footerH}px` : ''} ${layout.headerH ? '(anchor scroll có thể bị che)' : ''}`);
console.log(`${layout.trunc.length ? '⚠️ ' : '✓  '}Truncation (text cắt): ${layout.trunc.length}${layout.trunc.length ? ' → ' + layout.trunc.join(' | ').slice(0, 120) : ''}`);
console.log(`${layout.smallTouch.length ? '⚠️ ' : '✓  '}Touch target < 44×44: ${layout.smallTouch.length}${layout.smallTouch.length ? ' → ' + layout.smallTouch.join(', ').slice(0, 120) : ' (OK)'}`);

// CTA overlap audit (cho từng selector user truyền): nút có bị che không?
if (sels.length) {
  console.log('\n— CTA overlap audit —');
  for (const sel of sels) {
    const overlap = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const stack = document.elementsFromPoint(cx, cy);
      const top = stack[0];
      if (top === el) return { obscured: false };
      return { obscured: true, by: top ? (top.tagName + (top.id ? '#'+top.id : '') + (typeof top.className === 'string' ? '.'+top.className.split(' ').slice(0,2).join('.') : '')) : '?' };
    }, sel).catch(() => null);
    if (overlap === null) console.log(`  ${sel}: không tìm thấy`);
    else if (overlap.obscured) console.log(`  ⚠️ ${sel}: BỊ CHE bởi <${overlap.by}> (click trượt!)`);
    else console.log(`  ✓ ${sel}: topmost (click OK)`);
  }
}

// Screenshot evidence
const shot = path.join(EVID, 'ux-health' + urlPath.replace(/\W+/g, '_') + '.png');
await page.screenshot({ path: shot, fullPage: false });
console.log(`\n📸 Evidence: ${shot}`);
console.log(`\n=== HẾT (coi ⚠️ là vấn đề cần đào sâu) ===\n`);
await b.close();
