#!/usr/bin/env node
/**
 * Runtime guard and ledger for EXPLORATORY_BROWSER_QA / APP_BASELINE_DISCOVERY.
 * EXPLORATORY_ADHOC remains a backward-compatible input alias.
 *
 * The browser driver remains Playwright/CDP/ego/MCP. This helper does not
 * click the page; it makes the agent's observe-plan-act-verify loop durable
 * and fail-closed through a small JSON run state.
 *
 * Commands:
 *   start <run-id?> --scope <feature> [--business-context <path>]
 *   rule-plan <run-id> --rule-plan-file <json>
 *   page <run-id> --page-file <json>
 *   task-plan <run-id> --task-plan-file <json>
 *   agent-context <run-id>
 *   decision <run-id> --decision-file <json>
 *   task-judge <run-id> --judge-file <json>
 *   action <run-id> --action-file <json>
 *   rule-probe <run-id> --probe-file <json>
 *   coverage <run-id> --coverage-file <json>
 *   charter <run-id> --charter-file <json>
 *   finish <run-id> --verdict PASS|FAILED|N/A|UNTEST --reason <text>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateActionSafety } from '../analysis/attack-surface.mjs';
import { resolveModelUsage } from '../../lib/model-telemetry.mjs';
import {
  QA_RESULT_VERDICT_SET,
  normalizeQaResultVerdict,
} from '../../lib/verdicts.mjs';

const DATA_DIR = path.resolve(process.env.QA_DATA_DIR || process.cwd());
const DEFAULT_MAX_ACTIONS = 40;
const DEFAULT_MAX_MS = 300_000;
const DEFAULT_MAX_ACTIONS_PER_CHARTER = 16;
const DEFAULT_MAX_RETRIES_PER_ACTION = 1;
const DEFAULT_MAX_AGENT_REPLANS = 3;
  const DEFAULT_BROWSER_DRIVER = 'playwright-runtime';

const EXPLORATORY_BROWSER_QA = 'EXPLORATORY_BROWSER_QA';
const LEGACY_EXPLORATORY_ADHOC = 'EXPLORATORY_ADHOC';
const ALLOWED_MODES = new Set([EXPLORATORY_BROWSER_QA, 'APP_BASELINE_DISCOVERY']);
const ALLOWED_RUN_VERDICTS = QA_RESULT_VERDICT_SET;
const ALLOWED_CHARTER_VERDICTS = QA_RESULT_VERDICT_SET;
const ALLOWED_ACTION_VERDICTS = new Set([
  'CONFIRMED',
  'DISPROVED',
  'BLOCKED',
  'UNRESOLVED',
  'RECOVERED',
  'FLAKY',
]);
const ALLOWED_OBSERVATION = new Set([
  'observed',
  'no_matching_event',
  'not_applicable',
  'blocked',
]);
const ALLOWED_LOCATOR_STRATEGIES = new Set([
  'AX_SEMANTIC',
  'DATA_TEST_ID',
  'ID',
  'STABLE_CSS',
  'ROLE_LABEL_TEXT',
  'DOM_JS',
  'COORDINATE',
  'XPATH',
  'NATIVE_NAVIGATION',
]);
const ALLOWED_RULE_TYPES = new Set([
  'uniqueness',
  'authorization',
  'side_effect',
  'oracle',
  'coverage',
]);
const ALLOWED_RULE_APPLICABILITY = new Set(['required', 'optional', 'not_applicable']);
const ALLOWED_RULE_OUTCOMES = new Set([
  'RUNTIME_VERIFIED',
  'CONTRADICTED',
  'INCONCLUSIVE',
  'NOT_APPLICABLE',
  'BLOCKED',
  'CANDIDATE',
]);
const ALLOWED_SCOPE_STATUS = new Set(['COMPLETE_FOR_SCOPE', 'PARTIAL', 'BLOCKED']);
const ALLOWED_COVERAGE_STATUS = new Set(['covered', 'partial', 'blocked', 'not_covered', 'excluded']);
const ALLOWED_GOAL_EVALUATIONS = new Set([
  'NOT_STARTED',
  'PROGRESS',
  'ACHIEVED',
  'NO_PROGRESS',
  'CONTRADICTED',
  'BLOCKED',
]);
const ALLOWED_AGENT_DECISIONS = new Set(['ACT', 'REPLAN', 'COMPLETE', 'STOP']);
const ALLOWED_TASK_JUDGEMENTS = new Set(['SATISFIED', 'UNSATISFIED', 'INCONCLUSIVE']);
const ALLOWED_SIGNAL_RESULTS = new Set(['OBSERVED', 'MISSING', 'CONTRADICTED']);
const FORBIDDEN_REASONING_FIELDS = new Set([
  'analysis',
  'chain_of_thought',
  'reasoning_trace',
  'thinking',
]);
const VISUAL_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
]);
const AUTO_OR_UNAVAILABLE = new Set(['', 'auto', 'unavailable', 'not-applicable']);
const ALLOWED_BROWSER_VALUES = new Set([
  'auto',
  'playwright-mcp',
  'chrome-devtools-mcp',
  'ego-browser',
  'antigravity-native',
  'playwright-runtime',
  'unavailable',
  'not-applicable',
]);

const args = process.argv.slice(2);
function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function clip(value, max = 800) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/([?&][^=\s]+)=([^&#\s]+)/g, '$1=<redacted>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function text(value, max = 800) {
  if (value && typeof value === 'object') {
    try {
      return clip(JSON.stringify(value), max);
    } catch {
      return '';
    }
  }
  return clip(value, max);
}

export function normalizeExploratoryMode(value = '') {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (normalized === LEGACY_EXPLORATORY_ADHOC) return EXPLORATORY_BROWSER_QA;
  return normalized;
}

function arrayOf(value) {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function safeArray(value, max = 32, itemMax = 500) {
  return arrayOf(value).map(item => text(item, itemMax)).filter(Boolean).slice(0, max);
}

function compactUnique(value, max = 8, itemMax = 240) {
  const seen = new Set();
  const result = [];
  for (const item of safeArray(value, 64, itemMax)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function readJson(filePath, label) {
  const resolved = path.resolve(DATA_DIR, filePath);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error('file is missing or too large');
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`${label || 'JSON'} is invalid or unavailable: ${resolved} (${error.message})`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hashFile(filePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);
}

function deriveCardPath(briefPath) {
  const replaced = briefPath.replace(
    /business-execution-brief\.json$/i,
    'business-execution-card.json',
  );
  return replaced === briefPath
    ? path.join(path.dirname(briefPath), `${path.basename(briefPath, path.extname(briefPath))}-card.json`)
    : replaced;
}

function runFile(dataDir, runId) {
  return path.join(dataDir, 'evidence', 'exploratory', runId, 'run.json');
}

function loadRun(dataDir, runId) {
  const filePath = runFile(dataDir, runId);
  if (!fs.existsSync(filePath)) throw new Error(`run does not exist: ${runId}`);
  return { run: readJsonFromAbsolute(filePath, `run ${runId}`), filePath };
}

function readJsonFromAbsolute(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid: ${filePath} (${error.message})`);
  }
}

function saveRun(filePath, run) {
  run.updated_at = nowIso();
  writeJson(filePath, run);
  return run;
}

function fail(message, code = 'BLOCKED') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizePriority(value) {
  return String(value || 'medium').trim().toLowerCase();
}

function requiredCharter(charter) {
  return ['critical', 'high'].includes(normalizePriority(charter.priority)) || Boolean(charter.required);
}

function uiFirstCharter(scope) {
  const scopeText = text(scope, 160) || 'current page';
  const suffix = scopeText
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'PAGE';
  const charterId = `UI-FLOW-${suffix}`;
  return {
    charter_id: charterId,
    risk_id: 'UI-FLOW-DISCOVERY',
    priority: 'high',
    mission: `Discover and verify the visible UI flow for ${scopeText}`,
    target: [scopeText],
    roles: ['current browser session'],
    techniques: ['UI flow discovery', 'exploratory', 'ad-hoc', 'UI/UX'],
    oracles: [
      'Visible navigation, state changes, validation and feedback match the action intent',
      'Same-session browser evidence explains the observed UI transition',
    ],
    source_refs: ['runtime:ui-first'],
    required: true,
    status: 'PENDING',
    verdict: null,
    reason: null,
    evidence_refs: [],
    quality: 'CLEAN',
  };
}

function createUiFirstContext({ mode, scope }) {
  const charter = uiFirstCharter(scope);
  const brief = {
    schema_version: 2,
    artifact: 'ui-first-exploratory-context',
    status: 'UI_DISCOVERY',
    intent: mode,
    scope: text(scope, 160),
    source_files: [],
    knowledge_health: {
      source_count: 0,
      runtime_evidence_present: false,
      confidence: 'ui_runtime_pending',
    },
    business_context: {
      routes: [],
      roles: [],
      preconditions: [],
      happy_flow: [],
      business_rules: [],
      expected_results: [],
      states: [],
      impact_areas: [],
      api_contracts: [],
      known_issues: [],
      unresolved: ['Flow and expected signals will be derived from the live UI'],
    },
    risk_inventory: [{
      risk_id: 'UI-FLOW-DISCOVERY',
      priority: 'high',
      category: 'ui_flow',
      hypothesis: 'The visible UI flow can be traversed and its state transitions verified in the current browser session',
      oracle: 'The UI exposes a coherent, observable flow for the requested scope',
      source_refs: ['runtime:ui-first'],
    }],
    exploratory_charters: [charter],
  };
  const card = {
    schema_version: 1,
    artifact: 'ui-first-exploratory-card',
    status: 'UI_DISCOVERY',
    intent: mode,
    scope: text(scope, 160),
    knowledge_health: brief.knowledge_health,
    retrieval: {
      high_charter_ids: [charter.charter_id],
      deferred_charter_ids: [],
    },
    budget: { max_estimated_tokens: 0, estimated_tokens: 0, within_budget: true },
    exploratory_charters: [charter],
  };
  return {
    ui_first: true,
    brief,
    card,
    charters: [charter],
  };
}

function validateBriefAndCard({ mode, scope, briefPath, cardPath }) {
  const uiFirstAllowed = [EXPLORATORY_BROWSER_QA, 'APP_BASELINE_DISCOVERY'].includes(mode);
  if (!fs.existsSync(briefPath) || !fs.existsSync(cardPath)) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    if (!fs.existsSync(briefPath)) fail(`business execution brief is missing: ${briefPath}`);
    fail(`business execution card is missing: ${cardPath}`);
  }

  let brief;
  let card;
  try {
    brief = readJsonFromAbsolute(briefPath, 'business execution brief');
    card = readJsonFromAbsolute(cardPath, 'business execution card');
  } catch (error) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    throw error;
  }

  const allowedStatus = uiFirstAllowed
    ? new Set(['READY', 'NEEDS_DISCOVERY'])
    : new Set(['READY']);
  if (!allowedStatus.has(brief.status) || !allowedStatus.has(card.status)) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    fail(`business execution context is not executable: brief=${brief.status || 'unknown'} card=${card.status || 'unknown'}`);
  }
  const cardBriefHash = card.retrieval?.full_brief_sha256_12;
  if (cardBriefHash && cardBriefHash !== hashFile(briefPath)) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    fail('business execution card is stale relative to the full brief');
  }
  if (
    brief.status === 'NEEDS_DISCOVERY'
    && ![EXPLORATORY_BROWSER_QA, 'APP_BASELINE_DISCOVERY'].includes(mode)
  ) {
    fail('EXPLORATORY_BROWSER_QA requires a READY Business Execution Brief; run scoped discovery first');
  }
  const charters = arrayOf(card.exploratory_charters).filter(Boolean).map(charter => ({
    charter_id: text(charter.charter_id, 120),
    risk_id: text(charter.risk_id, 120),
    priority: normalizePriority(charter.priority),
    mission: text(charter.mission, 500),
    target: safeArray(charter.target, 4),
    roles: safeArray(charter.roles, 4),
    techniques: safeArray(charter.techniques, 6),
    oracles: safeArray(charter.oracles, 8),
    source_refs: safeArray(charter.source_refs, 8),
    required: requiredCharter(charter),
    status: 'PENDING',
    verdict: null,
    reason: null,
    evidence_refs: [],
    quality: 'CLEAN',
  })).filter(charter => charter.charter_id);
  if (!charters.length) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    fail('business execution card has no exploratory charters');
  }

  const highIds = new Set(arrayOf(card.retrieval?.high_charter_ids).map(value => text(value, 120)));
  const deferredIds = new Set(arrayOf(card.retrieval?.deferred_charter_ids).map(value => text(value, 120)));
  for (const charter of charters) {
    if (highIds.has(charter.charter_id)) charter.required = true;
  }
  const deferredRequired = [...deferredIds].filter(id => highIds.has(id));
  if (deferredRequired.length) {
    if (uiFirstAllowed) return createUiFirstContext({ mode, scope });
    fail(`high-priority charters were truncated from the execution card: ${deferredRequired.join(', ')}`);
  }
  return { brief, card, charters, ui_first: false };
}

function normalizeVisualRef(value) {
  const ref = text(value, 700);
  if (!ref) return '';
  if (/^(?:image|video):https?:\/\//i.test(ref) || /^https?:\/\//i.test(ref)) return ref;
  return ref;
}

export function isVisualEvidenceReference(value, dataDir = DATA_DIR) {
  const ref = normalizeVisualRef(value);
  if (!ref) return false;
  if (/^(?:image|video):https?:\/\//i.test(ref) || /^https?:\/\//i.test(ref)) {
    return /\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(ref)
      || /^(?:image|video):https?:\/\//i.test(ref);
  }
  const withoutQuery = ref.split(/[?#]/, 1)[0];
  return VISUAL_EXTENSIONS.has(path.extname(withoutQuery).toLowerCase())
    && fs.existsSync(path.resolve(dataDir, ref));
}

function collectMedia(...values) {
  return [...new Set(values.flatMap(value => arrayOf(value).map(normalizeVisualRef).filter(Boolean)))];
}

function validateBudget(run, filePath = '') {
  const elapsed = Date.now() - new Date(run.started_at).getTime();
  run.budget.elapsed_ms = Math.max(0, elapsed);
  if (run.budget.action_count >= run.budget.max_actions) {
    run.budget.exhausted = true;
    run.stop_reason = `action budget exhausted (${run.budget.max_actions})`;
    if (filePath) saveRun(filePath, run);
    fail(`exploratory action budget exhausted (${run.budget.max_actions})`, 'BUDGET_EXHAUSTED');
  }
  if (elapsed > run.budget.max_ms) {
    run.budget.exhausted = true;
    run.stop_reason = `time budget exhausted (${run.budget.max_ms}ms)`;
    if (filePath) saveRun(filePath, run);
    fail(`exploratory time budget exhausted (${run.budget.max_ms}ms)`, 'BUDGET_EXHAUSTED');
  }
}

function getCharter(run, charterId) {
  const charter = run.charters.find(item => item.charter_id === text(charterId, 120));
  if (!charter) fail(`unknown charter: ${charterId}`);
  return charter;
}

function getPage(run, pageId) {
  const page = run.browser.pages.find(item => item.page_id === text(pageId, 120));
  if (!page) fail(`page is not registered in this session: ${pageId}`);
  return page;
}

function getTaskStep(run, taskStepId) {
  const step = run.agentic_task?.steps?.find(item => item.task_step_id === text(taskStepId, 120));
  if (!step) fail(`unknown agentic task step: ${taskStepId}`);
  return step;
}

function rejectRawReasoning(input, label) {
  const leaked = [];
  const visit = (value, prefix = '', depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${prefix}[${index}]`, depth + 1));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (FORBIDDEN_REASONING_FIELDS.has(key.toLowerCase())) leaked.push(fieldPath);
      else visit(nested, fieldPath, depth + 1);
    }
  };
  visit(input);
  if (leaked.length) {
    fail(`${label} must store a concise rationale, not raw reasoning fields: ${leaked.join(', ')}`);
  }
}

function normalizeTaskSteps(value) {
  if (!Array.isArray(value) || !value.length) fail('agentic task plan requires a non-empty steps array');
  if (value.length > 20) fail('agentic task plan supports at most 20 bounded steps');
  const ids = new Set();
  return value.map((item, index) => {
    const taskStepId = text(item?.task_step_id || item?.step_id || item?.id, 120);
    const goal = text(item?.goal, 500);
    const successSignal = text(item?.success_signal || item?.expected_signal, 700);
    const safetyBoundary = text(item?.safety_boundary || item?.safety_rule, 500);
    if (!taskStepId || ids.has(taskStepId)) {
      fail(`agentic task plan has duplicate or missing task_step_id: ${taskStepId || `step-${index + 1}`}`);
    }
    if (!goal || !successSignal || !safetyBoundary) {
      fail(`agentic task step ${taskStepId} requires goal, success_signal and safety_boundary`);
    }
    ids.add(taskStepId);
    return {
      task_step_id: taskStepId,
      goal,
      success_signal: successSignal,
      safety_boundary: safetyBoundary,
      status: 'PENDING',
      attempts: 0,
      action_ids: [],
      evidence_refs: [],
      completed_at: null,
    };
  });
}

export function setExploratoryTaskPlan({ dataDir = DATA_DIR, runId, plan }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!plan || typeof plan !== 'object') fail('agentic task plan payload is required');
  rejectRawReasoning(plan, 'agentic task plan');
  const page = getPage(run, plan.page_id || run.browser.active_page_id);
  const sessionId = text(plan.session_id, 160);
  const observationRevision = Number(plan.observation_revision);
  if (!sessionId || sessionId !== run.browser.session_id || sessionId !== page.session_id) {
    fail('agentic task plan session_id does not match the registered browser session/page');
  }
  if (!Number.isInteger(observationRevision) || observationRevision < 1) {
    fail('agentic task plan requires observation_revision >= 1 from the live page');
  }
  const objective = text(plan.objective || run.agentic_task?.objective || run.scope, 500);
  const successSignals = compactUnique(plan.success_signals, 8, 400);
  const stopConditions = compactUnique(plan.stop_conditions, 8, 400);
  const rationale = text(plan.rationale, 320);
  if (!objective || !successSignals.length || !stopConditions.length || !rationale) {
    fail('agentic task plan requires objective, success_signals, stop_conditions and concise rationale');
  }
  const previous = run.agentic_task || {};
  const isReplan = previous.status && previous.status !== 'UNPLANNED';
  const replanReason = text(plan.replan_reason, 320);
  if (isReplan && !replanReason) fail('replacing an agentic task plan requires replan_reason');
  if (isReplan && Number(previous.replan_count || 0) >= Number(previous.max_replans || DEFAULT_MAX_AGENT_REPLANS)) {
    fail(`agentic task replan budget exhausted (${previous.max_replans || DEFAULT_MAX_AGENT_REPLANS})`, 'BUDGET_EXHAUSTED');
  }
  const steps = normalizeTaskSteps(plan.steps);
  const planRevision = Number(previous.plan_revision || 0) + 1;
  const history = Array.isArray(previous.plan_history) ? previous.plan_history : [];
  if (isReplan) {
    history.push({
      plan_revision: previous.plan_revision,
      objective: previous.objective,
      steps: previous.steps,
      replaced_at: nowIso(),
      replan_reason: replanReason,
    });
  }
  run.agentic_task = {
    ...previous,
    status: 'READY',
    objective,
    success_signals: successSignals,
    stop_conditions: stopConditions,
    constraints: compactUnique(plan.constraints, 8, 300),
    rationale,
    plan_revision: planRevision,
    plan_history: history.slice(-DEFAULT_MAX_AGENT_REPLANS),
    current_step_id: steps[0].task_step_id,
    steps,
    decisions: Array.isArray(previous.decisions) ? previous.decisions : [],
    compact_memory: compactUnique(previous.compact_memory, 8, 240),
    no_progress_count: 0,
    requires_replan: false,
    replan_count: Number(previous.replan_count || 0) + (isReplan ? 1 : 0),
    max_replans: Number(previous.max_replans || DEFAULT_MAX_AGENT_REPLANS),
    judge: null,
    source_observation: {
      session_id: sessionId,
      page_id: page.page_id,
      revision: observationRevision,
      url: page.url,
    },
    updated_at: nowIso(),
  };
  saveRun(filePath, run);
  return { run, taskPlan: run.agentic_task, filePath };
}

function nextPendingTaskStep(task, currentStepId) {
  const currentIndex = task.steps.findIndex(item => item.task_step_id === currentStepId);
  return task.steps.slice(currentIndex + 1).find(item => item.status === 'PENDING')
    || task.steps.find(item => item.status === 'PENDING')
    || null;
}

export function recordExploratoryTaskDecision({ dataDir = DATA_DIR, runId, decision: input }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!input || typeof input !== 'object') fail('agentic task decision payload is required');
  rejectRawReasoning(input, 'agentic task decision');
  const task = run.agentic_task;
  if (!task || !['READY', 'IN_PROGRESS'].includes(task.status)) {
    fail('set an agentic task plan before recording a decision');
  }
  if (task.requires_replan) fail('agentic task detected repeated no-progress; record a replan before another action');
  const page = getPage(run, input.page_id || run.browser.active_page_id);
  const sessionId = text(input.session_id, 160);
  const observationRevision = Number(input.observation_revision);
  if (!sessionId || sessionId !== run.browser.session_id || sessionId !== page.session_id) {
    fail('agentic task decision session_id does not match the registered browser session/page');
  }
  if (!Number.isInteger(observationRevision) || observationRevision < 1) {
    fail('agentic task decision requires observation_revision >= 1');
  }
  const step = getTaskStep(run, input.task_step_id || task.current_step_id);
  const evaluation = text(input.evaluation_previous_goal, 80).toUpperCase();
  const decisionType = text(input.decision, 80).toUpperCase();
  const nextGoal = text(input.next_goal, 320);
  const rationale = text(input.rationale, 280);
  if (!ALLOWED_GOAL_EVALUATIONS.has(evaluation)) fail(`unsupported previous-goal evaluation: ${evaluation || 'missing'}`);
  if (!ALLOWED_AGENT_DECISIONS.has(decisionType)) fail(`unsupported agentic decision: ${decisionType || 'missing'}`);
  if (!rationale) fail('agentic task decision requires a concise rationale');
  const selected = input.selected_action || {};
  const selectedAction = {
    type: text(selected.type || selected.action_type, 80).toLowerCase(),
    semantic_target: text(selected.semantic_target || selected.target, 300),
    expected_signal: text(selected.expected_signal, 400),
    safety_boundary: text(selected.safety_boundary || step.safety_boundary, 300),
  };
  if (decisionType === 'ACT' && (!nextGoal || !selectedAction.type || !selectedAction.semantic_target
    || !selectedAction.expected_signal || !selectedAction.safety_boundary)) {
    fail('ACT decision requires next_goal and selected_action type, semantic_target, expected_signal and safety_boundary');
  }
  if (decisionType === 'REPLAN' && !text(input.replan_reason, 320)) {
    fail('REPLAN decision requires replan_reason');
  }
  const memory = compactUnique(input.memory, 4, 240);
  const previous = task.decisions[task.decisions.length - 1];
  const fingerprint = decisionType === 'ACT'
    ? [page.page_id, step.task_step_id, nextGoal, selectedAction.type, selectedAction.semantic_target]
      .map(value => text(value, 300).toLowerCase()).join('|')
    : '';
  const repeatedNoProgress = evaluation === 'NO_PROGRESS'
    && previous?.evaluation_previous_goal === 'NO_PROGRESS'
    && previous?.fingerprint === fingerprint;
  task.no_progress_count = evaluation === 'NO_PROGRESS'
    ? Number(task.no_progress_count || 0) + 1
    : 0;
  if (repeatedNoProgress || task.no_progress_count >= 2) task.requires_replan = true;
  const record = {
    decision_id: `DEC-${String(task.decisions.length + 1).padStart(4, '0')}`,
    task_step_id: step.task_step_id,
    charter_id: text(input.charter_id, 120) || null,
    session_id: sessionId,
    page_id: page.page_id,
    observation_revision: observationRevision,
    evaluation_previous_goal: evaluation,
    decision: decisionType,
    next_goal: nextGoal || null,
    selected_action: decisionType === 'ACT' ? selectedAction : null,
    alternatives_considered: compactUnique(input.alternatives_considered, 2, 240),
    rationale,
    memory,
    replan_reason: text(input.replan_reason, 320) || null,
    evidence_refs: compactUnique(input.evidence_refs, 8, 300),
    fingerprint,
    action_id: null,
    recorded_at: nowIso(),
  };
  task.decisions.push(record);
  task.compact_memory = compactUnique([...memory, ...task.compact_memory], 8, 240);
  task.status = decisionType === 'COMPLETE' ? 'COMPLETED'
    : decisionType === 'STOP' ? 'STOPPED'
      : 'IN_PROGRESS';
  if (evaluation === 'ACHIEVED') {
    step.status = 'COMPLETED';
    step.completed_at = nowIso();
    step.evidence_refs = safeArray([...step.evidence_refs, ...record.evidence_refs], 16);
    const nextStep = nextPendingTaskStep(task, step.task_step_id);
    task.current_step_id = nextStep?.task_step_id || null;
  } else {
    step.status = 'IN_PROGRESS';
    step.attempts += decisionType === 'ACT' ? 1 : 0;
    task.current_step_id = step.task_step_id;
  }
  if (decisionType === 'REPLAN') task.requires_replan = true;
  task.updated_at = nowIso();
  saveRun(filePath, run);
  return { run, decision: record, filePath };
}

export function getExploratoryAgentContext({ dataDir = DATA_DIR, runId }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  const task = run.agentic_task || {};
  const page = run.browser.pages.find(item => item.page_id === run.browser.active_page_id) || null;
  const currentStep = task.steps?.find(item => item.task_step_id === task.current_step_id) || null;
  const lastDecision = task.decisions?.[task.decisions.length - 1] || null;
  const payload = {
    run_id: run.run_id,
    status: run.status,
    scope: run.scope,
    browser: {
      session_id: run.browser.session_id,
      page_id: page?.page_id || run.browser.active_page_id,
      url: page?.url || null,
      title: page?.title || null,
    },
    budget: {
      action_count: run.budget.action_count,
      max_actions: run.budget.max_actions,
      elapsed_ms: run.budget.elapsed_ms,
      max_ms: run.budget.max_ms,
    },
    task: {
      status: task.status,
      objective: task.objective,
      success_signals: task.success_signals || [],
      stop_conditions: task.stop_conditions || [],
      current_step: currentStep ? {
        task_step_id: currentStep.task_step_id,
        goal: currentStep.goal,
        success_signal: currentStep.success_signal,
        safety_boundary: currentStep.safety_boundary,
        status: currentStep.status,
        attempts: currentStep.attempts,
      } : null,
      compact_memory: compactUnique(task.compact_memory, 8, 240),
      requires_replan: Boolean(task.requires_replan),
      replan_count: Number(task.replan_count || 0),
      max_replans: Number(task.max_replans || DEFAULT_MAX_AGENT_REPLANS),
      last_decision: lastDecision ? {
        decision_id: lastDecision.decision_id,
        evaluation_previous_goal: lastDecision.evaluation_previous_goal,
        decision: lastDecision.decision,
        next_goal: lastDecision.next_goal,
        selected_action: lastDecision.selected_action,
        observed_delta: lastDecision.observed_delta || null,
        action_id: lastDecision.action_id,
      } : null,
    },
    rule_plan: {
      status: run.rule_discovery?.status,
      pending_probe_ids: (run.rule_discovery?.probes || [])
        .filter(item => !item.outcome)
        .map(item => item.probe_id)
        .slice(0, 12),
      gap_count: run.rule_discovery?.gaps?.length || 0,
    },
    evidence: {
      media_count: run.evidence?.media_refs?.length || 0,
      network_count: run.evidence?.network_refs?.length || 0,
      console_count: run.evidence?.console_refs?.length || 0,
      page_error_count: run.evidence?.page_error_refs?.length || 0,
    },
    run_file: filePath,
  };
  const estimatedChars = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  payload.context_budget = {
    estimated_chars: estimatedChars,
    estimated_tokens_utf8_div4: Math.ceil(estimatedChars / 4),
    source: 'compact-agent-context',
  };
  return payload;
}

export function recordExploratoryTaskJudge({ dataDir = DATA_DIR, runId, judge: input }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!input || typeof input !== 'object') fail('agentic task judge payload is required');
  rejectRawReasoning(input, 'agentic task judge');
  const task = run.agentic_task;
  if (!task || task.status !== 'COMPLETED') fail('task judge requires a COMPLETED agentic task');
  const judgement = text(input.judgement || input.verdict, 80).toUpperCase();
  if (!ALLOWED_TASK_JUDGEMENTS.has(judgement)) {
    fail(`task judgement must be SATISFIED, UNSATISFIED or INCONCLUSIVE: ${judgement || 'missing'}`);
  }
  const reason = text(input.reason, 800);
  if (!reason) fail('task judge requires a concise reason');
  const supplied = Array.isArray(input.success_signal_results) ? input.success_signal_results : [];
  const bySignal = new Map(supplied.map(item => [text(item?.signal, 700).toLowerCase(), item]));
  const signalResults = task.success_signals.map(signal => {
    const item = bySignal.get(text(signal, 700).toLowerCase());
    if (!item) fail(`task judge is missing success signal: ${signal}`);
    const status = text(item.status, 80).toUpperCase();
    if (!ALLOWED_SIGNAL_RESULTS.has(status)) fail(`unsupported success signal result: ${status || 'missing'}`);
    const evidenceRefs = safeArray(item.evidence_refs, 16);
    if (status === 'OBSERVED' && !evidenceRefs.length) {
      fail(`observed success signal requires evidence_refs: ${signal}`);
    }
    return {
      signal,
      status,
      actual: text(item.actual, 800) || null,
      evidence_refs: evidenceRefs,
    };
  });
  if (judgement === 'SATISFIED' && signalResults.some(item => item.status !== 'OBSERVED')) {
    fail('SATISFIED task judgement requires every success signal to be OBSERVED');
  }
  if (judgement === 'UNSATISFIED' && signalResults.every(item => item.status === 'OBSERVED')) {
    fail('UNSATISFIED task judgement requires a missing or contradicted success signal');
  }
  const record = {
    judgement,
    reason,
    success_signal_results: signalResults,
    evidence_refs: safeArray([
      ...safeArray(input.evidence_refs, 20),
      ...signalResults.flatMap(item => item.evidence_refs),
    ], 32),
    judged_at: nowIso(),
  };
  task.judge = record;
  task.updated_at = nowIso();
  saveRun(filePath, run);
  return { run, judge: record, filePath };
}

function validateLocatorEvidence(input, actionVerdict, dataDir = DATA_DIR) {
  const locator = input.locator_evidence || {};
  const strategy = text(locator.strategy, 80).toUpperCase();
  if (!ALLOWED_LOCATOR_STRATEGIES.has(strategy)) {
    fail(`locator strategy is invalid: ${strategy || 'missing'}`);
  }
  const verified = locator.verified === true;
  if (actionVerdict !== 'BLOCKED' && !verified) {
    fail('executed action requires locator_evidence.verified=true');
  }
  if (strategy === 'DATA_TEST_ID' && !['live_dom', 'fe_source', 'charter'].includes(text(locator.source, 80))) {
    fail('data-testid must be verified from live_dom, fe_source or charter');
  }
  if (strategy === 'XPATH' && !text(locator.fallback_reason, 300)) {
    fail('XPath requires a recorded fallback_reason');
  }
  if (strategy === 'COORDINATE') {
    const box = locator.bounding_box;
    if (!box || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(Number(box[key])))) {
      fail('coordinate fallback requires bounding_box x/y/width/height');
    }
    if (!collectMedia(input.media_refs).some(ref => isVisualEvidenceReference(ref, dataDir))) {
      fail('coordinate fallback requires screenshot/video evidence');
    }
  }
  return {
    strategy,
    selector: text(locator.selector || locator.target, 500),
    source: text(locator.source, 120),
    verified,
    fallback_reason: text(locator.fallback_reason, 300) || null,
    bounding_box: locator.bounding_box || null,
  };
}

function normalizeObservation(value, key) {
  const normalized = text(value, 80).toLowerCase();
  if (!ALLOWED_OBSERVATION.has(normalized)) {
    fail(`observability.${key} must be observed, no_matching_event, not_applicable or blocked`);
  }
  return normalized;
}

function assertResolvedBrowser(run) {
  const unresolved = ['driver', 'observer', 'network_observer']
    .filter(key => AUTO_OR_UNAVAILABLE.has(text(run.browser[key], 80)));
  if (unresolved.length) {
    fail(`browser observability is unresolved: ${unresolved.join(', ')}`);
  }
  if (run.browser.session_id_source !== 'explicit') {
    fail('final verdict requires an explicit same-session session_id');
  }
}

export function startExploratoryRun({
  dataDir = DATA_DIR,
  runId = '',
  mode = EXPLORATORY_BROWSER_QA,
  scope,
  objective = '',
  briefPath = path.join(dataDir, 'qa-knowledge', 'context', 'business-execution-brief.json'),
  cardPath = '',
  browserDriver = DEFAULT_BROWSER_DRIVER,
  browserObserver = DEFAULT_BROWSER_DRIVER,
  networkObserver = DEFAULT_BROWSER_DRIVER,
  sessionId = '',
  maxActions = positiveInt(process.env.QA_EXPLORATORY_MAX_ACTIONS, DEFAULT_MAX_ACTIONS),
  maxMs = positiveInt(process.env.QA_EXPLORATORY_MAX_MS, DEFAULT_MAX_MS),
  maxActionsPerCharter = positiveInt(
    process.env.QA_EXPLORATORY_MAX_ACTIONS_PER_CHARTER,
    DEFAULT_MAX_ACTIONS_PER_CHARTER,
  ),
  maxRetriesPerAction = positiveInt(
    process.env.QA_EXPLORATORY_MAX_RETRIES_PER_ACTION,
    DEFAULT_MAX_RETRIES_PER_ACTION,
  ),
} = {}) {
  const normalizedDataDir = path.resolve(dataDir);
  const normalizedMode = normalizeExploratoryMode(mode);
  if (!ALLOWED_MODES.has(normalizedMode)) fail(`unsupported exploratory mode: ${normalizedMode}`);
  if (!text(scope, 160)) fail('--scope is required');
  for (const [name, value] of [
    ['browser-driver', browserDriver],
    ['browser-observer', browserObserver],
    ['network-observer', networkObserver],
  ]) {
    if (!ALLOWED_BROWSER_VALUES.has(text(value, 80).toLowerCase())) {
      fail(`unsupported ${name}: ${value}`);
    }
  }
  const normalizedBriefPath = path.resolve(normalizedDataDir, briefPath);
  const normalizedCardPath = path.resolve(normalizedDataDir, cardPath || deriveCardPath(normalizedBriefPath));
  const context = validateBriefAndCard({
    mode: normalizedMode,
    scope,
    briefPath: normalizedBriefPath,
    cardPath: normalizedCardPath,
  });
  const id = text(runId, 120) || `explore-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const filePath = runFile(normalizedDataDir, id);
  if (fs.existsSync(filePath)) fail(`run already exists: ${id}`);
  const generatedSessionId = text(sessionId, 160) || `session-${id}`;
  const businessContext = context.ui_first
    ? {
      source: 'ui_runtime',
      status: 'UI_DISCOVERY',
      brief_path: null,
      card_path: null,
      brief_sha256_12: null,
      card_sha256_12: null,
      card_budget: null,
      high_charter_ids: context.card.retrieval?.high_charter_ids || [],
      deferred_charter_ids: [],
    }
    : {
      source: 'optional_knowledge',
      brief_path: path.relative(normalizedDataDir, normalizedBriefPath),
      card_path: path.relative(normalizedDataDir, normalizedCardPath),
      brief_sha256_12: hashFile(normalizedBriefPath),
      card_sha256_12: hashFile(normalizedCardPath),
      status: context.brief.status,
      card_budget: context.card.budget || null,
      high_charter_ids: context.card.retrieval?.high_charter_ids || [],
      deferred_charter_ids: context.card.retrieval?.deferred_charter_ids || [],
    };
  const run = {
    schema_version: 1,
    artifact: 'exploratory-run',
    run_id: id,
    data_dir: normalizedDataDir,
    mode: normalizedMode,
    scope: text(scope, 160),
    status: 'RUNNING',
    started_at: nowIso(),
    updated_at: nowIso(),
    finished_at: null,
    stop_reason: null,
    business_context: businessContext,
    browser: {
      driver: text(browserDriver, 80).toLowerCase(),
      observer: text(browserObserver, 80).toLowerCase(),
      network_observer: text(networkObserver, 80).toLowerCase(),
      same_session_required: true,
      session_id: generatedSessionId,
      session_id_source: text(sessionId, 160) ? 'explicit' : 'generated',
      active_page_id: null,
      pages: [],
    },
    budget: {
      max_actions: positiveInt(maxActions, DEFAULT_MAX_ACTIONS),
      max_ms: positiveInt(maxMs, DEFAULT_MAX_MS),
      max_actions_per_charter: positiveInt(maxActionsPerCharter, DEFAULT_MAX_ACTIONS_PER_CHARTER),
      max_retries_per_action: positiveInt(maxRetriesPerAction, DEFAULT_MAX_RETRIES_PER_ACTION),
      action_count: 0,
      retry_count: 0,
      elapsed_ms: 0,
      exhausted: false,
    },
    token_usage: resolveModelUsage(normalizedDataDir),
    charters: context.charters,
    actions: [],
    agentic_task: {
      status: 'UNPLANNED',
      objective: text(objective || scope, 700),
      success_signals: [],
      stop_conditions: [],
      constraints: [],
      rationale: null,
      plan_revision: 0,
      plan_history: [],
      current_step_id: null,
      steps: [],
      decisions: [],
      compact_memory: [],
      no_progress_count: 0,
      requires_replan: false,
      replan_count: 0,
      max_replans: DEFAULT_MAX_AGENT_REPLANS,
      judge: null,
      source_observation: null,
      updated_at: nowIso(),
    },
    rule_discovery: {
      status: 'UNPLANNED',
      scope_boundary: null,
      probes: [],
      coverage: null,
      gaps: [],
    },
    quality_flags: [],
    evidence: {
      media_refs: [],
      network_refs: [],
      console_refs: [],
      page_error_refs: [],
    },
  };
  saveRun(filePath, run);
  return { run, filePath };
}

export function registerPage({ dataDir = DATA_DIR, runId, page }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!page || !text(page.page_id, 120)) fail('page_id is required');
  const pageId = text(page.page_id, 120);
  const sessionId = text(page.session_id, 160);
  if (!sessionId || sessionId !== run.browser.session_id) {
    fail('page session_id does not match the exploratory run session');
  }
  const record = {
    page_id: pageId,
    session_id: sessionId,
    url: text(page.url, 500),
    title: text(page.title, 300),
    role: text(page.role, 160),
    frame: text(page.frame, 240) || 'main',
    kind: text(page.kind, 80) || 'page',
    state: text(page.state, 80) || 'ready',
    opened_at: text(page.opened_at, 80) || nowIso(),
    last_seen_at: nowIso(),
  };
  const index = run.browser.pages.findIndex(item => item.page_id === pageId);
  if (index >= 0) run.browser.pages[index] = { ...run.browser.pages[index], ...record };
  else run.browser.pages.push(record);
  run.browser.active_page_id = pageId;
  saveRun(filePath, run);
  return { run, page: record, filePath };
}

function getRuleProbe(run, probeId) {
  const probe = run.rule_discovery?.probes?.find(item => item.probe_id === text(probeId, 120));
  if (!probe) fail(`unknown business-rule probe: ${probeId}`);
  return probe;
}

function normalizeScopeBoundary(value) {
  const boundary = value && typeof value === 'object' ? value : {};
  const name = text(boundary.name || boundary.scope, 240);
  const included = safeArray(boundary.included, 24);
  const excluded = safeArray(boundary.excluded, 24);
  const stopCondition = text(boundary.stop_condition || boundary.stopCondition, 500);
  if (!name || !included.length || !stopCondition) {
    fail('scope_boundary requires name, included and stop_condition');
  }
  return { name, included, excluded, stop_condition: stopCondition };
}

function normalizeCoverageItems(value, field) {
  if (!Array.isArray(value)) fail(`coverage.${field} must be an array`);
  return value.map(item => {
    const entry = item && typeof item === 'object' ? item : { key: item };
    const key = text(entry.key || entry.id || entry.name, 240);
    const status = text(entry.status, 80).toLowerCase();
    if (!key || !ALLOWED_COVERAGE_STATUS.has(status)) {
      fail(`coverage.${field} entries require key and status covered|partial|blocked|not_covered|excluded`);
    }
    if (status === 'excluded' && !text(entry.reason, 400)) {
      fail(`coverage.${field} excluded entry requires a reason`);
    }
    return {
      key,
      status,
      reason: text(entry.reason, 400) || null,
      evidence_refs: safeArray(entry.evidence_refs, 12),
    };
  });
}

export function setExploratoryRulePlan({ dataDir = DATA_DIR, runId, plan }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.probes) || !plan.probes.length) {
    fail('rule plan requires a non-empty probes array');
  }
  if (run.rule_discovery?.probes?.some(probe => probe.outcome)) {
    fail('business-rule plan cannot be replaced after a probe is decided');
  }
  const scopeBoundary = normalizeScopeBoundary(plan.scope_boundary || plan.scopeBoundary);
  const probes = [];
  const ids = new Set();
  for (const item of plan.probes) {
    const probeId = text(item?.probe_id || item?.id, 120);
    const type = text(item?.type, 80).toLowerCase();
    const applicability = text(item?.applicability, 80).toLowerCase();
    const safeStrategy = text(item?.safe_strategy || item?.safeStrategy, 500);
    const applicabilityBasis = text(item?.applicability_basis || item?.basis || item?.source_basis, 600);
    if (!probeId || ids.has(probeId)) fail(`rule plan has duplicate or missing probe_id: ${probeId || 'missing'}`);
    if (!ALLOWED_RULE_TYPES.has(type)) fail(`unsupported business-rule probe type: ${type || 'missing'}`);
    if (!ALLOWED_RULE_APPLICABILITY.has(applicability)) {
      fail(`probe ${probeId} applicability must be required, optional or not_applicable`);
    }
    if (applicability === 'not_applicable' && (!text(item.reason, 500) || !applicabilityBasis)) {
      fail(`probe ${probeId} marked not_applicable requires reason and applicability_basis`);
    }
    if (applicability !== 'not_applicable'
      && (!text(item.target, 300) || !text(item.hypothesis, 600) || !safeStrategy)) {
      fail(`probe ${probeId} requires target, hypothesis and safe_strategy`);
    }
    ids.add(probeId);
    probes.push({
      probe_id: probeId,
      type,
      applicability,
      target: text(item.target, 300),
      hypothesis: text(item.hypothesis, 600),
      safe_strategy: safeStrategy,
      reason: text(item.reason, 500) || null,
      applicability_basis: applicabilityBasis || null,
      status: 'PLANNED',
      outcome: applicability === 'not_applicable' ? 'NOT_APPLICABLE' : null,
      classification: applicability === 'not_applicable' ? 'not_applicable' : null,
      observed_rule: null,
      action_ids: [],
      evidence: { media: [], network: [], readback: [], role_comparison: [] },
      details: null,
      recorded_at: applicability === 'not_applicable' ? nowIso() : null,
    });
  }
  if (!probes.some(probe => probe.type === 'coverage' && probe.applicability === 'required')) {
    fail('rule plan must include a required coverage probe');
  }
  run.rule_discovery = {
    status: 'READY',
    scope_boundary: scopeBoundary,
    probes,
    coverage: null,
    gaps: [],
  };
  saveRun(filePath, run);
  return { run, filePath };
}

export function setExploratoryCoverage({ dataDir = DATA_DIR, runId, coverage }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (run.rule_discovery?.status !== 'READY') fail('set rule plan before recording coverage');
  if (!coverage || typeof coverage !== 'object') fail('coverage payload is required');
  const scopeBoundary = normalizeScopeBoundary(coverage.scope_boundary || run.rule_discovery.scope_boundary);
  const fields = ['modules', 'routes', 'roles', 'states', 'transitions', 'data_classes', 'dependencies'];
  const normalized = Object.fromEntries(fields.map(field => [field, normalizeCoverageItems(coverage[field] || [], field)]));
  const scopeStatus = text(coverage.scope_status || coverage.scopeStatus, 80).toUpperCase();
  if (!ALLOWED_SCOPE_STATUS.has(scopeStatus)) {
    fail('coverage.scope_status must be COMPLETE_FOR_SCOPE, PARTIAL or BLOCKED');
  }
  const gaps = safeArray(coverage.gaps, 24);
  if (scopeStatus !== 'COMPLETE_FOR_SCOPE' && !gaps.length) {
    fail('partial or blocked coverage requires explicit gaps');
  }
  run.rule_discovery.scope_boundary = scopeBoundary;
  run.rule_discovery.coverage = {
    scope_status: scopeStatus,
    ...normalized,
    gaps,
    recorded_at: nowIso(),
  };
  run.rule_discovery.gaps = gaps;
  saveRun(filePath, run);
  return { run, coverage: run.rule_discovery.coverage, filePath };
}

function requireEvidenceForRule(outcome, evidence, probeId) {
  const media = collectMedia(evidence.media);
  const nonMedia = [...safeArray(evidence.network), ...safeArray(evidence.readback), ...safeArray(evidence.role_comparison)];
  if (!media.some(ref => isVisualEvidenceReference(ref))) {
    fail(`probe ${probeId} requires screenshot/video evidence for ${outcome}`);
  }
  if (!nonMedia.length) {
    fail(`probe ${probeId} requires network, readback or role-comparison evidence for ${outcome}`);
  }
  return {
    media,
    network: safeArray(evidence.network),
    readback: safeArray(evidence.readback),
    role_comparison: safeArray(evidence.role_comparison),
  };
}

export function recordExploratoryRuleProbe({ dataDir = DATA_DIR, runId, probe: input }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (run.rule_discovery?.status !== 'READY') fail('set a business-rule plan before recording probes');
  if (!input || typeof input !== 'object') fail('business-rule probe payload is required');
  const probe = getRuleProbe(run, input.probe_id);
  if (probe.outcome) fail(`business-rule probe is already decided: ${probe.probe_id}`);
  const outcome = text(input.outcome, 80).toUpperCase();
  if (!ALLOWED_RULE_OUTCOMES.has(outcome)) fail(`unsupported rule probe outcome: ${outcome}`);
  const reason = text(input.reason, 700);
  if (['CONTRADICTED', 'INCONCLUSIVE', 'BLOCKED', 'CANDIDATE', 'NOT_APPLICABLE'].includes(outcome) && !reason) {
    fail(`${outcome} probe requires a reason`);
  }
  const actionIds = safeArray(input.action_ids, 24);
  const unknownActions = actionIds.filter(id => !run.actions.some(action => action.action_id === id));
  if (unknownActions.length) fail(`probe references unknown action IDs: ${unknownActions.join(', ')}`);
  if (['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome) && !actionIds.length) {
    fail(`probe ${probe.probe_id} requires linked runtime action IDs`);
  }
  const evidenceInput = input.evidence || {};
  let evidence = {
    media: collectMedia(input.media_refs, evidenceInput.media),
    network: safeArray(input.network_refs || evidenceInput.network, 16),
    readback: safeArray(input.readback_refs || evidenceInput.readback, 16),
    role_comparison: safeArray(input.role_comparison_refs || evidenceInput.role_comparison, 16),
  };
  if (['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)) {
    evidence = requireEvidenceForRule(outcome, evidence, probe.probe_id);
  }
  const observedRule = text(input.observed_rule || input.rule, 900);
  if (!observedRule && outcome !== 'NOT_APPLICABLE') fail(`probe ${probe.probe_id} requires observed_rule`);
  if (probe.type === 'uniqueness' && ['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)) {
    const attempts = Number(input.attempts);
    if (!Number.isFinite(attempts) || attempts < 2 || actionIds.length < 2) {
      fail(`uniqueness probe ${probe.probe_id} requires at least two attempts and two action IDs`);
    }
  }
  if (probe.type === 'authorization' && ['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)) {
    const comparison = input.role_comparison;
    if (!comparison || !text(comparison.subject_role, 120) || !text(comparison.comparison_role, 120) || comparison.same_target !== true) {
      fail(`authorization probe ${probe.probe_id} requires subject_role, comparison_role and same_target=true`);
    }
  }
  if (probe.type === 'side_effect' && ['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)) {
    if (!evidence.readback.length || !safeArray(input.before_refs || evidenceInput.before, 12).length
      || !safeArray(input.after_refs || evidenceInput.after, 12).length) {
      fail(`side_effect probe ${probe.probe_id} requires before, after and readback evidence`);
    }
  }
  if (probe.type === 'oracle' && ['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)) {
    const oracle = input.oracle || {};
    if (!text(oracle.basis, 120) || !text(oracle.expected_signal, 600) || !text(oracle.actual_signal, 600)) {
      fail(`oracle probe ${probe.probe_id} requires basis, expected_signal and actual_signal`);
    }
  }
  if (probe.type === 'coverage' && ['RUNTIME_VERIFIED', 'CONTRADICTED'].includes(outcome)
    && !run.rule_discovery.coverage) {
    fail(`coverage probe ${probe.probe_id} requires a recorded coverage map`);
  }
  probe.status = 'DECIDED';
  probe.outcome = outcome;
  probe.classification = outcome === 'RUNTIME_VERIFIED'
    ? 'runtime_verified'
    : outcome === 'CONTRADICTED'
      ? 'contradicted'
      : outcome === 'NOT_APPLICABLE'
        ? 'not_applicable'
        : outcome.toLowerCase();
  probe.observed_rule = observedRule || null;
  probe.action_ids = actionIds;
  probe.evidence = evidence;
  probe.details = {
    reason: reason || null,
    attempts: Number.isFinite(Number(input.attempts)) ? Number(input.attempts) : null,
    role_comparison: input.role_comparison || null,
    oracle: input.oracle || null,
    before_refs: safeArray(input.before_refs || evidenceInput.before, 12),
    after_refs: safeArray(input.after_refs || evidenceInput.after, 12),
  };
  probe.recorded_at = nowIso();
  if (outcome !== 'RUNTIME_VERIFIED' && outcome !== 'NOT_APPLICABLE') {
    run.rule_discovery.gaps.push(`${probe.probe_id}: ${outcome.toLowerCase()}${reason ? ` — ${reason}` : ''}`);
  }
  run.evidence.media_refs = collectMedia(run.evidence.media_refs, evidence.media);
  run.evidence.network_refs = safeArray([...run.evidence.network_refs, ...evidence.network]);
  run.evidence.console_refs = safeArray(run.evidence.console_refs);
  run.evidence.page_error_refs = safeArray(run.evidence.page_error_refs);
  saveRun(filePath, run);
  return { run, probe, filePath };
}

function validateRuleDiscoveryForFinish(run, verdict) {
  const discovery = run.rule_discovery;
  if (!discovery || discovery.status !== 'READY') {
    if (['N/A', 'UNTEST'].includes(verdict)) return;
    fail('business-rule discovery plan is missing; declare applicable probes before final verdict');
  }
  const required = discovery.probes.filter(probe => probe.applicability === 'required');
  const pending = required.filter(probe => !probe.outcome);
  if (pending.length && !['N/A', 'UNTEST'].includes(verdict)) {
    fail(`required business-rule probes are undecided: ${pending.map(probe => probe.probe_id).join(', ')}`);
  }
  const coverageProbe = required.find(probe => probe.type === 'coverage');
  if (!coverageProbe) fail('required coverage probe is missing');
  if (verdict === 'PASS') {
    if (!discovery.coverage || discovery.coverage.scope_status !== 'COMPLETE_FOR_SCOPE') {
      fail('PASS requires COMPLETE_FOR_SCOPE coverage with explicit boundary and no unresolved gaps');
    }
    if (coverageProbe.outcome !== 'RUNTIME_VERIFIED') {
      fail(`PASS requires runtime-verified coverage probe: ${coverageProbe.probe_id}=${coverageProbe.outcome || 'PENDING'}`);
    }
    const unresolved = required.filter(probe => !['RUNTIME_VERIFIED', 'NOT_APPLICABLE'].includes(probe.outcome));
    if (unresolved.length) {
      fail(`PASS requires runtime-verified or not-applicable rule probes: ${unresolved.map(probe => `${probe.probe_id}=${probe.outcome || 'PENDING'}`).join(', ')}`);
    }
    if (discovery.gaps.length) fail('PASS is not allowed while hidden business-rule discovery has unresolved gaps');
  }
}

export function recordExploratoryAction({ dataDir = DATA_DIR, runId, action: input }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (run.rule_discovery?.status !== 'READY') {
    fail('set a business-rule plan before browser action');
  }
  validateBudget(run, filePath);
  if (!input || typeof input !== 'object') fail('action payload is required');
  const charter = getCharter(run, input.charter_id);
  if (charter.status !== 'PENDING' && charter.status !== 'RUNNING') {
    fail(`charter is already decided: ${charter.charter_id}`);
  }
  const page = getPage(run, input.page_id || run.browser.active_page_id);
  const sessionId = text(input.session_id, 160);
  if (!sessionId || sessionId !== run.browser.session_id || sessionId !== page.session_id) {
    fail('action session_id does not match the registered browser session/page');
  }
  const actionVerdict = text(input.verdict, 80).toUpperCase();
  if (!ALLOWED_ACTION_VERDICTS.has(actionVerdict)) fail(`unsupported action verdict: ${actionVerdict}`);
  const actionText = text(input.action, 500);
  const semanticTarget = text(input.semantic_target, 500);
  const expectedSignal = text(input.expected_signal, 700);
  const actualSignal = text(input.actual_signal, 900);
  if (!actionText || !semanticTarget || !expectedSignal || !actualSignal) {
    fail('action, semantic_target, expected_signal and actual_signal are required');
  }
  const locatorEvidence = validateLocatorEvidence(input, actionVerdict, path.resolve(dataDir));
  const selector = locatorEvidence.selector || semanticTarget;
  const computedSafety = evaluateActionSafety({
    actionText,
    selector,
    httpMethod: text(input.http_method, 20) || 'GET',
    targetUrl: text(input.target_url, 500) || page.url,
    env: text(input.environment, 80) || process.env.QA_ENV || 'UAT',
    allowAction: text(input.allow_action, 120),
  });
  const declaredSafety = text(
    typeof input.safety_decision === 'object' ? input.safety_decision.safety : input.safety_decision,
    80,
  ).toUpperCase();
  if (declaredSafety && declaredSafety !== computedSafety.safety) {
    fail(`safety decision mismatch: declared=${declaredSafety} computed=${computedSafety.safety}`);
  }
  if (['BLOCKED', 'PAYMENT', 'EXTERNAL_EFFECT'].includes(computedSafety.safety) && actionVerdict !== 'BLOCKED') {
    fail(`unsafe action must be recorded as BLOCKED: ${computedSafety.reason}`);
  }
  const retryOf = text(input.retry_of, 120);
  if (retryOf) {
    const original = run.actions.find(item => item.action_id === retryOf);
    if (!original) fail(`retry_of action does not exist: ${retryOf}`);
    const retryCount = run.actions.filter(item => item.retry_of === retryOf).length;
    if (retryCount >= run.budget.max_retries_per_action) {
      fail(`retry budget exhausted for ${retryOf}`, 'BUDGET_EXHAUSTED');
    }
    if (original.computed_safety !== 'READ_ONLY' || computedSafety.safety !== 'READ_ONLY') {
      fail('automatic retry is allowed only for READ_ONLY actions');
    }
  }
  const actionsForCharter = run.actions.filter(item => item.charter_id === charter.charter_id);
  if (actionsForCharter.length >= run.budget.max_actions_per_charter) {
    run.budget.exhausted = true;
    run.stop_reason = `charter action budget exhausted (${run.budget.max_actions_per_charter}): ${charter.charter_id}`;
    saveRun(filePath, run);
    fail(`charter action budget exhausted (${run.budget.max_actions_per_charter}): ${charter.charter_id}`, 'BUDGET_EXHAUSTED');
  }
  const observations = input.observability || {};
  const observability = {
    network: normalizeObservation(observations.network, 'network'),
    console: normalizeObservation(observations.console, 'console'),
    page_error: normalizeObservation(observations.page_error, 'page_error'),
  };
  const mediaRefs = collectMedia(input.media_refs);
  const networkRefs = safeArray(input.network_refs, 16);
  const consoleRefs = safeArray(input.console_refs || input.console_page_error_refs, 16);
  const pageErrorRefs = safeArray(input.page_error_refs, 16);
  const decisionId = text(input.decision_id, 120);
  const agentDecision = decisionId
    ? run.agentic_task?.decisions?.find(item => item.decision_id === decisionId)
    : null;
  if (decisionId && !agentDecision) fail(`action references unknown agentic decision: ${decisionId}`);
  if (agentDecision?.action_id) fail(`agentic decision is already linked to action: ${decisionId}`);
  if (agentDecision && (agentDecision.session_id !== sessionId || agentDecision.page_id !== page.page_id)) {
    fail('agentic decision does not match the action browser session/page');
  }
  if (agentDecision?.selected_action) {
    const plannedTarget = text(agentDecision.selected_action.semantic_target, 500).toLowerCase();
    if (plannedTarget && plannedTarget !== semanticTarget.toLowerCase()) {
      fail(`action semantic_target differs from agentic decision: planned=${plannedTarget} actual=${semanticTarget.toLowerCase()}`);
    }
  }
  const record = {
    action_id: `ACT-${String(run.actions.length + 1).padStart(4, '0')}`,
    charter_id: charter.charter_id,
    step_id: text(input.step_id, 120) || `step-${run.actions.length + 1}`,
    recorded_at: nowIso(),
    session_id: sessionId,
    page_id: page.page_id,
    intent: text(input.intent, 500) || charter.mission,
    semantic_target: semanticTarget,
    locator_evidence: locatorEvidence,
    action: actionText,
    http_method: text(input.http_method, 20).toUpperCase() || 'GET',
    target_url: text(input.target_url, 500) || page.url,
    expected_signal: expectedSignal,
    actual_signal: actualSignal,
    computed_safety: computedSafety.safety,
    safety_reason: computedSafety.reason,
    observability,
    network_refs: networkRefs,
    console_refs: consoleRefs,
    page_error_refs: pageErrorRefs,
    media_refs: mediaRefs,
    verdict: actionVerdict,
    retry_of: retryOf || null,
    retry_classification: retryOf ? text(input.retry_classification, 80).toLowerCase() || 'flaky' : null,
    next_decision: text(input.next_decision, 500),
    decision_id: decisionId || null,
    state_delta: input.state_delta && typeof input.state_delta === 'object' ? {
      url_changed: Boolean(input.state_delta.url_changed),
      title_changed: Boolean(input.state_delta.title_changed),
      content_changed: Boolean(input.state_delta.content_changed),
      control_count_changed: Boolean(input.state_delta.control_count_changed),
      new_headings: safeArray(input.state_delta.new_headings, 12),
      new_alerts: safeArray(input.state_delta.new_alerts, 12),
      runtime_failure_count: Number(input.state_delta.runtime_failure_count || 0),
      progress_score: Math.max(0, Math.min(1, Number(input.state_delta.progress_score || 0))),
      progress_classification: text(input.state_delta.progress_classification, 80).toUpperCase() || 'UNKNOWN',
    } : null,
  };
  if (retryOf && !['recovered', 'flaky', 'failed'].includes(record.retry_classification)) {
    fail('retry_classification must be recovered, flaky or failed');
  }
  run.actions.push(record);
  if (agentDecision) {
    agentDecision.action_id = record.action_id;
    agentDecision.observed_delta = record.state_delta;
    const taskStep = getTaskStep(run, agentDecision.task_step_id);
    taskStep.action_ids = safeArray([...taskStep.action_ids, record.action_id], 24);
  }
  run.budget.action_count += 1;
  if (retryOf) run.budget.retry_count += 1;
  if (retryOf && !run.quality_flags.includes(record.retry_classification.toUpperCase())) {
    run.quality_flags.push(record.retry_classification.toUpperCase());
  }
  if (charter.status === 'PENDING') charter.status = 'RUNNING';
  run.evidence.media_refs = collectMedia(run.evidence.media_refs, mediaRefs);
  run.evidence.network_refs = safeArray([...run.evidence.network_refs, ...networkRefs]);
  run.evidence.console_refs = safeArray([...run.evidence.console_refs, ...consoleRefs]);
  run.evidence.page_error_refs = safeArray([...run.evidence.page_error_refs, ...pageErrorRefs]);
  saveRun(filePath, run);
  return { run, action: record, filePath };
}

/**
 * Convert a result emitted by native-browser-runtime into the durable
 * exploratory ledger. The browser runtime owns the real interaction; this
 * adapter owns the QA charter/oracle/evidence contract. Keeping the bridge
 * here prevents an agent from hand-copying session or locator fields.
 */
export function recordNativeBrowserAction({
  dataDir = DATA_DIR,
  runId,
  result,
  charterId = '',
  stepId = '',
  decisionId = '',
  expectedSignal = '',
  verdict = 'CONFIRMED',
  nextDecision = '',
} = {}) {
  if (!result || typeof result !== 'object') fail('native browser result is required');
  if (!text(charterId, 120) && !text(result.charter_id, 120)) {
    fail('native browser result needs charter_id or --charter-id');
  }
  const after = result.after || {};
  const failures = Array.isArray(result.runtime?.failures) ? result.runtime.failures : [];
  const rawStrategy = text(result.locator_evidence?.strategy, 80).toUpperCase();
  const strategy = rawStrategy === 'NAVIGATION' ? 'NATIVE_NAVIGATION' : rawStrategy;
  const locatorEvidence = {
    ...result.locator_evidence,
    strategy: strategy || 'NATIVE_NAVIGATION',
    source: result.locator_evidence?.source || 'native_runtime',
    verified: result.locator_evidence?.verified === true,
    fallback_reason: result.locator_evidence?.fallback_reason
      || (strategy === 'XPATH' ? result.locator_evidence?.reason : null),
  };
  const actualSignal = text(
    result.actual_signal
      || [
        after.url ? `URL=${after.url}` : '',
        ...(after.headings || []),
        ...(after.alerts || []),
      ].filter(Boolean).join(' | ')
      || text(after, 800),
    900,
  );
  return recordExploratoryAction({
    dataDir,
    runId,
    action: {
      charter_id: charterId || result.charter_id,
      step_id: stepId || result.step_id,
      decision_id: decisionId || result.decision_id,
      session_id: result.session_id,
      page_id: result.page_id,
      intent: result.intent || `Native ${result.action_type || 'browser'} action`,
      semantic_target: result.semantic_target || locatorEvidence.selector || result.action_type || 'native browser transition',
      locator_evidence: locatorEvidence,
      action: result.action || result.action_type || 'native browser action',
      http_method: result.http_method || 'GET',
      target_url: result.after?.url || result.target_url || '',
      expected_signal: expectedSignal || result.expected_signal || 'The scoped business state matches the charter oracle',
      actual_signal: actualSignal,
      observability: {
        network: failures.some(item => /HTTP_FAILURE|REQUEST_FAILED|GRAPHQL_ERROR/.test(item.type)) || Number(result.runtime?.response_count) > 0
          ? 'observed' : 'no_matching_event',
        console: failures.some(item => item.type === 'CONSOLE_ERROR') ? 'observed' : 'no_matching_event',
        page_error: failures.some(item => item.type === 'PAGE_CRASH_ERROR') ? 'observed' : 'no_matching_event',
      },
      network_refs: result.runtime?.event_count ? [`native-runtime:${result.action_id}`] : [],
      console_refs: failures.filter(item => item.type === 'CONSOLE_ERROR').map(() => `native-runtime:${result.action_id}`),
      page_error_refs: failures.filter(item => item.type === 'PAGE_CRASH_ERROR').map(() => `native-runtime:${result.action_id}`),
      media_refs: result.media_refs || [],
      safety_decision: result.safety?.safety || '',
      verdict,
      next_decision: nextDecision,
      state_delta: result.state_delta || null,
    },
  });
}

export function setExploratoryCharterVerdict({ dataDir = DATA_DIR, runId, charter: input }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  if (!input || typeof input !== 'object') fail('charter payload is required');
  const charter = getCharter(run, input.charter_id);
  const verdict = normalizeQaResultVerdict(input.verdict);
  if (!ALLOWED_CHARTER_VERDICTS.has(verdict)) fail(`unsupported charter verdict: ${verdict}`);
  const reason = text(input.reason, 700);
  if (['N/A', 'UNTEST'].includes(verdict) && !reason) {
    fail(`${verdict} charter requires a reason`);
  }
  const actions = run.actions.filter(action => action.charter_id === charter.charter_id);
  if (['PASS', 'FAILED'].includes(verdict) && !actions.length) {
    fail(`${verdict} charter requires at least one recorded action`);
  }
  if (verdict === 'PASS' && actions.some(action => ['DISPROVED', 'UNRESOLVED', 'BLOCKED'].includes(action.verdict))) {
    fail('charter cannot PASS while an action is disproved, unresolved or blocked');
  }
  charter.status = 'DECIDED';
  charter.verdict = verdict;
  charter.reason = reason || null;
  charter.evidence_refs = collectMedia(input.evidence_refs, actions.flatMap(action => action.media_refs));
  charter.quality = actions.some(action => ['FLAKY', 'RECOVERED'].includes(action.verdict))
    ? 'RECOVERED_OR_FLAKY'
    : 'CLEAN';
  saveRun(filePath, run);
  return { run, charter, filePath };
}

function charterMedia(run, charter) {
  const actions = run.actions.filter(action => action.charter_id === charter.charter_id);
  return collectMedia(charter.evidence_refs, actions.flatMap(action => action.media_refs));
}

function validateChartersForFinish(run, verdict) {
  const required = run.charters.filter(requiredCharter);
  const unresolved = required.filter(charter => !charter.verdict);
  if (unresolved.length && !['N/A', 'UNTEST'].includes(verdict)) {
    fail(`required charters are undecided: ${unresolved.map(charter => charter.charter_id).join(', ')}`);
  }
  if (verdict === 'PASS') {
    const notPass = required.filter(charter => charter.verdict !== 'PASS');
    if (notPass.length) fail(`PASS requires every high-priority charter to PASS: ${notPass.map(charter => `${charter.charter_id}=${charter.verdict}`).join(', ')}`);
    const missingMedia = required.filter(charter => !charterMedia(run, charter).some(ref => isVisualEvidenceReference(ref, run.data_dir)));
    if (missingMedia.length) fail(`PASS requires screenshot/video evidence for: ${missingMedia.map(charter => charter.charter_id).join(', ')}`);
    const unstable = required.filter(charter => charter.quality !== 'CLEAN');
    if (unstable.length || run.quality_flags.length) {
      fail('retry-pass is not a clean PASS; finish as FAILED or UNTEST with the retry classification');
    }
    if (run.actions.some(action => action.verdict === 'UNRESOLVED')) {
      fail('PASS is not allowed while an action remains UNRESOLVED');
    }
  }
  if (verdict === 'FAILED') {
    const missingMedia = required
      .filter(charter => ['PASS', 'FAILED'].includes(charter.verdict))
      .filter(charter => !charterMedia(run, charter).some(ref => isVisualEvidenceReference(ref, run.data_dir)));
    if (missingMedia.length) fail(`verdict ${verdict} requires screenshot/video evidence for: ${missingMedia.map(charter => charter.charter_id).join(', ')}`);
  }
}

function validateAgenticTaskForFinish(run, verdict) {
  const task = run.agentic_task;
  if (!task || task.status === 'UNPLANNED') return;
  if (verdict === 'PASS') {
    if (task.status !== 'COMPLETED') fail(`PASS requires the agentic task to be COMPLETED: ${task.status}`);
    const incomplete = task.steps.filter(step => step.status !== 'COMPLETED');
    if (incomplete.length) {
      fail(`PASS requires every agentic task step to be completed: ${incomplete.map(step => step.task_step_id).join(', ')}`);
    }
    const completion = [...task.decisions].reverse().find(item => item.decision === 'COMPLETE');
    if (!completion?.evidence_refs?.length) fail('PASS requires an evidence-backed COMPLETE agentic decision');
    if (task.judge?.judgement !== 'SATISFIED') {
      fail(`PASS requires an independent SATISFIED task judge: ${task.judge?.judgement || 'missing'}`);
    }
    const unlinked = task.decisions.filter(item => item.decision === 'ACT' && !item.action_id);
    if (unlinked.length) {
      fail(`PASS requires every ACT decision to link to an executed action: ${unlinked.map(item => item.decision_id).join(', ')}`);
    }
  }
  if (task.requires_replan && !['N/A', 'UNTEST'].includes(verdict)) {
    fail('agentic task requires replan after repeated no-progress');
  }
}

export function finishExploratoryRun({ dataDir = DATA_DIR, runId, verdict, reason = '' }) {
  const { run, filePath } = loadRun(path.resolve(dataDir), runId);
  if (run.status !== 'RUNNING') fail(`run is already finished: ${run.status}`);
  const normalizedVerdict = normalizeQaResultVerdict(verdict);
  if (!ALLOWED_RUN_VERDICTS.has(normalizedVerdict)) fail(`unsupported run verdict: ${normalizedVerdict}`);
  run.data_dir = path.resolve(dataDir);
  run.budget.elapsed_ms = Math.max(0, Date.now() - new Date(run.started_at).getTime());
  const finishReason = text(reason, 900);
  if (['N/A', 'UNTEST'].includes(normalizedVerdict) && !finishReason) {
    fail(`${normalizedVerdict} run requires a reason`);
  }
  if (!['N/A', 'UNTEST'].includes(normalizedVerdict)) {
    validateRuleDiscoveryForFinish(run, normalizedVerdict);
    validateChartersForFinish(run, normalizedVerdict);
    validateAgenticTaskForFinish(run, normalizedVerdict);
    assertResolvedBrowser(run);
  }
  if (normalizedVerdict === 'PASS' && run.budget.exhausted) {
    fail('PASS is not allowed after the action/time budget is exhausted');
  }
  run.token_usage = resolveModelUsage(path.resolve(dataDir)) || run.token_usage || null;
  run.status = normalizedVerdict;
  run.stop_reason = finishReason || null;
  run.finished_at = nowIso();
  saveRun(filePath, run);
  return { run, filePath };
}

function printResult(result) {
  const payload = {
    run_id: result.run?.run_id,
    status: result.run?.status,
    file: result.filePath,
    action_count: result.run?.budget?.action_count,
    max_actions: result.run?.budget?.max_actions,
    elapsed_ms: result.run?.budget?.elapsed_ms,
    rule_status: result.run?.rule_discovery?.status,
    rule_probe_count: result.run?.rule_discovery?.probes?.length,
    rule_gap_count: result.run?.rule_discovery?.gaps?.length,
    agentic_task_status: result.run?.agentic_task?.status,
    agentic_plan_revision: result.run?.agentic_task?.plan_revision,
    agentic_decision_count: result.run?.agentic_task?.decisions?.length,
  };
  console.log(JSON.stringify(payload, null, 2));
}

function argFrom(argv, flag, fallback = '') {
  const index = argv.indexOf(flag);
  return index === -1 ? fallback : (argv[index + 1] || fallback);
}

function cliActionPayload(argv = args) {
  const file = argFrom(argv, '--action-file', '');
  if (file) return readJson(file, 'action payload');
  fail('--action-file is required for action');
}

function cliPagePayload(argv = args) {
  const file = argFrom(argv, '--page-file', '');
  if (file) return readJson(file, 'page payload');
  fail('--page-file is required for page');
}

function cliTaskPlanPayload(argv = args) {
  const file = argFrom(argv, '--task-plan-file', '');
  if (file) return readJson(file, 'agentic task plan');
  fail('--task-plan-file is required for task-plan');
}

function cliDecisionPayload(argv = args) {
  const file = argFrom(argv, '--decision-file', '');
  if (file) return readJson(file, 'agentic task decision');
  fail('--decision-file is required for decision');
}

function cliTaskJudgePayload(argv = args) {
  const file = argFrom(argv, '--judge-file', '');
  if (file) return readJson(file, 'agentic task judge');
  fail('--judge-file is required for task-judge');
}

function cliCharterPayload(argv = args) {
  const file = argFrom(argv, '--charter-file', '');
  if (file) return readJson(file, 'charter payload');
  fail('--charter-file is required for charter');
}

function cliRulePlanPayload(argv = args) {
  const file = argFrom(argv, '--rule-plan-file', '');
  if (file) return readJson(file, 'business-rule plan');
  fail('--rule-plan-file is required for rule-plan');
}

function cliProbePayload(argv = args) {
  const file = argFrom(argv, '--probe-file', '');
  if (file) return readJson(file, 'business-rule probe');
  fail('--probe-file is required for rule-probe');
}

function cliCoveragePayload(argv = args) {
  const file = argFrom(argv, '--coverage-file', '');
  if (file) return readJson(file, 'coverage map');
  fail('--coverage-file is required for coverage');
}

function cliNativeResultPayload(argv = args) {
  const file = argFrom(argv, '--result-file', '');
  if (file) return readJson(file, 'native browser result');
  fail('--result-file is required for native-action');
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  if (command === 'help') {
    console.log('exploratory-runner: start | rule-plan | page | task-plan | agent-context | decision | task-judge | action | native-action | rule-probe | coverage | charter | finish');
    return 0;
  }
  const localGetArg = (flag, fallback = '') => {
    const index = argv.indexOf(flag);
    return index === -1 ? fallback : (argv[index + 1] || fallback);
  };
  if (command === 'start') {
    const configuredBrowserTrack = (envName) => (
      String(process.env[envName] || '').trim() || DEFAULT_BROWSER_DRIVER
    );
    const result = startExploratoryRun({
      dataDir: DATA_DIR,
      runId: localGetArg('--run-id', argv[1] && !argv[1].startsWith('-') ? argv[1] : ''),
      mode: localGetArg('--mode', EXPLORATORY_BROWSER_QA),
      scope: localGetArg('--scope', ''),
      objective: localGetArg('--objective', ''),
      briefPath: localGetArg('--business-context', path.join(DATA_DIR, 'qa-knowledge', 'context', 'business-execution-brief.json')),
      cardPath: localGetArg('--business-card', ''),
      browserDriver: localGetArg('--browser-driver', configuredBrowserTrack('QA_BROWSER_DRIVER')),
      browserObserver: localGetArg('--browser-observer', configuredBrowserTrack('QA_BROWSER_OBSERVER')),
      networkObserver: localGetArg('--network-observer', configuredBrowserTrack('QA_NETWORK_OBSERVER')),
      sessionId: localGetArg('--session-id', ''),
      maxActions: localGetArg('--max-actions', process.env.QA_EXPLORATORY_MAX_ACTIONS || DEFAULT_MAX_ACTIONS),
      maxMs: localGetArg('--max-ms', process.env.QA_EXPLORATORY_MAX_MS || DEFAULT_MAX_MS),
      maxActionsPerCharter: localGetArg('--max-actions-per-charter', process.env.QA_EXPLORATORY_MAX_ACTIONS_PER_CHARTER || DEFAULT_MAX_ACTIONS_PER_CHARTER),
      maxRetriesPerAction: localGetArg('--max-retries-per-action', process.env.QA_EXPLORATORY_MAX_RETRIES_PER_ACTION || DEFAULT_MAX_RETRIES_PER_ACTION),
    });
    printResult(result);
    return 0;
  }
  const runId = (argv[1] && !argv[1].startsWith('-'))
    ? argv[1]
    : localGetArg('--run-id', '');
  if (!runId) fail(`run id is required for ${command}`);
  if (command === 'agent-context') {
    console.log(JSON.stringify(getExploratoryAgentContext({ dataDir: DATA_DIR, runId }), null, 2));
    return 0;
  }
  if (command === 'rule-plan') {
    const result = setExploratoryRulePlan({ dataDir: DATA_DIR, runId, plan: cliRulePlanPayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'page') {
    const result = registerPage({ dataDir: DATA_DIR, runId, page: cliPagePayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'task-plan') {
    const result = setExploratoryTaskPlan({ dataDir: DATA_DIR, runId, plan: cliTaskPlanPayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'decision') {
    const result = recordExploratoryTaskDecision({ dataDir: DATA_DIR, runId, decision: cliDecisionPayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'task-judge') {
    const result = recordExploratoryTaskJudge({ dataDir: DATA_DIR, runId, judge: cliTaskJudgePayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'action') {
    const result = recordExploratoryAction({ dataDir: DATA_DIR, runId, action: cliActionPayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'native-action') {
    const result = recordNativeBrowserAction({
      dataDir: DATA_DIR,
      runId,
      result: cliNativeResultPayload(argv),
      charterId: localGetArg('--charter-id', ''),
      stepId: localGetArg('--step-id', ''),
      decisionId: localGetArg('--decision-id', ''),
      expectedSignal: localGetArg('--expected', ''),
      verdict: localGetArg('--verdict', 'CONFIRMED'),
      nextDecision: localGetArg('--next', ''),
    });
    printResult(result);
    return 0;
  }
  if (command === 'rule-probe') {
    const result = recordExploratoryRuleProbe({ dataDir: DATA_DIR, runId, probe: cliProbePayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'coverage') {
    const result = setExploratoryCoverage({ dataDir: DATA_DIR, runId, coverage: cliCoveragePayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'charter') {
    const result = setExploratoryCharterVerdict({ dataDir: DATA_DIR, runId, charter: cliCharterPayload(argv) });
    printResult(result);
    return 0;
  }
  if (command === 'finish') {
    const result = finishExploratoryRun({
      dataDir: DATA_DIR,
      runId,
      verdict: localGetArg('--verdict', ''),
      reason: localGetArg('--reason', ''),
    });
    printResult(result);
    return 0;
  }
  fail(`unknown command: ${command}`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(error => {
    console.error(`[exploratory-runner] ${error.code || 'BLOCKED'}: ${error.message}`);
    process.exit(error.code === 'BUDGET_EXHAUSTED' ? 3 : 2);
  });
}
