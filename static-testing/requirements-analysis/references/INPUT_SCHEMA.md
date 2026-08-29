# Business analysis JSON contract

Use one JSON object as the hidden technical source for XMind, Q&A Markdown and Q&A Excel

All human-readable values such as scope, actor, module, flow, review note, question, risk and assumption must be Vietnamese. Keep machine enums, IDs, URLs, filenames, API fields and code unchanged

Store this file as `<project-output>/.static-testing/requirements-analysis/<project-name>_Analysis_Source.json` and do not present it as a user deliverable

## Closed-world source boundary

`source_markdown` is the complete authority set for the run. Each entry must be a readable local Markdown file. The generator hashes this set and stores its semantic keys in an internal state file

Do not copy prior generated prose into `source_markdown`. If a BA, PO, Dev or Architect answer becomes authoritative, save it as a dated Markdown decision record and add that file to the source set

Every flow and atomic requirement must include:

- A stable semantic ID/key reused across runs
- `source_ref` pointing to one of the supplied Markdown filenames plus a heading or requirement ID
- `source_excerpt` containing an exact, short excerpt from that Markdown file that proves the behavior exists

The renderer rejects a missing source, changed source, unsupported excerpt, duplicate semantic key or new semantic key on an unchanged source snapshot

## Required top-level fields

```json
{
  "schema_version": "2.0",
  "project": "Project name",
  "scope": "Scope reviewed",
  "analysis_date": "2026-08-29",
  "source_markdown": ["docs/spec.md"],
  "executive_summary": "Short source-grounded summary",
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

`questions` may be empty. `modules` and `sanity_journeys` may be empty only when the source genuinely contains no process/capability to map; explain that boundary in `executive_summary`

## Fact status

Use one of:

- `verified` for a fact directly supported by `source_ref` and `source_excerpt`
- `inferred` only for the minimum connective interpretation required to join sourced steps; keep the supporting source evidence
- `unresolved` when an in-scope behavior is material but the source does not decide it

Do not use `inferred` to add common industry behavior or checklist-driven controls

## Actor

```json
{
  "name": "Quản trị viên",
  "responsibilities": ["Quản lý trạng thái tài khoản"],
  "permissions": ["Vô hiệu tài khoản"],
  "status": "verified",
  "source_ref": "account-portal.md#roles"
}
```

## Module and flow

`semantic_key` identifies the same business capability across reruns and wording changes. Do not derive it from list position

```json
{
  "name": "Xác thực",
  "purpose": "Xác thực người dùng đã đăng ký",
  "status": "verified",
  "source_ref": "account-portal.md#login",
  "flows": [
    {
      "id": "FLOW-001",
      "semantic_key": "auth.login",
      "name": "Đăng nhập bằng email và mật khẩu",
      "actor": "Người dùng đã đăng ký",
      "status": "verified",
      "source_ref": "account-portal.md#login",
      "source_excerpt": "Người dùng có tài khoản đang hoạt động có thể đăng nhập bằng email và mật khẩu",
      "entry_state": "Chưa xác thực",
      "exit_state": "Đã xác thực",
      "preconditions": ["Tài khoản đang hoạt động"],
      "trigger": "Người dùng gửi biểu mẫu đăng nhập",
      "steps": [
        {
          "id": "S1",
          "action": "Nhập email và mật khẩu",
          "system_response": "Kiểm tra thông tin đăng nhập",
          "state_change": "Tạo phiên đã xác thực",
          "api_data": "",
          "source_ref": "account-portal.md#login"
        }
      ],
      "outcomes": ["Người dùng được xác thực"],
      "alternate_flows": [],
      "exceptions": [],
      "business_rules": [],
      "dependencies": [],
      "sanity_checks": ["Phiên được tạo cho tài khoản hợp lệ"],
      "unresolved": []
    }
  ]
}
```

Do not add an alternate flow, exception, dependency, API, audit event or UI state unless it is sourced or explicitly marked as a necessary connective inference

## Flow link

Use a link only when a source describes a handoff/dependency or the link is the minimum connective inference between two sourced flows

```json
{
  "from_flow": "FLOW-001",
  "to_flow": "FLOW-002",
  "label": "Chuyển trạng thái tài khoản",
  "condition": "FLOW-001 hoàn tất thành công",
  "data_handoff": "ID và trạng thái tài khoản",
  "sanity_impact": "FLOW-002 nhận đúng trạng thái",
  "status": "inferred",
  "source_ref": "account-portal.md#account-status"
}
```

For a document with one standalone flow, use an empty `flow_links` list

## Sanity journey

The journey references existing flows and cannot introduce new business behavior

```json
{
  "id": "SANITY-001",
  "name": "Đăng nhập vào cổng tài khoản",
  "preconditions": ["Có tài khoản đang hoạt động"],
  "flow_sequence": [
    {
      "flow_id": "FLOW-001",
      "transition_condition": "Người dùng gửi thông tin hợp lệ",
      "checkpoint": "Phiên được tạo"
    }
  ],
  "expected_results": ["Người dùng được xác thực"]
}
```

## Atomic requirement for browser traceability

Add `requirements` when a later browser run must map UI items back to BRD, SRS or FRS content. Each row must be atomic and source-grounded

```json
{
  "id": "REQ-AUTH-001",
  "text": "Chỉ tài khoản đang hoạt động được đăng nhập",
  "source_ref": "account-portal.md#login",
  "source_excerpt": "Chỉ tài khoản ở trạng thái Hoạt động được phép đăng nhập",
  "page": "login",
  "actor": "Người dùng đã đăng ký",
  "expected_behavior": "Tài khoản đã vô hiệu không tạo phiên mới",
  "fact_status": "verified",
  "human_confirmed": false,
  "ui": {"labels": ["Đăng nhập"], "intents": ["SUBMIT"]},
  "expected": {"enabled": true},
  "source_refs": [],
  "testcase_ids": []
}
```

Allowed `fact_status`: `verified`, `inferred`, `unresolved`. `human_confirmed` is true only when an authority-supplied decision record exists in `source_markdown`

The generator exports the exact list to `.static-testing/requirements-analysis/<project-name>_Requirements.json`

## Review coverage

Include all 18 exact area names from `SENIOR_REVIEW_CHECKLIST.md`

```json
{
  "area": "Concurrency and idempotency",
  "status": "not_applicable",
  "notes": "Tài liệu và phạm vi không nêu thao tác có nguy cơ xử lý lặp hoặc cập nhật đồng thời",
  "source_ref": "account-portal.md#scope",
  "question_ids": []
}
```

Allowed status: `checked`, `blocked`, `not_applicable`

- `checked`: the supplied source sufficiently covers the area for the in-scope behavior
- `blocked`: one material decision prevents implementation/testing and `question_ids` references its existing Q&A item
- `not_applicable`: the area is outside the stated scope or source boundary; it creates no question

## Q&A item

`decision_key` is the stable identity of one material unresolved decision. Reuse it and its Question ID on every run

```json
{
  "id": "QA-001",
  "decision_key": "account.disable.active-session-policy",
  "basis": "missing_required_rule",
  "impact_ids": ["FLOW-002", "REQ-AUTH-001"],
  "category": "Trạng thái và bảo mật",
  "module_flow": "Quản trị / Vô hiệu tài khoản",
  "source_ref": "account-portal.md#disable-account",
  "source_excerpt": "Quản trị viên có thể vô hiệu tài khoản đang hoạt động",
  "ambiguity_gap": "Tài liệu không quyết định hành vi của phiên đang hoạt động sau khi vô hiệu",
  "risk": "Trạng thái truy cập sau khi vô hiệu không có kết quả kiểm thử xác định",
  "question": "Các phiên đang hoạt động có bị thu hồi ngay khi tài khoản bị vô hiệu không",
  "proposed_assumption": "Thu hồi ngay toàn bộ phiên đang hoạt động",
  "owner": "PO",
  "priority": "P0",
  "status": "Open",
  "answer": ""
}
```

Allowed `basis`: `ambiguous_text`, `contradiction`, `missing_required_rule`, `untestable_acceptance`, `unclear_ownership`

Allowed priority: `P0`, `P1`, `P2`, `P3`

Allowed question status: `Open`, `Answered`, `Blocked`, `Cancelled`

Question admission requires all of:

- One existing impacted flow/requirement ID
- One exact source excerpt that establishes the parent behavior
- A material decision whose alternatives change an observable result
- One direct question to one accountable owner
- No existing question with the same root `decision_key`

Do not ask about generic best practices, optional hardening or a checklist area that the source does not place in scope

## Cross-cutting item

```json
{
  "name": "Nhật ký kiểm toán",
  "details": ["Lưu người thao tác và thời điểm thay đổi trạng thái"],
  "status": "verified",
  "source_ref": "account-portal.md#audit"
}
```

## Reconcile rule

When analysis already exists, rebuild the semantic set from the current source snapshot and reconcile it with the internal state

- Match flows by `semantic_key` and questions by `decision_key`
- Preserve the existing flow/Question ID for a matching key
- Update records in place; never append a reformulation of the same decision
- Remove unsupported inferred logic
- Mark obsolete answered/history questions `Cancelled` when retaining their audit trail is useful; they are not active Q&A
- With an unchanged source snapshot, the active semantic set may stay the same or shrink but cannot grow
- With a changed source snapshot, add only keys whose `source_excerpt` is present in the changed authority set

The generator derives the terminal result: `DONE` when no `Open`/`Blocked` questions remain, otherwise `DONE_WITH_OPEN_QA`. Generation failure is `BLOCKED`
