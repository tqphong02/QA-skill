---
trigger: model_decision
description: Use when analyzing business requirements and generating structured test case documents (Excel / CSV / MD) using Black-box Testing and ISTQB CTAL Test Analyst techniques across 4 groups (Data-Based, Behavior-Based, Rule-Based, Experience-Based). Includes explicit API testcases when requested.
---

# Test Case Template & Black-box Authoring (ISTQB CTAL)

Load the full skill body when the trigger matches:
- Skill file: [`support/testcase-authoring/SKILL.md`](../../support/testcase-authoring/SKILL.md)

## Khi nào áp dụng
- Phân tích yêu cầu nghiệp vụ (User Story, BRD/SRS, API Doc) và thiết kế test case theo Black-box Testing
- Áp dụng 4 nhóm kỹ thuật ISTQB CTAL:
  1. Data-Based (Domain Testing, Combinatorial/Pairwise, Random Testing)
  2. Behavior-Based (CRUD Testing, State Transition, Scenario-Based)
  3. Rule-Based (Decision Table, Metamorphic Testing)
  4. Experience-Based (Session-Based, Checklist-Based, Crowd Testing)
- Xuất tài liệu test case chuẩn (Markdown trước, Excel / CSV sau) theo bảng 6 cột chuẩn
- Chỉ bật API mode khi user yêu cầu viết testcase API hoặc viết testcase cho endpoint, OpenAPI/Swagger, Postman hay curl; chỉ nhắc tới artifact API thì không đổi mode
- Khi API mode có file nguồn, chạy `support/testcase-authoring/scripts/import-api-spec.py` và chỉ gen Excel khi `review_required` trống
- Generator phải tạo testcase Markdown cùng basename trước Excel; AI lần sau đọc Markdown trước và chỉ mở Excel cho execution/format

## Không dùng
- Ghi chú exploratory tự do không charter (dùng `dynamic-web-exploratory`)
- Viết bug report độc lập (dùng issue tracker / integration)
- Sinh Playwright automation code trực tiếp (dùng `dynamic-web-automation`)

## Nguyên tắc cốt lõi
> Cùng một bộ cột — không sáng tạo cột mới ngoài quy chuẩn.
> Phân tích context & hỏi lại thông tin thiếu trước khi thiết kế. Không tự bịa business rules.
> Ưu tiên khả năng phát hiện defect thực tế và tối ưu độ bao phủ thay vì số lượng test case.
