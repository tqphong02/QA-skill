# Shared Testcase Execution Contract

This contract connects one testcase source to two consumers:

- `qa-run` executes the business flow and verifies each transition
- `playwright-pom-automation` turns the same flow into deterministic Page Object actions and assertions

The Excel template stays unchanged. `execution` is a structured field in the JSON source. The generator creates three synchronized artifacts from it:

- Excel F/G/H and the main Markdown fields use numbered, natural Vietnamese for manual execution
- The Markdown Execution Contract table keeps `S##`, `action`, `target.key`, structured values, waits and assertions for qa-run/POM
- The `.automation.json` companion preserves the complete lossless object, stable Testcase ID, assertion targets, outcome, cleanup and RBAC metadata for deterministic POM planning/audit

Do not expose raw JSON, selector keys, assertion syntax, XPath or CSS in Excel F/G/H

## Required contract

Every new UI or functional testcase intended for execution or automation should contain a stable explicit `testcase_id` and:

1. `execution.entry`: environment, visible starting screen, route, business role, starting state, permissions and named test data
2. `execution.steps`: ordered atomic actions, each with a stable step ID such as `S01`; for form fields, keep the focus/click step separate from the data-entry step
3. A semantic `target` for every UI action: `key`, `kind`, and human-facing `name`; add `role`, `label`, `placeholder` or `test_id` only when known from requirements or a real UI observation
4. `instruction`: the Vietnamese manual instruction for the step
5. `wait_for` with a machine `kind` and Vietnamese `text`, or at least one step assertion so the executor knows when the transition is complete
6. `execution.outcome.assertions`: the final business result, not only “system works correctly”
7. `execution.cleanup` when the testcase creates or changes data
8. `fill`, `select`, `press` and `upload` contain an exact `value` or named test-data reference; every `fill` and `clear` has a separate click/focus step for the same target immediately before it
9. For an RBAC-linked testcase, `execution.entry.role_key` resolves the business role and `execution.entry.rbac_refs` lists the rules covered by the testcase; the top-level matrix is defined by [rbac-matrix.schema.json](rbac-matrix.schema.json)

Do not put a guessed XPath into a testcase. A testcase describes the target semantically. A POM agent obtains the final locator from the runtime DOM and records the evidence separately

## JSON shape

Set `"execution_contract": "required"` once at the input root. The following object is one case inside the normal `sections[].groups[].scenarios[].cases[]` hierarchy

```json
{
  "type": "happy",
  "req": "AC1",
  "description": "Xác minh rằng người dùng có thể đăng nhập thành công với tài khoản hợp lệ",
  "execution": {
    "version": 1,
    "mutates": false,
    "entry": {
      "environment": "UAT tại <BASE_URL>",
      "screen": "Đăng nhập",
      "route": "<BASE_URL>/login",
      "role": "Nhân viên",
      "state": [
        "Tài khoản kiểm thử đang hoạt động",
        "Trình duyệt chưa có phiên đăng nhập"
      ],
      "permissions": ["Được phép sử dụng chức năng Đăng nhập"],
      "data": [
        { "name": "Email", "value": "qa.login@example.com", "condition": "Thuộc tài khoản đang hoạt động" },
        { "name": "Mật khẩu", "value": "Bộ dữ liệu Login_Valid_01", "condition": "Lấy từ kho dữ liệu kiểm thử bảo mật" }
      ]
    },
    "steps": [
      {
        "id": "S01",
        "action": "navigate",
        "instruction": "Mở trình duyệt và truy cập trang đăng nhập: <BASE_URL>/login",
        "target": {
          "key": "login_page",
          "kind": "page",
          "name": "Trang đăng nhập",
          "route": "/login"
        },
        "wait_for": { "kind": "url", "value": "/login", "text": "Chờ màn hình Đăng nhập hiển thị đầy đủ" },
        "assertions": [
          { "kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị" }
        ]
      },
      {
        "id": "S02",
        "action": "click",
        "instruction": "Nhấp vào ô Email",
        "target": {
          "key": "email_input",
          "kind": "field",
          "name": "Email",
          "role": "textbox",
          "label": "Email"
        },
        "wait_for": { "kind": "visible", "target": "email_input", "text": "Chờ ô Email sẵn sàng để nhập dữ liệu" },
        "assertions": [
          { "kind": "state", "target": "email_input", "value": "focused", "text": "Con trỏ nhập liệu đặt tại ô Email" }
        ]
      },
      {
        "id": "S03",
        "action": "fill",
        "instruction": "Tại ô Email, nhập giá trị qa.login@example.com",
        "target": {
          "key": "email_input",
          "kind": "field",
          "name": "Email",
          "role": "textbox",
          "label": "Email"
        },
        "value": "qa.login@example.com",
        "wait_for": { "kind": "value", "value": "qa.login@example.com", "text": "Kiểm tra ô Email hiển thị đúng giá trị qa.login@example.com" },
        "assertions": [
          { "kind": "value", "target": "email_input", "value": "qa.login@example.com", "text": "Ô Email hiển thị đúng giá trị qa.login@example.com" }
        ]
      },
      {
        "id": "S04",
        "action": "click",
        "instruction": "Nhấp vào ô Mật khẩu",
        "target": {
          "key": "password_input",
          "kind": "field",
          "name": "Mật khẩu",
          "role": "textbox",
          "label": "Mật khẩu"
        },
        "wait_for": { "kind": "visible", "target": "password_input", "text": "Chờ ô Mật khẩu sẵn sàng để nhập dữ liệu" },
        "assertions": [
          { "kind": "state", "target": "password_input", "value": "focused", "text": "Con trỏ nhập liệu đặt tại ô Mật khẩu" }
        ]
      },
      {
        "id": "S05",
        "action": "fill",
        "instruction": "Tại ô Mật khẩu, nhập giá trị trong bộ dữ liệu Login_Valid_01",
        "target": {
          "key": "password_input",
          "kind": "field",
          "name": "Mật khẩu",
          "role": "textbox",
          "label": "Mật khẩu"
        },
        "value": { "data_ref": "Login_Valid_01", "field": "Mật khẩu" },
        "wait_for": { "kind": "value", "value": "<masked_password>", "text": "Kiểm tra ô Mật khẩu đã nhận dữ liệu và đang che nội dung" },
        "assertions": [
          { "kind": "state", "target": "password_input", "value": "masked", "text": "Ô Mật khẩu đã nhận dữ liệu và đang che nội dung" }
        ]
      },
      {
        "id": "S06",
        "action": "click",
        "instruction": "Nhấp nút Đăng nhập",
        "target": {
          "key": "login_submit",
          "kind": "button",
          "name": "Đăng nhập",
          "role": "button"
        },
        "wait_for": { "kind": "url", "value": "/dashboard", "text": "Chờ hệ thống hoàn tất đăng nhập và chuyển trang" },
        "assertions": [
          { "kind": "state", "target": "session", "value": "authenticated", "text": "Người dùng đăng nhập thành công" }
        ]
      }
    ],
    "outcome": {
      "state": "Đã đăng nhập",
      "route": "/dashboard",
      "assertions": [
        { "kind": "url", "value": "/dashboard", "text": "Trang chuyển đến Dashboard" },
        { "kind": "visible", "target": "dashboard_heading", "text": "Tiêu đề Dashboard hiển thị" }
      ]
    },
    "cleanup": "Đăng xuất và đóng phiên kiểm thử nếu môi trường yêu cầu"
  }
}
```

## How the generated columns are derived

| Existing column | Source in `execution` | Rule |
|---|---|---|
| F — Pre-condition | `entry` | Numbered environment, screen, route, role, state, permissions, data and applicable setup |
| G — Procedure | `steps[].instruction`, `steps[].wait_for.text`, `cleanup` | Numbered Vietnamese actions/waits without `S##`, target keys or machine syntax |
| H — Expected Results | `steps[].assertions`, `outcome.assertions` | Numbered observable checks without assertion syntax or `[OUTCOME]` labels |

The Markdown companion additionally contains a readable technical Step Contract table. Excel remains the manual execution/write-back artifact; Markdown is the AI-readable companion; `.automation.json` is the lossless POM machine handoff and must be used when outcome targets, wait details or RBAC metadata are required

## Rules for `qa-run`

- Read the `execution` contract before interpreting the prose fallback in F/G/H
- Execute `S01`, `S02`, ... in order and verify the assertion attached to that step before moving on
- Treat environment, screen, route, role, starting state, permissions, test data and cleanup as part of the test contract
- If a step target, required data, role, transition or expected result is unresolved, mark the testcase `Untest` or `BLOCKED` with the exact missing field; do not invent a route or result
- After critical transitions, correlate the visible assertion with same-session network, console and page-error evidence when the run contract requires browser observability
- For legacy text-only rows, first normalize them into this contract during discovery; do not silently treat a successful click as a passed testcase

## Rules for POM automation

- Map every `target.key` to one Page Object locator and every `S##` to one action method or spec step
- Run `pom-plan` from the generated `.automation.json` and retain its manifest hash plus required behavior/RBAC markers in the spec
- Read exact action values from the technical Step Contract; never infer them from shortened Excel prose
- Map `steps[].assertions` to intermediate assertions and `outcome.assertions` to final assertions
- Use `entry.data` and the project test-data fixture, never credentials hardcoded in a Page Object
- Use `cleanup` in `finally` or fixture teardown for mutating flows
- A semantic target is not a selector proof. Resolve and verify the locator in the target environment before committing code

## Legacy compatibility

Set top-level `execution_contract` to `required` for every new UI/FUNCTION source. The generator then rejects a case without `execution`

Existing sources that only have `pre_condition`, `procedure` and `expected` remain readable with top-level `execution_contract: legacy_text_only` or the compatibility default when that field is absent. The Markdown marks them `Legacy text-only`. Before deterministic automation, convert those rows to `execution` or explicitly record why the case is not automatable
