#!/usr/bin/env node

/**
 * Verify the chain:
 * testcase Markdown -> Playwright test IDs -> runtime selector evidence -> selector source
 *
 * This is an audit gate, not a locator generator. It can prove that the generated
 * code is traceable to the testcase and that a recorded runtime-verified locator
 * is present in selector code. Only a live Playwright run can prove the locator
 * still works against the current application build.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'reports',
  'test-results',
  'playwright-report',
  'allure-results',
  'allure-report',
  'sessions',
  'testdata',
]);
const ACTIONABLE_ACTIONS = new Set([
  'click',
  'fill',
  'select',
  'select_option',
  'check',
  'uncheck',
  'press',
  'hover',
  'drag',
  'upload',
]);
const SELECTOR_PRIORITY = ['testid', 'id', 'css', 'role', 'label', 'placeholder', 'text', 'xpath'];
const BROWSER_MCP_PROVIDERS = new Set(['playwright-mcp', 'chrome-devtools-mcp']);
const BROWSER_MCP_TOOLS = Object.freeze({
  'playwright-mcp': ['browser_navigate', 'browser_snapshot', 'browser_evaluate'],
  'chrome-devtools-mcp': ['navigate_page', 'take_snapshot', 'evaluate_script'],
});

function normalizeStrategy(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('testid') || normalized.includes('datatest')) return 'testid';
  if (normalized === 'id' || normalized.includes('stableid')) return 'id';
  if (normalized.includes('css')) return 'css';
  if (normalized.includes('role')) return 'role';
  if (normalized.includes('label')) return 'label';
  if (normalized.includes('placeholder')) return 'placeholder';
  if (normalized.includes('text')) return 'text';
  if (normalized.includes('xpath')) return 'xpath';
  return normalized;
}

function normalizeProvider(value) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (normalized === 'playwright' || normalized === 'playwrightmcp') return 'playwright-mcp';
  if (normalized === 'chromedevtools' || normalized === 'chromedevtoolsmcp') return 'chrome-devtools-mcp';
  return normalized;
}

function browserMcpTools(record) {
  return [...new Set([
    ...(Array.isArray(record.tools_used) ? record.tools_used : []),
    ...(Array.isArray(record.mcp?.tools_used) ? record.mcp.tools_used : []),
  ].map(value => String(value || '').trim()).filter(Boolean))];
}

function hasBrowserMcpProvenance(record) {
  const provider = normalizeProvider(record.provider);
  const required = BROWSER_MCP_TOOLS[provider] || [];
  const tools = browserMcpTools(record);
  return BROWSER_MCP_PROVIDERS.has(provider)
    && required.every(tool => tools.includes(tool))
    && Boolean(record.run_id)
    && Boolean(record.mcp?.session_id);
}

function selectorPriorityIndex(value) {
  return SELECTOR_PRIORITY.indexOf(normalizeStrategy(value));
}

function getArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

function displayPath(filePath, baseDir) {
  return path.relative(baseDir, filePath).replaceAll(path.sep, '/') || '.';
}

function moduleSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' va ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isTestcaseId(value) {
  if (!value || /^S\d+$/i.test(value) || /^(?:OUTCOME|CLEANUP)$/i.test(value)) return false;
  return /^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+$/i.test(value);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseTestcases(markdown) {
  const cases = [];
  const byId = new Map();
  let current = null;
  const duplicateIds = [];

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{5}\s+.*?\[([A-Za-z][A-Za-z0-9_-]*)\]/);
    const codeHeading = line.match(/^#{5}\s+`([A-Za-z][A-Za-z0-9_-]*)`(?:\s|$)/);
    const tableId = line.match(/^\|\s*`?([^|`]+?)`?\s*\|/);
    const candidateId = heading?.[1]
      || codeHeading?.[1]
      || (tableId && /^TC_/i.test(tableId[1].trim()) ? tableId[1].trim() : null);

    if (candidateId && isTestcaseId(candidateId)) {
      if (byId.has(candidateId)) {
        duplicateIds.push(candidateId);
      } else {
        current = {
          id: candidateId,
          target_keys: [],
          actions_by_target: {},
          structured: false,
        };
        byId.set(candidateId, current);
        cases.push(current);
      }
    }

    if (!current) continue;

    const stepRow = line.match(/^\|\s*(S\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (stepRow) {
      const stepId = stepRow[1].trim();
      const action = stepRow[2].trim();
      const targetKey = stepRow[3].trim();
      if (targetKey && !/^target key$/i.test(targetKey)) {
        current.structured = true;
        if (!current.target_keys.includes(targetKey)) current.target_keys.push(targetKey);
        current.actions_by_target[targetKey] = current.actions_by_target[targetKey] || [];
        current.actions_by_target[targetKey].push({ step_id: stepId, action });
      }
    }
  }

  return { cases, duplicateIds };
}

function selectorAssertionKind(kind) {
  return new Set([
    'visible', 'hidden', 'text', 'value', 'enabled', 'disabled', 'checked',
    'unchecked', 'count', 'attribute', 'class', 'focused', 'actionable',
  ]).has(String(kind || '').trim().toLowerCase());
}

function markerValue(value) {
  if (value === undefined || value === null || value === '') return 'N/A';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\s+/g, ' ').trim();
}

function valueFingerprint(value) {
  if (value === undefined) return null;
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function referenceList(...values) {
  return [...new Set(values.flatMap(value => (
    Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
  )).map(value => String(value || '').trim()).filter(Boolean))];
}

function pascalCase(value) {
  return String(value || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('');
}

function stepMethodName(step) {
  const action = String(step?.action || 'perform').replace(/[^A-Za-z0-9]/g, '');
  const target = step?.target?.key || step?.id || 'Step';
  return `${action}${pascalCase(target)}`;
}

function assertionMarker(testcaseId, stepId, assertion, index) {
  const oracle = assertion?.target ?? assertion?.value ?? assertion?.state ?? 'N/A';
  return `[${testcaseId}:${stepId}:ASSERT:${String(index + 1).padStart(2, '0')}] ${assertion?.kind || 'assert'} ${markerValue(oracle)}`;
}

function assertionMatcherTokens(kind) {
  const mapping = {
    visible: ['toBeVisible'], hidden: ['toBeHidden'], text: ['toHaveText', 'toContainText'],
    value: ['toHaveValue'], enabled: ['toBeEnabled'], disabled: ['toBeDisabled'],
    checked: ['toBeChecked'], unchecked: ['not.toBeChecked', 'toBeChecked'], count: ['toHaveCount'],
    attribute: ['toHaveAttribute'], class: ['toHaveClass'], focused: ['toBeFocused'],
    url: ['toHaveURL'], actionable: ['toBeEnabled'], state: ['expect('],
  };
  return mapping[String(kind || '').trim().toLowerCase()] || ['expect('];
}

function stepMarker(testcaseId, step) {
  const targetKey = step?.target?.key || 'N/A';
  const fingerprint = valueFingerprint(step?.value);
  return `[${testcaseId}:${step.id}] ${step.action} ${targetKey}${fingerprint ? ` value=${fingerprint}` : ''}`;
}

function outcomeMarker(testcaseId, assertion, index) {
  const oracle = assertion?.target ?? assertion?.value ?? assertion?.state ?? 'N/A';
  return `[${testcaseId}:OUTCOME:${String(index + 1).padStart(2, '0')}] ${assertion?.kind || 'assert'} ${markerValue(oracle)}`;
}

function parseAutomationManifest(manifestPath) {
  const parsed = JSON.parse(readText(manifestPath));
  if (parsed.schema_version !== 1 || !Array.isArray(parsed.testcases)) {
    throw new Error('automation manifest must use schema_version=1 and contain testcases[]');
  }
  const duplicateIds = [];
  const seenIds = new Set();
  const cases = parsed.testcases.map((item, index) => {
    const id = String(item.testcase_id || '').trim();
    if (!isTestcaseId(id)) throw new Error(`Invalid testcase_id in automation manifest at testcases[${index}]`);
    if (seenIds.has(id)) duplicateIds.push(id);
    seenIds.add(id);

    const execution = item.execution && typeof item.execution === 'object' ? item.execution : null;
    const steps = Array.isArray(execution?.steps) ? execution.steps : [];
    const entry = execution?.entry || {};
    const outcomeAssertions = Array.isArray(execution?.outcome?.assertions)
      ? execution.outcome.assertions
      : [];
    const targetKeys = [];
    const allTargetKeys = [];
    const actionsByTarget = {};
    const targetRoutes = {};
    const targetNamesByKey = {};
    const expectedVisibilityByTarget = {};
    const addTarget = (targetKey, action, stepId, selectorRequired, route, expectedVisible = true) => {
      const key = String(targetKey || '').trim();
      if (!key) return;
      if (!allTargetKeys.includes(key)) allTargetKeys.push(key);
      if (selectorRequired && !targetKeys.includes(key)) targetKeys.push(key);
      actionsByTarget[key] = actionsByTarget[key] || [];
      actionsByTarget[key].push({ step_id: stepId, action });
      if (selectorRequired && route && !targetRoutes[key]) targetRoutes[key] = route;
      if (selectorRequired) {
        if (expectedVisibilityByTarget[key] === undefined) expectedVisibilityByTarget[key] = expectedVisible;
        else if (expectedVisibilityByTarget[key] !== expectedVisible) expectedVisibilityByTarget[key] = 'state_dependent';
      }
    };

    let currentRoute = entry.route || null;
    for (const step of steps) {
      const action = String(step.action || '').trim().toLowerCase();
      const targetKey = step?.target?.key;
      const targetRoute = step?.target?.route || currentRoute;
      addTarget(targetKey, action, step.id, !['navigate', 'wait'].includes(action), targetRoute);
      if (targetKey && step?.target?.name) {
        targetNamesByKey[targetKey] = targetNamesByKey[targetKey] || [];
        if (!targetNamesByKey[targetKey].includes(step.target.name)) targetNamesByKey[targetKey].push(step.target.name);
      }
      const transitionRoute = String(step?.wait_for?.kind || '').toLowerCase() === 'url'
        ? step.wait_for.value || currentRoute
        : currentRoute;
      for (const assertion of step.assertions || []) {
        if (assertion?.target && selectorAssertionKind(assertion.kind)) {
          addTarget(assertion.target, 'assert', `${step.id}:assert`, true, transitionRoute, String(assertion.kind).toLowerCase() !== 'hidden');
        }
      }
      if (step?.wait_for?.target && selectorAssertionKind(step.wait_for.kind)) {
        addTarget(step.wait_for.target, 'wait', `${step.id}:wait`, true, transitionRoute, String(step.wait_for.kind).toLowerCase() !== 'hidden');
      }
      currentRoute = transitionRoute;
    }
    const outcomeRoute = execution?.outcome?.route || currentRoute;
    for (let assertionIndex = 0; assertionIndex < outcomeAssertions.length; assertionIndex += 1) {
      const assertion = outcomeAssertions[assertionIndex];
      if (assertion?.target && selectorAssertionKind(assertion.kind)) {
        addTarget(assertion.target, 'assert', `OUTCOME:${assertionIndex + 1}`, true, outcomeRoute, String(assertion.kind).toLowerCase() !== 'hidden');
      }
    }

    const rbacRefs = Array.isArray(entry.rbac_refs) ? entry.rbac_refs.map(String) : [];
    const uiFunctionKeys = referenceList(
      item.ui_function_keys,
      item.coverage_refs,
      execution?.ui_function_keys,
      execution?.coverage_refs,
    );
    return {
      id,
      group: item.group || null,
      scenario_id: item.scenario_id || null,
      scenario_name: item.scenario_name || null,
      case_ref: item.case_ref || null,
      type: item.type || null,
      bb_technique: item.bb_technique || null,
      requirement: item.requirement || null,
      priority: item.priority || null,
      entry,
      role_key: entry.role_key || null,
      rbac_refs: rbacRefs,
      steps,
      outcome_assertions: outcomeAssertions,
      cleanup: execution?.cleanup ?? null,
      mutates: execution?.mutates === true,
      ui_function_keys: uiFunctionKeys,
      target_keys: targetKeys,
      all_target_keys: allTargetKeys,
      actions_by_target: actionsByTarget,
      target_routes: targetRoutes,
      target_names_by_key: targetNamesByKey,
      expected_visibility_by_target: expectedVisibilityByTarget,
      structured: Boolean(execution && steps.length > 0),
      required_markers: {
        steps: steps.map(step => stepMarker(id, step)),
        step_assertions: steps.map(step => (
          (step.assertions || []).map((assertion, assertionIndex) => (
            assertionMarker(id, step.id, assertion, assertionIndex)
          ))
        )),
        outcomes: outcomeAssertions.map((assertion, outcomeIndex) => outcomeMarker(id, assertion, outcomeIndex)),
        role: entry.role_key ? `[${id}:ROLE] ${entry.role_key}` : null,
        rbac: rbacRefs.map(ref => `[${id}:RBAC] ${ref}`),
        cleanup: execution?.cleanup != null || execution?.mutates === true ? `[${id}:CLEANUP]` : null,
      },
    };
  });
  return { cases, duplicateIds, raw: parsed };
}

function walkFiles(rootDir, predicate = () => true) {
  if (!fs.existsSync(rootDir)) return [];
  const output = [];
  const queue = [rootDir];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (predicate(fullPath)) output.push(fullPath);
    }
  }
  return output.sort();
}

function codeFiles(rootDir) {
  return walkFiles(rootDir, filePath => CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
}

function specFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => (
    /(?:\.(?:spec|test)\.)[cm]?[jt]sx?$/.test(filePath)
    || /(^|[/\\])tests?[/\\]/.test(filePath)
  ));
}

function selectorFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => /(^|[/\\])selectors?[/\\]/.test(filePath));
}

function pageFiles(rootDir) {
  return codeFiles(rootDir).filter(filePath => /(^|[/\\])pages?[/\\]/.test(filePath));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactCode(value) {
  return String(value || '').replace(/\s+/g, '');
}

function locatorAppearsInSource(locator, source) {
  const compactLocator = compactCode(locator);
  if (!compactLocator) return false;
  const compactSource = compactCode(source);
  const variants = new Set([
    compactLocator,
    compactLocator.replace(/^this\.page\./, ''),
    compactLocator.replace(/^page\./, ''),
    `page.${compactLocator}`,
    `this.page.${compactLocator}`,
  ]);
  return [...variants].some(candidate => compactSource.includes(candidate));
}

function selectorObjectBlock(targetKey, source) {
  const keyPattern = new RegExp(`([\"'])${escapeRegExp(targetKey)}\\1\\s*:\\s*\\{`);
  const match = keyPattern.exec(source);
  if (!match) return '';
  const openIndex = source.indexOf('{', match.index);
  if (openIndex < 0) return '';

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '\"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return '';
}

function quotedLocatorValues(locator) {
  const values = [];
  const source = String(locator || '');
  const pattern = /(['\"])(.*?)\1/g;
  let match;
  while ((match = pattern.exec(source))) {
    const value = match[2].replaceAll(String.fromCharCode(92), '').trim();
    if (value) values.push(value);
  }
  return values;
}

function selectorDefinitionAppearsInSource(record, source) {
  const block = selectorObjectBlock(record.target_key, source);
  if (!block) return false;
  const normalizedBlock = compactCode(block).replaceAll(String.fromCharCode(92), '').toLowerCase();
  const strategy = normalizeStrategy(record.strategy);
  if (strategy && !normalizedBlock.includes(`\"strategy\":\"${strategy}\"`)
    && !normalizedBlock.includes(`'strategy':'${strategy}'`)) {
    return false;
  }

  const locator = String(record.locator || '');
  const directLocator = compactCode(locator).replaceAll(String.fromCharCode(92), '').toLowerCase();
  if (directLocator && normalizedBlock.includes(directLocator)) return true;

  const quotedValues = quotedLocatorValues(locator)
    .map(value => compactCode(value).replaceAll(String.fromCharCode(92), '').toLowerCase())
    .filter(value => value.length > 1);
  if (quotedValues.length > 0 && quotedValues.every(value => normalizedBlock.includes(value))) return true;

  const targetNames = Array.isArray(record.target_names)
    ? record.target_names
    : record.target_name
      ? [record.target_name]
      : [];
  return targetNames.some(value => {
    const normalized = compactCode(value).replaceAll(String.fromCharCode(92), '').toLowerCase();
    return normalized.length > 1 && normalizedBlock.includes(normalized);
  });
}

function parseSelectorEvidence(evidenceDir) {
  const files = walkFiles(evidenceDir, filePath => path.extname(filePath).toLowerCase() === '.json');
  const records = [];
  const parseErrors = [];

  for (const filePath of files) {
    try {
      const parsed = JSON.parse(readText(filePath));
      const targets = Array.isArray(parsed.targets)
        ? parsed.targets
        : parsed.target_key
          ? [parsed]
          : [];
      for (const target of targets) {
          if (target?.target_key) {
            records.push({
              ...target,
            feature: target.feature ?? parsed.feature ?? path.basename(filePath, path.extname(filePath)),
            route: target.route ?? parsed.route,
            role: target.role ?? parsed.role,
            locale: target.locale ?? parsed.locale,
            state: target.state ?? parsed.state,
            captured_at: target.captured_at ?? parsed.captured_at,
            run_id: target.run_id ?? parsed.run_id,
            app_build: target.app_build ?? parsed.app_build,
            provider: target.provider ?? parsed.provider,
            browser_driver: target.browser_driver ?? parsed.browser_driver,
            browser_observer: target.browser_observer ?? parsed.browser_observer,
            tools_used: target.tools_used ?? parsed.tools_used,
            mcp: target.mcp ?? parsed.mcp,
            evidence_file: filePath,
          });
        }
      }
    } catch (error) {
      parseErrors.push({
        file: filePath,
        message: `Invalid selector evidence JSON: ${error.message}`,
      });
    }
  }

  return { files, records, parseErrors };
}

function readTokenUsage(filePath) {
  const fields = [
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
    'latency_ms',
    'cost_usd',
    'request_count',
  ];
  const result = {
    measurement: 'not_available',
    source_file: filePath || null,
    note: 'Exact model usage is available only when the host/provider writes a usage file',
  };
  if (!filePath || !fs.existsSync(filePath)) return result;

  try {
    const parsed = JSON.parse(readText(filePath));
    const stages = Array.isArray(parsed.stages)
      ? parsed.stages
      : parsed.stages && typeof parsed.stages === 'object'
        ? Object.entries(parsed.stages).map(([stage, usage]) => ({ stage, ...usage }))
        : [];
    if (stages.length > 0) {
      for (const field of fields) {
        const values = stages.map(stage => Number(stage[field])).filter(value => Number.isFinite(value) && value >= 0);
        if (values.length > 0) result[field] = values.reduce((sum, value) => sum + value, 0);
      }
    }
    for (const field of fields) {
      const value = Number(parsed[field]);
      if (Number.isFinite(value) && value >= 0) result[field] = value;
    }
    if (result.total_tokens === undefined
      && (result.input_tokens !== undefined || result.output_tokens !== undefined)) {
      result.total_tokens = (result.input_tokens || 0) + (result.output_tokens || 0);
    }
    if (result.total_tokens === undefined) return result;
    return {
      measurement: 'provider_reported',
      source_file: filePath,
      provider: String(parsed.provider || parsed.host || 'unknown'),
      model: String(parsed.model || 'unknown'),
      recorded_at: parsed.recorded_at || null,
      stages: stages.map(stage => ({
        stage: String(stage.stage || 'unknown'),
        ...Object.fromEntries(fields.filter(field => Number.isFinite(Number(stage[field]))).map(field => [field, Number(stage[field])])),
      })),
      ...Object.fromEntries(fields.filter(field => result[field] !== undefined).map(field => [field, result[field]])),
    };
  } catch (error) {
    return {
      ...result,
      note: `Usage file could not be read: ${error.message}`,
    };
  }
}

function addViolation(violations, code, message, details = {}) {
  violations.push({ code, message, ...details });
}

function testDeclarationEvidence(content, testcaseId) {
  const id = escapeRegExp(testcaseId);
  return new RegExp(`\\btest\\s*\\([\\s\\S]{0,600}?${id}`).test(content)
    || new RegExp(`\\ballure\\.tms\\s*\\([\\s\\S]{0,200}?${id}`).test(content)
    || new RegExp(`\\b(?:tcId|testCaseId)\\s*:\\s*['\"\`]${id}['\"\`]`).test(content);
}

function testcaseImplementationSlice(content, testcaseId) {
  const idIndex = content.indexOf(testcaseId);
  if (idIndex < 0) return '';
  const declarationIndex = content.lastIndexOf('test(', idIndex);
  const start = declarationIndex >= 0 ? declarationIndex : idIndex;
  const tail = content.slice(idIndex + testcaseId.length);
  const nextMatch = /\n\s*test\s*\(/.exec(tail);
  const nextDeclaration = nextMatch
    ? idIndex + testcaseId.length + nextMatch.index
    : content.length;
  return content.slice(start, nextDeclaration);
}

function markerExecutionEvidence(implementationText, marker, nextMarkers = [], options = {}) {
  const markerIndex = implementationText.indexOf(marker);
  if (markerIndex < 0) return false;
  let end = implementationText.length;
  for (const nextMarker of nextMarkers) {
    const nextIndex = implementationText.indexOf(nextMarker, markerIndex + marker.length);
    if (nextIndex >= 0 && nextIndex < end) end = nextIndex;
  }
  const body = implementationText.slice(markerIndex + marker.length, end);
  const hasPomAction = /\bawait\s+(?!test\.step\b)[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\(/.test(body);
  const hasAssertion = /\b(?:await\s+)?expect\s*\(/.test(body);
  if (options.kind === 'assertion' || options.kind === 'outcome') {
    if (!hasAssertion) return false;
    return assertionMatcherTokens(options.assertion?.kind).some(token => body.includes(token));
  }
  if (options.kind === 'cleanup') {
    return /\.cleanup\s*\(/.test(body);
  }
  const requiredMethod = options.requiredMethod;
  if (!requiredMethod) return hasPomAction || hasAssertion;
  const methodPattern = new RegExp(`\\.${escapeRegExp(requiredMethod)}\\s*\\(`);
  if (!hasPomAction || !methodPattern.test(body)) return false;
  const value = options.step?.value;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    if (body.includes(String(value))) return true;
    // Runtime data such as generated email addresses is intentionally passed
    // through a fixture variable/helper. The testcase marker contains a
    // fingerprint, so requiring that hash as a source literal rejects valid
    // generated POM code.
    const runtimeArgument = new RegExp(
      `\\.${escapeRegExp(requiredMethod)}\\s*\\(\\s*`
      + `[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*(?:\\([^)]*\\))?`,
    );
    return runtimeArgument.test(body);
  }
  return true;
}

function pageMethodActionEvidence(files, methodName, action) {
  const primitivePatterns = {
    navigate: /\.(?:goto|navigate|navigateTo|open|visit)\s*\(/,
    click: /\.click\s*\(/,
    fill: /\.(?:fill|type)\s*\(/,
    clear: /\.clear\s*\(/,
    // A manual "select" step can target either a native <select> or a
    // radio control represented by a checked option in the Page Object
    // Model.
    select: /\.(?:selectOption|selectOptionByLabel|select|check)\s*\(/,
    select_option: /\.(?:selectOption|selectOptionByLabel)\s*\(/,
    check: /\.check\s*\(/,
    uncheck: /\.uncheck\s*\(/,
    press: /\.press\s*\(/,
    upload: /\.(?:setInputFiles|upload)\s*\(/,
    hover: /\.hover\s*\(/,
    drag: /\.dragTo\s*\(/,
    wait: /\.wait(?:For[A-Za-z0-9_]*)?\s*\(/,
    observe: /\.(?:textContent|inputValue|isVisible|count)\s*\(/,
    assert: /\bexpect\s*\(/,
  };
  const primitive = primitivePatterns[String(action || '').toLowerCase()];
  if (!primitive) return true;
  const methodPattern = new RegExp(`(?:async\\s+)?${escapeRegExp(methodName)}\\s*\\([^)]*\\)[^{]*\\{`, 'm');
  return files.some(filePath => {
    const source = readText(filePath);
    const match = methodPattern.exec(source);
    if (!match) return false;
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 1200);
    const nextMethod = /\n\s*(?:async\s+|get\s+|set\s+)[A-Za-z_$]/.exec(tail);
    const body = nextMethod ? tail.slice(0, nextMethod.index) : tail;
    return primitive.test(body);
  });
}

function normalizedRoute(value) {
  const rendered = String(value || '').trim();
  if (!rendered) return '';
  try {
    const pathname = new URL(rendered.replace('<BASE_URL>', 'https://qa.invalid')).pathname;
    return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
  } catch {
    const placeholderRemoved = rendered.replace(/^<[^>]+>/, '');
    const route = placeholderRemoved.startsWith('/') ? placeholderRemoved : rendered;
    return route === '/' ? route : route.replace(/\/+$/, '');
  }
}

function evidenceMatchesCase(record, testcase, targetKey) {
  const evidenceTestcaseId = String(record.testcase_id || '').trim();
  if (evidenceTestcaseId && evidenceTestcaseId !== testcase.id) return false;
  const expectedFeature = moduleSlug(testcase.group);
  const evidenceFeature = moduleSlug(record.feature || path.basename(record.evidence_file || '', '.json'));
  const hasTargetSpecificRoute = Boolean(testcase.target_routes?.[targetKey]);
  if (expectedFeature && evidenceFeature
    && evidenceFeature !== expectedFeature
    && evidenceFeature !== `${expectedFeature}-list`
    && !hasTargetSpecificRoute) return false;
  const expectedRoute = normalizedRoute(testcase.target_routes?.[targetKey] || testcase.entry?.route);
  const evidenceRoute = normalizedRoute(record.route);
  if (expectedRoute && evidenceRoute && expectedRoute !== evidenceRoute) {
    const nestedState = String(record.state || '');
    const nestedSegment = evidenceRoute.slice(`${expectedRoute}/`.length).split('/')[0] || '';
    const resourceSegment = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(nestedSegment)
      || /^[0-9]{1,12}$/.test(nestedSegment)
      || /^[a-z0-9_-]{20,}$/i.test(nestedSegment);
    const isNestedRuntimeState = evidenceRoute.startsWith(`${expectedRoute}/`)
      && nestedState.length > 0
      && !nestedState.startsWith('route:')
      && resourceSegment;
    if (!isNestedRuntimeState) return false;
  }
  const expectedRoles = new Set([
    String(testcase.entry?.role || '').trim().toLowerCase(),
    String(testcase.role_key || '').trim().toLowerCase(),
  ].filter(Boolean));
  const evidenceRole = String(record.role || '').trim().toLowerCase();
  const publicRoute = expectedRoute === '/login' || expectedRoute === '/register';
  const unauthenticatedPublicEvidence = publicRoute && evidenceRole === 'unauthenticated';
  if (evidenceRole && expectedRoles.size > 0 && !expectedRoles.has(evidenceRole) && !unauthenticatedPublicEvidence) return false;
  const expectedNames = (testcase.target_names_by_key?.[targetKey] || [])
    .map(value => String(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  const evidenceNames = [
    ...(Array.isArray(record.target_names) ? record.target_names : []),
    record.target_name,
  ]
    .map(value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  if (!evidenceTestcaseId && expectedNames.length > 0 && evidenceNames.length > 0
    && !expectedNames.some(expected => evidenceNames.some(actual => actual === expected || actual.includes(expected) || expected.includes(actual)))) {
    return false;
  }
  return true;
}

function uniqueSelectorRecords(records) {
  const unique = new Map();
  for (const record of records) {
    const key = JSON.stringify([
      record.testcase_id || '',
      record.target_key || '',
      normalizedRoute(record.route),
      record.state || '',
      record.run_id || '',
      record.status || '',
      record.locator || '',
    ]);
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function relativeList(files, baseDir) {
  return files.map(filePath => displayPath(filePath, baseDir));
}

function buildTraceability({
  testcasePath,
  manifestPath,
  automationRoot,
  evidenceDir,
  tokenUsagePath,
  expectedAppBuild = '',
  maxEvidenceAgeHours = 168,
  testcaseIds = [],
  requireBrowserMcp = false,
  mode = 'ui',
}) {
  const markdown = readText(testcasePath);
  const markdownCases = parseTestcases(markdown);
  let manifestCases = null;
  const violations = [];
  if (manifestPath) {
    try {
      manifestCases = parseAutomationManifest(manifestPath);
    } catch (error) {
      addViolation(violations, 'AUTOMATION_MANIFEST_INVALID', error.message, {
        file: displayPath(manifestPath, automationRoot),
      });
    }
  } else if (mode === 'ui') {
    addViolation(
      violations,
      'AUTOMATION_MANIFEST_MISSING',
      'UI automation requires the lossless .automation.json companion; Markdown alone is not a machine-safe source',
    );
  }
  const parsedCases = manifestCases || markdownCases;
  const requestedTestcaseIds = [...new Set(testcaseIds.map(value => String(value).trim()).filter(Boolean))];
  const knownTestcaseIds = new Set(parsedCases.cases.map(testcase => testcase.id));
  const unknownTestcaseIds = requestedTestcaseIds.filter(testcaseId => !knownTestcaseIds.has(testcaseId));
  for (const testcaseId of unknownTestcaseIds) {
    addViolation(violations, 'TESTCASE_SCOPE_ID_UNKNOWN', `Không tìm thấy Testcase ID trong scope traceability: ${testcaseId}`, {
      testcase_id: testcaseId,
    });
  }
  const cases = requestedTestcaseIds.length > 0
    ? parsedCases.cases.filter(testcase => requestedTestcaseIds.includes(testcase.id))
    : parsedCases.cases;
  const specs = specFiles(automationRoot);
  const selectors = selectorFiles(automationRoot);
  const pages = pageFiles(automationRoot);
  const selectorEvidence = parseSelectorEvidence(evidenceDir);
  const sourceHash = sha256(testcasePath);
  const manifestHash = manifestPath && fs.existsSync(manifestPath) ? sha256(manifestPath) : null;
  violations.push(...selectorEvidence.parseErrors.map(error => ({
    code: 'SELECTOR_EVIDENCE_INVALID_JSON',
    message: error.message,
    file: displayPath(error.file, automationRoot),
  })));

  if (manifestCases) {
    const markdownIds = markdownCases.cases.map(testcase => testcase.id);
    const manifestIds = manifestCases.cases.map(testcase => testcase.id);
    if (JSON.stringify(markdownIds) !== JSON.stringify(manifestIds)) {
      addViolation(violations, 'MARKDOWN_MANIFEST_ID_MISMATCH', 'Markdown và automation manifest không có cùng Testcase ID/order', {
        markdown_ids: markdownIds,
        manifest_ids: manifestIds,
      });
    }
    const recordedMarkdownHash = manifestCases.raw?.source?.markdown_sha256;
    if (recordedMarkdownHash !== sourceHash) {
      addViolation(violations, 'MARKDOWN_MANIFEST_HASH_MISMATCH', 'Automation manifest không khớp Markdown source hiện tại', {
        expected: recordedMarkdownHash || null,
        actual: sourceHash,
      });
    }
  }

  for (const duplicateId of parsedCases.duplicateIds) {
    addViolation(violations, 'DUPLICATE_TESTCASE_ID', `Testcase ID xuất hiện nhiều lần: ${duplicateId}`, {
      testcase_id: duplicateId,
    });
  }
  if (cases.length === 0) {
    addViolation(violations, 'NO_TESTCASES_FOUND', 'Không tìm thấy Testcase ID trong Markdown source');
  }

  const selectorCoverage = new Map();
  const selectorRecordsByKey = new Map();
  for (const record of selectorEvidence.records) {
    const list = selectorRecordsByKey.get(record.target_key) || [];
    list.push(record);
    selectorRecordsByKey.set(record.target_key, list);
  }

  const testcaseResults = cases.map(testcase => {
    const matchedSpecFiles = specs.filter(filePath => readText(filePath).includes(testcase.id));
    const declarationFiles = matchedSpecFiles.filter(filePath => testDeclarationEvidence(readText(filePath), testcase.id));
    if (matchedSpecFiles.length === 0) {
      addViolation(violations, 'TESTCASE_NOT_IN_SPEC', `Không tìm thấy ${testcase.id} trong spec automation`, {
        testcase_id: testcase.id,
      });
    } else if (declarationFiles.length === 0) {
      addViolation(violations, 'TESTCASE_ID_NOT_DECLARED', `${testcase.id} có trong code nhưng chưa thấy test declaration/TMS mapping`, {
        testcase_id: testcase.id,
        spec_files: relativeList(matchedSpecFiles, automationRoot),
      });
    }

    const implementationSlices = declarationFiles.map(filePath => (
      testcaseImplementationSlice(readText(filePath), testcase.id)
    ));
    const implementationText = implementationSlices.join('\n');
    const implementationMarkers = [];
    if (manifestCases && declarationFiles.length > 0) {
      const sourceMarker = `[AUTOMATION_SOURCE:${manifestHash}]`;
      if (!declarationFiles.some(filePath => readText(filePath).includes(sourceMarker))) {
        addViolation(violations, 'AUTOMATION_SOURCE_HASH_MISSING', `${testcase.id} chưa gắn source hash của automation manifest`, {
          testcase_id: testcase.id,
          required_marker: sourceMarker,
        });
      }
      if (!/\b(?:await|expect\s*\()/.test(implementationText)) {
        addViolation(violations, 'EMPTY_TEST_IMPLEMENTATION', `${testcase.id} có test declaration nhưng chưa có action/assertion thực thi`, {
          testcase_id: testcase.id,
        });
      }
      const requiredMarkers = [
        ...(testcase.required_markers?.steps || []),
        ...(testcase.required_markers?.step_assertions || []).flat(),
        ...(testcase.required_markers?.outcomes || []),
        ...(testcase.required_markers?.role ? [testcase.required_markers.role] : []),
        ...(testcase.required_markers?.rbac || []),
        ...(testcase.required_markers?.cleanup ? [testcase.required_markers.cleanup] : []),
      ];
      for (const marker of requiredMarkers) {
        const present = implementationText.includes(marker);
        implementationMarkers.push({ marker, present });
        if (!present) {
          addViolation(violations, 'IMPLEMENTATION_MARKER_MISSING', `${testcase.id} thiếu mapping bắt buộc: ${marker}`, {
            testcase_id: testcase.id,
            marker,
          });
        }
      }
      const executableMarkers = [
        ...(testcase.required_markers?.steps || []).map((marker, stepIndex) => ({
          marker,
          kind: 'step',
          step: testcase.steps[stepIndex],
          requiredMethod: stepMethodName(testcase.steps[stepIndex]),
        })),
        ...(testcase.required_markers?.step_assertions || []).flatMap((markers, stepIndex) => (
          markers.map((marker, assertionIndex) => ({
            marker,
            kind: 'assertion',
            assertion: testcase.steps[stepIndex]?.assertions?.[assertionIndex],
          }))
        )),
        ...(testcase.required_markers?.outcomes || []).map((marker, assertionIndex) => ({
          marker,
          kind: 'outcome',
          assertion: testcase.outcome_assertions[assertionIndex],
        })),
        ...(testcase.required_markers?.cleanup
          ? [{ marker: testcase.required_markers.cleanup, kind: 'cleanup' }]
          : []),
      ];
      for (const [index, item] of executableMarkers.entries()) {
        if (!implementationText.includes(item.marker)) continue;
        const followingMarkers = executableMarkers.slice(index + 1).map(entry => entry.marker);
        if (!markerExecutionEvidence(implementationText, item.marker, followingMarkers, item)) {
          const violationCode = item.kind === 'step'
            ? 'IMPLEMENTATION_ACTION_MISMATCH'
            : item.kind === 'cleanup'
              ? 'IMPLEMENTATION_CLEANUP_MISMATCH'
              : 'IMPLEMENTATION_ASSERTION_MISMATCH';
          addViolation(violations, violationCode, `${testcase.id} có marker nhưng implementation không khớp action/assertion bắt buộc: ${item.marker}`, {
            testcase_id: testcase.id,
            marker: item.marker,
            required_method: item.requiredMethod || null,
            required_matchers: item.assertion ? assertionMatcherTokens(item.assertion.kind) : null,
          });
        }
        if (item.kind === 'step' && !pageMethodActionEvidence(
          pages,
          item.requiredMethod,
          item.step?.action,
        )) {
          addViolation(violations, 'PAGE_METHOD_ACTION_MISMATCH', `${item.requiredMethod} không chứa Playwright action phù hợp với ${item.step?.action}`, {
            testcase_id: testcase.id,
            marker: item.marker,
            required_method: item.requiredMethod,
            action: item.step?.action || null,
          });
        }
      }
    }

    if (mode === 'ui') {
      if (!testcase.structured) {
        addViolation(violations, 'LEGACY_TEXT_ONLY', `${testcase.id} chưa có execution contract`, {
          testcase_id: testcase.id,
        });
      }

      for (const targetKey of testcase.target_keys) {
        const coverageKey = manifestCases ? `${testcase.id}::${targetKey}` : targetKey;
        if (selectorCoverage.has(coverageKey)) continue;
        const allRecords = selectorRecordsByKey.get(targetKey) || [];
        const records = uniqueSelectorRecords(manifestCases
          ? allRecords.filter(record => evidenceMatchesCase(record, testcase, targetKey))
          : allRecords);
        const record = records[0] || null;
        const action = testcase.actions_by_target[targetKey]?.[0]?.action || null;
        const requiresActionable = ACTIONABLE_ACTIONS.has(action);
        const expectedVisible = testcase.expected_visibility_by_target?.[targetKey] ?? true;
        const targetResult = {
          testcase_id: testcase.id,
          target_key: targetKey,
          route: testcase.target_routes?.[targetKey] || testcase.entry?.route || null,
          role_key: testcase.role_key || null,
          action,
          expected_visible: expectedVisible,
          status: record?.status || 'missing',
          evidence_file: record ? displayPath(record.evidence_file, automationRoot) : null,
          strategy: record?.strategy || null,
          locator: record?.locator || null,
          candidates: Array.isArray(record?.candidates) ? record.candidates : null,
          verification: record?.verification || null,
          captured_at: record?.captured_at || null,
          run_id: record?.run_id || null,
          app_build: record?.app_build || null,
          provider: record?.provider || null,
          browser_driver: record?.browser_driver || null,
          browser_observer: record?.browser_observer || null,
          tools_used: record?.tools_used || null,
          mcp: record?.mcp || null,
          selector_files: [],
        };

        if (!record) {
          addViolation(violations, 'SELECTOR_EVIDENCE_MISSING', `Chưa có selector evidence cho target key ${targetKey}`, {
            testcase_id: testcase.id,
            target_key: targetKey,
          });
        } else {
          const capturedAtMs = Date.parse(record.captured_at || '');
          const evidenceAgeHours = Number.isFinite(capturedAtMs)
            ? (Date.now() - capturedAtMs) / 3_600_000
            : Number.POSITIVE_INFINITY;
          if (!record.captured_at || !Number.isFinite(capturedAtMs)) {
            addViolation(violations, 'SELECTOR_CAPTURE_TIME_MISSING', `Evidence của ${targetKey} thiếu captured_at ISO-8601`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          } else if (Number.isFinite(maxEvidenceAgeHours) && evidenceAgeHours > maxEvidenceAgeHours) {
            addViolation(violations, 'SELECTOR_EVIDENCE_STALE', `Evidence của ${targetKey} đã quá ${maxEvidenceAgeHours} giờ`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              captured_at: record.captured_at,
              age_hours: Number(evidenceAgeHours.toFixed(2)),
            });
          }
          if (!record.run_id) {
            addViolation(violations, 'SELECTOR_RUN_ID_MISSING', `Evidence của ${targetKey} thiếu browser run_id`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (!record.app_build) {
            addViolation(violations, 'SELECTOR_APP_BUILD_MISSING', `Evidence của ${targetKey} thiếu app_build`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          } else if (expectedAppBuild && record.app_build !== expectedAppBuild) {
            addViolation(violations, 'SELECTOR_APP_BUILD_MISMATCH', `Evidence của ${targetKey} thuộc build khác`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              expected_app_build: expectedAppBuild,
              evidence_app_build: record.app_build,
            });
          }
          if (records.length > 1) {
            addViolation(violations, 'SELECTOR_EVIDENCE_DUPLICATE', `Có nhiều selector evidence cho target key ${targetKey}; cần route/state mapping rõ ràng`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              evidence_files: records.map(item => displayPath(item.evidence_file, automationRoot)),
            });
          }
          if (record.status !== 'runtime_verified') {
            addViolation(violations, 'SELECTOR_NOT_RUNTIME_VERIFIED', `Selector ${targetKey} có status=${record.status}, chưa runtime_verified`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              evidence_file: displayPath(record.evidence_file, automationRoot),
            });
          }
          const verification = record.verification || {};
          if (Number(verification.count) !== 1) {
            addViolation(violations, 'SELECTOR_COUNT_NOT_ONE', `Selector ${targetKey} chưa chứng minh count=1`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (expectedVisible === true && verification.visible !== true) {
            addViolation(violations, 'SELECTOR_NOT_VISIBLE', `Selector ${targetKey} chưa chứng minh visible=true theo expected result`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (expectedVisible === false && verification.visible !== false) {
            addViolation(violations, 'SELECTOR_NOT_HIDDEN', `Selector ${targetKey} chưa chứng minh visible=false cho assertion hidden`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (expectedVisible === 'state_dependent' && !record.state) {
            addViolation(violations, 'SELECTOR_STATE_EVIDENCE_MISSING', `Selector ${targetKey} có visibility thay đổi theo flow; evidence phải ghi state cụ thể`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (requiresActionable && verification.actionable !== true) {
            addViolation(violations, 'SELECTOR_NOT_ACTIONABLE', `Selector ${targetKey} cần actionable=true cho action=${action}`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          const locatorText = `${record.strategy || ''} ${record.locator || ''}`;
          const usesXPath = /xpath|\/html\/|locator\s*\(\s*['"`]\/\//i.test(locatorText);
          if (usesXPath && !record.reason) {
            addViolation(violations, 'XPATH_REASON_MISSING', `XPath của ${targetKey} thiếu reason vì sao semantic locator không dùng được`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (!record.locator) {
            addViolation(violations, 'SELECTOR_LOCATOR_MISSING', `Evidence của ${targetKey} chưa ghi locator expression`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (!record.route) {
            addViolation(violations, 'SELECTOR_ROUTE_MISSING', `Evidence của ${targetKey} chưa ghi route đã verify`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
          if (requireBrowserMcp && !hasBrowserMcpProvenance(record)) {
            addViolation(violations, 'SELECTOR_BROWSER_MCP_PROVENANCE_MISSING', `Evidence của ${targetKey} thiếu Browser MCP provider/tool provenance`, {
              testcase_id: testcase.id,
              target_key: targetKey,
              provider: record.provider || null,
              tools_used: browserMcpTools(record),
            });
          }
          if (record.status === 'runtime_verified') {
            const candidates = Array.isArray(record.candidates) ? record.candidates : [];
            if (candidates.length === 0) {
              addViolation(violations, 'SELECTOR_PRIORITY_EVIDENCE_MISSING', `Evidence của ${targetKey} chưa ghi ordered candidates theo testid → id → CSS → semantic → XPath`, {
                testcase_id: testcase.id,
                target_key: targetKey,
              });
            } else {
              if (normalizeStrategy(candidates[0]?.strategy) !== 'testid') {
                addViolation(violations, 'SELECTOR_TESTID_CANDIDATE_MISSING', `Ordered candidates của ${targetKey} phải bắt đầu bằng testid, kể cả khi available=false`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              }
              const available = candidates.filter(candidate => candidate?.available === true);
              const firstAvailable = available[0];
              const selectedStrategy = normalizeStrategy(record.strategy);
              const firstAvailableStrategy = normalizeStrategy(firstAvailable?.strategy);
              const candidateIndexes = candidates
                .map(candidate => selectorPriorityIndex(candidate?.strategy))
                .filter(index => index >= 0);
              if (candidateIndexes.some((index, indexPosition) => indexPosition > 0 && index < candidateIndexes[indexPosition - 1])) {
                addViolation(violations, 'SELECTOR_PRIORITY_ORDER_INVALID', `Ordered candidates của ${targetKey} không theo testid → id → CSS → semantic → XPath`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              }
              if (!firstAvailable) {
                addViolation(violations, 'SELECTOR_PRIORITY_NO_AVAILABLE_CANDIDATE', `Evidence của ${targetKey} không có candidate nào available=true`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                });
              } else if (selectedStrategy !== firstAvailableStrategy) {
                addViolation(violations, 'SELECTOR_PRIORITY_MISMATCH', `Selector ${targetKey} chọn ${record.strategy} nhưng candidate ưu tiên đầu tiên là ${firstAvailable.strategy}`, {
                  testcase_id: testcase.id,
                  target_key: targetKey,
                  selected_strategy: record.strategy,
                  expected_strategy: firstAvailable.strategy,
                });
              }
            }
          }
        }

        if (record?.locator) {
          targetResult.selector_files = selectors
            .filter(filePath => {
              const source = readText(filePath);
              return locatorAppearsInSource(record.locator, source)
                || selectorDefinitionAppearsInSource(record, source);
            })
            .map(filePath => displayPath(filePath, automationRoot));
          if (targetResult.selector_files.length === 0) {
            addViolation(violations, 'SELECTOR_NOT_IN_CODE', `Locator evidence của ${targetKey} không xuất hiện trong selectors/`, {
              testcase_id: testcase.id,
              target_key: targetKey,
            });
          }
        }
        selectorCoverage.set(coverageKey, targetResult);
      }
    }

    return {
      testcase_id: testcase.id,
      structured_execution_contract: testcase.structured,
      target_keys: testcase.target_keys,
      all_target_keys: testcase.all_target_keys || testcase.target_keys,
      role_key: testcase.role_key || null,
      rbac_refs: testcase.rbac_refs || [],
      implementation_markers: implementationMarkers,
      matched_spec_files: relativeList(matchedSpecFiles, automationRoot),
      declaration_files: relativeList(declarationFiles, automationRoot),
    };
  });

  for (const filePath of selectors) {
    const content = readText(filePath);
    const relativeFile = displayPath(filePath, automationRoot);
    if (/\/html\/body/i.test(content)) {
      addViolation(violations, 'ABSOLUTE_XPATH', `Selector file chứa absolute XPath: ${relativeFile}`, { file: relativeFile });
    }
    if (/:nth-child\(|\.first\(\)|\.last\(\)/i.test(content)) {
      addViolation(violations, 'POSITIONAL_SELECTOR', `Selector file chứa positional selector: ${relativeFile}`, { file: relativeFile });
    }
  }

  for (const filePath of specs) {
    const content = readText(filePath);
    if (/(?:page|this\.page)\.(?:locator|getByTestId|getByRole|getByLabel|getByPlaceholder|getByText)\s*\(/.test(content)) {
      addViolation(violations, 'RAW_SELECTOR_IN_SPEC', `Spec chứa raw selector; chuyển toàn bộ selector vào Page Object: ${displayPath(filePath, automationRoot)}`, {
        file: displayPath(filePath, automationRoot),
      });
    }
  }

  const allTargetKeys = [...new Set(cases.flatMap(testcase => testcase.target_keys))];
  const verifiedTargetKeys = [...selectorCoverage.values()].filter(item => item.status === 'runtime_verified');
  const sourceBytes = Buffer.byteLength(markdown, 'utf8');
  const tokenUsage = readTokenUsage(tokenUsagePath);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    status: violations.length === 0 ? 'PASS' : 'BLOCKED',
    mode,
    source: {
      path: displayPath(testcasePath, automationRoot),
      sha256: sourceHash,
      automation_manifest_path: manifestPath ? displayPath(manifestPath, automationRoot) : null,
      automation_manifest_sha256: manifestHash,
      format: path.extname(testcasePath).toLowerCase().replace('.', '') || 'unknown',
      testcase_count: cases.length,
      testcase_ids: cases.map(testcase => testcase.id),
      structured_execution_contract_count: cases.filter(testcase => testcase.structured).length,
      legacy_case_ids: cases.filter(testcase => !testcase.structured).map(testcase => testcase.id),
      total_testcase_count: parsedCases.cases.length,
      selected_testcase_ids: requestedTestcaseIds.length > 0 ? requestedTestcaseIds : null,
      source_context_estimate: {
        utf8_bytes: sourceBytes,
        estimated_tokens: Math.ceil(sourceBytes / 4),
        estimator: 'utf8_bytes_div_4_estimate',
        scope: 'testcase_file_only; not the full AI prompt',
      },
    },
    automation: {
      root: '.',
      selector_priority: SELECTOR_PRIORITY,
      require_browser_mcp: requireBrowserMcp,
      spec_files: relativeList(specs, automationRoot),
      selector_files: relativeList(selectors, automationRoot),
      page_files: relativeList(pages, automationRoot),
    },
    cases: testcaseResults,
    selector_coverage: [...selectorCoverage.values()],
    token_usage: tokenUsage,
    summary: {
      testcase_count: cases.length,
      total_testcase_count: parsedCases.cases.length,
      testcase_mapped_count: testcaseResults.filter(testcase => testcase.declaration_files.length > 0).length,
      target_key_count: selectorCoverage.size,
      unique_target_key_count: allTargetKeys.length,
      target_key_runtime_verified_count: verifiedTargetKeys.length,
      selector_context_count: selectorCoverage.size,
      selector_evidence_file_count: selectorEvidence.files.length,
      violation_count: violations.length,
    },
    violations,
  };

  return report;
}

function printUsage() {
  console.log(`Usage: node scripts/verify-testcase-traceability.mjs [options]

Options:
  --testcases <file>             Generated testcase Markdown companion
  --manifest <file>              Lossless .automation.json companion required for UI
  --automation-root <dir>        POM project root (default: .)
  --selector-evidence-dir <dir> Selector evidence directory (default: selector-evidence)
  --token-usage <file>           Provider-reported usage JSON (or QA_TOKEN_USAGE_FILE)
  --app-build <id>               Current application build/commit expected in selector evidence
  --max-evidence-age-hours <n>   Freshness limit (default: 168)
  --testcase-ids <csv>           Optional comma-separated testcase scope; omit for the full project
  --require-browser-mcp          Require Browser MCP provider, session and tool provenance for UI selector evidence
  --mode <ui|api>                UI checks selector evidence; API checks ID mapping only
  --output <file>                Audit JSON (default: reports/testcase-automation-traceability.json)
`);
}

function discoverManifestFile(automationRoot, testcasePath) {
  const explicit = getArg('--manifest', process.env.TESTCASE_AUTOMATION_MANIFEST || '');
  if (explicit) return path.resolve(automationRoot, explicit);
  const sibling = testcasePath.replace(/\.md$/i, '.automation.json');
  return fs.existsSync(sibling) ? sibling : '';
}

function discoverTestcaseFile(automationRoot) {
  const explicit = getArg('--testcases', process.env.TESTCASE_FILE || '');
  if (explicit) return path.resolve(automationRoot, explicit);
  const candidates = walkFiles(path.join(automationRoot, 'testcases'), filePath => (
    path.extname(filePath).toLowerCase() === '.md'
    && !path.basename(filePath).startsWith('TEMPLATE')
  ));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error('BLOCKED: --testcases is required or exactly one generated Markdown file must exist under testcases/');
  }
  throw new Error(`BLOCKED: multiple testcase Markdown files found; pass --testcases explicitly: ${candidates.map(file => displayPath(file, automationRoot)).join(', ')}`);
}

export {
  assertionMarker,
  assertionMatcherTokens,
  buildTraceability,
  outcomeMarker,
  parseAutomationManifest,
  parseSelectorEvidence,
  parseTestcases,
  readTokenUsage,
  stepMarker,
  stepMethodName,
  valueFingerprint,
};

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const automationRoot = path.resolve(getArg('--automation-root', '.'));
  const mode = getArg('--mode', 'ui').toLowerCase();
  if (!['ui', 'api'].includes(mode)) throw new Error(`BLOCKED: unsupported --mode ${mode}; use ui or api`);
  const testcasePath = discoverTestcaseFile(automationRoot);
  if (!fs.existsSync(testcasePath)) throw new Error(`BLOCKED: testcase file not found: ${testcasePath}`);
  if (path.extname(testcasePath).toLowerCase() !== '.md') {
    throw new Error('BLOCKED: use the generated testcase Markdown companion as the automation source; do not audit a raw Excel file');
  }
  const manifestPath = discoverManifestFile(automationRoot, testcasePath);
  const evidenceDir = path.resolve(automationRoot, getArg('--selector-evidence-dir', 'selector-evidence'));
  const tokenUsageArg = getArg('--token-usage', process.env.QA_TOKEN_USAGE_FILE || '');
  const tokenUsagePath = tokenUsageArg ? path.resolve(automationRoot, tokenUsageArg) : '';
  const expectedAppBuild = getArg('--app-build', process.env.QA_APP_BUILD || '');
  const maxEvidenceAgeHours = Number(getArg('--max-evidence-age-hours', '168'));
  const testcaseIds = getArg('--testcase-ids', process.env.QA_TRACEABILITY_TESTCASE_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!Number.isFinite(maxEvidenceAgeHours) || maxEvidenceAgeHours <= 0) {
    throw new Error('BLOCKED: --max-evidence-age-hours must be a positive number');
  }
  const requireBrowserMcp = process.argv.includes('--require-browser-mcp')
    || String(process.env.QA_REQUIRE_BROWSER_MCP || '').toLowerCase() === 'true';
  const outputPath = path.resolve(automationRoot, getArg('--output', 'reports/testcase-automation-traceability.json'));

  const report = buildTraceability({
    testcasePath,
    manifestPath,
    automationRoot,
    evidenceDir,
    tokenUsagePath,
    expectedAppBuild,
    maxEvidenceAgeHours,
    testcaseIds,
    requireBrowserMcp,
    mode,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    output: outputPath,
    source: report.source.path,
    source_sha256: report.source.sha256,
    testcases: `${report.summary.testcase_mapped_count}/${report.summary.testcase_count}`,
    scope: report.source.selected_testcase_ids || 'full-project',
    selectors: `${report.summary.target_key_runtime_verified_count}/${report.summary.target_key_count}`,
    token_measurement: report.token_usage.measurement,
    total_tokens: report.token_usage.total_tokens ?? null,
    violations: report.summary.violation_count,
  }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`[traceability] ${error.message}`);
    process.exitCode = 2;
  });
}
