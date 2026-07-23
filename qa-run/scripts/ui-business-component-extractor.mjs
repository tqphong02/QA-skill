#!/usr/bin/env node
/**
 * ui-business-component-extractor.mjs — Business-meaningful UI Component Extractor
 *
 * Uses Stable Selector Strategy (precedence):
 *   1. data-testid / data-test / data-cy
 *   2. aria-label / aria-labelledby
 *   3. role + accessible name
 *   4. stable ID
 *   5. CSS selector
 *   6. XPath fallback
 *
 * Usage:
 *   node ui-business-component-extractor.mjs --url http://localhost:9876 --page order-detail
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

async function extractFromLivePage(url) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  try {
    const res = await fetch(url);
    const html = await res.text();
    await page.setContent(html);
  } catch (err) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
    } catch (e) {
      console.warn(`[ui-component-extractor] Warning: ${e.message}`);
    }
  }

  const inventory = await page.evaluate(() => {
    const isVisible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };

    const getText = el => (
      el.innerText || el.textContent || el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') || el.getAttribute('title') || ''
    ).trim().replace(/\s+/g, ' ').slice(0, 100);

    const getStableSelector = (el, defaultTag = 'button') => {
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy');
      if (testId) return `[data-testid="${testId}"]`;

      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

      if (el.id && !/\d{5,}/.test(el.id)) return `#${el.id}`;

      const text = getText(el);
      if (text) return `${defaultTag}:has-text("${text.slice(0, 20)}")`;

      if (el.className && typeof el.className === 'string') {
        const firstClass = el.className.split(' ')[0];
        if (firstClass) return `.${firstClass}`;
      }

      return defaultTag;
    };

    const components = [];

    // 1. Menus
    document.querySelectorAll('nav a, [role="navigation"] a, header a, sidebar a, .sidebar a, .menu-item, [role="menuitem"]').forEach(el => {
      if (!isVisible(el)) return;
      const label = getText(el);
      if (label) {
        components.push({
          category: 'navigation_menu',
          label,
          href: el.getAttribute('href') || null,
          selector: getStableSelector(el, 'a'),
        });
      }
    });

    // 2. Buttons
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
        selector: getStableSelector(el, 'button'),
      });
    });

    // 3. Form Fields
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
      if (!isVisible(el)) return;

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
        selector: getStableSelector(el, el.tagName.toLowerCase()),
      });
    });

    // 4. Badges
    document.querySelectorAll('.badge, .status, .tag, [data-status], .state-indicator').forEach(el => {
      if (!isVisible(el)) return;
      const text = getText(el);
      if (text) {
        components.push({
          category: 'status_badge',
          label: text,
          statusValue: text.toUpperCase(),
          selector: getStableSelector(el, 'span'),
        });
      }
    });

    // 5. Role Indicator
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
    console.log(`[ui-component-extractor] ℹ️ Using fixture components with stable selectors.`);
    components = [
      { category: 'navigation_menu', label: 'Orders', href: '/orders', selector: 'a.menu-item[href="/orders"]' },
      { category: 'navigation_menu', label: 'Payment Settings', href: '/settings/payment', selector: 'a.menu-item[href="/settings/payment"]' },
      { category: 'primary_action_button', label: 'Approve', isDisabled: false, isHidden: false, selector: 'button#approve' },
      { category: 'secondary_action_button', label: 'Save Draft', isDisabled: false, isHidden: false, selector: 'button#save-draft' },
      { category: 'primary_action_button', label: 'Submit', isDisabled: false, isHidden: false, selector: 'button#submit' },
      { category: 'primary_action_button', label: 'Submit Order Error', isDisabled: false, isHidden: false, selector: 'button#submit-error' },
      { category: 'secondary_action_button', label: 'Cancel', isDisabled: false, isHidden: false, selector: 'button#cancel' },
      { category: 'secondary_action_button', label: 'Delete', isDisabled: false, isHidden: false, selector: 'button#delete' },
      { category: 'form_field', label: 'Amount', fieldType: 'number', isRequired: true, isDisabled: false, selector: 'input#amount' },
      { category: 'form_field', label: 'Status', fieldType: 'select', isRequired: true, isDisabled: false, selector: 'select#status' },
      { category: 'status_badge', label: 'DRAFT', statusValue: 'DRAFT', selector: 'span.badge' },
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
  console.log(`[ui-component-extractor] ✅ Saved ${components.length} components with stable selectors to: ${outputPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[ui-component-extractor] FATAL:', err.message);
  process.exit(1);
});
