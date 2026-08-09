# Markdown Testcase Companion

## Output contract

Mỗi lần generate Excel, tạo Markdown rồi automation manifest cùng basename và cùng folder trước

```text
login-testcases.md
login-testcases.automation.json
login-testcases.xlsx
```

`scripts/gen-testcases.py input.json login-testcases.xlsx` tự tạo cả ba file. Không viết các artifact bằng nguồn khác nhau

## Nội dung bắt buộc

Markdown phải chứa đầy đủ:

- Project metadata và source document
- Requirement ID và requirement text
- Business-facing RBAC Matrix with role expectations, linked allow/deny testcase IDs, coverage, verification provenance and Q&A notes; write `N/A` when RBAC does not apply
- Lossless `<basename>.automation.json` companion generated after Markdown and before Excel for POM planning; do not reconstruct assertion targets, cleanup or RBAC fields from prose
- Section UI/FUNCTION
- Group
- Scenario ID và Scenario Name
- Testcase ID giống Excel
- Type, requirement reference và priority
- Description
- Pre-condition
- Procedure
- Expected Results
- Manual F/G/H projection with numbered Vietnamese preconditions, actions, waits and observable results; do not expose raw JSON, `S##`, `target.key` or assertion labels in this projection
- Separate Execution Contract version, detailed entry state and test data for new executable UI/FUNCTION cases
- Stable step IDs, exact structured values, semantic target keys, wait signals and step assertions in the technical Step Contract table
- Final outcome assertions and cleanup contract
- Selector status: unresolved until POM verifies the target in the runtime DOM
- API request/response detail trong F/G/H nếu là API mode

Markdown không chứa execution columns I-M vì chúng được tester cập nhật trong Excel khi chạy

## Read order cho AI

1. Khi đã có testcase Markdown, đọc file `.md` trước
2. POM đọc `.automation.json`; manual tester đọc Pre-condition, Procedure và Expected Results; Markdown là bản đọc/review chung
3. Không mở Excel chỉ để hiểu testcase design
4. Chỉ đọc Excel khi cần format, dropdown, formula hoặc execution result I-M
5. Nếu chỉnh testcase design, sửa JSON source rồi regenerate Markdown, automation manifest và Excel
6. Không sửa riêng một artifact khiến ba bản lệch nhau

## Verification

- Markdown phải được ghi trước Excel
- Tổng case phải bằng nhau
- Scenario ID, Scenario Name, Testcase ID, description, pre-condition, procedure và expected phải khớp
- Với case có `execution`, F/G/H phải là projection manual đúng thứ tự của `entry`, `steps` và `outcome.assertions`; Step Contract giữ machine keys/values cho automation và không được tạo nguồn flow thứ hai
- New executable cases phải có Testcase ID explicit, unique và ổn định khi thêm/reorder case
- Không có dấu `.` cuối prose và không có emoji/icon
- Không lưu secret thật trong cả hai file
