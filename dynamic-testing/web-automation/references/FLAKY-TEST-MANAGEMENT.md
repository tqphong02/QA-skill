# Flaky Test Management

Retries are diagnostic evidence, not a way to turn a failure green

## Policy

- PR runs: at most one retry; scheduled/full runs may use two only when the retry result is preserved
- Classify every test that fails then passes as `flaky`, not `passed`
- Store first-attempt error, retry error, browser, worker, commit, duration and artifact path
- Quarantine only with an owner, issue ID, reason, expiry date and replacement coverage
- Do not quarantine critical-path, security, payment or data-integrity tests without an explicit risk acceptance
- Remove quarantine when the test passes the agreed stability window, for example 20 consecutive executions across the supported matrix
- New API/functional automation must pass its manifest `stability_gate` before CI promotion; the runner preserves every repeat attempt in `reports/stability-gate.json`

## Flake review thresholds

| Level | Trigger | Action |
|---|---|---|
| Observe | 1 isolated occurrence | Record and inspect evidence |
| Investigate | Same test flakes twice in 7 days | Assign owner and root-cause category |
| Quarantine | Repeated flake blocks delivery | Remove from blocking lane, retain scheduled execution |
| Escalate | Flake rate exceeds the release gate | Block sign-off or obtain time-bounded risk acceptance |

Common root causes include shared backend data, time/locale assumptions, unstable selectors, asynchronous race conditions, service dependency drift, resource exhaustion and order dependence

## Required artifacts

Use a stable test ID, a machine-readable result, first and retry attempts, trace/screenshot/video, console/network correlation, and a link to the owner issue. A rerun without the original artifact is not a flake investigation
