# AI Agentic API Testing Protocol

> Senior QA Automation Engineer role — API Testing, Playwright TypeScript, REST API, Black-box Testing.
> Principle: **AI is the Executor. QA controls business logic and owns quality decisions.**

---

## Responsibility matrix

| Responsibility | AI / Tool | QA (Human) |
|---|---|---|
| Analyze API documentation and propose scenarios | ✅ | — |
| Generate test cases and automation code | ✅ | — |
| Debug, review, and detect coverage gaps | ✅ | — |
| Suggest code and process improvements | ✅ | — |
| Confirm business rules and expected results | — | ✅ |
| Decide test scope and priorities | — | ✅ |
| Review test data, assertions, and scenario correctness | — | ✅ |
| Approve changes with broad framework impact | — | ✅ |
| Evaluate results and make release quality decisions | — | ✅ |

---

## 10-Step AI Agentic Testing Process

The process follows a clockwise flow with three actor lanes:
- **AI/Tool** (Executor) — does the work
- **AI Agent** (Review ×2) — double-checks before handoff
- **Human / G-DECIDE** (Approver) — gates every phase boundary

```
Step 1: ANALYSIS & QA
  └─► Step 2: TEST DESIGN
        └─► Step 3: TEST CASES
              └─► Step 4: AUTO PLAN
                    └─► Step 5: TEST DATA
                          └─► Step 6: SERVICE LAYER
                                └─► Step 7: TEST SCRIPT
                                      └─► Step 8: SCRIPT REVIEW
                                            └─► Step 9: RUN & ANALYSIS
                                                  └─► Step 10: EXECUTION & SUMMARY
```

### Step 1 — ANALYSIS & QA

**Actor:** AI/Tool reads Jira/Confluence via MCP, produces TestAnalysis. Agent reviews ×2. Human G-DECIDES.

Tasks:
- Read API documentation, Swagger/OpenAPI specs, Jira tickets, and Confluence pages
- Identify endpoints, HTTP methods, request/response schemas, auth mechanisms, and role-based access
- Map dependency chains between APIs (create → read → update → delete lifecycle)
- List ambiguities, missing specs, or contradicting requirements

**Flag:** If critical input is missing → mark `FLAGGED` and wait for QA input before proceeding.

**G-DECIDE gate:** QA approves the analysis before Test Design starts.

---

### Step 2 — TEST DESIGN

**Actor:** AI/Tool applies ISTQB & KB scenarios. Agent reviews ×2. Human G-DECIDES Scenario and Gap.

Apply Black-box Testing techniques to derive scenarios:

| Technique | Application |
|---|---|
| Equivalence Partitioning | Group valid/invalid input values; test one representative per partition |
| Boundary Value Analysis | Test at and around limits (min, max, min-1, max+1) |
| Decision Table | Map condition combinations to expected outcomes |
| State Transition | Cover workflow states (draft → submitted → approved → rejected) |
| Positive Testing | Happy-path with valid data, expected success |
| Negative Testing | Invalid data, missing required fields, wrong types |
| Authentication | No token, expired token, malformed token → 401 |
| Authorization | Valid token but insufficient role → 403 |
| Schema Validation | Response shape, data types, required fields |
| Business Rules | Domain invariants (e.g., cannot approve own request) |
| Error Handling | 400/404/409/422/500 — verify error messages are informative |
| Edge Cases | Empty arrays, null values, very long strings, special characters |

**Do not create tests only to increase count.** Every scenario must have a clear defect-detection purpose.

**G-DECIDE gate:** QA reviews and approves scenario list and coverage gaps before Test Cases are written.

---

### Step 3 — TEST CASES

**Actor:** AI/Tool writes 26-column test cases and validates schema. Agent reviews ×2. Human G-DECIDES upload to Xray and writes back Jira IDs.

Each test case must include:

| Field | Description |
|---|---|
| ID | Unique identifier (e.g., `TC-API-ORDERS-001`) |
| Title | Short, descriptive, behavior-focused |
| Priority | Critical / High / Medium / Low |
| Preconditions | Auth state, required existing data, environment |
| Method | GET / POST / PUT / PATCH / DELETE |
| Endpoint | Full path with path parameters noted |
| Headers | Content-Type, Authorization, custom headers |
| Request Body | JSON payload or schema reference |
| Expected Status | HTTP status code |
| Expected Response | Schema reference and specific field assertions |
| Business Rule | The rule this test validates |
| Cleanup | What must be deleted/reverted after the test |
| Tags | `@smoke`, `@regression`, `@negative`, `@auth` |

**Quality gate (9 criteria):** before the gate, AI self-reviews every case against Correctness, Feasibility, Necessity, Understandability, Precision, Completeness, Traceability, Consistency and Conciseness. Definitions, examples and the report template are in `support-testcase-authoring` → `references/testcase-quality-review.md`. Mark each case `OK`, `FIX` or `ASK`; `ASK` items go to QA, never guessed. Traceability here means every case carries its requirement ID and Jira key so a requirement change shows which cases to update

**G-DECIDE gate:** QA approves upload to Xray and confirms Jira IDs are written back before planning.

---

### Step 4 — AUTO PLAN

**Actor:** AI/Tool classifies test cases, builds Plan with OPEN items. Agent reviews ×2. Human G-DECIDES OPEN items.

Tasks:
- Classify each test case: `AUTOMATE` / `MANUAL` / `DEFER` / `REJECT`
- Automate: deterministic, repeatable, high ROI
- Manual: exploratory, subjective, one-time verification
- Build execution plan with dependencies and ordering
- Surface OPEN questions (unclear expected results, missing test data, ambiguous schemas)

**G-DECIDE gate:** QA resolves all OPEN items before Test Data preparation.

---

### Step 5 — TEST DATA

**Actor:** AI/Tool generates Data JSON and preconditions. Agent reviews ×2. Human G-DECIDES — FLAG if expected values have no source.

Rules:
- All test data is external: JSON files under `testdata/` or a dedicated data factory
- Provide both valid and invalid datasets per test case
- Never hardcode credentials — use `process.env` variables
- Never use production data
- Tag data by role: `admin_user`, `standard_user`, `guest_user`
- Data must be isolated — no test should depend on another test's data
- Cleanup data after mutation tests

**Flag:** If expected result has no traceable source (spec, business rule, or prior evidence) → mark `FLAGGED`. Do not guess.

**G-DECIDE gate:** QA confirms expected values are traceable before Service Layer build.

---

### Step 6 — SERVICE LAYER

**Actor:** AI/Tool builds Repo & Service layer and compiles. Agent reviews ×2. Human G-DECIDES — FLAG if SQL/Endpoint source is missing.

This corresponds to the module client layer in the project structure:

```text
src/modules/<domain>/<feature>/api/<feature>.client.ts       ← business operations
src/modules/<domain>/<feature>/api/schemas/<resource>/       ← Zod schemas per operation
```

Rules:
- Each business operation is a method in the module client; specs never call raw `request`
- Schemas validate every request and response — Zod is the single source of truth
- Base URL, auth headers, and transport live in `fixtures/api-client.ts`
- No hardcoded endpoints or tokens in client files
- Compile and type-check (`tsc --noEmit`) must pass before proceeding

**Flag:** If an endpoint or database source is missing → `FLAGGED`, not assumed.

**G-DECIDE gate:** QA confirms all source endpoints and data sources before Test Script generation.

---

### Step 7 — TEST SCRIPT

**Actor:** AI/Tool generates Spec files. Agent reviews ×2. Human G-DECIDES — FLAG if script has no linked Test Case.

Script generation rules:
- One `test()` per test case ID — no merging or splitting
- Import only `test` and `expect` from `fixtures/pom.ts`
- Use `authenticatedApi` for role-bound requests; `api` for anonymous
- All assertions in the spec; no assertions inside Page Objects or clients
- CRUD lifecycle uses `try/finally` with cleanup in `finally`
- Allure annotations: `@epic`, `@feature`, `@story`, `@severity`, testcase ID
- No raw `page.locator()` in API specs
- Preserve `AUTOMATION_SOURCE`, testcase IDs, `COV-*` obligation markers

**Flag:** If a script has no linked Test Case ID → `FLAGGED` and blocked from execution.

**G-DECIDE gate:** QA approves test scripts before Script Review.

---

### Step 8 — SCRIPT REVIEW

**Actor:** AI/Tool runs Lint, type check, dry run. Two reviewer Agents plus 1 Validator review. Human G-DECIDES if BLOCKER remains after Validator.

Review checklist:
- `eslint` and `tsc --noEmit` pass with zero errors
- No hardcoded credentials, URLs, or environment-specific values
- All status codes match the approved test case expected results
- Schema validation is present for every response
- Cleanup exists in `finally` for every mutation test
- No `Promise.all` unless operations are confirmed independent
- No `Thread.sleep` or arbitrary waits
- Test can run in isolation without depending on other test results
- Assertions verify business outcomes, not just element/key existence
- Apply [ai-blind-spots-review.md](ai-blind-spots-review.md): check the four AI blind-spot patterns, hunt silent failures (empty catch, swallowed fallback, assertions that cannot fail), and use an independent reviewer pass
- Each spec maps to one approved testcase ID and one objective (Traceability, Conciseness); a failing step must not block unrelated cases
- Expected values and timeouts are explicit numbers taken from the approved case, never vague waits (Precision)
- Terms, endpoint names and error messages match the approved testcases (Consistency)

**G-DECIDE gate:** If any BLOCKER remains after the Validator review, QA resolves before RUN.

---

### Step 9 — RUN & ANALYSIS

**Actor:** AI/Tool runs tests, classifies failures, patches scripts, mutates. Agent reviews script fixes. Human G-DECIDES on mismatches and approves Bug before pushing to Jira — ESCALATE if critical.

Failure classification:

| Classification | Meaning | Action |
|---|---|---|
| Product Defect | API returns wrong status, wrong schema, wrong data | File bug in Jira, mark test `FAILED` |
| Automation Error | Script logic, assertion, or data is wrong | Fix script, re-run |
| Environment Issue | Service down, network error, wrong config | Mark `BLOCKED`, do not file bug |
| Data Problem | Missing prerequisite data, stale fixtures | Fix data, re-run |

Rules:
- Do not auto-correct expected results to make a test pass
- Do not suppress assertions or increase timeouts to hide real failures
- A retry-pass is `FAILED` with `flaky=true`
- All failures must be categorized before the summary is written

**G-DECIDE gate:** QA approves bug reports before they are pushed to Jira. Critical mismatches → ESCALATE immediately.

---

### Step 10 — EXECUTION & SUMMARY

**Actor:** AI/Tool runs official execution, generates Xray summary (B10) and MR (B11). Agent reviews ×2 (B11 is tool-only in B10). Human G-DECIDES env/data (B10) and summary & merge (B11).

Execution report must include:

| Section | Content |
|---|---|
| Test Run ID | Timestamp, environment, build version |
| Scope | Module, feature, test case IDs executed |
| Results | PASS / FAIL / BLOCKED / NOT RUN per test case |
| Evidence | Screenshot, trace, response body for each FAILED |
| Defects | Jira IDs for each filed bug |
| Coverage | % of planned test cases executed, % passed |
| Risks | Untested scenarios, known gaps, data limitations |
| Verdict | Go / No-Go recommendation with justification |

**Verdict rules:**
- `PASS` requires actual execution output with assertions passing — never from generated code alone
- `FAILED` requires specific failure evidence
- `BLOCKED` when execution was not possible (environment down, missing data, missing permission)
- `NOT RUN` when planned but not executed in this run
- `UNTEST` when the test cannot be run due to missing spec, contract, or oracle

**G-DECIDE gate:** QA approves the final summary and authorizes the merge/release.

---

## Control rules

- If critical context is missing → ask before implementing. Never assume business rules
- Do not invent endpoints, schemas, or business rules without a documented source
- Do not call APIs that create, modify, or delete real data without explicit QA authorization
- Do not automatically change code or run side-effect operations outside the confirmed scope
- Only report `PASS` when the test was actually executed and all assertions succeeded
- If a test could not be run, always record the explicit status (`BLOCKED` / `UNTEST` / `NOT RUN`)
- Every change must have a stated reason, impact scope, and verification method

---

## Playwright APIRequestContext implementation contract

This section complements `api-testing.md`. Read both when implementing API test scripts.

### Fixture entrypoint

```typescript
// fixtures/pom.ts is the ONLY import for test and expect
import { test, expect } from '../fixtures/pom';

test('TC-API-ORDERS-001 | create order — valid payload @api @smoke', async ({ authenticatedApi }) => {
  const ordersClient = new OrdersClient(authenticatedApi);
  let orderId: string | undefined;
  try {
    const payload = CreateOrderRequestSchema.parse(testData.validOrder);
    const response = await ordersClient.postOrders({ body: payload });

    // Status assertion
    expect(response.status()).toBe(201);

    // Schema + business field assertions
    const body = CreateOrderResponseSchema.parse(await response.json());
    expect(body.status).toBe('PENDING');
    expect(body.customerId).toBe(testData.validOrder.customerId);

    orderId = body.id;
  } finally {
    if (orderId) await ordersClient.deleteOrdersById({ path: { id: orderId } });
  }
});
```

### Negative test pattern

```typescript
test('TC-API-ORDERS-002 | create order — missing required field @api @negative', async ({ authenticatedApi }) => {
  const ordersClient = new OrdersClient(authenticatedApi);
  const response = await ordersClient.postOrders({ body: { /* missing customerId */ } });

  expect(response.status()).toBe(422);
  const error = await response.json();
  expect(error.errors).toContainEqual(
    expect.objectContaining({ field: 'customerId', message: expect.stringContaining('required') })
  );
});
```

### Auth / RBAC pattern

```typescript
test('TC-API-ORDERS-003 | create order — no token → 401 @api @auth', async ({ api }) => {
  const response = await api.post('/orders', { data: testData.validOrder });
  expect(response.status()).toBe(401);
});

test('TC-API-ORDERS-004 | create order — guest role → 403 @api @auth', async ({ guestApi }) => {
  const ordersClient = new OrdersClient(guestApi);
  const response = await ordersClient.postOrders({ body: testData.validOrder });
  expect(response.status()).toBe(403);
});
```

---

## Quick reference — Black-box scenario checklist per endpoint

Before closing the test design for any endpoint, verify coverage of:

- [ ] Happy path with valid data → 200/201
- [ ] Missing required field → 400/422
- [ ] Invalid data type → 400/422
- [ ] Boundary values (min, max, min-1, max+1)
- [ ] No authentication token → 401
- [ ] Insufficient role → 403
- [ ] Resource not found → 404
- [ ] Duplicate/conflict creation → 409
- [ ] Business rule violation (domain-specific)
- [ ] Response schema validated with Zod
- [ ] Mutation cleanup in `finally`
- [ ] Side effects verified when applicable

