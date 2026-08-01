#!/usr/bin/env node
/** Extract business-relevant UI items from an explicit live page or snapshot. */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromiumLaunchOptions } from '../helpers/browser-launch.mjs';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };

const TARGET_URL = getArg('--url');
const SNAPSHOT = getArg('--snapshot') || getArg('--fixture');
const STORAGE_STATE = getArg('--storage-state');
const PAGE_SLUG = getArg('--page', 'page-ui');
const ROLE = getArg('--role');
const OUTPUT_FILE = getArg('--output');
const DATA_DIR = process.env.QA_DATA_DIR || process.cwd();

function stableUiItemId(component) {
  const identity = [PAGE_SLUG, component.category, component.label, component.selector, component.href]
    .map(value => String(value || '').trim().toLowerCase()).join('|');
  return `UI-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 12).toUpperCase()}`;
}

function normalizeComponents(components) {
  return components.map(component => ({ ...component, uiItemId: component.uiItemId || stableUiItemId(component) }));
}

async function extractFromLivePage(url) {
  const browser = await chromium.launch(chromiumLaunchOptions());
  const context = await browser.newContext(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    return await page.evaluate(() => {
      const visible = el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const text = el => (el.innerText || el.textContent || el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 140);
      const cssEscape = value => globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
      const selector = (el, defaultTag = el.tagName.toLowerCase()) => {
        for (const attr of ['data-testid', 'data-test', 'data-cy']) {
          const value = el.getAttribute(attr);
          if (value) return `[${attr}="${cssEscape(value)}"]`;
        }
        const aria = el.getAttribute('aria-label');
        if (aria) return `[aria-label="${cssEscape(aria)}"]`;
        if (el.id && !/\d{5,}/.test(el.id)) return `#${cssEscape(el.id)}`;
        const role = el.getAttribute('role');
        const label = text(el);
        if (role && label) return `[role="${role}"]:has-text("${cssEscape(label.slice(0, 40))}")`;
        if (label) return `${defaultTag}:has-text("${cssEscape(label.slice(0, 40))}")`;
        return defaultTag;
      };
      const components = [];
      const add = item => components.push(item);

      document.querySelectorAll('nav a, [role="navigation"] a, header a, .sidebar a, .menu-item, [role="menuitem"]').forEach(el => {
        if (visible(el) && text(el)) add({ category: 'navigation_menu', label: text(el), href: el.getAttribute('href') || null, selector: selector(el, 'a') });
      });
      document.querySelectorAll('button, a.btn, a.button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
        if (!visible(el) || !text(el)) return;
        const primary = el.classList.contains('primary') || el.classList.contains('btn-primary') || el.getAttribute('type') === 'submit';
        add({
          category: primary ? 'primary_action_button' : 'secondary_action_button',
          label: text(el),
          isDisabled: Boolean(el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'),
          isHidden: false,
          selector: selector(el, 'button'),
        });
      });
      document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
        if (!visible(el)) return;
        let label = el.id ? text(document.querySelector(`label[for="${cssEscape(el.id)}"]`) || el) : '';
        if (!label) label = text(el.closest('label') || el) || el.getAttribute('name') || 'field';
        add({
          category: 'form_field', label,
          fieldType: el.getAttribute('type') || el.tagName.toLowerCase(),
          isRequired: Boolean(el.required || el.getAttribute('aria-required') === 'true' || el.closest('.form-group, label')?.querySelector('.required, .asterisk, [data-required]')),
          defaultValue: el.value || null,
          allowedValues: el.tagName === 'SELECT' ? [...el.options].map(option => option.value || option.textContent.trim()) : undefined,
          isDisabled: Boolean(el.disabled || el.readOnly),
          selector: selector(el),
        });
      });
      document.querySelectorAll('.badge, .status, .tag, [data-status], .state-indicator').forEach(el => {
        if (visible(el) && text(el)) add({ category: 'status_badge', label: text(el), statusValue: text(el).toUpperCase(), selector: selector(el, 'span') });
      });
      document.querySelectorAll('.user-role, .profile-role, [data-user-role]').forEach(el => {
        if (visible(el) && text(el)) add({ category: 'role_indicator', label: text(el), selector: selector(el) });
      });
      document.querySelectorAll('[role="dialog"], dialog, .modal').forEach(el => {
        if (visible(el)) add({ category: 'dialog', label: text(el) || 'Dialog', selector: selector(el) });
      });
      document.querySelectorAll('[role="tab"], th, [role="columnheader"], [role="alert"], .alert, .toast').forEach(el => {
        if (!visible(el) || !text(el)) return;
        const role = el.getAttribute('role');
        const category = role === 'tab' ? 'tab' : (role === 'alert' || el.matches('.alert, .toast') ? 'message' : 'table_column');
        add({ category, label: text(el), selector: selector(el) });
      });
      return components;
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!TARGET_URL && !SNAPSHOT) {
    throw new Error('Missing explicit input: provide --url or --snapshot/--fixture');
  }

  let components;
  let inputType;
  if (SNAPSHOT) {
    if (!fs.existsSync(SNAPSHOT)) throw new Error(`Snapshot not found: ${SNAPSHOT}`);
    const data = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    components = data.components || data;
    if (!Array.isArray(components)) throw new Error('Snapshot must be an array or contain components[]');
    inputType = 'snapshot';
  } else {
    components = await extractFromLivePage(TARGET_URL);
    inputType = 'live_browser';
  }
  components = normalizeComponents(components);

  const outDir = path.join(DATA_DIR, 'qa-knowledge', 'ui-business', PAGE_SLUG);
  fs.mkdirSync(outDir, { recursive: true });
  const result = {
    tool: 'ui-business-component-extractor.mjs', pageSlug: PAGE_SLUG,
    target: TARGET_URL || SNAPSHOT, inputType, role: ROLE,
    extractedAt: new Date().toISOString(), totalComponents: components.length,
    byCategory: components.reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc; }, {}),
    components,
  };
  const outputPath = OUTPUT_FILE || path.join(outDir, 'ui-components.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[ui-component-extractor] Saved ${components.length} components to: ${outputPath}`);
}

main().catch(err => { console.error('[ui-component-extractor] FATAL:', err.message); process.exit(1); });
