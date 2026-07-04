---
name: qa-run
description: Exploratory / ad-hoc QA cho BẤT KỲ web app — AI đọc requirement (fetch Plane/Jira URL) → hiểu logic → map flow → lái UI qua MCP Playwright (navigate/click/type/snapshot/console/network) + probe API; săn bug FUNCTIONAL + UI/UX với metric đo được; tự tạo test data theo business flow; bổ sung script Playwright khi cần chạy lặp; đóng gói evidence + log bug Plane. Dùng khi: "khám phá lỗi mới", "retest từ 1 link ticket", "verify sanity", "check UX", "poke nhanh", "chạy regression". Dữ liệu (URL/auth/evidence) lấy theo thư mục dự án đang test.
---

# qa-run — Skill QA Exploratory (global, đa dự án)

Engine dùng chung ở `~/.claude/skills/qa-run/`. **Dữ liệu lấy theo thư mục bạn chạy lệnh** (cwd hoặc `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` đều nằm trong thư mục dự án đang test — KHÔNG đụng vào skill. Một skill, mọi project.

> **Khi nào dùng**: khám phá lỗi mới, verify lại bug, poke UI/API ad-hoc trên 1 web app, sanity/risk-based khi cần chạy lặp, regression (bộ TC cố định) đặt ở instance dự án.
> **API key**: dùng chung từ `../config/api_keys.json` (xem scripts/ai_provider.py) — KHÔNG cần key nếu dùng Copilot Pro/Antigravity/Claude Code CLI.

## 🧠 Nguyên tắc #1 (quan trọng nhất): HIỂU NGỮ CẢNH trước khi lái UI

"Thông minh" = **không click mù**. AI phải đọc & hiểu logic trước, rồi mới poke. Thứ tự BẮT BUỘC:

### Bước A — Đọc requirement / spec / AC (NẾU có)
- Spec/PRD/ticket/AC (file local, URL, hoặc user paste)
- Trích thành danh sách requirements có ID: `{ "id":"AC1", "text":"..." }`
- Nếu KHÔNG có document → **hỏi user** cung cấp, hoặc đồng ý test theo UI hiện có
- Chi tiết fetch từ Plane: xem `qa-run/scripts/fetch-plane-issue.sh`

### Bước B — Trích xuất "bản đồ logic" trước khi test
1. **Happy path**: bước 1 → 2 → 3 → … → kết quả
2. **State / role**: ai được làm gì? (admin/user/guest; pending/active/closed)
3. **Inputs & ràng buộc**: loại data nào hợp lệ, range, format
4. **Side-effects**: thao tác này ghi đâu? (DB, API, queue, email, webhook)
5. **Edge case đáng ngờ**: concurrency, boundary, timeout, role khác
6. **Integration bên thứ 3**: payment, email, calendar, notification, search, AI

### Bước C — Form charter (mục tiêu exploratory có chủ đích)
Một dòng: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*
- Charter tốt nêu rõ **risk** (không phải "test cho vui")

### Bước D — Lái UI có định hướng (qua MCP Playwright)
- Happy path → snapshot từng bước → verify state đổi đúng
- **Sai lệch có chủ đích** ở mỗi bước: thử input invalid / boundary / concurrency
- Note lỗi console/HTTP lộ ra (`browser_console_messages`, `browser_network_requests`)

## 🚦 Nguyên tực #2: LÁI UI TƯƠNG TÁC qua MCP Playwright — đúng tool đúng việc

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

## ⚡ Tối ưu: TỐC ĐỘ + THÔNG MINH khi lái browser

### 🚀 A. Tăng tốc độ (giảm round-trip, giảm payload)

| Pattern | Thay vì | Lợi ích |
|---|---|---|
| Scope snapshot | snapshot cả trang | Payload nhỏ 5-20× |
| Batch fill | nhiều lần `browser_type` | 3 round-trip → 1 |
| Batch evaluate | N lần `browser_evaluate` | 1 round-trip |
| Wait deterministic | `wait_for_timeout` cứng | Không chờ thừa |
| Parallel tabs | navigate tuần tự | Probe song song |
| Block heavy resource | load full assets | 2-5× nhanh hơn |
| Reuse context | login mỗi probe | Bỏ login |

### 🧠 B. Tăng thông minh
1. **Heuristic checklist theo loại feature** - Form/Table/Filter/Auth/Modal/Async/Data
2. **Cross-verify (KHÔNG chỉ tin snapshot)** - DOM + network + console ≥ 2 nguồn
3. **Pattern memory** - đọc `FINDINGS.md` + `evidence/` cũ trước
4. **Parallel agent fan-out** - 3-5 agent probe 1 lúc (chỉ khi user opt-in)
5. **Charter với risk taxonomy** - H/M/L ưu tiên probe trước

## 🎨 UI/UX & Interaction testing

Khi retest/sanity: luôn rải 2-3 check UX ở khu vực fix (vì fix function đôi khi sinh ra UX issue).

**4 lỗi UI hay gặp nhất** (xem `references/UI-BUG-CATALOG.md`):
1. Action safety (delete không confirm)
2. Overlap-z-index (modal/tooltip che nút quan trọng)
3. Overflow-truncation (text bị cắt số tiền/tên/ID)
4. State-loading (loading state không hiển thị, "0" giả)

**3 loại bug đo được** (xem `browser_evaluate`):
- Click không ăn: 250ms latency / double-fire / pointer-events:none
- Giật lag: long-task > 100ms
- Spam button: request > 1 trong 1 lần bấm

## 🎯 Chọn kỹ thuật (12 kỹ thuật)

Xem `TESTING-TECHNIQUES.md` để biết chi tiết + coverage matrix.

12 kỹ thuật: Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression).

## 🩺 Sanity retest — workflow cụ thể khi user chỉ đưa 1 link ticket

Đây là case hay gặp nhất: *"Dev báo fix xong rồi, retest giúp ticket này"* → user chỉ paste URL.

### Bước 0 — Xác nhận scope
- Nếu user đã nói rõ "retest #X" / "verify fix #X" → thẳng bước 1
- Nếu chỉ nói "test #X" → hỏi 1 câu: *"Retest fix #X hay khám phá feature #X để tìm bug mới?"*

### Bước 1 — Fetch ticket (KHÔNG hỏi lại)
- Parse URL Plane → gọi API → trích AC, steps, expected, dev notes
- Lỗi 401/404/403 → báo user check API key + URL

### Bước 2 — Trích AC
- AC chính (happy path): "Khi user làm X thì hệ thống phải Y" → case PHẢI PASS
- AC phụ (edge case): input rỗng, concurrent, role khác → cũng phải test
- Repro steps của bug gốc (nếu bug ticket) → chạy lại đúng các bước
- Khu vực kề bên (AI tự suy luận): tính năng fix nằm trong flow nào? → poke xem có vỡ không

### Bước 3 — Verify từng AC
Với mỗi AC:
1. Setup điều kiện (login đúng role, clear localStorage, **chuẩn bị data test**)
2. Thực hiện đúng repro steps (KHÔNG tự ý thêm bước lạ)
3. Snapshot sau mỗi bước → so với "Expected" trong AC
4. Verify cả network response (nếu AC liên quan persist/tính toán)
5. Chấm PASS/FAIL từng AC — KHÔNG gộp "tổng thể OK"

### Bước 4 — Adjacent area check (BẮT BUỘC)
- Click vào các nút/tab/list liên quan → snapshot → có lỗi mới không?
- Tạo 1 record bằng flow khác (vd import file thay vì form) → có dùng chung validation không?
- Refresh/back giữa chừng flow → state có bẩn không?
- Đổi role user (vd guest xem trang admin) → có leak permission không?
- `browser_console_messages` + `browser_network_requests` cuối phiên → có warning/error lạ không?

### Bước 5 — Verdict + report
```
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAIL>
**Nguồn requirement:** <URL ticket đã fetch>
**AC1 (<mô tả>):** PASS  — <evidence 1 dòng>
**AC2 (<mô tả>):** FAIL  — <quan sát sai lệch>
**Adjacent:** PASS — <note>
**Verdict:** PASS (nếu tất cả AC chính PASS) / FAIL (nếu ≥1 AC chính FAIL)
```
- Ghi `FINDINGS.md` theo format chuẩn (`report/REPORT-TEMPLATE.md`)
- Nếu FAIL → mở bug Plane (section 4)

## 🌱 Test data — khi THIẾU data: hỏi user HOẶC tự tạo

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

## 🧰 Token-frugal (BẮT BUỘC giữ khi viết script)

Xem `lib/driver.mjs` + `lib/ui.mjs` + `lib/assert.mjs`:
- `lib/driver.mjs`: headless, screenshot ra file (không trả bytes ảnh vào context)
- `lib/ui.mjs`: `snap()` chỉ in phần tử tương tác + text chính + console/HTTP≥400
- `lib/assert.mjs`: `check/eq/summary` - gọn nhẹ
- Cắt response body `.slice(0,200)`; in gọn
- **Quy tắc vàng**: 1 probe = 1 câu hỏi. Đặt tên `probe-<ticket>-<aspect>.mjs`

## Quy trình cho 1 dự án

### 0. Setup (mỗi dự án 1 lần)
Trong **thư mục QA của dự án** (vd `MyProject/qa/`), tạo `.env`:
```
QA_BASE_URL=https://app-cua-du-an.com
QA_EMAIL=...
QA_PASSWORD=...
```
Rồi (chạy TỪ thư mục đó để data ghi vào đúng dự án) — dùng MCP Playwright để login:
- `browser_navigate(BASE + '/login')` → `browser_snapshot` → `browser_fill_form` (email/password) → `browser_click` submit → `browser_wait_for` url đổi → lưu cookie (Playwright MCP tự quản session).

> Nếu project cần auth.json để script npm Playwright chạy được (regression/batch): `node scripts/login.mjs` → tạo `auth.json` + `evidence/` ở đây.

### 1. Khám phá rộng (mặc định: HIỂU trước → LÁI sau)
Xem @Bước A-D ở trên.

### 2. Đào sâu 1 nghi vấn
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
import { browser, snap, shot, BASE } from '/Users/<user>/.claude/skills/qa-run/lib/driver.mjs';
import { recordNet, waitForStable, withRevert } from '/Users/<user>/.claude/skills/qa-run/lib/ui.mjs';
import { eq, check, summary } from '/Users/<user>/.claude/skills/qa-run/lib/assert.mjs';
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

### 3. Ghi nhận → `FINDINGS.md` (trong thư mục dự án)
Mỗi bug: **Quan sát → Expected → Evidence:<png> → Severity → TC**. Gom theo root-cause.
Report & comment theo **format chuẩn** ở `report/REPORT-TEMPLATE.md` — quy tắc số 1: **Actual & Steps phải xuống dòng từng ý (bullet/numbered), KHÔNG viết liền 1 đoạn**.

### 4. Đóng gói / bàn giao — log bug Plane có **preview ảnh INLINE** (không phải file đính kèm)

**Mục tiêu**: mở ticket trên Plane → scroll description → **thấy ảnh preview ngay**, KHÔNG cần bấm tải file về.

**Cách làm** (đã verify với Plane self-hosted):
1. Upload ảnh lên Plane qua endpoint `issues/{id}/issue-attachments/` (S3 presigned) → trả về asset URL
2. Trong `description_html`, embed URL đó bằng `<img src="<plane-asset-url>">`
3. Khi render, Plane sẽ hiển thị ảnh inline trong description + đồng thời liệt kê trong Attachments

> ⚠️ **KHÔNG dùng base64 data URI** trong description — Plane self-hosted sẽ **strip ảnh khi render**. Phải dùng URL asset sau khi upload.

Wrapper script `qa-run/scripts/log-bug.mjs` đã làm sẵn:
```bash
# Tự động build JSON + upload ảnh + log bug. Khô cần điền template.
# Đặt ở: <project>/qa/log-bug.mjs
node <project>/qa/log-bug.mjs --title "[W26][Login] Email validation sai" \
  --module "Login" --severity "High" --screenshots "evidence/probe-430.png" \
  --steps "1. Mở /login\n2. Để trống Email\n3. Click Login" \
  --expected "Hiển thị thông báo yêu cầu nhập Email" \
  --actual "Không có thông báo, vẫn submit" \
  --assign "hungtn,phongtq" --state "Todo"
```

## 🌱 Test data — khi THIẾU data: hỏi user HOẶC tự tạo theo business flow

> Xem chi tiết ở phần `🌱 Test data` phía trên (đã trình bày).

## ⚠ Lỗi thường gặp + cách fix

| Lỗi | Nguyên nhân | Cách fix |
|---|---|---|
| `Không tìm thấy .env` | cwd sai | `cd ~/Documents/QA-MDS/<project>` trước khi chạy |
| `401 Unauthorized` (Plane) | API key sai/expire | Rotate key ở Plane Profile |
| Skill không xuất hiện | Folder sai vị trí | Verify path là `~/.claude/skills/<name>/SKILL.md` |
| AI click mù không hiểu | Skip Bước A-D | BẮT BUỘC đọc spec trước |
| Push lên GitHub mà lộ auth.json | Quên `.gitignore` | `git rm --cached auth.json` + rotate key |

## 🔁 Fallback: dùng Google Antigravity nếu KHÔNG còn Claude Code + Playwright

Nếu Claude Code hết quyền dùng, hoặc MCP Playwright bị gỡ/vỡ → **skill vẫn chạy được trên Antigravity** (agentic platform của Google: CLI + IDE + Gemini-in-Chrome). Phần lớn asset của skill là **portable** — chỉ đổi "bộ não lái UI".

### Asset portable (chạy ở bất kỳ env có Node ≥ 18)
| Asset | Lý do portable |
|---|---|
| `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm |
| `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, gọi `node <script>` |
| `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API |
| `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib |
| **Nguyên tắc #1** (hiểu ngữ cảnh trước khi lái), 5 kỹ thuật testing, workflow retest/sanity | **Methodology** — độc lập tool |
| `.env`, `auth.json`, `evidence/` | Nằm trong thư mục dự án, KHÔNG phụ thuộc Claude Code |

### Cần đổi (chỉ "bộ não lái UI")
| Việc | Claude Code (mặc định) | Antigravity (fallback) |
|---|---|---|
| Lái UI tương tác | `mcp__playwright__browser_*` | **Gemini-in-Chrome** (Antigravity tự điều khiển Chrome) |
| Fetch ticket từ URL | `WebFetch` | Antigravity web tool / `curl` trong terminal |
| Agent reasoning | Claude (model này) | Gemini 3 (Antigravity default) |
| Chạy probe script | `node scripts/x.mjs` qua Bash tool | `node scripts/x.mjs` qua terminal |
| Log bug | `node log-bug.mjs ...` | `node log-bug.mjs ...` |

### Workflow trên Antigravity
1. Mở Antigravity IDE → mở thư mục dự án (vd `MyProject/qa/`)
2. Agent (Gemini) tự dùng **Gemini-in-Chrome** để navigate/click/snapshot/probe API
3. Khi cần batch/regression → agent chạy `node ~/.claude/skills/qa-run/scripts/sweep.mjs`
4. Khi log bug → agent chạy `node log-bug.mjs ...` (script portable)
5. Verdict + report theo cùng format (`report/REPORT-TEMPLATE.md`)

### Lưu ý khi fallback
- `auth.json` phải có (Antigravity chạy npm Playwright script cần `auth.json`)
- Gemini-in-Chrome của Antigravity **KHÔNG** tự share với playwright headless → phải login lại bằng `login.mjs`
- Prompt khác model: Gemini 3 hiểu workflow này nếu prompt rõ

## Regression (deterministic)

Bộ TC cố định, chạy lặp tất định, đặt ở instance dự án (vd `MyProject/qa/regression/`). KHÔNG để ở engine global.

Cấu trúc data-driven: `cases.mjs` + `run.mjs`, idempotent (withRevert), verdict CI (`process.exit(summary()?0:1)`). Xem `TESTING-TECHNIQUES.md` §5.

## Cấu hình API key

Một lần cấu hình key tại `../config/api_keys.json` (gitignored), dùng được cho cả 3 skill trong repo qa-skill. Xem [README.md](../README.md) mục "API Keys" và `scripts/ai_provider.py`.

## Appendix — ported modules

Các module đã port:
- **A.1 Test Data Generator** — format chuẩn `[prefix]_[testName]_[timestamp]_[random]`, helper tại `lib/tdata.mjs`

Các concept chưa port (để roadmap): A.2 Flaky Detector, A.2 Locator Healer, A.3 UI/API Flow Generator.

## Tóm tắt nhanh

- **Nguyên tắc #1**: HIỂU NGỮ CẢNH trước (đọc spec, trích AC, map logic, form charter)
- **Nguyên tắc #2**: Lái UI qua MCP Playwright
- **Token-frugal**: snapshot scope, batch fill, deterministic wait
- **Test data**: ưu tiên tự tạo qua API + withRevert cleanup
- **API key**: 1 file config chung, không cần key nếu dùng Copilot/Antigravity
- **Fallback**: Antigravity nếu Claude Code + Playwright không khả dụng
