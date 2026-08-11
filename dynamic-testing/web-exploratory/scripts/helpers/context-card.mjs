#!/usr/bin/env node
/**
 * Build the small, model-facing projection of a Business Execution Brief.
 *
 * The full brief remains the canonical audit artifact. This card is a bounded
 * retrieval surface: it keeps the execution contract, high-risk charters and
 * the evidence needed to start, while pointing back to the full brief for
 * deliberate escalation
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readModelUsage } from '../../lib/model-telemetry.mjs';

const args = process.argv.slice(2);
const getArg = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] || fallback : fallback;
};

const DATA_DIR = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const DEFAULT_BRIEF = path.join(
  DATA_DIR,
  'qa-knowledge',
  'context',
  'business-execution-brief.json',
);
const BRIEF_PATH = path.resolve(getArg('--brief', DEFAULT_BRIEF));
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
const DEFAULT_CARD = deriveCardPath(BRIEF_PATH);
const CARD_PATH = path.resolve(getArg('--output', DEFAULT_CARD));
const DEFAULT_BUDGET = 3200;
const MAX_ESTIMATED_TOKENS = Math.max(
  600,
  Number.parseInt(getArg(
    '--max-estimated-tokens',
    process.env.QA_CONTEXT_CARD_MAX_TOKENS || String(DEFAULT_BUDGET),
  ), 10) || DEFAULT_BUDGET,
);
const BUDGET_PATH = path.resolve(getArg(
  '--budget-output',
  path.join(path.dirname(CARD_PATH), 'context-budget.json'),
));
const TOKEN_USAGE_FILE = getArg('--token-usage-file', process.env.QA_TOKEN_USAGE_FILE || '');
const PROVIDER_TOKEN_USAGE = readModelUsage(TOKEN_USAGE_FILE, DATA_DIR);

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const CONFIDENCE_RANK = {
  verified: 0,
  runtime_verified: 0,
  documented: 1,
  'source-derived-candidate': 2,
  inferred: 3,
  ambiguous: 4,
};

export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(Buffer.byteLength(text || '', 'utf8') / 4);
}

function serializedTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return Math.ceil(Buffer.byteLength(text || '', 'utf8') / 4);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sha256_12(filePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);
}

function byteSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function relativeToData(filePath) {
  return path.relative(DATA_DIR, filePath) || path.basename(filePath);
}

function text(value) {
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value).replace(/\s+/g, ' ').trim();
    } catch {
      return '';
    }
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clip(value, max = 480) {
  const rendered = text(value);
  if (rendered.length <= max) return rendered;
  return `${rendered.slice(0, Math.max(1, max - 18))}… [truncated]`;
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function compactValues(value, { maxItems = 8, maxChars = 1800, itemChars = 360 } = {}) {
  const items = [];
  let used = 0;
  let dropped = 0;
  for (const candidate of values(value)) {
    const rendered = clip(candidate, itemChars);
    if (!rendered) continue;
    const cost = Buffer.byteLength(rendered, 'utf8');
    if (items.length >= maxItems || used + cost > maxChars) {
      dropped += 1;
      continue;
    }
    items.push(rendered);
    used += cost;
  }
  return { items, dropped };
}

function compactSourceFiles(files) {
  return values(files).slice(0, 2).map(file => ({
    path: clip(file.path, 180),
    sha256_12: text(file.sha256_12),
  }));
}

function compactRisk(risk) {
  return {
    risk_id: text(risk.risk_id),
    category: text(risk.category),
    priority: text(risk.priority),
    hypothesis: clip(risk.hypothesis, 380),
    oracle: clip(risk.oracle, 380),
    source_refs: compactValues(risk.source_refs, { maxItems: 2, maxChars: 420, itemChars: 180 }).items,
  };
}

function compactCharter(charter) {
  return {
    charter_id: text(charter.charter_id),
    risk_id: text(charter.risk_id),
    priority: text(charter.priority),
    mission: clip(charter.mission, 260),
    target: compactValues(charter.target, { maxItems: 2, maxChars: 400, itemChars: 180 }).items,
    roles: compactValues(charter.roles, { maxItems: 2, maxChars: 300, itemChars: 140 }).items,
    techniques: compactValues(charter.techniques, { maxItems: 3, maxChars: 360, itemChars: 140 }).items,
    oracles: compactValues(charter.oracles, { maxItems: 2, maxChars: 700, itemChars: 360 }).items,
    source_refs: compactValues(charter.source_refs, { maxItems: 2, maxChars: 420, itemChars: 180 }).items,
  };
}

function compactEvidence(evidence) {
  return {
    kind: text(evidence.kind),
    value: clip(evidence.value, 440),
    source: clip(evidence.source, 260),
    confidence: text(evidence.confidence),
  };
}

function compactModelNode(node) {
  return {
    id: text(node.id),
    type: text(node.type),
    label: clip(node.label || node.id, 180),
    confidence: text(node.confidence),
  };
}

function compactModelRelation(relation) {
  return {
    from: text(relation.from),
    to: text(relation.to),
    type: text(relation.type),
    confidence: text(relation.confidence),
  };
}

function compactModelInvariant(invariant) {
  const statement = clip(invariant.statement, 260);
  const oracle = clip(invariant.oracle, 320);
  const compact = {
    id: text(invariant.id),
    statement,
    confidence: text(invariant.confidence),
    source: clip(invariant.source, 100),
  };
  if (oracle && oracle !== statement) compact.oracle = oracle;
  return compact;
}

function compactBusinessModel(model) {
  const confidenceRank = {
    runtime_verified: 0,
    verified: 0,
    documented: 1,
    'source-derived-candidate': 2,
    inferred: 3,
    ambiguous: 4,
  };
  const invariants = values(model?.invariants)
    .filter(Boolean)
    .sort((left, right) => {
      const leftText = text(`${left.statement} ${left.oracle}`).toLowerCase();
      const rightText = text(`${right.statement} ${right.oracle}`).toLowerCase();
      const signal = value => (
        (/(procedure_version_id)/i.test(value) ? 12 : 0)
        + (/(one result|một result|one result per|result.*version|version.*result)/i.test(value) ? 10 : 0)
        + (/(ct17|ct15|ct16|formula|công thức)/i.test(value) ? 12 : 0)
        + (/(status.*conclusion|meaningful|kết luận|denominator)/i.test(value) ? 8 : 0)
        + (/(selected|được chọn|mapping|ánh xạ|version|phiên bản)/i.test(value) ? 3 : 0)
        + (/(must|phải|only|chỉ|equals|bằng)/i.test(value) ? 1 : 0)
      );
      return (signal(rightText) - signal(leftText))
        || ((confidenceRank[left.confidence] ?? 9) - (confidenceRank[right.confidence] ?? 9));
    })
    .slice(0, 2)
    .map(compactModelInvariant);
  return {
    nodes: values(model?.nodes).slice(0, 8).map(compactModelNode),
    relations: values(model?.relations).slice(0, 10).map(compactModelRelation),
    invariants,
  };
}

function prioritySort(a, b) {
  return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
}

function confidenceSort(a, b) {
  return (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9);
}

function sourceRefsFor(items) {
  return new Set(items.flatMap(item => values(item.source_refs).map(text)));
}

function factPriority(key, value) {
  const rendered = text(value).toLowerCase();
  const signals = {
    preconditions: [
      /approved|confirmed|selected|authenticated|compatible|ready|đã duyệt|xác nhận|được chọn/,
    ],
    business_rules: [
      /version|phiên bản|procedure|quy trình|one run|một run|result|kết quả|selected|được chọn/,
      /ct17|ct15|ct16|equals|bằng|must|phải|mapping|mapped|procedure_version_id/,
    ],
    states: [
      /version|phiên bản|run|chạy|result|kết quả|selected|được chọn|approved|đã duyệt/,
    ],
    api_contracts: [
      /post|put|patch|delete|runs?\/|procedures?\//,
      /procedure_version_ids|results\[\]|snapshot_ids/,
    ],
    known_issues: [
      /high|critical|business|result|kết quả|data|dữ liệu|status|trạng thái/,
    ],
  };
  return (signals[key] || []).reduce(
    (score, pattern, index) => score + (pattern.test(rendered) ? (signals[key].length - index) : 0),
    0,
  );
}

function prioritizedFactValues(key, value) {
  const candidates = values(value);
  if (!['preconditions', 'business_rules', 'states', 'api_contracts', 'known_issues'].includes(key)) {
    return candidates;
  }
  return candidates
    .map((candidate, index) => ({ candidate, index, score: factPriority(key, candidate) }))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))
    .map(item => item.candidate);
}

function relatedEvidence(evidence, refs) {
  const all = values(evidence).map(compactEvidence);
  const related = all.filter(item => refs.has(item.source) || [...refs].some(ref => (
    item.source.includes(ref) || ref.includes(item.source)
  )));
  const fallback = related.length ? related : all;
  return fallback.sort(confidenceSort).slice(0, 24);
}

function buildFacts(context) {
  const facts = {};
  const dropped = {};
  const fields = [
    ['routes', 6, 900, 240],
    ['roles', 6, 700, 200],
    ['preconditions', 6, 1400, 360],
    ['business_rules', 10, 2800, 460],
    ['states', 8, 1800, 360],
    ['api_contracts', 8, 1800, 300],
    ['known_issues', 6, 1400, 360],
    ['unresolved', 8, 1800, 420],
  ];
  for (const [key, maxItems, maxChars, itemChars] of fields) {
    const result = compactValues(prioritizedFactValues(key, context?.[key]), {
      maxItems,
      maxChars,
      itemChars,
    });
    facts[key] = result.items;
    if (result.dropped) dropped[key] = result.dropped;
  }
  return { facts, dropped };
}

function trimOptional(card, dropped, maxEstimatedTokens) {
  const trimSteps = [
    ['business_model.relations', ['business_model', 'relations'], 2],
    ['business_model.nodes', ['business_model', 'nodes'], 4],
    ['facts.known_issues', ['facts', 'known_issues'], 1],
    ['facts.api_contracts', ['facts', 'api_contracts'], 1],
    ['facts.states', ['facts', 'states'], 1],
    ['facts.business_rules', ['facts', 'business_rules'], 2],
    ['facts.preconditions', ['facts', 'preconditions'], 1],
    ['risk_inventory.medium_low', 'risk_inventory', 0],
    ['exploratory_charters.medium_low', 'exploratory_charters', 0],
    ['business_model.invariants', ['business_model', 'invariants'], 2],
    ['source_evidence', 'source_evidence', 1],
  ];

  for (const [label, pathValue, configuredMinimumItems] of trimSteps) {
    const list = Array.isArray(pathValue)
      ? pathValue.reduce((node, key) => node?.[key], card)
      : pathValue === 'source_evidence'
        ? card.source_evidence
        : card[pathValue];
    if (!Array.isArray(list)) continue;
    const isRiskOrCharter = label.includes('medium_low');
    const minimumItems = configuredMinimumItems ?? 0;
    while (serializedTokens(card) > maxEstimatedTokens && list.length > minimumItems) {
      if (isRiskOrCharter && ['critical', 'high'].includes(list[list.length - 1]?.priority)) break;
      list.pop();
      dropped[label] = (dropped[label] || 0) + 1;
    }
    if (serializedTokens(card) <= maxEstimatedTokens) break;
  }
}

export function buildContextCard(brief, {
  briefPath = BRIEF_PATH,
  cardPath = CARD_PATH,
  maxEstimatedTokens = MAX_ESTIMATED_TOKENS,
} = {}) {
  if (!brief || typeof brief !== 'object') {
    throw new Error(`Business Execution Brief is invalid: ${briefPath}`);
  }

  const context = brief.business_context || {};
  const risks = values(brief.risk_inventory).filter(Boolean).sort(prioritySort);
  const charters = values(brief.exploratory_charters).filter(Boolean).sort(prioritySort);
  const selectedRisks = risks.filter(item => ['critical', 'high'].includes(item.priority));
  const selectedCharters = charters.filter(item => ['critical', 'high'].includes(item.priority));
  const optionalRisks = risks.filter(item => !['critical', 'high'].includes(item.priority));
  const optionalCharters = charters.filter(item => !['critical', 'high'].includes(item.priority));
  const { facts, dropped: factDrops } = buildFacts(context);
  const businessModel = compactBusinessModel(context.business_model);
  const sourceFileCount = values(brief.source_files).length;
  const sourceFileTruncation = sourceFileCount > 2 ? { source_files: sourceFileCount - 2 } : {};
  const compactContract = {
    target: clip(brief.execution_contract?.target, 320),
    role_data: clip(brief.execution_contract?.role_data, 240),
    original_flow: compactValues(brief.execution_contract?.original_flow, {
      maxItems: 8,
      maxChars: 1900,
      itemChars: 320,
    }).items,
    expected: compactValues(brief.execution_contract?.expected, {
      maxItems: 8,
      maxChars: 1700,
      itemChars: 320,
    }).items,
    impact_area: compactValues(brief.execution_contract?.impact_area, {
      maxItems: 6,
      maxChars: 900,
      itemChars: 220,
    }).items,
    stop_condition: clip(brief.execution_contract?.stop_condition, 240)
      .replace('missing permission/data, or evidence conflict', 'missing permission/data or conflict'),
  };

  const selectedRiskIds = new Set(selectedRisks.map(item => item.risk_id));
  const selectedCharterIds = new Set(selectedCharters.map(item => item.charter_id));
  const allSelected = [...selectedRisks, ...selectedCharters];
  const refs = sourceRefsFor(allSelected);
  const card = {
    schema_version: 1,
    artifact: 'business-execution-card',
    generated_at: new Date().toISOString(),
    status: brief.status,
    intent: brief.intent,
    scope: brief.scope,
    ticket: brief.ticket || null,
    knowledge_health: {
      confidence: brief.knowledge_health?.confidence || 'unknown',
      runtime_evidence_present: Boolean(brief.knowledge_health?.runtime_evidence_present),
      unresolved_count: brief.knowledge_health?.unresolved_count || 0,
    },
    execution_contract: compactContract,
    observability_contract: [
      'final UI state',
      'same-session network/console',
      'persisted state for mutation',
    ],
    business_model: businessModel,
    facts,
    risk_inventory: [...selectedRisks, ...optionalRisks].map(compactRisk),
    exploratory_charters: [...selectedCharters, ...optionalCharters].map(compactCharter),
    source_evidence: relatedEvidence(brief.source_evidence, refs),
    retrieval: {
      full_brief: relativeToData(briefPath),
      full_brief_sha256_12: sha256_12(briefPath),
      source_files: compactSourceFiles(brief.source_files),
      high_risk_ids: [...selectedRiskIds],
      high_charter_ids: [...selectedCharterIds],
      deferred_risk_ids: [],
      deferred_charter_ids: [],
      escalation_rule: 'Escalate on oracle/conflict/truncation',
    },
    budget: {
      max_estimated_tokens: maxEstimatedTokens,
      estimated_tokens: null,
      within_budget: null,
      estimator: 'utf8_bytes_div_4_estimate',
    },
    truncation: {
      fields: { ...factDrops, ...sourceFileTruncation },
      dropped: {},
    },
  };

  const dropped = {};
  const updateDeferred = () => {
    const presentRiskIds = new Set(card.risk_inventory.map(item => item.risk_id));
    const presentCharterIds = new Set(card.exploratory_charters.map(item => item.charter_id));
    card.retrieval.deferred_risk_ids = risks
      .map(item => item.risk_id)
      .filter(Boolean)
      .filter(id => !presentRiskIds.has(id));
    card.retrieval.deferred_charter_ids = charters
      .map(item => item.charter_id)
      .filter(Boolean)
      .filter(id => !presentCharterIds.has(id));
  };
  trimOptional(card, dropped, maxEstimatedTokens);
  updateDeferred();
  card.truncation.dropped = dropped;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const estimated = serializedTokens(card);
    card.budget.estimated_tokens = estimated;
    card.budget.within_budget = estimated <= maxEstimatedTokens;
    if (card.budget.within_budget) break;
    trimOptional(card, dropped, maxEstimatedTokens);
    updateDeferred();
  }
  const finalEstimate = serializedTokens(card);
  card.budget.estimated_tokens = finalEstimate;
  card.budget.within_budget = finalEstimate <= maxEstimatedTokens;
  card.budget.max_estimated_tokens = maxEstimatedTokens;

  fs.mkdirSync(path.dirname(cardPath), { recursive: true });
  let actualCardEstimate = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    fs.writeFileSync(cardPath, JSON.stringify(card, null, 2), 'utf8');
    actualCardEstimate = estimateTokens(fs.readFileSync(cardPath, 'utf8'));
    const actualWithinBudget = actualCardEstimate <= maxEstimatedTokens;
    if (
      card.budget.estimated_tokens === actualCardEstimate
      && card.budget.within_budget === actualWithinBudget
    ) break;
    card.budget.estimated_tokens = actualCardEstimate;
    card.budget.within_budget = actualWithinBudget;
  }

  const briefBytes = byteSize(briefPath);
  const cardBytes = byteSize(cardPath);
  const sourceBytes = values(brief.source_files).reduce((total, file) => {
    const candidate = path.resolve(DATA_DIR, file.path || '');
    return total + byteSize(candidate);
  }, 0);
  const budgetReport = {
    schema_version: 1,
    artifact: 'context-budget',
    estimator: 'utf8_bytes_div_4_estimate',
    token_measurement: PROVIDER_TOKEN_USAGE ? 'provider_reported' : 'deterministic_estimate',
    provider_token_usage: PROVIDER_TOKEN_USAGE,
    generated_at: new Date().toISOString(),
    intent: brief.intent,
    scope: brief.scope,
    status: brief.status,
    cache_hit: false,
    source: {
      file_count: values(brief.source_files).length,
      bytes: sourceBytes,
      estimated_tokens: Math.ceil(sourceBytes / 4),
    },
    canonical_brief: {
      path: relativeToData(briefPath),
      bytes: briefBytes,
      estimated_tokens: estimateTokens(fs.readFileSync(briefPath, 'utf8')),
    },
    model_context_card: {
      path: relativeToData(cardPath),
      bytes: cardBytes,
      estimated_tokens: actualCardEstimate,
      max_estimated_tokens: maxEstimatedTokens,
      within_budget: actualCardEstimate <= maxEstimatedTokens,
    },
    retrieval: {
      high_risk_count: selectedRisks.length,
      high_charter_count: selectedCharters.length,
      deferred_risk_count: card.retrieval.deferred_risk_ids.length,
      deferred_charter_count: card.retrieval.deferred_charter_ids.length,
      source_evidence_count: card.source_evidence.length,
    },
    limitations: [
      ...(PROVIDER_TOKEN_USAGE
        ? []
        : ['Token counts are deterministic UTF-8 byte estimates; provide QA_TOKEN_USAGE_FILE for provider measurements']),
      'The full brief remains the canonical artifact and is available for scoped escalation',
    ],
  };
  fs.mkdirSync(path.dirname(BUDGET_PATH), { recursive: true });
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(budgetReport, null, 2), 'utf8');

  return { card, budgetReport };
}

function run() {
  const brief = readJson(BRIEF_PATH);
  if (!brief) {
    console.error(`[context-card] BLOCKED: invalid or missing brief at ${BRIEF_PATH}`);
    process.exit(2);
  }
  try {
    const { card, budgetReport } = buildContextCard(brief);
    console.log(`[context-card] ${card.status}: ${CARD_PATH}`);
    console.log(
      `[context-card] estimated_tokens=${budgetReport.model_context_card.estimated_tokens}`
      + ` budget=${budgetReport.model_context_card.max_estimated_tokens}`
      + ` evidence=${budgetReport.retrieval.source_evidence_count}`,
    );
    process.exit(card.status === 'READY' ? 0 : card.status === 'NEEDS_DISCOVERY' ? 3 : 2);
  } catch (error) {
    console.error(`[context-card] BLOCKED: ${error.message}`);
    process.exit(2);
  }
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) run();
