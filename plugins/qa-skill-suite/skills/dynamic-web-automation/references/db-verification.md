# Database verification

Read this reference when a high-risk functional testcase must verify persisted state after a UI or API action

UI assertions prove what the user sees. API assertions prove what a service returns. Database verification proves a persistence read model or a directly queried record. These evidence types are related but not interchangeable

## Choose one bounded mode

### Internal persistence API

Use a trusted read-only internal endpoint when it exposes the persistence state required by the testcase

```json
{
  "db_verification": {
    "mode": "INTERNAL_API",
    "read_only": true,
    "scope": "RECORD",
    "operation_ref": "GET /internal/payments/{orderId}",
    "proof_kind": "PERSISTENCE_READ_MODEL",
    "implementation_file": "src/shared/helpers/payment-persistence.ts",
    "implementation_export": "verifyPaymentPersistence",
    "polling": { "timeout_ms": 15000, "intervals_ms": [500, 1000, 2000] }
  }
}
```

This mode has lower credential risk than direct SQL, but it is not direct database proof. Confirm that the endpoint reads the intended persistence source and does not return a cache or derived service response

### Direct SQL

Use direct SQL only when the required persisted state is not available through an approved internal endpoint

```json
{
  "db_verification": {
    "mode": "DIRECT_SQL",
    "read_only": true,
    "scope": "CROSS_TABLE",
    "driver": "pg",
    "credential_env": "QA_DB_URL",
    "query_file": "test-data/sql/order-payment-by-id.sql",
    "parameterized": true,
    "implementation_file": "src/shared/helpers/order-db.ts",
    "implementation_export": "verifyOrderPersistence",
    "polling": { "timeout_ms": 15000, "intervals_ms": [500, 1000, 2000] }
  }
}
```

Declare the selected driver (`pg`, `mysql2`, or `knex`) in the generated project's `package.json`. The base template does not install a database driver because direct SQL is optional and environment-specific

BUILD imports the declared export and calls it after the testcase assertions but before generated cleanup with `{ page?, client?, testcaseId, contract }`. The helper must return `Promise<void>` and throw when persistence assertions fail

The SQL file must stay below `test-data/sql/`, begin with `SELECT`, use a parameter placeholder, and contain no write/admin statement. Example for PostgreSQL

```sql
SELECT o.id, o.status, p.status AS payment_status
FROM orders o
JOIN payments p ON p.order_id = o.id
WHERE o.id = $1
```

## Security and environment rules

- Use a dedicated read-only account scoped to the test schema or tenant
- Store only the environment variable name in the manifest; never store a connection string or password
- Keep credentials in environment/CI secrets and fail closed when they are missing
- Redact connection data from logs, traces, screenshots, and Allure parameters
- Do not use SQL writes for setup or cleanup; use approved application/API flows
- Register manually owned helpers below `src/shared/helpers/` in `src/shared/ownership.json`

## Async persistence

Poll to the documented system SLA with `expect.poll()` or an equivalent bounded helper. Do not use `waitForTimeout()` and do not turn a timeout into PASS

```typescript
await expect.poll(
  () => getOrderFromDb(orderId).then(record => record.status),
  { timeout: 15_000, intervals: [500, 1000, 2000] },
).toBe('PAID');
```

## Scope boundary

Use this contract for bounded record or cross-table assertions that belong to one functional testcase. Route source-to-target reconciliation, freshness, completeness, schema drift, or large dataset comparison to `dynamic-data-quality`

The executable advanced contract gate verifies read-only intent, helper/query paths, driver declaration, bounded polling, parameterized SELECT-only SQL, and the handoff boundary before RUN
