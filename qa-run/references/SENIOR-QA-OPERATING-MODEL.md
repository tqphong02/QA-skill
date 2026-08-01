# Senior QA Operating Model

Use this reference when planning a release, starting a new feature, triaging defects, preparing an environment, or closing a QA cycle. It adds the operating layer above individual test techniques

## 1. Test strategy and plan

Create one versioned plan before execution with:

- Scope, out-of-scope areas, release/build, environments and owners
- Business risks ranked by impact, likelihood, detectability and change volatility
- Test levels: unit, component, contract, API, UI, integration, data, security and non-functional
- Required roles, test data, dependencies, test accounts, feature flags and environment readiness
- Entry criteria, exit criteria, stop conditions and escalation path
- Sanity, smoke, impacted regression, exploratory, ad-hoc and release-gate coverage
- Requirement-to-risk-to-test-to-defect traceability

Do not use test-case count as coverage. Coverage is the proportion of identified risk and required behavior with executable evidence

## 2. Environment and test-data control

Record the exact build, commit, schema version, browser/device, locale, timezone, feature flags and dependency versions. Before execution, prove:

- The target is the intended environment and is reachable
- The test account has the required role and tenant boundary
- Data is seeded or generated with a run/worker namespace
- External dependencies are available, stubbed, or explicitly blocked
- Reset/cleanup ownership and rollback are defined

Never treat a fresh browser context as backend data isolation. Created records must be tagged, owned and cleaned by the run

## 3. Defect triage and root cause

Every defect must preserve:

- Reproducible steps, exact build/environment, role and data identity
- Actual, expected, impact, frequency, evidence and suspected change range
- Severity separately from priority
- Classification: requirement, UX, validation, state, permission, data, integration, performance, security, environment or test-infrastructure
- Triage owner, decision, target release and retest criteria

For escaped or repeated defects, add a root-cause record with detection gap, contributing condition, prevention action and a regression test link. Do not close a defect only because the symptom disappeared

## 4. Quality metrics

Report metrics with numerator, denominator, time window, build and known limitations:

| Metric | Minimum interpretation |
|---|---|
| Requirement/risk coverage | Required risks with executable evidence / required risks |
| Pass rate | Passed executable tests / executed tests; exclude blocked from the denominator |
| Defect leakage | Production defects attributable to the release / release defects |
| Reopen rate | Reopened defects / resolved defects |
| Flaky rate | Tests passing only after retry / tests executed |
| Evidence completeness | Pass/fail results with valid visual or runtime evidence / pass/fail results |
| Cycle time | Start-to-verdict time, including blocked time separately |
| Risk burndown | Open high-risk items at start versus release decision |

Metrics are signals, not a substitute for judgment. Never improve a metric by deleting, downgrading or hiding failures

## 5. Release and post-release verification

Before sign-off, reconcile functional, API, data, security, accessibility, compatibility, performance, resilience and operational evidence. Keep `FAIL` for a known failed gate and `BLOCKED` for missing proof or authority

After deployment, run the approved smoke/canary journey, verify critical business metrics and error rate, confirm rollback readiness, and link production observations back to the originating risk and test evidence. A release PASS without post-release ownership is incomplete

## 6. Standard cycle ledger

Every cycle should end with these rows, even when a row is `BLOCKED`:

1. Scope and risk review
2. Environment and data readiness
3. Sanity/smoke
4. Feature and impacted regression
5. Exploratory and ad-hoc
6. Non-functional and accessibility checks where applicable
7. Defect triage and retest
8. Release decision and post-release owner

Read [RELEASE-QUALITY-METRICS.md](RELEASE-QUALITY-METRICS.md) for the machine-readable packet fields and formulas
