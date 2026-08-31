# Business analysis JSON contract

Use one normalized JSON object as the hidden technical source for XMind, Q&A Markdown, Q&A Excel, UI requirement export and optional API contract handoff

All human-readable values must be Vietnamese. Preserve machine enums, stable IDs, URLs, filenames, API fields, methods, paths and code

Store the source as `<project-output>/.static-testing/requirements-analysis/<project-name>_Analysis_Source.json`

## Closed-world evidence

`source_markdown` is the complete authority set. Every semantic entity must have a stable ID/key, a logical `source_ref` and an exact short `source_excerpt` from that Markdown source

Allowed `fact_status` values:

- `verified`: directly supported by the referenced excerpt
- `inferred`: minimum connective interpretation needed to join sourced behavior
- `unresolved`: material in-scope behavior is not decided

Do not use `inferred` to add generic best practices or checklist-driven controls

## Required top-level fields

```json
{
  "schema_version": "4.0",
  "project": "Project name",
  "scope": "Scope reviewed",
  "analysis_date": "2026-08-30",
  "source_markdown": ["docs/spec.md"],
  "executive_summary": "Short source-grounded summary",
  "actors": [],
  "business_goals": [],
  "modules": [],
  "flow_links": [],
  "sanity_journeys": [],
  "requirements": [],
  "business_rules": [],
  "validation_rules": [],
  "dependencies": [],
  "risks": [],
  "api_operations": [],
  "cross_cutting": [],
  "review_coverage": [],
  "questions": []
}
```

Empty arrays are valid when the source contains no corresponding information. `modules` and `sanity_journeys` may both be empty only when no process or capability can be mapped

## Common semantic entity

All records in `business_goals`, `requirements`, `business_rules`, `validation_rules`, `dependencies`, `risks`, `api_operations` and all flows use:

```json
{
  "id": "TYPE-001",
  "semantic_key": "stable.domain.identity",
  "fact_status": "verified",
  "source_ref": "requirements.md#logical-heading",
  "source_excerpt": "Exact short excerpt from the source"
}
```

## Business goal

```json
{
  "id": "BG-001",
  "semantic_key": "account.secure-access",
  "statement": "Cho phép người dùng hợp lệ truy cập cổng tài khoản",
  "success_metrics": ["Tài khoản hoạt động đăng nhập được"],
  "fact_status": "verified",
  "source_ref": "account-portal.md#mục-tiêu",
  "source_excerpt": "Cổng tài khoản cho phép người dùng hợp lệ đăng nhập"
}
```

## Atomic requirement

`requirement_type` is `functional` or `non_functional`. `goal_ids`, `flow_ids` and `api_operation_ids` reference existing IDs

```json
{
  "id": "REQ-AUTH-001",
  "semantic_key": "requirement.auth.active-account-login",
  "goal_ids": ["BG-001"],
  "flow_ids": ["FLOW-001"],
  "api_operation_ids": ["API-AUTH-001"],
  "text": "Chỉ tài khoản Hoạt động được đăng nhập",
  "requirement_type": "functional",
  "expected_behavior": "Tài khoản Đã vô hiệu không tạo phiên mới",
  "acceptance_criteria": ["Tài khoản Hoạt động tạo phiên khi thông tin hợp lệ"],
  "page": "login",
  "actor": "Người dùng đã đăng ký",
  "human_confirmed": false,
  "ui": {"labels": ["Đăng nhập"], "intents": ["SUBMIT"]},
  "expected": {"enabled": true, "api": "POST /login"},
  "source_refs": [],
  "testcase_ids": [],
  "fact_status": "verified",
  "source_ref": "account-portal.md#đăng-nhập",
  "source_excerpt": "Chỉ tài khoản ở trạng thái Hoạt động được phép đăng nhập"
}
```

## Business rule

```json
{
  "id": "BR-AUTH-001",
  "semantic_key": "rule.auth.active-account-only",
  "requirement_ids": ["REQ-AUTH-001"],
  "statement": "Chỉ tài khoản Hoạt động được phép đăng nhập",
  "condition": "Trạng thái tài khoản là Hoạt động",
  "precedence": "Áp dụng trước khi tạo phiên",
  "fact_status": "verified",
  "source_ref": "account-portal.md#đăng-nhập",
  "source_excerpt": "Chỉ tài khoản ở trạng thái Hoạt động được phép đăng nhập"
}
```

## Validation rule

```json
{
  "id": "VR-AUTH-001",
  "semantic_key": "validation.auth.credentials-required",
  "requirement_ids": ["REQ-AUTH-001"],
  "field": "email, password",
  "condition": "Bắt buộc và phải khớp thông tin tài khoản",
  "boundary": "Không được để trống",
  "expected_error": "Trả lỗi xác thực và không tạo phiên",
  "fact_status": "verified",
  "source_ref": "account-portal.md#đăng-nhập",
  "source_excerpt": "Thông tin không hợp lệ trả lỗi xác thực và không tạo phiên"
}
```

## Dependency

```json
{
  "id": "DEP-AUTH-001",
  "semantic_key": "dependency.auth.account-status",
  "impacted_ids": ["REQ-AUTH-001", "FLOW-001"],
  "dependency_type": "data",
  "target": "Trạng thái tài khoản",
  "condition": "Dữ liệu trạng thái phải đọc được trước khi tạo phiên",
  "fallback": "Chưa được tài liệu mô tả",
  "fact_status": "verified",
  "source_ref": "account-portal.md#đăng-nhập",
  "source_excerpt": "Chỉ tài khoản ở trạng thái Hoạt động được phép đăng nhập"
}
```

Allowed `dependency_type`: `internal`, `api`, `data`, `external`, `configuration`

## Risk

Risks must be source-stated or tied to an actual unresolved decision. Do not generate a generic risk register from the checklist

```json
{
  "id": "RISK-AUTH-001",
  "semantic_key": "risk.auth.active-session-undecided",
  "impacted_ids": ["FLOW-002", "REQ-AUTH-001"],
  "risk_type": "analysis_gap",
  "statement": "Không có expected result xác định cho phiên đang hoạt động sau khi vô hiệu",
  "likelihood": "unknown",
  "impact": "high",
  "fact_status": "unresolved",
  "source_ref": "account-portal.md#vô-hiệu-tài-khoản",
  "source_excerpt": "Quản trị viên có thể vô hiệu tài khoản đang hoạt động"
}
```

Allowed `risk_type`: `source_stated`, `analysis_gap`. Allowed likelihood/impact: `unknown`, `low`, `medium`, `high`

## Module and flow

Flow list fields `requirement_ids`, `business_rule_ids`, `validation_rule_ids`, `dependency_ids` and `api_operation_ids` reference the normalized registries. Do not duplicate rule prose inside a flow

```json
{
  "name": "Tài khoản",
  "purpose": "Đăng nhập và quản lý trạng thái tài khoản",
  "status": "verified",
  "source_ref": "account-portal.md#phạm-vi",
  "flows": [{
    "id": "FLOW-001",
    "semantic_key": "account.login",
    "name": "Đăng nhập bằng email và mật khẩu",
    "actor": "Người dùng đã đăng ký",
    "status": "verified",
    "source_ref": "account-portal.md#đăng-nhập",
    "source_excerpt": "Người dùng có tài khoản đang hoạt động có thể đăng nhập bằng email và mật khẩu",
    "entry_state": "Chưa xác thực",
    "exit_state": "Đã xác thực",
    "preconditions": ["Tài khoản ở trạng thái Hoạt động"],
    "trigger": "Người dùng gửi email và mật khẩu",
    "steps": [{"id": "S1", "action": "Gửi thông tin", "system_response": "Kiểm tra thông tin", "state_change": "Tạo phiên", "api_data": "POST /login", "fact_status": "verified", "source_ref": "account-portal.md#đăng-nhập", "source_excerpt": "Hệ thống kiểm tra email, mật khẩu và trạng thái tài khoản"}],
    "outcomes": ["Phiên xác thực được tạo"],
    "alternate_flows": [],
    "exceptions": [],
    "requirement_ids": ["REQ-AUTH-001"],
    "business_rule_ids": ["BR-AUTH-001"],
    "validation_rule_ids": ["VR-AUTH-001"],
    "dependency_ids": ["DEP-AUTH-001"],
    "api_operation_ids": ["API-AUTH-001"],
    "sanity_checks": ["Tài khoản hợp lệ tạo được phiên"],
    "unresolved": []
  }]
}
```

Every step must contain `fact_status`, `source_ref` and `source_excerpt`

Schema `4.0` also closes nested prose against the frozen source set. Every string in actor `responsibilities`/`permissions`, goal `success_metrics`, requirement `acceptance_criteria`, flow `preconditions`/`outcomes`/`alternate_flows`/`exceptions`/`sanity_checks`, sanity-journey conditions/checkpoints/results, API `roles`/`request_contract`/`response_contract`/`business_side_effects`, and cross-cutting `details` must be an exact normalized excerpt from one `source_markdown` document. Paraphrased or generic checklist-derived behavior is rejected; keep human-friendly summaries in the parent sourced entity instead

## Flow link and sanity journey

`flow_links` reference existing flow IDs. A link needs `status`, `source_ref` and `source_excerpt`. A journey references existing flows and cannot introduce new behavior

## API operation

Read [API_REQUIREMENTS.md](API_REQUIREMENTS.md) when `api_operations` is non-empty. `coverage_status` is always `not_covered` in this static skill

## Review coverage

Include all 18 exact area names from `SENIOR_REVIEW_CHECKLIST.md`. Status is `checked`, `blocked` or `not_applicable`. A `blocked` area must reference an active `Open` or `Blocked` question

## Q&A item

```json
{
  "id": "QA-001",
  "decision_key": "account.disable.active-session-policy",
  "basis": "missing_required_rule",
  "impact_ids": ["FLOW-002", "REQ-AUTH-001"],
  "category": "Trạng thái và bảo mật",
  "module_flow": "Tài khoản / Vô hiệu tài khoản",
  "source_ref": "account-portal.md#vô-hiệu-tài-khoản",
  "source_excerpt": "Quản trị viên có thể vô hiệu tài khoản đang hoạt động",
  "ambiguity_gap": "Tài liệu không quyết định hành vi của phiên đang hoạt động",
  "risk": "Không có expected result xác định",
  "question": "Các phiên đang hoạt động có bị thu hồi ngay không",
  "proposed_assumption": "Thu hồi ngay toàn bộ phiên đang hoạt động",
  "owner": "PO",
  "priority": "P0",
  "status": "Open",
  "answer": "",
  "answer_source_ref": "",
  "answer_source_excerpt": ""
}
```

Allowed `basis`: `ambiguous_text`, `contradiction`, `missing_required_rule`, `untestable_acceptance`, `unclear_ownership`

- `Open` and `Blocked` require empty answer evidence
- `Answered` requires non-empty `answer`, `answer_source_ref` and `answer_source_excerpt` from an authority decision record in `source_markdown`
- One `decision_key` represents one root decision

## Reconciliation

Reconcile flows by `semantic_key`, questions by `decision_key`, and every other semantic registry by `semantic_key`. Preserve stable IDs. On an unchanged source snapshot, no semantic set may grow and no existing key may change ID
