---
name: api-contract-qa
description: Validate REST, OpenAPI, Swagger, Postman, GraphQL, gRPC, and webhook contracts against implementations, including schema, status, headers, auth, pagination, idempotency, compatibility, negative behavior, and evidence. Trigger on an API spec URL/file, swagger.json, openapi.yaml, Postman collection/MCP, GraphQL schema, proto, webhook contract, contract test, implementation-versus-spec check, or breaking-change review; do not require the skill name. Route explicit requests to write testcase documents to testcase-template instead.
---

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

Read [references/POSTMAN_MCP.md](references/POSTMAN_MCP.md) before installing, authenticating, or diagnosing Postman MCP. Run `../github-mcp-qa/scripts/doctor-stack.sh postman` after configuration.

## Tool routing

- Run `scripts/check_openapi.py` for a deterministic OpenAPI 3 structural preflight
- Use project-native Playwright API tests or start from [assets/api-contract.spec.ts](assets/api-contract.spec.ts) for stable regression
- Use Postman MCP for workspace, collection, specification, mock, and monitor management; use Newman or Postman CLI for reproducible execution
- Use Schemathesis or another schema-driven runner only when installed and approved by the project
- Use `testcase-template` when the user asks to produce testcase Markdown or Excel; keep execution in this skill
- Route performance behavior to `performance-qa` or `jmeter-qa`
- Route exploit-focused authorization testing to `pentest-run`

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
