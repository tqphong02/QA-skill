# Template Schema - Chi tiết 4 sheet

> **Khi nào đọc file này**: Khi cần biết chi tiết về schema của từng sheet trong template (Cover metadata, Test cases_App columns, Report module codes). Tham chiếu `@references/template-schema.md` trong SKILL.md.

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
| G | Test Case Procedure | 30 |
| H | Expected Results | 30 |
| I | Results | 12 |
| J | Priority | 10 |
| K | Date | 12 |
| L | Tester | 12 |
| M | Notes | 20 |

## Sheet `Dropdown Keys` — controlled vocabulary

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
| **Phần 1 — UI** | `1.1. USER INTERFACE` | `"ui"` | Xanh nhạt (light blue) | `[CODE-UI-NN]` |
| **Phần 2 — Functional** | `1.2. FUNCTION` | `"function"` | Xanh lá (green) | `[CODE-NN]` |

**Quy tắc**:
- Luôn có cả 2 phần, UI trước Functional
- Mỗi phần: Group (LOGIN, REGISTER, BOOKING...) → Scenario (SCN-xxx) → Cases
- Nếu feature không có UI → vẫn để phần UI với 1 group note "N/A" hoặc bỏ group
