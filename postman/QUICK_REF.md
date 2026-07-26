# Postman MCP Quick Reference

## Hướng dẫn kết nối nhanh trên Antigravity IDE

Khi cài đặt hoặc cấu hình máy chủ Postman MCP qua giao diện IDE Antigravity, thực hiện theo các bước chuẩn sau:

### 1. Cách cài đặt qua giao diện (Marketplace / Extensions)

- Mở mục quản lý MCP trong Antigravity IDE
- Tìm máy chủ `postman` và bấm nút màu xanh `Install`
- Sau khi cài đặt xong, bấm vào tab `Configure` hoặc nút `Authenticate` để kết nối tài khoản

### 2. Cách tạo Postman API Key miễn phí (Nếu IDE yêu cầu nhập Key)

Tài khoản Postman Free (gói miễn phí cá nhân) hoàn toàn có thể tạo API Key miễn phí để sử dụng cho MCP:

- Mở trình duyệt và truy cập URL quản lý khóa API: `https://web.postman.co/settings/me/api-keys`
- Bấm nút `Generate API Key`, nhập tên gợi nhớ (ví dụ `antigravity-mcp`) và bấm `Generate`
- Copy chuỗi mã key bắt đầu bằng `PMAK-...` (lưu ý copy ngay vì Postman chỉ hiển thị mã 1 lần duy nhất)
- Dán chuỗi `PMAK-...` vào ô yêu cầu API Key trên màn hình Configure của Antigravity và lưu lại
- Bấm nút `Refresh` (mũi tên xoay tròn góc trên bên phải) hoặc khởi động lại (Restart) IDE để nạp kết nối mới

### 3. Kiểm tra chẩn đoán và phục hồi lỗi kết nối

Khi gặp lỗi `Unauthorized` hoặc `auth_required`:
- Đảm bảo đã bấm nút `Refresh` hoặc khởi động lại IDE sau khi dán API Key
- Chạy lệnh kiểm tra chẩn đoán từ terminal:

```bash
python3 scripts/bootstrap.py --agent=antigravity --check
```

### 4. Smoke test sau kết nối

Ngay sau khi trạng thái chuyển sang Connected, thực hiện lệnh kiểm tra chỉ đọc (read-only) trước khi chạy test thực tế:

```text
Dùng Postman MCP liệt kê danh sách workspace hiện tại mà không thay đổi dữ liệu
```
