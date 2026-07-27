# Data-Driven Testing and parallel data isolation

> Read this when tests are parameterized, use datasets, run with multiple workers, or mutate shared backend/account state.

## 1. Contract

Data-driven testing has two separate layers:

| Layer | Location | Rule |
|---|---|---|
| Case data | `test-data/cases/*.cases.ts` | Typed, versioned, read-only, stable case ID |
| Runtime data | `fixtures/data-driven.ts` | Unique per run/project/worker/test/retry/repeat |

Case data describes **what to test**. Runtime data identifies **what this specific attempt owns**. Do not put generated emails, record IDs, tokens, or mutable objects in a module-level case array.

## 2. Generate one test per case

Use a synchronous `for...of` at module collection time:

```typescript
import { test, expect } from '../../fixtures/data-driven';
import { validationCases } from '../../test-data/cases/validation.cases';

for (const data of validationCases) {
  test(`${data.id} — ${data.name} @data-driven`, async ({ testData }) => {
    const payload = {
      ...data.input,
      externalKey: testData.caseKey(data.id),
      email: testData.uniqueEmail(),
    };

    // Create/use/assert payload, then delete the resource owned by this test.
    expect(payload.externalKey).toContain(data.id.toLowerCase());
  });
}
```

Requirements:

- Every row has a stable unique `id`
- Every generated test title includes that ID
- Dataset uses `as const satisfies readonly SomeCase[]`
- Create a fresh payload inside the test; never mutate `data.input`
- Do not use `forEach(async ...)` for setup or cleanup
- Validate external JSON/CSV before generating tests; fail collection with the row/field error

## 3. Namespace used by the fixture

`fixtures/data-driven.ts` creates:

```text
<runId>-<project>-p<parallelIndex>-w<workerIndex>-t<testIdHash>-r<retry>-e<repeatEachIndex>
```

Why every part matters:

| Part | Protects against |
|---|---|
| `runId` | Two CI/local runs executing at the same time |
| `project` | Chromium/Firefox/WebKit running the same case |
| `parallelIndex` | Different stable parallel slots |
| `workerIndex` | A restarted worker process |
| `testIdHash` | Different test cases assigned to a worker |
| `retry` | Original attempt and retry sharing resources |
| `repeatEachIndex` | `--repeat-each` attempts sharing resources |

Use `parallelIndex` to allocate a stable account slot. Use the full test namespace for records, emails, filenames, idempotency keys, queues, carts, and other mutable resources.

## 4. Account and tenant isolation

A new browser context isolates cookies/local storage only. It does not isolate backend data owned by the same account.

For tests that mutate account-owned state, provide one account per parallel slot:

```bash
export TEST_ACCOUNTS_JSON='[
  {"email":"qa-slot-0@example.com","password":"secret-0"},
  {"email":"qa-slot-1@example.com","password":"secret-1"},
  {"email":"qa-slot-2@example.com","password":"secret-2"},
  {"email":"qa-slot-3@example.com","password":"secret-3"}
]'
PW_WORKERS=4 npx playwright test
```

The auth fixture selects `accounts[parallelIndex]`. It intentionally fails if the configured pool is too small; never cycle accounts across live workers. If an isolated tenant/database/schema is available, apply the same allocation rule.

Read-only authentication scenarios may use one shared account. Document that the test does not change account/session state.

## 5. Cleanup ownership

Preferred order:

1. Create a resource with `testData.namespace` or `caseKey(caseId)`
2. Track the returned resource ID inside the same test-scoped fixture/test
3. Delete it in fixture teardown or `finally`
4. Run a best-effort run-level cleanup by `RUN_ID` as a safety net

Use `afterEach` or fixture teardown for per-test resources. Use `afterAll` only when the resource belongs exclusively to that worker and no other worker/test reads it.

Cleanup must:

- Delete by exact resource ID or unique namespace/tag
- Be idempotent (`404` after a prior delete is acceptable when the contract says so)
- Never use an unscoped “delete all test data” operation
- Never delete a resource owned by another retry or worker

## 6. Runtime files and `TestDataStore`

Do not share a single JSON read-modify-write file between processes.

```typescript
test('persist debug data', async ({ testData }) => {
  const store = new TestDataStore('users', testData.namespace);
  store.save('created-user', { email: testData.uniqueEmail() });
});
```

The template includes the namespace in the filename. The fallback includes the process PID, but explicit `testData.namespace` is required for parallel test code.

Prefer `testInfo.outputPath('data.json')` for evidence that belongs to one test because Playwright already isolates each test output directory.

## 7. Retry, sharding, and CI rules

- Set `RUN_ID` once before workers start; the template config does this automatically
- CI matrix jobs need distinct run IDs or a matrix/project component in the namespace
- A retry creates new data; it must not assume the failed attempt cleaned up successfully
- Shards must not consume the same finite account pool unless each shard has a distinct pool/tenant
- Do not depend on test order, `beforeAll` side effects from another file, or module-global mutable variables
- Run an isolation check with at least two workers and repeat:

```bash
PW_WORKERS=2 npx playwright test --grep @data-driven --repeat-each=2
```

## 8. Delivery checklist

- [ ] Dataset type and `readonly` contract exist
- [ ] Case IDs and generated titles are unique
- [ ] Each row becomes one independently reportable test
- [ ] Runtime payload is built inside the test
- [ ] Namespace includes run/project/parallel/worker/test/retry/repeat
- [ ] Mutating account tests have enough accounts/tenants for all parallel slots
- [ ] JSON/files/resources are namespace-scoped
- [ ] Cleanup targets only resources owned by that attempt
- [ ] Suite passes with at least two workers and `--repeat-each=2`
