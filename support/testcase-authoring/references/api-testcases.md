# API Testcases

Đọc file này chỉ khi user yêu cầu rõ viết testcase API hoặc viết testcase cho endpoint, OpenAPI/Swagger, Postman hay curl. Chỉ nhắc đến artifact API mà không yêu cầu viết testcase API thì không bật mode này

## Mode và vị trí

- Giữ nguyên workbook và toàn bộ cột hiện tại
- Đặt API testcase trong `1.2. FUNCTION` với `kind: "api"`
- Không tạo phần thứ ba và không thêm cột Method, Endpoint, Headers, Body hoặc Status
- Nếu yêu cầu không liên quan API, quay lại flow `kind=ui` hoặc `kind=function` hiện tại và không tạo object `api`

## Đọc file API

Luôn dùng importer thay vì đọc thủ công khi user cung cấp file hoặc folder source

```bash
python3 scripts/import-api-spec.py <source-file-or-folder> <output.json> \
  --project-code <CODE> --project-name "<Project Name>"
```

Importer tự nhận diện:

- OpenAPI 3 JSON hoặc YAML
- Swagger 2 JSON hoặc YAML
- Postman Collection v2 JSON
- Generic JSON có `endpoints` hoặc `routes`
- curl trong `.txt`, `.md`, `.http` hoặc `.rest`
- Dòng `GET /path -> 200`
- FastAPI decorator và Express router/app endpoint trong file source
- Folder chứa nhiều file hỗ trợ; importer scan đệ quy, bỏ `.git`, `node_modules`, build output và lock file rồi deduplicate theo method + endpoint

Importer lấy method, path, tag, auth, parameters, request schema, documented response status và response schema. Importer tự tạo happy, documented 401/403, required-field validation 400/422 và documented 404 case khi đủ dữ liệu

### Hard gate `review_required`

- Exit `0`: có thể chạy `gen-testcases.py`
- Exit `2`: file JSON draft đã được tạo nhưng còn operation thiếu documented 2xx status
- Không chạy Excel nếu `review_required` còn item
- Chỉ dùng `--default-success-status` sau khi user hoặc tài liệu xác nhận status chung
- `--allow-review` chỉ dùng để kiểm tra extraction, không dùng để giao testcase cuối

## Scenario grouping

Một scenario chỉ đại diện cho một endpoint, một HTTP operation và một behavior hoặc AC cụ thể

- Khác method hoặc endpoint thì tách scenario
- Cùng endpoint nhưng khác behavior hoặc AC như authorization, validation, pagination thì tách scenario
- Nhiều dữ liệu kiểm thử cho cùng behavior có thể nằm trong cùng scenario

## Mapping vào format hiện tại

| Cột | Nội dung API |
|---|---|
| B | Scenario ID |
| C | Tên behavior nghiệp vụ của API |
| D | Testcase ID ổn định `CODE-API-NNN` do importer tạo và generator giữ nguyên |
| E | Description bắt đầu bằng `Xác minh rằng` |
| F | Role, tenant, auth state, test data và dependency cần có |
| G | Priority 2 (agent tự đánh giá theo rủi ro nghiệp vụ của API) |
| H | Method + endpoint, headers, query, body và bước gửi request |
| I | Expected status, headers, body/schema và side-effect |
| J-N | Để trống cho execution |

## Structured object

Mỗi API case thêm object `api` như sau

```json
{
  "api": {
    "method": "POST",
    "endpoint": "/api/v1/users",
    "headers": {
      "Authorization": "Bearer <valid_token>",
      "Content-Type": "application/json"
    },
    "query": {},
    "body": {
      "email": "qa+api@example.com",
      "role": "viewer"
    },
    "expected_status": 201,
    "expected_headers": {
      "Content-Type": "application/json"
    },
    "expected_schema": ["id", "email", "role", "created_at"],
    "expected_body": {
      "email": "qa+api@example.com",
      "role": "viewer"
    },
    "side_effect": "Bản ghi user mới được lưu và đọc lại thành công"
  }
}
```

Generator tự chuyển object này vào F/H/I, tự tính Priority 2 (cột G) từ `case.priority` và giữ J-N trống

## Automation handoff gate

Testcase API có thể được author trước khi chạy manual, nhưng trước khi chuyển sang `dynamic-web-automation`, mỗi case phải có ba contract sau

```json
{
  "manual_verification": {
    "status": "PASS",
    "environment": "staging",
    "evidence": ["reports/manual-api/API-AUTH-001.json"],
    "verified_at": "2026-08-30T07:00:00Z"
  },
  "risk_profile": {
    "criticality": 5,
    "money_or_data_impact": 4,
    "third_party_dependency": false,
    "async_behavior": false,
    "recovery_sensitivity": 4,
    "dependency_refs": [],
    "rationale": "Authentication protects user data"
  },
  "stability_gate": {
    "repeat_count": 3,
    "required_consecutive_passes": 3,
    "max_flaky_rate": 0
  }
}
```

- `manual_verification.status` dùng `PASS`, `FAILED`, `BLOCKED` hoặc `WAIVED`
- `PASS` và `FAILED` cần evidence cùng timestamp UTC; `WAIVED` cần `waiver_reason`
- Chỉ `PASS` hoặc waiver tường minh mới được BUILD
- `risk_profile` dùng cùng thang 1-5 để giữ scope/risk rõ trước automation
- `stability_gate` phải yêu cầu ít nhất hai lần chạy và không được yêu cầu số pass liên tiếp lớn hơn `repeat_count`

## Typed side-effect oracle

Không dùng prose `side_effect` làm bằng chứng automation. Với persistence, event, webhook hoặc transaction, khai báo `api.expected_side_effects[]`

```json
{
  "id": "SE-USER-PERSISTED",
  "type": "READ_AFTER_WRITE",
  "description": "User vừa tạo có thể được đọc lại",
  "expected": { "email": "qa+api@example.com", "role": "viewer" },
  "implementation_file": "src/shared/helpers/user-side-effect.ts",
  "implementation_export": "readCreatedUser"
}
```

Type hợp lệ: `READ_AFTER_WRITE`, `DATABASE_STATE`, `EVENT_PUBLISHED`, `WEBHOOK_SENT`, `TRANSACTION_ROLLBACK`, `NO_UNEXPECTED_MUTATION`. Helper phải trả về oracle quan sát được; codegen sẽ assert kết quả với `expected`

## Coverage cần cân nhắc

- Happy path
- Authentication và authorization
- Required, format, enum và validation nghiệp vụ
- Min, max, empty và boundary
- Not found, conflict và invalid state
- Pagination, filter và sort nếu API hỗ trợ
- Idempotency, retry và concurrency nếu requirement có định nghĩa
- Timeout hoặc dependency error
- Response contract và schema
- Side-effect, persistence và read-after-write

Không bắt buộc tạo mọi nhóm nếu endpoint không áp dụng

## Guardrails

- Không tự bịa status code, response field, error message hoặc side-effect ngoài requirement
- Nếu expected chưa rõ thì đánh dấu cần làm rõ thay vì đoán
- Không đưa token, password, cookie hoặc API key thật vào JSON hay workbook
- Sensitive header chỉ dùng placeholder có dạng `<valid_token>` hoặc `<qa_api_key>`
- Không đặt dấu `.` cuối prose và không chèn emoji/icon
- Giữ nguyên endpoint, URL, JSON key, API field, code và số thập phân
- Với OpenAPI/Swagger, dùng tag làm group; generator tự tạo group chưa có trong template
