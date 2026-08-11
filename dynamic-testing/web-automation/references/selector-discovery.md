# Runtime Selector Discovery and Verification

This reference defines how POM automation obtains a correct locator for a testcase target. The target description in a testcase is a semantic hint, not permission to invent an XPath. `unresolved` in the testcase contract means discovery has not run; the separate selector evidence manifest may record the final result as `runtime_verified` or `blocked`

## Source of truth

For each `execution.steps[].target.key`:

1. Open the declared route in the requested environment with the correct role and test data
2. Inspect the live accessibility tree and DOM after the page reaches its ready state
3. Generate candidate locators from observed properties in this exact order:
   - `getByTestId(test_id)` only when an existing FE-owned test-id is found in FE source/contract or already present in the live DOM
   - `#id` when the runtime ID is stable and unique
   - stable CSS attributes/classes such as `[name="email"]` or `[type="password"]`; reject generated classes
   - `getByRole(role, { name })`, `getByLabel(label)`, `getByPlaceholder(placeholder)` and `getByText(text)` from observed semantic evidence
   - a short anchored XPath only as a last resort
   If no FE repository or contract is available, do not fabricate a test-id. Record the unavailable candidate and continue to the next available strategy
4. Verify every candidate in the same runtime page before selecting it
5. Save the ordered candidates, selected strategy, locator and verification evidence in `selector-evidence/<feature>.json`
6. Put the locator in `selectors/<feature>.selectors.ts` and expose it through the Page Object only

Do not use a guessed selector from a requirement sentence, screenshot coordinates, a generated CSS class or a full DOM path

## Verification gate

A locator is accepted only when the live page proves:

```typescript
// Use this only when the FE-owned test-id exists and was observed/verified
const locator = page.getByTestId('login-submit');
await expect(locator).toHaveCount(1);
await expect(locator).toBeVisible();
await expect(locator).toBeEnabled(); // required for click/fill/select actions
```

For a read-only assertion, `toBeEnabled()` is not required. For a collection, prove the intended cardinality and scope instead of forcing `.first()`

After choosing a locator, run the action in the intended state and verify the resulting assertion. A locator that is unique but points to a hidden template, disabled control or wrong dialog is not verified

## XPath policy

XPath is not the default and is never “correct” merely because it matches once

Use XPath only when all of the following are true:

- test-id, stable ID, stable CSS and semantic candidates are absent or ambiguous
- the XPath is short and anchored to a stable attribute or semantic relationship
- the candidate passes count, visibility and actionability checks
- the evidence records why XPath was necessary and the exact route/state where it was verified

Allowed shape:

```typescript
page.locator('//form[@aria-label="Login"]//input[@name="email"]');
```

Forbidden shape:

```typescript
page.locator('/html/body/div[1]/div[2]/main/div[3]/form/div[1]/input');
page.locator('//button[contains(@class, "css-1a2b3c")]');
```

Never add `:nth-child()`, `.first()` or `.last()` just to suppress a strict-mode failure. Narrow the semantic scope or stop and report an ambiguous target

## Evidence format

The automation project should keep a small manifest next to the selector repository. It is audit evidence, not a second locator implementation

```json
{
  "schema_version": 1,
  "feature": "login",
  "route": "/login",
  "role": "Guest",
  "captured_at": "<ISO-8601>",
  "run_id": "<same-browser-run-id>",
  "app_build": "<commit-or-deployment-id>",
  "targets": [
    {
      "target_key": "login_submit",
      "status": "runtime_verified",
      "strategy": "testid",
      "locator": "getByTestId('login-submit')",
      "candidates": [
        { "strategy": "testid", "available": true, "source": "FE contract" },
        { "strategy": "id", "available": false },
        { "strategy": "css", "available": false },
        { "strategy": "role", "available": true, "count": 1 }
      ],
      "fallbacks": [],
      "verification": {
        "count": 1,
        "visible": true,
        "actionable": true,
        "url": "<BASE_URL>/login"
      }
    }
  ]
}
```

If a target cannot be resolved, record:

```json
{
  "target_key": "login_submit",
  "status": "blocked",
  "reason": "Two visible buttons have the same accessible name"
}
```

Do not turn `blocked` into a guessed XPath. Ask for a stable label/test-id or clarify the target scope

## Selector file pattern

```typescript
// selectors/login.selectors.ts
export const loginSelectors = {
  email: (page: Page) => page.getByLabel('Email'),
  password: (page: Page) => page.getByLabel('Mật khẩu'),
  submit: (page: Page) => page.getByRole('button', { name: 'Đăng nhập' }),
} as const;
```

The selector file contains only runtime-verified selectors. The Page Object owns the locator instances and action methods. Specs call Page Object methods and assertions; specs do not reconstruct selectors

## Reverification triggers

Re-run selector discovery when any of these changes:

- route, role, locale, feature flag or responsive layout changes
- accessible name, label, test-id or component structure changes
- a selector fails strictness, actionability or points to a different state
- a testcase target key or entry state changes

The audit requires `captured_at`, `run_id` and `app_build`, blocks evidence older than the configured freshness limit, and compares `app_build` with `--app-build`/`QA_APP_BUILD`. Do not copy evidence between deployments or browser sessions.

Retries do not prove selector correctness. A retry-pass is a flaky result and must retain first-attempt evidence
