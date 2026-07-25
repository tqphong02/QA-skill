#!/usr/bin/env node
/**
 * generate-checklist.mjs — Auto Element Inventory & Exploratory Checklist Generator
 *
 * Quét toàn bộ DOM và UI elements của một trang/feature, tự động tạo ra một file Markdown Checklist
 * (`qa-knowledge/checklists/<feature>-checklist.md`) bao phủ 100% item, button, form field, table, UI/UX
 * để phục vụ giai đoạn Exploratory & Ad-hoc Testing không bỏ sót bất kỳ case nào.
 *
 * Usage:
 *   cd <project-root>
 *   QA_RUN_SKILL_DIR=/path/to/qa-run node <skill>/scripts/generate-checklist.mjs --path /dashboard
 *   QA_RUN_SKILL_DIR=/path/to/qa-run node <skill>/scripts/generate-checklist.mjs --path /login --feature "login-page"
 *
 * Output:
 *   qa-knowledge/checklists/<feature-slug>-checklist.md
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QA_DATA_DIR || process.cwd();
try { process.loadEnvFile(path.join(DATA, '.env')); } catch { /* optional */ }

const BASE     = (process.env.QA_BASE_URL || '').replace(/\/$/, '');
const AUTH     = path.join(DATA, 'auth.json');
const OUT_DIR  = path.join(DATA, 'qa-knowledge', 'checklists');
const TODAY    = new Date().toISOString().slice(0, 10);

fs.mkdirSync(OUT_DIR, { recursive: true });

if (!BASE) {
  console.error('[generate-checklist] ❌ QA_BASE_URL chưa set trong .env của project');
  process.exit(1);
}

const args      = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const URL_PATH  = getArg('--path', '/');
const FEATURE_NAME = getArg('--feature', '');
const SCOPE_SEL = getArg('--selector', '');

function slugify(text) {
  return String(text || 'feature')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
}

// ─── Extract Page Element Inventory ──────────────────────────────────────────

async function extractElementInventory(page, scopeSelector) {
  return page.evaluate((scope) => {
    const root = scope ? (document.querySelector(scope) || document.body) : document.body;
    const vis = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const txt = el => (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80);

    const inventory = {
      title: document.title,
      url: location.href,
      headings: [],
      inputs: [],
      buttons: [],
      links: [],
      tables: [],
      modals: [],
      toasts: [],
      badges: [],
      tabs: [],
    };

    // Headings
    root.querySelectorAll('h1,h2,h3,h4,[role=heading]').forEach(h => {
      if (vis(h) && txt(h)) inventory.headings.push({ level: h.tagName.toLowerCase(), text: txt(h) });
    });

    // Inputs & Forms
    root.querySelectorAll('input:not([type=hidden]),textarea,select').forEach(inp => {
      if (!vis(inp)) return;
      const label = (document.querySelector(`label[for="${inp.id}"]`) || {}).innerText?.trim()
        || inp.getAttribute('aria-label') || inp.placeholder || inp.name || inp.id || 'Field';
      inventory.inputs.push({
        type: inp.type || inp.tagName.toLowerCase(),
        name: inp.name || inp.id || '',
        label,
        required: inp.required,
        placeholder: inp.placeholder || '',
      });
    });

    // Buttons
    root.querySelectorAll('button,[role=button],input[type=submit],input[type=button]').forEach(btn => {
      if (!vis(btn) || !txt(btn)) return;
      inventory.buttons.push({
        text: txt(btn),
        type: btn.type || 'button',
        id: btn.id || btn.name || '',
      });
    });

    // Navigation Links
    root.querySelectorAll('a[href]').forEach(a => {
      if (!vis(a) || !txt(a)) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('javascript') && href !== '#') {
        inventory.links.push({ text: txt(a), href });
      }
    });

    // Tables
    root.querySelectorAll('table,[role=grid]').forEach(tbl => {
      if (!vis(tbl)) return;
      const headers = [];
      tbl.querySelectorAll('th,[role=columnheader]').forEach(th => { if (txt(th)) headers.push(txt(th)); });
      const rowsCount = tbl.querySelectorAll('tr:not(:first-child),[role=row]').length;
      inventory.tables.push({ headers, rowsCount });
    });

    // Modals / Drawers
    root.querySelectorAll('[role=dialog],[class*=modal i],[class*=drawer i],[class*=popup i]').forEach(m => {
      if (vis(m)) inventory.modals.push({ title: txt(m.querySelector('h1,h2,h3,[class*=title i]') || m).slice(0, 50) });
    });

    // Badges / Status Chips
    root.querySelectorAll('[class*=badge i],[class*=chip i],[class*=status i],[class*=tag i]').forEach(b => {
      if (vis(b) && txt(b)) inventory.badges.push(txt(b));
    });

    // Tabs
    root.querySelectorAll('[role=tab],[class*=tab-item i],[class*=nav-tab i]').forEach(t => {
      if (vis(t) && txt(t)) inventory.tabs.push(txt(t));
    });

    return inventory;
  }, scopeSelector);
}

// ─── Generate Markdown Checklist ──────────────────────────────────────────────

function renderChecklistMarkdown(inv, featureSlug) {
  const lines = [
    `# Exploratory & Ad-hoc Checklist — ${inv.title || featureSlug}`,
    '',
    '## Metadata',
    '',
    `- **URL:** ${inv.url}`,
    `- **Generated at:** ${TODAY}`,
    `- **Feature slug:** ${featureSlug}`,
    `- **Total elements scanned:** ${inv.inputs.length} inputs, ${inv.buttons.length} buttons, ${inv.links.length} links, ${inv.tables.length} tables`,
    '',
    '---',
    '',
    '## 1. Màn hình & Bố cục chung (Layout & Visual)',
    '',
    `- [ ] **L-01 Layout responsive:** Kiểm tra hiển thị trên màn hình Desktop (1440px) và Mobile (375px) không bị vỡ`,
    `- [ ] **L-02 Horizontal scroll:** Không xuất hiện thanh cuộn ngang ngoài ý muốn trên toàn màn hình`,
    `- [ ] **L-03 Text overflow & clipping:** Không có chữ/số tiền/tên bị cắt xén ('...') làm mất thông tin quan trọng`,
    `- [ ] **L-04 Component overlap:** Nút bấm, modal, toast không bị che bởi sticky header hoặc element khác`,
    `- [ ] **L-05 Touch target size:** Tất cả các button/link có kích thước tối thiểu 44×44px trên mobile`,
    '',
  ];

  // Headings
  if (inv.headings.length) {
    lines.push('## 2. Danh sách tiêu đề & Khối thông tin (Headings)');
    lines.push('');
    inv.headings.forEach((h, idx) => {
      lines.push(`- [ ] **H-${String(idx + 1).padStart(2, '0')} [${h.level.toUpperCase()}] "${h.text}":** Kiểm tra hiển thị đúng tiêu đề, font chữ, không bị đè chữ`);
    });
    lines.push('');
  }

  // Form Inputs
  lines.push('## 3. Danh sách trường nhập liệu (Input Fields & Validation)');
  lines.push('');
  if (inv.inputs.length) {
    inv.inputs.forEach((inp, idx) => {
      const code = `INP-${String(idx + 1).padStart(2, '0')}`;
      const reqStr = inp.required ? ' (Bắt buộc)' : ' (Tùy chọn)';
      lines.push(`### ${code} — ${inp.label}${reqStr}`);
      lines.push(`- [ ] **${code}.1 Happy path:** Nhập dữ liệu hợp lệ → trường nhận dữ liệu và không báo lỗi`);
      if (inp.required) {
        lines.push(`- [ ] **${code}.2 Empty validation:** Bỏ trống trường bắt buộc → hiển thị thông báo lỗi rõ ràng`);
      }
      lines.push(`- [ ] **${code}.3 Special characters & XSS:** Nhập ký tự đặc biệt (\`<script>\`, \`'OR 1=1\`, emoji) → không vỡ trang hay đè lỗi technical`);
      lines.push(`- [ ] **${code}.4 Boundary / Length:** Nhập chuỗi cực dài (255+ ký tự) → có giới hạn hoặc thông báo lỗi phù hợp`);
      lines.push('');
    });
  } else {
    lines.push('- Không phát hiện trường nhập liệu nào trên trang này');
    lines.push('');
  }

  // Buttons & Actions
  lines.push('## 4. Danh sách nút bấm & Thao tác (Buttons & Action Safety)');
  lines.push('');
  if (inv.buttons.length) {
    inv.buttons.forEach((btn, idx) => {
      const code = `BTN-${String(idx + 1).padStart(2, '0')}`;
      lines.push(`### ${code} — Nút "${btn.text}"`);
      lines.push(`- [ ] **${code}.1 Click responsiveness:** Bấm nút → hệ thống phản hồi ngay (hiển thị loading state hoặc đổi trang)`);
      lines.push(`- [ ] **${code}.2 Double-click / Spam:** Bấm 2-3 lần nhanh → chỉ gửi 1 request duy nhất (có guard debounce / disable)`);
      lines.push(`- [ ] **${code}.3 Hover & Active state:** Di chuột vào có hiệu ứng hover rõ ràng, không bị trơ`);
      lines.push('');
    });
  } else {
    lines.push('- Không phát hiện nút bấm nào trên trang này');
    lines.push('');
  }

  // Navigation Links
  if (inv.links.length) {
    lines.push('## 5. Danh sách liên kết điều hướng (Links)');
    lines.push('');
    inv.links.slice(0, 15).forEach((link, idx) => {
      lines.push(`- [ ] **LNK-${String(idx + 1).padStart(2, '0')} "${link.text}":** Click chuyển hướng đến \`${link.href}\` không bị lỗi 404`);
    });
    lines.push('');
  }

  // Tables
  if (inv.tables.length) {
    lines.push('## 6. Danh sách bảng dữ liệu (Tables & Data Grids)');
    lines.push('');
    inv.tables.forEach((tbl, idx) => {
      const code = `TBL-${String(idx + 1).padStart(2, '0')}`;
      lines.push(`### ${code} — Bảng dữ liệu (${tbl.headers.join(', ') || 'Danh sách'})`);
      lines.push(`- [ ] **${code}.1 Render rows:** Bảng hiển thị đúng ${tbl.rowsCount} bản ghi, không bị méo cột`);
      lines.push(`- [ ] **${code}.2 Empty state:** Khi không có dữ liệu → hiển thị thông báo "Không có dữ liệu" thân thiện`);
      lines.push(`- [ ] **${code}.3 Column overflow:** Text dài trong cột không làm vỡ các cột lân cận`);
      lines.push('');
    });
  }

  // Modals & Drawers
  if (inv.modals.length) {
    lines.push('## 7. Modal & Popup');
    lines.push('');
    inv.modals.forEach((m, idx) => {
      lines.push(`- [ ] **MDL-${String(idx + 1).padStart(2, '0')} Modal "${m.title}":** Mở/đóng bằng phím Esc hoặc click overlay, focus không bị thoát ra ngoài`);
    });
    lines.push('');
  }

  // Non-technical & UX Polish Check
  lines.push('## 8. Kiểm tra trải nghiệm & Thông báo lỗi (Human UX & Technical Polish)');
  lines.push('');
  lines.push('- [ ] **UX-01 Silent Success Check:** Mọi thao tác thành công (Lưu, Sửa, Xóa) đều có Toast/Banner thông báo rõ ràng');
  lines.push('- [ ] **UX-02 Non-technical Error Check:** Khi xảy ra lỗi, thông báo hiển thị bằng tiếng Việt dễ hiểu (KHÔNG lộ `HTTP 500`, `NullPointerException` hay JSON thô)');
  lines.push('- [ ] **UX-03 No Dead End:** Mọi trang kết quả hoặc thông báo đều có nút quay về hoặc nút tiếp tục');
  lines.push('- [ ] **UX-04 Clear Labels:** Không dùng tên biến dev (`is_active_flag`, `created_at`) làm nhãn giao diện');
  lines.push('');

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const targetUrl = BASE + URL_PATH;
  const slug = FEATURE_NAME ? slugify(FEATURE_NAME) : slugify(URL_PATH);
  const outFile = path.join(OUT_DIR, `${slug}-checklist.md`);

  console.log(`[generate-checklist] TARGET: ${targetUrl}`);
  console.log(`[generate-checklist] Output: ${outFile}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(25000);
  const page = await ctx.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
  } catch (err) {
    console.error(`[generate-checklist] ❌ Không thể mở ${targetUrl}: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  console.log('[generate-checklist] Quét DOM và lập danh mục elements...');
  const inv = await extractElementInventory(page, SCOPE_SEL);

  await ctx.close();
  await browser.close();

  const markdown = renderChecklistMarkdown(inv, slug);
  fs.writeFileSync(outFile, markdown, 'utf8');

  console.log('═══ CHECKLIST GENERATED SUCCESSFULLY ═════════════════════');
  console.log(`Feature: ${slug}`);
  console.log(`File:    ${outFile}`);
  console.log(`Scanned: ${inv.inputs.length} inputs | ${inv.buttons.length} buttons | ${inv.links.length} links | ${inv.tables.length} tables`);
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('AI dùng file checklist này trong giai đoạn Exploratory & Ad-hoc để tick từng mục [x] PASS / [ ] FAIL.');
}

main().catch(err => {
  console.error('[generate-checklist] FATAL:', err.message);
  process.exit(1);
});
