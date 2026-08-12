# Shared Testcase Execution Contract

Use one structured testcase source for manual Excel/Markdown and unified deterministic Playwright BUILD_AND_RUN. `.automation.json` is the only lossless machine handoff; Excel F/G/H is its Vietnamese manual projection and must not be parsed when the matching manifest is available.

## Required shape

Set top-level `execution_contract="required"`. Every new UI/FUNCTION case has:

1. Stable explicit `testcase_id`, `type`, matching `req`, `bb_technique` and description
2. `execution.version=1` and boolean `mutates`
3. `entry`: environment, visible screen, route, business role, starting state, permissions and named test data
4. Ordered atomic `steps` with stable `S##`, `action`, Vietnamese `instruction` and semantic `target`
5. Target `key`, `kind`, human-facing `name`; add role/label/test-id hints only when verified or supplied
6. Exact `value` for `fill`, `select`, `press`, `upload`; `fill` and `clear` immediately follow a separate click/focus step for the same target. A structured `data_ref` may remain in the machine value, but the manual projection must render a safe sample value; keep exact fixture filenames unchanged
7. `wait_for` with machine kind plus Vietnamese text, or an observable step assertion
8. Non-empty final `outcome.assertions`
9. `cleanup` when `mutates=true`
10. `entry.role_key` and `entry.rbac_refs` for RBAC-linked cases

At group level, define the complete successful business flow as a `happy` case before validation, edge, negative or error coverage. Every non-empty FUNCTION group must have at least one `happy` case; the generator orders scenarios by their earliest case type so the first visible testcase under each function header is the happy path

Use [../examples/structured-input.json](../examples/structured-input.json) only when a full JSON example is needed. Do not load it for routine generation.

## Compact reuse

For genuinely identical flows, define a full execution object once:

```json
{
  "execution_templates": {
    "LOGIN_BASE": {
      "version": 1,
      "mutates": false,
      "entry": { "environment": "UAT", "screen": "Đăng nhập", "route": "/login", "role": "Nhân viên", "state": ["Chưa đăng nhập"], "permissions": ["Được đăng nhập"], "data": ["Login_Valid_01"] },
      "steps": [{ "id": "S01", "action": "navigate", "instruction": "Mở màn hình Đăng nhập", "target": { "key": "login_page", "kind": "page", "name": "Đăng nhập" }, "wait_for": { "kind": "url", "value": "/login", "text": "Chờ màn hình Đăng nhập hiển thị" } }],
      "outcome": { "assertions": [{ "kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị" }] }
    }
  },
  "sections": [{
    "groups": [{
      "scenarios": [{
        "cases": [{
          "testcase_id": "LOGIN-01",
          "execution_ref": "LOGIN_BASE",
          "execution_overrides": { "entry": { "role": "Quản lý" } }
        }]
      }]
    }]
  }]
}
```

- Do not combine `execution` and `execution_ref`
- `execution_overrides` requires a valid ref
- Dictionaries merge recursively; arrays replace the template array
- Different field, behavior or AC still requires a separate scenario and explicit override
- The CLI materializes templates before validation and artifact generation

## Manual projection

| Excel | Structured source | Projection |
|---|---|---|
| F Pre-condition | `entry` | Numbered environment, screen, route, role, state, permissions, data, setup |
| G Procedure | `steps[].instruction`, waits, cleanup | Numbered Vietnamese actions/waits without keys or selector syntax |
| H Expected | step and outcome assertions | Numbered observable checks without assertion syntax |

For every form field, write click/focus and input as separate manual lines. Keep exact visible target and value/data reference. Reject vague shortcuts and expected results.

When a value uses `data_ref`, keep the reference for deterministic data resolution but do not expose the machine key in Excel/Markdown Procedure or Pre-condition. Use a safe sample value for credentials and business data, and retain exact filenames for upload fixtures

## Consumer rules

The unified POM workflow selects testcase IDs from `.automation.json` and preserves identical `entry`, ordered steps, values, assertions and cleanup through build and runtime. It may not rewrite or infer the business flow from prose.

- run target-scoped `pom-plan` from `.automation.json`
- map each step to its required `<action><PascalTargetKey>` Page Object method
- map step/outcome assertions to the plan's allowed matcher
- use structured values/test-data fixtures and cleanup in `finally`/teardown
- resolve semantic targets from live DOM evidence; never guess XPath from prose
- execute the generated suite and require screenshot/video plus same-session trace for UI/functional PASS or FAILED
- return only `PASS`, `FAILED`, `N/A` or `UNTEST`; retry-pass remains FAILED/flaky

Use `dynamic-web-exploratory` separately only for exploratory/ad-hoc or ticket retest work that is not deterministic testcase/POM execution.

## Legacy compatibility

Existing text-only sources may use `execution_contract="legacy_text_only"`; Markdown marks them legacy. Sheet text parsing is fallback compatibility only when no manifest exists. Normalize legacy cases before deterministic execution or automation. Never use legacy mode for a new UI/FUNCTION source.
