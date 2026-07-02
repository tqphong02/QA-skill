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
- **Responsibilities:** hold locators, perform actions (click/fill/select), read & return data (text, count, state).
- **NOT its job:** `expect()` assertions. Assertions belong in the spec so the page stays reusable across tests with different expectations.
- **Component composition:** a page may expose child components as properties (`this.header = new Header(page)`), but avoid deep nesting — flatten if it hurts readability.
- **Naming:** `<thing>.page.ts` → class `<Thing>Page`. Component: `<thing>.component.ts` → `<Thing>Component`.

## 2. Locator strategy (priority order)

Prefer resilient locators that survive styling/structure churn:

1. `getByRole(role, { name })` — best, mirrors accessibility (e.g. `getByRole('button', { name: /sign in/i })`).
2. `getByLabel(text)` — form fields (`getByLabel('Password')`).
3. `getByPlaceholder(text)`.
4. `getByTestId('login-submit')` — stable, agreed with frontend team. Use when no good role/label.
5. `getByText(text)` — for non-interactive content assertions.
6. CSS / XPath — **last resort**. Brittle; only when nothing else works.

**`data-testid` convention:** `<component>-<element>` (e.g. `login-email`, `cart-total`). Coordinate with frontend so test IDs are stable and meaningful (not auto-generated).

**Avoid:** `:nth-child()`, auto-generated classes (`css-1abc2d`), full XPath trees.

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
  export const test = base.extend<{ uniqueEmail: string }>({
    uniqueEmail: async ({}, use) => { await use(`qa-${Date.now()}@example.com`); },
  });
  ```
- **Project-specific data** → `fixtures/` folder, **not** hardcoded in page objects.

## 6. Parallelism & isolation

- Playwright runs tests in parallel by default (`fullyParallel: true`). Each test gets a fresh context — **no shared state between tests**.
- If a test mutates data, **clean up in `afterEach`/`afterAll`** or use `withRevert`-style teardown. Don't rely on test ordering.
- For serial dependency (rare, avoid if possible): `test.describe.serial(...)`.

## 7. Tracing / screenshots / video

```typescript
// playwright.config.ts
use: {
  trace: 'retain-on-failure',     // best setting — captures only failures
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```
- **Trace viewer** (`npx playwright show-trace trace.zip`) = full timeline (DOM snapshot, network, console, source). The #1 debugging tool.
- In CI: archive `test-results/` as artifact on failure (see `cicd.md`).

## 8. Common anti-patterns

| Anti-pattern | Fix |
|---|---|
| `expect()` inside page object | Move assertion to spec; page returns data |
| Raw CSS / `:nth-child` locators | Use `getByRole` / `getByTestId` |
| `page.waitForTimeout(3000)` | Wait for a signal: `waitForResponse`, `expect(locator).toBeVisible()` |
| Login inside every test | Use `storageState` fixture |
| One mega-test doing 5 things | Split into focused tests |
| Hardcoded test data in page class | Move to `fixtures/` |
| Shared mutable state between tests | Fresh context per test + cleanup |
| Brittle full-text match (`toHaveText('Welcome, John Smith')`) | Use regex `/welcome.*smith/i` or partial |
