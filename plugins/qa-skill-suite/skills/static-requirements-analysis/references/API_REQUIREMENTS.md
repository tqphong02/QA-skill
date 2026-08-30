# API requirement analysis

Read this reference only when the supplied requirement sources define REST, GraphQL, gRPC, webhook or another API contract

## Boundary

This skill records documented API expectations and unresolved decisions. It does not call an endpoint and does not claim that an implementation conforms to a specification

- Use `static-requirements-analysis` for source-grounded business goals, operation intent, roles, inputs, documented responses, rules, validations, side effects, dependencies and missing API decisions
- Route OpenAPI/Swagger/Postman/GraphQL/gRPC/webhook specification validation, implementation comparison, live requests, compatibility checks and runtime verdicts to `hybrid-api-contract`
- Route API testcase authoring to `support-testcase-authoring`
- Route deterministic API automation build or execution to `dynamic-web-automation`

## API operation record

Create one `api_operations[]` item per documented operation. Keep an operation `not_covered`; static document analysis is never runtime coverage

```json
{
  "id": "API-AUTH-001",
  "semantic_key": "api.auth.login",
  "operation_id": "login",
  "protocol": "REST",
  "method": "POST",
  "path": "/login",
  "roles": ["Người dùng đã đăng ký"],
  "request_contract": ["email và password là bắt buộc"],
  "response_contract": ["200 tạo phiên", "401 không tạo phiên"],
  "business_side_effects": ["Tạo phiên xác thực khi thông tin hợp lệ"],
  "cleanup": "Không áp dụng",
  "requirement_ids": ["REQ-AUTH-001"],
  "business_rule_ids": ["BR-AUTH-001"],
  "validation_rule_ids": ["VR-AUTH-001"],
  "dependency_ids": [],
  "fact_status": "verified",
  "coverage_status": "not_covered",
  "source_ref": "account-portal.md#api-đăng-nhập",
  "source_excerpt": "POST /login nhận email và password"
}
```

Do not invent undocumented status codes, headers, schemas, pagination, idempotency, retry, timeout, rate limit, authentication failures or error bodies. A missing material API decision becomes one bounded Q&A item linked through `impact_ids`

## Handoff

The generator exports `<project-name>_API_Contract_Handoff.json` with a minimum operation ledger. Give that file and the original specification to `hybrid-api-contract`. Preserve `coverage_status: not_covered` until runtime or deterministic contract evidence exists
