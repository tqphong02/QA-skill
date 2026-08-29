---
name: dynamic-data-quality
description: Validate databases, ingestion, ETL/ELT, lakehouse, exports, reconciliation, schema drift, lineage, freshness, completeness, accuracy, uniqueness, idempotency, and source-to-target behavior. Trigger on dataset comparison, missing records, Postgres/MySQL/Spark/Delta, or read-only database MCP diagnosis. Auto-route; do not require the skill name.
mode: dynamic
surface: data
role: validator
legacy_aliases: data-quality-qa
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
# Data Quality QA

Run evidence-led data validation without modifying production data.

## Hard gates

1. Resolve source, target, environment, dataset scope, business key, expected transformation, freshness window, and allowed write behavior
2. Write a contract with `Target`, `Operation`, `Required inputs`, `Write action`, and `Verification`
3. Use read-only credentials by default and never print connection strings, passwords, tokens, or raw personal data
4. Capture the pre-run row count, schema, partition or watermark, and test-data ownership
5. Separate source defects, pipeline defects, target defects, and environment blockers
6. Never call a dataset correct from row count alone
7. Clean up only records created by the run and verify the cleanup

## Tool routing

- Use `scripts/reconcile_csv.py` for deterministic CSV source-to-target comparison
- Use read-only SQL for database validation; prefer aggregate evidence and redacted samples
- Use Great Expectations when a project already uses it or needs reusable expectation suites
- Use dbt tests or dbt MCP only when dbt is actually present; start with discovery and compile/read operations before commands that can materialize data
- Use project-native Spark/Delta tools for OneBrain rather than introducing dbt only for QA
- Use browser QA only to trigger or observe a pipeline; validate persisted data through the data layer

Read [references/DATABASE_MCP.md](references/DATABASE_MCP.md) before configuring any database MCP. Never accept a normal application account as proof of read-only access. Run `../integration/github/scripts/doctor-stack.sh database-readonly` after configuration.

Read [references/CHECK_MATRIX.md](references/CHECK_MATRIX.md) when designing coverage or reconciling an ingestion flow.

## Workflow

### 1. Map the data flow

Record source, ingestion or transform stages, target, business key, partition key, watermark, retry behavior, and observable side effects. Mark unknown logic as `Open`; do not convert an inference into an expected rule.

### 2. Build a coverage ledger

Include applicable checks for:

- Schema and type fidelity
- Completeness and row reconciliation
- Accuracy and transformation rules
- Uniqueness and duplicate handling
- Null and default semantics
- Referential integrity
- Freshness and late-arriving data
- Incremental load, replay, retry, and idempotency
- Precision, timezone, Unicode, encoding, and boundary values
- Lineage from source field to target field
- Permissions, tenant isolation, masking, and retention

Use `covered`, `partial`, `blocked`, or `not_covered` for every applicable area.

### 3. Establish a baseline

Capture source and target schemas, counts, min/max business keys, aggregate totals, null counts, duplicate counts, and current watermark. Prefer queries that cannot mutate state.

### 4. Validate deterministic cases

Use controlled records covering happy path, nulls, duplicates, invalid types, boundary values, Unicode, timestamps, decimal precision, updates, deletes, and late arrivals. Tag every created record with a run-specific key when the system supports it.

For exported CSV datasets:

```bash
python3 scripts/reconcile_csv.py \
  --source source.csv \
  --target target.csv \
  --key id \
  --ignore-columns updated_at \
  --output evidence/reconciliation.json
```

### 5. Validate operational behavior

Verify retry, partial failure, rollback or compensation, persistence after reload, concurrent execution where authorized, and alert or status behavior. State-changing or high-volume tests require explicit approval and a rollback plan.

### 6. Report

For each discrepancy record:

- Check ID and business rule
- Source observation and target observation
- Expected transformation
- Scope and affected rows
- Redacted deterministic evidence
- Suspected layer and confidence
- Severity and cleanup status

Keep `Candidate` until the discrepancy reproduces and a control record behaves correctly.

## Completion checks

- Source and target scope are exact
- Business keys and comparison columns are explicit
- Counts are backed by field-level or aggregate checks
- Schema drift and null semantics were checked
- Incremental and idempotent behavior has a verdict or blocker
- Evidence is redacted
- Test data cleanup is verified
- Coverage gaps remain visible
