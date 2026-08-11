/**
 * Native browser runtime for dynamic-web-exploratory exploratory/ad-hoc execution.
 *
 * This module deliberately uses only the Playwright dependency that already
 * ships with dynamic-web-exploratory. It is not Browser Use and it does not import, spawn or
 * require Browser Use. The design borrows the useful general ideas of a
 * persistent browser session, compact interactive references and bounded
 * recovery while keeping the QA-run oracle, safety and evidence contracts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { chromiumLaunchOptions } from '../scripts/helpers/browser-launch.mjs';
import { evaluateActionSafety } from '../scripts/analysis/attack-surface.mjs';
import { createRuntimeObserver } from '../scripts/helpers/runtime-observer.mjs';
import { waitForUiReady } from './wait.mjs';

export const MAX_NATIVE_WORKERS = 4;
export const MAX_RECOVERY_ATTEMPTS = 2;
export const MAX_ACTIONS_PER_AGENT_STEP = 5;
export const NATIVE_OBSERVATION_PROFILES = Object.freeze({
  compact: Object.freeze({
    maxItems: 32,
    maxContentItems: 16,
    maxChars: 2200,
    maxLinks: 16,
    maxTables: 2,
    maxRowsPerTable: 10,
    maxColumns: 12,
    maxAxNodes: 20,
    includeLocatorCandidates: false,
  }),
  standard: Object.freeze({
    maxItems: 80,
    maxContentItems: 50,
    maxChars: 8000,
    maxLinks: 50,
    maxTables: 6,
    maxRowsPerTable: 40,
    maxColumns: 24,
    maxAxNodes: 80,
    includeLocatorCandidates: true,
  }),
  full: Object.freeze({
    maxItems: 200,
    maxContentItems: 120,
    maxChars: 16000,
    maxLinks: 120,
    maxTables: 10,
    maxRowsPerTable: 100,
    maxColumns: 32,
    maxAxNodes: 120,
    includeLocatorCandidates: true,
  }),
});
export const LOCATOR_PRIORITY = Object.freeze([
  'DATA_TEST_ID',
  'ID',
  'STABLE_CSS',
  'AX_SEMANTIC',
  'ROLE_LABEL_TEXT',
  'DOM_JS',
  'XPATH',
]);

const ACTION_TYPES = new Set([
  'navigate',
  'click',
  'fill',
  'type',
  'press',
  'check',
  'uncheck',
  'select',
  'scroll',
  'back',
  'reload',
  'wait',
  'screenshot',
  'extract',
  'switch_page',
  'download',
  'upload',
]);

const READ_ONLY_BATCH_ACTION_TYPES = new Set([
  'navigate',
  'back',
  'reload',
  'wait',
  'scroll',
  'screenshot',
  'extract',
  'switch_page',
]);

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'summary',
  '[role]',
  '[contenteditable="true"]',
].join(',');

const SENSITIVE_SCREENSHOT_SELECTOR = [
  'input[type="password"]',
  '[data-sensitive="true"]',
  '[aria-label*="password" i]',
  '[autocomplete*="cc-" i]',
].join(',');

function nowIso() {
  return new Date().toISOString();
}

function text(value, max = 500) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/([?&][^=\s]+)=([^&#\s]+)/g, '$1=<redacted>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeJson(value, max = 2000) {
  try {
    return text(JSON.stringify(value), max);
  } catch {
    return '';
  }
}

function positiveInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function resolveNativeObservationProfile(detail = 'compact', overrides = {}) {
  const name = String(detail || 'compact').trim().toLowerCase();
  const base = NATIVE_OBSERVATION_PROFILES[name] || NATIVE_OBSERVATION_PROFILES.compact;
  return {
    name: NATIVE_OBSERVATION_PROFILES[name] ? name : 'compact',
    maxItems: positiveInt(overrides.maxItems, base.maxItems, { min: 1, max: 200 }),
    maxContentItems: positiveInt(overrides.maxContentItems, base.maxContentItems, { min: 1, max: 200 }),
    maxChars: positiveInt(overrides.maxChars, base.maxChars, { min: 200, max: 30000 }),
    maxLinks: positiveInt(overrides.maxLinks, base.maxLinks, { min: 1, max: 200 }),
    maxTables: positiveInt(overrides.maxTables, base.maxTables, { min: 1, max: 20 }),
    maxRowsPerTable: positiveInt(overrides.maxRowsPerTable, base.maxRowsPerTable, { min: 1, max: 200 }),
    maxColumns: positiveInt(overrides.maxColumns, base.maxColumns, { min: 1, max: 50 }),
    maxAxNodes: positiveInt(overrides.maxAxNodes, base.maxAxNodes, { min: 1, max: 200 }),
    includeLocatorCandidates: overrides.includeLocatorCandidates ?? base.includeLocatorCandidates,
  };
}

function slug(value, fallback = 'run') {
  const result = String(value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return result || fallback;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

export function normalizeNativeBrowserLaunchError(error) {
  const details = [
    error?.message,
    ...(Array.isArray(error?.log) ? error.log : []),
  ].filter(Boolean).join(' ');
  const permissionDenied = /bootstrap_check_in|MachPortRendezvous|permission denied|\bEPERM\b/i.test(details);
  const failure = new Error(permissionDenied
    ? 'native browser launch was denied by the host sandbox; use an approved browser runtime or a loaded browser MCP and do not retry this launch in a loop'
    : `native browser launch failed: ${text(error?.message || 'unknown browser error', 500)}`);
  failure.code = permissionDenied
    ? 'BROWSER_RUNTIME_PERMISSION_DENIED'
    : 'BROWSER_RUNTIME_LAUNCH_FAILED';
  failure.retryable = false;
  failure.cause = error;
  return failure;
}

function escapeAttribute(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeStrategy(value) {
  const strategy = String(value ?? '').trim().toUpperCase().replace(/[- ]/g, '_');
  if (strategy === 'TESTID' || strategy === 'DATA_TESTID') return 'DATA_TEST_ID';
  if (strategy === 'CSS' || strategy === 'STABLECSS') return 'STABLE_CSS';
  if (strategy === 'AX' || strategy === 'AX_ROLE' || strategy === 'ROLE') return 'AX_SEMANTIC';
  if (strategy === 'LABEL' || strategy === 'TEXT' || strategy === 'ROLE_LABEL') return 'ROLE_LABEL_TEXT';
  return strategy;
}

function locatorPriority(strategy) {
  const index = LOCATOR_PRIORITY.indexOf(normalizeStrategy(strategy));
  return index === -1 ? LOCATOR_PRIORITY.length : index;
}

function unique(list) {
  const seen = new Set();
  return list.filter(item => {
    const key = safeJson(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const strategy = normalizeStrategy(candidate.strategy);
  if (!strategy || !LOCATOR_PRIORITY.includes(strategy)) return null;
  const value = text(candidate.value ?? candidate.selector ?? candidate.name, 400);
  if (!value) return null;
  return {
    strategy,
    value,
    selector: text(candidate.selector, 400) || null,
    role: text(candidate.role, 100) || null,
    name: text(candidate.name, 300) || null,
    reason: text(candidate.reason, 300) || null,
  };
}

export function sortLocatorCandidates(candidates = []) {
  return unique(candidates.map(normalizeCandidate).filter(Boolean))
    .sort((a, b) => locatorPriority(a.strategy) - locatorPriority(b.strategy));
}

export function validatePoolConfig({ workers = 1, cdpUrl = '', profileDir = '' } = {}) {
  const count = Number.parseInt(String(workers ?? ''), 10);
  if (count < 1 || count > MAX_NATIVE_WORKERS) {
    const error = new Error(`native browser workers must be between 1 and ${MAX_NATIVE_WORKERS}`);
    error.code = 'INVALID_NATIVE_WORKER_COUNT';
    throw error;
  }
  if (count > 1 && (cdpUrl || profileDir)) {
    const error = new Error(
      'parallel native workers require isolated storageState sessions; QA_CDP_URL and QA_BROWSER_PROFILE_DIR cannot be shared',
    );
    error.code = 'SHARED_BROWSER_STATE_UNSAFE';
    throw error;
  }
  return { workers: count, isolated: count > 1 };
}

export function validateReadOnlyActionBatch(actions, { maxActions = MAX_ACTIONS_PER_AGENT_STEP } = {}) {
  if (!Array.isArray(actions) || !actions.length) {
    const error = new Error('read-only action batch requires a non-empty actions array');
    error.code = 'INVALID_ACTION_BATCH';
    throw error;
  }
  const limit = positiveInt(maxActions, MAX_ACTIONS_PER_AGENT_STEP, { min: 1, max: MAX_ACTIONS_PER_AGENT_STEP });
  if (actions.length > limit) {
    const error = new Error(`read-only action batch supports at most ${limit} actions`);
    error.code = 'ACTION_BATCH_LIMIT';
    throw error;
  }
  return actions.map((action, index) => {
    if (!action || typeof action !== 'object') {
      const error = new Error(`action batch item ${index + 1} must be an object`);
      error.code = 'INVALID_ACTION_BATCH';
      throw error;
    }
    const type = String(action.type || action.action_type || '').trim().toLowerCase();
    if (!READ_ONLY_BATCH_ACTION_TYPES.has(type)) {
      const error = new Error(`action batch item ${index + 1} is not read-only: ${type || 'missing'}`);
      error.code = 'ACTION_BATCH_WRITE_BLOCKED';
      throw error;
    }
    return { ...action, type };
  });
}

export function computeNativeStateDelta(before = {}, after = {}, runtime = {}) {
  const beforeHeadings = new Set((before.headings || []).map(value => text(value, 300)));
  const beforeAlerts = new Set((before.alerts || []).map(value => text(value, 300)));
  const newHeadings = (after.headings || []).map(value => text(value, 300)).filter(value => value && !beforeHeadings.has(value));
  const newAlerts = (after.alerts || []).map(value => text(value, 300)).filter(value => value && !beforeAlerts.has(value));
  const urlChanged = Boolean(before.url && after.url && before.url !== after.url);
  const titleChanged = Boolean(before.title !== undefined && after.title !== undefined && before.title !== after.title);
  const contentChanged = Boolean(
    before.content_fingerprint
    && after.content_fingerprint
    && before.content_fingerprint !== after.content_fingerprint,
  );
  const controlCountChanged = Number(before.interactive_count || 0) !== Number(after.interactive_count || 0);
  const failureCount = Array.isArray(runtime.failures) ? runtime.failures.length : 0;
  const rawScore = (urlChanged ? 0.35 : 0)
    + (titleChanged ? 0.1 : 0)
    + (newHeadings.length ? 0.2 : 0)
    + (contentChanged ? 0.2 : 0)
    + (controlCountChanged ? 0.15 : 0)
    - (failureCount ? 0.25 : 0);
  const progressScore = Math.max(0, Math.min(1, Number(rawScore.toFixed(2))));
  return {
    url_changed: urlChanged,
    title_changed: titleChanged,
    content_changed: contentChanged,
    control_count_changed: controlCountChanged,
    new_headings: newHeadings.slice(0, 12),
    new_alerts: newAlerts.slice(0, 12),
    runtime_failure_count: failureCount,
    progress_score: progressScore,
    progress_classification: progressScore >= 0.5 ? 'STRONG_PROGRESS'
      : progressScore > 0 ? 'PROGRESS'
        : failureCount ? 'CONTRADICTED' : 'NO_PROGRESS',
  };
}

export function validateNativeBrowserOptions(options = {}) {
  const runId = slug(options.runId || options.sessionId, 'native-run');
  const workerId = positiveInt(options.workerId, 1, { min: 1, max: MAX_NATIVE_WORKERS });
  const dataDir = path.resolve(options.dataDir || process.env.QA_DATA_DIR || process.cwd());
  const cdpUrl = text(options.cdpUrl || process.env.QA_CDP_URL, 500);
  const profileDir = text(options.profileDir || process.env.QA_BROWSER_PROFILE_DIR, 1000);
  const allowedOrigins = [...new Set((Array.isArray(options.allowedOrigins)
    ? options.allowedOrigins
    : String(options.allowedOrigins || process.env.QA_BROWSER_ALLOWED_ORIGINS || '').split(','))
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .map(value => {
      try { return new URL(value.includes('://') ? value : `https://${value}`).origin; } catch { return ''; }
    })
    .filter(Boolean))];
  if (cdpUrl && profileDir) {
    const error = new Error('QA_CDP_URL and QA_BROWSER_PROFILE_DIR are mutually exclusive');
    error.code = 'AUTH_MODE_CONFLICT';
    throw error;
  }
  return {
    ...options,
    runId,
    workerId,
    dataDir,
    cdpUrl: cdpUrl || '',
    profileDir: profileDir ? path.resolve(profileDir) : '',
    headless: options.headless !== false,
    viewport: options.viewport || { width: 1440, height: 900 },
    maxRecoveries: positiveInt(options.maxRecoveries, MAX_RECOVERY_ATTEMPTS, { min: 0, max: MAX_RECOVERY_ATTEMPTS }),
    actionTimeout: positiveInt(options.actionTimeout, 8000, { min: 250, max: 60000 }),
    navigationTimeout: positiveInt(options.navigationTimeout, 20000, { min: 500, max: 120000 }),
    allowedOrigins,
  };
}

function implicitRole(tag, type) {
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'input') {
    if (['checkbox'].includes(type)) return 'checkbox';
    if (['radio'].includes(type)) return 'radio';
    if (['submit', 'button', 'reset', 'image'].includes(type)) return 'button';
    return 'textbox';
  }
  return '';
}

function interactiveDomScript(selector, maxItems) {
  return ({ selector: inputSelector, max }) => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0;
    };
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const cssQuote = value => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const stableClasses = element => [...element.classList]
      .filter(name => name.length < 50 && !/^(css-|sc-|jsx-|ng-|v-|_|[a-f0-9]{6,})/i.test(name))
      .slice(0, 2);
    const absoluteXPath = element => {
      const parts = [];
      let current = element;
      while (current && current.nodeType === 1) {
        let index = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === current.tagName) index += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
        if (current === document.documentElement) break;
        current = current.parentElement;
      }
      return `/${parts.join('/')}`;
    };
    const visibleElements = [...document.querySelectorAll(inputSelector)].filter(visible);
    const elements = visibleElements.slice(0, max);
    return {
      total: visibleElements.length,
      items: elements.map((element, index) => {
        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute('type') || (tag === 'input' ? 'text' : '')).toLowerCase();
        const ariaLabel = clean(element.getAttribute('aria-label'));
        const labelledBy = clean(element.getAttribute('aria-labelledby'));
        const textContent = clean(element.innerText || element.textContent);
        const placeholder = clean(element.getAttribute('placeholder'));
        const title = clean(element.getAttribute('title'));
        const name = clean(element.getAttribute('name'));
        const role = clean(element.getAttribute('role')) || (
          tag === 'button' ? 'button'
            : tag === 'a' ? 'link'
              : tag === 'textarea' ? 'textbox'
                : tag === 'select' ? 'combobox'
                  : tag === 'input' && type === 'checkbox' ? 'checkbox'
                    : tag === 'input' && type === 'radio' ? 'radio'
                      : tag === 'input' ? 'textbox' : ''
        );
        const nameForTarget = ariaLabel || textContent || placeholder || title || name || labelledBy;
        const testId = clean(element.getAttribute('data-testid') || element.getAttribute('data-test-id'));
        const id = clean(element.id);
        const cssCandidates = [];
        if (name) cssCandidates.push(`${tag}[name="${cssQuote(name)}"]`);
        if (ariaLabel) cssCandidates.push(`${tag}[aria-label="${cssQuote(ariaLabel)}"]`);
        if (placeholder) cssCandidates.push(`${tag}[placeholder="${cssQuote(placeholder)}"]`);
        if (title) cssCandidates.push(`${tag}[title="${cssQuote(title)}"]`);
        const classes = stableClasses(element);
        if (classes.length) cssCandidates.push(`${tag}.${classes.map(cssQuote).join('.')}`);
        const rect = element.getBoundingClientRect();
        return {
          dom_index: index,
          tag,
          type,
          role,
          name: nameForTarget,
          aria_label: ariaLabel,
          labelled_by: labelledBy,
          placeholder,
          title,
          name_attribute: name,
          data_test_id: testId,
          id,
          text: textContent,
          disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
          editable: Boolean(element.isContentEditable || ['input', 'textarea', 'select'].includes(tag)),
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          css_candidates: cssCandidates.slice(0, 5),
          xpath: absoluteXPath(element),
        };
      }),
    };
  };
}

function domCandidates(item) {
  const candidates = [];
  if (item.data_test_id) {
    candidates.push({
      strategy: 'DATA_TEST_ID',
      value: item.data_test_id,
      selector: `[data-testid="${escapeAttribute(item.data_test_id)}"]`,
      reason: 'live DOM data-testid',
    });
  }
  if (item.id) {
    candidates.push({
      strategy: 'ID',
      value: item.id,
      selector: `#${item.id.replace(/([:\[\].,>+~])/g, '\\$1')}`,
      reason: 'live DOM id',
    });
  }
  for (const selector of item.css_candidates || []) {
    candidates.push({ strategy: 'STABLE_CSS', value: selector, selector, reason: 'stable live DOM attribute/class' });
  }
  if (item.role || item.name) {
    candidates.push({
      strategy: 'AX_SEMANTIC',
      value: `${item.role || 'generic'}|${item.name || ''}`,
      role: item.role,
      name: item.name,
      reason: 'live DOM semantic role/name; AX corroboration when available',
    });
  }
  if (item.name || item.placeholder || item.text) {
    candidates.push({
      strategy: 'ROLE_LABEL_TEXT',
      value: item.name || item.placeholder || item.text,
      role: item.role,
      name: item.name || item.placeholder || item.text,
      reason: 'live label, placeholder or visible text',
    });
  }
  if (item.xpath) {
    candidates.push({
      strategy: 'XPATH',
      value: item.xpath,
      selector: item.xpath,
      reason: 'last-resort structural path from observed live DOM',
    });
  }
  return sortLocatorCandidates(candidates);
}

function compactAxNodes(nodes = [], max = 120) {
  return nodes.filter(node => !node.ignored)
    .map(node => ({
      node_id: text(node.nodeId, 80),
      role: text(node.role?.value, 100),
      name: text(node.name?.value, 240),
      value: node.value?.value === undefined ? undefined : text(node.value.value, 120),
      disabled: Boolean(node.properties?.some(property => property.name === 'disabled' && property.value?.value === true)),
    }))
    .filter(node => node.role || node.name)
    .slice(0, max);
}

async function collectAxTree(page, maxNodes = 120) {
  if (!page?.context || typeof page.context !== 'function') return { available: false, nodes: [], reason: 'page context unavailable' };
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const result = await cdp.send('Accessibility.getFullAXTree');
    const meaningful = (result?.nodes || []).filter(node => !node.ignored && (node.role?.value || node.name?.value));
    return {
      available: true,
      total_node_count: meaningful.length,
      nodes: compactAxNodes(meaningful, maxNodes),
    };
  } catch (error) {
    return { available: false, nodes: [], reason: text(error?.message || error, 240) };
  } finally {
    try { await cdp?.detach(); } catch { /* CDP session may already be gone */ }
  }
}

function normalizePageId(value) {
  return slug(value, 'page-main');
}

function pageSummary(page, pageId, authMode) {
  return {
    page_id: pageId,
    url: text(page?.url?.() || '', 500),
    title: '',
    open: !page?.isClosed?.(),
    auth_mode: authMode,
  };
}

export class NativeBrowserSession {
  constructor(options, runtime = {}) {
    this.options = validateNativeBrowserOptions(options);
    this.runtime = runtime;
    this.sessionId = text(this.options.sessionId, 160) || `native-${this.options.runId}-w${this.options.workerId}-${hash(Math.random())}`;
    this.authMode = this.options.cdpUrl ? 'cdp_attach'
      : this.options.profileDir ? 'persistent_profile'
        : this.options.storageStatePath || fs.existsSync(path.join(this.options.dataDir, 'auth.json'))
          ? 'storage_state' : 'isolated';
    this.dataNamespace = text(
      this.options.dataNamespace || process.env.QA_DATA_NAMESPACE,
      180,
    ) || `qa-${slug(this.options.runId)}-worker-${this.options.workerId}`;
    this.browser = null;
    this.context = null;
    this.pages = new Map();
    this.pageIds = new WeakMap();
    this.pageStates = new Map();
    this.nextPageNumber = 1;
    this.activePageId = null;
    this.actionNumber = 0;
    this.recoveryCount = 0;
    this.startedAt = nowIso();
    this.closed = false;
    this.eventsFile = path.join(
      this.options.dataDir,
      'evidence',
      'native-browser',
      slug(this.options.runId),
      `worker-${this.options.workerId}`,
      'runtime-events.json',
    );
    this.stateDir = path.dirname(this.eventsFile);
    this.stateFile = path.join(this.stateDir, 'session.json');
  }

  async init() {
    if (this.context) return this;
    fs.mkdirSync(this.stateDir, { recursive: true });
    const launchOptions = {
      ...chromiumLaunchOptions(),
      headless: this.options.headless,
      viewport: this.options.viewport,
      recordVideo: this.options.recordVideo ? { dir: this.stateDir } : undefined,
    };
    try {
      if (this.options.cdpUrl) {
        this.browser = await (this.runtime.browserType || chromium).connectOverCDP(this.options.cdpUrl);
        this.context = this.browser.contexts()[0];
        if (!this.context) throw new Error('CDP browser has no attachable context');
      } else if (this.options.profileDir) {
        fs.mkdirSync(this.options.profileDir, { recursive: true });
        this.context = await (this.runtime.browserType || chromium).launchPersistentContext(
          this.options.profileDir,
          launchOptions,
        );
      } else {
        this.browser = await (this.runtime.browserType || chromium).launch({
          ...launchOptions,
          recordVideo: undefined,
        });
        const storageStatePath = this.options.storageStatePath
          ? path.resolve(this.options.storageStatePath)
          : path.join(this.options.dataDir, 'auth.json');
        this.context = await this.browser.newContext({
          viewport: this.options.viewport,
          storageState: fs.existsSync(storageStatePath) ? storageStatePath : undefined,
          recordVideo: this.options.recordVideo ? { dir: this.stateDir } : undefined,
        });
      }
    } catch (error) {
      try { await this.context?.close(); } catch { /* best effort failed-launch cleanup */ }
      try { await this.browser?.close(); } catch { /* best effort failed-launch cleanup */ }
      this.context = null;
      this.browser = null;
      const failure = normalizeNativeBrowserLaunchError(error);
      this.writeState({
        launch_error: {
          code: failure.code,
          retryable: false,
          message: failure.message,
        },
      });
      throw failure;
    }
    this.context.setDefaultTimeout?.(this.options.actionTimeout);
    this.context.setDefaultNavigationTimeout?.(this.options.navigationTimeout);
    this.context.on?.('page', page => {
      this.registerPage(page).catch(() => {});
    });
    for (const page of this.context.pages?.() || []) await this.registerPage(page);
    if (!this.activePageId) await this.registerPage(await this.context.newPage());
    this.writeState();
    return this;
  }

  async registerPage(page) {
    if (!page || this.pageIds.has(page)) return this.pageIds.get(page);
    const pageId = `page-${this.nextPageNumber++}`;
    this.pageIds.set(page, pageId);
    this.pages.set(pageId, page);
    this.pageStates.set(pageId, {
      revision: 0,
      stale: true,
      observedAt: null,
      refs: new Map(),
      lastObservation: null,
    });
    createRuntimeObserver(page, {
      eventsFile: this.eventsFile,
      captureSuccessfulResponses: true,
    });
    page.on?.('close', () => {
      const state = this.pageStates.get(pageId);
      if (state) state.stale = true;
      if (this.activePageId === pageId) {
        this.activePageId = [...this.pages.entries()].find(([, candidate]) => !candidate.isClosed?.())?.[0] || null;
      }
      this.writeState();
    });
    if (!this.activePageId || !this.pages.get(this.activePageId) || this.pages.get(this.activePageId).isClosed?.()) {
      this.activePageId = pageId;
    }
    this.writeState();
    return pageId;
  }

  getPage(pageId = this.activePageId) {
    const id = normalizePageId(pageId || this.activePageId);
    const page = this.pages.get(id);
    if (!page || page.isClosed?.()) {
      const error = new Error(`native page is unavailable: ${id}`);
      error.code = 'PAGE_UNAVAILABLE';
      throw error;
    }
    return { pageId: id, page, state: this.pageStates.get(id) };
  }

  async observe({ pageId = this.activePageId, maxItems, maxChars, detail = 'compact' } = {}) {
    await this.init();
    const profile = resolveNativeObservationProfile(detail, { maxItems, maxChars });
    const selected = this.getPage(pageId);
    const { pageId: id, page, state } = selected;
    const ready = await waitForUiReady(page, {
      timeout: positiveInt(process.env.QA_NATIVE_READY_TIMEOUT_MS, 4000, { min: 250, max: 30000 }),
      quietMs: positiveInt(process.env.QA_NATIVE_READY_QUIET_MS, 120, { min: 20, max: 1000 }),
    });
    const dom = await page.evaluate(interactiveDomScript(INTERACTIVE_SELECTOR, profile.maxItems), {
      selector: INTERACTIVE_SELECTOR,
      max: profile.maxItems,
    }).catch(error => ({ error: text(error?.message || error, 240), total: 0, items: [] }));
    const domItems = Array.isArray(dom) ? dom : (dom.items || []);
    const domTotal = Array.isArray(dom) ? dom.length : Number(dom.total || domItems.length);
    const ax = await collectAxTree(page, NATIVE_OBSERVATION_PROFILES.full.maxAxNodes);
    const axOutputNodes = ax.nodes.slice(0, profile.maxAxNodes);
    const content = await page.evaluate((limits) => {
      const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
      const fullVisibleText = clean(document.body?.innerText || '');
      const allHeadings = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')]
        .filter(visible).map(element => clean(element.innerText)).filter(Boolean);
      const allLinks = [...document.querySelectorAll('a[href]')]
        .filter(visible).map(element => ({ text: clean(element.innerText || element.getAttribute('aria-label')), href: element.href }))
        .filter(item => item.text || item.href);
      const allTables = [...document.querySelectorAll('table')].filter(visible);
      return {
        text: fullVisibleText.slice(0, limits.maxChars),
        total_text_chars: fullVisibleText.length,
        headings: allHeadings.slice(0, limits.maxContentItems),
        total_headings: allHeadings.length,
        links: allLinks.slice(0, limits.maxLinks),
        total_links: allLinks.length,
        tables: allTables.slice(0, limits.maxTables).map(table => ({
          headers: [...table.querySelectorAll('thead th')].map(cell => clean(cell.innerText)).filter(Boolean).slice(0, limits.maxColumns),
          rows: [...table.querySelectorAll('tbody tr')].slice(0, limits.maxRowsPerTable).map(row => (
            [...row.querySelectorAll('th,td')].map(cell => clean(cell.innerText)).slice(0, limits.maxColumns)
          )),
        })),
        total_tables: allTables.length,
      };
    }, profile).catch(error => ({
      error: text(error?.message || error, 240),
      text: '',
      headings: [],
      links: [],
      tables: [],
      total_text_chars: 0,
      total_headings: 0,
      total_links: 0,
      total_tables: 0,
    }));
    const refs = new Map();
    const interactive = domItems.map((item, index) => {
      const ref = `e${index + 1}`;
      const candidates = domCandidates(item);
      const descriptor = {
        ref,
        role: item.role || null,
        name: text(item.name, 240) || null,
        tag: item.tag,
        type: item.type,
        disabled: item.disabled,
        editable: item.editable,
        bounds: item.bounds,
        candidates,
        source: 'live_dom',
        ax_corroborated: Boolean(ax.available && ax.nodes.some(node => (
          node.role === item.role && node.name === item.name
        ))),
      };
      refs.set(ref, descriptor);
      if (profile.includeLocatorCandidates) return descriptor;
      return {
        ref: descriptor.ref,
        role: descriptor.role,
        name: descriptor.name,
        ...(descriptor.disabled ? { disabled: true } : {}),
        ...(descriptor.editable ? { editable: true } : {}),
        ...(!descriptor.role ? { element: descriptor.tag } : {}),
        locator_strategies: [...new Set(candidates.map(candidate => candidate.strategy))].slice(0, 3),
        ...(descriptor.ax_corroborated ? { ax_corroborated: true } : {}),
      };
    });
    state.revision += 1;
    state.stale = false;
    state.observedAt = nowIso();
    state.refs = refs;
    const truncation = {
      interactive: domTotal > domItems.length,
      content_text: Number(content.total_text_chars || 0) > String(content.text || '').length,
      headings: Number(content.total_headings || 0) > (content.headings || []).length,
      links: Number(content.total_links || 0) > (content.links || []).length,
      tables: Number(content.total_tables || 0) > (content.tables || []).length,
      ax_tree: Number(ax.total_node_count || ax.nodes.length) > axOutputNodes.length,
    };
    truncation.any = Object.values(truncation).some(Boolean);
    const observation = {
      session_id: this.sessionId,
      page_id: id,
      revision: state.revision,
      observed_at: state.observedAt,
      url: text(page.url(), 500),
      title: await page.title().catch(() => ''),
      ready,
      active: id === this.activePageId,
      detail: profile.name,
      locator_priority: LOCATOR_PRIORITY,
      interactive,
      content: {
        text: text(content.text, 8000),
        headings: (content.headings || []).map(value => text(value, 400)),
        links: (content.links || []).map(item => ({ text: text(item.text, 400), href: text(item.href, 800) })),
        tables: (content.tables || []).map(table => ({
          headers: (table.headers || []).map(value => text(value, 300)),
          rows: (table.rows || []).map(row => row.map(value => text(value, 500))),
        })),
        error: content.error || null,
      },
      ax_tree: {
        available: ax.available,
        node_count: axOutputNodes.length,
        total_node_count: Number(ax.total_node_count || ax.nodes.length),
        nodes: axOutputNodes,
        reason: ax.reason || null,
      },
      pages: [...this.pages.entries()].map(([pageIdValue, pageValue]) => pageSummary(pageValue, pageIdValue, this.authMode)),
      runtime_cursor: this.runtimeCursor(),
      truncation: {
        ...truncation,
        returned_interactive: domItems.length,
        total_interactive: domTotal,
        guidance: truncation.any
          ? 'Escalate to detail=standard/full only when the current objective or semantic target is missing'
          : null,
      },
    };
    const estimatedChars = Buffer.byteLength(JSON.stringify(observation), 'utf8');
    observation.context_budget = {
      profile: profile.name,
      estimated_chars: estimatedChars,
      estimated_tokens_utf8_div4: Math.ceil(estimatedChars / 4),
      escalation_available: profile.name !== 'full',
    };
    state.lastObservation = observation;
    this.writeState();
    return observation;
  }

  runtimeCursor() {
    const events = fs.existsSync(this.eventsFile)
      ? (() => {
        try { return JSON.parse(fs.readFileSync(this.eventsFile, 'utf8')); } catch { return []; }
      })()
      : [];
    return Array.isArray(events) ? events.length : 0;
  }

  async findLocator(page, candidate) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) return null;
    if (normalized.strategy === 'DATA_TEST_ID') {
      return page.locator(`[data-testid="${escapeAttribute(normalized.value)}"], [data-test-id="${escapeAttribute(normalized.value)}"]`);
    }
    if (normalized.strategy === 'ID') {
      return page.locator(`#${normalized.value.replace(/([:\[\].,>+~])/g, '\\$1')}`);
    }
    if (normalized.strategy === 'STABLE_CSS') return page.locator(normalized.selector || normalized.value);
    if (normalized.strategy === 'AX_SEMANTIC') {
      if (normalized.role && normalized.name) return page.getByRole(normalized.role, { name: normalized.name, exact: true });
      if (normalized.role) return page.getByRole(normalized.role);
      if (normalized.name) return page.getByText(normalized.name, { exact: true });
    }
    if (normalized.strategy === 'ROLE_LABEL_TEXT') {
      if (normalized.role === 'textbox' && normalized.name) {
        const byLabel = page.getByLabel(normalized.name, { exact: true });
        if (await byLabel.count().catch(() => 0)) return byLabel;
      }
      if (normalized.name) return page.getByText(normalized.name, { exact: true });
    }
    if (normalized.strategy === 'DOM_JS') {
      return page.locator(normalized.selector || normalized.value);
    }
    if (normalized.strategy === 'XPATH') {
      if (!normalized.reason) return null;
      return page.locator(`xpath=${normalized.selector || normalized.value}`);
    }
    return null;
  }

  async resolveTarget({ pageId = this.activePageId, target, allowXPath = false } = {}) {
    const selected = this.getPage(pageId);
    const { page, pageId: id, state } = selected;
    if (!target) {
      const error = new Error('interactive action requires target_ref or semantic target');
      error.code = 'TARGET_REQUIRED';
      throw error;
    }
    let descriptor = null;
    let requestedRef = '';
    if (typeof target === 'string') {
      requestedRef = target.trim();
      descriptor = state.refs.get(requestedRef) || { name: requestedRef, candidates: [] };
    } else if (typeof target === 'object') {
      requestedRef = text(target.ref || target.target_ref, 100);
      descriptor = requestedRef ? state.refs.get(requestedRef) : target;
      if (!descriptor) descriptor = target;
    }
    if (requestedRef && state.stale) {
      const error = new Error(`target ref ${requestedRef} is stale; observe the page again before acting`);
      error.code = 'STALE_TARGET';
      throw error;
    }
    let candidates = sortLocatorCandidates(descriptor.candidates || []);
    if (!candidates.length) {
      const name = text(descriptor.name || descriptor.text || descriptor.label || descriptor.placeholder || (typeof target === 'string' ? target : ''), 300);
      const role = text(descriptor.role, 100);
      if (name) {
        candidates = sortLocatorCandidates([
          { strategy: 'AX_SEMANTIC', value: `${role}|${name}`, role, name, reason: 'explicit semantic target' },
          { strategy: 'ROLE_LABEL_TEXT', value: name, role, name, reason: 'explicit semantic target' },
        ]);
      }
      if (descriptor.selector) {
        const strategy = normalizeStrategy(descriptor.strategy || (String(descriptor.selector).startsWith('/') ? 'XPATH' : 'STABLE_CSS'));
        candidates.unshift(normalizeCandidate({
          strategy,
          value: descriptor.selector,
          selector: descriptor.selector,
          reason: descriptor.reason || (strategy === 'XPATH' ? descriptor.xpath_reason : 'explicit selector'),
          role,
          name,
        }));
        candidates = sortLocatorCandidates(candidates);
      }
    }
    const attempts = [];
    for (const candidate of candidates) {
      if (candidate.strategy === 'XPATH' && !allowXPath && !candidate.reason) continue;
      let locator;
      try { locator = await this.findLocator(page, candidate); } catch (error) {
        attempts.push({ ...candidate, count: 0, error: text(error?.message || error, 180) });
        continue;
      }
      if (!locator) continue;
      const count = await locator.count().catch(() => 0);
      const visible = [];
      for (let index = 0; index < Math.min(count, 8); index += 1) {
        if (await locator.nth(index).isVisible().catch(() => false)) visible.push(index);
      }
      attempts.push({ ...candidate, count, visible_count: visible.length });
      if (visible.length === 1) {
        const selectedLocator = locator.nth(visible[0]);
        const enabled = await selectedLocator.isEnabled().catch(() => true);
        if (!enabled) continue;
        return {
          pageId: id,
          locator: selectedLocator,
          evidence: {
            strategy: candidate.strategy,
            selector: candidate.selector || candidate.value,
            source: candidate.strategy === 'XPATH' ? 'live_dom_last_resort' : 'live_dom',
            verified: true,
            reason: candidate.reason || null,
            fallback_reason: candidate.strategy === 'XPATH' ? (candidate.reason || 'All higher-priority selectors were non-unique or unavailable') : null,
            ref: requestedRef || null,
            attempts,
          },
        };
      }
    }
    const error = new Error(
      attempts.some(item => item.visible_count > 1)
        ? `target is ambiguous; no unique visible locator: ${safeJson(attempts, 1200)}`
        : `target could not be resolved from the live page: ${safeJson(attempts, 1200)}`,
    );
    error.code = attempts.some(item => item.visible_count > 1) ? 'TARGET_AMBIGUOUS' : 'TARGET_NOT_FOUND';
    error.attempts = attempts;
    throw error;
  }

  async ensureWriteSafety(action) {
    let targetHint = text(action.semantic_target || action.target_label, 300);
    if (!targetHint && action.target_ref) {
      try {
        const { state } = this.getPage(action.page_id || this.activePageId);
        targetHint = text(state.refs.get(String(action.target_ref))?.name, 300);
      } catch { /* target resolution produces the typed error later */ }
    }
    const actionText = text(`${action.intent || action.description || action.action || action.type} ${targetHint}`, 500);
    const targetUrl = text(action.target_url || action.url, 500);
    const safety = evaluateActionSafety({
      actionText,
      selector: text(action.selector || action.target_ref, 500),
      httpMethod: text(action.http_method, 20) || (action.type === 'upload' ? 'POST' : 'GET'),
      targetUrl,
      env: text(action.environment, 80) || process.env.QA_ENV || 'UAT',
      allowAction: text(action.allow_action, 120),
    });
    if (['BLOCKED', 'PAYMENT', 'EXTERNAL_EFFECT'].includes(safety.safety)) {
      const error = new Error(`native action blocked by safety policy: ${safety.reason}`);
      error.code = 'NATIVE_ACTION_BLOCKED';
      error.safety = safety;
      throw error;
    }
    return safety;
  }

  assertAllowedUrl(value, label = 'navigation') {
    if (!this.options.allowedOrigins.length || !value || value === 'about:blank') return;
    let origin;
    try { origin = new URL(value).origin; } catch {
      const error = new Error(`${label} URL is invalid: ${text(value, 500)}`);
      error.code = 'INVALID_TARGET_URL';
      throw error;
    }
    if (!this.options.allowedOrigins.includes(origin)) {
      const error = new Error(`${label} crossed the allowed domain boundary: ${origin}`);
      error.code = 'DOMAIN_BOUNDARY_VIOLATION';
      error.allowed_origins = this.options.allowedOrigins;
      throw error;
    }
  }

  async captureScreenshot(page, actionId, label = 'after') {
    const filePath = path.join(this.stateDir, `${actionId}-${label}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      mask: [page.locator(SENSITIVE_SCREENSHOT_SELECTOR)],
      maskColor: '#000000',
    });
    return filePath;
  }

  async visibleState(page) {
    return page.evaluate(() => {
      const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      const textOf = element => clean(element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder'));
      const bodyText = clean(document.body?.innerText || '').slice(0, 20000);
      let bodyHash = 2166136261;
      for (let index = 0; index < bodyText.length; index += 1) {
        bodyHash ^= bodyText.charCodeAt(index);
        bodyHash = Math.imul(bodyHash, 16777619);
      }
      return {
        url: location.href,
        title: document.title,
        headings: [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).map(textOf).filter(Boolean).slice(0, 20),
        alerts: [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [class*="toast" i], [class*="error" i]')].filter(visible).map(textOf).filter(Boolean).slice(0, 20),
        content_fingerprint: `fnv1a-${(bodyHash >>> 0).toString(16)}`,
        interactive_count: [...document.querySelectorAll('button,a[href],input,textarea,select,summary,[role],[contenteditable="true"]')].filter(visible).length,
        dialog_count: [...document.querySelectorAll('dialog,[role="dialog"],[role="alertdialog"]')].filter(visible).length,
        table_count: [...document.querySelectorAll('table')].filter(visible).length,
      };
    }).catch(error => ({ error: text(error?.message || error, 240) }));
  }

  async performAction(action = {}) {
    await this.init();
    const type = String(action.type || action.action_type || action.action || '').trim().toLowerCase();
    if (!ACTION_TYPES.has(type)) {
      const error = new Error(`unsupported native action type: ${type}`);
      error.code = 'UNSUPPORTED_ACTION';
      throw error;
    }
    const safety = await this.ensureWriteSafety({ ...action, type });
    const selected = this.getPage(action.page_id || this.activePageId);
    let { pageId, page, state } = selected;
    const beforeCursor = this.runtimeCursor();
    const actionId = `NATIVE-ACT-${String(++this.actionNumber).padStart(4, '0')}`;
    const before = await this.visibleState(page);
    let locatorEvidence = null;
    let extractedContent = null;
    let attachments = [];
    let uploadEvidence = null;
    let popupPage = null;
    const pagesBefore = new Set(this.context.pages?.() || []);
    const popupPromise = ['click', 'navigate'].includes(type) && this.context.waitForEvent
      ? this.context.waitForEvent('page', { timeout: 600 }).catch(() => null)
      : Promise.resolve(null);
    try {
      if (type === 'navigate') {
        const url = text(action.url || action.target_url, 1000);
        if (!url) throw new Error('navigate requires url');
        this.assertAllowedUrl(url, 'navigation');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.navigationTimeout });
      } else if (type === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: this.options.navigationTimeout }).catch(error => {
          if (!/cannot go back/i.test(String(error?.message || ''))) throw error;
        });
      } else if (type === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: this.options.navigationTimeout });
      } else if (type === 'wait') {
        const waitText = text(action.text || action.expected_signal, 300);
        if (waitText) {
          await page.waitForFunction(value => (document.body?.innerText || '').includes(value), waitText, {
            timeout: positiveInt(action.timeout, 8000, { min: 250, max: 30000 }),
          });
        } else {
          await page.waitForTimeout(positiveInt(action.ms, 250, { min: 20, max: 5000 }));
        }
      } else if (type === 'screenshot') {
        // Screenshot is still evidence, not an arbitrary page script.
      } else if (type === 'switch_page') {
        const targetPageId = normalizePageId(action.target_page_id || action.target || '');
        const targetPage = this.getPage(targetPageId);
        this.activePageId = targetPage.pageId;
        pageId = targetPage.pageId;
        page = targetPage.page;
        state = targetPage.state;
        await page.bringToFront?.();
      } else if (type === 'scroll' && !action.target && !action.target_ref && !action.semantic_target && !action.selector) {
        const direction = text(action.direction, 20).toLowerCase() || 'down';
        const distance = positiveInt(action.distance, 700, { min: 50, max: 4000 });
        await page.mouse.wheel(0, direction === 'up' ? -distance : distance);
      } else if (type === 'extract') {
        const target = action.target || action.target_ref || action.semantic_target || (action.selector ? {
          selector: action.selector,
          strategy: action.strategy || 'STABLE_CSS',
          reason: action.fallback_reason || 'explicit read-only extraction selector',
        } : null);
        let root = null;
        if (target) {
          const resolved = await this.resolveTarget({ pageId, target, allowXPath: Boolean(action.allow_xpath) });
          locatorEvidence = resolved.evidence;
          root = resolved.locator;
        }
        const extractionOptions = {
          format: text(action.format || action.output_format, 40).toLowerCase() || 'structured',
          max_items: positiveInt(action.max_items, 50, { min: 1, max: 200 }),
          max_chars: positiveInt(action.max_chars, 8000, { min: 200, max: 30000 }),
        };
        const extractor = (scope, options) => {
          const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
          const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const rootElement = scope || document.body;
          const query = selector => [...rootElement.querySelectorAll(selector)].filter(visible);
          return {
            format: options.format,
            text: clean(rootElement.innerText || rootElement.textContent).slice(0, options.max_chars),
            links: query('a[href]').slice(0, options.max_items).map(element => ({
              text: clean(element.innerText || element.getAttribute('aria-label')),
              href: element.href,
            })),
            lists: query('ul,ol').slice(0, 12).map(list => (
              [...list.querySelectorAll(':scope > li')].slice(0, options.max_items).map(item => clean(item.innerText))
            )),
            tables: query('table').slice(0, 8).map(table => ({
              headers: [...table.querySelectorAll('thead th')].map(cell => clean(cell.innerText)).slice(0, 24),
              rows: [...table.querySelectorAll('tbody tr')].slice(0, options.max_items).map(row => (
                [...row.querySelectorAll('th,td')].map(cell => clean(cell.innerText)).slice(0, 24)
              )),
            })),
          };
        };
        const raw = root
          ? await root.evaluate(extractor, extractionOptions)
          : await page.locator('body').evaluate(extractor, extractionOptions);
        extractedContent = {
          format: raw.format,
          text: text(raw.text, extractionOptions.max_chars),
          links: (raw.links || []).map(item => ({ text: text(item.text, 400), href: text(item.href, 800) })),
          lists: (raw.lists || []).map(list => list.map(item => text(item, 500))),
          tables: (raw.tables || []).map(table => ({
            headers: (table.headers || []).map(value => text(value, 300)),
            rows: (table.rows || []).map(row => row.map(value => text(value, 500))),
          })),
        };
      } else {
        const target = action.target
          || action.target_ref
          || action.semantic_target
          || (action.selector ? {
            selector: action.selector,
            strategy: action.strategy || (String(action.selector).startsWith('/') ? 'XPATH' : 'STABLE_CSS'),
            reason: action.fallback_reason || (String(action.selector).startsWith('/') ? action.xpath_reason : 'explicit selector'),
            xpath_reason: action.xpath_reason,
          } : null);
        const resolved = await this.resolveTarget({
          pageId,
          target,
          allowXPath: Boolean(action.allow_xpath),
        });
        locatorEvidence = resolved.evidence;
        if (type === 'click') await resolved.locator.click({ timeout: this.options.actionTimeout });
        if (type === 'download') {
          const downloadPromise = page.waitForEvent('download', { timeout: this.options.navigationTimeout });
          await resolved.locator.click({ timeout: this.options.actionTimeout });
          const download = await downloadPromise;
          const suggested = slug(download.suggestedFilename?.() || `download-${Date.now()}`, 'download');
          const downloadDir = path.join(this.stateDir, 'downloads');
          fs.mkdirSync(downloadDir, { recursive: true });
          const downloadPath = path.join(downloadDir, suggested);
          await download.saveAs(downloadPath);
          attachments = [downloadPath];
        }
        if (type === 'upload') {
          const suppliedPath = text(action.file_path || action.path, 2000);
          if (!suppliedPath || !path.isAbsolute(suppliedPath)) {
            const error = new Error('upload requires an absolute file_path');
            error.code = 'UPLOAD_FILE_PATH_REQUIRED';
            throw error;
          }
          const dataRoot = fs.realpathSync(this.options.dataDir);
          let realFilePath;
          try {
            realFilePath = fs.realpathSync(suppliedPath);
          } catch {
            const error = new Error('upload file does not exist');
            error.code = 'UPLOAD_FILE_NOT_FOUND';
            throw error;
          }
          const relativeFilePath = path.relative(dataRoot, realFilePath);
          if (!relativeFilePath || relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) {
            const error = new Error('upload file must stay inside QA_DATA_DIR');
            error.code = 'UPLOAD_PATH_OUTSIDE_DATA_DIR';
            throw error;
          }
          const fileStat = fs.statSync(realFilePath);
          if (!fileStat.isFile()) {
            const error = new Error('upload target must be a regular file');
            error.code = 'UPLOAD_NOT_REGULAR_FILE';
            throw error;
          }
          const maxUploadBytes = positiveInt(action.max_upload_bytes, 25 * 1024 * 1024, {
            min: 1,
            max: 250 * 1024 * 1024,
          });
          if (fileStat.size > maxUploadBytes) {
            const error = new Error(`upload file exceeds max_upload_bytes (${fileStat.size} > ${maxUploadBytes})`);
            error.code = 'UPLOAD_FILE_TOO_LARGE';
            throw error;
          }
          const targetKind = await resolved.locator.evaluate(element => ({
            tag: element.tagName.toLowerCase(),
            type: String(element.getAttribute('type') || '').toLowerCase(),
          }));
          if (targetKind.tag === 'input' && targetKind.type === 'file') {
            await resolved.locator.setInputFiles(realFilePath);
          } else {
            const chooserPromise = page.waitForEvent('filechooser', { timeout: this.options.actionTimeout });
            await resolved.locator.click({ timeout: this.options.actionTimeout });
            const chooser = await chooserPromise;
            await chooser.setFiles(realFilePath);
          }
          attachments = [relativeFilePath];
          uploadEvidence = {
            file_name: path.basename(realFilePath),
            relative_path: relativeFilePath,
            size_bytes: fileStat.size,
          };
        }
        if (type === 'fill') {
          if (action.value === undefined || action.value === null) throw new Error('fill requires value');
          await resolved.locator.fill(String(action.value));
        }
        if (type === 'type') {
          if (action.value === undefined || action.value === null) throw new Error('type requires value');
          await resolved.locator.pressSequentially(String(action.value), { delay: positiveInt(action.delay, 0, { min: 0, max: 500 }) });
        }
        if (type === 'press') await resolved.locator.press(text(action.key, 80) || 'Enter');
        if (type === 'check') await resolved.locator.check();
        if (type === 'uncheck') await resolved.locator.uncheck();
        if (type === 'select') await resolved.locator.selectOption(action.value ?? action.option);
        if (type === 'scroll') await resolved.locator.scrollIntoViewIfNeeded();
      }
      popupPage = await popupPromise;
      if (popupPage && !pagesBefore.has(popupPage)) {
        const popupId = await this.registerPage(popupPage);
        this.activePageId = popupId;
        pageId = popupId;
        page = popupPage;
        state = this.pageStates.get(popupId);
      }
      const readiness = await waitForUiReady(page, {
        timeout: positiveInt(action.ready_timeout, 4000, { min: 250, max: 30000 }),
        quietMs: positiveInt(action.quiet_ms, 120, { min: 20, max: 1000 }),
      });
      const after = await this.visibleState(page);
      this.assertAllowedUrl(after.url, 'resulting page');
      const mediaRefs = action.capture_media === false ? [] : [await this.captureScreenshot(page, actionId)];
      const events = fs.existsSync(this.eventsFile)
        ? (() => { try { return JSON.parse(fs.readFileSync(this.eventsFile, 'utf8')); } catch { return []; } })()
        : [];
      const newEvents = Array.isArray(events) ? events.slice(beforeCursor) : [];
      const runtime = {
        cursor_before: beforeCursor,
        cursor_after: Array.isArray(events) ? events.length : beforeCursor,
        event_count: newEvents.length,
        response_count: newEvents.filter(event => event.type === 'HTTP_RESPONSE').length,
        failures: newEvents.filter(event => ['HTTP_FAILURE', 'REQUEST_FAILED', 'GRAPHQL_ERROR', 'CONSOLE_ERROR', 'PAGE_CRASH_ERROR', 'WEBSOCKET_ERROR'].includes(event.type)).map(event => ({
          type: event.type,
          payload: safeJson(event.payload, 600),
        })).slice(0, 32),
      };
      const stateDelta = computeNativeStateDelta(before, after, runtime);
      state.stale = true;
      const result = {
        action_id: actionId,
        session_id: this.sessionId,
        worker_id: this.options.workerId,
        page_id: pageId,
        action_type: type,
        safety,
        locator_evidence: locatorEvidence || {
          strategy: 'NATIVE_NAVIGATION',
          selector: null,
          source: 'native_runtime',
          verified: ['navigate', 'back', 'reload', 'wait', 'screenshot', 'scroll', 'extract', 'switch_page'].includes(type),
          fallback_reason: null,
        },
        charter_id: text(action.charter_id, 120) || null,
        step_id: text(action.step_id, 120) || null,
        decision_id: text(action.decision_id, 120) || null,
        action: text(action.action || action.description || type, 500),
        http_method: text(action.http_method, 20).toUpperCase() || 'GET',
        target_url: text(action.target_url || action.url, 1000) || text(after.url, 1000),
        intent: text(action.intent || action.description, 500) || null,
        semantic_target: text(action.semantic_target, 500) || null,
        expected_signal: text(action.expected_signal, 700) || null,
        before,
        after,
        readiness,
        runtime,
        state_delta: stateDelta,
        extracted_content: extractedContent,
        attachments,
        upload: uploadEvidence,
        media_refs: mediaRefs,
        test_data_namespace: this.dataNamespace,
        next_observation_required: true,
        next_page_id: pageId,
        recorded_at: nowIso(),
      };
      this.writeState({ last_action: { action_id: actionId, action_type: type, page_id: pageId } });
      return result;
    } catch (error) {
      await popupPromise.catch?.(() => {});
      state.stale = true;
      const wrapped = new Error(`native action ${type} failed: ${text(error?.message || error, 800)}`);
      wrapped.code = error.code || 'NATIVE_ACTION_FAILED';
      wrapped.cause = error;
      wrapped.action_id = actionId;
      wrapped.locator_evidence = locatorEvidence || null;
      throw wrapped;
    }
  }

  async performReadOnlyBatch(actions = []) {
    const normalized = validateReadOnlyActionBatch(actions);
    const results = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const action = normalized[index];
      const result = await this.performAction({
        ...action,
        capture_media: action.capture_media ?? index === normalized.length - 1,
      });
      const observation = await this.observe({
        pageId: result.next_page_id,
        maxItems: action.max_items,
        maxChars: action.max_chars,
        detail: action.observation_detail || 'compact',
      });
      results.push({ action: result, observation });
      if (result.runtime?.failures?.length && action.continue_on_runtime_failure !== true) break;
    }
    return {
      session_id: this.sessionId,
      worker_id: this.options.workerId,
      requested_action_count: normalized.length,
      executed_action_count: results.length,
      stopped_early: results.length < normalized.length,
      results,
    };
  }

  async recover({ pageId = this.activePageId, reason = 'unspecified', strategy = 'bounded' } = {}) {
    await this.init();
    this.recoveryCount += 1;
    if (this.recoveryCount > this.options.maxRecoveries) {
      const error = new Error(`native recovery budget exhausted (${this.options.maxRecoveries})`);
      error.code = 'RECOVERY_BUDGET_EXHAUSTED';
      throw error;
    }
    let selected;
    try { selected = this.getPage(pageId); } catch {
      const open = [...this.pages.entries()].find(([, page]) => !page.isClosed?.());
      if (open) selected = { pageId: open[0], page: open[1], state: this.pageStates.get(open[0]) };
    }
    if (!selected) {
      const page = await this.context.newPage();
      const id = await this.registerPage(page);
      selected = { pageId: id, page, state: this.pageStates.get(id) };
    }
    const { page, pageId: id, state } = selected;
    if (strategy === 'reload' && !/write|save|submit|create|delete|update|payment|publish/i.test(reason)) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: this.options.navigationTimeout }).catch(() => {});
    }
    await waitForUiReady(page, { timeout: 3000, quietMs: 100 });
    state.stale = true;
    this.activePageId = id;
    this.writeState({ last_recovery: { reason: text(reason, 300), strategy, count: this.recoveryCount, at: nowIso() } });
    return {
      session_id: this.sessionId,
      page_id: id,
      recovery_count: this.recoveryCount,
      reason: text(reason, 300),
      next_observation_required: true,
    };
  }

  health() {
    return {
      session_id: this.sessionId,
      run_id: this.options.runId,
      worker_id: this.options.workerId,
      auth_mode: this.authMode,
      data_namespace: this.dataNamespace,
      connected: Boolean(this.context && !this.closed),
      active_page_id: this.activePageId,
      recovery_count: this.recoveryCount,
      pages: [...this.pages.entries()].map(([pageId, page]) => ({
        ...pageSummary(page, pageId, this.authMode),
        url: text(page.url?.() || '', 500),
      })),
      evidence_dir: path.relative(this.options.dataDir, this.stateDir),
      allowed_origins: this.options.allowedOrigins,
      started_at: this.startedAt,
    };
  }

  writeState(extra = {}) {
    try {
      fs.mkdirSync(this.stateDir, { recursive: true });
      fs.writeFileSync(this.stateFile, `${JSON.stringify({
        schema_version: 1,
        session_id: this.sessionId,
        run_id: this.options.runId,
        worker_id: this.options.workerId,
        auth_mode: this.authMode,
        data_namespace: this.dataNamespace,
        started_at: this.startedAt,
        updated_at: nowIso(),
        active_page_id: this.activePageId,
        pages: [...this.pages.entries()].map(([pageId, page]) => pageSummary(page, pageId, this.authMode)),
        recovery_count: this.recoveryCount,
        ...extra,
      }, null, 2)}\n`, 'utf8');
    } catch { /* evidence write failures are surfaced by final ledger gates */ }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.authMode === 'cdp_attach') {
      try { await this.browser?.close(); } catch { /* disconnect only */ }
    } else {
      try { await this.context?.close(); } catch { /* best effort teardown */ }
      try { await this.browser?.close(); } catch { /* persistent context owns browser */ }
    }
    this.writeState({ closed_at: nowIso() });
  }
}

export async function createNativeBrowserSession(options = {}) {
  const session = new NativeBrowserSession(options);
  await session.init();
  return session;
}

export class NativeBrowserPool {
  constructor(options = {}) {
    const resolvedOptions = {
      ...options,
      cdpUrl: options.cdpUrl || process.env.QA_CDP_URL || '',
      profileDir: options.profileDir || process.env.QA_BROWSER_PROFILE_DIR || '',
    };
    const validation = validatePoolConfig(resolvedOptions);
    this.options = { ...resolvedOptions, workers: validation.workers };
    this.sessions = new Map();
    this.poolId = text(options.poolId || options.runId, 160) || `native-pool-${Date.now()}`;
  }

  async init() {
    for (let workerId = 1; workerId <= this.options.workers; workerId += 1) {
      try {
        const session = await createNativeBrowserSession({
          ...this.options,
          runId: this.options.runId || this.poolId,
          sessionId: `${this.poolId}-worker-${workerId}`,
          workerId,
          cdpUrl: this.options.workers === 1 ? this.options.cdpUrl : '',
          profileDir: this.options.workers === 1 ? this.options.profileDir : '',
          dataNamespace: `${slug(this.options.runId || this.poolId)}-worker-${workerId}`,
        });
        this.sessions.set(workerId, session);
      } catch (error) {
        // Launch workers sequentially so a denied first launch stops the pool
        // immediately instead of spawning several crashing browser processes.
        await this.close();
        throw error;
      }
    }
    return this;
  }

  getWorker(workerId) {
    const id = positiveInt(workerId, 0, { min: 0, max: MAX_NATIVE_WORKERS });
    const session = this.sessions.get(id);
    if (!session) {
      const error = new Error(`native worker is unavailable: ${workerId}`);
      error.code = 'WORKER_UNAVAILABLE';
      throw error;
    }
    return session;
  }

  health() {
    return {
      pool_id: this.poolId,
      workers: this.options.workers,
      isolated: true,
      sessions: [...this.sessions.entries()].map(([workerId, session]) => ({ worker_id: workerId, ...session.health() })),
    };
  }

  async runAssignments(assignments = []) {
    const results = await Promise.all(assignments.map(async assignment => {
      const session = this.getWorker(assignment.worker_id);
      const actions = Array.isArray(assignment.actions) ? assignment.actions : [];
      const output = [];
      for (const action of actions) {
        if (String(action?.type || '').toLowerCase() === 'observe') output.push(await session.observe(action));
        else if (String(action?.type || '').toLowerCase() === 'recover') output.push(await session.recover(action));
        else if (String(action?.type || '').toLowerCase() === 'batch') output.push(await session.performReadOnlyBatch(action.actions));
        else output.push(await session.performAction(action));
      }
      return { worker_id: assignment.worker_id, results: output };
    }));
    return results;
  }

  async close() {
    await Promise.all([...this.sessions.values()].map(session => session.close()));
    this.sessions.clear();
  }
}

export async function createNativeBrowserPool(options = {}) {
  const pool = new NativeBrowserPool(options);
  await pool.init();
  return pool;
}
