---
name: governance-release-quality
description: Build a risk-based release quality gate from scope, test results, defect risk, evidence, approvals, and exit criteria. Trigger on release sign-off, go/no-go, readiness, deployment approval, risk acceptance, or test summary review. Keep external state read-only unless separately authorized. Auto-route; do not require the skill name.
mode: governance
surface: release
role: gate
legacy_aliases: release-governance-qa
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
# Release Governance QA

Turn distributed QA evidence into a reproducible go/no-go decision. This skill owns release risk aggregation and gate evaluation; it does not replace the tests owned by browser, API, performance, security, mobile, or data-quality skills. It consumes evidence from `dynamic-web-exploratory` and specialized skills

## Workflow

1. Resolve release ID, commit/build, scope, environments, risk level, and change owner
2. Collect test summaries, executed/blocked/flaky counts, risk coverage, open defects, approved exceptions, evidence paths, required approvals, and the in-scope non-functional categories
3. Evaluate exit criteria in severity order: safety/security, functional risk, regression, non-functional risk, and operational readiness; each declared non-functional category must carry a PASS status, source run ID, and local evidence
4. Reconcile evidence paths and source run IDs; stale or missing evidence is `BLOCKED`
5. Confirm post-release smoke/canary owner, rollback readiness and monitoring handoff when deployment is in scope
6. Produce `PASS`, `FAIL`, or `BLOCKED` with a reason that a release owner can act on

## Local contract

```bash
python3 governance/release-quality/scripts/evaluate_release.py release-packet.json
```

The local evaluator checks packet structure, open high-risk defects, test pass status, evidence existence, and approval presence. It never deploys, changes a ticket, or treats an unverified exception as approval.

## Hard gates

- Missing target/build, scope, test summary, evidence, approval, or exit criterion is `BLOCKED`
- Missing numerator/denominator for aggregate metrics, source run ID, or post-release owner when required is `BLOCKED`
- Open P0/P1 or critical/high defects fail the gate unless the exact defect has an approved, time-bounded exception
- A report cannot be `PASS` when evidence is only a claim or an external link that was not read
- Do not change Plane, GitHub, Drive, deployment, or release state without the owning integration and explicit mutation request
- Keep `FAIL` for a known failed gate distinct from `BLOCKED` for missing proof or authorization
- When `required_non_functional` is declared, every category must be present in `non_functional`/`nonFunctional` with `status=PASS`, at least one source run ID, and existing local evidence; missing proof is `BLOCKED` and a known category failure is `FAIL`
- Do not treat a retry-pass as a clean pass; preserve flaky rate and quarantine risk in the gate

## Output contract

Return pretty JSON containing `decision`, `passed`, `errors`, `warnings`, `gates`, `release`, and `evidence`. Each gate must include `name`, `status`, `reason`, and relevant IDs or paths. The human summary should preserve the release ID and commit exactly.

## References

- [Gate matrix](references/GATE_MATRIX.md)
- [Senior QA operating model](../../dynamic-testing/web-exploratory/references/SENIOR-QA-OPERATING-MODEL.md)
- [Release quality metrics packet](../../dynamic-testing/web-exploratory/references/RELEASE-QUALITY-METRICS.md)
- [Deterministic release evaluator](scripts/evaluate_release.py)
