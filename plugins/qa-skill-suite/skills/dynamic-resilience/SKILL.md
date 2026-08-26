---
name: dynamic-resilience
description: Design reliability, resilience, chaos, fault-injection, recovery, backup/restore, failover, observability, disaster-recovery, RTO/RPO, retry, timeout, and graceful-degradation tests. Trigger on resilience, chaos, failover, recovery, backup/restore, RTO/RPO, retry, timeout, or fault-injection requests. Require explicit stop conditions and approval before active execution. Auto-route; do not require the skill name.
mode: dynamic
surface: reliability
role: planner
legacy_aliases: reliability-resilience-qa
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


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
python3 ./scripts/validate_resilience_plan.py resilience-plan.json
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
