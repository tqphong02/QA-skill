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

### 5. Kiểm tra Postman CLI và Newman

Setup mặc định cài cả hai runtime cục bộ trong skill. Chạy:

```bash
python3 scripts/runner.py doctor
```

Chạy collection với Postman CLI ưu tiên và Newman fallback:

```bash
python3 scripts/runner.py run collection.json \
  --environment environment.json \
  --bail \
  --report-dir evidence/postman
```

Newman chỉ dùng cho collection JSON v2/v2.1. Collection v3 YAML phải chạy bằng Postman CLI

Automatic API testing với exact target và preflight fail-closed:

```bash
python3 scripts/runner.py api-test collection.json \
  --target https://api.example.test \
  --environment environment.json \
  --report-dir qa-runs/integration-postman/<run-id>/postman
```

Thêm `--dry-run` để chỉ kiểm tra collection, target, assertions và mutation safety. Collection có write method chỉ được chạy khi đã xác nhận authority với `--allow-mutations` và khai báo `--cleanup-item`

### 6. Push collection lên Postman app để chạy thủ công

Khi muốn mở collection trực tiếp trong Postman desktop hoặc web:

**Lấy API key miễn phí**: https://web.postman.co/settings/me/api-keys → Generate API Key → copy chuỗi `PMAK-...`

```bash
# Xem danh sách workspace (smoke test read-only)
POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py list-workspaces

# Dry-run — kiểm tra không gọi network
POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py push \
  collection.json --workspace <workspace-id> --dry-run

# Push — upload lên Postman, in ra URL mở ngay
POSTMAN_API_KEY=PMAK-... python3 scripts/push_to_workspace.py push \
  collection.json --workspace <workspace-id> --apply
```

Output khi thành công:
```
PASS collection_id=abc123 collection_name='Orders API' workspace=ws-xxx
URL https://web.postman.co/workspace/ws-xxx/collection/abc123
NEXT open Postman app or visit the URL above to run the collection
```

**Luồng đầy đủ: OpenAPI doc → Postman app**

```
openapi.json
  → gen_postman_collection.py   # sinh collection v2.1
  → push_to_workspace.py push   # upload lên workspace
  → mở Postman app              # chạy thủ công với UI
```

Không paste `POSTMAN_API_KEY` vào prompt hoặc commit vào repo. Đặt trong environment local hoặc secret manager
Luôn chọn chính xác `workspace-id`, xem dry-run trước, rồi mới dùng `--apply`. Nếu read-back sai ID/tên hoặc thất bại thì kết quả là `FAILED`, không phải `PASS`
