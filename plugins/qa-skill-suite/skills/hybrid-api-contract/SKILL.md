---
name: hybrid-api-contract
description: Validate REST, OpenAPI, Swagger, Postman, GraphQL, gRPC, and webhook contracts against implementations. Trigger on API specs, swagger.json, openapi.yaml, collections, schemas, proto files, contract tests, status/headers/auth/pagination/idempotency checks, implementation-versus-spec, or breaking changes. Auto-route; do not require the skill name.
mode: hybrid
surface: api
role: validator
legacy_aliases: api-contract-qa
---

## Plugin runtime contract

When this skill is loaded from QA Skill Suite, treat the directory containing this `SKILL.md` as `SKILL_ROOT` and its parent as `PLUGIN_SKILLS_ROOT`. Resolve bundled scripts, references, templates, and sibling skills from those directories. Do not copy plugin assets into the user's project. Invoke a bundled script by its resolved absolute path while keeping the user's project as the working directory, unless that script explicitly requires another working directory.


# API Contract QA

Verify both the specification and the observable implementation. A valid OpenAPI document does not prove the API follows it.

## Hard gates

1. Resolve specification version, target environment, base URL, authentication, roles, allowed mutations, rate limit, test data, and cleanup
2. Treat the supplied specification as proposed behavior when requirements are unconfirmed; do not invent missing expected status or schema
3. Use least-privilege test credentials and never print tokens or secret headers
4. Run static validation before live requests
5. Separate documentation defects, implementation defects, environment blockers, and backward-compatibility risks
6. Verify response semantics and business outcome, not only HTTP 2xx
7. Clean up every created resource and verify deletion or rollback

Read [references/CONTRACT_MATRIX.md](references/CONTRACT_MATRIX.md) when designing endpoint coverage.

Route Postman MCP installation, authentication, diagnosis, and workspace operations to `integration-postman`. Read [references/POSTMAN_MCP.md](references/POSTMAN_MCP.md) when the Postman connection affects contract execution. Run `../integration-github/scripts/doctor-stack.sh postman` after configuration.

## Tool routing

- Run `scripts/check_openapi.py` for a deterministic OpenAPI 3 structural preflight
- Use project-native Playwright API tests or start from [assets/api-contract.spec.ts](assets/api-contract.spec.ts) for stable regression
- Use Postman MCP for workspace, collection, specification, mock, and monitor management; execute collections through `../integration-postman/scripts/runner.py`
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

## Completion checks

- Specification source and version are identified
- Static errors are resolved or reported
- Every operation has coverage status
- Required success and error responses were exercised or blocked
- Authentication and authorization roles are explicit
- Pagination, idempotency, and lifecycle rules have verdicts when applicable
- Backward-compatibility risks are separate from runtime defects
- Mutated data is cleaned up
