# UI Function Coverage Discovery

POM traceability only proves that generated code covers the testcase manifest. It cannot detect a button, tab, menu, dialog, form state or route that was never added to that manifest. This reference defines the Browser MCP inventory required for complete UI coverage

## Coverage contract

Create one `UI_FUNCTION_INVENTORY` for the current `app_build`, role and reachable state before BUILD. The inventory is a route/state/function map, not a selector dump

Each function record must include:

```json
{
  "function_key": "REPORT_EXPORT_CSV",
  "name": "Xuất báo cáo CSV",
  "route": "/reports",
  "state": "report_ready",
  "role_key": "manager",
  "kind": "button",
  "target_keys": ["export_csv"],
  "actions": ["click"],
  "coverage_required": true
}
```

The top-level artifact must include `schema_version: 1`, `artifact: "UI_FUNCTION_INVENTORY"`, `provider`, `browser_driver`, `browser_observer`, `tools_used`, `run_id`, `mcp.session_id`, `captured_at` and `app_build`. Use the same Browser MCP session for navigation, snapshot, DOM evaluation and inventory capture

## Browser MCP discovery loop

For every allowed route and role/state:

1. Navigate with `browser_navigate` and wait for the declared ready signal
2. Read `browser_snapshot` to enumerate visible navigation, tabs, menus, forms, buttons, links, selects, uploads, table row actions, dialogs, pagination and feedback regions
3. Use `browser_evaluate` to enumerate stable semantic targets and state transitions. Include hidden/disabled/error/empty/loading variants when the UI exposes them
4. Record one function per meaningful target/action. Use a stable `function_key` based on route, state and semantic intent; never use generated CSS classes or DOM position
5. Follow safe in-scope navigation to reachable child routes and repeat the loop. Stop at the allowed domain/route boundary and record the exact boundary
6. Export the inventory with the same `run_id`, `mcp.session_id` and current `app_build` used for selector evidence

Do not infer a function from source code, a screenshot or a testcase description. If a route/state cannot be reached, record it as `coverage_required: false` with an explicit `exemption_reason`; do not silently omit it

## Map inventory to testcase/POM

Prefer explicit references in the automation manifest:

```json
{
  "testcase_id": "REPORT-EXPORT-01",
  "ui_function_keys": ["REPORT_EXPORT_CSV"]
}
```

The parser also accepts `coverage_refs`, `execution.ui_function_keys` and `execution.coverage_refs`. When explicit references are absent, the gate may infer a mapping from matching `target_key`, action, route and role, but the report marks it as `coverage_mode: "inferred"`. Use `--require-explicit-ui-coverage` for a release or full-project completion gate

An inventory function with no mapped testcase is `UI_FUNCTION_UNCOVERED`. A testcase target that is absent from the inventory is `UI_TARGET_NOT_IN_INVENTORY`. Duplicate or ambiguous mappings are blocked. A selected testcase/group slice is labelled `scope: "selected"`; only a no-filter run can claim `scope: "full"`

## Gate commands

Run this before selector promotion and before browser execution:

```bash
node scripts/verify-ui-coverage.mjs \
  --manifest testcases/<feature>.automation.json \
  --inventory selector-evidence/<feature>.ui-function-inventory.json \
  --app-build "$QA_APP_BUILD" \
  --require-explicit \
  --output reports/ui-function-coverage.json
```

Pass the same inventory to the unified POM workflow:

```bash
node scripts/run-testcase-pom.mjs \
  --phase plan \
  --mode ui \
  --manifest testcases/<feature>.automation.json \
  --ui-inventory selector-evidence/<feature>.ui-function-inventory.json \
  --require-ui-coverage \
  --require-explicit-ui-coverage \
  --plan-output reports/testcase-pom-plan.json
```

For the full-project claim, omit `--group` and `--testcase-id`. A missing, stale, cross-session or incomplete inventory is a pre-execution `BLOCKED`/`UNTEST` result, never a clean POM `PASS`
