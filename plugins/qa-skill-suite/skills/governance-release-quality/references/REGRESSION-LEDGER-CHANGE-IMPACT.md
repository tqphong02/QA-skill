# Regression ledger and change-impact reconciliation

Use before a release gate when a change touches a module that other modules consume, or after a defect in module A broke module B. Concepts adapted from the `module-regression` and `change-impact` skills in MIT-licensed `affaan-m/ecc`; this reference feeds the existing release packet and does not replace `evaluate_release.py`

## When it applies

- At least three interdependent modules, or a past regression crossed a module boundary
- A change alters externally observable behavior: API contract, data shape, calculation, permission, event, export
- Skip for a small repository with no cross-module dependency; the ledger would only add maintenance

## Regression ledger

Keep one ledger per repository (for example `REGRESSION.md` or the project's existing equivalent). One entry per module with three required fields:

| Field | Content |
|---|---|
| Downstream consumers | Modules, clients or jobs that depend on this module's observable behavior, with the evidence that shows the dependency |
| Acceptance command | One executable command whose exit code proves the module still works (test run, contract check, reconciliation script) |
| Propagation rule | When a change to this module requires running consumers: external behavior change means run all consumers; internal-only change with a green own check may exempt them, with the reason recorded |

Rules:

1. Dependencies come from executable evidence (imports, calls, contracts, configs), not memory. Re-scan on each audit; a scan is not permanent truth
2. Observed exit codes are the regression evidence. Model review never replaces them
3. A consumer that has no acceptance command is `uncovered`; report it, do not assume it passes
4. Do not edit or weaken a command to get green; changes to the ledger need a recorded reason

## Change-impact reconciliation

Before the change (read-only):

1. Record the request, affected modules, public interfaces, data and schema, tests, docs, deployment steps and rollback path
2. Mark every unknown as `unverified`
3. Write the planned impact surface and the acceptance commands that must run

After the change:

1. Compare the actual diff and executed commands with the plan
2. Report scope drift (touched but not planned), missed consumers (planned but not run), and commands that were skipped
3. Any item without an exit code is `UNTEST`, not `PASS`

## Mapping to the release packet

| Packet field | Source |
|---|---|
| `regression` summary | Ledger commands run, passed, failed, skipped, with run IDs |
| Open risk | `uncovered` consumers and `unverified` impact items |
| Evidence paths | Command output files under the run directory |
| Blocking rule | Planned consumer not executed, or acceptance command missing for an affected module, is `BLOCKED`; a failing command is `FAIL` |

Keep `FAIL` (known failed gate) distinct from `BLOCKED` (missing proof)

## Post-deploy smoke additions

When deployment is in scope, the smoke or canary owner also checks, beyond status codes: new console errors versus baseline, failed network calls, key DOM elements still present (main heading, navigation, primary call to action), static assets returning the expected status and content type, event-stream endpoints opening and delivering an initial event or heartbeat, and critical endpoints answering within the agreed latency. Any check not run is reported as not run

