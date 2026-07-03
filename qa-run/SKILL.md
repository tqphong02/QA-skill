---
name: qa-run
description: Exploratory / ad-hoc QA cho BẤT KỲ web app nào — AI TỰ ĐỌC requirement (fetch ticket từ Plane/Jira nếu chỉ có URL) → hiểu logic → map flow → lái UI tương tác qua MCP Playwright (browser_navigate/click/type/snapshot/console/network) + probe API trực tiếp; săn cả bug FUNCTIONAL lẫn UI/UX (tính năng khó hiểu, click không ăn, giật lag, double-fire, layout, a11y) với metric đo được; TỰ TẠO test data theo business flow khi thiếu (hoặc hỏi user nếu không tạo được) + cleanup withRevert; bổ sung script npm Playwright cho risk-based / sanity / regression khi cần chạy lặp tất định; đóng gói bằng chứng (PDF/Drive) + log bug Plane (ảnh preview inline trong description). Dùng khi cần KHÁM PHÁ lỗi mới / retest từ 1 link ticket / verify sanity / check UX / poke nhanh / chạy regression. Chạy mọi project: dữ liệu (URL/auth/evidence) lấy theo thư mục dự án đang test, không cần copy skill.
---

# qa-run — Skill QA Exploratory (global, đa dự án)

Engine dùng chung ở `~/.claude/skills/qa-run/`. **Dữ liệu lấy theo thư mục bạn chạy lệnh** (cwd hoặc `QA_DATA_DIR`): `.env`, `auth.json`, `evidence/` đều nằm trong thư mục dự án đang test — KHÔNG đụng vào skill. Một skill, mọi project.

> **Khi nào dùng:** khám phá lỗi mới, verify lại bug, poke UI/API ad-hoc trên 1 web app, sanity/risk-based khi cần chạy lặp, regression (bộ TC cố định) đặt ở instance dự án.

## 🧠 Nguyên tắc #1 (quan trọng nhất): **HIỂU NGỮ CẢNH trước khi lái UI**

"Thông minh" = **không click mù**. AI phải đọc & hiểu logic trước, rồi mới poke. Thứ tự BẮT BUỘC:

### Bước A — **Đọc requirement / spec / AC** (NẾU có)

**Chỉ có 1 link ticket** (case phổ biến nhất: user chỉ paste URL) → **AI TỰ FETCH, không hỏi lại**:
1. `WebFetch` URL ticket (Plane/Jira/Linear/GitHub Issue…) với prompt: *"Extract: title, description, acceptance criteria (AC), steps to reproduce, expected vs actual, comments (especially dev notes about fix approach), related PR/commit links."*
2. Nếu ticket có link PR/commit kèm → `WebFetch` tiếp để biết **diff** (file nào đổi, validation rule nào thêm/sửa).
3. Nếu fetch fail (private/auth) → hỏi user 1 câu ngắn: "Ticket cần auth, bạn paste nội dung hoặc cho API token?"

**Có sẵn file local** → đọc file: ticket `.md`, spec `PRD.md`, AC trong `acceptance/*.md`.

**Có spec / PRD / doc** → đọc thêm: state machine, role, data shape, integration.

**Không có gì hết (chỉ có URL app + tên feature)** → **TỰ SUY LUẬN** từ UI hiện có + URL path + label + hint trong DOM (xem Bước B).

> **Bắt buộc**: Ghi lại 1 dòng *"Nguồn requirement: <URL/file URL/tự suy luận từ DOM>"* trong context test, để khỏi quên gốc.

### Bước B — **Trích xuất "bản đồ logic" trước khi test**
Tự fill vào 1 bản đồ (chỉ trong context AI, không cần file):
1. **Happy path**: bước 1 → 2 → 3 → … → kết quả. (Đọc AC nếu có, hoặc đoán từ UI label.)
2. **State / role**: ai được làm gì? (admin/user/guest; trạng thái pending/active/closed).
3. **Inputs & ràng buộc**: loại dữ liệu nào hợp lệ, range nào, format nào? (form validation, regex, maxlength).
4. **Side-effects**: thao tác này ghi đâu? (DB bảng nào, API nào, message queue, email, webhook).
5. **Edge case đáng ngờ**: concurrency (2 tab cùng sửa), boundary (0, max+1, rỗng, ký tự Unicode), refresh/back giữa chừng, đổi tab rồi quay lại, mạng chậm/timeout, role khác xem cùng record, time-zone/locale, idempotency.
6. **Integration bên thứ 3**: payment, email, calendar, notification, search, AI — chỗ này hay vỡ.

### Bước C — **Form charter (mục tiêu exploratory có chủ đích)**
Một dòng: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*
Charter tốt nêu rõ **risk** (không phải "test cho vui").

### Bước D — **Lái UI có định hướng** (qua MCP Playwright)
Với mỗi bước trong Bản đồ logic:
1. Đi đúng happy path → snapshot từng bước → verify state đổi đúng (đọc DOM / network).
2. **Sai lệch có chủ đích**: ở mỗi bước, thử 1 input invalid / boundary / concurrency → xem hệ thống có xử lý đúng (validation, error message, rollback) không.
3. **Verify verdict từ spec, không đoán**: nếu AC nói "combine AND" → test combine AND; KHÔNG tự thêm "or" rồi kết luận.

> **Ngược lại bản cũ**: bản cũ bảo AI "chạy sweep.mjs + viết probe-x.mjs" → AI click theo script có sẵn, KHÔNG hiểu feature đang test cái gì. Bản này: AI **đọc → hiểu → map → mới lái**.

## 🚦 Nguyên tắc #2: **LÁI UI TƯƠNG TÁC qua MCP Playwright** — đúng tool đúng việc

| Việc cần làm | Cách làm |
|---|---|
| Mở trang | `mcp__playwright__browser_navigate` |
| Xem DOM tương tác (headings, buttons, inputs, toasts, console err, HTTP≥400) | `mcp__playwright__browser_snapshot` |
| Bấm nút / link / text | `mcp__playwright__browser_click` |
| Điền form | `mcp__playwright__browser_fill_form` hoặc `browser_type` |
| Chạy JS tuỳ ý (probe API, đọc state) | `mcp__playwright__browser_evaluate` |
| Chờ text / state | `browser_wait_for` text ổn định (không `wait_for_timeout` cứng) |
| Test nhiều trang / nhiều endpoint | `mcp__playwright__browser_tabs` (mở song song) |
| Xem network + console | `browser_network_requests` / `browser_console_messages` |
| So sánh baseline | `browser_take_screenshot` (chỉ khi cần so pixel — KHÔNG lạm dụng, tốn token) |

> **MCP Playwright = bộ não**, scripts npm = cần cẩu. Mặc định dùng não. Chỉ viết script khi cần chạy lặp (regression) hoặc probe phức tạp cần import helper.

## ⚡ Tối ưu: TỐC ĐỘ + THÔNG MINH khi lái browser

Mặc định AI lái UI chậm + hời hợt vì: snapshot cả trang (payload lớn), điền từng field, chờ sleep cứng, chỉ đọc DOM. Áp dụng 2 nhóm pattern dưới để **nhanh 2-5×** và **bắt được bug tinh tế hơn**.

### 🚀 A. Tăng tốc độ (giảm round-trip, giảm payload)

| Pattern | Thay vì | Lợi ích |
|---|---|---|
| **Scope snapshot**: `browser_snapshot({target: <ref>, depth: 3})` | snapshot cả trang | Payload nhỏ 5-20×, AI đọc nhanh hơn, focus đúng vùng nghi vấn |
| **Batch fill**: `browser_fill_form({fields: [field1, field2, field3]})` | 3 lần `browser_type` riêng | 3 round-trip → 1 |
| **Batch evaluate**: 1 `browser_evaluate` đọc N value / check N điều kiện | N lần `browser_evaluate` | 1 round-trip lấy hết state cần verify |
| **Wait deterministic**: `browser_wait_for({text: "Saved"})` | `browser_wait_for({time: 3})` | Xong ngay khi text xuất hiện, không đợi thừa |
| **Parallel tabs**: `browser_tabs({action: new, url})` cho page độc lập | navigate tuần tự | Probe nhiều route song song |
| **Block heavy resource** (khi chỉ probe API/DOM): `browser_run_code_unsafe` route-abort ảnh/font/css | load full assets | Page load nhanh 2-5× |
| **Reuse context**: login 1 lần, MCP Playwright giữ session; script npm tái dùng `auth.json` | login mỗi probe | Bỏ hoàn toàn bước login |
| **Chọn wait strategy thông minh**: đa số trường hợp `domcontentloaded` đủ (đã thêm `waitForTimeout(400)` trong `snap()`) | `networkidle` | Nhanh hơn, không kẹt ở long-poll/websocket |

**Template batch-evaluate (đọc nhiều state trong 1 call):**
```js
// browser_evaluate — function body
() => {
  const q = s => document.querySelector(s);
  return {
    total: q('[data-testid="total"]')?.innerText,
    rowCount: q.querySelectorAll('tbody tr').length,
    firstRowName: q('tbody tr:first-child td:nth-child(2)')?.innerText,
    filterActive: !!q('[aria-pressed="true"]'),
    toast: q('[role="alert"]')?.innerText,
  };
}
```
→ 1 call lấy 5 giá trị để verify, thay vì 5 snapshot/evaluate riêng.

**Template block heavy resource (probe API thuần):**
```js
// browser_run_code_unsafe — async (page) =>
async (page) => {
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,css}', r => r.abort());
  // giờ page.goto chỉ load HTML+JS+API — nhanh hơn nhiều khi probe network
}
```

### 🧠 B. Tăng thông minh (bắt bug tinh tế, hiểu sâu hơn)

1. **Heuristic checklist theo loại feature** — AI chủ động poke chỗ hay vỡ, không đợi user nhắc:
   - **Form**: rỗng / quá dài / ký tự Unicode / SQL-XSS (`<script>`, `'`, `"`) / paste / submit 2 lần (double-click) / back sau khi submit / refresh giữa chừng.
   - **Table/List**: sort cột / phân trang boundary (trang cuối, 0 row) / filter combine AND+OR / search với ký tự đặc biệt / empty state.
   - **Filter**: clear-all / combine nhiều / filter rồi đổi page rồi quay lại (state có giữ?) / filter xong export.
   - **Auth/Permission**: guest xem trang admin / 2 role khác xem cùng record / token hết hạn giữa phiên / logout rồi back.
   - **Modal/Drawer**: Esc / click outside / submit rồi đóng / mở 2 modal chồng nhau / refresh khi modal đang mở.
   - **Async/Concurrency**: 2 tab cùng sửa 1 record / mạng chậm (throttle) / race condition khi click nhanh / optimistic-update rollback khi API fail.
   - **Data integrity**: tạo → sửa → xoá → verify DB rỗng / import file sai format / số âm / ngày quá khứ / future date.

2. **Cross-verify (KHÔNG chỉ tin snapshot)** — mỗi verdict phải có ≥2 nguồn:
   - DOM (snapshot/evaluate) **+** network response (`browser_network_requests`) **+** console (`browser_console_messages`).
   - Vd bug "saved" toast nhưng không persist: chỉ thấy toast = FALSE POSITIVE. Phải check network có `PUT 200` + read-back value đúng.

3. **Pattern memory** — trước khi test 1 project, **đọc `FINDINGS.md` + `evidence/` cũ**:
   - Nhận diện **regression** (bug từng fix nay lại xuất hiện).
   - Nhận diện **root-cause lặp** (vd "luôn quên wait data load → đọc 0 sớm" — phòng tránh).
   - Focus probe vào **khu vực từng nhiều bug** (likelihood cao theo risk-based).

4. **Parallel agent fan-out** (Workflow tool) — khi cần khám phá RỘNG:
   - Spawn 3-5 agent, mỗi cái probe 1 feature area độc lập (forms / tables / auth / integration / performance).
   - Mỗi agent chạy song song → giảm wall-clock, mỗi agent đủ "focus" để đào sâu.
   - Gom kết quả → dedup → verify chéo trước khi kết luận.
   - **Chỉ khi user opt-in** workflow (không tự ý spawn agent).

5. **Charter với risk taxonomy** (Ưu tiên H/M/L trước khi poke):
   - **H** (impact × likelihood cao): auth, payment, ghi dữ liệu, integration 3rd party → **đào sâu + cross-verify network**.
   - **M**: validation, navigation, display logic → happy path + 2-3 edge.
   - **L**: cosmetic, copy → chạm 1 phát, không đào.

6. **Visual baseline diff** (khi cần): `browser_take_screenshot` ở trạng thái baseline + sau change → so sánh (bằng mắt hoặc `pixelmatch` trong script npm). Dùng cho regression UI, KHÔNG lạm dụng cho exploratory (tốn token).

### 🎯 C. Recipe "fast + smart probe" (template ghép A + B)
```
1. [Hiểu] Đọc ticket/spec (WebFetch) → trích AC + edge case đáng nghi → form charter có risk H/M/L
2. [Setup nhanh] browser_navigate(login) 1 lần; nếu probe API thuần → browser_run_code_unsafe block resource
3. [Probe chính] với mỗi AC:
   a. browser_fill_form (batch tất cả input) → browser_click submit
   b. browser_wait_for({text: <expected>})     ← deterministic, không sleep
   c. browser_evaluate (batch: đọc DOM state + check điều kiện + trả object)
   d. browser_network_requests({filter: <api>}) + browser_console_messages   ← cross-verify
   e. Chấm PASS/FAIL từ ≥2 nguồn (DOM + network)
4. [Probe heuristic] apply checklist loại feature (B.1) — poke 3-5 case boundary/concurrency
5. [Ghi] browser_take_screenshot (chỉ bước kết luận) → FINDINGS.md → log-bug.mjs nếu FAIL
```
→ 1 probe = ~6-10 tool call (thay vì 20-30 nếu làm chậm), vẫn cross-verify đủ.

## 🎨 UI/UX & Interaction testing — mở rộng từ bug functional sang UX/feel

> qa-run mặc định săn bug **functional** (logic, API, data). Section này thêm khả năng phát hiện: **tính năng khó hiểu / không thân thiện** (UX) + **lỗi tương tác** (click không ăn, giật lag, double-fire, **spam button**, focus, keyboard) + **visual/layout** (**UI che content**, **vượt layout/truncation**) + **a11y**.
>
> 📋 **Catalog đầy đủ 10 category bug UI** ở `references/UI-BUG-CATALOG.md` (action safety / overlap-z-index / overflow-truncation / state-loading / responsive / form / navigation / animation / concurrency / a11y). Áp dụng song song khi exploratory.

### Khi nào bật UI/UX mode
- User nói "check UX", "thấy giật", "click không ăn", "khó dùng", "lag", "spam", "che content", "vượt layout"
- Hoặc AI **tự nhận** thấy khi snapshot (overlap, label mơ hồ, không feedback) → vẫn báo, tag rõ `[UX]`
- Khi retest/sanity: luôn rải 2-3 check UX ở khu vực fix (vì fix function đôi khi sinh ra UX issue)

### A. UX heuristics — tính năng khó hiểu / không thân thiện (AI judgment, KHÔNG cần tool)
Áp dụng checklist này **khi snapshot mỗi page** (đọc DOM + nhìn flow):
- [ ] **Label/CTA mơ hồ** — "Submit" thay vì "Save changes", icon không text, user không biết bấm xong xảy ra gì
- [ ] **Thiếu feedback sau action** — không loading / không toast / không redirect → user không biết đã xong
- [ ] **Quá nhiều bước** cho task đơn giản (3 click cho cái có thể 1 click)
- [ ] **Pattern không nhất quán** — trang A dùng modal, trang B dùng page cho cùng việc
- [ ] **Feature khó tìm** — buried trong menu sâu, không có shortcut, không discoverable
- [ ] **Error message không helpful** — "Something went wrong" thay vì nói cái gì sai + cách fix
- [ ] **Hành động phá huỷ không confirm/undo** — xoá 1 phát, không hỏi
- [ ] **Cognitive overload** — quá nhiều field/info cùng lúc, không group, không progressive disclosure
- [ ] **State không rõ** — user không biết đang ở step nào, đã save chưa, đang edit hay view
- [ ] **Empty state tệ** — "No data" trần, không gợi ý tạo mới / không explain vì sao trống

→ Mỗi vấn đề note: **vị trí (page + selector) + vì sao khó hiểu + gợi ý fix 1 dòng**. Đây là **judgment call của AI**, không cần metric.

### B. Interaction bugs — click không ăn, giật, double-fire, SPAM (MEASURABLE — verify được)

| Triệu chứng user báo | Verify bằng MCP Playwright | Bug nếu |
|---|---|---|
| "Click không ăn" | `browser_evaluate` check `pointer-events`, `disabled`, element che (elementsFromPoint) | `pointer-events:none` / bị che / disabled |
| "Bấm 2 lần tạo 2 record" | double-click nhanh + `browser_network_requests` đếm mutating request | request > 1 (thiếu debounce) |
| **"Spam button sync gọi nhiều API"** | click N lần nhanh (delay 50-60ms) + đếm mutating API → phải = 1 | **API > 1 → thiếu debounce/guard → duplicate record/quota waste** |
| **"Submit khi đang loading"** | click → chờ 100ms → click lại → đếm API | request > 1 |
| **"Toggle spam state lệch"** | click switch N lần nhanh → đọc state cuối vs mong đợi | state cuối sai |
| "Giật / lag" | đo click→paint latency + Performance API long-task | latency > 200ms / long-task > 100ms |
| "Sắp xếp lại đột ngột" | đo CLS (layout-shift entries) | CLS > 0.1 |
| "Focus bị mất sau action" | `browser_evaluate(() => document.activeElement)` trước/sau | activeElement sai/không xác |
| "Tab/Enter không work" | `browser_press_key('Tab'/'Enter')` + check focus/di chuyển | focus không đổi / Enter không submit |
| "Modal không Esc đóng được" | `browser_press_key('Escape')` + check modal còn | modal vẫn mở |
| "Hover nhấp nháy" | `browser_hover` + check CSS transition có `transition-duration: 0` | flicker |

**Auto spam test (1 lệnh):**
```bash
node ~/.claude/skills/qa-run/scripts/ux-health.mjs /dashboard --spam "button:has-text('Sync')" "/api/sync" 5
# → click Sync 5 lần nhanh, báo số API call. >1 = thiếu guard = BUG.
```

**Recipe "click không ăn" (debug 1 phát):**
```js
// browser_evaluate với element target
(el) => {
  const r = el.getBoundingClientRect();
  const top = document.elementsFromPoint(r.x + r.width/2, r.y + r.height/2)[0];
  return {
    tag: el.tagName, disabled: el.disabled,
    pointerEvents: getComputedStyle(el).pointerEvents,
    visible: r.width > 0 && r.height > 0,
    hasClick: !!el.onclick || el.getAttribute('role') === 'button',
    obscuredBy: top && top !== el ? `${top.tagName}.${top.className}` : null,
  };
}
```
→ trả về object → biết ngay vì sao click không ăn.

### C. Performance / feel metrics (đo được, KHÔNG đoán)
| Metric | Target | Đo bằng |
|---|---|---|
| Click→paint latency | < 200ms | `performance.now()` quanh `el.click()` + 2 frame |
| CLS (layout shift) | < 0.1 | `PerformanceObserver` type `layout-shift` |
| Long tasks | < 100ms | `PerformanceObserver` type `longtask` |
| INP (interaction latency) | < 200ms | `PerformanceObserver` type `event` |

**Chạy batch (tất cả metric 1 lần):**
```bash
node ~/.claude/skills/qa-run/scripts/ux-health.mjs /dashboard "button#save,a.delete"
```
→ in CLS / long-task / click latency / double-fire / target-health / a11y / **horizontal-overflow / truncation / touch-target / CTA-overlap / sticky-header-offset** + screenshot. Coi ⚠️ là vấn đề cần đào sâu.

### D. Visual / layout / responsive / OVERLAP / OVERFLOW (bug UI hay gặp nhất)
- **Responsive**: `browser_resize` test breakpoints 375 (mobile) / 768 (tablet) / 1024 / 1440 → snapshot mỗi size → check overlap, horizontal-scroll, truncation.
- **UI che content (overlap/z-index)** — catalog §2: modal/drawer/tooltip/toast che nút quan trọng? `browser_evaluate` elementsFromPoint tại tọa độ CTA → topmost có phải nút không? Sticky header che anchor khi scroll? Backdrop modal có cover full viewport?
- **Vượt layout (overflow)** — catalog §3: horizontal scroll xuất hiện? (`scrollWidth > innerWidth`) Text truncation cắt số tiền/tên/ID? (`scrollWidth > clientWidth`) Long URL/string không break-word? Table cột tràn? Content bị fixed footer che không scroll tới? Element escape container?
- **Truncation**: text bị cut `…` ở chỗ quan trọng? (`browser_evaluate` check `scrollWidth > clientWidth`)
- **Auto-scan tất cả**: `ux-health.mjs` (không cần selector) đã quét sẵn overflow + truncation + touch-target + sticky-header offset cho cả page.
- **Chính tả / typo**: khi `browser_snapshot` → AI để ý label/button/toast/error-message sai chính tả (tiếng Việt lẫn EN), inconsistency thuật ngữ (trang A "Khách hàng", trang B "Customer"). Note vị trí + sửa đúng.
- **Tooltip / hint**: hover element có tooltip không? Tooltip đúng nội dung, không che nút cần bấm, không cắt text? (`browser_hover` + `browser_snapshot` check `[title]`, `[data-tooltip]`, `.tooltip`)
- **Loading state**: có skeleton/spinner khi data đang load? KHÔNG hiện "0" hay "No data" giả khi đang fetch (bẫy `waitForStable`).
- **Dark mode / theme**: toggle theme → re-snapshot (nếu app có).

### E. Accessibility (a11y) quick-check
- **Tên truy cập**: button/link/input có `aria-label` / text / `title` không? (`ux-health.mjs` scan sẵn)
- **Contrast**: foreground/background ratio < 4.5:1 = fail (đo computed style → tính luminance)
- **Keyboard**: `browser_press_key('Tab')` lặp → focus có đi đến mọi interactive element không? Có visible focus ring không?
- **Screen reader**: semantic tag (`<button>` không phải `<div onclick>`), heading order đúng.

### F. Severity & report cho UX issues (KHÁC bug functional)
- **Tag `[UX]` trong title** khi log bug: `[W26][UX][Filter] Nút "Apply" không có loading → user bấm 2 lần`
- **Severity UX riêng**:
  - **H (Blocker)**: user KHÔNG thể hoàn thành task (click không ăn ở nút chính, modal không đóng được)
  - **M (Major)**: frustrating nhưng có workaround (lag 500ms, label mơ hồ, không feedback)
  - **L (Polish)**: cosmetic, a11y minor, spacing
- **Evidence bắt buộc**: screenshot + (nếu measurable) metric số liệu (vd "latency 850ms", "CLS 0.23")
- **Report format** vẫn theo `report/REPORT-TEMPLATE.md` nhưng thêm section **`<strong>UX impact:</strong>`** 1 dòng mô tả ảnh hưởng đến user.

### G. Tích hợp vào flow chính
- **Exploratory**: sau khi test function 1 feature → rải 2-3 check UX (B + heuristic A) ở cùng khu vực.
- **Sanity retest**: khi verify fix → chạy `ux-health.mjs` trên trang fix để bắt UX regression (vd fix logic làm chậm render).
- **Risk-based**: feature có nhiều interaction (form phức tạp, drag-drop, real-time) → ưu tiên UX probe sâu.

## 🎯 Chọn kỹ thuật (12 kỹ thuật) — xem `TESTING-TECHNIQUES.md` để biết chi tiết + coverage matrix
Skill phủ **đủ 12 kỹ thuật**: Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression). Mỗi kỹ thuật có section + tool riêng trong `TESTING-TECHNIQUES.md` (§1-§15) và matrix ở đầu file.

- **Ad-hoc / Exploratory** (mặc định 80%): **Hiểu ngữ cảnh → Lái UI có định hướng** (Nguyên tắc #1 + #2). Charter + tours (feature / data / error-guessing / CRUD).
- **Form/entity** → CRUD (§8) + Boundary payload (§6: empty/Unicode/SQL/XSS/emoji/date).
- **Luồng nhiều bước** → Workflow (§10); **cố tình phá** → Monkey (§7).
- **Cross-browser/device** → Compatibility (§11, `scripts/compat.mjs` — Chrome/Edge/Firefox/Safari × mobile/tablet).
- **Timebox có cấu trúc** → Session-based (§12, `session-log.md`).
- **Risk-based / Sanity** (cần lặp): dùng `scripts/sweep.mjs`, `scripts/api-health.mjs`, viết `probe-x.mjs`.
- **Regression** (deterministic, bộ TC cố định): đặt ở instance dự án (`MyProject/qa/regression/`), KHÔNG ở engine global.

## 🩺 Sanity retest — workflow cụ thể khi user chỉ đưa **1 link ticket**

Đây là case hay gặp nhất: *"Dev báo fix xong rồi, retest giúp ticket này"* → user chỉ paste URL. AI phải TỰ LÀM HẾT, không hỏi vặt.

### Bước 0 — Xác nhận scope trước khi làm (1 câu hỏi duy nhất, không spam)
- Nếu user đã nói rõ "retest #X" / "verify fix #X" → thẳng bước 1.
- Nếu user chỉ nói "test #X" / "xem ticket #X" → hỏi **1 câu**: *"Retest fix #X hay khám phá feature #X để tìm bug mới?"* (định hướng khác nhau).

### Bước 1 — Fetch ticket (tự động, không hỏi)
- `WebFetch(URL, prompt="Extract: title, description, acceptance criteria (AC), steps to reproduce, expected vs actual, comments (đặc biệt: dev ghi gì về fix approach), linked PR/commit. Trả về tiếng Việt nếu có thể.")`.
- Nếu URL dạng `app.plane.so/.../issues/<ID>` → có thể fetch thẳng.
- Nếu fetch fail (private) → hỏi user 1 câu duy nhất: *"Ticket cần auth — bạn paste text hoặc dán API token Plane vào .env?"*.

### Bước 2 — Trích xuất **acceptance criteria** (đây là "đề bài" của sanity)
Từ nội dung ticket, AI tự tách:
1. **AC chính** (happy path): "Khi user làm X thì hệ thống phải Y" → đây là case PHẢI PASS.
2. **AC phụ** (edge case đã liệt kê trong ticket): input rỗng, concurrent, role khác, time-zone… → cũng phải test.
3. **Repro steps của bug gốc** (nếu là bug ticket): chạy lại đúng các bước đó → xem fix đúng chưa.
4. **"Khu vực kề bên"** (do AI tự suy luận): tính năng fix nằm trong flow nào? Có nút/tab/list nào dùng chung API/component? → phải poke xem có vỡ không.

### Bước 3 — Build "bản đồ logic" từ AC (theo Nguyên tắc #1 Bước B)
- Happy path = chuỗi AC chính.
- State/role = từ ticket (vd "chỉ admin được").
- Edge case = gộp AC phụ + edge tự suy luận từ code/component dùng chung.

### Bước 4 — Verify từng AC qua MCP Playwright
Với mỗi AC:
1. **Setup điều kiện**: login đúng role, clear localStorage, **chuẩn bị data test** — nếu hệ thống thiếu data cần cho AC (vd event Pending) → áp dụng **🌱 Test data** (tự tạo theo business flow hoặc hỏi user).
2. **Thực hiện đúng repro steps** từ ticket (KHÔNG tự ý thêm bước lạ).
3. **Snapshot sau mỗi bước** → so với "Expected" trong AC.
4. **Verify cả network response** (`browser_network_requests`) nếu AC liên quan persist/tính toán.
5. **Chấm PASS/FAIL từng AC** — KHÔNG gộp "tổng thể OK" mà phải rõ AC nào fail.

### Bước 5 — Adjacent area check (bắt buộc, dễ miss nhất)
Từ code/component dùng chung → probe 3-5 case:
- Click vào các nút/tab/list liên quan → snapshot → có lỗi mới không?
- Tạo 1 record bằng flow khác (vd import file thay vì form) → có dùng chung validation không?
- Refresh/back giữa chừng flow → state có bẩn không?
- Đổi role user (vd guest xem trang admin) → có leak permission không?
- `browser_console_messages` + `browser_network_requests` cuối phiên → có warning/error lạ không?

### Bước 6 — Verdict + report
```
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAIL>

**Nguồn requirement:** <URL ticket đã fetch>

**AC1 (<mô tả>):** PASS  — <evidence 1 dòng>
**AC2 (<mô tả>):** FAIL  — <quan sát sai lệch>
**Adjacent:** PASS — <note>
**Verdict:** PASS (nếu tất cả AC chính PASS) / FAIL (nếu ≥1 AC chính FAIL)
```
Ghi `FINDINGS.md` theo format chuẩn (`report/REPORT-TEMPLATE.md`). Nếu FAIL → mở bug Plane (section 4).

### Lưu ý quan trọng
- **Không tự ý hiểu rộng hơn AC**: user hỏi retest #X thì chỉ test scope #X. Nếu thấy bug ở khu khác → ghi riêng "Bug phát hiện ngoài scope #X" (vẫn báo, nhưng KHÔNG tính vào verdict #X).
- **Không skip AC vì "hiển nhiên đúng"**: PHẢI chạy qua UI, đừng đoán.
- **Reproduce bug gốc TRƯỚC**: nếu ticket là bug → chạy đúng repro steps trước để xác nhận fix, rồi mới test AC mới.

## 🌱 Test data — khi đang test mà THIẾU data: hỏi user HOẶC tự tạo theo business flow

**Khi nào thiếu data (hay gặp):**
- Test filter `Status=Pending` nhưng hệ thống có **0 record Pending**.
- Test edit/delete nhưng **không có record** để sửa/xoá.
- Test role-specific flow nhưng **không có account role đó**.
- Test boundary nhưng data thực **không chạm biên** (vd cần đơn 1 tỷ đồng để test hiển thị, nhưng DB chỉ có đơn nhỏ).

→ AI **KHÔNG dừng** báo "thiếu data không test được". Áp dụng 1 trong 2 option dưới (ưu tiên tự tạo).

### Option 1 — Hỏi user (chỉ khi KHÔNG tự tạo được)
Hỏi khi rơi vào 1 trong các case:
- Cần **data thật production-like** không fake được: payment đã `completed`, integration state thật (WhatsApp đã connect), data lịch sử cũ.
- Setup **phá hủy / nặng**: reset DB, bulk import, migrate.
- **Ambiguous**: không rõ data test nên thế nào (vd "test với event lớn" — lớn = bao nhiêu row?).
- Cần **account role đặc biệt** không tự đăng ký được (admin/super-admin/tenant khác).

**Cách hỏi (1 câu, có gợi ý sẵn — đừng hỏi mở):**
> *"Filter Pending trả 0 — hệ thống chưa có event Pending. Tôi (a) tự tạo 1 event Pending test rồi cleanup, hay (b) bạn cho ID event Pending có sẵn?"*

### Option 2 — Tự tạo data theo business flow (MẶC ĐỊNH, ưu tiên)
Khi data cần thiết tạo được qua chính UI/API của app:

**Bước 1 — Map dependency chain** (để có X cần gì?):
```
"event Pending để test filter"
   ← tạo event mới (form create-event / POST /api/events)
      ← cần: loại event, tên, time (đều tự fill được)
   ← rồi đổi status = Pending (nếu create mặc định không phải Pending)
```
Một số case chuỗi dài: *"đơn để test delete" ← order ← customer (phải có trước) ← form create-customer*. AI tự đi theo flow nghiệp vụ để dựng đủ chuỗi.

**Bước 2 — Tạo (chọn cách nhanh nhất):**
- **Qua API (nhanh, ưu tiên nếu chỉ cần data)**: `browser_evaluate(() => fetch('/api/events', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({...})}).then(r=>r.json()))` — bỏ qua UI, tạo thẳng.
- **Qua UI (khi cần verify cả flow tạo)**: `browser_navigate` create-page → `browser_fill_form` → `browser_click` submit → `browser_network_requests` verify `POST 201` + nhận ID.

**Bước 3 — Set state đúng**: tạo xong nếu state chưa đúng (vd cần Pending mà create ra Draft) → PATCH/đổi state qua API hoặc click đổi trạng thái ở UI.

**Bước 4 — Capture ID + cleanup LUÔN**:
```js
// Dùng withRevert (lib/ui.mjs) — tạo đầu, xoá cuối, kể cả khi probe throw
import { withRevert } from '/Users/<user>/.claude/skills/qa-run/lib/ui.mjs';
const result = await withRevert(
  async () => {
    const created = await page.evaluate(postEvent, payload);   // tạo
    const id = created.id;
    // ... probe chính dùng id ...
    return verdict;
  },
  async () => { /* cleanup: DELETE /api/events/<id> cho mọi id đã tạo */ },
);
```
Track **mọi ID tạo ra** (`createdIds = []`) → xoá hết cuối session, kể cả khi probe fail giữa chừng.

### Quy tắc khi tự tạo data
- **Idempotent / unique**: tên/timestamp unique tránh conflict (vd `"QA-test-<timestamp>"`) → chạy lại không vỡ.
- **Cleanup BẮT BUỘC**: `withRevert()` hoặc teardown explicit — KHÔNG để data rác.
- **KHÔNG side-effect thật**: không gửi mail/WhatsApp/SMS thật, không trigger webhook production, không tạo payment thật (dùng sandbox/mock). Nếu flow tạo data bắt buộc gửi mail → báo user trước khi tạo.
- **Volume vừa phải**: 1-3 record đủ test, đừng tạo 1000 (chậm + rác + chạm rate-limit).
- **Role đúng**: tạo data dưới đúng account/role cần test (login role đó trước, hoặc API với token role đó).

### Helper tuỳ chọn: `seed.mjs` (per project, khi hay cần cùng data)
Nếu project hay cần lại cùng loại data → viết `<project>/qa/seed.mjs`:
```js
// seed.mjs — hàm tạo data test + trả cleanup fn
export async function seedPendingEvent(page) {
  const created = await page.evaluate(p => fetch('/api/events', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p)}).then(r=>r.json()), {name:'QA-test', status:'pending'});
  return { id: created.id, cleanup: async () => page.evaluate(i => fetch(`/api/events/${i}`, {method:'DELETE', credentials:'include'}), created.id) };
}
// Dùng trong probe: const {id, cleanup} = await seedPendingEvent(page); ... try{} finally{ await cleanup(); }
```

### Tích hợp vào flow chính
- **Sanity retest Bước 4** (Setup điều kiện): nếu AC cần data cụ thể (vd "event Pending") mà hệ thống thiếu → Option 2 tự tạo trước khi verify AC.
- **Đào sâu** (Section 2): trước khi probe, check có data test chưa; thiếu → tự tạo theo business flow.
- **Boundary testing** (§6): cần data chạm biên → tự tạo record với giá trị biên (số rất lớn, ngày tương lai xa).
- **CRUD testing** (§8): Cần record để R/U/D → tự Create trước (phần C của CRUD chính là setup).

## 🧰 Token-frugal (BẮT BUỘC giữ khi viết script)
- `lib/driver.mjs`: headless, **screenshot ra file (không trả bytes ảnh vào context)**; `snap()` chỉ in phần tử tương tác + text chính + console/HTTP≥400.
- Khi viết probe script: dùng `browser/snap/printSnap/shot` (driver) + `recordNet/waitForText/waitForStable/clickText/withRevert` (`lib/ui.mjs`) + `check/eq/summary` (`lib/assert.mjs`).
- Cắt response body `.slice(0,200)`; in gọn — KHÔNG dump full DOM.
- **Quy tắc vàng**: 1 probe = 1 câu hỏi. Đặt tên `probe-<ticket>-<aspect>.mjs`.

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

> Nếu project cần auth.json để script npm Playwright chạy được (regression/batch): `node ~/.claude/skills/qa-run/scripts/login.mjs` → tạo `auth.json` + `evidence/` ở đây.

### 1. Khám phá rộng (mặc định: **HIỂU trước → LÁI sau**)
**Bước 1 — Hiểu ngữ cảnh (theo Nguyên tắc #1):**
- Đọc ticket/spec nếu user cung cấp (Plane/Jira, file `.md`, link). Nếu không có → tự suy luận từ URL + label + DOM.
- Trích xuất bản đồ logic: happy path, role, ràng buộc input, side-effect, edge case đáng ngờ, integration bên thứ 3.
- Form charter 1 dòng: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*

**Bước 2 — Lái UI tương tác qua MCP Playwright (Nguyên tắc #2):**
- `browser_navigate(BASE)` → `browser_snapshot` xem headings/buttons/links/toasts/errors
- Đi theo **happy path** đã map ở Bước 1 → snapshot từng bước → đối chiếu với spec/AC
- Tại mỗi bước, **sai lệch có chủ đích** 1 input invalid / 1 boundary → xem validation/error/rollback
- Note lỗi console/HTTP lộ ra (`browser_console_messages`, `browser_network_requests`)
- Probe nhanh API qua `browser_evaluate(() => fetch('/api/...', {credentials:'include'}).then(r => r.json()))` để verify state phía server

**Nếu cần quét HÀNG LOẠT (risk-based / sanity), dùng script:**
```bash
node ~/.claude/skills/qa-run/scripts/sweep.mjs            # tự dò link nav (hoặc QA_ROUTES), bắt HTTP≥400 + console error
node ~/.claude/skills/qa-run/scripts/api-health.mjs       # probe endpoint (từ endpoints.txt / QA_ENDPOINTS) tìm 4xx/5xx
node ~/.claude/skills/qa-run/scripts/explore.mjs /trang  shot-name   # snapshot 1 trang (khi muốn screenshot ra file)
```

### 2. Đào sâu 1 nghi vấn

**Trước khi đào: re-load lại bản đồ logic** (Nguyên tắc #1 Bước B) cho khu vực nghi vấn — xác định state nào đang test, edge nào đáng nghi, side-effect nào phải verify.

**Cách 1 (ưu tiên, nhanh & "thông minh") — dùng MCP Playwright tương tác:**
- Đặt giả thuyết từ bản đồ logic (không đoán mù) → `browser_click` / `browser_type` / `browser_evaluate` để verify
- `browser_snapshot` đọc lại DOM (tránh đoán) — đối chiếu với state expected trong bản đồ
- `browser_network_requests` xem response body / status — verify side-effect (DB persist, message queue, webhook)
- `browser_wait_for` text xuất hiện hoặc đổi (không sleep cứng)
- Khi verdict rõ → `browser_take_screenshot` chỉ bước kết luận → ghi `FINDINGS.md` theo format chuẩn

**Cách 2 (cần lặp / CI) — viết script ngắn:**
```js
// MyProject/qa/probe-x.mjs  — chỉ viết khi cần CHẠY LẶP (risk-based / sanity / regression)
import { browser, snap, printSnap, shot, BASE } from '/Users/<user>/.claude/skills/qa-run/lib/driver.mjs';
import { recordNet, waitForStable, withRevert } from '/Users/<user>/.claude/skills/qa-run/lib/ui.mjs';
import { eq, check, summary } from '/Users/<user>/.claude/skills/qa-run/lib/assert.mjs';
const { b, page } = await browser();
const net = recordNet(page, /api\/v1/i, { withBody:true });  // bắt network để verify ĐÚNG
await page.goto(BASE + '/path');
const total = await waitForStable(() => page.evaluate(readTotal)); // chờ DATA load
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

**Mục tiêu của bạn:** mở ticket trên Plane → scroll description → **thấy ảnh preview ngay**, KHÔNG cần bấm tải file về. Đây là điểm khác biệt với upload file đính kèm thông thường.

**Cách làm (đã verify với Plane self-hosted qua API key):**
1. Upload ảnh lên Plane qua endpoint `issues/{id}/issue-attachments/` (S3 presigned) → trả về asset URL.
2. Trong `description_html`, embed URL đó bằng `<img src="<plane-asset-url>">`.
3. Khi render, Plane sẽ:
   - Hiển thị ảnh **inline trong description** (preview luôn, không cần tải).
   - Đồng thời liệt kê trong mục **Attachments** (nếu user cần tải raw thì vẫn được).
> ⚠️ **KHÔNG dùng base64 data URI** trong description — Plane self-hosted qua API key sẽ **strip ảnh khi render** (sanitize HTML). Phải dùng URL asset sau khi upload.

#### Workflow đơn giản — AI lo hết, user chỉ nói 1 câu
Bạn KHÔNG cần điền JSON. Cứ nói kiểu:
> *"Log bug: filter Status Pending không hoạt động. Screenshot ở evidence/probe-430.png."*

AI sẽ tự:
1. Build `description_html` theo format chuẩn (`report/REPORT-TEMPLATE.md`):
   - `<strong>Steps</strong>` + numbered list
   - `<strong>Expected</strong>` + 1 câu
   - `<strong>Actual</strong>` + bullet list (xuống dòng từng ý — quy tắc #1)
   - `<strong>Evidence</strong>` + `<img src="...">` cho MỖI ảnh
2. Upload từng ảnh → lấy asset URL → nhúng vào `<img>` ngay trong description_html.
3. POST `workspaces/{slug}/projects/{pid}/work-items/` với đầy đủ field (name, description_html, state, assignees, priority).
4. Trả về URL ticket + sequence ID để bạn mở xem.

#### Script wrapper (đặt trong instance dự án, KHÔNG ở skill global)
```bash
# Tự động build JSON + upload ảnh + log bug. Khôi cần điền template.
# Đặt ở: <project>/qa/log-bug.mjs
node <project>/qa/log-bug.mjs --title "[W26][Filter] Status Pending không hoạt động" \
  --module "Filter" --severity "High" --screenshots "evidence/probe-430.png,evidence/probe-430b.png" \
  --steps "1. Mở /events\n2. Chọn Status=Pending" \
  --expected "Total = 6" \
  --actual "Total = 0 (rỗng)\nKhông có row nào hiển thị" \
  --assign "hungtn,phongtq" --state "Todo"
```
→ Trả về: `Created MT-427: https://projects.metasolutions.ai/...`

#### Cấu hình 1 lần cho mỗi dự án (file `.env` của project, không push lên git)
```
PLANE_API_KEY=plane_pat_xxx
PLANE_BASE_URL=https://projects.metasolutions.ai/api/v1
PLANE_WORKSPACE=mds-team
PLANE_PROJECT_ID=<uuid>             # Spout, OneBrain, ...
PLANE_STATE_TODO=<uuid>
PLANE_STATE_TBP=<uuid>              # nếu cần
PLANE_ASSIGN_HUNG=<uuid>
PLANE_ASSIGN_PHONG=<uuid>
```

#### Lưu ý quan trọng
- **Title format**: `[W{số tuần ISO}][Module] triệu chứng tiếng Việt có dấu` — vd `[W26][Filter] Status Pending không lọc`. W tính theo tuần ISO của ngày log (W26 = tuần chứa 2026-06-29).
- **Mô tả KHÔNG có icon/emoji**, **KHÔNG có dấu chấm cuối câu** — theo chuẩn team Plane (xem `~/.claude/projects/.../memory/plane-comment-style.md`).
- **Actual & Steps xuống dòng từng ý** (bullet/numbered) — quy tắc #1, không viết liền 1 đoạn.
- **Mọi bug BẮT BUỘC có ảnh evidence inline trong description** — nếu AI quên sẽ bị user nhắc (vì preview trong description là yêu cầu cứng).
- **Ảnh > 5MB**: nén trước (PNG → JPG q=80, hoặc crop vùng cần) để tránh upload chậm.

#### Workflow state sau retest (PHÂN BIỆT RÕ — dùng AI tự quyết định)

| Tình huống | Hành động | State đích |
|---|---|---|
| Retest **PASS** (fix đúng AC) | Update ticket hiện tại → **Done** | `Done` |
| Retest **FAIL** (fix chưa đúng, dev cần tiếp tục làm) | Update ticket hiện tại → **In Progress** + assign lại dev (vd `hungtn,phongtq`) + comment lý do fail | `In Progress` |
| Phát hiện **bug MỚI** ngoài scope (không liên quan ticket đang retest) | Tạo **ticket mới** (state **Todo**, có repro steps, có ảnh inline) | `Todo` (ticket mới) |
| Cần dev xem thêm (PASS nhưng có nghi vấn nhỏ) | Comment hỏi, KHÔNG đổi state | giữ nguyên |

> ⚠️ **Lý do phân biệt:**
> - **Retest FAIL ≠ bug mới**: ticket đã từng ở flow (Backlog → Todo → In Progress → Ready to Test → Testing → ...), giờ chỉ "lùi 1 bước" về In Progress cho dev tiếp tục — KHÔNG kéo về Todo (mất context, sequence_id lẫn lộn với bug mới).
> - **Bug MỚI = ticket mới**: chưa qua flow nào, đặt ở Todo để team triage.

Khi dùng `log-bug.mjs`, truyền `--state` cho đúng case:
- Retest FAIL: gọi script với `--state "In Progress" --assign hungtn,phongtq` (patch ticket cũ, dùng `--issue-id <uuid>` nếu script hỗ trợ, hoặc gọi API patch trực tiếp).
- Bug mới: gọi script với `--state Todo --assign hungtn,phongtq` (tạo ticket mới).

#### Các lệnh khác (ít dùng hơn)
- **PDF report**: viết `report.md` → `bash ~/.claude/skills/qa-run/report/export-pdf.sh report.md` (css sẵn). Đẩy Drive: `report/upload-to-drive.py` hoặc Google Drive MCP (`mcp__google-drive__uploadFile`).
- **Không log bug** (chỉ note local) → ghi `FINDINGS.md` trong thư mục dự án, không cần mở Plane ticket.

## Setup engine (1 lần cho cả máy — chỉ cần nếu dùng script npm)
Skill cần playwright. Cài 1 lần trong skill:
```bash
cd ~/.claude/skills/qa-run && npm install
# browser binary dùng chung cache; nếu thiếu: npx playwright install chromium
```
> **Nếu CHỈ dùng MCP Playwright (khuyến nghị cho exploratory/ad-hoc)** → KHÔNG cần cài npm playwright. MCP Playwright đã có sẵn.

## 🔁 Fallback: dùng Google Antigravity nếu KHÔNG còn Claude Code + Playwright

Nếu Claude Code hết quyền dùng, hoặc MCP Playwright bị gỡ/vỡ → **skill vẫn chạy được trên Antigravity** (agentic platform của Google: CLI + IDE + Gemini-in-Chrome). Phần lớn asset của skill là **portable** — chỉ đổi "bộ não lái UI".

### C gì GIỮ NGUYÊN (chạy ở bất kỳ env có Node ≥ 18)
| Asset | Lý do portable |
|---|---|
| `lib/driver.mjs`, `lib/ui.mjs`, `lib/assert.mjs` | Pure Node + playwright npm — chạy ở Antigravity terminal y hệt |
| `scripts/sweep.mjs`, `api-health.mjs`, `explore.mjs`, `login.mjs` | Pure Node, gọi `node <script>` từ Antigravity CLI/IDE terminal |
| `scripts/log-bug.mjs` | Pure `fetch` HTTP → Plane API, zero deps — chạy ở Antigravity luôn |
| `report/export-pdf.sh`, `report/upload-to-drive.py` | Bash/Python stdlib — chạy được nếu máy có `pandoc`/`python3` |
| **Nguyên tắc #1** (hiểu ngữ cảnh trước khi lái), 5 kỹ thuật testing, workflow retest/sanity | Là **methodology**, độc lập tool — áp dụng như nhau |
| `.env`, `auth.json`, `evidence/` | Nằm trong thư mục dự án, KHÔNG phụ thuộc Claude Code |

### C gì ĐỔI (chỉ "bộ não lái UI")
| Việc | Claude Code (mặc định) | Antigravity (fallback) |
|---|---|---|
| Lái UI tương tác (click/type/snapshot) | `mcp__playwright__browser_*` | **Gemini-in-Chrome** (Antigravity điều khiển Chrome tự chủ) hoặc Antigravity SDK browser tool |
| Fetch ticket từ URL | `WebFetch` | Antigravity web tool / `curl` trong terminal |
| Agent reasoning | Claude (model này) | Gemini 3 (Antigravity default) |
| Chạy probe script | `node scripts/x.mjs` qua Bash tool | `node scripts/x.mjs` qua **Antigravity CLI/IDE terminal** (giống nhau) |

### Workflow trên Antigravity
1. Mở Antigravity IDE → mở thư mục dự án (vd `MyProject/qa/`).
2. Yêu cầu agent (Gemini): *"Đọc ticket <URL> → hiểu AC → lái Chrome kiểm <feature> → log bug nếu thấy lỗi."*
3. Agent dùng **Gemini-in-Chrome** để navigate/click/snapshot/probe API (thay MCP Playwright).
4. Khi cần batch/regression → agent chạy `node ~/.claude/skills/qa-run/scripts/sweep.mjs` từ terminal (script portable).
5. Khi log bug → agent chạy `node log-bug.mjs ...` (script portable, chỉ cần `.env` có PLANE_*).
6. Verdict + report theo cùng format (`report/REPORT-TEMPLATE.md`).

### Lệnh CLI tương đương (Antigravity CLI)
```bash
# Antigravity CLI invoke agent (tương đương chạy Claude Code)
agi run "Retest ticket https://projects.metasolutions.ai/.../issues/427/ — verify AC, FAIL→In Progress, PASS→Done" \
  --cwd /path/to/MyProject/qa
```
> Tên lệnh CLI có thể đổi theo phiên bản Antigravity — kiểm `agi --help` hoặc doc hiện tại ở `https://antigravity.google`. Logic skill KHÔNG đổi.

### Lưu ý khi fallback
- **auth.json phải có**: Antigravity chạy npm Playwright script cần `auth.json` (login trước bằng `node scripts/login.mjs`). Antigravity IDE có Chrome riêng — session Gemini-in-Chrome KHÔNG tự share với playwright headless → phải login lại bằng `login.mjs`.
- **Prompt khác model**: Gemini 3 hiểu workflow này nếu prompt rõ (đưa SKILL.md + TESTING-TECHNIQUES.md vào context agent). Khuyến nghị: paste nội dung SKILL.md vào system prompt hoặc `AGENTS.md` của Antigravity.
- **Test nhỏ trước**: chạy `node scripts/api-health.mjs` trên Antigravity terminal để xác nhận Node + playwright + `.env` OK trước khi test lớn.
- **Nếu Antigravity cũng không có**: skill vẫn dùng được với BẤT KỲ agent nào có browser tool (vd Cursor, Cline, Aider + playwright-mcp) — vì engine là Node thuần, methodology độc lập tool.

## Regression (deterministic)
Bộ TC cố định, chạy lặp tất định, đặt ở instance dự án (vd `MyProject/qa/regression/`) — KHÁC exploratory, không để ở engine global. Cấu trúc data-driven (`cases.mjs` + `run.mjs`), idempotent (`withRevert`), verdict CI (`process.exit(summary()?0:1)`): xem **`TESTING-TECHNIQUES.md` §5**.

---

# Appendix A — Merge từ `anhtester/codex-testing-kit`

> Nguồn tham khảo: 26 skill + 6 rule của repo `anhtester/codex-testing-kit` (Anh Tester, MIT). Mượn concept, viết lại native cho Claude Code + MCP Playwright. License gốc giữ nguyên.

## A.1 Test Data Generator (từ `$generate-test-data`)

### Vấn đề giải quyết
Probe cần data mới mỗi lần chạy (vd email đăng ký, tên sản phẩm, mã đơn) — nếu tự gõ tay dễ đụng khi chạy parallel hoặc re-run. Code cần **data unique + traceable** để biết probe nào tạo.

### Format chuẩn (bắt buộc bám)
```
[prefix]_[testName]_[timestamp]_[random]
```
- `prefix` — viết tắt feature/module (vd `ing`, `wf`, `qlt`, `dash`)
- `testName` — tên probe (input vd `createCustomer`, `loginValid`; function tự lowercase thành `createcustomer`, `loginvalid`)
- `timestamp` — `YYYYMMDDHHMMSS` (giờ VN) hoặc epoch ms
- `random` — 4 ký tự `[A-Z0-9]` để chống collision khi chạy cùng giây

**Ví dụ:**
- `ing_createcustomer_20260702143641_6583` (lowercase, không dấu `_` trong timestamp)
- `wf_invalidtarget_20260702143705_7B59`
- `qlt_emptyrange_20260702143720_A1B2`

> **Lưu ý format thật**: function `tdata()` trong `lib/tdata.mjs` tự chuẩn hoá — lowercase cả `prefix` lẫn `testName`, dùng 14 số `YYYYMMDDHHMMSS` không phân cách, random 4 hex. Input `createUser` → output `createuser`. Xem file helper để biết chi tiết.

### Helper dùng ngay trong probe Node
```js
// Trong script .mjs
import { randomBytes } from 'node:crypto';

export function tdata(prefix, testName) {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // 20260702141522
  const rnd = randomBytes(2).toString('hex').toUpperCase();                  // A3F2
  return `${prefix}_${testName}_${ts}_${rnd}`;
}

// Dùng:
const email = `${tdata('ing', 'createUser')}@test.local`;        // vd: ing_createuser_20260702143641_6583@test.local
const productName = `Product ${tdata('wf', 'newProduct')}`;       // Product wf_newProduct_...
```

### Helper dùng trong MCP Playwright probe (browser context)
```js
// browser_evaluate — function body
() => {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return { ts, rnd, tdata: (p, n) => `${p}_${n}_${ts}_${rnd}` };
}
```

### Trace — ghi vào FINDINGS / ticket Plane
Mỗi data tạo → ghi `Trace:` ở header bằng chứng, vd:
```
Trace: tdata('ing', 'createCustomer') → ing_createcustomer_20260702143641_6583
→ DB row id: 8821
→ API response: {id: "8821", name: "ing_createcustomer_20260702143641_6583", ...}
```
→ Lỗi lên ticket → dev grep `ing_createcustomer` trong DB/ log biết ngay probe nào tạo.

### Cleanup — `withRevert` phải xoá theo trace
```js
// Khi rollback, dùng cùng prefix để xoá
const items = await db.query(`SELECT id FROM customers WHERE name LIKE 'ing_createcustomer_%'`);
await db.tx(t => t.customers.whereIn(items.map(i => i.id)).delete());
```
Xem **`TESTING-TECHNIQUES.md` §3 (withRevert)** để biết pattern cleanup chuẩn.

## A.2 Flaky Detector (từ `$analyze-flaky-tests` / `$flaky-test-analyzer`)

### Vấn đề giải quyết
Probe chạy 3 lần mà pass/fail không nhất quán → bug "ảo" → mất thời gian điều tra nhầm.

### Quy tắc 3 lần
**Trước khi log bug lên Plane** từ probe, hỏi:
1. Đã chạy lại **≥ 3 lần** chưa? (không tính lần đầu phát hiện)
2. Có ≥ 2/3 lần fail ở cùng điều kiện không?
3. Fail ở cùng step? Cùng error message?

→ **Có** → log bug bình thường (Real bug).
→ **Không** (1/3 hoặc 2/3 lỗi lung tung) → **FLAKY** → quarantine, KHÔNG log bug.

### Pattern chạy lại 3 lần (Node script)
```js
// scripts/probe-flaky.mjs — template
import { browser, snap, shot } from '../lib/driver.mjs';

const RUNS = 3;
const results = [];
for (let i = 1; i <= RUNS; i++) {
  const { b, page } = await browser();
  await page.goto(BASE + '/<path>');
  // ... thao tác + verify ...
  const verdict = await page.evaluate(() => /* check pass/fail */);
  results.push({ run: i, verdict });
  await b.close();
}

const failCount = results.filter(r => !r.verdict).length;
if (failCount === 0) console.log('✓ PASS 3/3 — stable');
else if (failCount === RUNS) console.log('✗ FAIL 3/3 — REAL bug, log Plane');
else console.log(`⚠ FLAKY — ${failCount}/${RUNS} fail, quarantine`);
```

### Ghi nhận flaky trong FINDINGS
Bug flaky KHÔNG lên Plane ngay. Ghi trong `FINDINGS.md` section **"⚠ Flaky (quarantine)"**:
```markdown
## ⚠ Flaky (chưa log Plane)

### F1. Login bị timeout khi mạng chậm — 2/3 lần
- **Probe**: `node scripts/login.mjs`
- **Trace**: chạy 2026-07-02 14:30, 14:32, 14:35
- **Kết quả**: 14:30 ✓, 14:32 ✗ (timeout 5s), 14:35 ✓
- **Nghi vấn**: race condition khi session storage ghi đồng thời
- **Action**: KHÔNG log bug, chờ dev reproduce → nếu không tái hiện được → đóng

### F2. Search trả 0 results khi keyword có dấu — 1/3 lần
- ...
```

### Khi nào promote flaky → real bug
- Chạy lại sau khi app restart/scale → còn fail 3/3 → promote.
- Có thêm user report match pattern → promote.
- Dev confirm reproduce được → promote.

### Khi nào close flaky
- 5 lần chạy liên tiếp pass hết → close.
- App refactor đoạn nghi vấn → close (re-verify).
---

## API Key (chung cho cả 3 skill)

Skill này dùng API key từ `../config/api_keys.json` (chung trong repo `qa-skill`). 

**3 cách config** (ưu tiên từ cao xuống thấp):
1. **Env var** (override): `ANTHROPIC_API_KEY=sk-ant-...`
2. **Config file**: `cp config/api_keys.example.json config/api_keys.json` rồi paste key
3. **Auto-detect**: Nếu dùng Copilot Pro / Antigravity / Claude Code CLI → KHÔNG cần key

Chi tiết xem [README.md](../README.md) và `scripts/ai_provider.py`.
