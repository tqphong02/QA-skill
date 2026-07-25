# Testcases — BCP AI

## Project metadata

- **Project code:** BCP
- **Device:** Web (Chrome, Edge, Firefox, Safari)
- **Version:** v1.0
- **Test date:** 2026-07-03
- **Author:** QA Team
- **Reviewer:** Lead QA
- **Source document:** spec/login-feature-spec.md (vd — AI thay bằng tài liệu thật)
- **Objective:** Ensure that user can login with valid credentials and proper validation/handling

## Requirements

- `AC1`: User đăng nhập thành công với email + password đúng
- `AC2`: Hệ thống báo lỗi khi credentials sai
- `AC3`: Validate required fields: KHÔNG submit khi bỏ trống email/password
- `AC4`: Email phải đúng format (có @ và có domain)
- `AC7`: Xử lý error khi mạng chậm/timeout hoặc server lỗi

## 1.1. USER INTERFACE

### LOGIN

- Không có testcase trong group này


## 1.2. FUNCTION

### LOGIN

#### `SCN-LOG-001` — Đăng nhập thành công

##### `[BCP-01]` — Xác minh rằng người dùng có thể đăng nhập thành công với email và password đúng

- **Type:** Happy Path
- **Requirement:** `AC1`
- **Priority:** High
- **Pre-condition:**
  Có account test bao.nguyen@bcp.global với password Bcp@12345
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email bao.nguyen@bcp.global
  3. Nhập password Bcp@12345
  4. Click nút Login
- **Expected Results:**
  1. Đăng nhập thành công, chuyển sang trang chính

##### `[BCP-02]` — Xác minh rằng người dùng có thể đăng nhập bằng phím Enter thay vì click nút Login

- **Type:** Alternative
- **Requirement:** `AC1`
- **Priority:** Medium
- **Pre-condition:**
  Có account test hợp lệ
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email đúng
  3. Nhập password đúng
  4. Bấm phím Enter (không click nút)
- **Expected Results:**
  1. Đăng nhập thành công

#### `SCN-LOG-002` — Email validation

##### `[BCP-03]` — Xác minh rằng hệ thống không cho phép submit khi bỏ trống email

- **Type:** Validation
- **Requirement:** `AC3`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Để trống ô Email
  3. Nhập password bất kỳ
  4. Click nút Login
- **Expected Results:**
  1. Không submit form
  2. Hiển thị thông báo yêu cầu nhập Email

##### `[BCP-04]` — Xác minh rằng hệ thống không cho phép submit khi bỏ trống password

- **Type:** Validation
- **Requirement:** `AC3`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email đúng format
  3. Để trống ô Password
  4. Click nút Login
- **Expected Results:**
  1. Không submit form
  2. Hiển thị thông báo yêu cầu nhập Password

##### `[BCP-05]` — Xác minh rằng hệ thống không cho phép submit khi bỏ trống cả email và password

- **Type:** Validation
- **Requirement:** `AC3`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Để trống cả 2 ô
  3. Click nút Login
- **Expected Results:**
  1. Không submit form
  2. Hiển thị thông báo lỗi cho cả 2 field

##### `[BCP-06]` — Xác minh rằng người dùng validate email thiếu ký tự @

- **Type:** Validation
- **Requirement:** `AC4`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email hieugmail.com (thiếu @)
  3. Nhập password bất kỳ
  4. Click nút Login
- **Expected Results:**
  1. Hiển thị thông báo lỗi Invalid email format

##### `[BCP-07]` — Xác minh rằng người dùng validate email thiếu domain

- **Type:** Validation
- **Requirement:** `AC4`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email hieugmailcom (thiếu domain)
  3. Nhập password bất kỳ
  4. Click nút Login
- **Expected Results:**
  1. Hiển thị thông báo lỗi Invalid email format

#### `SCN-LOG-003` — Login authentication fail

##### `[BCP-08]` — Xác minh rằng hệ thống báo lỗi khi người dùng nhập sai mật khẩu

- **Type:** Negative
- **Requirement:** `AC2`
- **Priority:** High
- **Pre-condition:**
  Có account bao.nguyen@bcp.global
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email đúng bao.nguyen@bcp.global
  3. Nhập password sai (ví dụ: WrongPass123)
  4. Click nút Login
- **Expected Results:**
  1. Đăng nhập thất bại
  2. Hiển thị thông báo lỗi Wrong password hoặc tương tự

##### `[BCP-09]` — Xác minh rằng hệ thống báo lỗi khi người dùng nhập email không tồn tại

- **Type:** Negative
- **Requirement:** `AC2`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email không tồn tại (ví dụ: nonexistent@bcp.global)
  3. Nhập password bất kỳ
  4. Click nút Login
- **Expected Results:**
  1. Đăng nhập thất bại
  2. Hiển thị thông báo lỗi authentication error chung

##### `[BCP-10]` — Xác minh rằng hệ thống báo lỗi khi người dùng nhập sai cả email và mật khẩu

- **Type:** Negative
- **Requirement:** `AC2`
- **Priority:** High
- **Pre-condition:**
  User ở trang đăng nhập
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email sai nonexistent@bcp.global
  3. Nhập password sai TestWrong
  4. Click nút Login
- **Expected Results:**
  1. Đăng nhập thất bại
  2. Hiển thị thông báo lỗi chung

#### `SCN-LOG-004` — Login error handling

##### `[BCP-11]` — Xác minh rằng hệ thống xử lý đúng khi mạng chậm hoặc timeout

- **Type:** Error Handling
- **Requirement:** `AC7`
- **Priority:** Medium
- **Pre-condition:**
  Có account hợp lệ, mạng chậm hoặc giả lập timeout
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email và password đúng
  3. Giả lập mạng timeout (DevTools throttle Slow 3G)
  4. Click nút Login
- **Expected Results:**
  1. Hiển thị loading state
  2. Sau timeout, hiển thị error message network error

##### `[BCP-12]` — Xác minh rằng hệ thống xử lý đúng khi server trả về lỗi 500

- **Type:** Error Handling
- **Requirement:** `AC7`
- **Priority:** Medium
- **Pre-condition:**
  Có account hợp lệ, server đang lỗi
- **Procedure:**
  1. Mở trang đăng nhập
  2. Nhập email và password đúng
  3. Giả lập server trả 500 (DevTools block request)
  4. Click nút Login
- **Expected Results:**
  1. Hiển thị error message Internal server error hoặc tương tự
  2. Không crash app
  3. User có thể retry
