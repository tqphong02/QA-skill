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
bash integration/github/scripts/doctor-antigravity.sh
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

Dùng Node.js để ghi entry (tránh BOM do PowerShell sinh ra):

```powershell
node -e "
const fs = require('fs'), os = require('os');
const p = os.homedir() + '\\.gemini\\\\config\\\\mcp_config.json';
let raw = fs.readFileSync(p, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const obj = JSON.parse(raw);
obj.mcpServers.github = { serverUrl: 'https://api.githubcopilot.com/mcp/', disabled: false };
fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
console.log('OK');
"
```

Sau khi lưu, restart Antigravity rồi chạy `/mcp`

### Doctor trên Windows

Script `doctor-antigravity.sh` dùng bash; trên Windows cần WSL có `/bin/bash`. Nếu WSL chưa cài, dùng Python để xác nhận cấu hình:

```powershell
python -c "
import json, sys
path = r'%USERPROFILE%\.gemini\config\mcp_config.json'
import os; path = os.path.expandvars(path)
with open(path, encoding='utf-8-sig') as f:
    data = json.load(f)
server = data.get('mcpServers', {}).get('github')
if not isinstance(server, dict):
    sys.exit('FAILED github entry missing')
if server.get('disabled', False):
    sys.exit('FAILED github MCP is disabled')
print('PASS', server.get('serverUrl'))
"
```
