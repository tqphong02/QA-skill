# Data-Driven Testing and parallel data isolation

> Read this when tests are parameterized, use datasets, run with multiple workers, or mutate shared backend/account state.

## 1. Contract

Data-driven testing has two separate layers:

| Layer | Location | Rule |
|---|---|---|
| Case data | `test-data/cases/*.cases.ts` | Typed, versioned, read-only, stable case ID |
| Runtime data | `fixtures/pom.ts` + `fixtures/runtime-context.ts` | Manifest-bound account/data slot and unique run/project/worker/test/retry/repeat namespace |

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

`fixtures/runtime-context.ts` creates this namespace for manifest-generated POM tests; standalone typed DDT can keep using `fixtures/data-driven.ts` with the same shape:

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

For manifest-generated UI/functional tests, provide one project-local storage state and one dataset per parallel slot. Keep the real JSON in an ignored `.env` or CI secret store:

```bash
export QA_TEST_ACCOUNTS_JSON='{"owner":[
  {"id":"owner-0","storageState":"sessions/owner-0.json"},
  {"id":"owner-1","storageState":"sessions/owner-1.json"}
]}'
export QA_TEST_DATASETS_JSON='{"owner":[
  {"id":"data-0","dataRoot":"testdata/slot-0","values":{"resource_name":"qa-{{namespace}}"}},
  {"id":"data-1","dataRoot":"testdata/slot-1","values":{"resource_name":"qa-{{namespace}}"}}
]}'
PW_WORKERS=2 npx playwright test
```

`fixtures/pom` selects `accounts[parallelIndex]` and `datasets[parallelIndex]`. It intentionally returns `UNTEST` if a required role pool, storage-state file or mutating dataset slot is missing; it never cycles slots. The pool can be a role map (`owner`, `guest`, `auditor`) or an array whose rows declare `role`/`roles`. If an isolated tenant/database/schema is available, apply the same allocation rule.

Without explicit `PW_WORKERS`, the template uses up to four workers only when both account and dataset pool capacity safely allow it; otherwise it defaults to one worker. Explicit `PW_WORKERS` is still checked at runtime and fails closed when a selected testcase lacks capacity.

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
- [ ] Generated specs import from `fixtures/pom`, not `@playwright/test`
- [ ] Mutating account tests have enough storage-state accounts and dataset/tenant slots for all parallel workers
- [ ] JSON/files/resources are namespace-scoped
- [ ] Cleanup targets only resources owned by that attempt
- [ ] Suite passes with at least two workers and `--repeat-each=2`
