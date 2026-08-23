import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAgentActionOutcome,
  createAgentTrajectory,
  resetAgentTrajectoryForReplan,
  updateAgentTrajectory,
} from '../../lib/agent-trajectory.mjs';

function noProgressDelta() {
  return {
    progress_classification: 'NO_PROGRESS',
    progress_score: 0,
    runtime_failure_count: 0,
  };
}

function actionInput(overrides = {}) {
  return {
    actionId: 'ACT-0001',
    decisionId: 'DEC-0001',
    pageId: 'page-main',
    taskStepId: 'TASK-OPEN-ORDER',
    actionType: 'click',
    semanticTarget: 'Order details link',
    verdict: 'CONFIRMED',
    stateDelta: noProgressDelta(),
    stepActionCount: 1,
    recordedAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

test('trajectory outcome trusts deterministic state changes but does not punish passive waits', () => {
  assert.equal(classifyAgentActionOutcome({
    actionType: 'fill',
    verdict: 'CONFIRMED',
    stateDelta: {
      progress_classification: 'PROGRESS',
      progress_score: 0.25,
      form_state_changed: true,
    },
  }).outcome, 'PROGRESS');

  const passive = classifyAgentActionOutcome({
    actionType: 'wait',
    verdict: 'CONFIRMED',
    stateDelta: noProgressDelta(),
  });
  assert.equal(passive.outcome, 'UNKNOWN');
  assert.equal(passive.reliable, false);
});

test('trajectory requires replan after the same reliable action stalls twice', () => {
  let trajectory = createAgentTrajectory({ stallLimit: 2 });
  let result = updateAgentTrajectory(trajectory, actionInput());
  assert.equal(result.recovery.status, 'NUDGE');

  result = updateAgentTrajectory(result.trajectory, actionInput({
    actionId: 'ACT-0002',
    decisionId: 'DEC-0002',
    stepActionCount: 2,
  }));
  trajectory = result.trajectory;

  assert.equal(result.recovery.status, 'REPLAN_REQUIRED');
  assert.ok(result.recovery.reason_codes.includes('PAGE_STAGNATION'));
  assert.ok(result.recovery.reason_codes.includes('REPEATED_ACTION'));
  assert.equal(trajectory.repeated_action_count, 2);
  assert.match(result.recovery.avoid_actions[0], /click Order details link/);
});

test('trajectory detects an alternating A-B-A-B loop inside the rolling window', () => {
  let trajectory = createAgentTrajectory({ stallLimit: 10, windowSize: 8 });
  const targets = ['Orders tab', 'Customers tab', 'Orders tab', 'Customers tab'];
  targets.forEach((semanticTarget, index) => {
    const result = updateAgentTrajectory(trajectory, actionInput({
      actionId: `ACT-000${index + 1}`,
      decisionId: `DEC-000${index + 1}`,
      semanticTarget,
      stepActionCount: index + 1,
    }));
    trajectory = result.trajectory;
  });

  assert.equal(trajectory.alternating_loop_detected, true);
  assert.equal(trajectory.recovery.status, 'REPLAN_REQUIRED');
  assert.ok(trajectory.recovery.reason_codes.includes('ALTERNATING_ACTION_LOOP'));
});

test('replan clears active stall counters but preserves failed-strategy memory', () => {
  let trajectory = createAgentTrajectory({ stallLimit: 2 });
  trajectory = updateAgentTrajectory(trajectory, actionInput()).trajectory;
  trajectory = updateAgentTrajectory(trajectory, actionInput({
    actionId: 'ACT-0002',
    decisionId: 'DEC-0002',
    stepActionCount: 2,
  })).trajectory;

  const reset = resetAgentTrajectoryForReplan(trajectory);
  assert.equal(reset.consecutive_no_progress, 0);
  assert.equal(reset.recovery.status, 'CLEAR');
  assert.equal(reset.recovery.avoid_action_signatures.length, 1);
  assert.equal(reset.recovery.avoid_actions.length, 1);
});

