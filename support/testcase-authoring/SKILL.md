---
name: support-testcase-authoring
description: Generate, edit, or review synchronized manual testcase Markdown, shared execution manifests, Excel, or CSV with stable Scenario/Testcase IDs, black-box metadata, detailed reproduce steps, and optional RBAC coverage. Trigger on testcase/scenario writing or review, interactive black-box requirement analysis and testcase authoring, and explicit API testcase requests for endpoints, OpenAPI, Swagger, Postman, or curl; do not require the skill name. Not for exploratory notes, live execution, bug reports, or Playwright code.
mode: support
surface: test-design
role: authoring
legacy_aliases: testcase-template
---

<!-- qa-runs-contract:start -->
## Local run organization

When this workflow creates local reports, evidence, logs, converted intermediates, or other non-source deliverables and the user did not request an exact output path:

1. Start a fresh run with `node <skill-root>/scripts/qa-runs.mjs start --skill <skill-name> --label <short-scope>` when the bundled helper exists. In a QA-skill source checkout use `<repo-root>/scripts/qa-runs.mjs`. If neither helper exists, create the same layout manually
2. Keep every run-owned file under the returned `<project-root>/qa-runs/<skill-name>/<timestamp>_<scope>/` directory. Never emit generated files into the project root or overwrite an earlier run
3. Put the primary human-readable summary at `report.md` when the output format permits. Preserve required machine-readable and native filenames inside the same run directory
4. Finish the run with `qa-runs.mjs finish --run-dir <run-dir> --status <status> [--primary <report-path>]` so `LATEST.md`, `INDEX.md`, root `latest.json`, and per-skill `latest.json` point to the newest run
5. In the final response, link the primary report, the timestamped run directory, and `qa-runs/INDEX.md`; identify the run ID and status explicitly

An exact user path, a source-code deliverable that belongs in the target repository, or a safety-mandated location overrides this layout. Register or link the result without copying secrets or sensitive evidence into the index
<!-- qa-runs-contract:end -->
# Test Case Template

Use one validated JSON source to generate `<name>.md`, `<name>.automation.json`, then `<name>.xlsx`. The manifest is the lossless source for `dynamic-web-automation` BUILD_AND_RUN; never edit derived artifacts independently

## Mandatory workflow

0. Interactive intake & requirement clarification: When presented with feature context, BRD/SRS specs, or interactive testcase prompts, inspect context, extract explicit business rules, flag missing/conflicting items, and ask clarification questions (or list explicit assumptions) before generating test cases; read [blackbox-intake-protocol.md](references/blackbox-intake-protocol.md)
1. Resolve `UI`, `FUNCTION` or explicit `API` mode. only use API mode when user explicitly requests writing API testcases
2. Read the complete supplied source and build atomic `requirements[].coverage_items`; read [coverage-contract.md](references/coverage-contract.md). Unresolved expected results stop generation through `review_required`
3. Reconcile the source inventory before cases: every explicit AC, rule, field constraint, role/state/transition, documented error and in-scope UI/API behavior needs a stable `COV-*` obligation with source ref, expected result, required design and minimum case count
4. Organize `section → group → scenario → cases`; every FUNCTION group starts with its main successful flow. `group.name` is the Module shown in Excel and Report; name it after the real Feature/Function from the source (e.g. `Authentication`, `User Management`, `Dashboard`), never `Module 1`, `General`, `Other` or `Miscellaneous`; keep every testcase for one Feature in the same Module; read [template-schema.md](references/template-schema.md)
5. Keep one scenario per field/behavior/AC; changing it changes Scenario ID and Name
6. Give each case stable `testcase_id`, valid `type`, matching `req`, `coverage_item_refs`, `bb_technique`, risk-based `priority` (`Critical`/`High`/`Medium`/`Low`/`N/A`, never the same value for every case) and execution data. `testcase_id` numbers continuously across the whole section regardless of Module/group; never restart at 1 when a new Module begins — the generator renumbers to close any gap it finds
7. New UI/FUNCTION cases use `execution_contract="required"`; read [execution-contract.md](references/execution-contract.md)
8. Add RBAC only when applicable; unresolved permission expectations remain `UNRESOLVED`
9. Run `python3 scripts/gen-testcases.py <input.json> <output.xlsx>`
10. Read Markdown, validate the requirement coverage matrix and manifest, compare IDs/count/content/design with Excel; J-N remain blank
11. Fix the JSON source and regenerate on mismatch
12. Review each case against the 9 quality criteria in [testcase-quality-review.md](references/testcase-quality-review.md); unresolved items go to the clarification list, never guessed

## Cross-model hard gates

- No trailing `.`
- No emoji/icons
- Always create `<output>.md` before `<output>.xlsx`
- Validate the `RBAC Matrix` with `references/rbac-matrix.schema.json` and its `allow_case_ref` links
- The generator fails closed for `review_required`, missing/uncovered source obligations, unknown requirements, mixed AC, invalid IDs/types/technique/contracts, invalid priority, invalid RBAC or secret placeholders
- API automation handoff preserves `manual_verification`, `risk_profile`, `stability_gate`, and typed `api.expected_side_effects[]`; prose-only `api.side_effect` is authoring context, not executable proof
- Testcase IDs stay sequential across the whole section; the generator closes any per-Module reset back to a continuous count, so never hand-assign IDs that restart at 1 per Module
- Excel column G (`Priority 2`) is always generator-filled from `case.priority`; column K (`Priority 1`) and J (`Results`, defaulting `Untested`) stay the tester's manual fields; never move or duplicate these roles

## Structure and fields

```text
1.1. USER INTERFACE / 1.2. FUNCTION
└── LOGIN
    ├── SCN-LOG-001 | Validation email
    └── SCN-LOG-002 | Validation password
```

Top level needs `execution_contract="required"`, project metadata, source document, atomic `requirements[].coverage_items` and `sections[]`. Scenarios need `SCN-*`, name and requirement. Cases need stable ID, type, matching req, `coverage_item_refs`, Vietnamese description, priority, `bb_technique` and `execution`

Use `EP`, `BVA`, `Decision Table`, `State Transition`, `Use Case Testing`, `Error Guessing` or `Pairwise`. Extended techniques: `Domain Testing`, `CRUD Testing`, `Scenario-Based Testing`, `Metamorphic Testing`, `Session-Based Testing`, `Checklist-Based Testing`, `Crowd Testing`, `Random Testing`, `Combinatorial Testing` (alias of `Pairwise`). `additional` uses `req=(out-of-spec)` and is not confirmed requirement coverage. Every non-empty FUNCTION group needs a `happy` case before validation/negative-only cases

## Token-efficient source design

- Read Markdown for human review and `.automation.json` for runtime/POM; do not recover execution logic from Excel
- Reuse genuinely identical flows with `execution_templates`, `execution_ref` and `execution_overrides`; different behavior/AC needs a new scenario
- Let scripts render all projections; do not ask the model to write Markdown/manifest/Excel separately
- Optional `case.ui_function_keys` maps deterministic UI cases to the Browser MCP inventory; legacy `case.coverage_refs` is only an alias for that inventory and is not requirement coverage

## Manual and automation contract

Every UI/FUNCTION procedure states environment, route/screen, business role, state, permission and named data; uses one action per numbered line with exact input and observable intermediate/final results. Keep click/focus separate from fill/clear, keep machine keys/selectors/HTTP syntax out of Excel F/H/I, and never store real passwords, tokens, cookies or API keys

## Gherkin/BDD mode

Trigger when the user explicitly requests "Feature file", "Given/When/Then", "Gherkin", or "Cucumber":
1. Generate `.feature` from the validated JSON source: `python scripts/gen-gherkin.py <input.json> <output.feature>`
2. Techniques with multiple tabular variations (`BVA`, `Pairwise`, `Decision Table`) map to `Scenario Outline` with an `Examples:` table
3. Single-flow techniques (`EP`, `State Transition`, `Use Case Testing`) map to discrete `Scenario:` blocks with `Given/When/Then`
4. Preserve stable `SCN-*` scenario IDs and `testcase_id` in comments and examples for automated test binding
5. Audit requirement coverage using `python scripts/coverage-report.py <input.json>`

## Conditional references

| Need | Read |
|---|---|
| Black-box intake protocol, context analysis & Q&A prompt | [blackbox-intake-protocol.md](references/blackbox-intake-protocol.md) |
| Source/document coverage and completeness | [coverage-contract.md](references/coverage-contract.md) |
| Requirement coverage CLI report | Run `python scripts/coverage-report.py <input.json>` |
| Gherkin/BDD feature generation | Run `python scripts/gen-gherkin.py <input.json> <output.feature>` |
| UI/FUNCTION contract/templates | [execution-contract.md](references/execution-contract.md) |
| Black-box techniques | [blackbox-techniques.md](references/blackbox-techniques.md) |
| Testcase quality review (9 criteria: correctness, feasibility, necessity, precision, understandability, completeness, traceability, consistency, conciseness) | [testcase-quality-review.md](references/testcase-quality-review.md) |
| UI display-only cases | [ui-testcases.md](references/ui-testcases.md) |
| Explicit API testcase writing | [api-testcases.md](references/api-testcases.md) |
| API source import | Run [scripts/import-api-spec.py](scripts/import-api-spec.py) first and stop while `review_required` is non-empty |
| RBAC/permissions | [rbac-matrix.schema.json](references/rbac-matrix.schema.json) |
| Workbook schema | [template-schema.md](references/template-schema.md) |
| Artifact read order | [markdown-testcases.md](references/markdown-testcases.md) |
| Plane requirements | [plane-integration.md](references/plane-integration.md) |

## Output invariants

Markdown → automation manifest → Excel share basename/date policy (`Asia/Ho_Chi_Minh`, `_DD-MM-YYYY` unless exact filename is requested). The source-to-test coverage matrix has no uncovered item; IDs, requirements, descriptions, execution content and counts match; scenario/testcase IDs remain stable; columns J-N remain blank; RBAC sheet exists with `N/A` when out of scope; content is Vietnamese with no trailing prose period or emoji/icon. Read back every artifact before handoff
