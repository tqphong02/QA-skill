// Token-frugal Playwright driver — GLOBAL skill, project-agnostic.
//  - headless, KHÔNG trả ảnh vào context (screenshot -> file)
//  - snap() chỉ in interactive elements + text chính + console/HTTP errors
// Dữ liệu (auth/evidence/.env) resolve theo PROJECT đang test:
//   QA_DATA_DIR nếu set, ngược lại = cwd (thư mục bạn chạy lệnh).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* .env optional */ }
export const BASE = process.env.QA_BASE_URL || '';
if (!BASE) console.warn('⚠️  QA_BASE_URL chưa set (đặt trong .env của project) — goto sẽ lỗi.');
export const AUTH = path.join(DATA, 'auth.json');
export const EVID = path.join(DATA, 'evidence');
fs.mkdirSync(EVID, { recursive: true });

export async function browser(useAuth = true) {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: useAuth && fs.existsSync(AUTH) ? AUTH : undefined,
  });
  ctx.setDefaultTimeout(8000);
  ctx.setDefaultNavigationTimeout(20000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGEERR ' + String(e).slice(0, 160)));
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 90)}`); });
  page._errs = errors;
  return { b, ctx, page };
}

export async function shot(page, name) {
  const p = path.join(EVID, name.endsWith('.png') ? name : name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// Concise structured snapshot: URL, title, headings, inputs, buttons, links, toasts, errors.
export async function snap(page, { max = 40 } = {}) {
  await page.waitForTimeout(400);
  const data = await page.evaluate((MAX) => {
    const vis = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const txt = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const out = { url: location.href, title: document.title, headings: [], inputs: [], buttons: [], links: [], toasts: [] };
    document.querySelectorAll('h1,h2,h3,[role=heading]').forEach(e => { if (vis(e) && txt(e)) out.headings.push(txt(e)); });
    document.querySelectorAll('input,textarea,select').forEach(e => { if (!vis(e)) return; out.inputs.push(`${e.tagName.toLowerCase()}[type=${e.type || ''}] name=${e.name || e.id || ''} ph="${e.placeholder || ''}" ${e.value ? ('val="' + String(e.value).slice(0, 20) + '"') : ''}`); });
    document.querySelectorAll('button,[role=button],a[role=button],[type=submit]').forEach(e => { if (vis(e) && txt(e)) out.buttons.push(txt(e)); });
    document.querySelectorAll('a[href]').forEach(e => { if (vis(e) && txt(e)) out.links.push(txt(e) + ' -> ' + e.getAttribute('href')); });
    document.querySelectorAll('[role=alert],[class*=toast i],[class*=notification i],[class*=error i],[class*=Toast]').forEach(e => { if (vis(e) && txt(e)) out.toasts.push(txt(e)); });
    const uniq = a => [...new Set(a)];
    out.headings = uniq(out.headings).slice(0, MAX);
    out.buttons = uniq(out.buttons).slice(0, MAX);
    out.links = uniq(out.links).slice(0, MAX);
    out.toasts = uniq(out.toasts).slice(0, 12);
    return out;
  }, max);
  data.errors = [...new Set(page._errs)].slice(-12);
  return data;
}

export function printSnap(s, label = '') {
  const L = [];
  if (label) L.push('### ' + label);
  L.push('URL: ' + s.url);
  if (s.title) L.push('TITLE: ' + s.title);
  if (s.headings?.length) L.push('H: ' + s.headings.join(' | '));
  if (s.inputs?.length) L.push('INPUTS:\n  ' + s.inputs.join('\n  '));
  if (s.buttons?.length) L.push('BTN: ' + s.buttons.join(' | '));
  if (s.links?.length) L.push('LINKS: ' + s.links.slice(0, 30).join(' | '));
  if (s.toasts?.length) L.push('TOAST: ' + s.toasts.join(' || '));
  if (s.errors?.length) L.push('ERRORS:\n  ' + s.errors.join('\n  '));
  console.log(L.join('\n'));
}
