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

## Quy tắc

- Mỗi case **BẮT BUỘC có `req`** (trace về 1 AC) - nếu case `additional` thì ghi `Ref: (out-of-spec)`
- Case `additional` (không trong doc) → flag rõ, **KHÔNG bịa expected result** dựa trên spec
- Script tự sort theo type order, AI không cần viết theo thứ tự
- Description format MANUAL: bắt đầu bằng "Xác minh rằng..." (không có prefix kỹ thuật)

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
