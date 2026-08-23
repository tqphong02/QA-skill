# Runtime Selector Discovery and Verification

This reference defines how POM automation obtains a correct locator for a testcase target. The target description in a testcase is a semantic hint, not permission to invent an XPath. `unresolved` in the testcase contract means discovery has not run; the separate selector evidence manifest may record the final result as `runtime_verified` or `blocked`

## Source of truth

For each `execution.steps[].target.key`, Browser MCP is the source of truth for
the discovery observation. Use Playwright MCP by default, or Chrome DevTools MCP
when it is explicitly selected and attached to the exact page being inspected

1. Use the same Browser MCP session to open the declared route in the requested environment with the correct role and test data
2. Inspect the live accessibility snapshot and DOM after the page reaches its ready state
3. Use the Browser MCP DOM-evaluation tool to generate candidate locators from observed properties in this exact order:
   - `getByTestId(test_id)` only when an existing FE-owned test-id is found in FE source/contract or already present in the live DOM
   - `#id` when the runtime ID is stable and unique
   - stable CSS attributes/classes such as `[name="email"]` or `[type="password"]`; reject generated classes
   - `getByRole(role, { name })`, `getByLabel(label)`, `getByPlaceholder(placeholder)` and `getByText(text)` from observed semantic evidence
   - a short anchored XPath only as a last resort
   If no FE repository or contract is available, do not fabricate a test-id. Record the unavailable candidate and continue to the next available strategy
4. Verify every candidate with Browser MCP in the same runtime page before selecting it. Prove count, visibility and actionability using the MCP-operated page
5. Save the ordered candidates, selected strategy, locator, Browser MCP provenance and verification evidence in `selector-evidence/<module-slug>.json`
6. Put only the selected locator in `selectors/<module-slug>.selectors.ts` and expose it through the Page Object only

The generated project's `scripts/discover-runtime-selectors.mjs` consumes the
Browser MCP record instead of guessing from testcase prose:

```bash
npm run discover:selectors -- \
  --manifest testcases/<feature>.automation.json \
  --group <module-slug> \
  --app-build "$QA_APP_BUILD" \
  --browser-mcp-evidence selector-evidence/<module-slug>.browser-mcp.json \
  --output selector-evidence/<module-slug>.json
```

The command is Browser MCP-first. Without `--browser-mcp-evidence`, it stops
with `BLOCKED` unless the caller explicitly opts into
`--provider playwright-runtime` for an offline/local fallback. A local
Playwright fallback must remain labeled `playwright-runtime` and cannot be used
as Browser MCP provenance

For a multi-module application, repeat the process one module at a time. A
route-level discovery pass is sufficient for static controls; dynamic controls
must be captured from the smallest testcase that reaches the dialog or
post-action state. The generated fixture can attach the same-session records
with:

```bash
QA_SELECTOR_EVIDENCE_CAPTURE=true QA_UNIFIED_EVIDENCE=true \
npx playwright test tests/functional/<module-slug>.functional.spec.ts \
  --grep '<Testcase-ID>' --workers=1
node scripts/promote-runtime-evidence.mjs --feature <module-slug>
```

The promotion script is evidence-only: it accepts a record only when the
collector marked it `runtime_verified`, the locator count is exactly one, and
the recorded state proves visibility or hidden-file actionability. It does not
promote a target inferred from a testcase name or prose

Do not use a guessed selector from a requirement sentence, screenshot coordinates, a generated CSS class or a full DOM path

### Browser MCP probe contract

The Browser MCP record must show the operations that produced the evidence

| Provider | Navigate | Accessibility/DOM observation | DOM evaluation |
|---|---|---|---|
| `playwright-mcp` | `browser_navigate` | `browser_snapshot` | `browser_evaluate` |
| `chrome-devtools-mcp` | `navigate_page` | `take_snapshot` | `evaluate_script` |

Keep the raw tool names in `tools_used` and the same browser `run_id` on every
target. Do not mix a Playwright MCP snapshot with Chrome DevTools DOM or network
evidence from another session

When XPath is required, the DOM evaluation result must include the exact XPath,
the element tag/anchor used, and its live verification. A safe evaluation shape
is a short predicate against a stable attribute or a semantic relationship that
returns one element

```javascript
// Executed by Browser MCP's DOM-evaluation tool against the current page
const result = (() => {
  const element = document.querySelector('[name="email"]'); // candidate observed in the current snapshot
  const literal = value => {
    if (!value.includes("'")) return `'${value}'`;
    if (!value.includes('"')) return `"${value}"`;
    return `concat('${value.split("'").join("',\"'\",'")}')`;
  };
  const unique = expression => {
    const result = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result.snapshotLength === 1 ? expression : '';
  };
  const tag = element?.tagName.toLowerCase() || '';
  const attribute = element?.getAttribute('name');
  const xpath = element && attribute
    ? unique(`//${tag}[@name=${literal(attribute)}]`)
    : '';
  const count = xpath
    ? document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength
    : 0;
  const rect = element?.getBoundingClientRect();
  const visible = Boolean(element && rect?.width && rect?.height);
  const actionable = visible && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  return { xpath, count, visible, actionable, reason: 'stable form/name relationship' };
})();
```

The snippet is a shape contract, not a license to hardcode that example XPath
into a project. The returned expression must be derived from the current page
and rejected when count is not exactly one

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
- Browser MCP's DOM evaluation returns the exact expression and proves count, visibility and actionability in the current page
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
  "schema_version": 2,
  "feature": "login",
  "provider": "playwright-mcp",
  "browser_driver": "playwright-mcp",
  "browser_observer": "playwright-mcp",
  "tools_used": ["browser_navigate", "browser_snapshot", "browser_evaluate"],
  "mcp": {
    "session_id": "<same-browser-run-id>"
  },
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
      "provider": "playwright-mcp",
      "tools_used": ["browser_navigate", "browser_snapshot", "browser_evaluate"],
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

For an XPath target, also record the exact expression returned by Browser MCP:

```json
{
  "strategy": "xpath",
  "locator": "page.locator('xpath=//form[@aria-label=\"Login\"]//input[@name=\"email\"]')",
  "xpath": "//form[@aria-label=\"Login\"]//input[@name=\"email\"]",
  "reason": "test-id, id, CSS and semantic candidates were unavailable or ambiguous; stable form/name relationship was unique",
  "mcp": {
    "provider": "playwright-mcp",
    "session_id": "<same-browser-run-id>",
    "tools_used": ["browser_navigate", "browser_snapshot", "browser_evaluate"]
  }
}
```

The later Playwright execution must still re-check the exact locator. Browser
MCP discovery evidence authorizes selector generation; it is not a substitute
for the final test run

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
