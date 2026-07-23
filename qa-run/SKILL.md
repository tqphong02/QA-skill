---
name: qa-run
description: Plan or execute browser QA on an existing project, including app baseline discovery to learn business flows and logic, ticket retest, sanity, impacted regression, exploratory/ad-hoc testing, UI/UX audit, evidence capture, release sign-off, and persistent business-flow knowledge handoff. Read the app guide then matching feature guide before testing and update affected guides after every run. Every ticket retest automatically runs RETEST_PLUS. Not for writing new automation scripts or creating testcase documents.
---

# QA Run

**Core principle:** Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Resolve `<skill-root>` từ thư mục chứa `SKILL.md` đang được load. **Dữ liệu lấy theo thư mục bạn chạy lệnh** (cwd hoặc `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` đều nằm trong thư mục dự án đang test — KHÔNG đụng vào skill. Không giả định engine nằm trong `.claude`, `.codex`, `.gemini` hoặc home directory cụ thể

> **Khi nào dùng**: khám phá lỗi mới, verify lại bug, poke UI/API ad-hoc trên 1 web app, sanity/risk-based khi cần chạy lặp, regression (bộ TC cố định) đặt ở instance dự án.
> **API key**: dùng chung từ `../config/api_keys.json` (xem scripts/ai_provider.py) — KHÔNG cần key nếu dùng Copilot Pro/Antigravity/Claude Code CLI.

## Enterprise QE Pipeline (15 Tầng Khép kín)

```
Intent Router → Run Planner & Dependency Graph → Manifest Initializer (run-manifest.mjs)
  → Safety Guard (Default BLOCKED) → Knowledge Validator (validate-knowledge.mjs)
  → Worker Account & Data Isolation (data-factory.mjs) → Runtime Observer (runtime-observer.mjs)
  → Executors (Checklist / Mutation / Visual Audit / Visual Regression / UX Journey)
  → Evidence Redaction & Packaging (collect-evidence.mjs) → AI Analyzer & Oracle
  → Result Normalizer → Idempotent Exporters → Cleanup & Orphan Verification → Knowledge Delta Update → Manifest Finalizer
```

## Cross-model hard gates

Áp dụng nguyên thứ tự sau cho mọi model, đặc biệt model nhanh hoặc context nhỏ:

1. **Khởi tạo Run Manifest**: Luôn gọi `node scripts/run-manifest.mjs start` trước khi chạy test để hỗ trợ truy vết đầy đủ trong phạm vi evidence đã thu thập.
2. Phân loại yêu cầu trước khi mở browser: `APP_BASELINE_DISCOVERY`, `RETEST_TICKET`, `SANITY_REGRESSION`, `EXPLORATORY_ADHOC`, `SHEET_TESTCASE_EXECUTION` hoặc `AUTOMATION_BUILD`
3. Với `SHEET_TESTCASE_EXECUTION` (khi user đưa URL/ID Google Sheet chứa testcase):
   - Chạy `node scripts/execute-sheet.mjs --sheet-url <URL>`
   - Khi user yêu cầu "chạy execution testcase toàn bộ" → thêm flag `--parallel --workers 4` để tự động chia module cho nhiều worker chạy song song (giảm đáng kể nguy cơ xung đột dữ liệu nhờ data-factory namespace).
   - **Quy định chuẩn hóa kết quả ghi ngược về Sheet**:
     - Cột `Result`: **BẮT BUỘC KHỚP CHÍNH XÁC** một trong các giá trị: `Pass`, `Fail`, `N/A`, `Untest` (case-sensitive).
     - Cột `Priority`: **BẮT BUỘC KHỚP CHÍNH XÁC** một trong các giá trị: `Critical`, `High`, `Medium`, `Low`.
     - Cột `Note`: Bắt buộc điền khi Result là `Fail`, `Untest` hoặc `N/A`. **Nội dung Note phải ngắn gọn, ngữ cảnh thủ công dễ hiểu cho người dùng/manual tester (KHÔNG ghi stacktrace, KHÔNG lộ HTTP status code hay JSON thô)**.
4. Resolve `<project-root>/qa-knowledge/app-business-guide.md` rồi `<feature>-business-guide.md`; kiểm tra 6 hashes qua `validate-knowledge.mjs --check`
5. Với `RETEST_TICKET`, đọc ticket qua `plane-qa`, sau đó tạo ledger đủ 6 dòng: Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX
6. Ghi test contract gồm `Target`, `Role/Data`, `Original flow`, `Expected`, `Impact area`, `Stop condition` và knowledge đã reuse
7. Chạy CLI/script cho flow rõ và lặp lại; chỉ dùng browser agent/MCP cho nhánh tương tác chưa hiểu
8. Cập nhật verdict/evidence vào ledger ngay sau mỗi lớp; không kết luận nếu còn dòng chưa có verdict hoặc lý do `BLOCKED/PARTIAL`
9. Tách verdict ticket gốc khỏi bug mới rồi áp dụng state map cố định qua `plane-qa`
10. Sau mọi run, đóng gói evidence sạch secrets qua `collect-evidence.mjs` và chốt manifest qua `run-manifest.mjs finish <RUN_ID>`

State map: `PASS → Done`, `FAILED → In Progress`, `BLOCKED → unchanged`, `new bug → Todo`

Không suy đoán PASS khi thiếu evidence. Không dừng sau happy path. Không đổi ticket gốc thành FAILED vì một bug mới khác root cause.

Khi model có context nhỏ, chỉ đọc phần skill/reference đang cần và giữ ledger trên disk hoặc trong working notes; không tải toàn bộ snapshot, ảnh hoặc mọi reference vào context.

## Knowledge scope decision

- `APP_BASELINE_DISCOVERY`: dùng khi user yêu cầu test/khám phá tổng thể web app, bootstrap project chưa có `app-business-guide.md`, hoặc user yêu cầu refresh guide.
  - **Ưu tiên chạy `scripts/extract-flow.mjs` trước** để trích xuất business flow từ DOM + network + JS runtime trong 1 lần quét duy nhất mà không cần đọc source code FE/BE.
  - Script tự login, duyệt toàn navigation, intercept API calls, map state machine từ status labels, ghi `qa-knowledge/app-flow-map.json` (AI load nhanh) và `qa-knowledge/app-business-guide.md` (human readable).
  - **Sau khi có guide, mọi run tiếp theo chỉ đọc JSON/MD — 0 browser action cho phase "hiểu context"**; chỉ mở browser khi cần verify thực tế.
  - Lập module map trước rồi đi qua flow business chính có thể truy cập, role/state/input/side-effect/integration/UI/UX và coverage gap
- `SHEET_TESTCASE_EXECUTION`: dùng khi user đưa URL hoặc Spreadsheet ID của Google Sheet chứa bộ testcase.
  - **Đọc business flow trước khi test**: Luôn nạp `qa-knowledge/app-flow-map.json` (hoặc `app-business-guide.md`) để AI hiểu toàn bộ logic business, route, role và state transition của app trước khi tương tác.
  - **Thực thi song song UI/UX & Functional**: Khi user yêu cầu "chạy execution testcase toàn bộ", tự động kích hoạt `--parallel --workers 4`. Các worker phân chia kiểm thử đồng thời cả phần **UI/UX** (layout, overflow, truncation qua `visual-audit.mjs`) và phần **Functional** (business logic, mutation, validation qua `attack-surface.mjs`).
  - Chạy `node scripts/execute-sheet.mjs --sheet-url <URL> --parallel --workers 4` để đọc, phân chia worker và thực thi.
  - Sau khi test xong, tự động cập nhật ngược lại Google Sheet với Result (`Pass`/`Fail`/`N/A`/`Untest`), Priority (`Critical`/`High`/`Medium`/`Low`), và Note (ngữ cảnh thủ công dễ hiểu, KHÔNG ghi stacktrace hay error code khô khan).
- `RETEST_TICKET`: không quét lại toàn app. Đọc app guide để biết dependency, đọc feature guide để biết flow chi tiết, rồi chạy RETEST_PLUS cho ticket và impacted area. Nếu thiếu guide, chỉ discovery đủ để hiểu feature hiện tại rồi tạo guide
- `SANITY_REGRESSION` và `EXPLORATORY_ADHOC`: reuse guide hiện có và mở rộng knowledge đúng phần scope đã kiểm tra
- Không gọi baseline là exhaustive nếu chưa đi qua đủ module, role, state hoặc data. Ghi `covered`, `partial`, `blocked` hoặc `not_covered` trong `coverage_map`

## The trap this skill exists to prevent

**Test everything every cycle** — running full regression on every change, exhausting time budget, missing real regressions in noise. Skill enforces risk-based, scoped cycles: phân tầng Sanity → Smoke → Regression, chỉ chạy mức cần thiết cho context.

## Process

### 1. Hiểu ngữ cảnh trước (Nguyên tắc #1)
"Thông minh" = **không click mù**. AI phải đọc & hiểu logic trước, rồi mới poke. Thứ tự BẮT BUỘC:

#### Bước 0 — Đọc business guide đã lưu
- Đọc [references/KNOWLEDGE_HANDOFF.md](references/KNOWLEDGE_HANDOFF.md)
- Đọc `qa-knowledge/app-business-guide.md` trước nếu có, sau đó đọc đúng `<feature-slug>-business-guide.md`
- Reuse flow, role/data, route/API, state transition và reusable assets còn đúng
- Không đọc guide của feature khác và không bỏ verification chỉ vì guide cũ ghi PASS

#### Bước A — Đọc requirement / spec / AC (NẾU có)
- Spec/PRD/ticket/AC (file local, URL, hoặc user paste)
- Trích thành danh sách requirements có ID: `{ "id":"AC1", "text":"..." }`
- Nếu KHÔNG có document → **hỏi user** cung cấp, hoặc đồng ý test theo UI hiện có
- Chi tiết fetch từ Plane: xem `scripts/fetch-plane-issue.sh`

#### Bước B — Trích xuất "bản đồ logic" trước khi test
1. **Happy path**: bước 1 → 2 → 3 → … → kết quả
2. **State / role**: ai được làm gì? (admin/user/guest; pending/active/closed)
3. **Inputs & ràng buộc**: loại data nào hợp lệ, range, format
4. **Side-effects**: thao tác này ghi đâu? (DB, API, queue, email, webhook)
5. **Edge case đáng ngờ**: concurrency, boundary, timeout, role khác
6. **Integration bên thứ 3**: payment, email, calendar, notification, search, AI

#### Bước C — Form charter (mục tiêu exploratory có chủ đích)
Một dòng: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*
- Charter tốt nêu rõ **risk** (không phải "test cho vui")

#### Bước D — Lái UI có định hướng (qua MCP Playwright)
- Happy path → snapshot từng bước → verify state đổi đúng
- **Sai lệch có chủ đích** ở mỗi bước: thử input invalid / boundary / concurrency
- Note lỗi console/HTTP lộ ra (`browser_console_messages`, `browser_network_requests`)

### 2. Lái UI qua MCP Playwright (Nguyên tắc #2)

| Việc cần làm | Cách làm |
|---|---|
| Mở trang | `browser_navigate` |
| Xem DOM tương tác (headings, buttons, inputs, toasts, console err, HTTP≥400) | `browser_snapshot` |
| Bấm nút / link / text | `browser_click` |
| Điền form | `browser_fill_form` hoặc `browser_type` |
| Chạy JS tuỳ ý (probe API, đọc state) | `browser_evaluate` |
| Chờ text / state | `browser_wait_for` text ổn định (không `wait_for_timeout` cứng) |
| Test nhiều trang / nhiều endpoint | `browser_tabs` (mở song song) |
| Xem network + console | `browser_network_requests` / `browser_console_messages` |
| So sánh baseline | `browser_take_screenshot` (khi cần so pixel) |

### 3. Tối ưu tốc độ + thông minh

#### Tăng tốc độ (giảm round-trip, giảm payload)
| Pattern | Thay vì | Lợi ích |
|---|---|---|
| Scope snapshot | snapshot cả trang | Payload nhỏ 5-20× |
| Batch fill | nhiều lần `browser_type` | 3 round-trip → 1 |
| Batch evaluate | N lần `browser_evaluate` | 1 round-trip |
| Wait deterministic | `wait_for_timeout` cứng | Không chờ thừa |
| Parallel tabs | navigate tuần tự | Probe song song |
| Block heavy resource | load full assets | 2-5× nhanh hơn |
| Reuse context | login mỗi probe | Bỏ login |

#### Tăng thông minh
1. **Heuristic checklist theo loại feature** - Form/Table/Filter/Auth/Modal/Async/Data
2. **Cross-verify (KHÔNG chỉ tin snapshot)** - DOM + network + console ≥ 2 nguồn
3. **Pattern memory** - đọc business guide khớp feature trước, sau đó mới đọc `FINDINGS.md` + evidence liên quan khi cần
4. **Parallel agent fan-out** - 3-5 agent probe 1 lúc (chỉ khi user opt-in)
5. **Charter với risk taxonomy** - H/M/L ưu tiên probe trước

### 4. UI/UX & Interaction testing
Khi retest/sanity: luôn rải 2-3 check UX ở khu vực fix (vì fix function đôi khi sinh ra UX issue).

**Workflow UI/UX đúng:**
1. **Chạy `visual-audit.mjs` trước** — script tự đo overflow, clipping, touch target, loading state, empty state, z-index conflict trên cả desktop và mobile
2. **Đọc JSON findings** — AI biết chính xác element nào có vấn đề mà không cần snapshot toàn trang
3. **Embed 2 screenshot** (desktop + mobile) vào context — AI vision phân tích ảnh thực thay vì đoán từ DOM text
4. **Kiểm tra AI Vision Checklist** trong output JSON — 8 mục cụ thể để AI nhìn vào ảnh

```bash
cd <project-root>
QA_RUN_SKILL_DIR=/path/to/qa-run node /path/to/qa-run/scripts/visual-audit.mjs --path /dashboard
# Output: evidence/visual-1440-*.png + evidence/visual-375-*.png + evidence/visual-audit-*.json
```

**4 lỗi UI hay gặp nhất** (xem `references/UI-BUG-CATALOG.md`):
1. Action safety (delete không confirm)
2. Overlap-z-index (modal/tooltip che nút quan trọng)
3. Overflow-truncation (text bị cắt số tiền/tên/ID)
4. State-loading (loading state không hiển thị, "0" giả)

**3 loại bug đo được** (xem `browser_evaluate`):
- Click không ăn: 250ms latency / double-fire / pointer-events:none
- Giật lag: long-task > 100ms
- Spam button: request > 1 trong 1 lần bấm


### 5. Chọn kỹ thuật (12 kỹ thuật)
Xem `TESTING-TECHNIQUES.md` để biết chi tiết + coverage matrix.

12 kỹ thuật: Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression).

**Hard gate cho Exploratory/Ad-hoc (BẮT BUỘC):**
1. Đọc `qa-knowledge/app-flow-map.json` (hoặc `app-business-guide.md`) để biết module map.
2. **Tạo Markdown Checklist tự động cho trang/feature**:
   - Chạy `node scripts/generate-checklist.mjs --path /feature-path --feature "feature-name"`
   - Output: `qa-knowledge/checklists/<feature-slug>-checklist.md`
   - Script tự động quét 100% item, button, input field, table, modal trên màn hình và sinh bộ checklist có sẵn mã kiểm thử.
3. Xác định feature type cần test (Form? Table? Modal? Auth? CRUD? Async? File?) từ `references/ATTACK-TAXONOMY.md` — chọn 3–5 attack vectors ưu tiên.
4. Với Form/Auth: chạy `attack-surface.mjs` để tự động inject mutations trước khi click thủ công.
5. Với UI/UX: chạy `visual-audit.mjs` trước — đọc JSON + nhìn ảnh thực.
6. AI đi qua từng dòng trong file `<feature-slug>-checklist.md` được sinh ra, kiểm thử và đánh dấu `[x]` PASS hoặc `[ ]` FAIL cùng lý do ngắn gọn. Không click mò và không bỏ sót bất kỳ element/button nào trên giao diện.


### 6. RETEST_PLUS workflow (khi user đưa ticket hoặc yêu cầu retest)
Đây là case hay gặp nhất: *"Dev báo fix xong rồi, retest giúp ticket này"* → user chỉ paste URL.

RETEST_PLUS dùng app/feature guide để giảm khám phá lặp lại và không tự chạy full-app baseline. Chỉ mở rộng discovery khi ticket chạm vùng chưa có knowledge hoặc guide đã stale.

#### Bước 0 — Xác nhận scope
- Nếu user đã nói rõ "retest #X" / "verify fix #X" → thẳng bước 1
- Nếu chỉ nói "test #X" → hỏi 1 câu: *"Retest fix #X hay khám phá feature #X để tìm bug mới?"*

#### Bước 1 — Fetch ticket (KHÔNG hỏi lại)
- Parse URL Plane → gọi API → trích AC, steps, expected, dev notes
- Lỗi 401/404/403 → báo user check API key + URL

#### Bước 2 — Trích AC
- AC chính (happy path): "Khi user làm X thì hệ thống phải Y" → case PHẢI PASS
- AC phụ (edge case): input rỗng, concurrent, role khác → cũng phải test
- Repro steps của bug gốc (nếu bug ticket) → chạy lại đúng các bước
- Khu vực kề bên (AI tự suy luận): tính năng fix nằm trong flow nào? → poke xem có vỡ không

#### Bước 3 — Verify từng AC
Với mỗi AC:
1. Setup điều kiện (login đúng role, clear localStorage, **chuẩn bị data test**)
2. Thực hiện đúng repro steps (KHÔNG tự ý thêm bước lạ)
3. Snapshot sau mỗi bước → so với "Expected" trong AC
4. Verify cả network response (nếu AC liên quan persist/tính toán)
5. Chấm PASS/FAILED từng AC — KHÔNG gộp "tổng thể OK"

#### Bước 4 — RETEST_PLUS coverage (BẮT BUỘC)
- Retest đúng flow gốc
- Sanity happy path chính của module
- Impacted regression theo vùng fix và dependency
- Exploratory gồm boundary, negative, alternate sequence, refresh/retry
- Ad-hoc gồm control lân cận, cancel/reopen, double action, navigation/session phù hợp
- UI/UX gồm overlap, clipping, overflow, modal/dropdown/popup, viewport, loading/error/focus

Adjacent area check trong các lớp trên:
- Click vào các nút/tab/list liên quan → snapshot → có lỗi mới không?
- Tạo 1 record bằng flow khác (vd import file thay vì form) → có dùng chung validation không?
- Refresh/back giữa chừng flow → state có bẩn không?
- Đổi role user (vd guest xem trang admin) → có leak permission không?
- `browser_console_messages` + `browser_network_requests` cuối phiên → có warning/error lạ không?

#### Bước 5 — Verdict + report
```
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAILED>
**Nguồn requirement:** <URL ticket đã fetch>
**AC1 (<mô tả>):** PASS  — <evidence 1 dòng>
**AC2 (<mô tả>):** FAILED  — <quan sát sai lệch>
**Adjacent:** PASS — <note>
**Verdict:** PASS (nếu tất cả AC chính PASS) / FAILED (nếu ≥1 AC chính FAILED)
```
- Ghi `FINDINGS.md` theo format chuẩn (`report/REPORT-TEMPLATE.md`)
- Merge knowledge đã xác nhận theo `references/KNOWLEDGE_HANDOFF.md`; baseline ghi `app-business-guide.md` và feature guide đã khám phá sâu, retest cập nhật feature guide và chỉ sửa app guide khi có module/dependency/coverage mới
- Chạy `node scripts/write-business-guide.mjs --check <guide.md>` và đọc lại guide trước khi bàn giao
- Nếu FAILED → comment evidence và kéo ticket gốc về In Progress
- Nếu PASS → comment evidence và kéo ticket gốc sang Done
- Nếu BLOCKED → giữ nguyên trạng thái
- Bug khác root cause → mở bug mới ở Todo

### 7. Quy trình cho 1 dự án

#### 0. Setup (mỗi dự án 1 lần)
Trong **thư mục QA của dự án** (vd `MyProject/qa/`), tạo `.env`:
```
QA_BASE_URL=https://app-cua-du-an.com
QA_EMAIL=...
QA_PASSWORD=...
QA_PROJECT_NAME=MyProject
```

**Bước 0.1 — Chạy extractor một lần để bootstrap toàn bộ business knowledge:**
```bash
cd MyProject/qa
QA_RUN_SKILL_DIR=/path/to/qa-run node /path/to/qa-run/scripts/extract-flow.mjs
# Kết quả: qa-knowledge/app-flow-map.json + qa-knowledge/app-business-guide.md
```
Options:
```bash
--max-pages 20    # giới hạn số trang quét (default: 30)
--wait 1500       # ms chờ sau mỗi navigate (default: 1200)
--reauth          # force login lại dù auth.json đã có
--dry-run         # chỉ in navigation, không ghi file
```

**Sau khi có guide**, AI sẽ đọc `qa-knowledge/app-flow-map.json` thay vì scan lại —
tiết kiệm 80–90% token phase "hiểu context", chỉ mở browser khi cần verify thực tế.

Rồi (chạy TỪ thư mục đó để data ghi vào đúng dự án) — dùng MCP Playwright để login:
- `browser_navigate(BASE + '/login')` → `browser_snapshot` → `browser_fill_form` (email/password) → `browser_click` submit → `browser_wait_for` url đổi → lưu cookie (Playwright MCP tự quản session).

> Nếu project cần auth.json để script npm Playwright chạy được (regression/batch): `node scripts/login.mjs` → tạo `auth.json` + `evidence/` ở đây.

#### 1. Khám phá rộng (mặc định: HIỂU trước → LÁI sau)
Xem @Bước A-D ở trên.

Với `APP_BASELINE_DISCOVERY`, lập coverage ledger theo module và đi qua entry point, happy flow, role/permission, state/persistence, validation/boundary, side effect/integration, API/network và UI/UX có thể quan sát. Mọi module phát hiện được phải có trạng thái `covered`, `partial`, `blocked` hoặc `not_covered` cùng reason/evidence trước khi dừng.

#### 2. Đào sâu 1 nghi vấn
**Trước khi đào**: re-load lại bản đồ logic (Nguyên tắc #1 Bước B) cho khu vực nghi vấn.

**Cách 1** (ưu tiên, nhanh & "thông minh") — dùng MCP Playwright tương tác:
1. Đặt giả thuyết từ bản đồ logic (không đoán mù) → `browser_click` / `browser_type` / `browser_evaluate` để verify
2. `browser_snapshot` đọc lại DOM (tránh đoán) — đối chiếu với state expected trong bản đồ
3. `browser_network_requests` xem response body / status — verify side-effect (DB persist, message queue, webhook)
4. `browser_wait_for` text xuất hiện hoặc đổi (không sleep cứng)
5. Khi verdict rõ → `browser_take_screenshot` chỉ bước kết luận → ghi `FINDINGS.md` theo format chuẩn

**Cách 2** (cần chạy lặp / CI) — viết script ngắn:
```js
// MyProject/qa/probe-x.mjs  — chỉ viết khi cần CHẠY LẶP (risk-based / sanity / regression)
const skillRoot = process.env.QA_RUN_SKILL_DIR;
if (!skillRoot) throw new Error('QA_RUN_SKILL_DIR is required');
const { browser, snap, shot, BASE } = await import(`${skillRoot}/lib/driver.mjs`);
const { recordNet, waitForStable, withRevert } = await import(`${skillRoot}/lib/ui.mjs`);
const { eq, check, summary } = await import(`${skillRoot}/lib/assert.mjs`);
const { b, page } = await browser();
const net = recordNet(page, /api\/v1/i, { withBody:true });
await page.goto(BASE + '/path');
const total = await waitForStable(() => page.evaluate(readTotal));
printSnap(await snap(page), 'STATE');
eq('Total sau filter', total, 6);
check('Backend persist', net.some(c => c.status===200 && !/\[\]/.test(c.body)));
await shot(page, 'probe-x'); process.exit(summary('#<ticket>') ? 0 : 1);
```
Chạy: `cd MyProject/qa && node probe-x.mjs`. Thao tác GHI dữ liệu thật → bọc `withRevert(mutate, revert)`.

#### 3. Ghi nhận → `FINDINGS.md` (trong thư mục dự án)
Mỗi bug: **Quan sát → Expected → Evidence:<png> → Severity → TC**. Gom theo root-cause.
Report & comment theo **format chuẩn** ở `report/REPORT-TEMPLATE.md` — quy tắc số 1: **Actual & Steps phải xuống dòng từng ý (bullet/numbered), KHÔNG viết liền 1 đoạn**.

#### 4. Đóng gói / bàn giao — log bug Plane có preview ảnh INLINE
**Mục tiêu**: mở ticket trên Plane → scroll description → **thấy ảnh preview ngay**, KHÔNG cần bấm tải file về.

**Cách làm** (đã verify với Plane self-hosted):
1. Upload ảnh lên Plane qua endpoint `issues/{id}/issue-attachments/` (S3 presigned) → trả về asset URL
2. Trong `description_html`, embed URL đó bằng `<img src="<plane-asset-url>">`
3. Khi render, Plane sẽ hiển thị ảnh inline trong description + đồng thời liệt kê trong Attachments

> ⚠️ **KHÔNG dùng base64 data URI** trong description — Plane self-hosted sẽ **strip ảnh khi render**. Phải dùng URL asset sau khi upload.

Wrapper script `scripts/log-bug.mjs` đã làm sẵn:
```bash
node <project>/qa/log-bug.mjs --title "[W26][Login] Email validation sai" \
  --module "Login" --severity "High" --screenshots "evidence/probe-430.png" \
  --steps "1. Mở /login\n2. Để trống Email\n3. Click Login" \
  --expected "Hiển thị thông báo yêu cầu nhập Email" \
  --actual "Không có thông báo, vẫn submit" \
  --assign "hungtn,phongtq" --state "Todo"
```

### 8. Test data — khi THIẾU data

**Khi nào thiếu** (hay gặp):
- Test filter `Status=Pending` nhưng hệ thống có **0 record Pending**
- Test edit/delete nhưng **không có record** để sửa/xoá
- Test boundary nhưng data thực **không chạm biên**

**2 option**:
- **Hỏi user** (khi cần data thật, không fake được, ambiguous)
- **Tự tạo** (ưu tiên - qua chính UI/API của app)

Tự tạo qua API (nhanh, ưu tiên):
```js
fetch('/api/events', {
  method: 'POST',
  credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...})
}).then(r => r.json())
```

**Quy tắc khi tự tạo**:
- Idempotent / unique: tên + timestamp
- Cleanup BẮT BUỘC (withRevert) - KHÔNG để data rác
- KHÔNG side-effect thật: không gửi mail/WhatsApp/SMS production
- Volume vừa phải: 1-3 record đủ
- Role đúng

Helper tùy chọn: `seed.mjs` ở project - hàm tạo data test + cleanup.

### 9. Token-frugal (BẮT BUỘC giữ khi viết script)
Xem `lib/driver.mjs` + `lib/ui.mjs` + `lib/assert.mjs`:
- `lib/driver.mjs`: headless, screenshot ra file (không trả bytes ảnh vào context)
- `lib/ui.mjs`: `snap()` chỉ in phần tử tương tác + text chính + console/HTTP≥400
- `lib/assert.mjs`: `check/eq/summary` - gọn nhẹ
- Cắt response body `.slice(0,200)`; in gọn
- **Quy tắc vàng**: 1 probe = 1 câu hỏi. Đặt tên `probe-<ticket>-<aspect>.mjs`

### 10. Regression (deterministic)
Bộ TC cố định, chạy lặp tất định, đặt ở instance dự án (vd `MyProject/qa/regression/`). KHÔNG để ở engine global.

Cấu trúc data-driven: `cases.mjs` + `run.mjs`, idempotent (withRevert), verdict CI (`process.exit(summary()?0:1)`). Xem `TESTING-TECHNIQUES.md` §5.

### 11. Cấu hình API key
Một lần cấu hình key tại `../config/api_keys.json` (gitignored), dùng được cho cả 3 skill trong repo qa-skill. Xem [README.md](../README.md) mục "API Keys" và `scripts/ai_provider.py`.

### Appendix — ported modules
Các module đã port:
- **A.1 Test Data Generator** — format chuẩn `[prefix]_[testName]_[timestamp]_[random]`, helper tại `lib/tdata.mjs`

Các concept chưa port (để roadmap): A.2 Flaky Detector, A.2 Locator Healer, A.3 UI/API Flow Generator.

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| `Không tìm thấy .env` | cwd sai | `cd ~/Documents/QA-MDS/<project>` trước khi chạy |
| `401 Unauthorized` (Plane) | API key sai/expire | Rotate key ở Plane Profile |
| Skill không xuất hiện | Folder sai vị trí | Chạy `scripts/doctor-agent.sh --agent=<host>` từ repository rồi mở phiên agent mới |
| AI click mù không hiểu | Skip Bước A-D | BẮT BUỘC đọc spec trước |
| Push lên GitHub mà lộ auth.json | Quên `.gitignore` | `git rm --cached auth.json` + rotate key |
| Tự tạo data rác không cleanup | DB pollution, ảnh hưởng test khác | Bọc `withRevert()` hoặc dùng `afterAll` |
| Click → sleep(500) cứng | Flaky CI | Dùng `browser_wait_for` text xuất hiện |
| Snapshot full page mỗi lần | Payload lớn, chậm | Scope snapshot: chỉ phần tử tương tác |
| Ảnh trong bug Plane hiển thị broken | Dùng base64 data URI thay vì URL asset | Upload qua `issues/{id}/issue-attachments/` rồi embed URL |

## Output format

- Comment Plane và testcase prose không có dấu `.` cuối câu và không chèn emoji/icon
- Giữ nguyên ID, URL, filename, formula, code, decimal number và machine-readable value
- Comment PASS chỉ có Result + Conclusion + ảnh inline
- Comment FAILED chỉ thêm Actual + Expected
- Comment BLOCKED chỉ thêm Blocker

## Common mistakes

- **Fallback Google Antigravity** nếu KHÔNG còn Claude Code + Playwright MCP:
  - Nếu Claude Code hết quyền dùng, hoặc MCP Playwright bị gỡ/vỡ → **skill vẫn chạy được trên Antigravity** (agentic platform của Google: CLI + IDE + Gemini-in-Chrome). Phần lớn asset của skill là **portable** — chỉ đổi "bộ não lái UI".

  - **Asset portable** (chạy ở bất kỳ env có Node ≥ 18):
    | Asset | Lý do portable |
    |---|---|
    | `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm |
    | `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, gọi `node <script>` |
    | `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API |
    | `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib |
    | **Nguyên tắc #1** (hiểu ngữ cảnh trước khi lái), 5 kỹ thuật testing, workflow retest/sanity | **Methodology** — độc lập tool |
    | `.env`, `auth.json`, `evidence/` | Nằm trong thư mục dự án, KHÔNG phụ thuộc Claude Code |

  - **Cần đổi (chỉ "bộ não lái UI")**:
    | Việc | Claude Code (mặc định) | Antigravity (fallback) |
    |---|---|---|
    | Lái UI tương tác | `mcp__playwright__browser_*` | **Gemini-in-Chrome** (Antigravity tự điều khiển Chrome) |
    | Fetch ticket từ URL | `WebFetch` | Antigravity web tool / `curl` trong terminal |
    | Agent reasoning | Claude (model này) | Gemini 3 (Antigravity default) |
    | Chạy probe script | `node scripts/x.mjs` qua Bash tool | `node scripts/x.mjs` qua terminal |
    | Log bug | `node log-bug.mjs ...` | `node log-bug.mjs ...` |

  - **Workflow trên Antigravity:**
    1. Mở Antigravity IDE → mở thư mục dự án (vd `MyProject/qa/`)
    2. Agent (Gemini) tự dùng **Gemini-in-Chrome** để navigate/click/snapshot/probe API
    3. Khi cần batch/regression → agent chạy `node <skill-root>/scripts/sweep.mjs`
    4. Khi log bug → agent chạy `node log-bug.mjs ...` (script portable)
    5. Verdict + report theo cùng format (`report/REPORT-TEMPLATE.md`)

  - **Lưu ý khi fallback:**
    - `auth.json` phải có (Antigravity chạy npm Playwright script cần `auth.json`)
    - Gemini-in-Chrome của Antigravity **KHÔNG** tự share với playwright headless → phải login lại bằng `login.mjs`
    - Prompt khác model: Gemini 3 hiểu workflow này nếu prompt rõ

- **Click mù không đọc spec** — AI sẽ sinh ra verdict sai (PASS nhầm FAILED hoặc ngược lại). BẮT BUỘC đi qua Bước A-D.

- **Skip adjacent area check** — fix function đôi khi vỡ UI ở chỗ khác. Bước 4 là BẮT BUỘC.

- **Snapshot full page mỗi lần** — payload lớn, tốn token. Scope snapshot chỉ phần tử tương tác.

- **Dùng `wait_for_timeout` cứng** — flaky CI. Luôn `browser_wait_for` text/event.

- **Hardcode URL/auth vào prompt** — secret leak. Dùng `.env` + auth.json trong thư mục dự án.

- **Skip teardown** — khi poke app production với side-effect (DB, queue, mail), wrap trong `withRevert()` để cleanup.

- **Không ghi business guide sau run** — AI lần sau phải khám phá lại từ đầu. Luôn merge knowledge còn đúng, ghi guide và validate read-back.

- **Tin guide cũ tuyệt đối** — environment/version có thể đổi. Kiểm tra ngày verify, source và confidence rồi re-verify phần nằm trong scope hiện tại.

- **Verdict gộp "tổng thể OK"** — che giấu AC failed riêng lẻ. PHẢI chấm PASS/FAILED từng AC.

## References

### Scripts (`scripts/`)
- [scripts/run-manifest.mjs](scripts/run-manifest.mjs) — **khởi tạo & ghi nhận Run Manifest (run_id, environment, git_commit, app_version, data_namespace, duration) để truy vết 100% bug**
- [scripts/data-factory.mjs](scripts/data-factory.mjs) — **cách ly tài khoản & data namespace cho từng worker, thiết lập quy tắc retry (chỉ retry lỗi hạ tầng, KHÔNG retry assertion fail)**
- [scripts/validate-knowledge.mjs](scripts/validate-knowledge.mjs) — **kiểm tra độ mới của knowledge, hash routes & git commit, hỗ trợ re-discovery từng module khi app release**
- [scripts/extract-flow.mjs](scripts/extract-flow.mjs) — **trích xuất business flow từ web app (DOM + network + CDP) → JSON + Markdown, không cần đọc source code**
- [scripts/generate-checklist.mjs](scripts/generate-checklist.mjs) — **tự động quét 100% item, button, input, table trên màn hình → tạo Markdown Checklist (.md) cho Exploratory & Ad-hoc testing không bỏ sót case**
- [scripts/attack-surface.mjs](scripts/attack-surface.mjs) — **phân loại Action Safety (READ_ONLY, SAFE_WRITE, DESTRUCTIVE, EXTERNAL_EFFECT, PAYMENT), tự động inject mutations cho READ_ONLY/SAFE_WRITE — 0 token**
- [scripts/visual-audit.mjs](scripts/visual-audit.mjs) — **Visual Heuristic Audit: đo overflow/clipping/touch target/z-index, chụp ảnh desktop+mobile**
- [scripts/visual-regression.mjs](scripts/visual-regression.mjs) — **Visual Regression Baseline: so sánh ảnh hiện tại với baseline, pixel diff, mask vùng động, quy trình approve baseline mới**
- [scripts/journey-audit.mjs](scripts/journey-audit.mjs) — **UX Journey Audit: đánh giá mục tiêu người dùng end-to-end (Next step clarity, visual hierarchy, feedback quality, actionable error guidance)**
- [scripts/collect-evidence.mjs](scripts/collect-evidence.mjs) — **đóng gói toàn bộ screenshots, traces, logs, manifest thành gói artifact hoàn chỉnh `evidence/bundles/<run_id>/`**
- [scripts/execute-sheet.mjs](scripts/execute-sheet.mjs) — **chạy testcase từ Google Sheet, phân chia parallel worker song song, batch update kết quả chuẩn hóa**
- [scripts/login.mjs](scripts/login.mjs) — tạo auth.json
- [scripts/sweep.mjs](scripts/sweep.mjs) — sweep nhiều trang
- [scripts/explore.mjs](scripts/explore.mjs) — exploratory helper
- [scripts/api-health.mjs](scripts/api-health.mjs) — API probe
- [scripts/ux-health.mjs](scripts/ux-health.mjs) — UX heuristic check (performance metrics)
- [scripts/compat.mjs](scripts/compat.mjs) — compat check

### Libraries (`lib/`)
- [lib/driver.mjs](lib/driver.mjs) — headless browser + screenshot ra file
- [lib/ui.mjs](lib/ui.mjs) — scope snapshot, network recording, `withRevert`
- [lib/assert.mjs](lib/assert.mjs) — `check/eq/summary` gọn nhẹ
- [lib/tdata.mjs](lib/tdata.mjs) — test data generator `[prefix]_[name]_[ts]_[rand]`

### Reference docs
- [references/UI-BUG-CATALOG.md](references/UI-BUG-CATALOG.md) — 4 lỗi UI hay gặp nhất
- [references/KNOWLEDGE_HANDOFF.md](references/KNOWLEDGE_HANDOFF.md) — protocol đọc trước, merge và ghi business guide sau run
- [scripts/write-business-guide.mjs](scripts/write-business-guide.mjs) — renderer/validator deterministic cho business guide
- [report/REPORT-TEMPLATE.md](report/REPORT-TEMPLATE.md) — format FINDINGS.md
- [TESTING-TECHNIQUES.md](TESTING-TECHNIQUES.md) — 12 kỹ thuật testing chi tiết
- [GUIDE.md](GUIDE.md) — hướng dẫn setup engine
- [README.md](README.md) — overview qa-run skill

### Related skills
- [playwright-pom-automation](../playwright-pom-automation/SKILL.md) — viết deterministic test-as-code (KHÁC với live exploratory này)
- [testcase-template](../testcase-template/SKILL.md) — document test case Excel (KHÁC với bug hunting này)
- [doc-to-md](../doc-to-md/SKILL.md) — convert PDF/DOCX sang MD để AI đọc spec
