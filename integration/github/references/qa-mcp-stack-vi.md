# Kết nối MCP cho QA/QC

## Mục lục

1. Phân biệt skill và MCP
2. Kiểm tra trạng thái
3. Stack đề xuất
4. Trình tự kết nối
5. Ranh giới an toàn

## 1. Phân biệt skill và MCP

- Skill cung cấp routing, quy trình, hard gate và format bằng Markdown
- MCP server cung cấp tool runtime và có vòng đời cấu hình hoặc xác thực riêng
- CLI như `k6`, `newman` hoặc `psql` là runner độc lập, không tự trở thành MCP
- `quick_validate.py` chỉ xác nhận cấu trúc skill, không chứng minh MCP đã cài, đã login hoặc tool đã được nạp

Không báo `MCP không truy cập được` chỉ vì tool chưa xuất hiện trong phiên hiện tại. Phải xác định đúng một trong các lớp: `skill_missing`, `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded`, `permission_denied` hoặc `ready`.

## 2. Kiểm tra trạng thái

Chạy từ repository:

```bash
bash integration/github/scripts/doctor-stack.sh --agent=codex
codex mcp list

bash integration/github/scripts/doctor-stack.sh --agent=antigravity
# Sau đó chạy /mcp trong Antigravity
```

Sau khi thêm hoặc đổi MCP, mở phiên host mới rồi chạy smoke test read-only. `codex mcp list` hoặc Antigravity `/mcp` chỉ chứng minh cấu hình được host nhìn thấy; smoke test mới chứng minh server, auth và tool hoạt động

## 3. Stack đề xuất

| MCP | Skill sở hữu workflow | Trạng thái hoàn chỉnh khi |
|---|---|---|
| GitHub MCP | `integration-github` | cấu hình đúng endpoint, OAuth/PAT hợp lệ, đọc được repository đã chọn |
| Chrome DevTools MCP | `dynamic-performance` | server khởi động, mở được isolated Chrome, đọc console/network read-only |
| k6 MCP | `dynamic-performance` | `k6 x mcp` chạy được; load vẫn bị chặn bởi workload contract |
| Postman MCP | `postman` | OAuth/API key hợp lệ, liệt kê được workspace read-only |
| Database read-only MCP | `dynamic-data-quality` | DB role thật chỉ có quyền đọc, MCP readonly, row limit và query timeout đều bật |

Playwright đã đủ cho browser flow và UI automation. Chỉ bật Chrome DevTools khi cần network waterfall, console diagnosis, trace, Lighthouse hoặc Core Web Vitals để tránh nạp tool không cần thiết.

## 4. Trình tự kết nối

### GitHub

```bash
bash integration/github/scripts/install-codex.sh
bash integration/github/scripts/doctor-codex.sh
bash integration/github/scripts/doctor-antigravity.sh
```

OAuth/PAT của MCP độc lập với Git SSH. Chọn [guide Codex](codex-github-mcp-vi.md) hoặc [guide Antigravity](antigravity-github-mcp-vi.md) theo active host

### Chrome DevTools và k6

Đọc [dynamic-testing/performance/references/MCP_SETUP.md](../../../dynamic-testing/performance/references/MCP_SETUP.md) rồi cấu hình từng server. Không bật k6 cho một browser QA thông thường.

### Postman

Đọc [integration/postman/SKILL.md](../../../integration/postman/SKILL.md) để bootstrap và vận hành MCP. Đọc [hybrid-testing/api-contract/references/POSTMAN_MCP.md](../../../hybrid-testing/api-contract/references/POSTMAN_MCP.md) khi validate API contract. Bắt đầu bằng endpoint `minimal`; chỉ dùng `full` khi tool bắt buộc không có trong minimal.

### Database read-only

Đọc [dynamic-testing/data-quality/references/DATABASE_MCP.md](../../../dynamic-testing/data-quality/references/DATABASE_MCP.md). Không paste DSN hoặc password vào prompt, repository hay command history.

## 5. Ranh giới an toàn

- Chỉ bật MCP cần cho task hiện tại để giảm tool schema và nhầm routing
- Ưu tiên server do vendor hoặc dự án chính chủ duy trì
- Pin version khi dùng trong team hoặc CI
- Chạy read-only smoke test trước write test
- GitHub, Postman và database phải xác nhận đúng account, workspace hoặc database trước mutation
- Database phải enforce read-only tại DB user hoặc role; prompt và cờ MCP chỉ là lớp bảo vệ bổ sung
- k6/JMeter phải có target, authorization, rate, concurrency, duration, monitoring và abort condition trước load
- Chrome DevTools dùng profile isolated và không đọc cookie, token, PII hoặc session ngoài target được phép
