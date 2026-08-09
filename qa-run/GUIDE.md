# 📖 qa-run — Hướng dẫn sử dụng (cheat-sheet)

> Skill `EXPLORATORY_BROWSER_QA` (**alias `EXPLORATORY_ADHOC`**) bằng AI lái UI qua MCP hoặc native Playwright/CDP runtime. Một skill, chạy mọi project. Exploratory/ad-hoc là UI-first, không bắt buộc tài liệu hoặc source code; agent có thể tự suy luận task plan và next action từ state UI hiện tại, rồi replan theo evidence. Đây là guide **human-facing**; AI đọc `SKILL.md` khi kích hoạt.
>
> **Phân biệt skill:**
> - **qa-run** (this) → săn bug **live**, AI lái UI tương tác, exploratory/retest/sanity
> - **playwright-pom-automation** → viết **test code** deterministic (regression suite, CI)
> - **testcase-template** → sinh **test case Excel** theo template team

Kết quả cuối của exploratory/ad-hoc chỉ có: `PASS` (đã test và đúng), `FAILED` (đã test và sai), `N/A` (không áp dụng) hoặc `UNTEST` (cần test nhưng chưa thể kết luận). `BLOCKED` và `PARTIAL` chỉ được giữ trong ledger kỹ thuật nội bộ

### Fast generic browser task

Với task đơn giản như mở URL, đọc nội dung, tìm kiếm, scroll, kiểm tra link hoặc tải file không nhạy cảm, dùng profile `FAST` trong `EXPLORATORY_BROWSER_QA` (nhãn `BROWSER_TASK_FAST`). Profile này chạy ngay bằng native Playwright/MCP, không cần source/docs/business brief, nhưng vẫn có domain boundary, same-session observer, screenshot và action budget. Nếu phát hiện bug hoặc cần expected/PASS/FAILED, chuyển sang profile exploratory đầy đủ trong cùng skill

---

## 🚀 Setup (1 lần)

```bash
cd <skill-root> && npm install     # cài playwright cho engine
```

Cho mỗi dự án, trong thư mục QA (vd `MyProject/qa/`):
```bash
cp <skill-root>/.env.example .env
# điền: QA_BASE_URL, QA_EMAIL, QA_PASSWORD  (+ PLANE_* nếu log bug Plane)
node <skill-root>/scripts/login.mjs  # → tạo auth.json + evidence/ ở thư mục này
```

Data dự án (`.env`, `auth.json`, `evidence/`, `FINDINGS.md`) nằm trong **thư mục dự án** — KHÔNG đụng skill.

---

## 🧭 Workflow chính — chọn theo mục đích

### 1️⃣ Khám phá / săn bug mới (Exploratory)
**AI tự làm:** mở URL → quan sát compact visible content + AX/UI → hiểu entry point, navigation, control, state, validation và feedback → map flow → lái UI qua **MCP Playwright** hoặc `playwright-runtime` (`quick-start/observe/extract/action/batch/recover/quick-finish`) với deterministic state delta, session reuse và same-session evidence. Chỉ nâng observation lên standard/full khi truncation che target/oracle; full QA dùng compact `agent-context` và independent task judge trước PASS. Tài liệu, ticket hoặc source chỉ là context bổ sung nếu có. Native runtime không dùng Browser Use

Bạn chỉ cần cung cấp URL/target và mục tiêu, ví dụ: *"Khám phá feature X tìm bug"* hoặc *"Test đầy đủ feature filter"*.

AI áp dụng Nguyên tắc #1 (**HIỂU FLOW TRÊN UI trước khi lái**) + 12 kỹ thuật testing (`TESTING-TECHNIQUES.md`).

### 2️⃣ Retest từ 1 link ticket (Sanity)
Bạn paste URL ticket → AI tự `WebFetch` → trích AC → verify từng AC qua UI → poke adjacent areas → verdict PASS/FAILED/N/A/UNTEST.

*"Retest ticket https://plane.../issues/427"*

| Kết quả | Hành động |
|---|---|
| PASS | ticket → **Done** |
| FAIL | ticket → **In Progress** + comment lý do |
| Bug mới ngoài scope | tạo ticket mới → **Todo** |

### 3️⃣ UI/UX testing (spam, che content, vượt layout)
*"Test spam nút Sync"*, *"Check trang dashboard có che content không"*, *"Check responsive"*

```bash
# Auto-scan UX metric (overflow/truncation/touch/overlap/CLS/latency/a11y)
node <skill-root>/scripts/ux-health.mjs /dashboard "button#save,a.delete"

# Spam test: click N lần, đếm API call (phải = 1, >1 = bug thiếu guard)
node <skill-root>/scripts/ux-health.mjs /dashboard --spam "button:has-text('Sync')" "/api/sync" 5

# Cross-browser/device nhanh
node <skill-root>/scripts/compat.mjs /login chromium,firefox,webkit iphone-12,ipad-11
# Release matrix v2: browser profile, OS pair, tablet/mobile viewport, locale/timezone
node <skill-root>/scripts/compat.mjs /login --matrix compatibility-v2.json
```

10 category bug UI trong `references/UI-BUG-CATALOG.md`.

### 4️⃣ Log bug Plane (ảnh inline qua browser editor, Attachments 0)
```bash
# Tạo metadata/text-only ticket mới (Todo), không truyền --screenshots
node log-bug.mjs --title "[W26][Filter] Status Pending không lọc" \
  --steps "1. Mở /events|2. Chọn Status=Pending" \
  --expected "Total = 6" --actual "Total = 0" \
  --assign hungtn,phongtq --state Todo

# Sau đó mở đúng ticket trong browser đã xác thực, paste evidence vào Description
# Retest FAIL: paste evidence vào Comment rich-text editor, rồi chuyển state In Progress
# Không dùng ticket-level Attach hoặc /issue-attachments/

# Retest PASS (Done)
node log-bug.mjs --mode retest-pass --issue-id <uuid> --note "AC #1-3 đúng"
```
Cần `.env` có các biến API non-browser phù hợp. Nếu helper nhận `--screenshots`, nó dừng với `BROWSER REQUIRED`; chỉ dùng `--legacy-attachment` khi user yêu cầu rõ route cũ

### 5️⃣ Thiếu data khi test
AI tự xử lý: **(a)** hỏi user khi cần data thật/không tạo được, **(b)** **tự tạo theo business flow** (qua API/UI) + cleanup bằng `withRevert()`.

*"Test filter Pending" nhưng 0 record → AI tự tạo event Pending qua API → test → cleanup.*

---

## 🛠️ Tất cả script (7 cái)

| Script | Lệnh | Dùng khi |
|---|---|---|
| `login.mjs` | `node login.mjs` | setup auth (1 lần/dự án) |
| `sweep.mjs` | `node sweep.mjs` | quét nav tìm HTTP≥400/console error |
| `explore.mjs` | `node explore.mjs /path` | soi nhanh 1 trang |
| `api-health.mjs` | `node api-health.mjs` | probe endpoint tìm 4xx/5xx |
| `ux-health.mjs` | `node ux-health.mjs /path [sels] [--spam ...]` | UX metric + spam test |
| `compat.mjs` | `node compat.mjs /path engines devices` hoặc `node compat.mjs /path --matrix matrix-v2.json` | cross-browser/device, versioned browser/OS/viewport matrix |
| `log-bug.mjs` | `node log-bug.mjs ...` | log bug Plane (3 mode) |

**Lib** (`lib/`): `driver.mjs` (browser/snap/shot) · `ui.mjs` (recordNet/waitForText/waitForStable/clickText/withRevert) · `wait.mjs` (same-session adaptive readiness) · `assert.mjs` (check/eq/summary).

---

## 🧪 12 kỹ thuật testing (xem `TESTING-TECHNIQUES.md`)

Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression).

---

## ⚡ Tối ưu khi AI lái browser
- **Scope snapshot** (`target` + `depth`) thay vì full page → nhỏ 5-20×
- **Batch fill** (`browser_fill_form`) + **batch evaluate** (1 call đọc nhiều value)
- **Adaptive wait** (`lib/wait.mjs`) theo document/XHR/fetch readiness và quiet window; `--wait`/`QA_LEGACY_SETTLE_MS` chỉ là compatibility escape hatch
- **Cross-verify** mỗi verdict: DOM + network + console (đừng chỉ tin snapshot)
- **Heuristic checklists** theo loại feature (form/table/filter/auth/modal/concurrency)
- **Pattern memory**: đọc `FINDINGS.md` cũ → nhận regression/root-cause lặp
- **Execution card**: nếu có `business-execution-card.json` thì đọc trước, chỉ mở full brief khi có deferred/truncation hoặc conflict; không có card thì derive flow từ UI
- **Fingerprint cache**: `prepare-test-intelligence.mjs` tự reuse context không đổi bằng stat-fast inventory rồi mới fallback content hash; dùng `--run-mode auto|fast|scoped|deep` và `--no-cache` khi cần rebuild
- **Change-impact incremental**: `repo-business-discovery.mjs` gom delta commit/staged/unstaged/untracked, chọn scanner theo impact API/UI/DB/RBAC/state; dirty `HEAD` không còn được coi là source sạch
- **Fail-closed discovery**: scanner exit lỗi hoặc canonical artifact thiếu sẽ block preparation, không giữ artifact cũ rồi báo thành công
- **Parallel discovery**: `repo-business-discovery.mjs --parallel auto|on|off`; phase dependencies vẫn giữ barrier và telemetry trong `discovery-session.json`
- **Provider token telemetry**: host ghi `QA_TOKEN_USAGE_FILE` bằng `record-model-usage.mjs`; `context-budget.json` giữ provider-reported usage riêng với estimate UTF-8/4
- **Business intelligence eval**: dùng `scripts/helpers/evaluate-business-intelligence.mjs` với golden dataset per project để đo recall/precision, không dùng test count thay cho intelligence

---

## 🔁 Fallback: Antigravity (nếu hết Claude Code + Playwright)
Phần lớn asset portable (lib, scripts, methodology). Chỉ đổi "bộ não lái UI":
- MCP Playwright → **Gemini-in-Chrome** (Antigravity)
- WebFetch → Antigravity web tool / curl
- Script npm (`node scripts/x.mjs`) → chạy y hệt từ Antigravity terminal
- Antigravity smoke PASS chỉ hợp lệ sau khi chạy host thật và validate `evidence/antigravity-smoke.json` bằng `scripts/helpers/validate-host-smoke.mjs`

Chi tiết: `SKILL.md` §🔁. Skill cũng dùng được với Cursor/Cline/Aider+playwright-mcp.

---

## 📁 Cấu trúc skill
```
<skill-root>/
├── SKILL.md                      # AI instructions (model-facing)
├── GUIDE.md                      # ← bạn đang đọc (human-facing)
├── TESTING-TECHNIQUES.md         # 12 kỹ thuật + coverage matrix
├── references/
│   └── UI-BUG-CATALOG.md         # 10 category bug UI
├── lib/                          # driver / ui / assert (engine Node thuần)
├── scripts/                      # 7 script (login/sweep/explore/api-health/ux-health/compat/log-bug)
├── report/                       # REPORT-TEMPLATE + export-pdf + upload-to-drive
└── package.json
```

### 📂 Cấu trúc chuẩn trong dự án
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

---

## 💬 Câu lệnh mẫu (copy-paste cho AI)
| Bạn nói | AI làm |
|---|---|
| *"Khám phá feature Booking tìm bug"* | Exploratory: hiểu → lái UI → poke theo 12 kỹ thuật → FINDINGS.md |
| *"Retest #427"* | Sanity: fetch ticket → verify AC → PASS=Done / FAIL=In Progress |
| *"Test spam nút Sync"* | `ux-health.mjs --spam` → đếm API call |
| *"Check UX trang dashboard"* | `ux-health.mjs` auto-scan + heuristic |
| *"Check compat Firefox + iPad"* | `compat.mjs` cross-browser/device matrix |
| *"Log bug: filter Pending không lọc"* | `log-bug.mjs --mode create` → Plane ticket có ảnh inline |
| *"Test CRUD entity user"* | Tạo→đọc→sửa→xoá + verify persist + withRevert cleanup |
| *"Thiếu data test Pending"* | Tự tạo event Pending qua API → test → cleanup |
