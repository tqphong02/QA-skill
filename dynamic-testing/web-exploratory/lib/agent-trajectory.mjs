import crypto from 'node:crypto';

const RELIABLE_STATE_ACTIONS = new Set([
  'navigate',
  'click',
  'back',
  'reload',
  'switch_page',
  'download',
]);

const PASSIVE_ACTIONS = new Set([
  'wait',
  'scroll',
  'screenshot',
  'extract',
]);

const FAILURE_OUTCOMES = new Set(['CONTRADICTED']);
const STAGNANT_OUTCOMES = new Set(['NO_PROGRESS', 'CONTRADICTED']);

function clip(value, max = 240) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/([?&][^=\s]+)=([^&#\s]+)/g, '$1=<redacted>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function positiveInt(value, fallback, min = 1, max = 100) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function unique(values, max = 8) {
  return [...new Set((values || []).filter(Boolean))].slice(0, max);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function trailingCount(entries, predicate) {
  let count = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!predicate(entries[index])) break;
    count += 1;
  }
  return count;
}

function alternatingLoop(entries) {
  if (entries.length < 4) return false;
  const recent = entries.slice(-4);
  const [first, second, third, fourth] = recent.map(item => item.signature);
  return Boolean(
    first
    && second
    && first !== second
    && first === third
    && second === fourth
    && recent.every(item => STAGNANT_OUTCOMES.has(item.outcome)),
  );
}

export function normalizeAgentActionType(value = '') {
  return clip(value, 80).toLowerCase().replace(/[ -]+/g, '_');
}

export function createAgentTrajectory({
  windowSize = 12,
  stallLimit = 2,
  failureLimit = 3,
  explorationLimit = 5,
} = {}) {
  return {
    window_size: positiveInt(windowSize, 12, 4, 30),
    stall_limit: positiveInt(stallLimit, 2, 2, 10),
    failure_limit: positiveInt(failureLimit, 3, 1, 10),
    exploration_limit: positiveInt(explorationLimit, 5, 2, 20),
    entries: [],
    consecutive_no_progress: 0,
    consecutive_failures: 0,
    repeated_action_count: 0,
    alternating_loop_detected: false,
    last_outcome: 'UNKNOWN',
    recovery: {
      status: 'CLEAR',
      reason_codes: [],
      strategies: [],
      avoid_action_signatures: [],
      avoid_actions: [],
    },
  };
}

export function resetAgentTrajectoryForReplan(trajectory = {}) {
  const normalized = normalizeTrajectory(trajectory);
  return {
    ...normalized,
    consecutive_no_progress: 0,
    consecutive_failures: 0,
    repeated_action_count: 0,
    alternating_loop_detected: false,
    recovery: {
      status: 'CLEAR',
      reason_codes: [],
      strategies: [],
      avoid_action_signatures: normalized.recovery.avoid_action_signatures,
      avoid_actions: normalized.recovery.avoid_actions,
    },
  };
}

function normalizeTrajectory(value = {}) {
  const base = createAgentTrajectory({
    windowSize: value.window_size,
    stallLimit: value.stall_limit,
    failureLimit: value.failure_limit,
    explorationLimit: value.exploration_limit,
  });
  return {
    ...base,
    ...value,
    entries: Array.isArray(value.entries) ? value.entries.slice(-base.window_size) : [],
    recovery: {
      ...base.recovery,
      ...(value.recovery || {}),
      reason_codes: unique(value.recovery?.reason_codes, 8),
      strategies: unique(value.recovery?.strategies, 6),
      avoid_action_signatures: unique(value.recovery?.avoid_action_signatures, 8),
      avoid_actions: unique(value.recovery?.avoid_actions, 6),
    },
  };
}

export function agentActionSignature({
  pageId = '',
  taskStepId = '',
  actionType = '',
  semanticTarget = '',
} = {}) {
  const normalized = [pageId, taskStepId, normalizeAgentActionType(actionType), semanticTarget]
    .map(value => clip(value, 300).toLowerCase())
    .join('|');
  return stableHash(normalized);
}

export function classifyAgentActionOutcome({
  actionType = '',
  verdict = '',
  stateDelta = null,
} = {}) {
  const normalizedType = normalizeAgentActionType(actionType);
  const normalizedVerdict = clip(verdict, 80).toUpperCase();
  const delta = stateDelta && typeof stateDelta === 'object' ? stateDelta : null;
  const progressClass = clip(delta?.progress_classification, 80).toUpperCase();
  const runtimeFailureCount = Math.max(0, Number(delta?.runtime_failure_count || 0));
  const progressScore = Math.max(0, Math.min(1, Number(delta?.progress_score || 0)));

  if (normalizedVerdict === 'BLOCKED') {
    return {
      outcome: 'BLOCKED',
      failure_class: 'SAFETY_BLOCK',
      reliable: true,
      progress_score: progressScore,
    };
  }
  if (normalizedVerdict === 'DISPROVED') {
    return {
      outcome: 'CONTRADICTED',
      failure_class: 'ORACLE_CONTRADICTION',
      reliable: true,
      progress_score: progressScore,
    };
  }
  if (runtimeFailureCount > 0 && !['PROGRESS', 'STRONG_PROGRESS', 'PROGRESS_WITH_RUNTIME_FAILURE'].includes(progressClass)) {
    return {
      outcome: 'CONTRADICTED',
      failure_class: 'RUNTIME_FAILURE',
      reliable: true,
      progress_score: progressScore,
    };
  }
  if (['STRONG_PROGRESS', 'PROGRESS', 'PROGRESS_WITH_RUNTIME_FAILURE'].includes(progressClass)) {
    return {
      outcome: runtimeFailureCount > 0 ? 'PROGRESS_WITH_RISK' : 'PROGRESS',
      failure_class: runtimeFailureCount > 0 ? 'RUNTIME_FAILURE' : 'NONE',
      reliable: true,
      progress_score: progressScore,
    };
  }
  if (progressClass === 'CONTRADICTED') {
    return {
      outcome: 'CONTRADICTED',
      failure_class: runtimeFailureCount > 0 ? 'RUNTIME_FAILURE' : 'STATE_CONTRADICTION',
      reliable: true,
      progress_score: progressScore,
    };
  }
  if (progressClass === 'NO_PROGRESS') {
    if (PASSIVE_ACTIONS.has(normalizedType)) {
      return {
        outcome: 'UNKNOWN',
        failure_class: 'NONE',
        reliable: false,
        progress_score: progressScore,
      };
    }
    return {
      outcome: 'NO_PROGRESS',
      failure_class: 'STATE_STAGNATION',
      reliable: RELIABLE_STATE_ACTIONS.has(normalizedType),
      progress_score: progressScore,
    };
  }
  return {
    outcome: 'UNKNOWN',
    failure_class: 'UNVERIFIED',
    reliable: false,
    progress_score: progressScore,
  };
}

function recoveryStrategies({ outcome, failureClass, loopDetected, explorationExceeded }) {
  const strategies = [];
  if (failureClass === 'SAFETY_BLOCK') {
    strategies.push('Stop the blocked action; request exact authorization or choose a read-only path');
  }
  if (failureClass === 'RUNTIME_FAILURE') {
    strategies.push('Correlate same-session network, console and page-error evidence before another action');
    strategies.push('Do not retry a write until side-effect read-back is known');
  }
  if (outcome === 'NO_PROGRESS' || loopDetected) {
    strategies.push('Re-observe at standard detail and inspect overlays, dialogs, frames and stale targets');
    strategies.push('Choose a different semantic target or route instead of repeating the same action');
  }
  if (explorationExceeded) {
    strategies.push('Split the current goal into smaller observable steps or replace the task plan');
  }
  return unique(strategies, 6);
}

export function updateAgentTrajectory(trajectory, {
  actionId = '',
  decisionId = '',
  pageId = '',
  taskStepId = '',
  actionType = '',
  semanticTarget = '',
  verdict = '',
  stateDelta = null,
  stepActionCount = 0,
  recordedAt = '',
} = {}) {
  const current = normalizeTrajectory(trajectory);
  const classification = classifyAgentActionOutcome({ actionType, verdict, stateDelta });
  const signature = agentActionSignature({ pageId, taskStepId, actionType, semanticTarget });
  const entry = {
    action_id: clip(actionId, 120) || null,
    decision_id: clip(decisionId, 120) || null,
    page_id: clip(pageId, 120) || null,
    task_step_id: clip(taskStepId, 120) || null,
    action_type: normalizeAgentActionType(actionType) || 'unknown',
    semantic_target: clip(semanticTarget, 180) || null,
    signature,
    outcome: classification.outcome,
    failure_class: classification.failure_class,
    reliable: classification.reliable,
    progress_score: classification.progress_score,
    recorded_at: clip(recordedAt, 80) || null,
  };
  const entries = [...current.entries, entry].slice(-current.window_size);
  const consecutiveNoProgress = trailingCount(
    entries,
    item => item.outcome === 'NO_PROGRESS' && item.reliable,
  );
  const consecutiveFailures = trailingCount(entries, item => FAILURE_OUTCOMES.has(item.outcome));
  const repeatedActionCount = entries.filter(
    item => item.signature === signature && STAGNANT_OUTCOMES.has(item.outcome),
  ).length;
  const loopDetected = alternatingLoop(entries);
  const explorationExceeded = Number(stepActionCount || 0) >= current.exploration_limit
    && !['PROGRESS', 'PROGRESS_WITH_RISK'].includes(classification.outcome);
  const stallDetected = consecutiveNoProgress >= current.stall_limit;
  const repeatedStall = repeatedActionCount >= current.stall_limit;
  const failureLimitReached = consecutiveFailures >= current.failure_limit;
  const reasonCodes = [];
  if (classification.failure_class === 'SAFETY_BLOCK') reasonCodes.push('SAFETY_BLOCK');
  if (classification.failure_class === 'RUNTIME_FAILURE') reasonCodes.push('RUNTIME_FAILURE');
  if (stallDetected) reasonCodes.push('PAGE_STAGNATION');
  if (repeatedStall) reasonCodes.push('REPEATED_ACTION');
  if (loopDetected) reasonCodes.push('ALTERNATING_ACTION_LOOP');
  if (failureLimitReached) reasonCodes.push('FAILURE_BUDGET_EXHAUSTED');
  if (explorationExceeded) reasonCodes.push('STEP_EXPLORATION_LIMIT');

  let status = 'CLEAR';
  if (classification.failure_class === 'SAFETY_BLOCK') status = 'STOP_REQUIRED';
  else if (stallDetected || repeatedStall || loopDetected || failureLimitReached || explorationExceeded) {
    status = 'REPLAN_REQUIRED';
  } else if (classification.outcome === 'NO_PROGRESS'
    || classification.outcome === 'CONTRADICTED'
    || classification.outcome === 'PROGRESS_WITH_RISK') {
    status = 'NUDGE';
  }

  const shouldAvoid = repeatedStall || loopDetected;
  const avoidAction = `${entry.action_type} ${entry.semantic_target || 'target'} on ${entry.page_id || 'page'}`;
  const recovery = {
    status,
    reason_codes: unique(reasonCodes, 8),
    strategies: recoveryStrategies({
      outcome: classification.outcome,
      failureClass: classification.failure_class,
      loopDetected,
      explorationExceeded,
    }),
    avoid_action_signatures: unique([
      ...(current.recovery?.avoid_action_signatures || []),
      ...(shouldAvoid ? [signature] : []),
    ], 8),
    avoid_actions: unique([
      ...(current.recovery?.avoid_actions || []),
      ...(shouldAvoid ? [avoidAction] : []),
    ], 6),
  };

  return {
    trajectory: {
      ...current,
      entries,
      consecutive_no_progress: consecutiveNoProgress,
      consecutive_failures: consecutiveFailures,
      repeated_action_count: repeatedActionCount,
      alternating_loop_detected: loopDetected,
      last_outcome: classification.outcome,
      recovery,
    },
    entry,
    recovery,
  };
}

