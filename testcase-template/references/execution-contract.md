# Shared Testcase Execution Contract

This contract connects one testcase source to two consumers:

- `qa-run` executes the business flow and verifies each transition
- `playwright-pom-automation` turns the same flow into deterministic Page Object actions and assertions

The Excel template stays unchanged. `execution` is a structured field in the JSON source and the generated Markdown companion. The generator renders it into the existing F/G/H columns so a manual tester can still execute the row immediately

## Required contract

Every new UI or functional testcase intended for execution or automation should contain:

1. `execution.entry`: route, role, starting state, permissions and test data
2. `execution.steps`: ordered atomic actions, each with a stable step ID such as `S01`
3. A semantic `target` for every UI action: `key`, `kind`, and human-facing `name`; add `role`, `label`, `placeholder` or `test_id` only when known from requirements or a real UI observation
4. `instruction`: the Vietnamese manual instruction for the step
5. `wait_for` or at least one step assertion so the executor knows when the transition is complete
6. `execution.outcome.assertions`: the final business result, not only “system works correctly”
7. `execution.cleanup` when the testcase creates or changes data

Do not put a guessed XPath into a testcase. A testcase describes the target semantically. A POM agent obtains the final locator from the runtime DOM and records the evidence separately

## JSON shape

```json
{
  "type": "happy",
  "req": "AC1",
  "description": "Xác minh rằng người dùng có thể đăng nhập thành công với tài khoản hợp lệ",
  "pre_condition": "Tài khoản kiểm thử hợp lệ đã sẵn sàng",
  "execution": {
    "version": 1,
    "mutates": false,
    "entry": {
      "route": "/login",
      "role": "Guest",
      "state": "Chưa đăng nhập",
      "data": {
        "email": "<valid_email>",
        "password": "<valid_password>"
      }
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
        "wait_for": { "kind": "url", "value": "/login" },
        "assertions": [
          { "kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị" }
        ]
      },
      {
        "id": "S02",
        "action": "fill",
        "instruction": "Tại ô Email, nhập <valid_email>",
        "target": {
          "key": "email_input",
          "kind": "field",
          "name": "Email",
          "role": "textbox",
          "label": "Email"
        },
        "value": "<valid_email>",
        "wait_for": { "kind": "value", "value": "<valid_email>" },
        "assertions": [
          { "kind": "value", "target": "email_input", "value": "<valid_email>", "text": "Ô Email hiển thị đúng giá trị đã nhập" }
        ]
      },
      {
        "id": "S03",
        "action": "fill",
        "instruction": "Tại ô Mật khẩu, nhập <valid_password>",
        "target": {
          "key": "password_input",
          "kind": "field",
          "name": "Mật khẩu",
          "role": "textbox",
          "label": "Mật khẩu"
        },
        "value": "<valid_password>",
        "wait_for": { "kind": "value", "value": "<valid_password>" },
        "assertions": [
          { "kind": "value", "target": "password_input", "value": "<valid_password>", "text": "Ô Mật khẩu đã nhận giá trị kiểm thử" }
        ]
      },
      {
        "id": "S04",
        "action": "click",
        "instruction": "Nhấp nút Đăng nhập",
        "target": {
          "key": "login_submit",
          "kind": "button",
          "name": "Đăng nhập",
          "role": "button"
        },
        "wait_for": { "kind": "url", "value": "/dashboard" },
        "assertions": [
          { "kind": "state", "target": "session", "value": "authenticated", "text": "Phiên đăng nhập được tạo" }
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
| F — Pre-condition | `entry` | Include route, role, state, permissions and data needed before `S01` |
| G — Procedure | `steps[].instruction`, `steps[].wait_for`, `cleanup` | Preserve order and stable step IDs; one atomic action per line |
| H — Expected Results | `steps[].assertions`, `outcome.assertions` | Keep step-level checks and final business outcome separate |

The Markdown companion additionally contains a Step Contract table with target keys and semantic hints. Excel remains the execution/write-back artifact; Markdown is the AI-readable design artifact

## Rules for `qa-run`

- Read the `execution` contract before interpreting the prose fallback in F/G/H
- Execute `S01`, `S02`, ... in order and verify the assertion attached to that step before moving on
- Treat route, role, starting state, test data and cleanup as part of the test contract
- If a step target, required data, role, transition or expected result is unresolved, mark the testcase `Untest` or `BLOCKED` with the exact missing field; do not invent a route or result
- After critical transitions, correlate the visible assertion with same-session network, console and page-error evidence when the run contract requires browser observability
- For legacy text-only rows, first normalize them into this contract during discovery; do not silently treat a successful click as a passed testcase

## Rules for POM automation

- Map every `target.key` to one Page Object locator and every `S##` to one action method or spec step
- Map `steps[].assertions` to intermediate assertions and `outcome.assertions` to final assertions
- Use `entry.data` and the project test-data fixture, never credentials hardcoded in a Page Object
- Use `cleanup` in `finally` or fixture teardown for mutating flows
- A semantic target is not a selector proof. Resolve and verify the locator in the target environment before committing code

## Legacy compatibility

The generator still accepts existing cases that only have `pre_condition`, `procedure` and `expected`. It marks them as `Legacy text-only` in Markdown so they remain readable. Before writing deterministic automation, convert those rows to `execution` or explicitly record why the case is not automatable
