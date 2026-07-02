# SETUP-GUIDE — Push 3 skill lên GitHub → clone máy khác chạy

> Hướng dẫn này dành cho **3 skill** trong `~/.claude/skills/`:
> - `qa-run/` (engine + 2 helper mới)
> - `testcase-template/`
> - `playwright-pom-automation/`

---

## Tổng quan flow

```
MÁY A (hiện tại)                          MÁY B (mới)
─────────────────                         ─────────────
~/.claude/skills/                          ~/.claude/skills/
├── qa-run/                                ├── qa-run/  ← git clone
├── testcase-template/                     ├── testcase-template/  ← git clone
└── playwright-pom-automation/             └── playwright-pom-automation/  ← git clone
       │                                          │
       └─→ git init, commit, push ─→ GitHub ─→ git clone + setup
```

---

## A. Trên MÁY A (push)

### A.1 Kiểm tra secret đã sạch (đã chạy)

✅ KHÔNG có API key, password, token hardcoded trong 3 skill. Chỉ có `.env.example` (template) và script `fetch-plane-issue.sh` (đọc env từ file).

### A.2 Chuẩn bị folder tách biệt (KHUYẾN NGHỊ)

**Không nên** init git ngay tại `~/.claude/skills/` vì:
- Folder này có nhiều skill khác (playwright-pom-automation là skill global, có thể có skill khác cùng tồn tại).
- Dễ lỡ commit file cá nhân (auth.json, .env).

**Nên** tạo folder mới chỉ chứa 3 skill cần push:

```bash
# Tạo folder tách biệt
mkdir -p ~/projects/qa-skills
cd ~/projects/qa-skills

# Copy 3 skill vào (KHÔNG copy node_modules, .env, evidence, auth.json)
for s in qa-run testcase-template playwright-pom-automation; do
  rsync -a --exclude='node_modules' --exclude='.DS_Store' \
    --exclude='.env' --exclude='auth.json' --exclude='evidence' \
    "$HOME/.claude/skills/$s/" "./$s/"
done
```

> Nếu muốn dùng symlink (cho phép sửa 1 chỗ, 2 bên sync):
> ```bash
> for s in qa-run testcase-template playwright-pom-automation; do
>   ln -s "$HOME/.claude/skills/$s" "./$s"
> done
> ```
> ⚠️ Symlink dễ commit nhầm nếu quên `.gitignore` rule.

### A.3 Tạo `.gitignore` (ĐÃ TẠO SẴN)

File `.gitignore` đã có sẵn trong:
- `~/.claude/skills/qa-run/.gitignore` (sẵn)
- `~/.claude/skills/testcase-template/.gitignore` (vừa tạo)
- `~/.claude/skills/playwright-pom-automation/.gitignore` (vừa tạo)

Đã loại: `node_modules/`, `.env`, `auth.json`, `evidence/`, `.DS_Store`, IDE files, test outputs.

### A.4 Tạo file LICENSE (khuyến nghị)

```bash
cd ~/projects/qa-skills
# MIT License
cat > LICENSE <<'EOF'
MIT License

Copyright (c) 2026 MDS Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, ...
EOF
```

### A.5 Init git + commit + push

```bash
cd ~/projects/qa-skills

# Khởi tạo git
git init
git branch -M main

# Cấu hình user (nếu máy mới chưa có)
git config user.email "you@example.com"
git config user.name "Your Name"

# Verify chỉ có 3 skill trong repo
ls -la
# Phải thấy: qa-run/  testcase-template/  playwright-pom-automation/  LICENSE  .gitignore (nếu có top-level)

# Check KHÔNG có file nhạy cảm
git status
# Phải KHÔNG thấy: .env, auth.json, node_modules/, evidence/

# Add + commit
git add .
git commit -m "Initial commit: 3 QA skills (qa-run, testcase-template, playwright-pom-automation)

- qa-run: exploratory + Plane integration + 2 helper (tdata, fetch-plane-issue)
- testcase-template: Excel template generator (Nina Studio format)
- playwright-pom-automation: Playwright + TS + POM scaffold
- Merged concepts from anhtester/codex-testing-kit (MIT, 7⭐)"

# Tạo repo trên GitHub (cách tay): https://github.com/new
# Tên gợi ý: mds-qa-skills hoặc claude-qa-toolkit
# KHÔNG tick "Initialize with README" vì đã có local repo

# Add remote + push
git remote add origin git@github.com:YOUR_ORG/mds-qa-skills.git
# (hoặc dùng HTTPS: git remote add origin https://github.com/YOUR_ORG/mds-qa-skills.git)

git push -u origin main
```

### A.6 Verify trên GitHub

Vào https://github.com/YOUR_ORG/mds-qa-skills kiểm tra:
- ✅ 3 folder: `qa-run/`, `testcase-template/`, `playwright-pom-automation/`
- ❌ KHÔNG thấy file `.env`, `auth.json`, `node_modules/`
- ✅ Có `LICENSE`, `.gitignore` (per-skill)
- ✅ Mỗi skill có `SKILL.md` ở root

---

## B. Trên MÁY B (clone + chạy)

### B.1 Yêu cầu môi trường

```bash
# Check đã có chưa
node --version       # cần ≥ 20 (script dùng process.loadEnvFile)
npm --version
git --version
python3 --version    # cần cho script Plane
curl --version       # cần cho fetch-plane-issue.sh
jq --version         # optional nhưng tiện
```

Nếu thiếu:
```bash
# macOS
brew install node git python3 jq

# Ubuntu/Debian
sudo apt install nodejs npm git python3 curl jq
```

### B.2 Clone repo

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/YOUR_ORG/mds-qa-skills.git
cd mds-qa-skills
ls
# → qa-run/  testcase-template/  playwright-pom-automation/  LICENSE
```

### B.3 Copy vào `~/.claude/skills/`

```bash
# Tạo folder nếu chưa có
mkdir -p ~/.claude/skills

# Copy 3 skill
for s in qa-run testcase-template playwright-pom-automation; do
  if [ -d "$HOME/.claude/skills/$s" ]; then
    echo "⚠️  $s đã tồn tại — backup trước:"
    mv "$HOME/.claude/skills/$s" "$HOME/.claude/skills/${s}.bak.$(date +%s)"
  fi
  cp -R "./$s" "$HOME/.claude/skills/"
done
```

### B.4 Cài dependencies (chỉ cho `qa-run`)

```bash
cd ~/.claude/skills/qa-run
npm install
# Cài: playwright, dotenv, v.v. (xem package.json)
```

### B.5 Tạo file `.env` cho Plane API

`fetch-plane-issue.sh` cần 3 biến env. Cách 1 — file `.env` trong thư mục dự án test:

```bash
# Tạo folder dự án test (vd Spout)
mkdir -p ~/Documents/QA-MDS/Spout
cd ~/Documents/QA-MDS/Spout

cat > .env <<'EOF'
PLANE_API_KEY=plane_pat_xxx_your_own_key
PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
PLANE_WORKSPACE=mds-team
QA_BASE_URL=https://your-app.example.com
QA_EMAIL=you@example.com
QA_PASSWORD=your_password
EOF
chmod 600 .env   # chỉ owner đọc được
```

**Lấy `PLANE_API_KEY`:** Vào https://projects.metasolutions.ai → Profile Settings → Personal Access Tokens → Generate.

### B.6 Smoke test

```bash
# Test 1: tdata helper
node -e "import('$HOME/.claude/skills/qa-run/lib/tdata.mjs').then(m => console.log(m.tdata('smoke', 'firstRun')))"
# → smoke_firstrun_<14-số YYYYMMDDHHMMSS>_<4-hex>

# Test 2: fetch-plane-issue.sh
cd ~/Documents/QA-MDS/Spout
bash ~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh 9482533a-c9ca-4be6-be3f-2c74b1b54137 466 | head -20
# → JSON của issue #466 (hoặc ❌ 401 nếu API key sai)

# Test 3: verify skill auto-load
# Mở Claude Code mới, gõ /skills (xem có 3 skill không)
```

---

## C. Checklist "đã chạy được"

- [ ] Clone repo về máy B thành công
- [ ] 3 folder copy vào `~/.claude/skills/`
- [ ] `npm install` trong `qa-run/` thành công
- [ ] File `.env` đã tạo với API key cá nhân, chmod 600
- [ ] `node -e "...tdata..."` in ra token
- [ ] `fetch-plane-issue.sh <pid> <seq>` trả JSON issue (không phải 401)
- [ ] Mở Claude Code mới → gõ `/skills` thấy 3 skill
- [ ] Trong Claude Code, nói: "Sinh test case cho ticket https://..." → AI tự fetch Plane + gen Excel
- [ ] Trong Claude Code, nói: "Viết test cho trang login" → AI dùng pom-automation sinh spec

---

## D. Lỗi thường gặp + cách fix

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `node: command not found` | Chưa cài Node | `brew install node` |
| `Cannot find module 'playwright'` | Chưa `npm install` | `cd qa-run && npm install` |
| `❌ Thiếu PLANE_API_KEY` | `.env` không ở cwd hoặc sai tên biến | Đảm bảo `cd ~/Documents/QA-MDS/Spout` rồi mới chạy script, file `.env` có `PLANE_API_KEY=...` |
| `401 Unauthorized` | API key sai/expire | Rotate key ở Plane Profile |
| `404 Not Found` | Sai `project_id` hoặc `sequence_id` | Check lại URL ticket |
| Skill không xuất hiện trong Claude | Folder chưa đúng vị trí | Verify path là `~/.claude/skills/<name>/SKILL.md` (KHÔNG có dash ở giữa) |
| `node: cannot find module 'tdata.mjs'` (dù import đúng path) | Sai path tuyệt đối | Dùng path đầy đủ: `import('$HOME/.claude/skills/qa-run/lib/tdata.mjs')` |
| Push lên GitHub mà lộ auth.json | Quên `.gitignore` | `git rm --cached auth.json` rồi commit fix gitignore, **rotate key** ngay |

---

## E. Khuyến nghị bảo mật

1. **KHÔNG commit `.env`** — đã có `.gitignore` nhưng check lại bằng `git status` trước mỗi commit.
2. **Rotate API key định kỳ** — mỗi 3-6 tháng, hoặc ngay khi nghi lộ.
3. **Dùng SSH thay HTTPS** cho git remote (không phải nhập password mỗi push).
4. **Cân nhắc private repo** nếu skill có code đặc thù team — public repo OK nếu không nhạy cảm.
5. **Bận 2FA** cho tài khoản GitHub + Plane.
6. **Audit thường xuyên**: `git log --all --full-history -- .env auth.json` xem có lỡ commit secret không.

---

## F. Cập nhật sau này

```bash
# Trên máy A — sau khi sửa skill
cd ~/projects/qa-skills
git add .
git commit -m "fix(qa-run): tdata.mjs thêm helper parseTdata"
git push

# Trên máy B — pull về
cd ~/projects/mds-qa-skills
git pull
# Sau đó copy lại vào ~/.claude/skills/:
for s in qa-run testcase-template playwright-pom-automation; do
  cp -R "./$s/." "$HOME/.claude/skills/$s/"
done
```

Hoặc dùng symlink (auto-sync, nhưng cẩn thận `.gitignore`):

```bash
# Trên máy B, lần đầu setup:
for s in qa-run testcase-template playwright-pom-automation; do
  rm -rf "$HOME/.claude/skills/$s"
  ln -s "$HOME/projects/mds-qa-skills/$s" "$HOME/.claude/skills/$s"
done

# Sau này chỉ cần: cd ~/projects/mds-qa-skills && git pull
# → auto-sync vào ~/.claude/skills/ vì symlink
```
