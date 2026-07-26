#!/usr/bin/env node
/**
 * Build and validate a compact Business Execution Brief from real QA knowledge.
 *
 * This script never invents fallback flows. It reads knowledge-index/shards,
 * app-flow-map and matching business guides, then blocks execution when the
 * business context is incomplete.
 *
 * Usage:
 *   node context-builder.mjs --intent RETEST_TICKET --scope order \
 *     --target /orders/123 --expected "Order becomes APPROVED"
 *
 * Exit codes:
 *   0 READY
 *   2 BLOCKED
 *   3 NEEDS_DISCOVERY
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};

const DATA_DIR = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const KNOW_DIR = path.join(DATA_DIR, 'qa-knowledge');
const INTENT = getArg('--intent', 'EXPLORATORY_ADHOC').toUpperCase();
const SCOPE = getArg('--scope', getArg('--module', '')).trim();
const TARGET = getArg('--target', '').trim();
const EXPECTED = getArg('--expected', '').trim();
const ROLE = getArg('--role', '').trim();
const IMPACT = getArg('--impact', '').split(',').map(item => item.trim()).filter(Boolean);
const TICKET = getArg('--ticket', '').trim();
const OUTPUT = path.resolve(getArg(
  '--output',
  path.join(KNOW_DIR, 'context', 'business-execution-brief.json'),
));

if (!SCOPE) {
  console.error('[business-context] BLOCKED: --scope is required');
  process.exit(2);
}

const scopeKey = SCOPE.toLowerCase();
const unique = values => [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
const clipped = (values, limit = 20) => unique(values).slice(0, limit);
const result = {
  routes: [],
  roles: [],
  preconditions: [],
  happyFlow: [],
  businessRules: [],
  expectedResults: [],
  states: [],
  impactAreas: [...IMPACT],
  apiContracts: [],
  knownIssues: [],
  unresolved: [],
};

function hashFile(filePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);
}

function safeRead(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 2_000_000) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function walkFiles(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'context' || entry.name === 'evidence') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, found);
    else if (/\.(json|md)$/i.test(entry.name)) found.push(fullPath);
  }
  return found;
}

function collectIndexRefs(node, refs = []) {
  if (Array.isArray(node)) {
    node.forEach(item => collectIndexRefs(item, refs));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach(value => collectIndexRefs(value, refs));
  } else if (typeof node === 'string' && /\.(json|md)$/i.test(node)) {
    refs.push(node);
  }
  return refs;
}

function resolveRef(reference) {
  const candidates = [
    path.resolve(DATA_DIR, reference),
    path.resolve(KNOW_DIR, reference),
    path.resolve(KNOW_DIR, reference.replace(/^qa-knowledge\//, '')),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function candidateSources() {
  const sources = [];
  const add = (candidate, always = false) => {
    if (!candidate || !fs.existsSync(candidate)) return;
    const absolute = path.resolve(candidate);
    const relative = path.relative(KNOW_DIR, absolute).toLowerCase();
    const text = safeRead(absolute);
    if (
      always
      || relative.includes(scopeKey)
      || (text && text.toLowerCase().includes(scopeKey))
    ) {
      sources.push(absolute);
    }
  };

  const indexPath = path.join(KNOW_DIR, 'knowledge-index.json');
  const appMapPath = path.join(KNOW_DIR, 'app-flow-map.json');
  add(indexPath, true);
  add(appMapPath, true);
  add(path.join(KNOW_DIR, `${scopeKey}-business-guide.md`), true);
  add(path.join(KNOW_DIR, 'app-business-guide.md'));
  add(path.join(KNOW_DIR, 'merged', 'system-business-guide.md'));

  if (fs.existsSync(indexPath)) {
    try {
      const indexData = JSON.parse(safeRead(indexPath));
      for (const reference of collectIndexRefs(indexData)) add(resolveRef(reference));
    } catch {
      result.unresolved.push('knowledge-index.json is not valid JSON');
    }
  }

  for (const filePath of walkFiles(KNOW_DIR)) {
    if (sources.includes(path.resolve(filePath))) continue;
    const relative = path.relative(KNOW_DIR, filePath).toLowerCase();
    if (relative.includes(scopeKey)) {
      add(filePath);
      continue;
    }
    const text = safeRead(filePath);
    if (text && text.toLowerCase().includes(scopeKey)) add(filePath);
  }

  return unique(sources).slice(0, 30);
}

function stringifyItem(item) {
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
    return String(item);
  }
  if (!item || typeof item !== 'object') return '';
  const preferred = [
    item.action,
    item.expected,
    item.result,
    item.rule,
    item.condition,
    item.failureResult,
    item.behavior,
    item.name,
    item.title,
    item.route,
    item.path,
    item.url,
    item.state,
  ].filter(Boolean);
  return preferred.map(String).join(' -> ');
}

function collectValues(value, destination) {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    const rendered = stringifyItem(item);
    if (rendered) destination.push(rendered);
  }
}

function objectMatchesScope(node) {
  const identity = [
    node.module,
    node.feature,
    node.slug,
    node.pageSlug,
    node.flowId,
    node.name,
    node.route,
    node.path,
  ].filter(Boolean).join(' ').toLowerCase();
  return !identity || identity.includes(scopeKey) || scopeKey.includes(identity);
}

function collectJson(node, parentKey = '') {
  if (Array.isArray(node)) {
    node.forEach(item => collectJson(item, parentKey));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (!objectMatchesScope(node) && (node.module || node.feature || node.slug || node.pageSlug)) return;

  for (const [key, value] of Object.entries(node)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');

    if (/^(route|routes|url|urls|path|paths|entrypoint|entrypoints|baseurl)$/.test(normalized)) {
      collectValues(value, result.routes);
    }
    if (/^(role|roles|actor|actors|accountroles)$/.test(normalized)) {
      collectValues(value, result.roles);
    }
    if (/^(precondition|preconditions|prerequisite|prerequisites|testdata)$/.test(normalized)) {
      collectValues(value, result.preconditions);
    }
    if (/^(happyflow|happyflows|steps|flow|flows|businessflow|businessflows)$/.test(normalized)) {
      collectValues(value, result.happyFlow);
    }
    if (/^(businessrule|businessrules|rules|rule|condition|validationrules)$/.test(normalized)) {
      collectValues(value, result.businessRules);
    }
    if (/^(expected|expectedresult|expectedresults|failureresult|result)$/.test(normalized)) {
      collectValues(value, result.expectedResults);
    }
    if (/^(state|states|transition|transitions|statemachines)$/.test(normalized)) {
      collectValues(value, result.states);
    }
    if (/^(impactarea|impactareas|dependency|dependencies|sideeffect|sideeffects|integration|integrations)$/.test(normalized)) {
      collectValues(value, result.impactAreas);
    }
    if (/^(endpoint|endpoints|apicontract|apicontracts|apinetwork)$/.test(normalized)) {
      const endpoints = Array.isArray(value) ? value : [value];
      for (const endpoint of endpoints) {
        if (endpoint && typeof endpoint === 'object') {
          const rendered = [endpoint.method, endpoint.path || endpoint.url, endpoint.behavior]
            .filter(Boolean).join(' ');
          if (rendered) result.apiContracts.push(rendered);
        } else collectValues(endpoint, result.apiContracts);
      }
    }
    if (/^(knownissue|knownissues|issues)$/.test(normalized)) {
      collectValues(value, result.knownIssues);
    }
    if (/^(unresolved|unresolvedquestions|gaps|assumptions)$/.test(normalized)) {
      collectValues(value, result.unresolved);
    }

    if (value && typeof value === 'object') collectJson(value, key || parentKey);
  }
}

function collectMarkdown(markdown) {
  let section = '';
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level <= 2) section = title.toLowerCase();
      if (level === 3 && section.includes('happy business flow') && /^step\s+\d+/i.test(title)) {
        result.happyFlow.push(title);
      }
      continue;
    }
    if (!line.startsWith('-')) continue;
    const text = line.replace(/^-\s*/, '').replace(/\*\*/g, '').trim();
    if (!text) continue;

    if ((section.includes('role') || section.includes('permission')) && /^role:/i.test(text)) {
      result.roles.push(text.replace(/^role:\s*/i, ''));
    }
    if (section.includes('entry point') && /^route:/i.test(text)) {
      result.routes.push(text.replace(/^route:\s*/i, ''));
    }
    if (section.includes('happy business flow')) {
      if (/^role:/i.test(text)) result.roles.push(text.replace(/^role:\s*/i, ''));
      else if (/^precondition:/i.test(text)) {
        result.preconditions.push(text.replace(/^precondition:\s*/i, ''));
      } else if (/^expected:/i.test(text)) {
        result.expectedResults.push(text.replace(/^expected:\s*/i, ''));
      }
    }
    if (section.includes('business rule')) result.businessRules.push(text);
    if (section.includes('state') || section.includes('transition')) result.states.push(text);
    if (section.includes('side effect') || section.includes('integration')) result.impactAreas.push(text);
    if (section.includes('api') || section.includes('network contract')) result.apiContracts.push(text);
    if (section.includes('known issue')) result.knownIssues.push(text);
    if (section.includes('unresolved') || section.includes('gap')) result.unresolved.push(text);
  }
}

const sources = candidateSources();
for (const source of sources) {
  const text = safeRead(source);
  if (!text) continue;
  if (source.endsWith('.json')) {
    try {
      collectJson(JSON.parse(text));
    } catch {
      result.unresolved.push(`${path.relative(DATA_DIR, source)} is not valid JSON`);
    }
  } else {
    collectMarkdown(text);
  }
}

if (TARGET) result.routes.unshift(TARGET);
if (ROLE) result.roles.unshift(ROLE);
if (EXPECTED) result.expectedResults.unshift(EXPECTED);

for (const key of Object.keys(result)) {
  result[key] = clipped(result[key]);
}

const missing = [];
if (!sources.length) missing.push('sources');
if (!result.routes.length) missing.push('routes');
if (!result.roles.length) missing.push('roles');
if (result.happyFlow.length < 2) missing.push('happy_flow');
if (!result.businessRules.length) missing.push('business_rules');
if (!result.expectedResults.length) missing.push('expected_results');
if (!result.preconditions.length) missing.push('preconditions');
if (/(RETEST|SHEET|SANITY|REGRESSION)/.test(INTENT) && !result.impactAreas.length) {
  missing.push('impact_areas');
}

const criticalMissing = missing.filter(item => (
  ['roles', 'happy_flow', 'business_rules', 'expected_results', 'preconditions'].includes(item)
));
let status = 'READY';
if (missing.length) status = 'NEEDS_DISCOVERY';
if (/(RETEST|SHEET)/.test(INTENT) && criticalMissing.length) status = 'BLOCKED';

const brief = {
  schema_version: 1,
  status,
  intent: INTENT,
  scope: SCOPE,
  ticket: TICKET || null,
  generated_at: new Date().toISOString(),
  source_files: sources.map(source => ({
    path: path.relative(DATA_DIR, source),
    sha256_12: hashFile(source),
  })),
  missing_required: missing,
  business_context: {
    routes: result.routes,
    roles: result.roles,
    preconditions: result.preconditions,
    happy_flow: result.happyFlow,
    business_rules: result.businessRules,
    expected_results: result.expectedResults,
    states: result.states,
    impact_areas: result.impactAreas,
    api_contracts: result.apiContracts,
    known_issues: result.knownIssues,
    unresolved: result.unresolved,
  },
  execution_contract: {
    target: result.routes[0] || null,
    role_data: result.roles[0] || null,
    original_flow: result.happyFlow,
    expected: result.expectedResults,
    impact_area: result.impactAreas,
    stop_condition: status === 'READY'
      ? 'Stop on destructive scope, missing permission/data, or evidence conflict'
      : 'Do not start normal test execution until this brief is READY',
  },
  allowed_next_actions: status === 'READY'
    ? ['START_RUN_MANIFEST', 'EXECUTE_REQUIRED_WORKFLOW_LAYERS']
    : status === 'NEEDS_DISCOVERY'
      ? ['RUN_SCOPED_BUSINESS_DISCOVERY', 'REBUILD_BUSINESS_EXECUTION_BRIEF']
      : ['RESOLVE_MISSING_BUSINESS_INPUTS', 'REBUILD_BUSINESS_EXECUTION_BRIEF'],
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(brief, null, 2), 'utf8');

const markdownPath = OUTPUT.replace(/\.json$/i, '.md');
const markdown = [
  `# Business Execution Brief — ${SCOPE}`,
  '',
  `- Status: ${status}`,
  `- Intent: ${INTENT}`,
  `- Sources: ${sources.length}`,
  `- Missing: ${missing.join(', ') || 'none'}`,
  '',
  '## Execution contract',
  '',
  `- Target: ${brief.execution_contract.target || 'unresolved'}`,
  `- Role/Data: ${brief.execution_contract.role_data || 'unresolved'}`,
  `- Expected: ${brief.execution_contract.expected.join(' | ') || 'unresolved'}`,
  `- Impact area: ${brief.execution_contract.impact_area.join(' | ') || 'unresolved'}`,
  '',
  '## Original flow',
  '',
  ...brief.execution_contract.original_flow.map((step, index) => `${index + 1}. ${step}`),
  '',
  '## Business rules',
  '',
  ...brief.business_context.business_rules.map(rule => `- ${rule}`),
  '',
];
fs.writeFileSync(markdownPath, markdown.join('\n'), 'utf8');

console.log(`[business-context] ${status}: ${OUTPUT}`);
console.log(`[business-context] sources=${sources.length} missing=${missing.join(',') || 'none'}`);

if (status === 'READY') process.exit(0);
if (status === 'NEEDS_DISCOVERY') process.exit(3);
process.exit(2);
