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

### `stability_gate` schema

Declare in each API/functional testcase in the `.automation.json` manifest:

```json
{
  "testcase_id": "ORDER-API-001",
  "stability_gate": {
    "repeat_count": 3,
    "required_consecutive_passes": 3,
    "max_flaky_rate": 0
  }
}
```

- `repeat_count`: total runs the runner performs (minimum `2`)
- `required_consecutive_passes`: clean passes needed at the end of the window; must not exceed `repeat_count`
- `max_flaky_rate`: `0` means zero retry-pass allowed; promotion is blocked until this is satisfied

Verify gate output after execution:

```bash
cat reports/stability-gate.json
```

A testcase with fewer attempts than `repeat_count` is `UNTEST`, not promoted.

## Flake review thresholds

| Level | Trigger | Action |
|---|---|---|
| Observe | 1 isolated occurrence | Record and inspect evidence |

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

## Quarantine entry format

Register every quarantined test in `reports/flaky-quarantine.json` (create if absent). A quarantine entry without all required fields is rejected by the quality gate:

```json
{
  "testcase_id": "ORDER-UI-003",
  "owner": "qa-team",
  "issue_id": "PROJ-1234",
  "reason": "Intermittent race condition on order status polling; root cause under investigation",
  "quarantine_date": "2026-08-31",
  "expiry_date": "2026-09-14",
  "replacement_coverage": "ORDER-API-003 covers the same payment state via API layer",
  "stability_window": {
    "required_consecutive_passes": 20,
    "current_consecutive_passes": 0
  }
}
```

- `expiry_date`: maximum 14 days; extend only with a new owner sign-off and updated `issue_id`
- `replacement_coverage`: mandatory for critical-path, security, payment and data-integrity tests; optional for others
- Remove the entry when `current_consecutive_passes >= required_consecutive_passes` across the supported browser matrix
