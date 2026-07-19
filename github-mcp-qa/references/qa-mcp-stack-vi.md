# MCP stack đề xuất cho QA/QC

## Mục lục

1. Stack đề xuất
2. Quy tắc bật MCP
3. Ranh giới an toàn

## 1. Stack đề xuất

| MCP | Dùng chính | Trạng thái trong QA-skill |
|---|---|---|
| GitHub MCP | Repository, PR, Issues, Actions CI/CD, security | Đã đóng gói qua `github-mcp-qa` |
| Chrome DevTools MCP | Network, console, trace, Lighthouse, frontend diagnosis | Nên bổ sung kế tiếp |
| k6 MCP | Sinh/chạy/đọc kết quả k6 performance test | Kết hợp `performance-qa`; cần workload guardrail |
| Postman MCP | Collection, environment, API collaboration và run | Kết hợp `api-contract-qa`; không commit secret environment |
| Database read-only MCP | Query và evidence data quality | Kết hợp `data-quality-qa`; phải dùng DB role read-only thật |
| Slack MCP | Nhận context, thông báo CI/bug/report | Cài sau cùng; write/send cần xác nhận và workspace admin policy |

JMeter không cần MCP để tạo project. Dùng `jmeter-qa` sinh `.jmx`, import vào JMeter GUI, review rồi chạy.

## 2. Quy tắc bật MCP

- Chỉ bật MCP cần cho task hiện tại để giảm tool schema và nhầm lẫn lựa chọn
- Ưu tiên MCP chính chủ hoặc do vendor duy trì
- Pin package/version khi dùng trong team hoặc CI
- Ghi rõ owner, auth mode, data scope, write capability, timeout, và cách revoke
- Chạy read-only smoke test trước write test
- Giữ credential ở máy người dùng, environment, keychain, vault, hoặc secret manager

## 3. Ranh giới an toàn

- Database: enforce read-only ở DB user/role; prompt `read-only` không phải security boundary
- k6/JMeter: xác nhận target, authorization, rate, concurrency, duration, và stop condition trước load
- Postman: tách environment template khỏi secret values
- Slack: đọc channel đúng workspace; xác nhận trước gửi, sửa, xóa, hoặc upload
- GitHub: xác nhận account/repository/branch trước mutation; destructive và security setting cần xác nhận ngay trước thao tác
- Chrome DevTools: không thu thập cookie, token, PII, hoặc session ngoài target được phép
