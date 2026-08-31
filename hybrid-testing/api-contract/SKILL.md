---
name: hybrid-api-contract
description: Validate REST, OpenAPI, Swagger, Postman, GraphQL, gRPC, and webhook contracts against implementations. Trigger on API specs, swagger.json, openapi.yaml, collections, schemas, proto files, contract tests, status/headers/auth/pagination/idempotency checks, implementation-versus-spec, or breaking changes. Auto-route; do not require the skill name.
mode: hybrid
surface: api
role: validator
legacy_aliases: api-contract-qa
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
# API Contract QA

Verify both the specification and the observable implementation. A valid OpenAPI document does not prove the API follows it.

When only a spec file is supplied (no live target URL), run **Static Analysis Mode** only: analyse gaps, produce Q&A, and stop at `DONE` or `DONE_WITH_OPEN_QA`. Live validation (Steps 3-6) runs only when a target base URL and credentials are confirmed.

## Hard gates

1. Resolve specification version, target environment, base URL, authentication, roles, allowed mutations, rate limit, test data, and cleanup
2. Treat the supplied specification as proposed behavior when requirements are unconfirmed; do not invent missing expected status or schema
3. Use least-privilege test credentials and never print tokens or secret headers
4. Run static validation before live requests
5. Separate documentation defects, implementation defects, environment blockers, and backward-compatibility risks
6. Verify response semantics and business outcome, not only HTTP 2xx
7. Clean up every created resource and verify deletion or rollback

Read [references/CONTRACT_MATRIX.md](references/CONTRACT_MATRIX.md) when designing endpoint coverage.
Read [references/API_STATIC_ANALYSIS.md](references/API_STATIC_ANALYSIS.md) for gap categories, Q&A quality gate, and terminal result definitions.

Route Postman MCP installation, authentication, diagnosis, and workspace operations to `integration-postman`. Read [references/POSTMAN_MCP.md](references/POSTMAN_MCP.md) when the Postman connection affects contract execution. Run `../../integration/github/scripts/doctor-stack.sh postman` after configuration.

## Tool routing

- Run `scripts/check_openapi.py` for a deterministic OpenAPI 3 structural preflight
- Run `scripts/analyze_openapi.py` for static semantic gap analysis and Q&A generation
- Run `scripts/render_api_qa.py` to produce `_API_Q&A.md` and `_API_Q&A.xlsx`
- Use project-native Playwright API tests or start from [assets/api-contract.spec.ts](assets/api-contract.spec.ts) for stable regression
- Use Postman MCP for workspace, collection, specification, mock, and monitor management; execute collections through `../../integration/postman/scripts/runner.py`
- Use Schemathesis or another schema-driven runner only when installed and approved by the project
- Use `support-testcase-authoring` when the user asks to produce testcase Markdown or Excel; keep execution in this skill
- Route performance behavior, JMeter and k6 work to the single public `dynamic-performance`
- Route exploit-focused authorization testing to `dynamic-security-pentest`

## Workflow

### 1. Import and preflight

Record the source file and checksum. Validate syntax, OpenAPI version, paths, methods, operation IDs, parameters, responses, local references, server variables, and security definitions.

```bash
python3 scripts/check_openapi.py openapi.json --output evidence/openapi-preflight.json
```

### 1.5. Static semantic analysis (always run)

Run gap analysis over every operation. Inspect auth, request contract, response contract, lifecycle, collection, reliability, and observability gaps per [references/API_STATIC_ANALYSIS.md](references/API_STATIC_ANALYSIS.md).

```bash
python3 scripts/analyze_openapi.py openapi.json \
  --project <ProjectName> \
  --output <run-dir>/

python3 scripts/render_api_qa.py \
  <run-dir>/<ProjectName>_API_Analysis_Source.json \
  <run-dir>/ <ProjectName>
```

Required outputs:

```text
<ProjectName>_API_Analysis_Source.json   ← canonical (internal)
<ProjectName>_API_Q&A.md                 ← Q&A for BA/Dev
<ProjectName>_API_Q&A.xlsx               ← 4-sheet workbook
```

Every static-only run ends with exactly one terminal result:

- `DONE` — spec complete, no open Q&A
- `DONE_WITH_OPEN_QA` — analysis complete, open Q&A items exist; stop and share with BA/Dev
- `BLOCKED` — spec unreadable or preflight errors prevent analysis

`DONE_WITH_OPEN_QA` is terminal for the current spec snapshot. Do not start another analysis pass unless the spec changes or authority answers are incorporated.

If no live target URL is confirmed, stop here and deliver the Q&A outputs. Live validation (Steps 3-6 below) is optional and requires a target URL, credentials, and test data.

### 2. Build the operation ledger

For every in-scope operation record method, path, auth role, parameters, request variants, success responses, error responses, side effects, cleanup, and coverage status.

### 3. Verify live behavior

Cover valid, missing, null, malformed, boundary, unexpected, unauthorized, forbidden, not found, conflict, rate-limit, and unsupported media-type cases when specified or confirmed. Validate status, headers, content type, schema, field semantics, and persisted side effects.

### 4. Verify cross-operation rules

Check create-read-update-delete lifecycle, idempotency keys, retry behavior, pagination boundaries, filtering, sorting, concurrency controls such as ETag, webhook signature and retry, version negotiation, and error shape consistency where applicable.

### 5. Review compatibility

Compare the candidate specification with the released baseline. Flag removed paths or methods, new required input, removed enum values, narrowed types, changed defaults, changed auth, incompatible response changes, and semantic changes. Do not label additive optional fields as breaking without a consumer constraint.

### 6. Report

Each mismatch includes operation ID, method and path, role, request case, specification expectation, actual status or schema, business impact, redacted request and response evidence, cleanup status, and classification.

For static-only runs the primary deliverable is `_API_Q&A.md` / `_API_Q&A.xlsx` and the terminal result. A mismatch report is produced only after live validation (Steps 3-5).

## Completion checks

- Specification source and version are identified
- Static errors are resolved or reported
- Every operation has coverage status
- Required success and error responses were exercised or blocked
- Authentication and authorization roles are explicit
- Pagination, idempotency, and lifecycle rules have verdicts when applicable
- Backward-compatibility risks are separate from runtime defects
- Mutated data is cleaned up
- Static analysis: `_API_Analysis_Source.json`, `_API_Q&A.md`, `_API_Q&A.xlsx` are present and readable
- Terminal result is explicitly stated (`DONE`, `DONE_WITH_OPEN_QA`, or `BLOCKED`)
