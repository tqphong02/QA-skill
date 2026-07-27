# API Testing — Playwright request + schema validation

> Companion to `SKILL.md`. Read this when the user wants API tests, HTTP requests, auth tokens, or schema validation.

## TOC
1. Why Playwright `request` (not axios)
2. ApiClient pattern
3. Auth/token fixtures (share across tests)
4. Schema validation with zod
5. CRUD lifecycle (create → use → delete)
6. Status code expectations
7. Common anti-patterns

---

## 1. Why Playwright `request` (not axios)

- **Already in the stack** — no new dependency.
- Shares browser context cookies/storage if needed (`request` fixture from a logged-in `page`).
- Same `expect()` ergonomics as UI tests.
- Built-in retries, timeouts, tracing integration.

**Exception:** use `axios`/`got` **only if** the project already depends on them and wants a single HTTP client. Never introduce a second client just for tests.

## 2. ApiClient pattern

Wrap `APIRequestContext` in an `ApiClient` class (`assets/templates/api-client.ts`):

```typescript
const res = await api.post('/users', payload, token);
expect(res.status()).toBe(201);
const data = await res.json();
```

Why a wrapper:
- Centralize base URL + headers (Content-Type, Authorization).
- One place to add logging / Allure attachment / retry policy.
- Methods return `APIResponse` so the spec still controls `expect()`.

## 3. Auth/token fixtures

**Login once, reuse everywhere.** Two common patterns:

**Pattern A — token in `beforeAll`:**
```typescript
test.beforeAll(async ({ request }) => {
  const res = await new ApiClient(request, BASE).post('/auth/login', credentials);
  token = (await res.json()).accessToken;
});
```

**Pattern B — custom fixture (more reusable):**
```typescript
import { request as playwrightRequest } from '@playwright/test';

export const test = base.extend<{}, { token: string }>({
  token: [async ({}, use) => {
    const context = await playwrightRequest.newContext();
    try {
      const res = await context.post(`${BASE}/auth/login`, { data: credentials });
      await use((await res.json()).accessToken);
    } finally {
      await context.dispose();
    }
  }, { scope: 'worker' }],  // login once per worker, not per test
});
```

Credentials from env (`process.env.TEST_USER`), never hardcoded.
A worker-scoped fixture must not depend on the test-scoped `request` fixture. For account-state mutation, allocate credentials from `TEST_ACCOUNTS_JSON[parallelIndex]`.

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

- Keep schema next to the test or in `fixtures/schemas/`.
- Reuse schema in UI tests too (when UI reads the same shape) — single source of truth.
- For arrays: `z.array(UserSchema)`.

## 5. CRUD lifecycle

```typescript
test.describe.serial('User CRUD @api', () => {
  let userId: string;

  test('create', async () => {
    const res = await api.post('/users', payload, token);
    userId = (await res.json()).id;
    expect(res.status()).toBe(201);
  });

  test('read', async () => {
    const res = await api.get(`/users/${userId}`, token);
    expect(res.status()).toBe(200);
  });

  test('update', async () => {
    const res = await api.patch(`/users/${userId}`, { name: 'Updated' }, token);
    expect(res.status()).toBe(200);
  });

  test.afterAll(async () => {
    if (userId) await api.delete(`/users/${userId}`, token); // cleanup — no pollution
  });
});
```

- Use `test.describe.serial` only when tests genuinely depend on order (a single worker-owned CRUD lifecycle is a legitimate case).
- For independent/parallel CRUD tests, create and delete the exact resource in the same test with `try/finally` or fixture teardown.
- **Cleanup is mandatory**. `afterAll` is allowed only when the serial block owns the resource exclusively.

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

## 7. Common anti-patterns

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
