# Placeholder Reference — Format Hints

> **Mục đích**: Bảng tra cứu nhanh format mong đợi cho mỗi placeholder. Đọc file này TRƯỚC khi fill placeholder.
>
> **Quy ước đặt tên**: Tất cả placeholder dùng `<UPPERCASE_SNAKE>` (vd: `<RESOURCE>`, `<API_BASE_URL>`).

## Tại sao cần file này?

Tên placeholder (`<ADMIN_TEST_COM>`) không tự truyền đạt được:
- **Kiểu dữ liệu**: email? URL? UUID? Path?
- **Format cụ thể**: email có cần `@domain.com` không? URL có cần `https://` không?
- **Ví dụ minh hoạ**: giá trị thật trông như thế nào?

File này trả lời các câu hỏi đó. **Đọc file này** → fill đúng → chạy `check-placeholders.sh` pass.

## Bảng placeholder chuẩn

### Resource & Domain

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<RESOURCE>` | string | PascalCase, tên resource trong domain | `User`, `Order`, `Product` |
| `<RESOURCE_MODEL>` | TypeScript type | PascalCase | `User`, `Order` |
| `<DOMAIN>` | string | PascalCase, epic trong Allure | `Users`, `Orders`, `Payments` |
| `<FEATURE>` | string | kebab-case | `user-management`, `order-checkout` |
| `<FLOW_NAME>` | string | PascalCase, story trong Allure | `Create User`, `Process Payment` |

### URL & Endpoint

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<API_BASE_URL>` | URL | `http(s)://host:port` (KHÔNG có trailing slash) | `http://localhost:3000`, `https://api.staging.example.com` |
| `<UI_BASE_URL>` | URL | `http(s)://host:port` | `http://localhost:5173` |
| `<LOGIN_PATH>` | URL path | Bắt đầu `/`, không có host | `/auth/login`, `/api/v1/login` |
| `<LIST_PAGE_URL>` | URL path | Path của trang list | `/users`, `/admin/orders` |
| `<EXPECTED_URL_PATTERN>` | regex | Pattern match khi redirect | `dashboard`, `users/\\d+` |
| `<DASHBOARD_OR_HOME_URL>` | regex | URL sau login | `dashboard|home` |

### Authentication & User

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<ADMIN_TEST_COM>` | **email** | standard email format | `admin@test.com`, `qa@example.com` |
| `<ADMIN_123>` | **password** | min 8 chars, có chữ hoa/thường/số | `Admin@123`, `P@ssw0rd!` |
| `<EXPIRED_JWT_TOKEN>` | JWT string | Format `header.payload.signature` | `eyJhbGc...expired` |
| `<AUTH_FIXTURES>` | TypeScript type | PascalCase | `AuthFixtures` |

### Field & Form

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<FIELD>` | string | camelCase, tên field | `firstName`, `email` |
| `<FIELD_1>`, `<FIELD_2>` | string | camelCase, khác nhau | `email`, `firstName` |
| `<FIELD_NAME>` | string | camelCase | `password` |
| `<MENU>` | string | camelCase, tên menu/link | `users`, `admin` |
| `<LINK_OR_MENU_ITEM>` | string | regex pattern | `users\|người dùng` |
| `<SAVE>` | string | button text | `Save`, `Lưu` |
| `<CREATE>` | string | button text | `Create`, `Thêm mới` |
| `<CREATE_OR_ADD_NEW>` | string | regex button | `Create\|Add New` |
| `<SAVE_OR_SUBMIT>` | string | regex button | `Save\|Submit` |
| `<SEARCH>` | string | placeholder text | `Search...` |
| `<ROW_TESTID>` | string | testid cho row | `user-row`, `order-row` |
| `<NEXT_OR_FILTER>` | string | regex button | `Next\|Filter` |
| `<EDIT>` | string | button text | `Edit`, `Sửa` |
| `<UPDATED_VALUE>` | string | giá trị mới sau update | `Updated Name` |
| `<INVALID_VALUE>` | string | giá trị invalid | `invalid-string` |

### Test Case Description

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<GET_LIST_SUCCESS>` | string | mô tả test case happy path | `List users thành công` |
| `<GET_BY_ID_SUCCESS>` | string | mô tả | `Get user by id` |
| `<POST_CREATE_SUCCESS>` | string | mô tả | `Create user mới` |
| `<PUT_UPDATE_SUCCESS>` | string | mô tả | `Update user` |
| `<DELETE_SUCCESS>` | string | mô tả | `Delete user` |
| `<ALTERNATIVE_OK>` | string | mô tả alternative case | `Sort theo createdAt desc` |
| `<MISSING_REQUIRED_FIELD>` | string | mô tả validation | `Thiếu email → 400` |
| `<INVALID_FORMAT>` | string | mô tả | `Email format sai` |
| `<CONSTRAINT_VIOLATION>` | string | mô tả | `Password quá ngắn` |
| `<BOUNDARY_MAX>` | string | mô tả edge case | `Email đúng 255 chars` |
| `<BOUNDARY_OVER>` | string | mô tả | `Email > 255 chars` |
| `<BOUNDARY_MIN>` | string | mô tả | `firstName 1 char` |
| `<RESOURCE_NOT_FOUND>` | string | mô tả negative | `User không tồn tại → 404` |
| `<NO_AUTH_TOKEN>` | string | mô tả | `Không auth → 401` |
| `<EXPIRED_TOKEN>` | string | mô tả | `Token hết hạn → 401` |
| `<ERROR_PATTERN>` | string | regex match error | `invalid email` |
| `<PATTERN_MATCH>` | string | regex | `email required` |

### TypeScript & Code Structure

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<LOGIN_LOCATORS>` | TS type | PascalCase | `LoginLocators` |
| `<RESOURCE_MODEL>` | TS type | PascalCase | `User` |
| `<TYPE>` | string | TS type name | `string`, `number` |
| `<NAME>` | string | tên biến | `name` |
| `<STRING>` | TS type | `string` | `string` |
| `<VOID>` | TS type | `void` | `void` |
| `<DESCRIPTION>` | string | mô tả | `description` |
| `<PLACEHOLDER_NAME>` | string | tên placeholder | `placeholder` |

### Flow & Domain-specific

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<BUSINESS_FLOW_NAME>` | string | PascalCase, tên business flow | `User Management E2E` |
| `<FLOW>` | string | PascalCase | `User Management E2E` |
| `<NON_EXISTENT_ID>` | UUID | UUID v4 format | `00000000-0000-0000-0000-000000000000` |
| `<API_RESPONSE>` | TS type | Playwright type | `APIResponse` |
| `<RESPONSE_TYPE>` | TS type | PascalCase | `Response` |

### Test Case (TC) - Pattern trong test name

| Placeholder | Kiểu | Format | Ví dụ |
|---|---|---|---|
| `<TC_ID>` | string | Pattern `TC_<FEATURE>_<NN>` | `TC_USER_01`, `TC_ORDER_03` |
| `<HAPPY>` | string | type tag | `happy` |
| `<DESCRIPTION>` | string | mô tả ngắn | `description` |
| `<TYPE>` | string | TS `type` keyword | `type` |

## Khi nào KHÔNG cần fill

Một số placeholder trong **comment hướng dẫn** (không phải code thật):
- Comment JSDoc `/** ... */` ở đầu file: KHÔNG cần fill
- Comment `//` ngắn giải thích: KHÔNG cần fill
- Ví dụ code trong comment README: KHÔNG cần fill

## Ví dụ workflow

```
1. Mở testcases/user.md — thấy TC_USER_01 cần "valid@test.com / P@ss123"
2. Mở tests/api/example.api.spec.ts — thấy <ADMIN_TEST_COM> và <ADMIN_123>
3. Tra bảng trên:
   - <ADMIN_TEST_COM> = email format → fill: "valid@test.com"
   - <ADMIN_123> = password → fill: "P@ss123"
4. Save → chạy check-placeholders.sh → expect pass
```

## Quy tắc khi thêm placeholder mới

Nếu bạn (AI) cần thêm placeholder mới chưa có trong bảng:

1. **Đặt tên theo convention**: `<UPPERCASE_SNAKE>`
2. **Thêm vào bảng này** với format/ví dụ rõ ràng
3. **Dùng trong templates** thay vì hardcode

Điều này đảm bảo convention nhất quán và người fill sau có reference.