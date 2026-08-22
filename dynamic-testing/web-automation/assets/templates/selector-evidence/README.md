# Selector evidence

Store one JSON manifest per feature here after resolving the testcase target keys in the real environment

For complete UI/POM coverage, store the Browser MCP route/state inventory beside the selector manifest as `<module>.ui-function-inventory.json` and run `scripts/verify-ui-coverage.mjs` before selector promotion. Selector evidence covers known targets; the inventory gate detects functions that were never added to the testcase manifest

Each target record should include:

- `target_key` from `support-testcase-authoring` `execution.steps[].target.key`
- `status`: `runtime_verified` or `blocked`
- `strategy` and the exact Playwright locator expression
- `candidates`: ordered candidate list using `testid → id → css → role/label/placeholder/text → xpath`, with `available` and optional source/count details
- Browser MCP provenance: top-level or target-level `provider` (`playwright-mcp` or `chrome-devtools-mcp`), `browser_driver`, `browser_observer`, `tools_used` and `mcp.session_id`
- `route`, role, locale and state used for verification
- top-level or target-level `captured_at`, same-browser `run_id` and current `app_build`
- `verification.count = 1`; use `visible = true` for interactive/visible assertions and `visible = false` for `hidden`; require `actionable = true` when the target is clicked, filled or selected
- `reason` when XPath/CSS is used, a higher-priority candidate was unavailable/ambiguous, or the target is blocked

When no FE repository or FE contract is available, set the test-id candidate to `available: false` instead of inventing a `data-testid`. The audit compares the selected strategy with the first available candidate

The default discovery command requires a Browser MCP evidence file:

```bash
npm run discover:selectors -- \
  --manifest testcases/<feature>.automation.json \
  --group <module> \
  --app-build "$QA_APP_BUILD" \
  --browser-mcp-evidence selector-evidence/<module>.browser-mcp.json
```

For an XPath target, include `xpath` with the exact short expression returned by
Browser MCP and a `reason` explaining why higher-priority candidates were not
usable. The MCP record must include navigation, snapshot and DOM-evaluation
tools for the selected provider, and `verification.count` must be exactly `1`

Do not store secrets or personal data in this manifest. Do not turn a blocked target into a guessed XPath

After generating the POM, run `npm run traceability -- --testcases testcases/<feature>.md --manifest testcases/<feature>.automation.json --app-build <current-build>`. The audit resolves evidence by testcase role/route and fails closed when evidence is missing, stale, from another build, ambiguous, not runtime-verified, or absent from `selectors/`
