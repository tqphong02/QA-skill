# Hidden business-rule discovery

`EXPLORATORY_BROWSER_QA` (legacy alias `EXPLORATORY_ADHOC`) is UI-first and may start without a document, source repository or saved guide. It can derive and verify the visible user flow from the live UI. When it claims a hidden backend rule, authorization boundary, persistence effect or external side effect, it must not pretend that the UI alone proves that claim. The agent first turns each unknown into a bounded hypothesis, then runs the smallest safe probe that can distinguish the hypotheses. A source-code, document or UI observation is `source-derived-candidate` until the same authorized runtime session produces evidence

This reference answers five questions that a visual browser agent normally leaves implicit:

1. Is the value or record unique
2. Can another role perform the same operation on the same target
3. What records or external effects change after the operation
4. What is the actual expected result when the UI is ambiguous
5. Which part of the system has really been covered

## Provenance and outcomes

Keep these states separate in the run ledger and knowledge handoff:

| Claim state | Meaning | Can support PASS? |
|---|---|---|
| `source-derived-candidate` | Found in source, route, schema, permission map or UI | No, runtime confirmation is missing |
| `inferred` | Reasonable hypothesis derived from multiple observations | No, label the uncertainty |
| `ambiguous` | Evidence supports more than one interpretation | No, create an oracle/reconciliation gap |
| `runtime_verified` | Same-run action, observer and evidence agree with the claim | Yes, inside the declared scope |
| `contradicted` | Runtime disproves the source/document/UI claim | No, classify the defect or update the knowledge |
| `inconclusive` | The probe was safe but could not distinguish the hypotheses | No, keep the gap |
| `blocked` | Required account, data, observer, authority or safe test boundary is unavailable | No, finish user-facing `UNTEST` with the exact reason |
| `not_applicable` | The rule type is explicitly outside the declared scope, with a reason | Only when the scope contract permits it |

Never convert a missing signal, a successful navigation, a `2xx` response or a visible toast into `runtime_verified` without the relevant oracle and read-back

## Rule-plan gate

Before the first meaningful browser action, create a rule plan with:

- `scope_boundary.name`, `included`, `excluded` and a concrete `stop_condition`
- at least one probe for each applicable rule type: `uniqueness`, `authorization`, `side_effect`, `oracle` and `coverage`
- `applicability`: `required`, `optional` or `not_applicable`
- `target` and `hypothesis` for every applicable probe
- `safe_strategy` describing data isolation, cleanup and the maximum permitted mutation
- a reason and `applicability_basis` for every `not_applicable` probe; the basis points to the scope, requirement, knowledge or runtime observation that makes the rule out of scope

The runner rejects browser actions until the plan is `READY`. The plan is stored in `evidence/exploratory/<run-id>/run.json`; it is part of the run artifact, not a file inside the skill directory

## Probe protocols

### Uniqueness

Question: does the backend enforce uniqueness, and where is the rule enforced?

1. Select a disposable namespace and record the existing value/record before testing
2. Perform the first create or save through the normal UI and capture the request, response, final UI and read-back
3. Repeat the same business operation with the same candidate value, using a distinct action record and no blind retry
4. Compare the second response, validation signal, persisted records and related list/count
5. Classify the rule only when at least two attempts and two action IDs are linked

If the application or environment cannot safely accept the duplicate probe, record `INCONCLUSIVE` or internal `BLOCKED`, then finish user-facing `UNTEST`; do not create duplicate production data merely to prove a hypothesis

### Authorization

Question: is the operation really restricted to the intended user/role/owner?

1. Identify the exact target ID and operation, not just a visible button
2. Run the operation as the subject role and record the allowed/denied result
3. Compare the same target and operation with an authorized comparison role or owner boundary
4. Preserve role identity, target identity, request outcome, UI outcome and a permission/read-back reference
5. If the UI hides a control but the API was not exercised, keep the claim as a candidate; UI hiding is not proof of server authorization

The runner requires `subject_role`, `comparison_role` and `same_target: true` for a runtime authorization conclusion. Do not use a different record or a different operation as a substitute

### Side effect

Question: did the transition create, update, delete or publish anything beyond the visible result?

1. Capture a redacted before snapshot of the primary record and relevant related collections/counts
2. Execute one authorized state-changing action; record its request and response in the same browser session
3. Capture the after snapshot, reload/revisit or perform a safe read-back
4. Check documented related records, audit/event indicators, queue/webhook status or other observable effects within the approved scope
5. Compare the before/after delta to the documented invariant and classify undocumented changes as a finding, not as noise

The probe needs `before_refs`, `after_refs` and read-back evidence. If an external effect cannot be observed safely, record the blind spot explicitly and do not call the side effect verified

### Oracle

Question: what result is correct when the UI does not state the expected behavior clearly?

Build the expected signal from the strongest available sources in this order:

1. Explicit acceptance criterion, testcase expected result or user-provided contract
2. Runtime-verified invariant from the current environment
3. Current API/schema/state/permission contract, labeled as a candidate until runtime confirms it
4. Consistent UI, network and persistence observations
5. A documented inference, with an unresolved question for the owner

The probe must record `oracle.basis`, `expected_signal` and `actual_signal`. If the agent cannot state what should be true before or immediately after the action, it must classify the outcome `CANDIDATE`, `INCONCLUSIVE` or internal `BLOCKED`, not `PASS`; the final user-facing result is `UNTEST`

### Coverage

Question: have we tested the whole relevant business flow, or only one visible page?

Declare the boundary first, then record an explicit result for each applicable:

- module and route
- role/owner boundary
- state and transition
- data class, validation boundary or empty/error case
- dependency and integration

Each item is `covered`, `partial`, `blocked`, `not_covered` or `excluded`; an excluded item needs a reason. `COMPLETE_FOR_SCOPE` means every included dimension has a result within the declared boundary. It does not mean that the entire product, every role or every backend flow has been tested

`PASS` requires a runtime-verified coverage probe and `COMPLETE_FOR_SCOPE` with no unresolved gaps. A `PARTIAL` or `BLOCKED` coverage map is an internal gap record and must retain its exact missing prerequisite; the final user-facing result is `UNTEST`

## Choosing the next probe

Rank probes by risk reduction and reversibility:

1. An oracle conflict that could invalidate the whole charter
2. Authorization on a protected target
3. Side effect or duplicate risk on a state-changing transition
4. Uniqueness/boundary validation using isolated data
5. Coverage dimensions exposed by the current route or role

Use source and UI inspection to choose the probe, not to declare its result. Before a mutation, confirm target, operation, inputs, authorization, cleanup and verification. If a probe would delete, pay, publish, invite, change permissions, send an external message or create high-volume data, stop and require exact user authorization

## Runner command order

The canonical runtime sequence is:

```text
start
rule-plan
page
action
rule-probe     # after each relevant probe has evidence
coverage      # after the declared scope has been traversed
charter
finish
```

`rule-plan`, `rule-probe` and `coverage` accept JSON files so the agent can keep the run ledger compact and redact sensitive values. The final runner performs these gates:

- no browser action before a `READY` rule plan
- required probes must be decided for a `PASS` or `FAILED` result; `N/A` and `UNTEST` require a reason at the final result boundary
- runtime conclusions need screenshot/video plus network, read-back or role-comparison evidence
- uniqueness, authorization, side-effect and oracle probes require their type-specific fields
- `PASS` needs runtime-verified coverage, complete coverage for the declared scope and no hidden-rule gaps

The runner does not make the agent omniscient. It makes uncertainty visible and prevents a UI-only observation from being reported as a backend rule, authorization proof, side-effect proof or complete-system coverage
