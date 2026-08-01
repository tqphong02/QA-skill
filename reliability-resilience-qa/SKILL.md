---
name: reliability-resilience-qa
description: Design and assess reliability, fault-injection, recovery, observability, disaster-recovery, RTO/RPO, retry, timeout, and graceful-degradation tests with explicit stop conditions. Trigger on resilience, chaos, fault injection, recovery testing, failover, disaster recovery, RTO, RPO, retry, timeout, graceful degradation, or incident readiness; do not require the skill name. Plans are local and read-only until an authorized execution is approved.
---

# Reliability & Resilience QA

Make failure testing safe and measurable. The skill validates a resilience plan and its proof obligations; it does not inject faults into production, delete data, stop services, or run a load test by implication.

## Workflow

1. Define target, steady-state SLOs, dependency map, failure hypothesis, blast radius, and test environment
2. Specify injection, observation, stop conditions, rollback/cleanup, recovery evidence, and RTO/RPO measurements
3. Validate the plan locally with `validate_resilience_plan.py`
4. Obtain owner approval immediately before any active injection or concurrency
5. Execute one bounded experiment, observe metrics/logs/traces, restore the system, and compare measured recovery with the hypothesis

Hand measured recovery and unresolved resilience risk to `release-governance-qa` for the release gate

```bash
python3 reliability-resilience-qa/scripts/validate_resilience_plan.py resilience-plan.json
```

## Hard gates

- Production or shared environment execution is `BLOCKED` without explicit owner approval, rollback, and stop conditions
- Missing steady state, observability, cleanup, recovery evidence, or RTO/RPO target is `BLOCKED`
- Never use destructive failure injection as a substitute for a missing test environment
- Keep measured recovery separate from a source-derived or planned expectation
- A retry or timeout check must prove bounded behavior and avoid amplifying traffic

## Output contract

Return pretty JSON with `status`, `passed`, `errors`, `warnings`, `gates`, `hypothesis`, `recovery`, and `limitations`. Active experiments additionally require run ID, start/stop timestamps, observed metrics, cleanup proof, and owner approval reference.

## References

- [Resilience matrix](references/RESILIENCE_MATRIX.md)
- [Safe plan validator](scripts/validate_resilience_plan.py)
