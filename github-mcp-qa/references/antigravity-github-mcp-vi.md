# Cài GitHub MCP cho Antigravity

## 1. Vị trí cấu hình

- Global: `~/.gemini/config/mcp_config.json`
- Theo workspace: `.agents/mcp_config.json`

Repository có `.agents/mcp_config.json` an toàn với các server mặc định `disabled`. Không ghi PAT vào file được commit

## 2. Cấu hình

Mở Antigravity → MCP Store → Manage MCP Servers → View raw config rồi thêm hoặc bật entry:

```json
{
  "mcpServers": {
    "github": {
      "serverUrl": "https://api.githubcopilot.com/mcp/",
      "disabled": false
    }
  }
}
```

Antigravity có thể thực hiện OAuth nếu host và server hỗ trợ luồng đăng ký tương ứng. Nếu OAuth không thành công, dùng PAT qua cơ chế secret hoặc environment của máy người dùng, không đặt token vào repository

## 3. Kiểm tra

Chạy doctor từ repository:

```bash
bash github-mcp-qa/scripts/doctor-antigravity.sh
```

Sau đó mở phiên Antigravity mới:

```text
/mcp
```

Xác nhận server `github` enabled và authenticated rồi yêu cầu read-only:

```text
Dùng GitHub MCP xác nhận account hiện tại và đọc danh sách workflow của owner/repo, không thay đổi gì
```

Chỉ thực hiện write sau khi đã xác nhận đúng account, repository, branch và permission

## 4. Windows

File global nằm tại `%USERPROFILE%\.gemini\config\mcp_config.json`

Mở file bằng PowerShell:

```powershell
notepad "$env:USERPROFILE\.gemini\config\mcp_config.json"
```

Sau khi lưu, restart Antigravity rồi chạy `/mcp`
