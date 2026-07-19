# Setup QA-skill trên máy mới

Repository phân phối 16 skill. Danh sách canonical nằm trong `scripts/setup_lib.sh` tại `DEFAULT_SKILLS`.

## 1. Yêu cầu

- Git
- Bash trên macOS, Linux, WSL hoặc Git Bash
- Python 3.10+
- Node.js và npm
- Quyền truy cập repository

Các runner như k6, JMeter, Appium và MCP server chỉ cần cài khi task tương ứng yêu cầu.

## 2. Clone repository

```bash
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill
git status --short --branch
```

Không clone credential, `.env`, OAuth token, browser profile, evidence hoặc database config vào repository.

## 3. Cài skill cho từng agent

### Claude Code

```bash
./scripts/setup.sh --agent=claude --yes
```

Target là `~/.claude/skills`

### OpenAI Codex

```bash
./scripts/setup.sh \
  --agent=codex \
  --yes
```

Sau khi cài, mở phiên Codex mới. Skill tồn tại trong repository không có nghĩa là Codex đã discover được skill đó.

Target là `${CODEX_HOME:-$HOME/.codex}/skills`

### Google Antigravity

```bash
./scripts/setup.sh --agent=antigravity --yes
```

Target global của Antigravity IDE là `~/.gemini/config/skills`. Mở phiên mới rồi chạy `/skills`

Repository có `.agents/mcp_config.json` làm workspace MCP template. Mọi server mặc định `disabled` và không chứa credential

### Windows PowerShell

```powershell
.\scripts\setup.ps1 -Agent codex -Yes
.\scripts\setup.ps1 -Agent antigravity -Yes
.\scripts\setup.ps1 -Agent claude -Yes
```

PowerShell wrapper dùng Git Bash từ Git for Windows. Xem `WINDOWS-SETUP.md` khi cần WSL hoặc xử lý PATH

### Chỉ cài một số skill

```bash
./scripts/setup.sh \
  --agent=codex \
  --only=qa-run,testcase-template,performance-qa \
  --yes
```

### Dry-run

```bash
./scripts/setup.sh --agent=antigravity --dry-run
```

## 4. Cài dependency

Setup mặc định cài dependency cần thiết. Dùng `--skip-deps` khi chỉ muốn cập nhật Markdown và asset:

```bash
./scripts/setup.sh --agent=codex --skip-deps --yes
```

Kiểm tra các runtime chính:

```bash
node --version
npm --version
python3 --version
```

## 5. Kết nối MCP

MCP credential luôn thuộc máy và account người dùng, không thuộc repository.

### Google Drive

Làm theo `google-drive-qa/references/AUTH.md`, sau đó chạy Drive doctor và một read-only smoke test.

### GitHub, Chrome DevTools, k6, Postman và Database read-only

Đọc `github-mcp-qa/references/qa-mcp-stack-vi.md`, sau đó chạy:

```bash
bash github-mcp-qa/scripts/doctor-stack.sh --agent=codex
bash github-mcp-qa/scripts/doctor-stack.sh --agent=antigravity
```

Hướng dẫn chi tiết:

- GitHub Codex: `github-mcp-qa/references/codex-github-mcp-vi.md`
- GitHub Antigravity: `github-mcp-qa/references/antigravity-github-mcp-vi.md`
- Chrome DevTools và k6: `performance-qa/references/MCP_SETUP.md`
- Postman: `api-contract-qa/references/POSTMAN_MCP.md`
- Database read-only: `data-quality-qa/references/DATABASE_MCP.md`

Sau khi thêm hoặc đổi MCP, mở phiên agent mới. Codex kiểm tra bằng `codex mcp list`; Antigravity kiểm tra bằng `/mcp`. Trạng thái `configured` không tự chứng minh auth, permission hoặc tool loading đã thành công

## 6. Credential và profile local

- Plane dùng Personal API Key từ environment hoặc profile local được ignore
- Drive dùng OAuth credential local
- GitHub dùng OAuth khi host hỗ trợ, nếu không dùng fine-grained PAT từ environment hoặc secret manager
- Postman dùng OAuth của active host
- Database dùng account hoặc role read-only thật
- Không đưa password, token, cookie, PAT, OAuth secret hoặc DSN vào Markdown, prompt hay Git

Kiểm tra file nhạy cảm trước commit:

```bash
git status --short
git diff --check
```

## 7. Validation

```bash
python3 scripts/validate_cross_model.py

for skill in */SKILL.md; do
  python3 /path/to/skill-creator/scripts/quick_validate.py "${skill%/SKILL.md}"
done
```

Các smoke test theo capability:

- `doc-to-md`: chạy không input phải in usage thay vì `$1: unbound variable`
- `performance-qa`: k6 mặc định chỉ một user; load lớn hơn một user phải bị chặn khi thiếu contract hoặc approval
- `accessibility-qa`: template package phải có `@axe-core/playwright`
- MCP: doctor rồi smoke test read-only trong phiên agent mới

## 8. Cập nhật skill

```bash
cd /path/to/QA-skill
git pull --ff-only
./scripts/setup.sh --agent=<codex|antigravity|claude> --yes
```

Giữ backup khi setup báo xung đột và không xóa thay đổi local chưa kiểm tra.

## 9. Lỗi thường gặp

| Triệu chứng | Lớp lỗi | Cách xử lý |
|---|---|---|
| Skill không xuất hiện | skill chưa được cài hoặc phiên chưa reload | kiểm tra `<skills-dir>/<name>/SKILL.md` rồi mở phiên mới |
| Skill có nhưng không có tool | MCP chưa cấu hình hoặc chưa loaded | chạy doctor, dùng `codex mcp list` hoặc Antigravity `/mcp`, rồi mở phiên mới |
| OAuth hết hạn | auth | login lại đúng MCP và đúng account |
| `command not found` | runtime | cài đúng binary/package rồi chạy doctor lại |
| `permission denied` | remote permission | xác nhận account, workspace, repository hoặc DB role |
| Database MCP có thể write | security boundary sai | revoke quyền ở database user và bật readonly MCP trước khi tiếp tục |
| k6 chuẩn bị chạy nhiều user | workload chưa được duyệt | dừng, hoàn thiện contract và xin approval |
