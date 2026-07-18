# WINDOWS-SETUP.md — Chạy 4 QA skill trên Windows

> Hướng dẫn chi tiết cho máy Windows 10/11.

---

## ⚡ Quick start — chạy 1 lệnh duy nhất (Recommended)

Khuyến nghị dùng **WSL2** (Windows Subsystem for Linux). Bash shell thuần → setup.sh chạy 100% như macOS/Linux.

### Cách 1 — WSL2 (Recommended)

```powershell
# 1. Cài WSL2 (1 lần, cần admin)
wsl --install

# 2. Khởi động Ubuntu (mặc định)
wsl

# 3. Trong WSL Ubuntu, cài Python ≥3.10 + Node ≥20:
sudo apt update
sudo apt install -y python3.11 python3-pip curl git
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 4. Clone + setup (1 lệnh duy nhất):
git clone git@github.com:tqphong02/QA-skill.git ~/projects/QA-skill
cd ~/projects/QA-skill && ./scripts/setup.sh
```

### Cách 2 — Git Bash native (chạy được, có cảnh báo)

Nếu không cài WSL, vẫn dùng Git Bash:

```bash
# 1. Cài Node ≥20 + Python ≥3.10 (1 lần):
winget install OpenJS.NodeJS.LTS Python.Python.3.11
# HOẶC tải từ nodejs.org + python.org, tick "Add to PATH"

# 2. Clone + setup:
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill
./scripts/setup.sh
```

Script tự động:
- Detect Windows Git Bash → warn "khuyến nghị WSL"
- Tự động dùng `--break-system-packages` cho pip trên Windows (PEP 668)
- Cp skill bằng `cp -R src dst` (không dùng POSIX `cp -R src/. dst/`)
- Color output fallback OK trên Git Bash

**Hướng dẫn bên dưới (phần A, B, ...) là FALLBACK** cho user:
- Không cài được WSL (vd máy công ty chặn)
- Cần hiểu chi tiết từng bước (debug)
- Dùng PowerShell native (chưa có `setup.ps1`, dùng guide manual)

---

## A. Yêu cầu môi trường (cài 1 lần)

### 1. Cài Node.js ≥ 20
- Tải từ https://nodejs.org/en/download (chọn **Windows Installer .msi**, LTS 20.x hoặc 22.x)
- Hoặc dùng `winget` (Windows 11 có sẵn):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- Verify:
  ```bash
  node --version
  npm --version
  ```

### 2. Cài Git
- Tải từ https://git-scm.com/download/win (Git for Windows)
- Bao gồm **Git Bash** (khuyến nghị dùng cái này cho giống macOS/Linux)
- Verify:
  ```bash
  git --version
  ```

### 3. Cài Python 3 (cho script Plane)
- Tải từ https://www.python.org/downloads/windows/
- **Quan trọng**: tick "Add Python to PATH" khi cài
- Verify:
  ```bash
  python --version
  python3 --version
  ```
  Trên Windows `python3` có thể không có, dùng `python` được.

### 4. (Tuỳ chọn) Cài cURL + jq
- Windows 10+ đã có `curl` sẵn (PowerShell có `Invoke-WebRequest`)
- `jq`: tải từ https://stedolan.github.io/jq/download/ (chọn **win64.exe**), đổi tên thành `jq.exe`, copy vào `C:\Windows\System32\`

### 5. Cài Claude Code (nếu chưa)
- Tải từ https://claude.com/download
- Hoặc: `winget install Anthropic.ClaudeCode`

---

## B. Setup SSH key cho GitHub (1 lần)

Nếu máy Windows **đã có** key từ máy macOS cũ → copy file qua. Nếu **chưa có** → tạo mới.

### Cách 1 — Copy key từ máy macOS (khuyến nghị)
Trên máy macOS, in private key:
```bash
cat ~/.ssh/id_ed25519_tqphong02
# Copy toàn bộ output (bao gồm -----BEGIN và -----END)
```

Trên Windows, lưu vào `C:\Users\<USER>\.ssh\id_ed25519_tqphong02` (Git Bash: `/c/Users/<USER>/.ssh/id_ed25519_tqphong02`):
```bash
# Trong Git Bash
mkdir -p ~/.ssh
nano ~/.ssh/id_ed25519_tqphong02
# Paste nội dung, Ctrl+O → Enter → Ctrl+X
chmod 600 ~/.ssh/id_ed25519_tqphong02
```

### Cách 2 — Tạo key mới
```bash
ssh-keygen -t ed25519 -C "tqphong02@users.noreply.github.com" -f ~/.ssh/id_ed25519_tqphong02
cat ~/.ssh/id_ed25519_tqphong02.pub
# Copy public key, vào GitHub → Settings → SSH and GPG keys → New SSH key → paste
```

### Test SSH kết nối
```bash
ssh -T git@github.com
# Expected: "Hi tqphong02! You've successfully authenticated..."
```

---

## C. Clone repo

### Git Bash (khuyến nghị)
```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill
ls
# Phải thấy: qa-run/  testcase-template/  playwright-pom-automation/  LICENSE  README.md  SETUP-GUIDE.md
```

### PowerShell
```powershell
New-Item -ItemType Directory -Path "$HOME\projects" -Force
cd $HOME\projects
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill
Get-ChildItem
```

### Nếu dùng HTTPS thay SSH
```bash
git clone https://github.com/tqphong02/QA-skill.git
# Sẽ hỏi username + Personal Access Token (KHÔNG phải password)
```

---

## D. Copy 3 skill vào `~/.claude/skills/`

### Git Bash
```bash
mkdir -p ~/.claude/skills

for s in qa-run testcase-template playwright-pom-automation doc-to-md plane-qa google-drive-qa; do
  cp -R "$s" "$HOME/.claude/skills/"
done

# Verify
ls ~/.claude/skills/
# → phải thấy 3 folder + các skill khác (nếu có)
```

### PowerShell
```powershell
New-Item -ItemType Directory -Path "$HOME\.claude\skills" -Force

foreach ($s in @("qa-run", "testcase-template", "playwright-pom-automation")) {
  Copy-Item -Path $s -Destination "$HOME\.claude\skills\" -Recurse -Force
}

Get-ChildItem "$HOME\.claude\skills\"
```

> **Quan trọng**: Vị trí trên Windows là `C:\Users\<USER>\.claude\skills\<skill-name>\SKILL.md`. Claude Code auto-load từ đây.

---

## E. Cài dependencies (chỉ cho qa-run)

### Git Bash
```bash
cd ~/.claude/skills/qa-run
npm install
```

### PowerShell
```powershell
cd $HOME\.claude\skills\qa-run
npm install
```

Lần đầu chạy có thể cài **Playwright browsers** (~300MB):
```bash
npx playwright install chromium
```

---

## F. Tạo file `.env` cho Plane API

Tạo folder dự án test (vd `MyApp`):
```bash
mkdir -p ~/Documents/QA-MDS/MyApp
cd ~/Documents/QA-MDS/MyApp
```

### Git Bash — tạo `.env`
```bash
cat > .env <<'EOF'
PLANE_API_KEY=plane_pat_xxx_your_own_key
PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
PLANE_WORKSPACE=mds-team
QA_BASE_URL=https://your-app.example.com
QA_EMAIL=you@example.com
QA_PASSWORD=your_password
EOF
```

### PowerShell — tạo `.env`
```powershell
@"
PLANE_API_KEY=plane_pat_xxx_your_own_key
PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
PLANE_WORKSPACE=mds-team
QA_BASE_URL=https://your-app.example.com
QA_EMAIL=you@example.com
QA_PASSWORD=your_password
"@ | Out-File -FilePath .env -Encoding utf8
```

### Bảo mật file `.env`
```bash
# Git Bash
chmod 600 .env

# PowerShell (restrict file access)
icacls .env /inheritance:r /grant:r "$($env:USERNAME):(R,W)"
```

### Lấy `PLANE_API_KEY`
Vào https://projects.metasolutions.ai → login tài khoản của bạn → **Profile Settings** → **Personal Access Tokens** → **Generate**.

---

## G. Smoke test (4 bước verify)

### Test 1: Node version
```bash
node --version
# Phải ≥ v20
```

### Test 2: tdata.mjs
```bash
node -e "import(process.env.USERPROFILE ? process.env.USERPROFILE.replace(/\\/g,'/') + '/.claude/skills/qa-run/lib/tdata.mjs' : '').then(m => console.log(m.tdata('smoke','firstRun')))"
```
**Git Bash version** (dễ hơn):
```bash
node -e "import(require('os').homedir() + '/.claude/skills/qa-run/lib/tdata.mjs').then(m => console.log(m.tdata('smoke','firstRun')))"
```
Output: `smoke_firstrun_<14-số>_<4-hex>` (vd `smoke_firstrun_20260702160000_A1B2`)

### Test 3: fetch-plane-issue.sh
```bash
# Git Bash có thể chạy .sh trực tiếp (đã cài Git for Windows)
cd ~/Documents/QA-MDS/MyApp
bash ~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh 9482533a-c9ca-4be6-be3f-2c74b1b54137 466 | head -20
```
Nếu dùng **PowerShell** (không có bash sẵn):
- Cách A: dùng Git Bash (khuyến nghị)
- Cách B: cài WSL `wsl --install`, chạy trong WSL
- Cách C: dùng GitHub Actions (chạy trên Linux runner)

Expected output: JSON đầy đủ của issue hoặc `❌ 401` (nếu API key sai).

### Test 4: Claude Code load skills
Mở Claude Code mới, gõ:
```
/skills
```
Phải thấy 3 skill: `qa-run`, `testcase-template`, `playwright-pom-automation`.

Hoặc thử:
```
Hãy sinh test case cho ticket https://projects.metasolutions.ai/mds-team/projects/9482533a-c9ca-4be6-be3f-2c74b1b54137/issues/466/
```
→ Nếu Claude dùng `fetch-plane-issue.sh` thành công → skill đang hoạt động.

---

## H. Khác biệt Windows vs macOS — cheatsheet

| | macOS / Linux | Windows (Git Bash) | Windows (PowerShell) |
|---|---|---|---|
| Home dir | `~/.claude/skills/` | `~/.claude/skills/` → `C:\Users\<USER>\.claude\skills\` | `$HOME\.claude\skills\` |
| Env var trong shell | `export X=y` | `export X=y` | `$env:X = "y"` |
| Đọc `.env` | tự động (driver.mjs dùng `process.loadEnvFile`) | ✅ tự động | ✅ tự động |
| Chạy `.sh` script | ✅ | ✅ (Git Bash) | ❌ (cần WSL hoặc Git Bash) |
| Path trong Node import | `~/...` không hoạt động | dùng `require('os').homedir()` | `$env:USERPROFILE` |
| Backslash | `/` (slash) | `/` (slash, Git Bash) | `\` (backslash) |

---

## I. Lỗi thường gặp trên Windows

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `node: command not found` | Chưa cài Node hoặc PATH chưa update | Restart terminal sau khi cài; verify `where node` (PowerShell) hoặc `which node` (Bash) |
| `Cannot find module 'playwright'` | Chưa `npm install` | `cd ~/.claude/skills/qa-run && npm install` |
| `❌ Thiếu PLANE_API_KEY` | `.env` không ở cwd hoặc sai tên | `cd ~/Documents/QA-MDS/MyApp` rồi mới chạy script |
| `bash: command not found` (PowerShell) | PowerShell không có bash | Mở Git Bash thay vì PowerShell, hoặc cài WSL |
| `'bash' is not recognized` | Chưa cài Git for Windows | Tải https://git-scm.com/download/win |
| Permission denied khi `chmod` | Windows không có chmod thật | Bỏ qua (Git Bash có nhưng không cần thiết) |
| `import()` với path `~` fail | Node không expand `~` | Dùng `require('os').homedir()` hoặc path tuyệt đối |
| `HOMEDRIVE` undefined | Biến Windows khác Linux | Dùng `process.env.USERPROFILE` thay `~` |
| Line ending (CRLF vs LF) trong `.sh` | Windows convert CRLF | Dùng Git Bash (LF được preserve); hoặc `dos2unix fetch-plane-issue.sh` |

### Fix CRLF nhanh nếu script lỗi
```bash
# Git Bash
dos2unix ~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh
# Hoặc thủ công:
sed -i 's/\r$//' ~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh
```

---

## J. Workflow đề xuất trên Windows

1. **Mở Git Bash** (không dùng PowerShell)
2. **cd vào project** (vd `cd ~/Documents/QA-MDS/MyApp`)
3. **Mở Claude Code** trong cùng folder đó
4. **Dùng skill** — Claude sẽ tự load 3 skill từ `~/.claude/skills/`

Ví dụ session điển hình:
```bash
cd ~/Documents/QA-MDS/Spout
code .                 # nếu dùng VS Code
claude                 # mở Claude Code

# Trong Claude:
> Hãy log bug lên Plane: ticket 466 bị crash khi tạo event trên iOS Calendar
# → Claude dùng qa-run → lái UI → log Plane
```

---

## K. Update skill sau này (pull về)

```bash
cd ~/projects/QA-skill
git pull

# Re-copy vào ~/.claude/skills/
for s in qa-run testcase-template playwright-pom-automation doc-to-md plane-qa google-drive-qa; do
  cp -R "./$s/." "$HOME/.claude/skills/$s/"
done

# Nếu package.json thay đổi
cd ~/.claude/skills/qa-run && npm install
```

Hoặc dùng symlink (auto-sync, **chỉ khi bạn hiểu rủi ro**):
```bash
# Backup trước
for s in qa-run testcase-template playwright-pom-automation doc-to-md plane-qa google-drive-qa; do
  if [ -d "$HOME/.claude/skills/$s" ] && [ ! -L "$HOME/.claude/skills/$s" ]; then
    mv "$HOME/.claude/skills/$s" "$HOME/.claude/skills/${s}.bak"
  fi
  rm -rf "$HOME/.claude/skills/$s"
  ln -s "$HOME/projects/QA-skill/$s" "$HOME/.claude/skills/$s"
done

# Sau này chỉ cần:
cd ~/projects/QA-skill && git pull
# → ~/.claude/skills/ tự động sync
```

---

## L. Khuyến nghị nâng cao (optional)

1. **Dùng WSL2** thay Git Bash nếu cần Linux thật (hỗ trợ `apt`, `systemd`, v.v.)
   ```powershell
   wsl --install
   # Trong WSL, clone repo, mọi thứ y hệt macOS
   ```
2. **VS Code + WSL extension**: code Windows nhưng chạy trong WSL — thoải mái hơn Git Bash
3. **Tự động copy khi git pull**: tạo hook `post-merge` để copy vào `~/.claude/skills/` tự động
4. **Dùng git-lfs** nếu sau này có file lớn (screenshots mẫu, v.v.)