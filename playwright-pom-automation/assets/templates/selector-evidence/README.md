# Selector evidence

Store one JSON manifest per feature here after resolving the testcase target keys in the real environment

Each target record should include:

- `target_key` from `testcase-template` `execution.steps[].target.key`
- `status`: `runtime_verified` or `blocked`
- `strategy` and the exact Playwright locator expression
- `candidates`: ordered candidate list using `testid → id → css → role/label/placeholder/text → xpath`, with `available` and optional source/count details
- `route`, role, locale and state used for verification
- top-level or target-level `captured_at`, same-browser `run_id` and current `app_build`
- `verification.count = 1`; use `visible = true` for interactive/visible assertions and `visible = false` for `hidden`; require `actionable = true` when the target is clicked, filled or selected
- `reason` when XPath/CSS is used, a higher-priority candidate was unavailable/ambiguous, or the target is blocked

When no FE repository or FE contract is available, set the test-id candidate to `available: false` instead of inventing a `data-testid`. The audit compares the selected strategy with the first available candidate

Do not store secrets or personal data in this manifest. Do not turn a blocked target into a guessed XPath

After generating the POM, run `npm run traceability -- --testcases testcases/<feature>.md --manifest testcases/<feature>.automation.json --app-build <current-build>`. The audit resolves evidence by testcase role/route and fails closed when evidence is missing, stale, from another build, ambiguous, not runtime-verified, or absent from `selectors/`
