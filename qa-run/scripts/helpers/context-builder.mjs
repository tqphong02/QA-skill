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
const scopeTokens = scopeKey.split(/[^a-z0-9_-]+/).filter(token => token.length > 1);
const isUsefulSignal = value => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 3) return false;
  if (/^(?:--+|n\/?a|none|null|undefined|unknown|static_only|\d+)$/i.test(text)) return false;
  return /[\p{L}\p{N}]/u.test(text);
};
const unique = values => {
  const seen = new Set();
  return values
    .map(value => String(value ?? '').replace(/\s+/g, ' ').trim())
    .filter(isUsefulSignal)
    .filter(value => {
      const key = value.toLocaleLowerCase('en-US');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};
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
const sourceEvidence = [];
let runtimeEvidencePresent = false;

function addEvidence(kind, value, source, confidence = 'inferred') {
  if (!isUsefulSignal(value) || !source) return;
  const record = {
    kind,
    value: String(value).replace(/\s+/g, ' ').trim(),
    source: String(source),
    confidence,
  };
  const key = `${record.kind}|${record.value}|${record.source}`;
  if (!sourceEvidence.some(item => `${item.kind}|${item.value}|${item.source}` === key)) {
    sourceEvidence.push(record);
  }
}

function matchesScope(...values) {
  const haystack = values.flat(Infinity)
    .filter(value => value !== null && value !== undefined)
    .map(value => (
      typeof value === 'object' ? JSON.stringify(value) : String(value)
    ))
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;
  if (haystack.includes(scopeKey)) return true;
  return scopeTokens.length > 0 && scopeTokens.every(token => haystack.includes(token));
}

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

function collectKnownArtifact(data, sourcePath) {
  const relativeSource = path.relative(DATA_DIR, sourcePath);
  const confidenceOf = item => item?.confidence || 'inferred';

  if (data.tool === 'graphify-adapter' && data.status === 'generated') {
    const candidates = (data.candidates || []).filter(item => matchesScope(
      item.source,
      item.target,
      item.relation,
      item.sourceRef,
    ));
    for (const candidate of candidates.slice(0, 40)) {
      const rendered = `${candidate.source} --${candidate.relation}--> ${candidate.target}`;
      result.impactAreas.push(candidate.source, candidate.target);
      const confidence = candidate.confidence === 'EXTRACTED'
        ? 'source-derived-candidate'
        : candidate.confidence === 'INFERRED'
          ? 'inferred'
          : 'ambiguous';
      addEvidence(
        'dependency_candidate',
        rendered,
        candidate.sourceRef || relativeSource,
        confidence,
      );
      if (candidate.confidence === 'AMBIGUOUS') {
        result.unresolved.push(`Graphify ambiguous dependency: ${rendered}`);
      }
    }
    return true;
  }

  if (Array.isArray(data.endpoints)) {
    for (const endpoint of data.endpoints.filter(item => matchesScope(
      item.module,
      item.path,
      item.source,
    ))) {
      const contract = [endpoint.method, endpoint.path].filter(Boolean).join(' ');
      result.routes.push(endpoint.path);
      result.apiContracts.push(contract);
      result.roles.push(...(
        endpoint.roles?.length
          ? endpoint.roles
          : [endpoint.auth_required ? 'Authenticated user' : 'Anonymous']
      ));
      if (endpoint.auth_required) result.preconditions.push('Authenticated session');
      result.happyFlow.push(`Call ${contract}`);
      addEvidence('api_contract', contract, endpoint.source || relativeSource, confidenceOf(endpoint));
    }
    return true;
  }

  if (Array.isArray(data.rules)) {
    for (const rule of data.rules.filter(item => matchesScope(
      item.module,
      item.condition,
      item.source,
    ))) {
      const rendered = [rule.category, rule.condition, rule.failureResult]
        .filter(Boolean)
        .join(': ');
      result.businessRules.push(rendered);
      if (rule.failureResult) result.expectedResults.push(rule.failureResult);
      addEvidence('business_rule', rendered, rule.source || relativeSource, confidenceOf(rule));
    }
    return true;
  }

  if (Array.isArray(data.flows)) {
    for (const flow of data.flows.filter(item => matchesScope(
      item.module,
      item.name,
      item.trigger,
      item.sourceReferences,
    ))) {
      const trigger = flow.trigger || flow.name;
      if (trigger) {
        result.happyFlow.push(`Trigger ${trigger}`);
        const routeMatch = String(trigger).match(/^(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
        if (routeMatch?.[1]?.startsWith('/')) result.routes.push(routeMatch[1]);
      }
      if (flow.actor) result.roles.push(flow.actor);
      result.preconditions.push(...(flow.preconditions || []));
      for (const step of flow.steps || []) {
        const rendered = step.action || stringifyItem(step);
        if (!rendered) continue;
        result.happyFlow.push(rendered);
        addEvidence('flow_step', rendered, step.source || relativeSource, confidenceOf(flow));
      }
      result.expectedResults.push(...(flow.failureFlows || []));
      result.impactAreas.push(...(flow.sideEffects || []));
      for (const reference of flow.sourceReferences || []) {
        const rendered = [reference.file, reference.line].filter(Boolean).join(':');
        addEvidence('business_flow', flow.name || trigger, rendered || relativeSource, confidenceOf(flow));
      }
    }
    return true;
  }

  if (Array.isArray(data.stateMachines)) {
    for (const machine of data.stateMachines.filter(item => matchesScope(
      item.entity,
      item.sources,
      item.transitions,
    ))) {
      if (machine.states?.length) {
        const rendered = `${machine.entity}: ${machine.states.join(' | ')}`;
        result.states.push(rendered);
        addEvidence('state_model', rendered, machine.sources?.[0] || relativeSource, 'verified');
      }
      for (const transition of machine.transitions || []) {
        const rendered = `${machine.entity}: ${transition.from} -> ${transition.to}`;
        if (String(transition.from).toUpperCase() === 'ANY') {
          result.unresolved.push(
            `${machine.entity} assignment to ${transition.to} found; allowed source states unresolved`,
          );
        } else {
          result.states.push(rendered);
          result.businessRules.push(`Allowed state transition: ${rendered}`);
        }
        addEvidence('state_transition', rendered, transition.source || machine.sources?.[0] || relativeSource, 'verified');
      }
    }
    return true;
  }

  if (Array.isArray(data.permissionEntries) || data.matrix || Array.isArray(data.rawGrants)) {
    const entries = [
      ...(data.permissionEntries || []),
      ...(data.rawGrants || []),
    ].filter(item => matchesScope(item));
    const matrixMatches = Object.entries(data.matrix || {})
      .filter(([, grants]) => matchesScope(grants))
      .map(([role]) => role);
    result.roles.push(...matrixMatches);
    for (const entry of entries) {
      const target = entry.endpoint || entry.route || entry.permission || stringifyItem(entry);
      const roles = unique([...(entry.roles || []), entry.role, entry.actor]);
      result.roles.push(...roles);
      for (const role of roles) {
        if (!target) continue;
        const rendered = `${role} -> ${target}`;
        result.businessRules.push(`Permission: ${rendered}`);
        addEvidence('permission', rendered, entry.source || relativeSource, entry.confidence || 'verified');
      }
    }
    const conflicts = data.conflictSummary || {};
    for (const [kind, count] of Object.entries(conflicts)) {
      if (Number(count) > 0) result.unresolved.push(`${kind}: ${count} permission conflict(s)`);
    }
    return true;
  }

  if (Array.isArray(data.modules) && Array.isArray(data.globalIntegrations)) {
    const modules = data.modules.filter(item => matchesScope(item.name, item));
    for (const module of modules) {
      result.impactAreas.push(module.name);
      result.impactAreas.push(...(module.integrations || []));
    }
    result.impactAreas.push(...data.globalIntegrations);
    for (const integration of data.globalIntegrations) {
      addEvidence('integration', integration, relativeSource, 'inferred');
    }
    return true;
  }

  if (Array.isArray(data.gaps)) {
    runtimeEvidencePresent ||= Boolean(data.hasRuntimeData);
    for (const gap of data.gaps.filter(item => matchesScope(
      item.description,
      item.items,
      item.recommendation,
    ))) {
      const rendered = [gap.gapType, gap.description].filter(Boolean).join(': ');
      result.unresolved.push(rendered);
      addEvidence('knowledge_gap', rendered, relativeSource, 'verified');
    }
    return true;
  }

  if (Array.isArray(data.questions)) {
    for (const question of data.questions.filter(item => matchesScope(
      item.module,
      item.question,
      item.answer,
      item.sources,
    ))) {
      const rendered = `${question.question} => ${question.answer || 'unresolved'}`;
      if (question.answerStatus !== 'verified') result.unresolved.push(rendered);
      addEvidence('business_qna', rendered, question.sources?.[0]?.file || relativeSource, question.confidence);
    }
    return true;
  }

  if (data.latest_run || data.happy_flow || data.business_rules) {
    runtimeEvidencePresent ||= Boolean(data.latest_run);
  }
  return false;
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

function collectMarkdown(markdown, sourcePath) {
  let section = '';
  const source = path.relative(DATA_DIR, sourcePath);
  const record = (destination, kind, value) => {
    if (!isUsefulSignal(value)) return;
    destination.push(value);
    addEvidence(kind, value, source, 'documented');
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level <= 2) section = title.toLowerCase();
      if (level === 3 && section.includes('happy business flow') && /^step\s+\d+/i.test(title)) {
        record(result.happyFlow, 'business_flow', title);
      }
      continue;
    }
    if (!/^[-*]\s+/.test(line)) continue;
    const text = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
    if (!text) continue;

    if (/(role|permission|vai trò|phân quyền)/i.test(section) && /^(role|vai trò):/i.test(text)) {
      record(result.roles, 'role', text.replace(/^(role|vai trò):\s*/i, ''));
    }
    if (/(entry point|điểm vào|route)/i.test(section) && /^route:/i.test(text)) {
      record(result.routes, 'route', text.replace(/^route:\s*/i, ''));
    }
    if (/(happy business flow|happy flow|luồng nghiệp vụ|luồng chính)/i.test(section)) {
      if (/^(role|vai trò):/i.test(text)) {
        record(result.roles, 'role', text.replace(/^(role|vai trò):\s*/i, ''));
      } else if (/^(precondition|điều kiện tiên quyết):/i.test(text)) {
        record(
          result.preconditions,
          'precondition',
          text.replace(/^(precondition|điều kiện tiên quyết):\s*/i, ''),
        );
      } else if (/^(expected|kết quả mong đợi):/i.test(text)) {
        record(
          result.expectedResults,
          'expected_result',
          text.replace(/^(expected|kết quả mong đợi):\s*/i, ''),
        );
      } else {
        record(result.happyFlow, 'business_flow', text);
      }
    }
    if (/(business rule|quy tắc nghiệp vụ|nguyên tắc nghiệp vụ)/i.test(section)) {
      record(result.businessRules, 'business_rule', text);
    }
    if (/(state|transition|trạng thái|chuyển trạng thái)/i.test(section)) {
      record(result.states, 'state_model', text);
    }
    if (/(side effect|integration|tác động|tích hợp)/i.test(section)) {
      record(result.impactAreas, 'integration', text);
    }
    if (/(api|network contract|hợp đồng mạng)/i.test(section)) {
      record(result.apiContracts, 'api_contract', text);
    }
    if (/(known issue|lỗi đã biết)/i.test(section)) {
      record(result.knownIssues, 'known_issue', text);
    }
    if (/(unresolved|gap|chưa rõ|khoảng trống)/i.test(section)) {
      record(result.unresolved, 'knowledge_gap', text);
    }
  }
}

const sources = candidateSources();
for (const source of sources) {
  const text = safeRead(source);
  if (!text) continue;
  if (source.endsWith('.json')) {
    try {
      const data = JSON.parse(text);
      const collected = collectKnownArtifact(data, source);
      const repositoryArtifact = source.includes(`${path.sep}repositories${path.sep}`);
      if (!collected && !repositoryArtifact) collectJson(data);
    } catch {
      result.unresolved.push(`${path.relative(DATA_DIR, source)} is not valid JSON`);
    }
  } else {
    const generatedRepoGuide = (
      path.basename(source) === 'business-guide.md'
      && source.includes(`${path.sep}repositories${path.sep}`)
      && fs.existsSync(path.join(path.dirname(source), 'business-flows.json'))
    );
    if (!generatedRepoGuide) collectMarkdown(text, source);
  }
}

if (TARGET) result.routes.unshift(TARGET);
if (ROLE) result.roles.unshift(ROLE);
if (EXPECTED) result.expectedResults.unshift(EXPECTED);

for (const key of Object.keys(result)) {
  if (key === 'unresolved') {
    result[key] = result[key].filter(value => (
      !/^`?(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^`]+`?$/i.test(String(value).trim())
    ));
  }
  result[key] = clipped(result[key]);
}

function evidenceFor(pattern) {
  return sourceEvidence
    .filter(item => pattern.test(`${item.kind} ${item.value}`))
    .slice(0, 4)
    .map(item => item.source);
}

function buildRiskInventory(context) {
  const risks = [];
  const add = (category, priority, hypothesis, oracle, sourceRefs) => {
    if (!sourceRefs.length && !isUsefulSignal(oracle)) return;
    const key = `${category}|${hypothesis}`;
    if (risks.some(item => `${item.category}|${item.hypothesis}` === key)) return;
    risks.push({
      category,
      priority,
      hypothesis,
      oracle,
      source_refs: unique(sourceRefs).slice(0, 4),
    });
  };

  const rulesText = context.businessRules.join(' ');
  const apiText = context.apiContracts.join(' ');
  const impactText = context.impactAreas.join(' ');

  if (
    context.roles.length > 1
    || /(permission|forbidden|unauthor|role|access)/i.test(rulesText)
  ) {
    add(
      'authorization-boundary',
      'high',
      'Role hoặc ownership boundary có thể cho phép thao tác vượt quyền hoặc chặn sai người dùng hợp lệ',
      context.businessRules.find(rule => /(permission|forbidden|unauthor|role|access)/i.test(rule))
        || `Allowed roles: ${context.roles.join(', ')}`,
      evidenceFor(/permission|role|auth/i),
    );
  }

  if (context.states.length || /(state_transition|status)/i.test(rulesText)) {
    add(
      'state-integrity',
      'high',
      'Hệ thống có thể chấp nhận chuyển trạng thái không hợp lệ, bỏ qua prerequisite hoặc không rollback khi lỗi',
      context.states.slice(0, 4).join(' | '),
      evidenceFor(/state|transition|status/i),
    );
  }

  if (/(input_validation|uniqueness|existence|financial|duplicate|amount|total)/i.test(rulesText)) {
    add(
      'validation-data-integrity',
      'high',
      'Boundary, dữ liệu trùng hoặc giá trị nghiệp vụ không hợp lệ có thể được lưu hoặc trả kết quả sai',
      context.businessRules
        .filter(rule => /(input_validation|uniqueness|existence|financial|duplicate|amount|total)/i.test(rule))
        .slice(0, 4)
        .join(' | '),
      evidenceFor(/rule|validation|unique|financial|existence/i),
    );
  }

  if (/(POST|PUT|PATCH|DELETE)/i.test(apiText) || /(database_write|database_delete)/i.test(impactText)) {
    add(
      'mutation-idempotency',
      'high',
      'Retry, double-submit hoặc concurrent action có thể tạo duplicate, lost update hoặc side effect lặp',
      context.apiContracts.filter(contract => /^(POST|PUT|PATCH|DELETE)/i.test(contract)).join(' | '),
      evidenceFor(/api_contract|flow_step|business_flow/i),
    );
  }

  if (/(payment|queue|event|email|sms|external|cache|integration)/i.test(impactText)) {
    add(
      'integration-resilience',
      'medium',
      'Timeout hoặc lỗi dependency có thể để UI và dữ liệu nội bộ ở trạng thái không nhất quán',
      `Side effects/integrations: ${context.impactAreas.join(', ')}`,
      evidenceFor(/integration|business_flow|flow_step/i),
    );
  }

  if (context.unresolved.length || context.knownIssues.length) {
    add(
      'knowledge-runtime-gap',
      'medium',
      'Static knowledge, runtime behavior hoặc known issue có thể đang mâu thuẫn hoặc chưa được quan sát',
      [...context.unresolved, ...context.knownIssues].slice(0, 4).join(' | '),
      evidenceFor(/gap|qna|issue/i),
    );
  }

  if (context.happyFlow.length && context.routes.length) {
    add(
      'workflow-coherence',
      'medium',
      'UI route, API transition và persisted state có thể lệch nhau dù happy path nhìn bề ngoài thành công',
      [
        `Routes: ${context.routes.slice(0, 4).join(', ')}`,
        `Flow: ${context.happyFlow.slice(0, 4).join(' -> ')}`,
      ].join(' | '),
      evidenceFor(/business_flow|flow_step|api_contract/i),
    );
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return risks
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, 8)
    .map((risk, index) => ({ risk_id: `RISK-${String(index + 1).padStart(2, '0')}`, ...risk }));
}

function buildExploratoryCharters(risks, context) {
  const techniques = {
    'authorization-boundary': ['role-switching', 'ownership-control', 'direct-route/API comparison'],
    'state-integrity': ['state-transition', 'sequence-break', 'rollback'],
    'validation-data-integrity': ['boundary-value', 'equivalence-partitioning', 'error-guessing'],
    'mutation-idempotency': ['double-submit', 'retry', 'concurrency'],
    'integration-resilience': ['failure-injection', 'timeout-retry', 'eventual-consistency'],
    'knowledge-runtime-gap': ['source-vs-runtime reconciliation', 'contract comparison'],
    'workflow-coherence': ['end-to-end workflow', 'persistence check', 'adjacent-flow'],
  };
  const expectationPatterns = {
    'authorization-boundary': /(unauthor|forbidden|access|permission|quyền)/i,
    'state-integrity': /(state|status|trạng thái)/i,
    'validation-data-integrity': /(invalid|duplicate|tồn tại|không hợp lệ|not found|số dư)/i,
  };
  const mutationTargets = context.apiContracts.filter(contract => /^(POST|PUT|PATCH|DELETE)/i.test(contract));

  return risks.slice(0, 6).map((risk, index) => {
    const expectationPattern = expectationPatterns[risk.category];
    const matchingExpectations = expectationPattern
      ? context.expectedResults.filter(value => expectationPattern.test(value)).slice(0, 3)
      : [];
    return {
      charter_id: `EXP-${String(index + 1).padStart(2, '0')}`,
      priority: risk.priority,
      mission: `Khám phá ${SCOPE} để kiểm chứng rủi ro ${risk.category}: ${risk.hypothesis}`,
      target: (
        risk.category === 'mutation-idempotency' && mutationTargets.length
          ? mutationTargets.slice(0, 4)
          : context.routes.slice(0, 4)
      ),
      roles: context.roles.slice(0, 4),
      techniques: techniques[risk.category] || ['exploratory', 'error-guessing'],
      oracles: unique([risk.oracle, ...matchingExpectations]),
      evidence_required: ['final UI state', 'same-session network/console', 'persisted state when mutation occurs'],
      source_refs: risk.source_refs,
      safety: risk.category === 'mutation-idempotency'
        ? 'Use isolated/disposable data; do not execute destructive actions without explicit authorization'
        : 'Stay within the requested feature, role and environment',
    };
  });
}

const riskInventory = buildRiskInventory(result);
const exploratoryCharters = buildExploratoryCharters(riskInventory, result);

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
  schema_version: 2,
  status,
  intent: INTENT,
  scope: SCOPE,
  ticket: TICKET || null,
  generated_at: new Date().toISOString(),
  source_files: sources.map(source => ({
    path: path.relative(DATA_DIR, source),
    sha256_12: hashFile(source),
  })),
  knowledge_health: {
    source_count: sources.length,
    source_artifact_count: sources.filter(source => source.includes(`${path.sep}repositories${path.sep}`)).length,
    runtime_evidence_present: runtimeEvidencePresent,
    source_only: !runtimeEvidencePresent && sources.some(
      source => source.includes(`${path.sep}repositories${path.sep}`),
    ),
    unresolved_count: result.unresolved.length,
    confidence: runtimeEvidencePresent ? 'runtime_correlated' : 'static_or_document_derived',
  },
  source_evidence: sourceEvidence.slice(0, 60),
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
  risk_inventory: riskInventory,
  exploratory_charters: exploratoryCharters,
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
  `- Knowledge confidence: ${brief.knowledge_health.confidence}`,
  `- Runtime correlated: ${brief.knowledge_health.runtime_evidence_present ? 'yes' : 'no'}`,
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
  '## Ranked risks',
  '',
  ...brief.risk_inventory.map(risk => (
    `- ${risk.risk_id} [${risk.priority}] ${risk.category}: ${risk.hypothesis}`
  )),
  '',
  '## Exploratory charters',
  '',
  ...brief.exploratory_charters.map(charter => (
    `- ${charter.charter_id} [${charter.priority}] ${charter.mission}`
  )),
  '',
];
fs.writeFileSync(markdownPath, markdown.join('\n'), 'utf8');

console.log(`[business-context] ${status}: ${OUTPUT}`);
console.log(`[business-context] sources=${sources.length} missing=${missing.join(',') || 'none'}`);

if (status === 'READY') process.exit(0);
if (status === 'NEEDS_DISCOVERY') process.exit(3);
process.exit(2);
