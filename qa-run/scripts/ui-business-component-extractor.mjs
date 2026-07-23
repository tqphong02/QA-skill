#!/usr/bin/env node
/**
 * ui-business-component-extractor.mjs — Business-meaningful UI Component Extractor
 *
 * Quét DOM hoặc nhận cấu trúc trang và CHỈ trích xuất các component có ý nghĩa Business:
 *   - Menu & Submenu
 *   - Primary & Secondary Action Buttons
 *   - Form Fields + Required Indicators
 *   - Status & Badges
 *   - Table Actions & Dropdown Options
 *   - Confirm Modals & Alert Messages
 *   - Empty / Loading / Pagination States
 *   - Role / Permission Indicators
 *
 * Bỏ qua: Icon trang trí, avatar tĩnh, decorative spacers, CSS layout containers.
 *
 * Usage:
 *   node ui-business-component-extractor.mjs --url https://app.example.com/orders/123 --page order-detail
 *   node ui-business-component-extractor.mjs --snapshot /path/to/dom.json --output qa-knowledge/ui-business/order-detail/ui-components.json
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const TARGET_URL   = getArg('--url', null);
const PAGE_SLUG    = getArg('--page', 'page-ui');
const SNAPSHOT     = getArg('--snapshot', null);
const OUTPUT_FILE  = getArg('--output', null);
const DATA_DIR     = process.env.QA_DATA_DIR || process.cwd();
const AUTH_FILE    = path.join(DATA_DIR, 'auth.json');

async function extractFromLivePage(url) {
  const browser = await chromium.launch({ headless: true });
  const contextOptions = {};
  if (fs.existsSync(AUTH_FILE)) contextOptions.storageState = AUTH_FILE;

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (err) {
    console.warn(`[ui-component-extractor] Warning during navigation: ${err.message}`);
  }

  const inventory = await page.evaluate(() => {
    const isVisible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };

    const getText = el => (
      el.innerText || el.textContent || el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') || el.getAttribute('title') || ''
    ).trim().replace(/\s+/g, ' ').slice(0, 100);

    const components = [];

    // 1. Menus & Navigation
    document.querySelectorAll('nav a, [role="navigation"] a, header a, sidebar a, .sidebar a, .menu-item, [role="menuitem"]').forEach(el => {
      if (!isVisible(el)) return;
      const label = getText(el);
      if (label) {
        components.push({
          category: 'navigation_menu',
          label,
          href: el.getAttribute('href') || null,
          roleRequired: el.getAttribute('data-role') || null,
          selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : 'nav a',
        });
      }
    });

    // 2. Action Buttons (Primary & Secondary)
    document.querySelectorAll('button, a.btn, a.button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
      if (!isVisible(el)) return;
      const label = getText(el);
      if (!label) return;

      const isPrimary = el.classList.contains('primary') || el.classList.contains('btn-primary') || el.getAttribute('type') === 'submit';
      const isDisabled = el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';

      components.push({
        category: isPrimary ? 'primary_action_button' : 'secondary_action_button',
        label,
        isDisabled,
        isHidden: false,
        selector: el.id ? `#${el.id}` : `button:has-text("${label.slice(0, 20)}")`,
      });
    });

    // 3. Form Fields & Required Indicators
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
      if (!isVisible(el)) return;

      // Find associated label
      let labelText = '';
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) labelText = getText(lbl);
      }
      if (!labelText) {
        const parentLbl = el.closest('label');
        if (parentLbl) labelText = getText(parentLbl);
      }
      if (!labelText) {
        labelText = el.getAttribute('placeholder') || el.getAttribute('name') || el.id || 'field';
      }

      const isRequired = el.required || el.getAttribute('aria-required') === 'true' || !!el.closest('.form-group, label')?.querySelector('.required, .asterisk, [data-required]');
      const fieldType = el.getAttribute('type') || el.tagName.toLowerCase();

      components.push({
        category: 'form_field',
        label: labelText,
        fieldType,
        isRequired,
        defaultValue: el.value || null,
        isDisabled: el.disabled || el.readOnly,
        selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`,
      });
    });

    // 4. Statuses & Badges
    document.querySelectorAll('.badge, .status, .tag, [data-status], .state-indicator').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (text) {
        components.push({
          category: 'status_badge',
          label: text,
          statusValue: text.toUpperCase(),
          selector: el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`,
        });
      }
    });

    // 5. Confirm Modals & Dialogs
    document.querySelectorAll('.modal, .dialog, [role="dialog"], .confirm-box').forEach(el => {
      if (!isVisible(el)) return;
      const title = getText(el.querySelector('.modal-title, h1, h2, h3, header') || el);
      components.push({
        category: 'confirm_modal',
        title,
        actions: Array.from(el.querySelectorAll('button')).map(getText),
      });
    });

    // 6. Error & Alert Messages
    document.querySelectorAll('.alert, .error-message, .invalid-feedback, [role="alert"]').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (text) {
        components.push({
          category: 'alert_message',
          label: text,
          isError: el.classList.contains('error') || el.classList.contains('alert-danger'),
        });
      }
    });

    // 7. Role or User Info Indicators
    document.querySelectorAll('.user-role, .profile-role, [data-user-role]').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (text) {
        components.push({
          category: 'role_indicator',
          label: text,
        });
      }
    });

    return components;
  });

  await browser.close();
  return inventory;
}

async function main() {
  let components = [];

  if (SNAPSHOT && fs.existsSync(SNAPSHOT)) {
    console.log(`[ui-component-extractor] Loading snapshot from: ${SNAPSHOT}`);
    const data = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    components = data.components || data;
  } else if (TARGET_URL) {
    console.log(`[ui-component-extractor] Scraping live page: ${TARGET_URL}`);
    components = await extractFromLivePage(TARGET_URL);
  } else {
    // Demo / Fixture fallback if no URL or snapshot provided
    console.log(`[ui-component-extractor] ℹ️ No --url or --snapshot provided. Generating component inventory from fixture context.`);
    components = [
      { category: 'navigation_menu', label: 'Orders', href: '/orders' },
      { category: 'navigation_menu', label: 'Payment Settings', href: '/settings/payment' },
      { category: 'primary_action_button', label: 'Approve', isDisabled: false, isHidden: false, selector: 'button#approve' },
      { category: 'secondary_action_button', label: 'Save Draft', isDisabled: false, isHidden: false, selector: 'button#save-draft' },
      { category: 'primary_action_button', label: 'Submit', isDisabled: false, isHidden: false, selector: 'button#submit' },
      { category: 'secondary_action_button', label: 'Cancel', isDisabled: false, isHidden: false, selector: 'button#cancel' },
      { category: 'secondary_action_button', label: 'Delete', isDisabled: false, isHidden: false, selector: 'button#delete' },
      { category: 'form_field', label: 'Amount', fieldType: 'number', isRequired: true, isDisabled: false, selector: 'input#amount' },
      { category: 'form_field', label: 'Status', fieldType: 'select', isRequired: true, isDisabled: false, selector: 'select#status' },
      { category: 'status_badge', label: 'DRAFT', statusValue: 'DRAFT' },
      { category: 'role_indicator', label: 'Role: Staff' },
    ];
  }

  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  fs.mkdirSync(outDir, { recursive: true });

  const result = {
    tool: 'ui-business-component-extractor.mjs',
    pageSlug: PAGE_SLUG,
    targetUrl: TARGET_URL || 'snapshot/fixture',
    extractedAt: new Date().toISOString(),
    totalComponents: components.length,
    byCategory: components.reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc; }, {}),
    components,
  };

  const outputPath = OUTPUT_FILE || path.join(outDir, 'ui-components.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-component-extractor] ✅ Saved ${components.length} business components to: ${outputPath}`);
}

main().catch(err => {
  console.error('[ui-component-extractor] FATAL:', err.message);
  process.exit(1);
});
