# API Testing — Playwright request + schema validation

> Companion to `SKILL.md`. Read this when the user wants API tests, HTTP requests, auth tokens, or schema validation.

## TOC
1. Why Playwright `request` (not axios)
2. Canonical fixture + module client pattern
3. Auth/token fixtures (share across tests)
4. Schema validation with zod
5. CRUD lifecycle (create → use → delete)
6. Status code expectations
7. Operation coverage gate
8. Common anti-patterns

---

## 1. Why Playwright `request` (not axios)

- **Already in the stack** — no new dependency.
- Shares browser context cookies/storage if needed (`request` fixture from a logged-in `page`).
- Same `expect()` ergonomics as UI tests.
- Built-in retries, timeouts, tracing integration.

**Exception:** use `axios`/`got` **only if** the project already depends on them and wants a single HTTP client. Never introduce a second client just for tests.

## 2. Canonical fixture + module client pattern

`fixtures/api-client.ts` wraps `APIRequestContext`; `fixtures/pom.ts` exposes it as `api` and `authenticatedApi`. Generated specs never destructure raw `request`:

```typescript
test('TC-API-001 | create user @api', async ({ authenticatedApi }) => {
  const usersClient = new UsersClient(authenticatedApi);
  const payload = CreateUserRequestSchema.parse(testData);
  const response = await usersClient.postUsers({ body: payload });
  expect(response.status()).toBe(201);
  UserResponseSchema.parse(await response.json());
});
```

Why two layers:

- `ApiClient` centralizes base URL, auth, safe request metadata and Playwright transport
- `clients/<module>.client.ts` owns stable business operation methods and paths
- `schemas/<module>.schema.ts` validates request and response payloads
- Specs retain status/business assertions and only import `test`/`expect` from `fixtures/pom`

## 3. Auth/token fixtures

`fixtures/pom.ts` is the only fixture graph. Use `api` for anonymous endpoints and `authenticatedApi` for role-bound endpoints. Its internal auth helper logs in once per worker/account slot, caches only the token in memory and never exposes it to a spec or report

```typescript
test('TC-API-USERS-READ-001 | read user @api', async ({ authenticatedApi }) => {
  const usersClient = new UsersClient(authenticatedApi);
  const response = await usersClient.getUsersById({ path: { id: 'owned-id' } });
  expect(response.status()).toBe(200);
});
```

Credentials come from environment/CI only. For parallel state mutation, allocate a unique account and dataset slot per worker; a worker-scoped fixture never depends on test-scoped `request`

## 4. Schema validation with zod

Validate **every** response — catches contract drift early.

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'guest']).optional(),
});

const user = ApiClient.validate(UserSchema, await res.json()); // throws on mismatch
```

- Generated schemas live in `schemas/<module-slug>.schema.ts`.
- Reuse schema in UI tests too (when UI reads the same shape) — single source of truth.
- For arrays: `z.array(UserSchema)`.

## 5. CRUD lifecycle

```typescript
test('TC-API-USERS-CREATE-001 | create user @api', async ({ authenticatedApi }) => {
  const usersClient = new UsersClient(authenticatedApi);
  let userId: string | undefined;
  try {
    const response = await usersClient.postUsers({ body: requestBody });
    expect(response.status()).toBe(201);
    userId = UserResponseSchema.parse(await response.json()).id;
  } finally {
    if (userId) await usersClient.deleteUsersById({ path: { id: userId } });
  }
});
```

- Prefer one owned lifecycle per test with `try/finally`
- Use `test.describe.serial` only when cases genuinely share one explicitly owned lifecycle
- Cleanup is mandatory for mutations and the operation coverage gate verifies it

## 6. Status code expectations

| Intent | Expected | Also assert |
|---|---|---|
| Create | `201` | response body has `id` |
| Read success | `200` | schema valid |
| Update | `200` | changed field reflects |
| Delete | `204` (or `200`) | subsequent GET → `404` |
| Unauthorized | `401` | (no token) |
| Forbidden | `403` | (wrong role) |
| Not found | `404` | |
| Validation error | `400` or `422` | error message includes field |
| Server error | `5xx` | (should NOT happen — report bug) |

**Negative tests are as important as positive ones** — verify 401 without token, 403 with wrong role, 422 with bad payload.

## 7. Operation coverage gate

BUILD writes `operation-inventory/<module-slug>.api-operations.json` from the immutable plan. Before RUN, `verify-api-operation-coverage.mjs` proves each selected Testcase ID maps exactly once to method, path, module client operation, canonical fixture, auth/role, expected status, request/response/error schemas and same-test cleanup when mutating

```bash
node scripts/verify-api-operation-coverage.mjs \
  --project-root . \
  --inventory operation-inventory/orders.api-operations.json \
  --testcase-id TC-API-ORDERS-001 \
  --output reports/api-operation-coverage.json
```

Coverage must be 100%. Missing inventory, an unmapped API test, raw `request`, unvalidated schema, status mismatch or cleanup outside `finally` is `BLOCKED` and produces `UNTEST`, never `PASS`

## 8. Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| Hardcoded credentials | `process.env.TEST_USER` / `TEST_PASS` |
| Login inside every test | `beforeAll` / worker-scoped token fixture |
| No schema validation | Validate every response with `zod` |
| No cleanup after create | Delete the exact owned ID in `finally`/fixture teardown |
| Only happy-path tests | Add 401/403/422 negative tests |
| `axios` introduced when Playwright `request` available | Use `APIRequestContext` |
| Trusting only status code | Assert response body shape + values |
| Tests depending on shared mutable data | Use `testData` namespace; timestamp alone is not worker/test isolation |
| Generated spec destructures `request` | Consume `api`/`authenticatedApi` from `fixtures/pom` and wrap it with the module client |
| API client exists but is unused | Map it in the generated operation inventory and enforce 100% coverage |
