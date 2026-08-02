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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};

const DATA_DIR = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const KNOW_DIR = path.join(DATA_DIR, 'qa-knowledge');
const INTENT = getArg('--intent', 'EXPLORATORY_ADHOC').toUpperCase();
const SCOPE = getArg('--scope', getArg('--module', '')).trim();
const RUN_MODE = getArg('--run-mode', process.env.QA_RUN_MODE || 'auto').toLowerCase();
const TARGET = getArg('--target', '').trim();
const EXPECTED = getArg('--expected', '').trim();
const ROLE = getArg('--role', '').trim();
const IMPACT = getArg('--impact', '').split(',').map(item => item.trim()).filter(Boolean);
const TICKET = getArg('--ticket', '').trim();
const CARD_MAX_TOKENS = Math.max(
  600,
  Number.parseInt(getArg(
    '--card-max-tokens',
    process.env.QA_CONTEXT_CARD_MAX_TOKENS || '3200',
  ), 10) || 3200,
);
const NO_CACHE = args.includes('--no-cache');
const OUTPUT = path.resolve(getArg(
  '--output',
  path.join(KNOW_DIR, 'context', 'business-execution-brief.json'),
));
const CONTEXT_BUILDER_VERSION = 'context-builder-v3-card-cache';

if (!SCOPE) {
  console.error('[business-context] BLOCKED: --scope is required');
  process.exit(2);
}
if (!['auto', 'fast', 'scoped', 'deep'].includes(RUN_MODE)) {
  console.error('[business-context] BLOCKED: --run-mode must be auto, fast, scoped, or deep');
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
  businessModel: {
    nodes: [],
    relations: [],
    invariants: [],
  },
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

const MODEL_CONFIDENCE = new Set([
  'verified',
  'runtime_verified',
  'documented',
  'source-derived-candidate',
  'inferred',
  'ambiguous',
]);

function modelConfidence(value, fallback = 'source-derived-candidate') {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  if (normalized === 'EXTRACTED') return 'source-derived-candidate';
  if (normalized === 'INFERRED') return 'inferred';
  if (normalized === 'AMBIGUOUS') return 'ambiguous';
  if (MODEL_CONFIDENCE.has(normalized)) return normalized;
  if (/ambiguous|unknown|risk|unresolved|needs_review/i.test(normalized)) return 'ambiguous';
  if (/candidate|supported|pattern/i.test(normalized)) return 'source-derived-candidate';
  if (/runtime.*verified|verified.*runtime/i.test(normalized)) return 'runtime_verified';
  if (/verified/i.test(normalized)) return 'verified';
  return 'ambiguous';
}

function modelId(value, fallback = 'unknown') {
  const rendered = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return rendered || fallback;
}

function addModelNode({ id, type = 'domain', label, source, confidence } = {}) {
  if (!isUsefulSignal(label || id) || !source) return '';
  const nodeId = modelId(id || label);
  const record = {
    id: nodeId,
    type: String(type || 'domain').trim().toLowerCase(),
    label: String(label || id).replace(/\s+/g, ' ').trim().slice(0, 240),
    source: String(source),
    confidence: modelConfidence(confidence),
  };
  const existing = result.businessModel.nodes.find(item => item.id === nodeId);
  if (existing) {
    if (existing.confidence === 'inferred' && record.confidence !== 'inferred') {
      existing.confidence = record.confidence;
    }
    if (existing.source === 'unknown' && record.source !== 'unknown') existing.source = record.source;
    return nodeId;
  }
  result.businessModel.nodes.push(record);
  return nodeId;
}

function addModelRelation({ from, to, type = 'related_to', source, confidence } = {}) {
  if (!isUsefulSignal(from) || !isUsefulSignal(to) || !source) return;
  const record = {
    from: modelId(from),
    to: modelId(to),
    type: String(type || 'related_to').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80),
    source: String(source),
    confidence: modelConfidence(confidence),
  };
  const key = `${record.from}|${record.type}|${record.to}`;
  if (!result.businessModel.relations.some(item => `${item.from}|${item.type}|${item.to}` === key)) {
    result.businessModel.relations.push(record);
  }
}

function addModelInvariant({ id, statement, oracle, source, confidence } = {}) {
  if (!isUsefulSignal(statement) || !source) return;
  const normalizedStatement = String(statement).replace(/\s+/g, ' ').trim().slice(0, 420);
  const record = {
    id: modelId(id || normalizedStatement),
    statement: normalizedStatement,
    oracle: String(oracle || normalizedStatement).replace(/\s+/g, ' ').trim().slice(0, 520),
    source: String(source),
    confidence: modelConfidence(confidence),
  };
  const existing = result.businessModel.invariants.find(item => item.id === record.id);
  if (existing) {
    if (existing.confidence === 'inferred' && record.confidence !== 'inferred') {
      existing.confidence = record.confidence;
    }
    return;
  }
  result.businessModel.invariants.push(record);
  addEvidence('model_invariant', record.statement, record.source, record.confidence);
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

function hashValue(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function statusCode(status) {
  if (status === 'READY') return 0;
  if (status === 'NEEDS_DISCOVERY') return 3;
  return 2;
}

function deriveCardPath(briefPath) {
  const replaced = briefPath.replace(
    /business-execution-brief\.json$/i,
    'business-execution-card.json',
  );
  if (replaced !== briefPath) return replaced;
  return path.join(
    path.dirname(briefPath),
    `${path.basename(briefPath, path.extname(briefPath))}-card.json`,
  );
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

// Fast cache invalidation: walk metadata only before deciding whether the
// content hashes need to be recomputed. Any path/size/mtime change falls back
// to the existing content-hash path, so the optimization never hides a normal
// knowledge update. The short metadata fingerprint is stored in the brief and
// remains project-agnostic.
function sourceInventoryFingerprint() {
  const inventory = walkFiles(KNOW_DIR)
    .map(filePath => {
      try {
        const stat = fs.statSync(filePath);
        return {
          path: path.relative(DATA_DIR, filePath),
          size: stat.size,
          mtime_ms: Math.trunc(stat.mtimeMs),
          ctime_ms: Math.trunc(stat.ctimeMs),
          inode: stat.ino || 0,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    fingerprint: hashValue(inventory),
    count: inventory.length,
  };
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

  return unique(sources)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 30);
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

function modelSource(item, fallback) {
  return item?.source
    || item?.sourceRef
    || item?.source_ref
    || item?.evidence?.source
    || fallback;
}

function modelEndpoint(value) {
  if (value && typeof value === 'object') {
    return value.id || value.key || value.name || value.label || value.path || value.value;
  }
  return value;
}

function collectExplicitBusinessModel(data, sourcePath) {
  const relativeSource = path.relative(DATA_DIR, sourcePath);
  const model = data.business_model
    || data.businessModel
    || data.business_graph
    || data.businessGraph
    || data.domain_model
    || data.domainModel
    || data.domain_graph
    || data.domainGraph;
  const modelObject = model && typeof model === 'object' ? model : {};
  const nodes = Array.isArray(model)
    ? model
    : modelObject.nodes || modelObject.entities || modelObject.concepts || [];
  const relations = Array.isArray(model)
    ? []
    : modelObject.relations || modelObject.edges || modelObject.links || [];
  const invariants = Array.isArray(model)
    ? []
    : modelObject.invariants || modelObject.assertions || modelObject.oracles || [];
  const directInvariants = data.invariants || data.business_assertions || data.businessAssertions;
  let collected = false;

  for (const node of (Array.isArray(nodes) ? nodes : [nodes])) {
    if (!node || typeof node !== 'object') continue;
    const label = node.label || node.name || node.title || node.id || node.key;
    const source = modelSource(node, relativeSource);
    const id = addModelNode({
      id: node.id || node.key || label,
      type: node.type || node.kind || node.category || 'domain',
      label,
      source,
      confidence: node.confidence || modelObject.confidence || 'documented',
    });
    if (id) collected = true;
  }

  for (const relation of (Array.isArray(relations) ? relations : [relations])) {
    if (!relation || typeof relation !== 'object') continue;
    const from = modelEndpoint(relation.from || relation.source || relation.sourceId);
    const to = modelEndpoint(relation.to || relation.target || relation.targetId);
    const source = modelSource(relation, relativeSource);
    if (!from || !to) continue;
    addModelNode({ id: from, label: from, type: 'domain', source, confidence: relation.confidence });
    addModelNode({ id: to, label: to, type: 'domain', source, confidence: relation.confidence });
    addModelRelation({
      from,
      to,
      type: relation.type || relation.relation || relation.kind || 'related_to',
      source,
      confidence: relation.confidence || modelObject.confidence || 'documented',
    });
    collected = true;
  }

  const allInvariants = [
    ...(Array.isArray(invariants) ? invariants : [invariants]),
    ...(Array.isArray(directInvariants) ? directInvariants : directInvariants ? [directInvariants] : []),
  ];
  for (const invariant of allInvariants) {
    const statement = typeof invariant === 'string'
      ? invariant
      : invariant?.statement
        || invariant?.description
        || invariant?.rule
        || invariant?.condition
        || invariant?.text;
    if (!statement) continue;
    const source = modelSource(invariant, relativeSource);
    const oracle = typeof invariant === 'string'
      ? statement
      : invariant.oracle
        || invariant.expected
        || invariant.expectedResult
        || invariant.failureResult
        || statement;
    addModelInvariant({
      id: typeof invariant === 'object' ? invariant.id || invariant.key : undefined,
      statement,
      oracle,
      source,
      confidence: typeof invariant === 'object'
        ? invariant.confidence || modelObject.confidence || 'documented'
        : modelObject.confidence || 'documented',
    });
    result.businessRules.push(statement);
    if (oracle && oracle !== statement) result.expectedResults.push(oracle);
    collected = true;
  }
  return collected;
}

function collectKnownArtifact(data, sourcePath) {
  const relativeSource = path.relative(DATA_DIR, sourcePath);
  const confidenceOf = item => item?.confidence || 'inferred';
  const modelCollected = collectExplicitBusinessModel(data, sourcePath);

  if (data.tool === 'graphify-adapter' && data.status === 'generated') {
    const graphifyContext = data.contextSlice?.candidates || data.candidates || [];
    const candidates = graphifyContext.filter(item => matchesScope(
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
      const sourceId = addModelNode({
        id: candidate.source,
        type: 'code_candidate',
        label: candidate.source,
        source: candidate.sourceRef || relativeSource,
        confidence,
      });
      const targetId = addModelNode({
        id: candidate.target,
        type: 'code_candidate',
        label: candidate.target,
        source: candidate.sourceRef || relativeSource,
        confidence,
      });
      addModelRelation({
        from: sourceId,
        to: targetId,
        type: candidate.relation || 'dependency_candidate',
        source: candidate.sourceRef || relativeSource,
        confidence,
      });
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
      const endpointId = addModelNode({
        id: `endpoint-${endpoint.method}-${endpoint.path}`,
        type: 'endpoint',
        label: contract,
        source: endpoint.source || relativeSource,
        confidence: confidenceOf(endpoint),
      });
      if (endpoint.module) {
        const moduleId = addModelNode({
          id: endpoint.module,
          type: 'module',
          label: endpoint.module,
          source: endpoint.source || relativeSource,
          confidence: confidenceOf(endpoint),
        });
        addModelRelation({
          from: moduleId,
          to: endpointId,
          type: 'exposes',
          source: endpoint.source || relativeSource,
          confidence: confidenceOf(endpoint),
        });
      }
      for (const role of endpoint.roles || []) {
        const roleId = addModelNode({
          id: `role-${role}`,
          type: 'role',
          label: role,
          source: endpoint.source || relativeSource,
          confidence: confidenceOf(endpoint),
        });
        addModelRelation({
          from: roleId,
          to: endpointId,
          type: 'can_access',
          source: endpoint.source || relativeSource,
          confidence: confidenceOf(endpoint),
        });
      }
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
      addModelInvariant({
        id: rule.id || `${rule.category}-${rule.condition}`,
        statement: rendered,
        oracle: rule.failureResult || rule.expected || rendered,
        source: rule.source || relativeSource,
        confidence: confidenceOf(rule),
      });
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
      const flowId = addModelNode({
        id: flow.id || flow.name || trigger,
        type: 'flow',
        label: flow.name || trigger,
        source: relativeSource,
        confidence: confidenceOf(flow),
      });
      if (trigger) {
        result.happyFlow.push(`Trigger ${trigger}`);
        const triggerId = addModelNode({
          id: `trigger-${trigger}`,
          type: 'trigger',
          label: trigger,
          source: relativeSource,
          confidence: confidenceOf(flow),
        });
        addModelRelation({
          from: triggerId,
          to: flowId,
          type: 'triggers',
          source: relativeSource,
          confidence: confidenceOf(flow),
        });
        const routeMatch = String(trigger).match(/^(?:GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
        if (routeMatch?.[1]?.startsWith('/')) result.routes.push(routeMatch[1]);
      }
      if (flow.actor) {
        result.roles.push(flow.actor);
        const actorId = addModelNode({
          id: `role-${flow.actor}`,
          type: 'role',
          label: flow.actor,
          source: relativeSource,
          confidence: confidenceOf(flow),
        });
        addModelRelation({
          from: actorId,
          to: flowId,
          type: 'executes',
          source: relativeSource,
          confidence: confidenceOf(flow),
        });
      }
      result.preconditions.push(...(flow.preconditions || []));
      for (const step of flow.steps || []) {
        const rendered = step.action || stringifyItem(step);
        if (!rendered) continue;
        result.happyFlow.push(rendered);
        addEvidence('flow_step', rendered, step.source || relativeSource, confidenceOf(flow));
        const stepId = addModelNode({
          id: step.id || `step-${rendered}`,
          type: 'step',
          label: rendered,
          source: step.source || relativeSource,
          confidence: confidenceOf(step) || confidenceOf(flow),
        });
        addModelRelation({
          from: flowId,
          to: stepId,
          type: 'contains',
          source: step.source || relativeSource,
          confidence: confidenceOf(step) || confidenceOf(flow),
        });
      }
      result.expectedResults.push(...(flow.failureFlows || []));
      result.impactAreas.push(...(flow.sideEffects || []));
      for (const failure of flow.failureFlows || []) {
        addModelInvariant({
          id: `failure-${flow.name || trigger}-${failure}`,
          statement: `${flow.name || trigger}: ${failure}`,
          oracle: failure,
          source: relativeSource,
          confidence: confidenceOf(flow),
        });
      }
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
        const entityId = addModelNode({
          id: machine.entity,
          type: 'entity',
          label: machine.entity,
          source: machine.sources?.[0] || relativeSource,
          confidence: 'verified',
        });
        for (const state of machine.states) {
          const stateId = addModelNode({
            id: `${machine.entity}-${state}`,
            type: 'state',
            label: state,
            source: machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
          addModelRelation({
            from: entityId,
            to: stateId,
            type: 'has_state',
            source: machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
        }
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
          const fromId = addModelNode({
            id: `${machine.entity}-${transition.from}`,
            type: 'state',
            label: transition.from,
            source: transition.source || machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
          const toId = addModelNode({
            id: `${machine.entity}-${transition.to}`,
            type: 'state',
            label: transition.to,
            source: transition.source || machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
          addModelRelation({
            from: fromId,
            to: toId,
            type: 'allowed_transition',
            source: transition.source || machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
          addModelInvariant({
            id: `transition-${machine.entity}-${transition.from}-${transition.to}`,
            statement: `Allowed state transition: ${rendered}`,
            oracle: `Only allow ${transition.from} -> ${transition.to} for ${machine.entity}`,
            source: transition.source || machine.sources?.[0] || relativeSource,
            confidence: 'verified',
          });
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
        const roleId = addModelNode({
          id: `role-${role}`,
          type: 'role',
          label: role,
          source: entry.source || relativeSource,
          confidence: entry.confidence || 'verified',
        });
        const targetId = addModelNode({
          id: `permission-${target}`,
          type: 'permission_target',
          label: target,
          source: entry.source || relativeSource,
          confidence: entry.confidence || 'verified',
        });
        addModelRelation({
          from: roleId,
          to: targetId,
          type: 'can_access',
          source: entry.source || relativeSource,
          confidence: entry.confidence || 'verified',
        });
        addModelInvariant({
          id: `permission-${role}-${target}`,
          statement: `Permission: ${rendered}`,
          oracle: `Only ${role} may access ${target}`,
          source: entry.source || relativeSource,
          confidence: entry.confidence || 'verified',
        });
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
  return modelCollected;
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

function collectJson(node, parentKey = '', sourcePath = '') {
  if (Array.isArray(node)) {
    node.forEach(item => collectJson(item, parentKey, sourcePath));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (!objectMatchesScope(node) && (node.module || node.feature || node.slug || node.pageSlug)) return;

  for (const [key, value] of Object.entries(node)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');

    if (/^(businessmodel|businessgraph|domainmodel|domaingraph|invariants|businessassertions)$/.test(normalized)) {
      collectExplicitBusinessModel({ business_model: normalized === 'invariants' || normalized === 'businessassertions'
        ? { invariants: value }
        : value }, sourcePath || path.join(DATA_DIR, 'knowledge-json'));
    }

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

    if (value && typeof value === 'object') collectJson(value, key || parentKey, sourcePath);
  }
}

function collectMarkdown(markdown, sourcePath) {
  let section = '';
  let currentBusinessRule = '';
  let currentBusinessRuleConfidence = 'documented';
  const source = path.relative(DATA_DIR, sourcePath);
  const record = (destination, kind, value) => {
    if (!isUsefulSignal(value)) return;
    destination.push(value);
    addEvidence(kind, value, source, 'documented');
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const indentation = (rawLine.match(/^\s*/) || [''])[0].length;
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level <= 2) {
        section = title.toLowerCase();
        if (!section.includes('business rule')) {
          currentBusinessRule = '';
          currentBusinessRuleConfidence = 'documented';
        }
      }
      if (level === 3 && section.includes('happy business flow') && /^step\s+\d+/i.test(title)) {
        record(result.happyFlow, 'business_flow', title);
      }
      continue;
    }
    if (!/^[-*]\s+/.test(line)) continue;
    const text = line.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
    if (!text) continue;
    const detailLine = /^(status|observed|evidence|implementation|behavior|severity|impact|source|confidence):/i.test(text);

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
      } else if (detailLine) {
        addEvidence('knowledge_detail', text, source, 'documented');
      } else {
        record(result.happyFlow, 'business_flow', text);
      }
    }
    if (detailLine) {
      const detailValue = text.replace(/^[^:]+:\s*/, '').trim();
      const statusMatch = text.match(/^status:\s*(.+)$/i);
      if (statusMatch && /business rule/i.test(section) && indentation > 0) {
        currentBusinessRuleConfidence = modelConfidence(statusMatch[1], 'documented');
        const primaryInvariant = result.businessModel.invariants.find(item => (
          item.id === modelId(`documented-rule-${currentBusinessRule}`)
        ));
        if (primaryInvariant) primaryInvariant.confidence = currentBusinessRuleConfidence;
      }
      if (/(procedure_version_id|one result|một result|selected version|version identity|version.*result|result.*version|version.*id|distinct.*id|do not collapse|status.*conclusion|result text|ct17|ct15|ct16|denominator|doc_type)/i.test(detailValue)) {
        addModelInvariant({
          id: `detail-invariant-${detailValue}`,
          statement: detailValue,
          oracle: detailValue,
          source,
          confidence: currentBusinessRuleConfidence,
        });
      }
      addEvidence('knowledge_detail', text, source, 'documented');
      continue;
    }
    if (/(business rule|quy tắc nghiệp vụ|nguyên tắc nghiệp vụ)/i.test(section)) {
      record(result.businessRules, 'business_rule', text);
      if (indentation <= 1) {
        currentBusinessRule = text;
        currentBusinessRuleConfidence = 'documented';
      }
      addModelInvariant({
        id: `documented-rule-${text}`,
        statement: text,
        oracle: text,
        source,
        confidence: currentBusinessRuleConfidence,
      });
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

const cardPath = deriveCardPath(OUTPUT);
const budgetPath = path.join(path.dirname(cardPath), 'context-budget.json');
const cachedBriefPreflight = readJson(OUTPUT);
const inventory = sourceInventoryFingerprint();

function buildInputFingerprint(sourceFiles) {
  return hashValue({
    builder: CONTEXT_BUILDER_VERSION,
    intent: INTENT,
    scope: SCOPE,
    run_mode: RUN_MODE,
    target: TARGET,
    expected: EXPECTED,
    role: ROLE,
    impact: IMPACT,
    ticket: TICKET,
    card_max_estimated_tokens: CARD_MAX_TOKENS,
    source_files: sourceFiles,
  });
}

// Do not read every knowledge artifact again on a repeated run when the
// metadata inventory and invocation contract are unchanged. The old content
// hash cache below remains as a compatibility fallback for older briefs.
if (
  !NO_CACHE
  && cachedBriefPreflight?.source_inventory_fingerprint === inventory.fingerprint
  && Array.isArray(cachedBriefPreflight.source_files)
  && fs.existsSync(cardPath)
  && fs.existsSync(budgetPath)
) {
  const preflightFingerprint = buildInputFingerprint(cachedBriefPreflight.source_files);
  if (cachedBriefPreflight.input_fingerprint === preflightFingerprint) {
    const cachedBudget = readJson(budgetPath);
    if (cachedBudget && typeof cachedBudget === 'object') {
      cachedBudget.cache_hit = true;
      cachedBudget.cache_mode = 'stat_fast';
      cachedBudget.cache_key = preflightFingerprint;
      cachedBudget.cache_hit_at = new Date().toISOString();
      fs.writeFileSync(budgetPath, JSON.stringify(cachedBudget, null, 2), 'utf8');
    }
    console.log(`[business-context] CACHE_HIT_FAST: ${OUTPUT}`);
    console.log(
      `[business-context] sources=${cachedBriefPreflight.source_files.length}`
      + ` inventory=${inventory.fingerprint}`,
    );
    process.exit(statusCode(cachedBriefPreflight.status));
  }
}

const sources = candidateSources();
const sourceFiles = sources.map(source => ({
  path: path.relative(DATA_DIR, source),
  sha256_12: hashFile(source),
}));
const inputFingerprint = buildInputFingerprint(sourceFiles);
const cachedBrief = readJson(OUTPUT);
if (
  !NO_CACHE
  && cachedBrief?.input_fingerprint === inputFingerprint
  && fs.existsSync(cardPath)
  && fs.existsSync(budgetPath)
) {
  const cachedBudget = readJson(budgetPath);
  if (cachedBudget && typeof cachedBudget === 'object') {
    cachedBudget.cache_hit = true;
    cachedBudget.cache_mode = 'content_hash';
    cachedBudget.cache_key = inputFingerprint;
    cachedBudget.cache_hit_at = new Date().toISOString();
    fs.writeFileSync(budgetPath, JSON.stringify(cachedBudget, null, 2), 'utf8');
  }
  console.log(`[business-context] CACHE_HIT: ${OUTPUT}`);
  console.log(`[business-context] sources=${sourceFiles.length} fingerprint=${inputFingerprint}`);
  process.exit(statusCode(cachedBrief.status));
}

for (const source of sources) {
  const text = safeRead(source);
  if (!text) continue;
  if (source.endsWith('.json')) {
    try {
      const data = JSON.parse(text);
      const collected = collectKnownArtifact(data, source);
      const repositoryArtifact = source.includes(`${path.sep}repositories${path.sep}`);
      if (!collected && !repositoryArtifact) collectJson(data, '', source);
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

function deriveBusinessModelFromFacts() {
  const fallbackSource = sourceFiles[0]?.path || 'derived-context';
  for (const route of result.routes.slice(0, 20)) {
    addModelNode({
      id: `route-${route}`,
      type: 'route',
      label: route,
      source: sourceEvidence.find(item => item.kind === 'route' && item.value === route)?.source || fallbackSource,
      confidence: 'documented',
    });
  }
  for (const role of result.roles.slice(0, 20)) {
    addModelNode({
      id: `role-${role}`,
      type: 'role',
      label: role,
      source: sourceEvidence.find(item => item.kind === 'role' && item.value === role)?.source || fallbackSource,
      confidence: 'documented',
    });
  }
  for (const contract of result.apiContracts.slice(0, 20)) {
    const endpointId = addModelNode({
      id: `contract-${contract}`,
      type: 'endpoint',
      label: contract,
      source: sourceEvidence.find(item => item.kind === 'api_contract' && item.value === contract)?.source || fallbackSource,
      confidence: 'documented',
    });
    const methodPath = String(contract).match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
    if (methodPath && result.routes.includes(methodPath[2])) {
      const routeId = addModelNode({
        id: `route-${methodPath[2]}`,
        type: 'route',
        label: methodPath[2],
        source: fallbackSource,
        confidence: 'documented',
      });
      addModelRelation({
        from: routeId,
        to: endpointId,
        type: 'implements',
        source: fallbackSource,
        confidence: 'documented',
      });
    }
  }

  for (const state of result.states.slice(0, 30)) {
    const transition = String(state).match(/^(.+?):\s*([^|]+?)\s*->\s*([^|]+)$/);
    if (!transition) continue;
    const source = sourceEvidence.find(item => item.kind === 'state_transition' && item.value === state)?.source || fallbackSource;
    const fromId = addModelNode({
      id: `${transition[1]}-${transition[2]}`,
      type: 'state',
      label: transition[2],
      source,
      confidence: 'documented',
    });
    const toId = addModelNode({
      id: `${transition[1]}-${transition[3]}`,
      type: 'state',
      label: transition[3],
      source,
      confidence: 'documented',
    });
    addModelRelation({ from: fromId, to: toId, type: 'allowed_transition', source, confidence: 'documented' });
  }

  const factText = [
    ...result.businessRules,
    ...result.expectedResults,
    ...result.apiContracts,
    ...result.happyFlow,
  ].join(' | ');
  const versionSource = sourceEvidence.find(item => (
    /version|phiên bản|procedure_version_id|one result|một kết quả|selected/i.test(item.value)
  ))?.source || fallbackSource;
  if (
    /version|phiên bản/i.test(factText)
    && /(result|kết quả|procedure_version_id|selected|được chọn)/i.test(factText)
  ) {
    addModelInvariant({
      id: 'selected-version-result-mapping',
      statement: 'Mỗi procedure version được chọn phải ánh xạ đúng một result tương ứng và giữ đúng procedure_version_id',
      oracle: 'Đối chiếu selected procedure_version_ids với result IDs, số lượng và kết luận có ý nghĩa',
      source: versionSource,
      confidence: sourceEvidence.some(item => item.source === versionSource && item.confidence === 'verified')
        ? 'verified'
        : 'inferred',
    });
  }
  const formula = result.businessRules.find(rule => /ct17|ct15|ct16/i.test(rule));
  if (formula) {
    addModelInvariant({
      id: 'tax-formula-consistency',
      statement: formula,
      oracle: 'Tính lại công thức từ các ô nguồn và đối chiếu với giá trị hiển thị hoặc persisted result',
      source: sourceEvidence.find(item => item.value === formula)?.source || fallbackSource,
      confidence: 'documented',
    });
  }
}

deriveBusinessModelFromFacts();

if (TARGET) result.routes.unshift(TARGET);
if (ROLE) result.roles.unshift(ROLE);
if (EXPECTED) result.expectedResults.unshift(EXPECTED);

for (const key of Object.keys(result)) {
  if (key === 'businessModel') continue;
  if (key === 'unresolved') {
    result[key] = result[key].filter(value => (
      !/^`?(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^`]+`?$/i.test(String(value).trim())
    ));
  }
  result[key] = clipped(result[key]);
}

const modelConfidenceRank = {
  runtime_verified: 0,
  verified: 0,
  documented: 1,
  'source-derived-candidate': 2,
  inferred: 3,
  ambiguous: 4,
};
result.businessModel.nodes = result.businessModel.nodes
  .filter(node => isUsefulSignal(node.id) && isUsefulSignal(node.label))
  .slice(0, 40);
result.businessModel.relations = result.businessModel.relations
  .filter(relation => isUsefulSignal(relation.from) && isUsefulSignal(relation.to))
  .slice(0, 60);
const modelInvariantSignal = value => {
  const rendered = `${value.statement} ${value.oracle}`;
  return (
    (/(procedure_version_id)/i.test(rendered) ? 12 : 0)
    + (/(one result|một result|result.*version|version.*result)/i.test(rendered) ? 10 : 0)
    + (/(ct17|ct15|ct16|formula|công thức)/i.test(rendered) ? 12 : 0)
    + (/(status.*conclusion|meaningful|kết luận|denominator)/i.test(rendered) ? 8 : 0)
    + (/(selected|được chọn|mapping|ánh xạ|version|phiên bản)/i.test(rendered) ? 3 : 0)
  );
};
result.businessModel.invariants = result.businessModel.invariants
  .filter(invariant => isUsefulSignal(invariant.statement))
  .sort((left, right) => (
    (modelInvariantSignal(right) - modelInvariantSignal(left))
    || ((modelConfidenceRank[left.confidence] ?? 9) - (modelConfidenceRank[right.confidence] ?? 9))
  ))
  .slice(0, 12);

function evidenceFor(pattern) {
  return sourceEvidence
    .filter(item => pattern.test(`${item.kind} ${item.value}`))
    .sort((left, right) => {
      const confidence = { verified: 0, documented: 1, 'source-derived-candidate': 2, inferred: 3, ambiguous: 4 };
      const leftScope = `${left.value} ${left.source}`.toLowerCase().includes(scopeKey) ? 0 : 1;
      const rightScope = `${right.value} ${right.source}`.toLowerCase().includes(scopeKey) ? 0 : 1;
      return (leftScope - rightScope)
        || ((confidence[left.confidence] ?? 9) - (confidence[right.confidence] ?? 9));
    })
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
  const modelText = JSON.stringify(context.business_model || {});
  const versionMappingInvariant = context.business_model?.invariants?.find(item => (
    /procedure_version_id|selected|version|phiên bản/i.test(`${item.statement} ${item.oracle}`)
    && /result|kết quả|mapping|ánh xạ/i.test(`${item.statement} ${item.oracle}`)
  ));

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

  if (
    /procedure_version_id|selected-version-result-mapping|one result per|mỗi .*result|multiple versions/i.test(modelText + rulesText + apiText)
    || (/(version|phiên bản)/i.test(modelText + rulesText) && /(result|kết quả)/i.test(modelText + rulesText))
  ) {
    add(
      'version-result-integrity',
      'high',
      'Khi chạy nhiều phiên hoặc nhiều version, result có thể lệch procedure_version_id, sai denominator hoặc pass nhưng thiếu kết luận có ý nghĩa',
      versionMappingInvariant?.oracle
        || 'Đối chiếu selected version IDs với từng result, số lượng result và nội dung kết luận của từng version',
      evidenceFor(/model_invariant|version|result|procedure_version_id|api_contract/i),
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

  const scoreRisk = risk => {
    const factors = [];
    let score = { critical: 100, high: 80, medium: 50, low: 20 }[risk.priority] || 10;
    const addScore = (value, label) => {
      score += value;
      factors.push(`${label}+${value}`);
    };

    if (context.roles.length > 1) addScore(8, 'multiple_roles');
    if (context.states.length) addScore(8, 'state_model');
    if (risk.category === 'version-result-integrity') addScore(10, 'version_mapping');
    if (context.apiContracts.some(contract => /^(POST|PUT|PATCH|DELETE)/i.test(contract))) {
      addScore(10, 'mutation_surface');
    }
    if (context.impactAreas.some(area => /(payment|queue|event|email|sms|external|cache|integration)/i.test(area))) {
      addScore(8, 'external_side_effect');
    }
    if (context.unresolved.length || context.knownIssues.length) addScore(7, 'uncertainty_or_known_issue');
    if (!runtimeEvidencePresent) addScore(5, 'runtime_not_correlated');
    if (risk.source_refs.length > 1) addScore(Math.min(6, risk.source_refs.length), 'cross_source_evidence');
    return { ...risk, score, score_factors: factors };
  };
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return risks
    .map(scoreRisk)
    .sort((a, b) => (rank[a.priority] - rank[b.priority]) || (b.score - a.score))
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
    'version-result-integrity': ['mapping-integrity', 'count-denominator', 'per-version oracle'],
  };
  const expectationPatterns = {
    'authorization-boundary': /(unauthor|forbidden|access|permission|quyền)/i,
    'state-integrity': /(state|status|trạng thái)/i,
    'validation-data-integrity': /(invalid|duplicate|tồn tại|không hợp lệ|not found|số dư)/i,
    'version-result-integrity': /(version|phiên bản|result|kết quả|mapping|ánh xạ)/i,
  };
  const mutationTargets = context.apiContracts.filter(contract => /^(POST|PUT|PATCH|DELETE)/i.test(contract));

  return risks.slice(0, 6).map((risk, index) => {
    const expectationPattern = expectationPatterns[risk.category];
    const matchingExpectations = expectationPattern
      ? context.expectedResults.filter(value => expectationPattern.test(value)).slice(0, 3)
      : [];
    return {
      charter_id: `EXP-${String(index + 1).padStart(2, '0')}`,
      risk_id: risk.risk_id,
      risk_score: risk.score,
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
const highRiskRefs = new Set(riskInventory
  .filter(risk => ['critical', 'high'].includes(risk.priority))
  .flatMap(risk => risk.source_refs));
const evidenceConfidence = {
  verified: 0,
  documented: 1,
  'source-derived-candidate': 2,
  inferred: 3,
  ambiguous: 4,
};
const rankedSourceEvidence = [...sourceEvidence].sort((left, right) => {
  const leftText = `${left.value} ${left.source}`.toLowerCase();
  const rightText = `${right.value} ${right.source}`.toLowerCase();
  const leftPriority = highRiskRefs.has(left.source) ? 0 : 1;
  const rightPriority = highRiskRefs.has(right.source) ? 0 : 1;
  const leftScope = leftText.includes(scopeKey) ? 0 : 1;
  const rightScope = rightText.includes(scopeKey) ? 0 : 1;
  const evidenceKind = {
    model_invariant: 0,
    business_rule: 1,
    api_contract: 1,
    state_model: 1,
    state_transition: 1,
    business_flow: 2,
    flow_step: 2,
    knowledge_detail: 3,
  };
  return (leftPriority - rightPriority)
    || (leftScope - rightScope)
    || ((evidenceKind[left.kind] ?? 4) - (evidenceKind[right.kind] ?? 4))
    || ((evidenceConfidence[left.confidence] ?? 9) - (evidenceConfidence[right.confidence] ?? 9))
    || left.source.localeCompare(right.source);
});
const selectedSourceEvidence = [];
let knowledgeDetailCount = 0;
for (const evidence of rankedSourceEvidence) {
  if (evidence.kind === 'knowledge_detail') {
    if (knowledgeDetailCount >= 12) continue;
    knowledgeDetailCount += 1;
  }
  selectedSourceEvidence.push(evidence);
  if (selectedSourceEvidence.length >= 30) break;
}
if (
  !selectedSourceEvidence.some(item => item.kind === 'knowledge_detail')
  && rankedSourceEvidence.some(item => item.kind === 'knowledge_detail')
) {
  selectedSourceEvidence.pop();
  selectedSourceEvidence.push(rankedSourceEvidence.find(item => item.kind === 'knowledge_detail'));
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
  schema_version: 2,
  input_fingerprint: inputFingerprint,
  status,
  intent: INTENT,
  scope: SCOPE,
  run_mode: RUN_MODE,
  ticket: TICKET || null,
  generated_at: new Date().toISOString(),
  source_inventory_fingerprint: inventory.fingerprint,
  source_inventory_count: inventory.count,
  source_files: sourceFiles,
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
  source_evidence: selectedSourceEvidence,
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
    business_model: result.businessModel,
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
  context_artifacts: {
    card: path.relative(DATA_DIR, cardPath),
    budget: path.relative(DATA_DIR, budgetPath),
    max_estimated_tokens: CARD_MAX_TOKENS,
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
  '## Business model invariants',
  '',
  ...brief.business_context.business_model.invariants.map(invariant => (
    `- ${invariant.id} [${invariant.confidence}] ${invariant.statement} | Oracle: ${invariant.oracle}`
  )),
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

const cardScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'context-card.mjs');
const cardBuild = spawnSync(process.execPath, [
  cardScript,
  '--brief',
  OUTPUT,
  '--output',
  cardPath,
  '--budget-output',
  budgetPath,
  '--max-estimated-tokens',
  String(CARD_MAX_TOKENS),
], {
  cwd: DATA_DIR,
  env: { ...process.env, QA_DATA_DIR: DATA_DIR },
  encoding: 'utf8',
});
if (cardBuild.stdout) process.stdout.write(cardBuild.stdout);
if (cardBuild.stderr) process.stderr.write(cardBuild.stderr);
if (cardBuild.status !== 0 && cardBuild.status !== 3) {
  console.error(`[business-context] BLOCKED: context card generation failed with exit ${cardBuild.status}`);
  process.exit(2);
}

console.log(`[business-context] ${status}: ${OUTPUT}`);
console.log(
  `[business-context] sources=${sources.length}`
  + ` fingerprint=${inputFingerprint}`
  + ` missing=${missing.join(',') || 'none'}`,
);

process.exit(statusCode(status));
