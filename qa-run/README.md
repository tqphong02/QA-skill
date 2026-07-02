# qa-run (global skill) — Exploratory QA cho mọi dự án

Skill QA **exploratory/ad-hoc** bằng AI lái UI (MCP Playwright) + script npm Playwright. **Một skill, chạy mọi project** — data lấy theo thư mục dự án đang test.

## 📚 Tài liệu
- **[GUIDE.md](GUIDE.md)** — hướng dẫn sử dụng + cheat-sheet (human-facing) ⭐ bắt đầu từ đây
- **[SKILL.md](SKILL.md)** — quy trình chi tiết (AI đọc khi kích hoạt)
- **[TESTING-TECHNIQUES.md](TESTING-TECHNIQUES.md)** — 12 kỹ thuật testing + coverage matrix
- **[references/UI-BUG-CATALOG.md](references/UI-BUG-CATALOG.md)** — 10 category bug UI

## ✨ Tính năng chính
- **AI lái UI tương tác** qua MCP Playwright (click/type/snapshot/probe API)
- **Hiểu ngữ cảnh trước khi lái** — đọc spec/ticket → map flow → mới test
- **Sanity retest từ 1 link ticket** (WebFetch → AC → verify → PASS/FAIL)
- **UI/UX testing sâu**: spam button, UI che content, vượt layout, double-fire, a11y (`ux-health.mjs`)
- **12 kỹ thuật** testing + **cross-browser/device** (`compat.mjs`)
- **Log bug Plane** với ảnh preview INLINE trong description (`log-bug.mjs`, 3 mode)
- **Test data tự tạo** theo business flow + cleanup `withRevert`
- **Antigravity fallback** nếu hết Claude Code

## 🚀 Quickstart
```bash
cd ~/.claude/skills/qa-run && npm install      # 1 lần cho cả máy

cd /path/to/MyProject/qa                        # thư mục QA của dự án
cp ~/.claude/skills/qa-run/.env.example .env    # điền QA_BASE_URL/EMAIL/PASSWORD (+ PLANE_*)
node ~/.claude/skills/qa-run/scripts/login.mjs  # → auth.json + evidence/ ở đây
```

## 📁 Cấu trúc (engine — KHÔNG chứa data dự án)
```
~/.claude/skills/qa-run/
├── GUIDE.md · SKILL.md · TESTING-TECHNIQUES.md · README.md
├── references/UI-BUG-CATALOG.md
├── lib/        # driver / ui / assert (engine Node thuần, portable)
├── scripts/    # login · sweep · explore · api-health · ux-health · compat · log-bug
├── report/     # REPORT-TEMPLATE · export-pdf · upload-to-drive
└── package.json
```

Data dự án (`.env`, `auth.json`, `evidence/`, `FINDINGS.md`) nằm trong thư mục dự án — KHÔNG đụng skill.

## 🔗 Skill liên quan
- **playwright-pom-automation** — viết test code deterministic (regression suite, CI)
- **testcase-template** — sinh test case Excel theo template team
