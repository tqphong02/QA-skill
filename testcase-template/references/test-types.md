# Test Case Types - Canonical Order

> **Khi nào đọc file này**: Khi gen test case và cần biết 8 loại case + thứ tự ưu tiên + kỹ thuật black-box tương ứng. Đọc `@references/blackbox-techniques.md` để biết cách áp dụng từng kỹ thuật với ví dụ JSON.

## 8 loại test case (canonical type order)

Script tự sort cases theo thứ tự này trong mỗi scenario:

| # | Type | BB Technique | Test cái gì | Ví dụ |
|---|---|---|---|---|
| 1 | `happy` | Use Case Testing | Flow đúng, input hợp lệ → phải PASS | login đúng → Dashboard |
| 2 | `alternative` | Use Case Testing | Cách khác cùng kết quả OK | bấm Enter thay vì click |
| 3 | `validation` | EP + BVA + Decision Table¹ | Required/format/constraint | bỏ trống, email thiếu @ |
| 4 | `edge` | BVA + EP | Boundary: min/max/empty/long | password đúng 8 ký tự (boundary) |
| 5 | `negative` | EP (invalid partition) + Error Guessing | Input sai, unauthorized, sai flow | password sai, email không tồn tại |
| 6 | `error` | Error Guessing + State Transition | Server/network fail, graceful | 500, timeout, disconnect |
| 7 | `ui` | Use Case Testing (UI perspective) | Display/layout (section UI) | element hiển thị đúng |
| 8 | `additional` | Error Guessing — **PHẢI flag** | AI thêm ngoài document | case đoán thêm, KHÔNG trong AC |

¹ **Decision Table bắt buộc** khi feature có ≥2 điều kiện độc lập kết hợp tạo ra behavior khác nhau — xem `@references/blackbox-techniques.md` §3.

## Rules

- Every case **MUST have `req`** (trace to one AC) — if `additional` type, write `Ref: (out-of-spec)`
- `additional` cases (not in doc) → flag clearly, **DO NOT fabricate expected result** from spec
- Script auto-sorts by type order; AI does not need to write in order
- Description format MANUAL: start with "Verify that..." (no technical prefix)
- Before writing any case, identify the BB technique from the table above; add optional `bb_technique` field in JSON to trace (generator ignores this field)
- For `validation`/`edge`: always check if Decision Table applies first (≥2 combined conditions → build table, then derive cases)
- For `edge`: always list boundary values explicitly (min−1, min, min+1, max−1, max, max+1) before writing cases
- For `negative`/`error`: cross-check Error Guessing list in `@references/blackbox-techniques.md` §6 for common missed cases

## Manual-Friendly Writing Rules (applies to ALL case types)

> **Invariant rule**: Every testcase in this system is written for a **Manual Tester who reads the Excel sheet and executes immediately** — not for developers or API tools.

> **Language rule**: Rule files (SKILL.md, references/) are in English for faster AI parsing. ALL testcase content in Excel/Markdown (Description, Pre-condition, Procedure, Expected Results) MUST be written in **Vietnamese**.

| Field | Required | Forbidden |
|---|---|---|
| **Description (E)** | Start with "Xác minh rằng..." (Vietnamese) + end-user language | Technical prefix, endpoint path, HTTP code |
| **Procedure (G)** | One action per line; current screen/route + exact field/button target + exact input value; written in Vietnamese | Combining actions on one line; shorthand such as `Nhập email`; `POST`, `null`, `assert` |
| **Expected (H)** | Describe what the Tester sees or can verify visually; written in Vietnamese | JSON body, HTTP status code, vague phrases |

For new executable UI/FUNCTION cases, these two columns are generated from the shared `execution` contract. Read [execution-contract.md](execution-contract.md) for `entry`, `[S##]` steps, semantic targets, wait signals, step assertions, outcome and cleanup

**Procedure — WRONG vs CORRECT:**

```
❌ WRONG (technical): Send POST /api/login with empty password → expect 400
✅ CORRECT (Vietnamese manual):
  1. Mở trình duyệt và truy cập màn hình Đăng nhập: [URL]/login
  2. Nhấp vào ô "Email"
  3. Nhập giá trị: test@example.com
  4. Nhấp vào ô "Mật khẩu"
  5. Để trống, không nhập giá trị
  6. Nhấp nút "Đăng nhập"
  7. Quan sát thông báo xuất hiện dưới ô "Mật khẩu"
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
  "procedure": "1. Mở trình duyệt và truy cập màn hình Đăng nhập: [URL]/login\n2. Nhấp vào ô Email\n3. Nhập email: test@example.com\n4. Nhấp vào ô Mật khẩu\n5. Nhập mật khẩu: Test@1234\n6. Nhấp nút Đăng nhập\n7. Quan sát kết quả hiển thị trên màn hình",
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
  "procedure": "1. Mở trình duyệt và truy cập màn hình Đăng nhập: [URL]/login\n2. Nhấp vào ô Email\n3. Nhập email: test@example.com\n4. Nhấp vào ô Mật khẩu\n5. Nhập mật khẩu: Test@1234\n6. Mở công cụ giả lập mạng và chọn Slow 3G\n7. Nhấp nút Đăng nhập\n8. Quan sát trạng thái tải và thông báo lỗi",
  "expected": "1. Loading state\n2. Sau timeout: error message network",
  "priority": "Medium"
}
```
