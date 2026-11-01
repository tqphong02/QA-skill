# Template Schema - Chi tiết workbook và RBAC Matrix

> **Khi nào đọc file này**: Khi cần biết chi tiết về schema của từng sheet trong template (Cover metadata, Test cases_App columns, Report module codes). Tham chiếu `@references/template-schema.md` trong SKILL.md.

Mỗi workbook được generate cùng một file Markdown cùng basename. Markdown chứa toàn bộ testcase design và được tạo trước Excel

Master `assets/Template.xlsx` hiện có 5 sheet: `Cover`, `Test cases_App`, `Note`, `Report`, `Dropdown Keys - Do Not Delete -`. Generator thêm `RBAC Matrix` ngay sau `Test cases_App`, nên workbook đầu ra có 6 sheet

The workbook columns remain fixed. The structured `execution` contract lives in the JSON source and Markdown companion, then projects into F/H/I; it never adds a selector or automation column to Excel. The source-to-test coverage matrix lives in Markdown and `.automation.json`; Excel keeps the stable requirement-derived Scenario/Testcase IDs without adding coverage columns

## Sheet `Cover` — metadata project

| Cell | Ý nghĩa | Fill từ |
|---|---|---|
| B3 | Project Name | `project.name` |
| **C3** | **Project Code** (vd `BCP`, `NSM`, `DEM`) | `project.code` - dùng cho test case ID prefix |
| D3 | Device (Web/iPhone/...) | `project.device` |
| E3 | Priority tổng | `project.priority` |
| B5 | Description | `project.description` |
| D5 | Version | `project.version` |
| E5 | Test Date | `project.test_date` |
| B7 | Test Objective | `project.objective` |
| D7 | Author | `project.author` |
| E7 | Reviewer | `project.reviewer` |

## Sheet `Test cases_App` — cấu trúc header (row 9)

| Col | Header | Width (chars) |
|---|---|---|
| A | (margin) | |
| B | Scenario ID | 15 |
| C | Scenario Name | 25 |
| D | Test case ID | 12 |
| E | Description | 50 |
| F | Pre-condition | 25 |
| G | Priority 2 | 12 |
| H | Test Case Procedure | 30 |
| I | Expected Results | 30 |
| J | Results | 12 |
| K | Priority 1 | 10 |
| L | Date | 12 |
| M | Tester | 12 |
| N | Notes | 20 |

`Priority 2` (col G) is the generator's own risk-based assessment of each testcase, written automatically from `case.priority` in the JSON source; it uses the same dropdown list as `Priority 1` (`Critical`, `High`, `Medium`, `Low`, `N/A`) but is never left blank. `Priority 1` (col K) stays blank for the tester/QA lead to set manually during execution tracking, exactly like before the column was renamed; the generator never writes to it

## Sheet `RBAC Matrix` — Role × Rule × Testcase coverage

Sheet này luôn có trong workbook đầu ra. Nếu scope không có rule phân quyền, sheet ghi `N/A`; không để sheet trống khiến người đọc nhầm rằng RBAC đã được phân tích

| Cột | Nội dung |
|---|---|
| RBAC ID | Mã rule ổn định, ví dụ `RBAC-DASH-001` |
| Module | Module nghiệp vụ |
| Chức năng/Tài nguyên | Đối tượng cần kiểm soát quyền |
| Hành động | Xem, tạo, sửa, xóa, phê duyệt, truy cập |
| Phạm vi dữ liệu | Dữ liệu của mình, cùng đơn vị, toàn hệ thống |
| Điều kiện/Trạng thái | Điều kiện làm thay đổi quyền |
| Requirement Ref | AC/BR làm oracle |
| Một cột cho mỗi role | `CHO PHÉP`, `TỪ CHỐI`, `N/A`, `CHƯA RÕ` |
| Testcase cho phép | Testcase IDs được resolve từ `allow_case_refs` |
| Testcase từ chối | Testcase IDs được resolve từ `deny_case_refs` |
| Coverage | `ĐỦ`, `THIẾU ...`, `CHƯA YÊU CẦU` |
| Mức xác minh | Requirement/source/runtime provenance |
| Nguồn/Evidence | Requirement, source hoặc runtime reference đã che |
| Ghi chú/Q&A | Gap cần BA/PO/Dev xác nhận |

`rbac` JSON là source of truth. Không sửa riêng sheet rồi để JSON/Markdown lệch nhau

## Sheet `Note`

Giữ nguyên nội dung hướng dẫn có sẵn trong master template

## Sheet `Dropdown Keys - Do Not Delete -` — controlled vocabulary

| Nhóm | Values |
|---|---|
| EXECUTION STATUS | `Pass`, `Fail`, `N/A`, `Untested` |
| PRIORITY | `Critical`, `High`, `Medium`, `Low`, `N/A` |
| IMPLEMENTATION STATUS | `Planned`, `Implemented`, `Attempted` |
| TEST CASE STATUS | `Not Started`, `In Progress`, `Complete`, `Needs Review`, `Approved`, `Overdue`, `On Hold` |

## Sheet `Report` — auto-aggregate

COUNTIFS tự đếm Pass/Fail/NA theo module code + priority từ `Test cases_App` (rows 9-1723).

Module codes mặc định cho **BCP AI project** (override qua Report sheet):

| Code | Module |
|---|---|
| M.01.01 - M.01.08 | Tài khoản (Đăng ký, Đăng nhập, Quên MK, Đổi MK, Xác thực email, GPKD, User Profile, Company Profile) |
| M.02.01 - M.02.04 | AI Chatbot (Tìm kiếm, Lưu demand, Kết nối, Conversation) |
| M.03.01 - M.03.04 | Demand (Tạo, Sửa, Xóa, Gia hạn) |
| M.04.01 - M.04.03 | Matching (Đề xuất, Gửi yêu cầu, Accept/Decline) |
| M.05.01 - M.05.02 | Group Chat (Gửi tin nhắn, Dịch) |
| M.06.01 - M.06.03 | Credit (Nạp, Thanh toán, Hoàn tiền) |
| M.07.01 | Referral |
| M.08.01 - M.08.03 | Admin (Phê duyệt GPKD, Quản lý công ty, Quản lý demand) |

Cho project khác: edit trực tiếp Report sheet để thay module codes.

## 2 phần BẮT BUỘC trong Test cases_App

| Phần | Section header (col C) | `kind` | Style | Test case ID format |
|---|---|---|---|---|
| **Phần 1 — UI** | `1.1. USER INTERFACE` | `"ui"` | Xanh nhạt (light blue) | `CODE-UI-NN` |
| **Phần 2 — Functional** | `1.2. FUNCTION` | `"function"` | Xanh lá (green) | `CODE-NN` |

Khi user yêu cầu testcase API rõ ràng, phần `1.2. FUNCTION` được dùng với `kind: "api"` và importer sinh ID `CODE-API-NNN`. Không tạo section hoặc cột API riêng. Xem [api-testcases.md](api-testcases.md)

Group từ tag OpenAPI/Swagger có thể chưa tồn tại trong template. Generator tự thêm group mới và đủ data rows dưới đúng section; không map tag lạ vào LOGIN/HOME mặc định

**Quy tắc**:
- Luôn có cả 2 phần, UI trước Functional
- Mỗi phần: Group (LOGIN, REGISTER, BOOKING...) → Scenario (SCN-xxx) → Cases
- Nếu feature không có UI → vẫn để phần UI với 1 group note "N/A" hoặc bỏ group

## Module (Group) naming convention

`group.name` là Module hiển thị ở cột C (group header) trong `Test cases_App` và trong Report sheet. Đặt tên theo Feature/Function thực tế lấy từ tài liệu yêu cầu, không tự suy diễn:

- Ngắn gọn, có nghĩa, phản ánh đúng chức năng đang kiểm thử, vd `Authentication`, `User Management`, `Agent Management`, `Dashboard`, `Meeting Management`, `Email Integration`, `Creator Analytics`
- Không dùng tên chung chung không gắn với Feature cụ thể: `Module 1`, `Module 2`, `General`, `Other`, `Miscellaneous`
- Mọi testcase thuộc cùng một Feature phải nằm trong cùng một Module; chỉ tách Module riêng cho Sub-feature khi Sub-feature đó đủ lớn để cần theo dõi coverage độc lập
- Tên Module phải giúp người đọc Report hiểu ngay đang kiểm thử chức năng gì mà không cần mở từng testcase
