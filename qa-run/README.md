# qa-run (global skill) — Exploratory Browser QA cho mọi dự án

Skill `EXPLORATORY_BROWSER_QA` bằng AI lái UI qua MCP hoặc native Playwright/CDP runtime. `EXPLORATORY_ADHOC` là alias tương thích; `BROWSER_TASK_FAST` chỉ là nhãn cho profile FAST bên trong cùng skill. **Một skill, chạy mọi project** — data lấy theo thư mục dự án đang test. Exploratory/ad-hoc là UI-first: chỉ cần URL/target và mục tiêu, không bắt buộc tài liệu hoặc source code. Với path chưa biết, agent tự chia mục tiêu thành bounded task steps, chọn một next action từ live UI, đánh giá state delta và replan khi không tiến triển

## 📚 Tài liệu
- **[GUIDE.md](GUIDE.md)** — hướng dẫn sử dụng + cheat-sheet (human-facing) ⭐ bắt đầu từ đây
- **[SKILL.md](SKILL.md)** — quy trình chi tiết (AI đọc khi kích hoạt)
- **[TESTING-TECHNIQUES.md](TESTING-TECHNIQUES.md)** — 12 kỹ thuật testing + coverage matrix
- **[references/UI-BUG-CATALOG.md](references/UI-BUG-CATALOG.md)** — 10 category bug UI

## ✨ Tính năng chính
- **AI lái UI tương tác** qua MCP Playwright (click/type/snapshot/probe API)
- **Generic browser agent**: profile `FAST` (`BROWSER_TASK_FAST`) nhận URL + task và chạy ngay với safe action budget, không cần business brief
- **Native browser runtime** khi MCP không khả dụng: one-command FAST start/finish, visible-content + AX/CDP snapshot, structured extraction, deterministic state delta, read-only batch tối đa 5 action, priority selector, bounded recovery và worker isolation; không phụ thuộc Browser Use
- **Hiểu flow trực tiếp trên UI** — quan sát entry point, navigation, control, state và feedback rồi mới test; spec/ticket/source chỉ là context bổ sung nếu có
- **Verdict rõ ràng** — `PASS` đã test và có evidence, `FAILED` test ra sai, `N/A` không áp dụng, `UNTEST` cần test nhưng chưa thể kết luận; không phát ra `BLOCKED` hoặc `PARTIAL` ở kết quả cuối
- **Sanity retest từ 1 link ticket** (WebFetch → AC → verify → PASS/FAILED/N/A/UNTEST)
- **UI/UX testing sâu**: spam button, UI che content, vượt layout, double-fire, a11y (`ux-health.mjs`)
- **12 kỹ thuật** testing + **cross-browser/device** (`compat.mjs`)
- **Log bug Plane** bằng helper text-only và browser editor cho ảnh inline (`Attachments 0`)
- **Test data tự tạo** theo business flow + cleanup `withRevert`
- **Antigravity fallback** nếu hết Claude Code

## 🚀 Quickstart
```bash
cd <skill-root> && npm install      # 1 lần cho cả máy

cd /path/to/MyProject/qa                        # thư mục QA của dự án
cp <skill-root>/.env.example .env    # điền QA_BASE_URL/EMAIL/PASSWORD (+ PLANE_*)
node <skill-root>/scripts/login.mjs  # → auth.json + evidence/ ở đây
```

## 📁 Cấu trúc (engine — KHÔNG chứa data dự án)
```
<skill-root>/
├── GUIDE.md · SKILL.md · TESTING-TECHNIQUES.md · README.md
├── references/UI-BUG-CATALOG.md
├── lib/        # driver / ui / assert (engine Node thuần, portable)
├── scripts/    # login · sweep · explore · api-health · ux-health · compat · log-bug
│               # native-browser-runtime · native-browser-daemon
├── report/     # REPORT-TEMPLATE · export-pdf · upload-to-drive
└── package.json
```

Data dự án (`.env`, `auth.json`, `evidence/`, `FINDINGS.md`) nằm trong thư mục dự án — KHÔNG đụng skill.

### Cấu trúc chuẩn trong dự án
```text
<project-root>/
├── .env
├── auth.json
├── evidence/
│   ├── runs/<run-id>/
│   ├── sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/
│   ├── sheet/_runs/<YYYY-MM-DD>/<run-id>/
│   └── visual-*/
├── qa-knowledge/
│   ├── knowledge-index.json
│   ├── system-overview.md
│   ├── flows/
│   ├── rules/
│   ├── contracts/
│   ├── evidence/
│   ├── app-business-guide.md
│   ├── app-flow-map.json
│   ├── checklists/
│   ├── merged/
│   ├── repositories/
│   └── ui-business/
├── FINDINGS.md
└── reports/
```

- Knowledge mới ưu tiên vào `qa-knowledge/knowledge-index.json` và các shard `flows/`, `rules/`, `contracts/`
- `app-business-guide.md` và `app-flow-map.json` giữ vai trò tương thích hoặc summary
- Evidence run thông thường vào `evidence/runs/<run-id>/`; riêng Sheet media tách theo chức năng/ngày ở `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/`
- Report hoặc export tách riêng vào `reports/`
- `FINDINGS.md` ở root chỉ giữ summary ngắn của issue đang theo dõi
- Không để file QA rải ở root nếu đã có thư mục chuẩn phù hợp

## 🔗 Skill liên quan
- **playwright-pom-automation** — build và chạy deterministic testcase/POM, thu evidence và verdict
- **testcase-template** — sinh test case Excel theo template team
