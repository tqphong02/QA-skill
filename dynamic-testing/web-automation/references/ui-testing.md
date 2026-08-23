# UI Testing — Page Object Model deep dive

> Companion to `SKILL.md`. Read this when the user wants UI tests, page objects, locators, or interaction flows.

## TOC
1. POM layering rules
2. Locator strategy (priority order)
3. BasePage contract
4. Spec file structure
5. Fixtures (auth, data)
6. Parallelism & isolation
7. Tracing / screenshots / video
8. Common anti-patterns

---

## 1. POM layering rules

- **Page Object** = a page or distinct component (LoginForm, Header, DataTable). One class per file.
- **Generated testcase suites** = one business module per final spec/Page Object/selector file. Use the manifest `group` as the default module key. Internal plans may be batched, but final code must not be named or split by batch.
- **Responsibilities:** hold locators, perform actions (click/fill/select), read & return data (text, count, state).
- **NOT its job:** `expect()` assertions. Assertions belong in the spec so the page stays reusable across tests with different expectations.
- **Component composition:** a page may expose child components as properties (`this.header = new Header(page)`), but avoid deep nesting — flatten if it hurts readability.
- **Naming:** derive the module slug only from `testcase.group` using ASCII
  lowercase `kebab-case`; then use `<module-slug>.page.ts` → class
  `<ModuleSlug>Page`. A component uses `<component-slug>.component.ts` →
  `<ComponentSlug>Component`. Final generated module files are
  `selectors/<module-slug>.selectors.ts`, `pages/<module-slug>.page.ts` and
  `tests/<surface>/<module-slug>.<surface>.spec.ts`; do not use testcase IDs,
  route names, timestamps or batch names in those paths.
- **Forbidden layout:** one global `app.page.ts`/`aifa.page.ts` containing every module, or several `<module-slug>.batch-NN.functional.spec.ts` files for one module.

## 2. Locator strategy (priority order)

Prefer locators selected from observed FE/live DOM evidence. Browser MCP
(Playwright MCP by default) must provide the live accessibility/DOM observation
before POM generation. Use this exact order:

1. `getByTestId('login-submit')` — first only when an existing FE-owned test-id is present in the FE source/contract or live DOM and is runtime-verified
2. Stable `id` — only after runtime uniqueness verification
3. Stable CSS attributes/classes — for example `[name="email"]` or `[type="password"]`; never use generated classes
4. `getByRole(role, { name })`, `getByLabel(text)`, `getByPlaceholder(text)` and `getByText(text)` — semantic alternatives when the first three are unavailable or ambiguous
5. Short anchored XPath — last resort, with a recorded reason and live verification

If no FE repository or contract is available, do not invent or inject `data-testid`; record that the test-id candidate is unavailable and continue with `id → CSS → semantic → XPath`. If the live DOM already exposes a test-id, it still must pass the same verification gate

**`data-testid` convention:** an existing FE-owned `<component>-<element>` value (e.g. `login-email`, `cart-total`). Adding a new test-id is a separate FE change, not an automation fallback

**Verification gate:** Before committing a selector, Browser MCP must prove
`count=1`, visibility and actionability for the requested operation in the same
route/role/state. The generated Playwright run re-checks the same locator. Do not
use `.first()` or `.last()` to hide multiple matches

**Avoid:** `:nth-child()`, auto-generated classes (`css-1abc2d`), full XPath trees, selectors copied from screenshots without DOM evidence and guessed test-ids. If Browser MCP cannot inspect the target page, leave the target `blocked`/`UNTEST` rather than guessing

See [selector-discovery.md](selector-discovery.md) for candidate generation, XPath policy and the evidence manifest

## 3. BasePage contract

`BasePage` (`assets/templates/base.page.ts`) provides shared helpers every page inherits:

| Helper | Purpose |
|---|---|
| `waitForLoad()` | Default network-idle wait; override per page for custom "ready" signal |
| `goto(path)` | Navigate + wait for load |
| `waitForResponse(urlOrRe, timeout)` | Assert a backend call happened (great for verifying "save" hit the API) |
| `textOf(locator)` | Trimmed text extraction for assertions |

Override `waitForLoad()` when a page uses skeletons/spinners — wait for the specific "loaded" signal instead of blanket `networkidle` (which never settles on apps with websockets/polling).

## 4. Spec file structure

```typescript
test.describe('Feature @ui', () => {
  let page: SomePage;

  test.beforeEach(async ({ page: p }) => {
    page = new SomePage(p);
    await page.goto();
  });

  test('happy path — <intent>', async ({ page: p }) => { /* actions on `page`, expect() here */ });
  test('negative — <intent>', async () => { /* ... */ });
});
```

- **One intent per test.** Don't bundle "login + create + delete" into one test — split.
- **`beforeEach` for shared setup** (navigation, seed data). **`beforeAll`** for expensive setup (auth token).
- **Assertions in the spec**, reading data returned by page methods.

## 5. Fixtures (auth, data)

- **Auth via storage state:** log in once, save `storageState` to a JSON file, reuse across tests:
  ```typescript
  // playwright.config.ts
  use: { storageState: 'fixtures/auth.json' }
  ```
  Generate it with a setup project (login → `page.context().storageState({ path: ... })`).
- **Custom fixtures** for test data generators (email, timestamps) so tests stay deterministic but unique:
  ```typescript
  import { test, expect } from '../fixtures/data-driven';

  test('create isolated user', async ({ testData }) => {
    const email = testData.uniqueEmail();
    // Use email only in this test attempt, then clean up the created user.
  });
  ```
- **Project-specific data** → `fixtures/` folder, **not** hardcoded in page objects.
- **Typed case datasets** → `test-data/cases/`; keep them read-only and create one test per row.
- Full DDT and worker/test isolation pattern → `references/data-driven-testing.md`.

## 6. Parallelism & isolation

- Playwright runs tests in parallel when configured with `fullyParallel: true`. Each test gets a fresh browser context, but backend/account/file state remains shared unless explicitly isolated.
- If a test mutates data, create data with the test-scoped `testData` fixture and **clean up in fixture teardown/`afterEach`**. Use `afterAll` only for worker-owned resources.
- Scenarios that mutate account-owned state require a per-parallel-slot account pool (`TEST_ACCOUNTS_JSON`) or another isolated tenant/resource.
- Runtime file/store names must include the worker/test namespace. Never let workers update one shared JSON file.
- For serial dependency (rare, avoid if possible): `test.describe.serial(...)`.

## 7. Tracing / screenshots / video

```typescript
// playwright.config.ts
use: {
  trace: unifiedEvidence ? 'on' : 'retain-on-failure',
  screenshot: 'off',
  video: 'on',
}
```
- `fixtures/pom.ts` owns the canonical `evidence-image` and `evidence-video` attachments. `run-testcase-pom.mjs` sets `QA_UNIFIED_EVIDENCE=true`, so deterministic testcase execution retains visual and same-session trace evidence for both PASS and FAILED
- Allure parameters and attachment names are fixed by `references/allure-playwright-mapping.md`; validate with `npm run allure:contract`
- **Trace viewer** (`npx playwright show-trace trace.zip`) = full timeline (DOM snapshot, network, console, source). The #1 debugging tool.
- In CI: archive `test-results/` as artifact on failure (see `cicd.md`).

## 8. Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| `expect()` inside page object | Move assertion to spec; page returns data |
| Raw CSS / `:nth-child` locators | Apply `testid → id → CSS → semantic → XPath`; reject generated CSS and positional selectors |
| Guessed XPath or selector copied from testcase prose | Inspect live DOM, verify uniqueness/actionability and record selector evidence |
| `page.waitForTimeout(3000)` | Wait for a signal: `waitForResponse`, `expect(locator).toBeVisible()` |
| Login inside every test | Use `storageState` fixture |
| One mega-test doing 5 things | Split into focused tests |
| Hardcoded test data in page class | Move to `fixtures/` |
| Shared mutable state between tests | Fresh context per test + cleanup |
| Brittle full-text match (`toHaveText('Welcome, John Smith')`) | Use regex `/welcome.*smith/i` or partial |
