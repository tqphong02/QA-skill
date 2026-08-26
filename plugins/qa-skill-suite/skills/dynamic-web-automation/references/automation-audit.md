# Automation audit: testcase → spec → selector

The POM skill must leave an auditable chain for every generated UI automation suite:

```text
testcase Markdown
  └─ lossless .automation.json + SHA-256
       └─ deterministic pom-plan markers
            └─ spec test title / source + step/outcome/RBAC/cleanup markers
                 └─ execution.steps[].target.key and assertion-only target keys
                 └─ selector-evidence/<feature>.json
                      └─ runtime-verified locator in selectors/
```

## Run the audit

Run this after the POM agent generates or changes a suite:

```bash
npm run traceability -- \
  --testcases testcases/login.md \
  --manifest testcases/login.automation.json \
  --selector-evidence-dir selector-evidence \
  --app-build "$QA_APP_BUILD" \
  --output reports/testcase-automation-traceability.json
```

For a run that intentionally executes only a deterministic slice, pass the exact
Testcase IDs and keep the scope visible in the generated JSON:

```bash
npm run traceability -- \
  --testcases testcases/AIFA_Function_Testcases_12-08-2026.md \
  --manifest testcases/AIFA_Function_Testcases_12-08-2026.automation.json \
  --testcase-ids AIFA-FILE-UPLOAD-01,AIFA-FILE-UPLOAD-02,AIFA-FILE-UPLOAD-03 \
  --output reports/traceability-selected-flow.json
```

`--testcase-ids` prevents unrelated legacy cases from being mixed into a
selected-flow result; it does not waive their evidence. The no-filter command
remains the authoritative full-project audit and must stay `BLOCKED` until every
in-scope target has fresh same-session runtime evidence

The generated JSON answers:

- which exact testcase file was consumed and its `sha256`
- whether Markdown matches the hash recorded by the automation manifest
- which testcase IDs were found and whether each ID appears in a Playwright test/TMS mapping
- whether the spec contains the current automation-manifest hash and every required behavior/RBAC marker
- whether every step calls the deterministic `<action><TargetKey>` Page Object method, carries the value fingerprint, and every assertion uses a matcher compatible with its assertion kind
- whether that Page Object method contains the matching Playwright primitive (`fill`, `click`, `goto`, `selectOption`, and so on)
- which `target.key` values came from the execution contract
- which evidence file resolved each target and the exact locator expression
- whether the evidence recorded `count=1`, `visible=true|false` matching the assertion, and `actionable=true` when the action needs it
- whether the recorded locator is present in `selectors/`
- why the suite is `PASS` or `BLOCKED`

`BLOCKED` is the expected result when the lossless manifest is missing, a spec is empty, action/value/assertion semantics do not match the plan, a source/step/outcome/cleanup/role/RBAC marker is missing, a testcase is legacy text-only, selector evidence is stale/from another build, a target has no runtime evidence, a selector is ambiguous, or the locator is not present in selector code. Do not fix that result by inventing an XPath or copying marker text into a test that does not implement the action

## What proves an XPath is correct

The audit is a consistency gate; it is not a substitute for a live browser check. A selector is acceptable only when all of these are true:

1. The testcase has a semantic `target.key`, not an XPath guessed from prose
2. The POM agent inspected the target DOM in the declared route, role, locale and state
3. The evidence records the selected locator, strategy, route/state and verification result
4. Browser MCP provenance records the provider, same-session `run_id`, navigation/snapshot/DOM-evaluation tools and the live target observation
5. Browser MCP proves `count=1`, visibility and actionability for click/fill/select actions
6. Playwright re-checks the same locator expression during the generated test
7. The same locator expression is present in `selectors/` and is used through a Page Object
8. The generated test reaches the intended state and passes its business assertion

The audit expects the selected strategy to follow `testid → id → CSS → role/label/placeholder/text → XPath`. Evidence should record every ordered candidate, including unavailable test-id when no FE source/contract exists. XPath is a last resort and must include a reason in evidence. Absolute XPath, generated CSS classes and positional selectors are blocked by the audit

After audit PASS, run [testcase-execution.md](testcase-execution.md). Traceability PASS authorizes the selected implementation to execute but is not the testcase verdict; only the evidence-gated Playwright run returns `PASS`, `FAILED`, `N/A` or `UNTEST`.

Use `--require-browser-mcp` for the POM workflow. It fails closed when selector
evidence is missing Browser MCP provenance or does not contain the provider's
navigation, snapshot and DOM-evaluation tools

## Token usage

The audit separates three measurements:

- `source.source_context_estimate`: deterministic UTF-8-bytes/4 estimate for the testcase file only. It is not the full AI prompt
- `token_usage.measurement=provider_reported`: exact input/output/total token counts supplied by the model host
- `token_usage.measurement=not_available`: the host did not expose usage; the audit must not fabricate a number

Call the recorder once per phase with `--stage testcase_generation|selector_discovery|pom_generation|repair`. The audit reports each stage and the aggregate; do not overwrite one phase with another.

Playwright itself does not consume LLM tokens. Tokens are spent while the AI reads the testcase and generates code. To attach provider usage when the host exposes it, write the canonical QA usage file and pass it to the audit:

```bash
QA_TOKEN_USAGE_FILE=reports/model-usage.json
node ../../QA-skill/../../dynamic-web-exploratory/scripts/helpers/record-model-usage.mjs \
  --file "$QA_TOKEN_USAGE_FILE" \
  --stage pom_generation \
  --provider "$QA_MODEL_PROVIDER" \
  --model "$QA_MODEL_NAME" \
  --input-tokens "$INPUT_TOKENS" \
  --output-tokens "$OUTPUT_TOKENS" \
  --total-tokens "$TOTAL_TOKENS"

npm run traceability -- \
  --testcases testcases/login.md \
  --manifest testcases/login.automation.json \
  --token-usage "$QA_TOKEN_USAGE_FILE"
```

If the AI host does not provide those counters, the JSON must show `not_available`; do not report the source-file estimate as actual model usage
