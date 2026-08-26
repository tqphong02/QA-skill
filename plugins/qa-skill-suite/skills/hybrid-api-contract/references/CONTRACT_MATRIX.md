# API contract matrix

| Area | Checks |
|---|---|
| Request | path, query, header, cookie, body, content type, required, nullable, default, enum, format |
| Response | status, headers, content type, schema, required fields, nullable, error shape |
| Auth | missing, invalid, expired, wrong role, wrong tenant, scope |
| Lifecycle | create, read, update, delete, cleanup, persistence |
| Collection | empty, one item, page boundaries, invalid cursor, filter, sort |
| Reliability | timeout contract, retry, idempotency, duplicate submission, concurrency token |
| Compatibility | removed operation, required input, narrowed type, enum removal, auth change |
| Observability | correlation ID, safe error, no secret leakage, traceability |

## Minimum operation ledger

```text
Operation ID
Method and path
Role and tenant
Input partitions
Documented responses
Business side effect
Cleanup
Coverage status
Evidence
```

Use `covered`, `partial`, `blocked`, or `not_covered`. Never infer undocumented error behavior as confirmed expected behavior.
