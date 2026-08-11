# Kết nối Postman MCP

## Chọn phạm vi tool

| Mode | Endpoint | Dùng khi |
|---|---|---|
| Minimal | `https://mcp.postman.com/minimal` | mặc định, đọc workspace và thao tác phổ biến với ít tool |
| Code | `https://mcp.postman.com/code` | cần context cho code và API development |
| Full | `https://mcp.postman.com/mcp` | cần toàn bộ collection, spec, mock hoặc monitor management |

Ưu tiên Minimal để giảm token và tránh chọn nhầm tool.

## OAuth cho Codex

Codex CLI trên máy này dùng cờ `--url` cho streamable HTTP:

```bash
codex mcp add postman --url https://mcp.postman.com/minimal
codex mcp login postman
codex mcp get postman
```

Tài liệu Postman có thể hiển thị tên cờ `--remote-url` cho phiên bản Codex khác. Luôn chạy `codex mcp add --help` và dùng cú pháp của binary đang cài.

Mở phiên Codex mới rồi smoke test read-only:

```text
Dùng Postman MCP liệt kê workspace mà account hiện tại có quyền, không thay đổi gì
```

Không paste Postman API key vào prompt hoặc commit environment có secret. EU endpoint hiện yêu cầu API key; chỉ cấu hình qua secret manager hoặc environment local được bảo vệ.

Tài liệu chính chủ: <https://learning.postman.com/docs/reference/postman-api/postman-mcp-server/postman-mcp-remote-server/>

## OAuth cho Antigravity

Ưu tiên cài skill và tự merge global config:

```bash
./scripts/setup.sh --agent=antigravity --only=postman --yes
```

Bootstrap giữ nguyên các MCP khác và backup config cũ. Nếu cần cấu hình thủ công, bật entry `postman` trong `.agents/mcp_config.json` hoặc thêm vào `~/.gemini/config/mcp_config.json`:

```json
{
  "mcpServers": {
    "postman": {
      "serverUrl": "https://mcp.postman.com/minimal",
      "disabled": false
    }
  }
}
```

Restart Antigravity, chạy `/mcp`, hoàn tất OAuth rồi smoke test read-only như Codex

## Chẩn đoán

```bash
bash integration/github/scripts/doctor-stack.sh --agent=codex postman
bash integration/github/scripts/doctor-stack.sh --agent=antigravity postman
codex mcp list
```

Phân biệt rõ `mcp_not_configured`, `auth_required`, `workspace_permission_denied` và `mcp_not_loaded`.
