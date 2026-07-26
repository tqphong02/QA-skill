# Setup QA-skill trên Windows

## 1. Yêu cầu

- Git for Windows có Git Bash
- PowerShell 5.1 trở lên
- Python 3.10 trở lên trong PATH
- Node.js 20 trở lên trong PATH
- Codex, Antigravity hoặc Claude đã được cài theo host muốn dùng

Kiểm tra:

```powershell
git --version
python --version
node --version
npm --version
```

## 2. Clone

```powershell
git clone https://github.com/tqphong02/QA-skill.git
Set-Location QA-skill
```

Không copy `.env`, PAT, OAuth credential, database DSN, browser profile hoặc evidence vào repository

## 3. Cài skill

Codex:

```powershell
.\scripts\setup.ps1 -Agent codex -Profile core -Yes
```

Antigravity:

```powershell
.\scripts\setup.ps1 -Agent antigravity -Profile core -Yes
```

Claude Code:

```powershell
.\scripts\setup.ps1 -Agent claude -Profile core -Yes
```

Dry-run:

```powershell
.\scripts\setup.ps1 -Agent antigravity -Profile core -DryRun -SkipDeps -Yes

`-Profile core` cài 10 skill thường dùng và là mặc định. `-Profile full` cài đủ 16 skill

Khi chuyển từ full về core, installer chuyển skill chuyên sâu sang `qa-skill-disabled` ngoài discovery thay vì xóa

```powershell
.\scripts\setup.ps1 -Agent antigravity -Profile full -Yes
```
```

Target mặc định:

| Host | Windows path |
|---|---|
| Codex | `%USERPROFILE%\.codex\skills` |
| Antigravity | `%USERPROFILE%\.gemini\config\skills` |
| Claude | `%USERPROFILE%\.claude\skills` |

## 4. Kiểm tra

Trong Git Bash:

```bash
bash scripts/doctor-agent.sh --agent=codex
bash scripts/doctor-agent.sh --agent=antigravity
```

Mở lại host sau khi setup

- Codex: mở phiên mới và yêu cầu dùng một skill cụ thể
- Antigravity: chạy `/skills` rồi `/mcp`
- Claude: mở phiên mới và kiểm tra danh sách skill

## 5. MCP

MCP và credential thuộc từng máy người dùng, không thuộc Git repository

- Codex dùng `codex mcp add`, `codex mcp get`, `codex mcp list`
- Antigravity dùng `%USERPROFILE%\.gemini\config\mcp_config.json` hoặc `.agents\mcp_config.json`
- Repository cung cấp `.agents\mcp_config.json` không chứa credential và mặc định disable mọi server

Trên Windows, một số stdio MCP cần đổi command từ `npx` thành `npx.cmd` nếu host không resolve PATHEXT. Chạy doctor để phân biệt `runtime_missing` với `mcp_not_configured`

## 6. WSL

Nếu Git Bash không chạy được dependency native, dùng WSL2:

```powershell
wsl --install
```

Sau đó clone repository bên trong filesystem WSL và chạy:

```bash
./scripts/setup.sh --agent=codex --yes
```

Không trộn `node_modules` giữa Windows và WSL

## 7. Cập nhật

```powershell
git pull --ff-only
.\scripts\setup.ps1 -Agent antigravity -Profile core -Yes
```

Installer backup skill cũ trước khi copy bản mới
