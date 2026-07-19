# Thiết lập Google Cloud OAuth cho Google Drive MCP

Guide này dùng cho lần cấu hình đầu tiên trước khi chạy `google-drive-qa` với Google Drive, Docs, Sheets và Slides

Không đưa OAuth client JSON, access token, refresh token hoặc file `tokens.json` vào Git, Markdown, chat hay evidence

## Mục lục

1. Chọn loại tài khoản và phạm vi sử dụng
2. Tạo Google Cloud project
3. Bật Google Workspace APIs
4. Cấu hình Google Auth Platform
5. Chọn Audience và Publishing status
6. Thêm OAuth scopes
7. Tạo OAuth Desktop client
8. Lưu credential ngoài repository
9. Chạy OAuth consent lần đầu
10. Kết nối MCP với Codex
11. Kết nối MCP với Antigravity IDE
12. Kiểm tra read-only
13. Xử lý lỗi thường gặp
14. Checklist hoàn tất

## 1. Chọn loại tài khoản và phạm vi sử dụng

Chọn một trong hai route trước khi tạo project

| Trường hợp | Audience nên chọn | Ghi chú |
|---|---|---|
| Tất cả user cùng Google Workspace công ty | `Internal` | Khuyến nghị cho team nội bộ, user ngoài domain không đăng nhập được |
| Gmail cá nhân hoặc có user ngoài domain | `External` | Cần thêm Test users khi ở trạng thái Testing và có thể cần Google verification khi dùng scope rộng |

Chọn scope profile

| Nhu cầu | Scope | Giới hạn |
|---|---|---|
| Chỉ file do app tạo hoặc user chủ động cấp cho app | `drive.file` | Không search hoặc CRUD toàn bộ file Drive hiện có |
| Full CRUD Drive hiện có, permissions và Shared Drives theo quyền user | `drive` | Scope rộng, External app có thể phải verification |

Skill này cần full CRUD nên dùng profile sau

```text
drive,documents,spreadsheets,presentations
```

## 2. Tạo Google Cloud project

1. Mở `https://console.cloud.google.com`
2. Đăng nhập đúng tài khoản sở hữu project
3. Nhấn project selector trên thanh trên cùng, cạnh logo Google Cloud
4. Nhấn `NEW PROJECT`
5. Nhập `Project name`, ví dụ `MDS QA Drive Connector`
6. Với Google Workspace, chọn đúng `Organization` và `Location`
7. Với Gmail cá nhân, để nguyên lựa chọn mặc định nếu không có Organization
8. Nhấn `CREATE`
9. Chờ project được tạo rồi mở lại project selector
10. Chọn đúng project vừa tạo trước khi thực hiện các bước tiếp theo

Không dùng chung project production của hệ thống nếu chưa được owner cho phép

## 3. Bật Google Workspace APIs

Thực hiện lần lượt cho bốn API

1. Mở menu ba gạch ở góc trên trái
2. Chọn `APIs & Services`
3. Chọn `Library`
4. Tìm `Google Drive API`
5. Mở kết quả chính chủ của Google rồi nhấn `ENABLE`
6. Quay lại `Library`
7. Tìm và bật `Google Docs API`
8. Tìm và bật `Google Sheets API`
9. Tìm và bật `Google Slides API`
10. Vào `APIs & Services` → `Enabled APIs & services`
11. Xác nhận đủ bốn API đều xuất hiện

Không cần bật Google Calendar API nếu skill chỉ làm Drive, Docs, Sheets và Slides

## 4. Cấu hình Google Auth Platform

1. Mở menu ba gạch ở góc trên trái
2. Chọn `Google Auth Platform`
3. Chọn `Branding`
4. Nếu thấy `Google Auth platform not configured yet`, nhấn `GET STARTED`
5. Tại `App Information`, nhập `App name`, ví dụ `MDS QA Workspace Connector`
6. Không đặt tên chứa thương hiệu Google theo cách khiến user hiểu đây là app chính chủ của Google
7. Tại `User support email`, chọn email support của team hoặc project owner
8. Nhấn `NEXT`
9. Tại `Audience`, chọn route đã quyết định ở bước 1
10. Nhấn `NEXT`
11. Tại `Contact Information`, nhập email nhận cảnh báo từ Google
12. Nhấn `NEXT`
13. Đọc Google API Services User Data Policy
14. Chỉ chọn đồng ý nếu project tuân thủ chính sách dữ liệu
15. Nhấn `CONTINUE`
16. Nhấn `CREATE`

## 5. Chọn Audience và Publishing status

### Google Workspace nội bộ

1. Vào `Google Auth Platform` → `Audience`
2. Xác nhận `User type` là `Internal`
3. Xác nhận project thuộc đúng Google Workspace organization
4. Không thêm Gmail cá nhân hoặc user ngoài domain vì họ không đăng nhập được

Internal app thường là lựa chọn đơn giản nhất cho team cùng domain và không cần public OAuth verification

### Gmail cá nhân hoặc External user

1. Vào `Google Auth Platform` → `Audience`
2. Xác nhận `User type` là `External`
3. Khi `Publishing status` là `Testing`, tìm phần `Test users`
4. Nhấn `ADD USERS`
5. Nhập từng email Google Account được phép dùng MCP
6. Nhấn `SAVE`

External app ở trạng thái Testing tạo refresh token có thể hết hạn sau 7 ngày

Nếu cần dùng ổn định lâu dài cho External users

1. Chuẩn bị homepage, privacy policy, domain verification và video demo theo yêu cầu Google
2. Vào `Google Auth Platform` → `Audience`
3. Dùng nút publish khi cấu hình đã sẵn sàng
4. Vào `Verification Center` để kiểm tra yêu cầu Branding và Data Access verification
5. Không tuyên bố production-ready khi scope rộng chưa được Google chấp thuận

## 6. Thêm OAuth scopes

1. Vào `Google Auth Platform` → `Data Access`
2. Nhấn `ADD OR REMOVE SCOPES`
3. Tìm và chọn các scope sau

```text
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
```

4. Kiểm tra scope `drive` có mô tả quyền xem, tạo, sửa và xóa file trong Google Drive
5. Nhấn `UPDATE` hoặc `SAVE` theo giao diện đang hiển thị
6. Quay lại `Data Access`
7. Xác nhận đủ bốn scope trong danh sách configured scopes

Nếu chỉ cần file app tạo hoặc user chọn, thay `drive` bằng `drive.file` để giảm quyền

Đổi scope sau khi đã đăng nhập bắt buộc phải consent lại để token có scope mới

## 7. Tạo OAuth Desktop client

1. Vào `Google Auth Platform` → `Clients`
2. Nhấn `CREATE CLIENT`
3. Tại `Application type`, chọn `Desktop app`
4. Không chọn `Web application`
5. Nhập `Name`, ví dụ `MDS QA Drive MCP Desktop`
6. Nhấn `CREATE`
7. Tại danh sách `OAuth 2.0 Client IDs`, mở client vừa tạo
8. Nhấn nút download JSON
9. Lưu file vào thư mục Downloads của máy
10. Đổi tên file thành `gcp-oauth.keys.json`

Không mở và paste nội dung JSON vào chat

## 8. Lưu credential ngoài repository

Package MCP tự đọc credential tại thư mục chuẩn sau

```text
~/.config/google-drive-mcp/gcp-oauth.keys.json
```

### macOS hoặc Linux

Thay `<downloaded-json>` bằng đường dẫn file vừa tải

```bash
mkdir -p "$HOME/.config/google-drive-mcp"
cp "<downloaded-json>" "$HOME/.config/google-drive-mcp/gcp-oauth.keys.json"
chmod 600 "$HOME/.config/google-drive-mcp/gcp-oauth.keys.json"
```

### Windows PowerShell

Thay `<downloaded-json>` bằng đường dẫn file vừa tải

```powershell
$driveMcpConfig = Join-Path $HOME ".config\google-drive-mcp"
New-Item -ItemType Directory -Force -Path $driveMcpConfig | Out-Null
Copy-Item "<downloaded-json>" (Join-Path $driveMcpConfig "gcp-oauth.keys.json")
```

Không đặt credential trong folder `QA-skill`

## 9. Chạy OAuth consent lần đầu

### macOS hoặc Linux

```bash
GOOGLE_DRIVE_MCP_SCOPES="drive,documents,spreadsheets,presentations" \
  npx -y @piotr-agier/google-drive-mcp auth
```

### Windows PowerShell

```powershell
$env:GOOGLE_DRIVE_MCP_SCOPES = "drive,documents,spreadsheets,presentations"
npx.cmd -y @piotr-agier/google-drive-mcp auth
```

Khi browser mở

1. Kiểm tra app name đúng với app bạn vừa tạo
2. Kiểm tra Google Account đúng tài khoản Drive cần sử dụng
3. Với External Testing, tài khoản phải nằm trong `Test users`
4. Đọc danh sách quyền trước khi chọn tiếp tục
5. Chỉ chấp thuận nếu project ID, app name và quyền đúng với cấu hình của bạn
6. Chờ terminal báo authentication thành công

Token được lưu ngoài repository tại

```text
~/.config/google-drive-mcp/tokens.json
```

Không mở hoặc in nội dung token để kiểm tra

## 10. Kết nối MCP với Codex

Xóa entry cũ trước chỉ khi bạn chủ động muốn thay cấu hình

```bash
codex mcp add google-drive \
  --env GOOGLE_DRIVE_MCP_SCOPES=drive,documents,spreadsheets,presentations \
  -- npx -y @piotr-agier/google-drive-mcp
```

Kiểm tra cấu hình

```bash
codex mcp get google-drive
codex mcp list
```

Mở Codex session mới sau khi thêm MCP

## 11. Kết nối MCP với Antigravity IDE

Chọn một trong hai vị trí

```text
Global: ~/.gemini/config/mcp_config.json
Workspace: <project-root>/.agents/mcp_config.json
```

Thêm hoặc bật entry sau

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@piotr-agier/google-drive-mcp"],
      "env": {
        "GOOGLE_DRIVE_MCP_SCOPES": "drive,documents,spreadsheets,presentations"
      },
      "disabled": false
    }
  }
}
```

Trên Windows, đổi `command` thành `npx.cmd` nếu Antigravity không resolve được `npx`

Sau khi lưu

1. Quit hoàn toàn Antigravity IDE
2. Mở lại đúng Project
3. Vào Agent panel → `...` → `Customizations` → `MCP`
4. Xác nhận `google-drive` đã enabled
5. Tạo conversation mới

## 12. Kiểm tra read-only

Yêu cầu agent chạy lần lượt

```text
Dùng google-drive MCP chạy authGetStatus và chỉ báo account cùng scope, không in token
```

```text
Dùng google-drive MCP chạy authTestFileAccess với một Drive URL tôi cung cấp, chỉ đọc metadata
```

```text
Dùng google-drive MCP list tối đa 5 file gần đây, không tạo, sửa, xóa hoặc đổi quyền
```

Chỉ kết luận CRUD ready khi

- MCP được host load
- Đúng Google Account
- Có đủ bốn scope
- Read-only smoke test thành công
- User đã cho phép các mutation cần thiết trước khi test create, update hoặc delete

## 13. Xử lý lỗi thường gặp

### `access_denied` hoặc user không được phép đăng nhập

- External Testing: thêm email tại `Google Auth Platform` → `Audience` → `Test users`
- Internal: dùng tài khoản cùng Google Workspace domain

### Refresh token hết hạn sau 7 ngày

- Kiểm tra app có phải `External` và `Testing`
- Với team cùng Workspace, chuyển sang project thuộc organization và Audience `Internal`
- Với External users lâu dài, chuẩn bị production và verification phù hợp

### `redirect_uri_mismatch`

- Xác nhận OAuth client type là `Desktop app`
- Không dùng Web application client cho flow mặc định
- Kiểm tra port callback local không bị chặn

### MCP có tool nhưng thiếu quyền

- Vào `Google Auth Platform` → `Data Access` kiểm tra scope
- Thu hồi consent cũ trong Google Account Permissions khi cần cấp lại toàn bộ scope
- Backup token cũ thay vì đưa token vào log
- Chạy lại lệnh auth và consent với đúng account

### `MCP not loaded`

- Kiểm tra MCP config đúng host và đúng project
- Restart Codex hoặc Quit hoàn toàn Antigravity IDE
- Mở conversation mới sau khi MCP được load

### `403` trên file hoặc folder

- Xác nhận account đã đăng nhập có quyền trên object
- Với Shared Drive, kiểm tra membership và role của account
- Scope OAuth không thể cấp quyền cao hơn quyền Drive thực tế của user

## 14. Checklist hoàn tất

- Đúng Google Cloud project
- Đã bật Drive, Docs, Sheets và Slides API
- Branding có support email và contact email hợp lệ
- Audience đúng `Internal` hoặc `External`
- External Testing đã thêm đúng Test users
- Đã cấu hình đủ scope theo nhu cầu
- OAuth client type là `Desktop app`
- Credential nằm ngoài repository
- Token nằm ngoài repository
- MCP host đã load
- Đã kiểm tra đúng Google Account và scope
- Read-only smoke test thành công

## Tài liệu chính chủ

- Google Drive Node.js quickstart: `https://developers.google.com/workspace/drive/api/quickstart/nodejs`
- Google OAuth clients: `https://support.google.com/cloud/answer/15549257`
- Google Drive API scopes: `https://developers.google.com/workspace/drive/api/guides/api-specific-auth`
- Google OAuth token expiration: `https://developers.google.com/identity/protocols/oauth2#expiration`
- Google Drive MCP package: `https://github.com/piotr-agier/google-drive-mcp`
