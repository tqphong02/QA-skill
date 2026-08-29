# Test selection strategy

Read this reference when deciding which manual testcases should enter deterministic automation

## Decision model

Use the same 1-5 scale for every factor

```text
Automation Value =
  (Execution Frequency x Manual Cost x Business Risk)
  / Maintenance Cost
```

The score supports the decision; it does not replace engineering judgement. Record the decision and rationale in the source automation manifest so BUILD can reproduce it

```json
{
  "testcase_id": "TC_UPLOAD_001",
  "automation_selection": {
    "decision": "AUTOMATE",
    "execution_frequency": 5,
    "manual_cost": 4,
    "business_risk": 5,
    "maintenance_cost": 2,
    "rationale": "Critical regression flow executed on every release",
    "reviewed_at": "2026-08-26",
    "retirement": { "status": "ACTIVE" }
  }
}
```

For a release-critical suite, add `recommended_layer`, `layer_rationale`, and
`extended_roi`. The extended score includes build and infrastructure cost plus
feedback speed, defect prevention, behavior coverage, and reliability confidence:

```json
{
  "recommended_layer": "API",
  "layer_rationale": "The contract is stable and the UI adds no unique risk",
  "extended_roi": {
    "build_cost": 2,
    "infrastructure_cost": 2,
    "feedback_speed_value": 5,
    "defect_prevention_value": 5,
    "coverage_value": 4,
    "reliability_confidence": 5
  }
}
```

The executable gate reports both the backward-compatible base score and the
extended score. `UNIT` or `COMPONENT` recommendations are explicit handoffs to
the source/unit coverage workflow and cannot silently become Playwright tests

Allowed decisions are `AUTOMATE`, `DEFER`, and `REJECT`. Each factor must be an integer from 1 to 5 and `rationale` is mandatory

## Selection behavior

- `AUTOMATE` and `ACTIVE`: eligible for the generated POM plan
- `DEFER` or `REJECT`: excluded from the POM plan and listed in `plan.selection.excluded`
- `RETIRED`: excluded from the POM plan with its date and reason retained in the source manifest
- Explicitly requesting a deferred, rejected, or retired ID blocks BUILD
- A legacy testcase without `automation_selection` remains eligible for backward compatibility

Do not convert a selection decision into an execution verdict. `N/A` is only a runtime verdict for a selected testcase whose applicability condition is explicitly observed. Deferred or retired automation has not executed and therefore is not `N/A`

## Automate first

- Regression and smoke cases executed repeatedly
- Critical authentication, payment, order, permission, and data-integrity flows
- Stable boundary and negative cases with reusable data
- Stable API contracts used by multiple consumers
- Small cross-browser sets that protect critical journeys

## Defer or reject first

- Features whose requirements, routes, or selectors are actively changing
- One-time migration or data-fix checks
- Exploratory testing and subjective usability review
- Pixel-level design review without an approved visual baseline
- Load, chaos, or security work that belongs to another specialist skill

## Choose the cheapest reliable layer

1. Unit/component for pure rules and rendered state
2. API/contract for schemas, permissions, idempotency, and integration boundaries
3. UI E2E for a small set of complete user journeys

Route load testing to `dynamic-performance`, large data reconciliation to `dynamic-data-quality`, resilience injection to `dynamic-resilience`, and authorized pentesting to `dynamic-security-pentest`

## Retirement contract

```json
{
  "retirement": {
    "status": "RETIRED",
    "date": "2026-08-26",
    "reason": "Feature removed from the approved product scope"
  }
}
```

Retire automation when the feature is removed, equivalent lower-level coverage is approved, or the execution trigger no longer exists. Do not silently delete a testcase referenced by a ticket or test plan

The executable gate is `scripts/verify-advanced-test-contracts.mjs`; it validates selection, layer and extended ROI metadata, and the POM planner performs the exclusion
