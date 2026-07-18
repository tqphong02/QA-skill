# Markdown Testcase Companion

## Output contract

Mỗi lần generate Excel, tạo Markdown cùng basename và cùng folder trước

```text
login-testcases.md
login-testcases.xlsx
```

`scripts/gen-testcases.py input.json login-testcases.xlsx` tự tạo cả hai file. Không viết hai artifact bằng hai nguồn khác nhau

## Nội dung bắt buộc

Markdown phải chứa đầy đủ:

- Project metadata và source document
- Requirement ID và requirement text
- Section UI/FUNCTION
- Group
- Scenario ID và Scenario Name
- Testcase ID giống Excel
- Type, requirement reference và priority
- Description
- Pre-condition
- Procedure
- Expected Results
- API request/response detail trong F/G/H nếu là API mode

Markdown không chứa execution columns I-M vì chúng được tester cập nhật trong Excel khi chạy

## Read order cho AI

1. Khi đã có testcase Markdown, đọc file `.md` trước
2. Không mở Excel chỉ để hiểu testcase design
3. Chỉ đọc Excel khi cần format, dropdown, formula hoặc execution result I-M
4. Nếu chỉnh testcase design, sửa JSON source rồi regenerate cả Markdown và Excel
5. Không sửa riêng Markdown hoặc Excel khiến hai bản lệch nhau

## Verification

- Markdown phải được ghi trước Excel
- Tổng case phải bằng nhau
- Scenario ID, Scenario Name, Testcase ID, description, pre-condition, procedure và expected phải khớp
- ID phải liên tục theo đúng order generator
- Không có dấu `.` cuối prose và không có emoji/icon
- Không lưu secret thật trong cả hai file
