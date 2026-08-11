# Setup QA-skill trên máy mới

Repository phân phối 23 skill. Profile `core` cài 10 skill thường dùng; profile `full` cài đủ 23 skill. Script mặc định là `full` nếu không truyền profile, vì vậy nên chọn rõ `core` hoặc `full`. Danh sách canonical nằm trong `scripts/setup_lib.sh` tại `CORE_SKILLS` và `FULL_SKILLS`.

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
./scripts/setup.sh --agent=claude --profile=core --yes
```

Target là `~/.claude/skills`

### OpenAI Codex

```bash
./scripts/setup.sh \
  --agent=codex \
  --profile=core \
  --yes
```

Sau khi cài, mở phiên Codex mới. Skill tồn tại trong repository không có nghĩa là Codex đã discover được skill đó.

Target hiện tại của installer và doctor là `$HOME/.agents/skills`

### Google Antigravity

```bash
./scripts/setup.sh --agent=antigravity --profile=core --yes
```

Target global của Antigravity IDE là `~/.gemini/config/skills`. Mở phiên mới rồi chạy `/skills`

Repository có `.agents/mcp_config.json` làm workspace MCP template. Postman remote MCP được bật để khởi tạo OAuth; các server khác mặc định `disabled` và template không chứa credential

Khi profile có `integration-postman`, installer tự merge và bật Postman remote MCP trong `~/.gemini/config/mcp_config.json`, giữ nguyên các server khác và backup config cũ. Restart Antigravity, chạy `/mcp` rồi hoàn tất OAuth bằng account Postman

### Windows PowerShell

PowerShell wrapper dùng Git Bash từ Git for Windows

```powershell
# Codex
.\scripts\setup.ps1 -Agent codex -Profile core -Yes

# Antigravity
.\scripts\setup.ps1 -Agent antigravity -Profile core -Yes

# Claude Code
.\scripts\setup.ps1 -Agent claude -Profile core -Yes
```

Profile `core` gồm `dynamic-web-exploratory`, `support-testcase-authoring`, `dynamic-web-automation`, `support-document-conversion`, `static-requirements-analysis`, `dynamic-security-pentest`, `integration-plane`, `integration-google-drive`, `integration-github` và `integration-postman`

Profile `full` thêm `dynamic-data-quality`, `dynamic-ai-evaluation`, `hybrid-accessibility`, `dynamic-performance`, `hybrid-api-contract`, `dynamic-mobile`, `hybrid-source-coverage`, `adapter-browser-session`, `hybrid-ui-ux-review`, `governance-release-quality`, `static-supply-chain-security`, `dynamic-resilience` và `dynamic-compatibility`

```powershell
# Cài đủ 23 skill cho Codex
.\scripts\setup.ps1 -Agent codex -Profile full -Yes
```

Khi chuyển từ full về core, installer không xóa dữ liệu mà chuyển 13 skill chuyên sâu sang folder `qa-skill-disabled` nằm ngoài discovery. Backup khi cập nhật cũng nằm trong `qa-skill-backups` ngoài discovery. Chạy lại với `--profile=full` để cài bản mới khi cần

Kiểm tra trong Git Bash bằng cùng profile đã cài:

```bash
bash scripts/doctor-agent.sh --agent=codex --profile=core
```

Xem `WINDOWS-SETUP.md` khi cần WSL hoặc xử lý PATH

### Chỉ cài một số skill

```bash
./scripts/setup.sh \
  --agent=codex \
  --only=dynamic-web-exploratory,support-testcase-authoring,dynamic-performance \
  --yes
```

Để intern chỉ nhận đúng một skill:

```bash
./scripts/setup.sh --agent=codex --only=dynamic-web-exploratory --skip-deps --yes
```

Cài riêng Postman cho Antigravity:

```bash
./scripts/setup.sh --agent=antigravity --only=integration-postman --yes
```

Sau lệnh này installer cài local Postman CLI và Newman, rồi người dùng chỉ cần restart Antigravity, chạy `/mcp` và đăng nhập Postman. Dùng `--skip-mcp-setup` nếu không muốn thay đổi MCP config; dùng `--skip-deps` nếu không muốn cài hai CLI

Installer chỉ expose `dynamic-testing/web-exploratory/SKILL.md`. `vendor`, `tests` và mọi nested `SKILL.md` không được đưa vào thư mục discovery, nên chọn `dynamic-web-exploratory` không làm xuất hiện thêm các skill `understand-*`.

### Dry-run

```bash
./scripts/setup.sh --agent=antigravity --profile=core --dry-run
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

Lần đầu, làm theo `integration/google-drive/references/GOOGLE_CLOUD_OAUTH_SETUP.md` để tạo Google Cloud project, bật API, chọn Audience, thêm scope và tạo OAuth Desktop client

Khi credential đã tồn tại nhưng auth lỗi, làm theo `integration/google-drive/references/AUTH.md`, sau đó chạy Drive doctor và một read-only smoke test

### GitHub, Chrome DevTools, k6, Postman và Database read-only

Đọc `integration/github/references/qa-mcp-stack-vi.md`, sau đó chạy:

```bash
bash integration/github/scripts/doctor-stack.sh --agent=codex
bash integration/github/scripts/doctor-stack.sh --agent=antigravity
```

Hướng dẫn chi tiết:

- GitHub Codex: `integration/github/references/codex-github-mcp-vi.md`
- GitHub Antigravity: `integration/github/references/antigravity-github-mcp-vi.md`
- Chrome DevTools và k6: `dynamic-testing/performance/references/MCP_SETUP.md`
- Postman bootstrap và operations: `integration/postman/SKILL.md`
- Postman contract validation: `hybrid-testing/api-contract/references/POSTMAN_MCP.md`
- Database read-only: `dynamic-testing/data-quality/references/DATABASE_MCP.md`

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

- `support-document-conversion`: chạy không input phải in usage thay vì `$1: unbound variable`
- `dynamic-performance`: k6 mặc định chỉ một user; load lớn hơn một user phải bị chặn khi thiếu contract hoặc approval
- `hybrid-accessibility`: template package phải có `@axe-core/playwright`
- MCP: doctor rồi smoke test read-only trong phiên agent mới

## 8. Cập nhật skill

```bash
cd /path/to/QA-skill
git pull --ff-only
./scripts/setup.sh --agent=<codex|antigravity|claude> --profile=<core|full> --yes
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
