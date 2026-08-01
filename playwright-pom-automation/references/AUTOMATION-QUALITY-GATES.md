# Automation Quality Gates

## Test-level routing

Use the lowest reliable level for each risk:

1. Unit/component for pure rules and rendered component states
2. Contract/API for schemas, permissions, idempotency and integration boundaries
3. UI functional for a small set of critical business journeys
4. k6/JMeter for concurrent load; do not use Playwright as a load generator

Use service virtualization for unavailable or expensive dependencies. Keep at least one approved environment test against the real dependency so mocks do not become the only evidence

## Required CI gates

- TypeScript compile and lint
- Placeholder and secret scan
- Test result with stable test IDs
- Zero unapproved failed tests
- Flaky rate below the configured threshold
- Evidence completeness for every Pass/Fail UI result
- Duration within the suite budget
- Branch or statement coverage threshold when the project declares one
- Visual and axe accessibility checks for supported critical UI journeys
- Browser matrix matching the product support policy

See `assets/templates/quality-gates.json` and `assets/templates/scripts/quality-gate.mjs` for the executable template

## Visual and accessibility controls

- Baselines must be tied to commit, browser, viewport, locale and theme
- Review anti-aliasing and dynamic-region masks explicitly; never approve a broad mask that hides business content
- Run axe for automated checks, then retain keyboard/focus/manual evidence for critical flows
- A screenshot proves visual state only; it does not prove network success, persistence or accessibility

## Coverage quality

Do not equate line coverage with behavior coverage. Track requirement/risk IDs, branch outcomes, contract cases, negative paths and state transitions. Use mutation testing or targeted fault injection for high-risk rules when the project can support it safely
