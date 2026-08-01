---
name: release-governance-qa
description: Build a risk-based release quality gate from scope, test results, defect risk, evidence, approvals, and explicit exit criteria. Trigger on release sign-off, go/no-go, quality gate, release readiness, exit criteria, deployment approval, risk acceptance, or test summary review; do not require the skill name. Keep evidence local and read-only unless a separate integration explicitly authorizes a state change.
---

# Release Governance QA

Turn distributed QA evidence into a reproducible go/no-go decision. This skill owns release risk aggregation and gate evaluation; it does not replace the tests owned by browser, API, performance, security, mobile, or data-quality skills. It consumes evidence from `qa-run` and specialized skills

## Workflow

1. Resolve release ID, commit/build, scope, environments, risk level, and change owner
2. Collect test summaries, open defects, approved exceptions, evidence paths, and required approvals
3. Evaluate exit criteria in severity order: safety/security, functional risk, regression, non-functional risk, and operational readiness
4. Reconcile evidence paths and source run IDs; stale or missing evidence is `BLOCKED`
5. Produce `PASS`, `FAIL`, or `BLOCKED` with a reason that a release owner can act on

## Local contract

```bash
python3 release-governance-qa/scripts/evaluate_release.py release-packet.json
```

The local evaluator checks packet structure, open high-risk defects, test pass status, evidence existence, and approval presence. It never deploys, changes a ticket, or treats an unverified exception as approval.

## Hard gates

- Missing target/build, scope, test summary, evidence, approval, or exit criterion is `BLOCKED`
- Open P0/P1 or critical/high defects fail the gate unless the exact defect has an approved, time-bounded exception
- A report cannot be `PASS` when evidence is only a claim or an external link that was not read
- Do not change Plane, GitHub, Drive, deployment, or release state without the owning integration and explicit mutation request
- Keep `FAIL` for a known failed gate distinct from `BLOCKED` for missing proof or authorization

## Output contract

Return pretty JSON containing `decision`, `passed`, `errors`, `warnings`, `gates`, `release`, and `evidence`. Each gate must include `name`, `status`, `reason`, and relevant IDs or paths. The human summary should preserve the release ID and commit exactly.

## References

- [Gate matrix](references/GATE_MATRIX.md)
- [Deterministic release evaluator](scripts/evaluate_release.py)
