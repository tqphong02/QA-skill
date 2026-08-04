# Agentic task planning for exploratory browser QA

Use this reference when `EXPLORATORY_BROWSER_QA` or its legacy `EXPLORATORY_ADHOC` alias receives a natural-language objective whose browser path is not already deterministic. Let the host agent infer how to complete the task from the live UI while keeping `qa-run` responsible for safety, oracle, evidence, coverage and the final QA verdict

## Contents

- [Design provenance](#design-provenance)
- [Responsibility boundary](#responsibility-boundary)
- [Canonical loop](#canonical-loop)
- [Task-plan contract](#task-plan-contract)
- [Decision contract](#decision-contract)
- [Compact memory and reasoning privacy](#compact-memory-and-reasoning-privacy)
- [Progress and loop detection](#progress-and-loop-detection)
- [Independent completion judge](#independent-completion-judge)
- [Completion and QA verdict](#completion-and-qa-verdict)

## Design provenance

This contract adapts general patterns visible in the open-source Browser Use agent architecture:

- give the agent the current browser/page state before every step
- evaluate the previous goal, retain compact memory, select the next goal and emit a browser action
- repeat bounded steps until the task is complete, unsuccessful or out of budget
- preserve action/result history and independently judge completion

References: `https://github.com/browser-use/browser-use`, especially `browser_use/agent/service.py` and `browser_use/agent/views.py`

Do not copy Browser Use code, install it, import it or invoke it. `qa-run` uses its own Playwright/CDP runtime and QA ledger. Browser Use is design research only

## Responsibility boundary

Keep these layers separate:

```text
Agentic task layer
  infer path, decompose objective, choose next goal/action, replan

Browser runtime layer
  observe live page, resolve semantic target, perform action, return state delta

QA layer
  define oracle, observe network/console/page errors, collect evidence,
  probe hidden rules, decide PASS|FAILED|N/A|UNTEST
```

A technically completed task is not automatically a QA `PASS`. A task can reach its visible destination while the QA result is `FAILED` because the observed state contradicts the oracle, or `UNTEST` because evidence/authority/oracle is missing

## Canonical loop

Run this sequence for a non-deterministic multi-step objective:

```text
validate target/domain/objective
start run + browser session
declare hidden-rule plan
observe live UI
create agentic task plan

repeat:
  load compact agent context, not the full run transcript
  evaluate previous goal
  update compact memory
  choose next goal
  choose one bounded action
  record decision
  execute action
  observe state delta and same-session runtime events
  verify expected signal
  link decision to action ledger
  replan when progress stalls or the UI exposes a better path

complete task
finish QA charters, probes, coverage and verdict
```

Do not plan the entire click sequence from the initial page and execute it blindly. Re-observe after every action because element references, page state, dialogs, tabs and valid next steps can change

Before each model decision, combine only the current native observation with:

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs agent-context <RUN_ID>
```

This packet carries the current step, bounded budget, deduplicated compact memory, last state delta, pending rule probes and evidence counts. Do not reload `run.json`, old observations, full action history or raw traces unless a contradiction/failure needs diagnosis

## Task-plan contract

After the first live observation, write a bounded plan and register it before autonomous actions:

```json
{
  "session_id": "session-run-001",
  "page_id": "page-1",
  "observation_revision": 1,
  "objective": "Find the selected order and verify its detail state",
  "success_signals": [
    "The selected order identifier and detail heading are visible"
  ],
  "stop_conditions": [
    "Stop when the order detail is verified or cannot be reached safely"
  ],
  "constraints": [
    "Stay inside the authorized domain",
    "Do not change order data"
  ],
  "rationale": "The live page exposes a read-only order list and semantic details action",
  "steps": [
    {
      "task_step_id": "TASK-OPEN-ORDER",
      "goal": "Reach the selected order detail page",
      "success_signal": "Order detail heading is visible",
      "safety_boundary": "Use only read-only navigation"
    }
  ]
}
```

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs task-plan \
  <RUN_ID> --task-plan-file task-plan.json
```

Require an objective, at least one observable success signal, a stop condition, a concise rationale and one to twenty steps. Each step needs a stable ID, a goal, an observable success signal and a safety boundary

For a replan, submit a replacement plan with the latest observation and `replan_reason`. Preserve the old plan in history. The runner allows at most three replans by default

## Decision contract

Before one autonomous action, record one compact decision:

```json
{
  "session_id": "session-run-001",
  "page_id": "page-1",
  "observation_revision": 2,
  "task_step_id": "TASK-OPEN-ORDER",
  "charter_id": "C-ORDER-001",
  "evaluation_previous_goal": "PROGRESS",
  "decision": "ACT",
  "next_goal": "Open the selected order and inspect the resulting detail state",
  "selected_action": {
    "type": "click",
    "semantic_target": "Order details link for ORD-101",
    "expected_signal": "ORD-101 detail heading is visible",
    "safety_boundary": "Use only read-only navigation"
  },
  "alternatives_considered": [
    "Open the detail URL directly"
  ],
  "rationale": "The semantic details link is the smallest reversible action toward the current goal",
  "memory": [
    "ORD-101 row is visible and its details link is enabled"
  ]
}
```

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs decision \
  <RUN_ID> --decision-file decision.json
```

Use only these previous-goal evaluations:

- `NOT_STARTED`
- `PROGRESS`
- `ACHIEVED`
- `NO_PROGRESS`
- `CONTRADICTED`
- internal `BLOCKED`

Use only these decisions:

- `ACT`: execute one bounded browser action
- `REPLAN`: stop actions and replace the plan with a reason
- `COMPLETE`: declare task completion with evidence references
- `STOP`: stop because a safety, authority, budget or scope condition was reached

Link the returned `decision_id` to the exploratory action as `decision_id`. When linked, the runner verifies that the decision and action use the same browser session/page and semantic target

## Compact memory and reasoning privacy

Persist only facts needed by the next step. Add at most four new memory facts per decision and retain at most eight deduplicated facts:

- current route/page and selected business object
- completed goals and observed deltas
- failed target strategies and why they failed
- unresolved oracle or safety constraints
- evidence pointers

Do not store hidden chain-of-thought, raw model analysis or unrestricted page content. Use the short `rationale`, `memory`, `alternatives_considered`, `next_goal` and expected/actual signals. The runner rejects `thinking`, `analysis`, `chain_of_thought` and `reasoning_trace` fields

## Progress and loop detection

Classify progress from observable state changes, not from model confidence. The native runtime returns a deterministic `state_delta` with URL/title/content/control changes, new headings/alerts, runtime failure count, a bounded progress score and `STRONG_PROGRESS|PROGRESS|NO_PROGRESS|CONTRADICTED`. Use this signal together with the expected oracle; it is navigation evidence, not a business verdict

Two repeated `NO_PROGRESS` decisions for the same page, task step, next goal, action type and semantic target set `requires_replan`. Do not issue a third equivalent action. Re-observe and replace the task plan with a different strategy or stop as `UNTEST`

Do not blindly retry writes. Inspect whether the request or side effect already happened before any recovery. Keep the original evidence and let the existing retry-quality rules apply

## Independent completion judge

After the agent records `COMPLETE`, judge the trajectory against the original success signals rather than agent confidence

```json
{
  "judgement": "SATISFIED",
  "reason": "The final detail view independently satisfies every declared task signal",
  "success_signal_results": [
    {
      "signal": "The selected order identifier and detail heading are visible",
      "status": "OBSERVED",
      "actual": "ORD-101 and the order detail heading are visible",
      "evidence_refs": ["evidence/runs/run-001/order-detail.png"]
    }
  ]
}
```

```bash
node <skill-root>/scripts/helpers/exploratory-runner.mjs task-judge \
  <RUN_ID> --judge-file task-judge.json
```

Use only `SATISFIED`, `UNSATISFIED` or `INCONCLUSIVE`. Every declared success signal must have exactly one `OBSERVED`, `MISSING` or `CONTRADICTED` result. `OBSERVED` requires evidence. `SATISFIED` requires every signal to be `OBSERVED`; a full QA `PASS` is rejected when the judge is missing or not satisfied

## Completion and QA verdict

Record `COMPLETE` only when all planned task steps are completed and attach evidence references proving the observable task success signals. Record the independent `task-judge`, then continue the QA gates:

- compare actual behavior with the visible or supplied oracle
- reconcile network, console and page-error evidence from the same session
- complete applicable hidden-rule probes
- record scoped coverage and charter results
- return only `PASS`, `FAILED`, `N/A` or `UNTEST`

Do not map agent confidence or a `COMPLETE` decision directly to `PASS`. `PASS` still requires clean runtime evidence, complete-for-scope coverage and every required QA gate
