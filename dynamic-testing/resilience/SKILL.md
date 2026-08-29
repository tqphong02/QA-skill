---
name: dynamic-resilience
description: Design reliability, resilience, chaos, fault-injection, recovery, backup/restore, failover, observability, disaster-recovery, RTO/RPO, retry, timeout, and graceful-degradation tests. Trigger on resilience, chaos, failover, recovery, backup/restore, RTO/RPO, retry, timeout, or fault-injection requests. Require explicit stop conditions and approval before active execution. Auto-route; do not require the skill name.
mode: dynamic
surface: reliability
role: planner
legacy_aliases: reliability-resilience-qa
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# Reliability & Resilience QA

Make failure testing safe and measurable. The skill validates a resilience plan and its proof obligations; it does not inject faults into production, delete data, stop services, or run a load test by implication.

## Workflow

1. Define target, steady-state SLOs, dependency map, failure hypothesis, blast radius, and test environment
2. Specify injection, observation, stop conditions, rollback/cleanup, recovery evidence, RTO/RPO measurements, and an explicit backup/restore scope decision
3. Validate the plan locally with `validate_resilience_plan.py`
4. Obtain owner approval immediately before any active injection or concurrency
5. Execute one bounded experiment, observe metrics/logs/traces, restore the system, and compare measured recovery with the hypothesis

Hand measured recovery and unresolved resilience risk to `governance-release-quality` for the release gate

```bash
python3 dynamic-testing/resilience/scripts/validate_resilience_plan.py resilience-plan.json
```

## Hard gates

- Production or shared environment execution is `BLOCKED` without explicit owner approval, rollback, and stop conditions
- Missing steady state, observability, cleanup, recovery evidence, RTO/RPO target, or the backup/restore scope decision is `BLOCKED`
- When backup/restore is in scope, require a backup reference, ordered restore steps, and a data-integrity comparison; when out of scope, record the rationale
- Never use destructive failure injection as a substitute for a missing test environment
- Keep measured recovery separate from a source-derived or planned expectation
- A retry or timeout check must prove bounded behavior and avoid amplifying traffic

## Output contract

Return pretty JSON with `status`, `passed`, `errors`, `warnings`, `gates`, `hypothesis`, `recovery`, and `limitations`. Active experiments additionally require run ID, start/stop timestamps, observed metrics, cleanup proof, and owner approval reference.

## References

- [Resilience matrix](references/RESILIENCE_MATRIX.md)
- [Safe plan validator](scripts/validate_resilience_plan.py)
