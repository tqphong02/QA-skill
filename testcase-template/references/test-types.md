# Test Case Types - Canonical Order

> **Khi nào đọc file này**: Khi gen test case và cần biết 8 loại case + thứ tự ưu tiên. Tham chiếu `@references/test-types.md` trong SKILL.md.

## 8 loại test case (canonical type order)

Script tự sort cases theo thứ tự này trong mỗi scenario:

| # | Type | Test cái gì | Ví dụ |
|---|---|---|---|
| 1 | `happy` | Flow đúng, input hợp lệ → phải PASS | login đúng → Dashboard |
| 2 | `alternative` | Cách khác cùng kết quả OK | bấm Enter thay vì click |
| 3 | `validation` | Required/format/constraint | bỏ trống, email thiếu @ |
| 4 | `edge` | Boundary: min/max/empty/long | password đúng 8 ký tự (boundary) |
| 5 | `negative` | Input sai, unauthorized, sai flow | password sai, email không tồn tại |
| 6 | `error` | Server/network fail, graceful | 500, timeout, disconnect |
| 7 | `ui` | Display/layout (section UI) | element hiển thị đúng |
| 8 | `additional` | AI thêm ngoài document - **PHẢI flag** | case đoán thêm, KHÔNG trong AC |

## Rules

- Every case **MUST have `req`** (trace to one AC) — if `additional` type, write `Ref: (out-of-spec)`
- `additional` cases (not in doc) → flag clearly, **DO NOT fabricate expected result** from spec
- Script auto-sorts by type order; AI does not need to write in order
- Description format MANUAL: start with "Verify that..." (no technical prefix)

## Manual-Friendly Writing Rules (applies to ALL case types)

> **Invariant rule**: Every testcase in this system is written for a **Manual Tester who reads the Excel sheet and executes immediately** — not for developers or API tools.

> **Language rule**: Rule files (SKILL.md, references/) are in English for faster AI parsing. ALL testcase content in Excel/Markdown (Description, Pre-condition, Procedure, Expected Results) MUST be written in **Vietnamese**.

| Field | Required | Forbidden |
|---|---|---|
| **Description (E)** | Start with "Xác minh rằng..." (Vietnamese) + end-user language | Technical prefix, endpoint path, HTTP code |
| **Procedure (G)** | One action per line; field/button name + exact input value; written in Vietnamese | Combining actions on one line; `POST`, `null`, `assert` |
| **Expected (H)** | Describe what the Tester sees or can verify visually; written in Vietnamese | JSON body, HTTP status code, vague phrases |

**Procedure — WRONG vs CORRECT:**

```
❌ WRONG (technical): Send POST /api/login with empty password → expect 400
✅ CORRECT (Vietnamese manual):
  1. Mở trình duyệt và truy cập: [URL]/login
  2. Tại ô "Email", nhập: test@example.com
  3. Tại ô "Mật khẩu", để trống (không nhập gì)
  4. Nhấp nút "Đăng nhập"
  5. Quan sát thông báo xuất hiện dưới ô Mật khẩu
```

**Expected Results — WRONG vs CORRECT:**

```
❌ WRONG: {"error": "password required", "status": 400}
✅ CORRECT (Vietnamese):
  1. Hệ thống không thực hiện đăng nhập
  2. Dưới ô "Mật khẩu" hiển thị thông báo màu đỏ: "Mật khẩu không được để trống"
  3. Trang vẫn ở màn hình đăng nhập, không chuyển hướng
```

## Ví dụ JSON input

```json
{
  "type": "happy",
  "req": "AC1",
  "description": "Xác minh rằng người dùng có thể đăng nhập với email + password đúng",
  "pre_condition": "Có account test",
  "procedure": "1. Mở /login\n2. Nhập email + password\n3. Click nút Login",
  "expected": "1. Đăng nhập thành công",
  "priority": "High"
}
```

## Ví dụ JSON input cho Validation

```json
{
  "type": "validation",
  "req": "AC3",
  "description": "Xác minh rằng hệ thống không cho phép submit khi bỏ trống email",
  "pre_condition": "User ở trang /login",
  "procedure": "1. Mở /login\n2. Để trống ô Email\n3. Nhập password\n4. Click Login",
  "expected": "1. Không submit form\n2. Hiển thị thông báo lỗi",
  "priority": "High"
}
```

## Ví dụ JSON input cho Error

```json
{
  "type": "error",
  "req": "AC7",
  "description": "Xác minh rằng hệ thống xử lý đúng khi mạng chậm/timeout",
  "pre_condition": "Có account hợp lệ, mạng chậm",
  "procedure": "1. Mở /login\n2. Nhập email + password\n3. DevTools throttle Slow 3G\n4. Click Login",
  "expected": "1. Loading state\n2. Sau timeout: error message network",
  "priority": "Medium"
}
```
