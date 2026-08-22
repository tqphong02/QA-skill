---
name: support-testcase-authoring
description: Generate, edit, or review synchronized manual testcase Markdown, shared execution manifests, Excel, or CSV with stable Scenario/Testcase IDs, black-box metadata, detailed reproduce steps, and optional RBAC coverage. Trigger on testcase/scenario writing or review and explicit API testcase requests for endpoints, OpenAPI, Swagger, Postman, or curl; do not require the skill name. Not for exploratory notes, live execution, bug reports, or Playwright code.
mode: support
surface: test-design
role: authoring
legacy_aliases: testcase-template
---

# Test Case Template

Use one validated JSON source to generate `<name>.md`, `<name>.automation.json`, then `<name>.xlsx`. The manifest is the lossless source for `dynamic-web-automation` BUILD_AND_RUN; never edit derived artifacts independently

## Mandatory workflow

1. Resolve `UI`, `FUNCTION` or explicit `API` mode. only use API mode when user explicitly requests writing API testcases
2. Read requirements/AC and build non-empty top-level `requirements[]`; unresolved expected results stop generation
3. Organize `section → group → scenario → cases`; every FUNCTION group starts with its main successful flow
4. Keep one scenario per field/behavior/AC; changing it changes Scenario ID and Name
5. Give each case stable `testcase_id`, valid `type`, matching `req`, `bb_technique` and execution data
6. New UI/FUNCTION cases use `execution_contract="required"`; read [execution-contract.md](references/execution-contract.md)
7. Add RBAC only when applicable; unresolved permission expectations remain `UNRESOLVED`
8. Run `python3 scripts/gen-testcases.py <input.json> <output.xlsx>`
9. Read Markdown, validate manifest, compare IDs/count/content/design with Excel; I-M remain blank
10. Fix the JSON source and regenerate on mismatch

## Cross-model hard gates

- No trailing `.`
- No emoji/icons
- Always create `<output>.md` before `<output>.xlsx`
- Validate the `RBAC Matrix` with `references/rbac-matrix.schema.json` and its `allow_case_ref` links
- The generator fails closed for `review_required`, missing/unknown requirements, mixed AC, invalid IDs/types/technique/contracts, invalid RBAC or secret placeholders

## Structure and fields

```text
1.1. USER INTERFACE / 1.2. FUNCTION
└── LOGIN
    ├── SCN-LOG-001 | Validation email
    └── SCN-LOG-002 | Validation password
```

Top level needs `execution_contract="required"`, project metadata, source document, `requirements[]` and `sections[]`. Scenarios need `SCN-*`, name and requirement. Cases need stable ID, type, matching req, Vietnamese description, priority, `bb_technique` and `execution`

Use `EP`, `BVA`, `Decision Table`, `State Transition`, `Use Case Testing`, `Error Guessing` or `Pairwise`. `additional` uses `req=(out-of-spec)` and is not confirmed requirement coverage. Every non-empty FUNCTION group needs a `happy` case before validation/negative-only cases

## Token-efficient source design

- Read Markdown for human review and `.automation.json` for runtime/POM; do not recover execution logic from Excel
- Reuse genuinely identical flows with `execution_templates`, `execution_ref` and `execution_overrides`; different behavior/AC needs a new scenario
- Let scripts render all projections; do not ask the model to write Markdown/manifest/Excel separately
- Optional `case.ui_function_keys`/`case.coverage_refs` map deterministic UI cases to the Browser MCP inventory

## Manual and automation contract

Every UI/FUNCTION procedure states environment, route/screen, business role, state, permission and named data; uses one action per numbered line with exact input and observable intermediate/final results. Keep click/focus separate from fill/clear, keep machine keys/selectors/HTTP syntax out of Excel F/G/H, and never store real passwords, tokens, cookies or API keys

## Conditional references

| Need | Read |
|---|---|
| UI/FUNCTION contract/templates | [execution-contract.md](references/execution-contract.md) |
| Black-box techniques | [blackbox-techniques.md](references/blackbox-techniques.md) |
| UI display-only cases | [ui-testcases.md](references/ui-testcases.md) |
| Explicit API testcase writing | [api-testcases.md](references/api-testcases.md) |
| API source import | Run [scripts/import-api-spec.py](scripts/import-api-spec.py) first and stop while `review_required` is non-empty |
| RBAC/permissions | [rbac-matrix.schema.json](references/rbac-matrix.schema.json) |
| Workbook schema | [template-schema.md](references/template-schema.md) |
| Artifact read order | [markdown-testcases.md](references/markdown-testcases.md) |
| Plane requirements | [plane-integration.md](references/plane-integration.md) |

## Output invariants

Markdown → automation manifest → Excel share basename/date policy (`Asia/Ho_Chi_Minh`, `_DD-MM-YYYY` unless exact filename is requested). IDs, requirements, descriptions, execution content and counts match; scenario/testcase IDs remain stable; columns I-M remain blank; RBAC sheet exists with `N/A` when out of scope; content is Vietnamese with no trailing prose period or emoji/icon. Read back every artifact before handoff
