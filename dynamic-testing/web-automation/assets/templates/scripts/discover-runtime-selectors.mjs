#!/usr/bin/env node

/**
 * Capture selector evidence from the live browser DOM before POM generation.
 *
 * This runner is deliberately evidence-first: testcase prose supplies semantic
 * hints, but a locator is promoted only after the target is unique and verified
 * in the requested route/role/state. XPath is generated only as a short,
 * attribute- or semantic-anchored last resort; absolute DOM paths are never
 * emitted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { parseAutomationManifest } from './verify-testcase-traceability.mjs';

const STRATEGY_ORDER = ['testid', 'id', 'css', 'role', 'label', 'placeholder', 'text', 'xpath'];
const ACTIONABLE_ACTIONS = new Set([
  'click', 'fill', 'clear', 'select', 'check', 'uncheck', 'press', 'upload',
]);
const INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'input', 'textarea', 'select', 'summary', '[role]',
  '[contenteditable="true"]',
].join(',');

function arg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function slug(value, fallback = 'selectors') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalize(value) {
  return clean(value, 300).normalize('NFKC').toLocaleLowerCase('en-US');
}

function unique(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function quote(value) {
  return JSON.stringify(clean(value, 300));
}

function escapeCss(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function strategyRank(strategy) {
  const rank = STRATEGY_ORDER.indexOf(String(strategy || '').toLowerCase());
  return rank < 0 ? STRATEGY_ORDER.length : rank;
}

function sortCandidates(candidates) {
  return unique(candidates.filter(Boolean)).sort((left, right) => (
    strategyRank(left.strategy) - strategyRank(right.strategy)
  ));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveBaseUrl(projectRoot) {
  const raw = arg('--base-url', process.env.QA_BASE_URL || process.env.UI_BASE_URL || process.env.BASE_URL || '');
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`BLOCKED: --base-url must be an absolute http/https URL: ${raw}`);
  }
}

function resolveRoute(route, baseUrl) {
  const raw = clean(route, 1000).replace('<BASE_URL>', baseUrl);
  if (!raw) return '';
  try {
    const url = new URL(raw, baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.href;
  } catch {
    throw new Error(`BLOCKED: route is not resolvable; provide --base-url for ${raw}`);
  }
}

function routePath(value) {
  try {
    return new URL(value).pathname.replace(/\/$/, '') || '/';
  } catch {
    return clean(value, 500).replace(/\/$/, '') || '/';
  }
}

function routeMatches(expected, actual) {
  const expectedPath = routePath(expected);
  const actualPath = routePath(actual);
  return expectedPath === actualPath || actualPath.startsWith(`${expectedPath}/`);
}

function roleForKind(kind) {
  const value = normalize(kind);
  if (value.includes('button') || value.includes('submit')) return 'button';
  if (value.includes('link')) return 'link';
  if (value.includes('checkbox')) return 'checkbox';
  if (value.includes('radio')) return 'radio';
  if (value.includes('select') || value.includes('dropdown') || value.includes('combobox')) return 'combobox';
  if (value.includes('heading') || value.includes('title')) return 'heading';
  if (value.includes('field') || value.includes('input') || value.includes('textbox') || value.includes('form')) return 'textbox';
  return '';
}

function actionForContext(context) {
  return String(context.actions?.[0] || 'assert').trim().toLowerCase();
}

function expectedVisibleForContext(context) {
  return context.expected_visible !== false;
}

function targetNames(target) {
  return unique([
    target?.name,
    target?.label,
    target?.placeholder,
    target?.aria_label,
    target?.text,
  ].map(normalize).filter(Boolean));
}

function targetRole(target) {
  return clean(target?.role || roleForKind(target?.kind), 80).toLowerCase();
}

function makeCandidate(strategy, locator, reason, extra = {}) {
  return {
    strategy,
    locator,
    available: false,
    reason: clean(reason, 300) || null,
    ...extra,
  };
}

function candidateSpecs(target) {
  const names = targetNames(target);
  const role = targetRole(target);
  const candidates = [
    target?.test_id
      ? makeCandidate('testid', `page.getByTestId(${quote(target.test_id)})`, 'FE-owned test-id supplied by the execution contract', {
        build: page => page.getByTestId(String(target.test_id)),
      })
      : makeCandidate('testid', null, 'No FE-owned test-id was supplied or observed; do not invent one'),
    target?.id
      ? makeCandidate('id', `page.locator(${quote(`#${escapeCss(target.id)}`)})`, 'Stable id supplied by the execution contract', {
        build: page => page.locator(`#${escapeCss(target.id)}`),
      })
      : null,
  ];

  if (target?.name_attribute) {
    const tag = role === 'textbox' ? 'input,textarea,select' : '*';
    const selector = tag === '*'
      ? `[name="${escapeCss(target.name_attribute)}"]`
      : `${tag}[name="${escapeCss(target.name_attribute)}"]`;
    candidates.push(makeCandidate('css', `page.locator(${quote(selector)})`, 'Stable live DOM name attribute supplied by the target contract', {
      build: page => page.locator(selector),
    }));
  }

  if (role && names.length > 0) {
    for (const name of [target.name, target.label, target.placeholder].filter(Boolean)) {
      candidates.push(makeCandidate('role', `page.getByRole(${quote(role)}, { name: ${quote(name)}, exact: true })`, 'Observed semantic role and accessible name', {
        build: page => page.getByRole(role, { name, exact: true }),
      }));
      break;
    }
  } else if (role) {
    candidates.push(makeCandidate('role', `page.getByRole(${quote(role)})`, 'Observed semantic role without an accessible-name hint', {
      build: page => page.getByRole(role),
    }));
  }

  if (target?.label) {
    candidates.push(makeCandidate('label', `page.getByLabel(${quote(target.label)}, { exact: true })`, 'Observed live label association', {
      build: page => page.getByLabel(target.label, { exact: true }),
    }));
  }
  if (target?.placeholder) {
    candidates.push(makeCandidate('placeholder', `page.getByPlaceholder(${quote(target.placeholder)}, { exact: true })`, 'Observed live placeholder', {
      build: page => page.getByPlaceholder(target.placeholder, { exact: true }),
    }));
  }
  for (const name of [target?.name, target?.text].filter(Boolean)) {
    candidates.push(makeCandidate('text', `page.getByText(${quote(name)}, { exact: true })`, 'Observed visible text in the live DOM', {
      build: page => page.getByText(name, { exact: true }),
    }));
    break;
  }
  return sortCandidates(candidates);
}

function liveDomProbeScript() {
  return ({ target, selector }) => {
    const normalizeValue = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
    const cleanValue = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0;
    };
    const xpathLiteral = value => {
      const text = String(value || '');
      if (!text.includes("'")) return `'${text}'`;
      if (!text.includes('"')) return `"${text}"`;
      return `concat('${text.split("'").join("',\"'\",'")}')`;
    };
    const uniqueXPath = expression => {
      const result = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      return result.snapshotLength === 1 ? expression : null;
    };
    const anchoredXPath = element => {
      const attributes = ['data-testid', 'data-test-id', 'id', 'name', 'aria-label', 'placeholder', 'title'];
      const tag = element.tagName.toLowerCase();
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const expression = `//*[@${attribute}=${xpathLiteral(value)}]`;
        const unique = uniqueXPath(expression);
        if (unique) return { value: unique, reason: `unique live DOM ${attribute} anchor` };
      }
      const text = cleanValue(element.innerText || element.textContent);
      if (text && ['button', 'a', 'summary', 'option'].includes(tag)) {
        const expression = `//${tag}[normalize-space(.)=${xpathLiteral(text)}]`;
        const unique = uniqueXPath(expression);
        if (unique) return { value: unique, reason: 'unique live DOM semantic text anchor' };
      }
      const label = element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
        : element.closest('label');
      const labelText = cleanValue(label?.innerText || label?.textContent);
      if (labelText) {
        const expression = `//label[normalize-space(.)=${xpathLiteral(labelText)}]//${tag}`;
        const unique = uniqueXPath(expression);
        if (unique) return { value: unique, reason: 'unique live DOM label relationship' };
      }
      return null;
    };
    const roleOf = element => {
      const tag = element.tagName.toLowerCase();
      const type = String(element.getAttribute('type') || '').toLowerCase();
      return cleanValue(element.getAttribute('role')) || (
        tag === 'button' ? 'button'
          : tag === 'a' ? 'link'
            : tag === 'textarea' ? 'textbox'
              : tag === 'select' ? 'combobox'
                : tag === 'input' && type === 'checkbox' ? 'checkbox'
                  : tag === 'input' && type === 'radio' ? 'radio'
                    : tag === 'input' ? 'textbox' : ''
      );
    };
    const labelOf = element => {
      const label = element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
        : element.closest('label');
      return cleanValue(label?.innerText || label?.textContent);
    };
    const nameOf = element => cleanValue(
      element.getAttribute('aria-label')
      || labelOf(element)
      || element.getAttribute('placeholder')
      || element.innerText
      || element.textContent
      || element.getAttribute('title')
      || element.getAttribute('name'),
    );
    const targetNames = [target.name, target.label, target.placeholder, target.text]
      .map(normalizeValue).filter(Boolean);
    const expectedRole = normalizeValue(target.role || '');
    const elements = [...document.querySelectorAll(selector)].map((element, index) => {
      const role = normalizeValue(roleOf(element));
      const label = normalizeValue(labelOf(element));
      const placeholder = normalizeValue(element.getAttribute('placeholder'));
      const text = normalizeValue(element.innerText || element.textContent);
      const accessibleName = normalizeValue(nameOf(element));
      const values = [accessibleName, label, placeholder, text].filter(Boolean);
      let score = 0;
      if (expectedRole && role === expectedRole) score += 3;
      if (targetNames.some(name => values.includes(name))) score += 6;
      else if (targetNames.some(name => values.some(value => value.includes(name) || name.includes(value)))) score += 3;
      if (target.test_id && [element.getAttribute('data-testid'), element.getAttribute('data-test-id')].includes(target.test_id)) score += 8;
      if (target.id && element.id === target.id) score += 8;
      return {
        index,
        score,
        role,
        name: cleanValue(nameOf(element)),
        label: cleanValue(labelOf(element)),
        placeholder: cleanValue(element.getAttribute('placeholder')),
        text: cleanValue(element.innerText || element.textContent),
        visible: visible(element),
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
        xpath: anchoredXPath(element),
      };
    }).filter(item => item.score >= 6).sort((left, right) => right.score - left.score);
    const best = elements[0];
    const tied = best ? elements.filter(item => item.score === best.score) : [];
    return {
      best: tied.length === 1 ? best : null,
      ambiguous: tied.length > 1,
      candidates: elements.slice(0, 8),
    };
  };
}

async function inspectLiveDom(page, target) {
  return page.evaluate(liveDomProbeScript(), { target, selector: INTERACTIVE_SELECTOR });
}

async function verifyCandidate(page, candidate, expectedVisible, actionableExpected) {
  if (!candidate.build) {
    return {
      ...candidate,
      available: false,
      count: 0,
      visible_count: 0,
      verified: false,
    };
  }
  let locator;
  try {
    locator = candidate.build(page);
  } catch (error) {
    return {
      ...candidate,
      available: false,
      count: 0,
      visible_count: 0,
      verified: false,
      error: clean(error?.message || error, 240),
    };
  }
  const count = await locator.count().catch(() => 0);
  let visibleCount = 0;
  let visible = false;
  let enabled = false;
  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) visibleCount += 1;
  }
  if (count === 1) {
    visible = await locator.isVisible().catch(() => false);
    enabled = await locator.isEnabled().catch(() => true);
  }
  const visibilityMatches = expectedVisible ? visible : !visible;
  const actionable = count === 1 && visible && enabled;
  const verified = count === 1 && visibilityMatches && (!actionableExpected || actionable);
  return {
    ...candidate,
    available: count > 0,
    count,
    visible_count: visibleCount,
    verification: { count, visible, actionable },
    verified,
  };
}

async function discoverTarget(page, context) {
  const target = context.target;
  const action = actionForContext(context);
  const expectedVisible = expectedVisibleForContext(context);
  const actionableExpected = ACTIONABLE_ACTIONS.has(action);
  const attempts = [];
  for (const candidate of candidateSpecs(target)) {
    const result = await verifyCandidate(page, candidate, expectedVisible, actionableExpected);
    attempts.push(result);
    if (result.verified) {
      return {
        status: 'runtime_verified',
        strategy: result.strategy,
        locator: result.locator,
        candidates: attempts.map(item => ({
          strategy: item.strategy,
          locator: item.locator,
          available: item.available,
          count: item.count ?? 0,
          visible_count: item.visible_count ?? 0,
          reason: item.reason || null,
          verified: item.verified,
        })),
        verification: {
          ...result.verification,
          url: page.url(),
        },
        reason: result.reason || null,
      };
    }
  }

  const liveDom = await inspectLiveDom(page, target).catch(error => ({
    best: null,
    ambiguous: false,
    candidates: [],
    error: clean(error?.message || error, 240),
  }));
  const xpath = liveDom.best?.xpath?.value;
  if (xpath && !liveDom.ambiguous) {
    const candidate = makeCandidate(
      'xpath',
      `page.locator(${quote(`xpath=${xpath}`)})`,
      liveDom.best.xpath.reason,
      { build: pageValue => pageValue.locator(`xpath=${xpath}`) },
    );
    const result = await verifyCandidate(page, candidate, expectedVisible, actionableExpected);
    attempts.push(result);
    if (result.verified) {
      return {
        status: 'runtime_verified',
        strategy: 'xpath',
        locator: result.locator,
        candidates: attempts.map(item => ({
          strategy: item.strategy,
          locator: item.locator,
          available: item.available,
          count: item.count ?? 0,
          visible_count: item.visible_count ?? 0,
          reason: item.reason || null,
          verified: item.verified,
        })),
        verification: { ...result.verification, url: page.url() },
        reason: `XPath fallback: ${liveDom.best.xpath.reason}`,
        xpath_reason: liveDom.best.xpath.reason,
      };
    }
  }

  const ambiguous = attempts.some(item => (item.count || 0) > 1 || (item.visible_count || 0) > 1) || liveDom.ambiguous;
  return {
    status: 'blocked',
    reason: ambiguous
      ? 'Target is ambiguous in the live DOM; provide a stable scope, label or FE-owned test-id'
      : 'No runtime locator matched the semantic target in the requested route/state',
    candidates: attempts.map(item => ({
      strategy: item.strategy,
      locator: item.locator,
      available: item.available,
      count: item.count ?? 0,
      visible_count: item.visible_count ?? 0,
      reason: item.reason || null,
      verified: item.verified,
    })),
    verification: {
      count: 0,
      visible: false,
      actionable: false,
      url: page.url(),
    },
  };
}

function rawTestcaseById(manifest, id) {
  return (manifest.testcases || []).find(item => String(item?.testcase_id || '').trim() === id) || null;
}

function buildTargetContexts(manifest, parsed, { group, testcaseIds, targetKeys }) {
  const selected = parsed.cases.filter(item => (
    (!group || String(item.group || '').trim().toLowerCase() === group.toLowerCase())
    && (testcaseIds.length === 0 || testcaseIds.includes(item.id))
  ));
  const contexts = [];
  for (const testcase of selected) {
    const raw = rawTestcaseById(manifest, testcase.id);
    const execution = raw?.execution || {};
    let currentRoute = execution.entry?.route || '';
    const byKey = new Map();
    const add = (target, action, route, expectedVisible = true, state = '') => {
      const key = clean(target?.key, 180);
      if (!key || !(!targetKeys.length || targetKeys.includes(key))) return;
      const contextKey = `${testcase.id}::${key}`;
      const existing = byKey.get(contextKey);
      if (existing) {
        existing.actions = unique([...existing.actions, action]);
        if (!existing.target.name && target.name) existing.target.name = target.name;
        return;
      }
      const context = {
        testcase_id: testcase.id,
        feature: slug(arg('--module', testcase.group || 'selectors')),
        target_key: key,
        target: { ...target },
        route: target.route || route || '',
        role: testcase.entry?.role_key || testcase.entry?.role || 'unknown',
        state: clean(state || (Array.isArray(testcase.entry?.state) ? testcase.entry.state.join(' | ') : testcase.entry?.state), 300) || null,
        actions: [action],
        expected_visible: expectedVisible,
      };
      byKey.set(contextKey, context);
      contexts.push(context);
    };
    for (const step of execution.steps || []) {
      const action = String(step.action || '').trim().toLowerCase();
      const target = step.target || {};
      const targetRoute = target.route || currentRoute;
      if (!['navigate', 'wait'].includes(action)) add(target, action, targetRoute, true, currentRoute);
      for (const assertion of step.assertions || []) {
        if (!assertion?.target) continue;
        const assertionTarget = byKey.get(`${testcase.id}::${assertion.target}`)?.target || {
          key: assertion.target,
          kind: 'assertion',
          name: assertion.target_name || assertion.target,
        };
        add(assertionTarget, 'assert', currentRoute, String(assertion.kind || '').toLowerCase() !== 'hidden', currentRoute);
      }
      if (String(step.wait_for?.kind || '').toLowerCase() === 'url' && step.wait_for.value) {
        currentRoute = step.wait_for.value;
      }
    }
    const outcomeRoute = execution.outcome?.route || currentRoute;
    for (const assertion of execution.outcome?.assertions || []) {
      if (!assertion?.target) continue;
      const assertionTarget = byKey.get(`${testcase.id}::${assertion.target}`)?.target || {
        key: assertion.target,
        kind: 'assertion',
        name: assertion.target_name || assertion.target,
      };
      add(assertionTarget, 'assert', outcomeRoute, String(assertion.kind || '').toLowerCase() !== 'hidden', execution.outcome?.state || currentRoute);
    }
  }
  return contexts;
}

function usage() {
  console.log(`Usage: node scripts/discover-runtime-selectors.mjs --manifest <file> --group <module> --app-build <build> [options]

Required:
  --manifest <file>       Lossless .automation.json source
  --group <module>         One business module; --module is an alias
  --app-build <build>      Current application build/deployment identifier

Options:
  --testcase-id <ids>      Comma-separated bounded testcase IDs
  --target-key <keys>      Comma-separated bounded target keys
  --project-root <dir>     Automation project root (default: cwd)
  --base-url <url>         Base URL for relative routes (or UI_BASE_URL)
  --storage-state <file>   Project-local Playwright storage state
  --run-id <id>            Browser discovery run id
  --output <file>          Evidence output (default: selector-evidence/<module>.json)
  --headed                 Show the browser window
`);
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    usage();
    return;
  }
  const projectRoot = path.resolve(arg('--project-root', process.cwd()));
  const manifestPath = path.resolve(projectRoot, arg('--manifest'));
  if (!arg('--manifest') || !fs.existsSync(manifestPath)) throw new Error('BLOCKED: --manifest must point to an existing .automation.json');
  const group = arg('--group', arg('--module', '')).trim();
  const testcaseIds = arg('--testcase-id').split(',').map(clean).filter(Boolean);
  const targetKeys = arg('--target-key').split(',').map(clean).filter(Boolean);
  if (!group && testcaseIds.length === 0) throw new Error('BLOCKED: selector discovery requires --group or --testcase-id to keep the browser scope bounded');
  const appBuild = clean(arg('--app-build', process.env.QA_APP_BUILD || ''), 300);
  if (!appBuild) throw new Error('BLOCKED: --app-build is required for current-build selector evidence');
  const baseUrl = resolveBaseUrl(projectRoot);
  const parsed = parseAutomationManifest(manifestPath);
  const manifest = readJson(manifestPath);
  const contexts = buildTargetContexts(manifest, parsed, { group, testcaseIds, targetKeys });
  if (contexts.length === 0) throw new Error('BLOCKED: selector discovery selection contains no UI target keys');
  const uniqueCases = new Set(contexts.map(context => context.testcase_id));
  if (uniqueCases.size > 20) throw new Error(`BLOCKED: selector discovery selection contains ${uniqueCases.size} cases; keep it at 20 or fewer`);

  const runId = clean(arg('--run-id', process.env.RUN_ID || process.env.QA_RUN_ID || `selector-discovery-${Date.now()}`), 120);
  const outputPath = path.resolve(projectRoot, arg('--output', path.join('selector-evidence', `${slug(group || contexts[0].feature)}.json`)));
  const storageStateArg = arg('--storage-state', process.env.QA_STORAGE_STATE || '');
  const storageStatePath = storageStateArg
    ? path.resolve(projectRoot, storageStateArg)
    : undefined;
  if (storageStatePath && !fs.existsSync(storageStatePath)) throw new Error(`BLOCKED: storage state does not exist: ${storageStatePath}`);

  const capturedAt = new Date().toISOString();
  const evidence = {
    schema_version: 1,
    feature: slug(group || contexts[0].feature),
    provider: 'playwright-runtime',
    browser: 'chromium',
    captured_at: capturedAt,
    run_id: runId,
    app_build: appBuild,
    targets: [],
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: !hasArg('--headed') });
    const context = await browser.newContext(storageStatePath ? { storageState: storageStatePath } : {});
    const page = await context.newPage();
    const routeCache = new Map();
    for (const targetContext of contexts) {
      const targetRecord = {
        testcase_id: targetContext.testcase_id,
        target_key: targetContext.target_key,
        target_names: targetNames(targetContext.target),
        route: targetContext.route || null,
        role: targetContext.role,
        state: targetContext.state,
        action: actionForContext(targetContext),
        captured_at: capturedAt,
        run_id: runId,
        app_build: appBuild,
      };
      try {
        const resolvedRoute = resolveRoute(targetContext.route, baseUrl);
        if (!resolvedRoute) throw new Error('target route is missing from execution.entry or target.route');
        if (routeCache.get(resolvedRoute) !== true) {
          await page.goto(resolvedRoute, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await page.waitForFunction(() => document.readyState === 'complete', undefined, { timeout: 30_000 }).catch(() => {});
          routeCache.set(resolvedRoute, true);
        }
        if (!routeMatches(resolvedRoute, page.url())) {
          targetRecord.status = 'blocked';
          targetRecord.reason = `Access-controlled route redirected: requested ${routePath(resolvedRoute)}, final ${routePath(page.url())}`;
          targetRecord.verification = { count: 0, visible: false, actionable: false, url: page.url() };
        } else {
          const result = await discoverTarget(page, targetContext);
          Object.assign(targetRecord, result);
          targetRecord.route = routePath(page.url());
        }
      } catch (error) {
        targetRecord.status = 'blocked';
        targetRecord.reason = clean(error?.message || error, 500);
        targetRecord.verification = { count: 0, visible: false, actionable: false, url: page.url() };
      }
      evidence.targets.push(targetRecord);
    }
    await context.close();
  } catch (error) {
    evidence.status = 'blocked';
    evidence.reason = clean(error?.message || error, 500);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  evidence.status = evidence.targets.every(target => target.status === 'runtime_verified') ? 'runtime_verified' : 'blocked';
  writeJson(outputPath, evidence);
  const summary = {
    status: evidence.status === 'runtime_verified' ? 'PASS' : 'BLOCKED',
    output: outputPath,
    provider: evidence.provider,
    run_id: runId,
    targets: evidence.targets.length,
    runtime_verified: evidence.targets.filter(target => target.status === 'runtime_verified').length,
    blocked: evidence.targets.filter(target => target.status === 'blocked').length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (evidence.status !== 'runtime_verified') process.exitCode = 2;
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[selector-discovery] ${error.message}`);
    process.exitCode = 2;
  });
}

export {
  buildTargetContexts,
  candidateSpecs,
  discoverTarget,
  roleForKind,
};
