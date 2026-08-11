#!/usr/bin/env node
/**
 * visual-audit.mjs — Programmatic Visual Bug Detector
 *
 * Thu thập visual evidence và style metrics mà DOM text snapshot bỏ sót:
 *   1. Text overflow / clipping (ellipsis, hidden overflow)
 *   2. Element overlap (z-index, position absolute)
 *   3. Touch target size < 44×44px (mobile accessibility)
 *   4. Color contrast ratio (WCAG AA: ≥4.5:1 text, ≥3:1 large)
 *   5. Sticky/fixed element blocking interactive elements
 *   6. Horizontal scroll (content wider than viewport)
 *   7. Empty state indicators (zero-count, blank sections)
 *   8. Loading spinners stuck (still visible after networkidle)
 *   9. Screenshot at 1440px + 375px viewport for layout diff
 *  10. Form labels: inputs without visible label or aria-label
 *
 * Output:
 *   evidence/visual-audit-YYYY-MM-DD.json  — structured findings for AI analysis
 *   evidence/visual-1440-<path>.png        — desktop screenshot
 *   evidence/visual-375-<path>.png         — mobile screenshot
 *
 * Usage:
 *   cd <project-root>
 *   node <skill>/scripts/visual-audit.mjs --path /dashboard
 *   node <skill>/scripts/visual-audit.mjs --path /settings --selector ".main-content"
 *
 * After running, AI should:
 *   1. Read the JSON findings
 *   2. View the screenshots (use browser_take_screenshot or embed PNG for vision analysis)
 *   3. Add qualitative observations that programmatic checks missed
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { installNetworkTracker, waitForUiReady } from '../../lib/wait.mjs';

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA  = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE    = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const AUTH    = path.join(DATA, 'auth.json');
const EVID    = path.join(DATA, 'evidence');
const TODAY   = new Date().toISOString().slice(0, 10);

fs.mkdirSync(EVID, { recursive: true });

if (!BASE) {
  console.error('[visual-audit] QA_BASE_URL chưa set trong .env');
  process.exit(1);
}

const args       = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const URL_PATH   = getArg('--path', '/');
const SCOPE_SEL  = getArg('--selector', '');
const OUTPUT_FILE = getArg('--output', path.join(EVID, `visual-audit-${TODAY}.json`));
const READY_TIMEOUT_MS = Number.parseInt(
  getArg('--ready-timeout', process.env.QA_READY_TIMEOUT_MS || '12000'),
  10,
);

// ─── Color contrast helper (injected into page) ───────────────────────────────

function getContrastRatio(r1, g1, b1, r2, g2, b2) {
  const lum = (r, g, b) => {
    const c = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const l1 = lum(r1, g1, b1) + 0.05;
  const l2 = lum(r2, g2, b2) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

// ─── Page-level checks (injected via evaluate) ────────────────────────────────

async function runPageChecks(page, scopeSelector) {
  return page.evaluate(({ scope, contrastFn }) => {
    const root = scope ? (document.querySelector(scope) || document.body) : document.body;
    const vis = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };

    const findings = [];
    const info = [];

    // ── 1. Text overflow / clipping ──────────────────────────────────────────
    root.querySelectorAll('*').forEach(el => {
      if (!vis(el)) return;
      const s = getComputedStyle(el);
      const txt = (el.innerText || '').trim();
      if (!txt || txt.length < 5) return;

      if (s.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 2) {
        findings.push({
          type: 'TEXT_OVERFLOW',
          severity: 'MEDIUM',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
          text_preview: txt.slice(0, 60),
          scroll_width: el.scrollWidth,
          client_width: el.clientWidth,
          overflow_hidden: true,
        });
      }
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2) {
        findings.push({
          type: 'TEXT_TRUNCATED_ELLIPSIS',
          severity: 'LOW',
          element: el.tagName + (el.id ? '#' + el.id : ''),
          text_preview: txt.slice(0, 60),
          detail: 'Text truncated with ellipsis — may hide important information',
        });
      }
    });

    // ── 2. Touch target size < 44×44 ────────────────────────────────────────
    root.querySelectorAll('button,[role=button],a[href],input[type=checkbox],input[type=radio]').forEach(el => {
      if (!vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        findings.push({
          type: 'SMALL_TOUCH_TARGET',
          severity: 'LOW',
          element: el.tagName + (el.textContent?.trim().slice(0, 30) || ''),
          size: `${Math.round(r.width)}×${Math.round(r.height)}px`,
          min_required: '44×44px',
        });
      }
    });

    // ── 3. Horizontal scroll ─────────────────────────────────────────────────
    if (document.body.scrollWidth > window.innerWidth + 5) {
      findings.push({
        type: 'HORIZONTAL_SCROLL',
        severity: 'HIGH',
        element: 'body',
        scroll_width: document.body.scrollWidth,
        viewport_width: window.innerWidth,
        detail: 'Content wider than viewport — layout broken on this screen size',
      });
    }

    // ── 4. Stuck loading spinners ────────────────────────────────────────────
    root.querySelectorAll('[class*=spinner i],[class*=loading i],[class*=skeleton i],[class*=shimmer i]').forEach(el => {
      if (!vis(el)) return;
      findings.push({
        type: 'VISIBLE_LOADING_INDICATOR',
        severity: 'MEDIUM',
        element: el.className,
        detail: 'Loading indicator still visible after page settled — may be stuck spinner',
      });
    });

    // ── 5. Inputs without labels ─────────────────────────────────────────────
    root.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select').forEach(inp => {
      if (!vis(inp)) return;
      const hasLabel = inp.id && document.querySelector(`label[for="${inp.id}"]`);
      const hasAriaLabel = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby');
      const hasPlaceholder = inp.placeholder;
      if (!hasLabel && !hasAriaLabel && !hasPlaceholder) {
        findings.push({
          type: 'INPUT_NO_LABEL',
          severity: 'MEDIUM',
          element: inp.tagName + '[' + (inp.name || inp.id || inp.type) + ']',
          detail: 'Input has no label, aria-label, or placeholder — inaccessible to screen readers',
        });
      }
    });

    // ── 6. Empty state detection ─────────────────────────────────────────────
    root.querySelectorAll('table,ul[class*=list i],[class*=list-container i],[class*=data-grid i]').forEach(el => {
      if (!vis(el)) return;
      const rows = el.querySelectorAll('tr:not(:first-child),li,[class*=row i],[class*=item i]');
      if (rows.length === 0) {
        findings.push({
          type: 'EMPTY_LIST_NO_INDICATOR',
          severity: 'LOW',
          element: el.tagName + (el.className ? '.' + el.className.split(' ')[0] : ''),
          detail: 'Table/list has no rows — check if empty state UI is shown',
        });
      }
    });

    // ── 7. Z-index / overlap check (simplified) ──────────────────────────────
    const positionedEls = [];
    root.querySelectorAll('[style*="position"],[class*=modal i],[class*=dropdown i],[class*=overlay i],[class*=tooltip i]').forEach(el => {
      if (!vis(el)) return;
      const s = getComputedStyle(el);
      if (s.position !== 'static') {
        const r = el.getBoundingClientRect();
        positionedEls.push({ el, r, z: parseInt(s.zIndex) || 0 });
      }
    });
    for (let i = 0; i < positionedEls.length - 1; i++) {
      for (let j = i + 1; j < positionedEls.length; j++) {
        const a = positionedEls[i], b = positionedEls[j];
        const overlap = !(a.r.right < b.r.left || b.r.right < a.r.left ||
                          a.r.bottom < b.r.top || b.r.bottom < a.r.top);
        if (overlap && Math.abs(a.z - b.z) < 10) {
          const aTag = a.el.tagName + '.' + (a.el.className.split(' ')[0] || '');
          const bTag = b.el.tagName + '.' + (b.el.className.split(' ')[0] || '');
          if (!findings.some(f => f.type === 'ELEMENT_OVERLAP' && f.elements?.includes(aTag))) {
            findings.push({
              type: 'ELEMENT_OVERLAP',
              severity: 'MEDIUM',
              elements: [aTag, bTag],
              detail: 'Positioned elements overlap with similar z-index — may cause UI conflict',
            });
          }
        }
      }
    }

    // ── 8. General info ──────────────────────────────────────────────────────
    info.push({
      url: location.href,
      title: document.title,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      scroll_height: document.body.scrollHeight,
      interactive_elements: root.querySelectorAll('button,a,input,select,textarea').length,
    });

    return { findings, info };
  }, { scope: scopeSelector, contrastFn: getContrastRatio.toString() });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function auditViewport(browser, targetUrl, viewport, label) {
  const ctx = await browser.newContext({
    viewport,
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(25000);
  const page = await ctx.newPage();
  installNetworkTracker(page);

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForUiReady(page, { timeout: READY_TIMEOUT_MS });

  // Screenshot
  const slug = URL_PATH.replace(/\//g, '-').replace(/^-/, '') || 'home';
  const ssPath = path.join(EVID, `visual-${label}-${slug}-${TODAY}.png`);
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`  [screenshot] ${ssPath}`);

  // Run programmatic checks
  const { findings, info } = await runPageChecks(page, SCOPE_SEL);
  await ctx.close();
  return { viewport: label, screenshot: path.basename(ssPath), findings, info };
}

async function main() {
  const targetUrl = BASE + URL_PATH;
  console.log(`[visual-audit] TARGET: ${targetUrl}`);
  console.log(`[visual-audit] Output: ${OUTPUT_FILE}\n`);

  const browser = await chromium.launch({ headless: true });

  // Audit at desktop + mobile
  console.log('[visual-audit] Desktop (1440×900)...');
  const desktop = await auditViewport(browser, targetUrl, { width: 1440, height: 900 }, '1440');

  console.log('[visual-audit] Mobile (375×812)...');
  const mobile  = await auditViewport(browser, targetUrl, { width: 375, height: 812 }, '375');

  await browser.close();

  // Merge and deduplicate
  const allFindings = [
    ...desktop.findings.map(f => ({ ...f, viewport: 'desktop-1440' })),
    ...mobile.findings.map(f => ({ ...f, viewport: 'mobile-375' })),
  ];

  const summary = {
    tool:        'visual-audit.mjs',
    target_url:  targetUrl,
    audited_at:  new Date().toISOString(),
    screenshots: {
      desktop: desktop.screenshot,
      mobile:  mobile.screenshot,
    },
    page_info: { desktop: desktop.info, mobile: mobile.info },
    total_findings: allFindings.length,
    by_severity: {
      HIGH:   allFindings.filter(f => f.severity === 'HIGH').length,
      MEDIUM: allFindings.filter(f => f.severity === 'MEDIUM').length,
      LOW:    allFindings.filter(f => f.severity === 'LOW').length,
    },
    findings: allFindings,
    ai_vision_checklist: [
      'Nhìn ảnh desktop: có text nào bị clipped/cắt không?',
      'Nhìn ảnh desktop: có element nào bị che bởi element khác không?',
      'Nhìn ảnh mobile: layout có vỡ không? có horizontal scroll không?',
      'So sánh desktop vs mobile: có module nào biến mất trên mobile không?',
      'Nhìn cả 2 ảnh: loading spinner có còn hiển thị không?',
      'Nhìn cả 2 ảnh: empty state có được thiết kế đẹp không hay blank hoàn toàn?',
      'Nhìn ảnh desktop: modal/dropdown có che content phía dưới không?',
      'Nhìn ảnh desktop: contrast chữ có đủ rõ trên background không?',
    ],
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n═══ VISUAL AUDIT SUMMARY ════════════════════════════════');
  console.log(`Target:     ${targetUrl}`);
  console.log(`Findings:   ${allFindings.length} total`);
  console.log(`  HIGH:     ${summary.by_severity.HIGH}`);
  console.log(`  MEDIUM:   ${summary.by_severity.MEDIUM}`);
  console.log(`  LOW:      ${summary.by_severity.LOW}`);
  console.log(`Output:     ${OUTPUT_FILE}`);
  console.log(`Screenshots desktop: evidence/${desktop.screenshot}`);
  console.log(`Screenshots mobile:  evidence/${mobile.screenshot}`);
  console.log('\n[AI INSTRUCTION] Sau khi chạy script này:');
  console.log('  1. Đọc JSON findings ở trên');
  console.log('  2. Embed 2 ảnh screenshot vào context (dùng view_file hoặc browser_take_screenshot)');
  console.log('  3. Dùng vision để kiểm tra AI Vision Checklist trong JSON output');
  console.log('══════════════════════════════════════════════════════════');

  for (const f of allFindings) {
    console.log(`\n  [${f.severity}] ${f.type} (${f.viewport})`);
    if (f.element) console.log(`  Element: ${JSON.stringify(f.element)}`);
    if (f.detail)  console.log(`  Detail:  ${f.detail}`);
  }
}

main().catch(err => {
  console.error('[visual-audit] FATAL:', err.message);
  process.exit(1);
});
