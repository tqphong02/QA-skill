# Testcase-template handoff

Read this reference only when the user explicitly requests a testcase document.

## Boundary

Whitebox QA owns source analysis and candidate-to-branch mapping. `support-testcase-authoring` owns:

- workbook asset and columns
- Scenario/Testcase ID rendering
- UI and FUNCTION sections
- human-readable Markdown
- Excel formatting, formulas, dropdowns, and blank execution columns
- Markdown-before-Excel generation and validation

Do not add a template, spreadsheet, column schema, or independent Markdown testcase renderer to `hybrid-source-coverage`.

## Mapping input

Create one mapping JSON after reading requirements and resolving concrete test data:

```json
{
  "project": {
    "code": "PAY",
    "name": "Payment Service",
    "device": "Whitebox function-level test",
    "version": "v1",
    "priority": "High",
    "test_date": "2026-07-29",
    "author": "QA Team",
    "reviewer": "Lead QA",
    "description": "Kiểm thử logic xử lý thanh toán từ source code",
    "objective": "Bao phủ các nhánh đã xác nhận theo requirement"
  },
  "source_document": "requirements/payment.md",
  "requirements": [
    {"id": "AC1", "text": "Từ chối thanh toán khi không có người dùng"}
  ],
  "group": "PAYMENT",
  "mappings": [
    {
      "candidate_id": "WB-001",
      "requirement": "AC1",
      "scenario_id": "SCN-WB-PAY-001",
      "scenario_name": "Từ chối thanh toán khi không có người dùng",
      "type": "negative",
      "description": "Xác minh rằng hệ thống từ chối thanh toán khi không tìm thấy người dùng",
      "pre_condition": "Không có người dùng tương ứng với userId được dùng để kiểm thử",
      "procedure": "1. Chuẩn bị userId không tồn tại\n2. Gọi chức năng xử lý thanh toán với userId đã chuẩn bị\n3. Quan sát kết quả",
      "expected": "1. Thanh toán không được tạo\n2. Hệ thống trả lỗi USER_NOT_FOUND",
      "priority": "High"
    }
  ]
}
```

Every selected candidate must have:

- a known `candidate_id`
- an AC in `requirements`, or `requirement: "(out-of-spec)"` with `type: "additional"`
- one specific scenario/behavior
- concrete Vietnamese description, precondition, procedure, and expected result
- no `TODO`, `TBD`, `UNRESOLVED`, or `CẦN LÀM RÕ`

Do not infer an expected business result solely because the current code returns or throws it. When code and requirement disagree, record the discrepancy and ask for a decision before generating the document.

## Canonical generation

Run:

```bash
npm run cli -- handoff \
  --analysis /absolute/report.json \
  --mapping /absolute/mapping.json \
  --output-json /absolute/testcase-input.json \
  --xlsx /absolute/Whitebox_Testcases.xlsx
```

The command invokes the installed sibling `support/testcase-authoring/scripts/gen-testcases.py`. Read the generated Markdown first, then compare case count and IDs with Excel as required by `support/testcase-authoring/SKILL.md`.

The adapter prepends `candidate`, `path`, and covered `branches` to Pre-condition. This preserves source traceability inside the existing fixed columns without inventing a Whitebox workbook schema.
