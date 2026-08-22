---
name: support-testcase-authoring
description: Generate, edit, or review synchronized manual testcase Markdown, shared execution manifests, Excel, or CSV with stable Scenario/Testcase IDs, black-box metadata, detailed reproduce steps, and optional RBAC coverage. Trigger on testcase/scenario writing or review and explicit API testcase requests for endpoints, OpenAPI, Swagger, Postman, or curl; do not require the skill name. Not for exploratory notes, live execution, bug reports, or Playwright code.
mode: support
surface: test-design
role: authoring
legacy_aliases: testcase-template
---

# Test Case Template

Use one validated JSON source to generate `<name>.md`, `<name>.automation.json`, then `<name>.xlsx`. The manifest is the single lossless source for unified testcase execution and Playwright POM; never edit the three derived artifacts independently.

## Mandatory workflow

1. Resolve `UI`, `FUNCTION`, or explicit `API` mode
2. Read the requirement/AC source and build top-level `requirements[]`; unresolved expected results stop generation
3. Organize `section → group → scenario → cases`; every FUNCTION group starts with its main successful business flow
4. Keep one scenario to one field/behavior/AC; change both Scenario ID and Scenario Name when it changes
5. Assign every new case a stable `testcase_id`, one valid `type`, matching `req`, and `bb_technique`
6. For new UI/FUNCTION cases, use `execution_contract="required"` and the structured contract in [references/execution-contract.md](references/execution-contract.md)
7. Add top-level `rbac` only when roles/permissions apply; unresolved expectations remain `UNRESOLVED`
8. Run `python3 scripts/gen-testcases.py <input.json> <output.xlsx>`
9. Read Markdown, validate the manifest, then compare IDs/count/design with Excel; I-M remain blank
10. Fix the JSON source and regenerate on any mismatch

## Cross-model hard gates

- No trailing `.`
- No emoji/icons
- only use API mode when user explicitly requests writing API testcases
- For RBAC Matrix data, validate `references/rbac-matrix.schema.json` and its `allow_case_ref` links
- Always create `<output>.md` before `<output>.xlsx`

The generator fails closed for a non-empty `review_required`, missing/unknown requirement, mixed AC inside one scenario, invalid/missing Scenario ID/Name, testcase type, black-box technique, stable Testcase ID, execution contract, RBAC mapping, or secret placeholder.

## Structure and grouping

```text
1.1. USER INTERFACE or 1.2. FUNCTION   section row
└─ LOGIN                               separate group row
   ├─ SCN-LOG-001 | Validation email   testcase rows
   └─ SCN-LOG-002 | Validation password
└─ REGISTER                            next separate group row
```

- `sections[].groups[].name` creates the separate function/group header row
- `scenario_name` is column C on each testcase row, shared only inside the same scenario
- Split scenarios when field/input, behavior, or AC differs
- Same feature may exist separately in UI and FUNCTION sections
- Every non-empty FUNCTION group must contain at least one `happy` case; validation-only or negative-only function groups fail generation until the main successful flow is added
- Scenarios sort by the earliest case type they contain, and cases sort within each scenario, so every FUNCTION group starts with `Happy Path`, then `Alternative` (when applicable), `Validation`, `Edge Case`, `Negative`, `Error Handling`, `UI`, `Additional`; source array order and Scenario ID must not put validation before the main happy path
- Default technique mapping: happy/alternative/ui → Use Case; validation → EP plus applicable BVA/Decision Table; edge → BVA+EP; negative → EP+Error Guessing; error → Error Guessing+State Transition; additional → Error Guessing
- `additional` uses `req=(out-of-spec)` and is never presented as confirmed requirement coverage

## Required JSON fields for new cases

- Top level: `execution_contract="required"`, project metadata, source document, non-empty `requirements[]`, and `sections[]`
- Scenario: stable `scenario_id` matching `SCN-*`, non-empty `scenario_name`, one `requirement`
- Case: stable `testcase_id`, `type`, matching `req`, Vietnamese `description`, priority, `bb_technique`, and `execution`
- `bb_technique` accepts a string or non-empty list from: `EP`, `BVA`, `Decision Table`, `State Transition`, `Use Case Testing`, `Error Guessing`, `Pairwise`
- API cases use `kind=api` under `1.2. FUNCTION` and follow the API importer/reference

Use [examples/structured-input.json](examples/structured-input.json) only when the shape is unclear; do not load the example for every generation.

## Token-efficient source design

- Do not parse Excel to recover generated execution logic; read Markdown for human review and `.automation.json` for unified runtime execution plus POM
- Reuse identical flows through top-level `execution_templates` plus per-case `execution_ref`/`execution_overrides`; arrays replace template arrays and dictionaries merge recursively
- Reuse only genuinely identical entry/steps; different behavior or AC still requires a separate scenario
- Let scripts render Markdown, manifest and Excel; never ask the model to write those projections separately
- For deterministic UI/POM completeness, optional `case.ui_function_keys`/`case.coverage_refs` are preserved in `.automation.json` and map the case to the Browser MCP UI function inventory
- Read only the mode-specific references below

## Manual and automation contract

Every new UI/FUNCTION Procedure must be executable by a manual tester:

- state environment, screen/route, business role, state, permissions and named data
- write one action per numbered line: route/screen → click/focus target → exact input → next action → observation/wait
- keep click/focus separate from `fill` or `clear`
- render `data_ref`/machine input keys only in the structured source or automation manifest; Excel/Markdown manual steps must show a safe sample value or the exact fixture filename
- state observable intermediate and final results; reject vague results such as `Hệ thống xử lý đúng`
- keep selectors, raw JSON, HTTP syntax and machine keys out of Excel F/G/H
- never store real passwords, tokens, cookies or API keys

The lossless `.automation.json` is the shared source for `dynamic-web-automation` BUILD_AND_RUN: compile reusable code, execute it, capture evidence and return a verdict. Semantic `target.key` values are not locator proof; verify targets in the live Playwright session.

## Conditional references

Read only what the selected mode needs:

| Need | Read |
|---|---|
| New UI/FUNCTION execution contract or compact templates | [references/execution-contract.md](references/execution-contract.md) |
| Build Decision Table/BVA/state/pairwise details or audit technique coverage | [references/blackbox-techniques.md](references/blackbox-techniques.md) |
| UI display-only coverage | [references/ui-testcases.md](references/ui-testcases.md) |
| Explicit API testcase generation | [references/api-testcases.md](references/api-testcases.md) |
| RBAC/permissions | [references/rbac-matrix.schema.json](references/rbac-matrix.schema.json) |
| Workbook columns/sheets | [references/template-schema.md](references/template-schema.md) |
| Artifact read order | [references/markdown-testcases.md](references/markdown-testcases.md) |
| Plane requirements | [references/plane-integration.md](references/plane-integration.md) |

For API source files, always run `scripts/import-api-spec.py` first and stop while `review_required` is non-empty. Do not assume a missing success status.

## Output invariants

- Markdown → automation manifest → Excel, same basename and `Asia/Ho_Chi_Minh` `_DD-MM-YYYY` date unless exact filename preservation is requested
- IDs, requirements, descriptions, execution content and counts match across artifacts
- Scenario/Testcase IDs remain stable when cases move; gaps are valid
- Columns I-M remain blank for tester execution
- Content is Vietnamese, has no trailing prose period and no emoji/icon
- RBAC sheet always exists; write `N/A` when RBAC is outside scope
- Read back every generated artifact before handoff
