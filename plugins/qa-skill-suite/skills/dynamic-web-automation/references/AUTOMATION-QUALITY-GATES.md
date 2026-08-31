# Automation Quality Gates

## Test-level routing

Use the lowest reliable level for each risk:

1. Unit/component for pure rules and rendered component states
2. Contract/API for schemas, permissions, idempotency and integration boundaries
3. UI functional for a small set of critical business journeys
4. Handoff concurrent load to `dynamic-performance`; never use this Playwright suite as a load generator

Use service virtualization for unavailable or expensive dependencies. Keep at least one approved environment test against the real dependency so mocks do not become the only evidence

## Default quality thresholds

Configure thresholds in `quality-gates.json` (template at `assets/templates/quality-gates.json`). Override per-project; do not hardcode in CI YAML or Jenkinsfile logic.

| Gate | Default | Meaning |
|---|---|---|
| `minExecuted` | `1` | At least one test must execute per surface |
| `maxFailureRate` | `0` | Zero unapproved failures; any failure blocks the gate |
| `maxFlakeRate` | `0.05` | Retry-pass rate ≤ 5% before triggering quarantine review |
| `maxDurationMs` | `600000` | Suite wall-clock budget: 10 minutes; raise only after profiling slow tests |
| `requireEvidenceComplete` | `true` | Every UI/functional PASS or FAILED result must have `evidence-image` + `evidence-video` |
| `requireSurfaceTags` | `true` | Every test must carry `@ui`, `@api`, or `@functional` |
| `minBranchCoverage` | _(optional)_ | Declare only when project has an approved coverage SLA |

### Minimal `quality-gates.json`

```json
{
  "minExecuted": 1,
  "maxFailureRate": 0,
  "maxFlakeRate": 0.05,
  "maxDurationMs": 600000,
  "requireEvidenceComplete": true,
  "requireSurfaceTags": true
}
```

Run the gate with:

```bash
npm run qa:quality -- --surface ui --project chromium
```

## Gate failure escalation

When any gate fails, follow this order before calling the build red:

1. **`maxExecuted` = 0** — surface detection failed; check `scripts/ci-surfaces.mjs --require` output first
2. **`maxFailureRate` exceeded** — read the first failed assertion in `reports/playwright.json`, not the downstream quality report; fix or explicitly quarantine with owner + issue ID
3. **`maxFlakeRate` exceeded** — classify per `FLAKY-TEST-MANAGEMENT.md`; never raise the threshold to make CI green
4. **`maxDurationMs` exceeded** — profile with `--reporter=json` and split the slow group or reduce `--repeat-each`; do not raise the budget as a first action
5. **`requireEvidenceComplete` failed** — `reports/allure-contract.json` is `BLOCKED`; check `evidence/test-results/` for missing trace, image or video before re-running


## Required CI gates

- TypeScript compile and lint
- Placeholder and secret scan
- Test result with stable test IDs
- Zero unapproved failed tests
- Flaky rate below the configured threshold
- Evidence completeness for every Pass/Fail UI result
- Duration within the suite budget
- Branch or statement coverage threshold when the project declares one
- Browser matrix matching the product support policy

See `assets/templates/quality-gates.json` and `assets/templates/scripts/quality-gate.mjs` for the executable template

## Cross-skill visual and accessibility controls

Route WCAG/axe/keyboard/screen-reader claims to `hybrid-accessibility` and Figma/visual design review to `hybrid-ui-ux-review`. Evidence produced here proves the deterministic UI state only; it does not independently prove accessibility or design conformance

## Coverage quality

Do not equate line coverage with behavior coverage. Track requirement/risk IDs, branch outcomes, contract cases, negative paths and state transitions. Use mutation testing or targeted fault injection for high-risk rules when the project can support it safely

A coverage threshold declared in `quality-gates.json` is a floor, not a target. Reaching the threshold with untested negative paths or missing state transitions is not coverage compliance. Review uncovered items with `reports/api-operation-coverage.json` and `reports/ui-function-coverage.json` before sign-off
