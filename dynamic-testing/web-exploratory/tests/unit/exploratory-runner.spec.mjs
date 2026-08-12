import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  finishExploratoryRun,
  getExploratoryAgentContext,
  normalizeExploratoryMode,
  recordExploratoryAction,
  recordExploratoryRuleProbe,
  recordExploratoryTaskDecision,
  recordExploratoryTaskJudge,
  registerPage,
  setExploratoryCharterVerdict,
  setExploratoryCoverage,
  setExploratoryRulePlan,
  setExploratoryTaskPlan,
  startExploratoryRun,
} from '../../scripts/helpers/exploratory-runner.mjs';

const runnerScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/helpers/exploratory-runner.mjs',
);

test('browser explorer mode has a clear canonical name and preserves the legacy alias', () => {
  assert.equal(normalizeExploratoryMode('EXPLORATORY_BROWSER_QA'), 'EXPLORATORY_BROWSER_QA');
  assert.equal(normalizeExploratoryMode('EXPLORATORY_ADHOC'), 'EXPLORATORY_BROWSER_QA');
  assert.equal(normalizeExploratoryMode('exploratory browser qa'), 'EXPLORATORY_BROWSER_QA');
});

test('UI-first exploratory run starts without documents or business context', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ui-first-run-'));
  try {
    const started = startExploratoryRun({
      dataDir,
      runId: 'ui-first-test',
      mode: 'EXPLORATORY_ADHOC',
      scope: 'dashboard',
      browserDriver: 'playwright-runtime',
      browserObserver: 'playwright-runtime',
      networkObserver: 'playwright-runtime',
      sessionId: 'ui-first-session',
    });
    assert.equal(started.run.business_context.source, 'ui_runtime');
    assert.equal(started.run.business_context.status, 'UI_DISCOVERY');
    assert.equal(started.run.charters.length, 1);
    assert.match(started.run.charters[0].mission, /visible UI flow/i);
    assert.equal(started.run.charters[0].status, 'PENDING');
    assert.equal(started.run.charters[0].verdict, null);

    const finished = finishExploratoryRun({
      dataDir,
      runId: started.run.run_id,
      verdict: 'UNTEST',
      reason: 'Browser target was not supplied for this dry-run fixture',
    });
    assert.equal(finished.run.status, 'UNTEST');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner defaults to the skill Playwright runtime', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-browser-default-'));
  try {
    const result = spawnSync(process.execPath, [
      runnerScript,
      'start',
      '--run-id', 'browser-default',
      '--mode', 'EXPLORATORY_BROWSER_QA',
      '--scope', 'dashboard',
      '--session-id', 'browser-default-session',
    ], {
      cwd: dataDir,
      env: {
        ...process.env,
        QA_DATA_DIR: dataDir,
        QA_BROWSER_DRIVER: '',
        QA_BROWSER_OBSERVER: '',
        QA_NETWORK_OBSERVER: '',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const run = JSON.parse(fs.readFileSync(
      path.join(dataDir, 'evidence', 'exploratory', 'browser-default', 'run.json'),
      'utf8',
    ));
    assert.equal(run.browser.driver, 'playwright-runtime');
    assert.equal(run.browser.observer, 'playwright-runtime');
    assert.equal(run.browser.network_observer, 'playwright-runtime');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('legacy exploratory BLOCKED and PARTIAL results normalize to UNTEST', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-legacy-verdict-'));
  try {
    for (const [index, legacyVerdict] of ['BLOCKED', 'PARTIAL'].entries()) {
      const started = startExploratoryRun({
        dataDir,
        runId: `legacy-${index}`,
        mode: 'EXPLORATORY_BROWSER_QA',
        scope: 'profile',
        browserDriver: 'playwright-runtime',
        browserObserver: 'playwright-runtime',
        networkObserver: 'playwright-runtime',
        sessionId: `legacy-session-${index}`,
      });
      const finished = finishExploratoryRun({
        dataDir,
        runId: started.run.run_id,
        verdict: legacyVerdict,
        reason: `Legacy ${legacyVerdict} result has no user-facing equivalent`,
      });
      assert.equal(finished.run.status, 'UNTEST');
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

function readRun(dataDir, runId) {
  return JSON.parse(fs.readFileSync(
    path.join(dataDir, 'evidence', 'exploratory', runId, 'run.json'),
    'utf8',
  ));
}

function rulePlan({ includeAllProbes = false } = {}) {
  const probes = includeAllProbes
    ? [
      { probe_id: 'RULE-UNIQUE', type: 'uniqueness', applicability: 'required', target: 'Order number', hypothesis: 'A duplicate order number is rejected or normalized', safe_strategy: 'Use an isolated order namespace and two reversible test attempts' },
      { probe_id: 'RULE-AUTH', type: 'authorization', applicability: 'required', target: 'Order edit action', hypothesis: 'A comparison role cannot edit the same protected order', safe_strategy: 'Use the same disposable order and authorized role accounts without changing permissions' },
      { probe_id: 'RULE-SIDE', type: 'side_effect', applicability: 'required', target: 'Order save transition', hypothesis: 'Saving an order creates or updates only the documented related record', safe_strategy: 'Use a disposable order and safe read-back before and after one save' },
      { probe_id: 'RULE-ORACLE', type: 'oracle', applicability: 'required', target: 'Order detail result', hypothesis: 'The final UI and response agree with the explicit business expected result', safe_strategy: 'Use a read-only reload and redacted response comparison' },
    ]
    : [
      { probe_id: 'RULE-UNIQUE', type: 'uniqueness', applicability: 'not_applicable', reason: 'The default fixture is a read-only order detail flow', applicability_basis: 'scope_boundary excludes order edit and create transitions' },
      { probe_id: 'RULE-AUTH', type: 'authorization', applicability: 'not_applicable', reason: 'The default fixture has one role and no protected mutation', applicability_basis: 'coverage scope includes only the Buyer read-only role' },
      { probe_id: 'RULE-SIDE', type: 'side_effect', applicability: 'not_applicable', reason: 'The default fixture has no state-changing action', applicability_basis: 'charter target is a GET-only order detail route' },
      { probe_id: 'RULE-ORACLE', type: 'oracle', applicability: 'not_applicable', reason: 'The charter oracle covers the read-only rendering in this fixture', applicability_basis: 'business brief provides an explicit detail-heading oracle' },
    ];
  return {
    scope_boundary: {
      name: 'orders read-only detail fixture',
      included: ['/orders/1', 'Buyer role', 'ready detail state'],
      excluded: ['order edit', 'payment', 'admin role'],
      stop_condition: 'Stop when the detail route, role and documented read-only oracle are verified',
    },
    probes: [
      ...probes,
      { probe_id: 'RULE-COVERAGE', type: 'coverage', applicability: 'required', target: 'Orders detail scope', hypothesis: 'Every included route, role, state, data class and dependency has an explicit result', safe_strategy: 'Traverse only the declared read-only scope and record explicit exclusions' },
    ],
  };
}

function coverageMap() {
  const covered = key => [{ key, status: 'covered', evidence_refs: ['coverage:fixture'] }];
  return {
    scope_status: 'COMPLETE_FOR_SCOPE',
    modules: covered('orders'),
    routes: covered('/orders/1'),
    roles: covered('Buyer'),
    states: covered('ready detail'),
    transitions: covered('list → detail'),
    data_classes: covered('order summary'),
    dependencies: covered('orders read API'),
    gaps: [],
  };
}

function fixture({ includeAllProbes = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-exploratory-runner-'));
  const contextDir = path.join(dataDir, 'qa-knowledge', 'context');
  fs.mkdirSync(contextDir, { recursive: true });
  const briefPath = path.join(contextDir, 'business-execution-brief.json');
  const brief = {
    status: 'READY',
    intent: 'EXPLORATORY_ADHOC',
    scope: 'orders',
    risk_inventory: [{ risk_id: 'RISK-ORDER-001', priority: 'high' }],
    exploratory_charters: [{ charter_id: 'C-ORDER-HIGH', priority: 'high' }],
  };
  fs.writeFileSync(briefPath, JSON.stringify(brief), 'utf8');
  const briefHash = crypto.createHash('sha256')
    .update(fs.readFileSync(briefPath))
    .digest('hex')
    .slice(0, 12);
  const cardPath = path.join(contextDir, 'business-execution-card.json');
  const card = {
    schema_version: 1,
    artifact: 'business-execution-card',
    status: 'READY',
    intent: 'EXPLORATORY_ADHOC',
    scope: 'orders',
    retrieval: {
      full_brief_sha256_12: briefHash,
      high_charter_ids: ['C-ORDER-HIGH'],
      deferred_charter_ids: [],
    },
    budget: {
      max_estimated_tokens: 3200,
      estimated_tokens: 500,
      within_budget: true,
    },
    exploratory_charters: [{
      charter_id: 'C-ORDER-HIGH',
      risk_id: 'RISK-ORDER-001',
      priority: 'high',
      mission: 'Open an order and verify the detail state',
      target: ['/orders/1'],
      roles: ['Buyer'],
      techniques: ['happy path'],
      oracles: ['Order detail matches the selected order'],
      source_refs: ['orders.md'],
    }],
  };
  fs.writeFileSync(cardPath, JSON.stringify(card), 'utf8');
  const media = path.join(dataDir, 'evidence', 'runs', 'order-detail.png');
  fs.mkdirSync(path.dirname(media), { recursive: true });
  fs.writeFileSync(media, 'test-media', 'utf8');
  const started = startExploratoryRun({
    dataDir,
    runId: 'explore-test-1',
    scope: 'orders',
    briefPath,
    cardPath,
    browserDriver: 'playwright-mcp',
    browserObserver: 'playwright-mcp',
    networkObserver: 'playwright-mcp',
    sessionId: 'session-test-1',
  });
  registerPage({
    dataDir,
    runId: started.run.run_id,
    page: {
      page_id: 'page-main',
      session_id: 'session-test-1',
      url: 'https://app.test/orders/1',
      title: 'Order details',
      role: 'Buyer',
    },
  });
  setExploratoryRulePlan({
    dataDir,
    runId: started.run.run_id,
    plan: rulePlan({ includeAllProbes }),
  });
  setExploratoryCoverage({
    dataDir,
    runId: started.run.run_id,
    coverage: coverageMap(),
  });
  return { dataDir, media, runId: started.run.run_id };
}

function actionInput({ media = '', overrides = {} } = {}) {
  return {
    charter_id: 'C-ORDER-HIGH',
    step_id: 'open-order',
    session_id: 'session-test-1',
    page_id: 'page-main',
    intent: 'Reach the order detail risk boundary',
    semantic_target: 'Order details link',
    locator_evidence: {
      strategy: 'AX_SEMANTIC',
      selector: 'link[Order details]',
      source: 'live_dom',
      verified: true,
    },
    action: 'Open order details',
    http_method: 'GET',
    target_url: 'https://app.test/orders/1',
    expected_signal: 'Order detail heading is visible',
    actual_signal: 'Order detail heading is visible',
    observability: {
      network: 'no_matching_event',
      console: 'no_matching_event',
      page_error: 'no_matching_event',
    },
    network_refs: [],
    console_refs: [],
    page_error_refs: [],
    media_refs: media ? [media] : [],
    verdict: 'CONFIRMED',
    ...overrides,
  };
}

function decidePass(dataDir, runId, evidenceRefs = []) {
  const run = readRun(dataDir, runId);
  recordExploratoryRuleProbe({
    dataDir,
    runId,
    probe: {
      probe_id: 'RULE-COVERAGE',
      outcome: 'RUNTIME_VERIFIED',
      action_ids: run.actions.map(action => action.action_id),
      observed_rule: 'All scoped fixture dimensions were traversed and reconciled',
      media_refs: evidenceRefs,
      network_refs: ['network:coverage-fixture'],
    },
  });
  return setExploratoryCharterVerdict({
    dataDir,
    runId,
    charter: { charter_id: 'C-ORDER-HIGH', verdict: 'PASS', evidence_refs: evidenceRefs },
  });
}

test('exploratory runner records a same-session action and allows evidence-backed PASS', () => {
  const ctx = fixture();
  try {
    const action = recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      action: actionInput({ media: ctx.media }),
    });
    assert.equal(action.action.computed_safety, 'READ_ONLY');
    decidePass(ctx.dataDir, ctx.runId, [ctx.media]);
    const finished = finishExploratoryRun({ dataDir: ctx.dataDir, runId: ctx.runId, verdict: 'PASS' });
    assert.equal(finished.run.status, 'PASS');
    assert.equal(finished.run.budget.action_count, 1);
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner blocks PASS when final visual evidence is missing', () => {
  const ctx = fixture();
  try {
    recordExploratoryAction({ dataDir: ctx.dataDir, runId: ctx.runId, action: actionInput() });
    const run = readRun(ctx.dataDir, ctx.runId);
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: {
        probe_id: 'RULE-COVERAGE',
        outcome: 'RUNTIME_VERIFIED',
        action_ids: run.actions.map(action => action.action_id),
        observed_rule: 'Coverage map was recorded for the fixture',
        media_refs: [ctx.media],
        network_refs: ['network:coverage-fixture'],
      },
    });
    setExploratoryCharterVerdict({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      charter: { charter_id: 'C-ORDER-HIGH', verdict: 'PASS' },
    });
    assert.throws(
      () => finishExploratoryRun({ dataDir: ctx.dataDir, runId: ctx.runId, verdict: 'PASS' }),
      /screenshot\/video evidence/,
    );
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner verifies uniqueness, authorization, side effects, oracle and coverage probes', () => {
  const ctx = fixture({ includeAllProbes: true });
  try {
    const first = recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      action: actionInput({ media: ctx.media, overrides: { step_id: 'probe-unique-first', action: 'Check order number' } }),
    });
    const second = recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      action: actionInput({ media: ctx.media, overrides: { step_id: 'probe-unique-second', action: 'Check duplicate order number' } }),
    });
    const actionIds = [first.action.action_id, second.action.action_id];
    const evidence = { media_refs: [ctx.media], network_refs: ['network:probe'], readback_refs: ['readback:order'] };

    assert.throws(
      () => recordExploratoryRuleProbe({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        probe: { probe_id: 'RULE-UNIQUE', outcome: 'RUNTIME_VERIFIED', action_ids: actionIds, attempts: 1, observed_rule: 'duplicate rejected', ...evidence },
      }),
      /at least two attempts/,
    );
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: { probe_id: 'RULE-UNIQUE', outcome: 'RUNTIME_VERIFIED', action_ids: actionIds, attempts: 2, observed_rule: 'second candidate was rejected as duplicate', ...evidence },
    });
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: {
        probe_id: 'RULE-AUTH',
        outcome: 'RUNTIME_VERIFIED',
        action_ids: [first.action.action_id],
        observed_rule: 'comparison role cannot edit the same order',
        role_comparison: { subject_role: 'Buyer', comparison_role: 'Viewer', same_target: true },
        role_comparison_refs: ['role-comparison:buyer-viewer'],
        media_refs: [ctx.media],
        network_refs: ['network:authorization'],
      },
    });
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: {
        probe_id: 'RULE-SIDE',
        outcome: 'RUNTIME_VERIFIED',
        action_ids: [second.action.action_id],
        observed_rule: 'save changed the order only and no undocumented related record appeared',
        before_refs: ['readback:order-before'],
        after_refs: ['readback:order-after'],
        media_refs: [ctx.media],
        network_refs: ['network:save'],
        readback_refs: ['readback:order-before', 'readback:order-after'],
      },
    });
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: {
        probe_id: 'RULE-ORACLE',
        outcome: 'RUNTIME_VERIFIED',
        action_ids: [second.action.action_id],
        observed_rule: 'UI and response matched the order-save expected result',
        oracle: { basis: 'business brief invariant', expected_signal: 'saved order is visible after reload', actual_signal: 'saved order is visible after reload' },
        media_refs: [ctx.media],
        network_refs: ['network:oracle'],
      },
    });
    recordExploratoryRuleProbe({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      probe: {
        probe_id: 'RULE-COVERAGE',
        outcome: 'RUNTIME_VERIFIED',
        action_ids: actionIds,
        observed_rule: 'All scoped dimensions were covered',
        media_refs: [ctx.media],
        network_refs: ['network:coverage'],
      },
    });
    setExploratoryCharterVerdict({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      charter: { charter_id: 'C-ORDER-HIGH', verdict: 'PASS', evidence_refs: [ctx.media] },
    });
    const finished = finishExploratoryRun({ dataDir: ctx.dataDir, runId: ctx.runId, verdict: 'PASS' });
    assert.equal(finished.run.status, 'PASS');
    assert.equal(finished.run.rule_discovery.gaps.length, 0);
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner enforces a numeric action budget and persists exhaustion', () => {
  const ctx = fixture();
  try {
    const budgetRun = startExploratoryRun({
      dataDir: ctx.dataDir,
      runId: 'budget-run',
      scope: 'orders',
      briefPath: path.join(ctx.dataDir, 'qa-knowledge/context/business-execution-brief.json'),
      cardPath: path.join(ctx.dataDir, 'qa-knowledge/context/business-execution-card.json'),
      browserDriver: 'playwright-mcp',
      browserObserver: 'playwright-mcp',
      networkObserver: 'playwright-mcp',
      sessionId: 'session-budget',
      maxActions: 1,
    });
    registerPage({
      dataDir: ctx.dataDir,
      runId: budgetRun.run.run_id,
      page: { page_id: 'budget-page', session_id: 'session-budget', url: 'https://app.test/orders/1' },
    });
    setExploratoryRulePlan({ dataDir: ctx.dataDir, runId: budgetRun.run.run_id, plan: rulePlan() });
    setExploratoryCoverage({ dataDir: ctx.dataDir, runId: budgetRun.run.run_id, coverage: coverageMap() });
    recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: budgetRun.run.run_id,
      action: actionInput({ overrides: { page_id: 'budget-page', session_id: 'session-budget' } }),
    });
    assert.throws(
      () => recordExploratoryAction({
        dataDir: ctx.dataDir,
        runId: budgetRun.run.run_id,
        action: actionInput({ overrides: { page_id: 'budget-page', session_id: 'session-budget' } }),
      }),
      error => error.code === 'BUDGET_EXHAUSTED',
    );
    const persisted = JSON.parse(fs.readFileSync(
      path.join(ctx.dataDir, 'evidence/exploratory/budget-run/run.json'),
      'utf8',
    ));
    assert.equal(persisted.budget.exhausted, true);
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner rejects cross-session pages', () => {
  const ctx = fixture();
  try {
    assert.throws(
      () => registerPage({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        page: { page_id: 'wrong-page', session_id: 'other-session', url: 'https://app.test/orders/1' },
      }),
      /does not match the exploratory run session/,
    );
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner requires a reason for XPath fallback', () => {
  const ctx = fixture();
  try {
    assert.throws(
      () => recordExploratoryAction({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        action: actionInput({
          overrides: {
            locator_evidence: {
              strategy: 'XPATH',
              selector: '//a[normalize-space()="Order details"]',
              source: 'live_dom',
              verified: true,
            },
          },
        }),
      }),
      /XPath requires a recorded fallback_reason/,
    );
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner rejects mutation retries and records safe retry quality', () => {
  const ctx = fixture();
  try {
    const mutation = actionInput({
      overrides: {
        action: 'Save order draft',
        http_method: 'POST',
        expected_signal: 'Draft is saved',
        actual_signal: 'Draft is saved',
      },
    });
    const first = recordExploratoryAction({ dataDir: ctx.dataDir, runId: ctx.runId, action: mutation });
    assert.equal(first.action.computed_safety, 'SAFE_WRITE');
    assert.throws(
      () => recordExploratoryAction({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        action: actionInput({
          overrides: {
            action: 'Save order draft',
            http_method: 'POST',
            retry_of: first.action.action_id,
            retry_classification: 'recovered',
          },
        }),
      }),
      /automatic retry is allowed only for READ_ONLY actions/,
    );
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('exploratory runner blocks destructive actions and exposes UNTEST instead of BLOCKED', () => {
  const ctx = fixture();
  try {
    const blocked = recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      action: actionInput({
        overrides: {
          action: 'Delete order',
          http_method: 'DELETE',
          verdict: 'BLOCKED',
          locator_evidence: { strategy: 'AX_SEMANTIC', source: 'planned', verified: false },
          observability: { network: 'blocked', console: 'blocked', page_error: 'blocked' },
        },
      }),
    });
    assert.equal(blocked.action.computed_safety, 'BLOCKED');
    setExploratoryCharterVerdict({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      charter: { charter_id: 'C-ORDER-HIGH', verdict: 'UNTEST', reason: 'Destructive action needs explicit authorization' },
    });
    const finished = finishExploratoryRun({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      verdict: 'UNTEST',
      reason: 'Destructive action needs explicit authorization',
    });
    assert.equal(finished.run.status, 'UNTEST');
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

function agenticTaskPlan({ revision = 1, replanReason = '' } = {}) {
  return {
    session_id: 'session-test-1',
    page_id: 'page-main',
    observation_revision: revision,
    objective: 'Open the selected order and verify its detail state',
    success_signals: ['The selected order detail heading and identifier are visible'],
    stop_conditions: ['Stop after the selected order detail state is verified or cannot be reached safely'],
    constraints: ['Stay on app.test and do not modify the order'],
    rationale: 'The live order page exposes a read-only details link that can satisfy the objective',
    replan_reason: replanReason,
    steps: [{
      task_step_id: revision === 1 ? 'TASK-OPEN-ORDER' : 'TASK-OPEN-ORDER-ALT',
      goal: 'Reach the selected order detail page',
      success_signal: 'Order detail heading is visible',
      safety_boundary: 'Use only read-only navigation',
    }],
  };
}

function agenticDecision({
  revision = 1,
  evaluation = 'NOT_STARTED',
  overrides = {},
} = {}) {
  return {
    session_id: 'session-test-1',
    page_id: 'page-main',
    observation_revision: revision,
    task_step_id: revision === 1 ? 'TASK-OPEN-ORDER' : 'TASK-OPEN-ORDER-ALT',
    charter_id: 'C-ORDER-HIGH',
    evaluation_previous_goal: evaluation,
    decision: 'ACT',
    next_goal: 'Open order details and inspect the resulting state',
    selected_action: {
      type: 'click',
      semantic_target: 'Order details link',
      expected_signal: 'Order detail heading is visible',
      safety_boundary: 'Use only read-only navigation',
    },
    alternatives_considered: ['Open the URL directly'],
    rationale: 'The semantic details link is the smallest reversible action toward the current goal',
    memory: ['Order list is visible and the details link is enabled'],
    ...overrides,
  };
}

test('agentic task planning links a concise UI-derived decision to the executed QA action', () => {
  const ctx = fixture();
  try {
    const planned = setExploratoryTaskPlan({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      plan: agenticTaskPlan(),
    });
    assert.equal(planned.taskPlan.status, 'READY');
    assert.equal(planned.taskPlan.current_step_id, 'TASK-OPEN-ORDER');

    const decided = recordExploratoryTaskDecision({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      decision: agenticDecision(),
    });
    assert.equal(decided.decision.decision_id, 'DEC-0001');
    assert.equal(decided.run.agentic_task.status, 'IN_PROGRESS');

    const action = recordExploratoryAction({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      action: actionInput({ overrides: { decision_id: decided.decision.decision_id } }),
    });
    assert.equal(action.action.decision_id, 'DEC-0001');
    assert.equal(action.run.agentic_task.decisions[0].action_id, action.action.action_id);
    assert.deepEqual(action.run.agentic_task.steps[0].action_ids, [action.action.action_id]);

    const agentContext = getExploratoryAgentContext({ dataDir: ctx.dataDir, runId: ctx.runId });
    assert.equal(agentContext.task.current_step.task_step_id, 'TASK-OPEN-ORDER');
    assert.equal(agentContext.task.last_decision.decision_id, 'DEC-0001');
    assert.equal(agentContext.context_budget.source, 'compact-agent-context');
    assert.ok(agentContext.context_budget.estimated_tokens_utf8_div4 < 1000);

    const completed = recordExploratoryTaskDecision({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      decision: agenticDecision({
        revision: 2,
        evaluation: 'ACHIEVED',
        overrides: {
          task_step_id: 'TASK-OPEN-ORDER',
          decision: 'COMPLETE',
          next_goal: '',
          rationale: 'The observed order detail state satisfies the planned task success signal',
          evidence_refs: [ctx.media],
        },
      }),
    });
    assert.equal(completed.run.agentic_task.status, 'COMPLETED');
    assert.equal(completed.run.agentic_task.steps[0].status, 'COMPLETED');

    decidePass(ctx.dataDir, ctx.runId, [ctx.media]);
    assert.throws(
      () => finishExploratoryRun({ dataDir: ctx.dataDir, runId: ctx.runId, verdict: 'PASS' }),
      /SATISFIED task judge/,
    );
    const judged = recordExploratoryTaskJudge({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      judge: {
        judgement: 'SATISFIED',
        reason: 'The final UI state independently satisfies the declared task signal',
        success_signal_results: [{
          signal: 'The selected order detail heading and identifier are visible',
          status: 'OBSERVED',
          actual: 'Order detail heading and selected identifier are visible',
          evidence_refs: [ctx.media],
        }],
      },
    });
    assert.equal(judged.judge.judgement, 'SATISFIED');
    const finished = finishExploratoryRun({ dataDir: ctx.dataDir, runId: ctx.runId, verdict: 'PASS' });
    assert.equal(finished.run.status, 'PASS');
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});

test('agentic task ledger rejects raw chain-of-thought and requires replan after repeated no-progress', () => {
  const ctx = fixture();
  try {
    setExploratoryTaskPlan({ dataDir: ctx.dataDir, runId: ctx.runId, plan: agenticTaskPlan() });
    assert.throws(
      () => recordExploratoryTaskDecision({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        decision: agenticDecision({ overrides: { thinking: 'private reasoning trace' } }),
      }),
      /concise rationale, not raw reasoning fields/,
    );
    recordExploratoryTaskDecision({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      decision: agenticDecision({ evaluation: 'NO_PROGRESS' }),
    });
    const repeated = recordExploratoryTaskDecision({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      decision: agenticDecision({ evaluation: 'NO_PROGRESS', revision: 1 }),
    });
    assert.equal(repeated.run.agentic_task.requires_replan, true);
    assert.throws(
      () => recordExploratoryTaskDecision({
        dataDir: ctx.dataDir,
        runId: ctx.runId,
        decision: agenticDecision(),
      }),
      /record a replan before another action/,
    );
    const replanned = setExploratoryTaskPlan({
      dataDir: ctx.dataDir,
      runId: ctx.runId,
      plan: agenticTaskPlan({ revision: 2, replanReason: 'The original details link produced no page-state delta twice' }),
    });
    assert.equal(replanned.taskPlan.plan_revision, 2);
    assert.equal(replanned.taskPlan.replan_count, 1);
    assert.equal(replanned.taskPlan.requires_replan, false);
  } finally {
    fs.rmSync(ctx.dataDir, { recursive: true, force: true });
  }
});
