# Business analysis JSON contract

Use one JSON object as the hidden technical source for XMind, Q&A Markdown and Q&A Excel

All human-readable values such as scope, actor, module, flow, review note, question, risk and assumption must be Vietnamese. Keep machine enums, IDs, URLs, filenames, API fields and code unchanged

Store this file as `<project-output>/.static-testing/requirements-analysis/<project-name>_Analysis_Source.json` and do not present it as a user deliverable

## Required top-level fields

```json
{
  "project": "Project name",
  "scope": "Scope reviewed",
  "analysis_date": "2026-07-18",
  "source_markdown": ["docs/spec.md"],
  "executive_summary": "Short confirmed summary",
  "actors": [],
  "modules": [],
  "flow_links": [],
  "sanity_journeys": [],
  "cross_cutting": [],
  "review_coverage": [],
  "requirements": [],
  "questions": []
}
```

## Atomic requirement for browser traceability

Add `requirements` when a later browser run must map every UI item back to BRD, SRS or FRS content. Do not derive this list from vague prose during generation. Each row must be atomic, have a stable ID and keep the exact source reference

```json
{
  "id": "REQ-AUTH-001",
  "text": "Chỉ tài khoản đang hoạt động được đăng nhập",
  "source_ref": "account-portal.md#login",
  "page": "login",
  "actor": "Người dùng đã đăng ký",
  "expected_behavior": "Tài khoản đã vô hiệu không tạo phiên mới",
  "fact_status": "verified",
  "human_confirmed": false,
  "ui": {
    "labels": ["Đăng nhập"],
    "intents": ["SUBMIT"]
  },
  "expected": {
    "enabled": true,
    "api": "POST /login"
  },
  "source_refs": ["src/auth/login.service.ts"],
  "testcase_ids": []
}
```

Allowed `fact_status`: `verified`, `inferred`, `unresolved`. `human_confirmed` is true only when an authority supplied the answer. `ui` may contain `item_ids`, `labels`, `selectors`, `intents`, `categories`. A requirement without `ui` is valid and must appear as `REQ_ONLY` until a browser item is observed

The generator exports the exact list to `.static-testing/requirements-analysis/<project-name>_Requirements.json`. Pass that file to `dynamic-web-exploratory` with `--requirements`; XMind and Q&A remain the user-facing BA deliverables

## Fact status

Use one of:

- `verified` for a fact directly supported by a source reference
- `inferred` for a reasonable interpretation that still needs confirmation
- `unresolved` when the document does not define the behavior

## Actor

```json
{
  "name": "Administrator",
  "responsibilities": ["Manage users"],
  "permissions": ["Create user", "Disable user"],
  "status": "verified",
  "source_ref": "spec.md#roles"
}
```

## Module and flow

```json
{
  "name": "Authentication",
  "purpose": "Authenticate a registered user",
  "status": "verified",
  "source_ref": "spec.md#login",
  "flows": [
    {
      "id": "FLOW-001",
      "name": "Login with email and password",
      "actor": "Registered user",
      "status": "verified",
      "source_ref": "spec.md#login",
      "entry_state": "Chưa xác thực",
      "exit_state": "Đã xác thực",
      "preconditions": ["Account is active"],
      "trigger": "User submits login form",
      "steps": [
        {
          "id": "S1",
          "action": "Enter valid email and password",
          "system_response": "Validate credentials",
          "state_change": "No state change",
          "api_data": "POST /login",
          "source_ref": "spec.md#login"
        }
      ],
      "outcomes": ["Authenticated session is created"],
      "alternate_flows": [],
      "exceptions": [],
      "business_rules": [],
      "dependencies": [],
      "sanity_checks": [
        "Đăng nhập thành công với tài khoản hợp lệ",
        "Phiên được tạo và người dùng vào đúng trang"
      ],
      "unresolved": []
    }
  ]
}
```

## Flow link

Use explicit links to describe how one function hands state or data to another function. The renderer uses each link to create a visible relationship arrow in XMind

```json
{
  "from_flow": "FLOW-001",
  "to_flow": "FLOW-002",
  "label": "Tạo công việc tiếp theo",
  "condition": "FLOW-001 hoàn tất thành công",
  "data_handoff": "Trạng thái bản ghi và người nhận việc",
  "sanity_impact": "FLOW-002 nhận đúng dữ liệu và đúng người có thể tiếp tục"
}
```

Keep `label` short because it appears on the relationship arrow. For a document with one standalone flow, use an empty `flow_links` list

## Sanity journey

Create at least one tester-facing end-to-end path. The sequence must reference existing flow IDs

```json
{
  "id": "SANITY-001",
  "name": "Từ đăng nhập đến hoàn tất thao tác chính",
  "preconditions": [
    "Có tài khoản đang hoạt động",
    "Dữ liệu nền đã sẵn sàng"
  ],
  "flow_sequence": [
    {
      "flow_id": "FLOW-001",
      "transition_condition": "Đăng nhập thành công",
      "checkpoint": "Phiên được tạo và người dùng vào đúng trang"
    },
    {
      "flow_id": "FLOW-002",
      "transition_condition": "Có phiên hợp lệ",
      "checkpoint": "Thao tác chính lưu đúng trạng thái và dữ liệu"
    }
  ],
  "expected_results": [
    "Toàn bộ chuỗi hoàn tất không lỗi",
    "Dữ liệu cuối cùng nhất quán với các bước trước"
  ]
}
```

## Review coverage

Include all 18 exact area names from `SENIOR_REVIEW_CHECKLIST.md`

```json
{
  "area": "Scope and actors",
  "status": "checked",
  "notes": "Actors are listed but tenant boundary is unclear",
  "source_ref": "spec.md#scope",
  "question_ids": ["QA-001"]
}
```

Allowed status: `checked`, `blocked`, `not_applicable`

## Q&A item

```json
{
  "id": "QA-001",
  "category": "Roles and permissions",
  "module_flow": "Authentication / Disable user",
  "source_ref": "spec.md#roles",
  "ambiguity_gap": "Document does not define active session behavior after disable",
  "risk": "A disabled user may retain access",
  "question": "Should all active sessions be revoked immediately when the account is disabled?",
  "proposed_assumption": "Revoke all sessions immediately",
  "owner": "PO",
  "priority": "P0",
  "status": "Open",
  "answer": ""
}
```

Allowed priority: `P0`, `P1`, `P2`, `P3`

Allowed question status: `Open`, `Answered`, `Blocked`, `Cancelled`

If `id` is omitted, the renderer assigns `QA-001`, `QA-002` in list order. Do not reorder questions independently after generation

## Cross-cutting item

```json
{
  "name": "Audit trail",
  "details": ["Record actor and timestamp for user status changes"],
  "status": "unresolved",
  "source_ref": "Missing from source"
}
```

## Merge rule

When analysis already exists, read the JSON and previous Q&A first. Preserve stable flow IDs and Question IDs. Add new items at the end, update answered items in place and regenerate all three outputs
