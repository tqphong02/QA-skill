# 🧪 Kỹ thuật testing với Playwright + Claude Code (qa-run)

> Áp dụng **đủ 12 kỹ thuật** bên dưới — mà vẫn **token-frugal**, **kết quả đúng**, **clean code**.
> Engine: `lib/driver.mjs` (browser/snap/shot) + `lib/ui.mjs` (recordNet/waitForText/clickText/withRevert) + `lib/assert.mjs` (check/eq/summary). Scripts: `sweep/api-health/explore/ux-health/compat/log-bug`.

## 🗺️ Coverage matrix — 12 kỹ thuật (audit đầy đủ)

| # | Kỹ thuật | Mục đích | Tool / section |
|---|---|---|---|
| 1 | **Exploratory** | Tìm hiểu + test cùng lúc, săn lỗi chưa biết | §2 charter + tours; Nguyên tắc #1 |
| 2 | **Error Guessing** | Đoán chỗ dễ vỡ theo kinh nghiệm | §2b + payload list §6 |
| 3 | **Ad-hoc** | Test tự do, tìm bug nhanh | §1; `explore.mjs` |
| 4 | **Monkey** | Thao tác ngẫu nhiên, kiểm độ ổn định | §7 |
| 5 | **CRUD** | Create/Read/Update/Delete + nhất quán | §8 |
| 6 | **Happy Path & Negative** | Đúng quy trình / sai-le-data | §9 |
| 7 | **Boundary & Validation** | Min/max/rỗng/dài/đặc biệt/Unicode/emoji | §6 payload list |
| 8 | **Workflow** | Test theo luồng nghiệp vụ end-to-end | §10 |
| 9 | **UI/UX** | Hiển thị, responsive, chính tả, căn lề, màu, tooltip, loading, a11y | SKILL.md §🎨 + `ux-health.mjs` |
| 10 | **Compatibility** | Chrome/Edge/Firefox/Safari + mobile/tablet | §11; `compat.mjs` |
| 11 | **Session-based** | Timebox 30-90' + log tested/bugs/next | §12 |
| 12 | **API Inspection** | Request/response, status, payload | §13; `api-health.mjs` + `browser_network_requests` |

> Cách chọn: xem **luồng hợp nhất** ở SKILL.md section "Chọn kỹ thuật" + §14 dưới đây.

---

## 0. Nguyên tắc xuyên suốt (giữ cho mọi kỹ thuật)

**Token-frugal**
- Headless, screenshot RA FILE (`shot()` — không nhồi bytes ảnh vào context). Chỉ đọc ảnh khi cần kết luận PASS/FAIL.
- Log gọn: `printSnap()` / cắt body `.slice(0,200)`. In **verdict**, không in cả DOM.
- 1 probe = 1 câu hỏi. Đặt tên `probe-<ticket>-<aspect>.mjs`.

**Kết quả ĐÚNG (không đoán)**
- Verify bằng **state thật**: đọc lại DOM/`input.value`, đọc **response network** (`recordNet`), so số liệu trước→sau.
- Wait **tất định** thay vì `waitForTimeout` cứng:
  - `waitForText` — chờ 1 text/regex xuất hiện.
  - `waitForStable(readFn)` — chờ **DATA load xong** (giá trị ổn định), tránh đọc sớm. ⚠️ Bẫy hay gặp: label "Total events" render TRƯỚC khi con số về → đọc nhầm `0`. Luôn `waitForStable` cho số liệu/bảng/list trước khi assert.
- Verdict tường minh qua `assert.mjs` (`check/eq/ge` → `summary`), không tự diễn giải mơ hồ.
- Probe nên `process.exit(summary()?0:1)` → exit-code dùng được cho CI/script gọi.

**Clean code**
- Tái dùng helper (driver/ui/assert), KHÔNG copy-paste log/wait.
- Thao tác GHI dữ liệu thật → bọc `withRevert()` (luôn trả lại trạng thái cũ).
- Không để side-effect (không gửi mail/WhatsApp thật; tạo data thì xoá).

---

## 1. Ad-hoc testing — "thử nhanh 1 phát"
**Khi nào:** câu hỏi đơn lẻ, không cần kế hoạch ("trang này còn load không?", "nút này bấm ra gì?").
**Cách làm:** 1 lệnh, không dựng probe.
```bash
node ~/.claude/skills/qa-run/scripts/explore.mjs /master-calendar cal-now
```
**Clean rule:** đừng over-build. Nếu phát sinh >1 câu hỏi → nâng lên exploratory.

---

## 2. Exploratory testing — "khám phá có chủ đích (charter + tours)"
**Khi nào:** khu vực mới / chưa rõ, săn lỗi chưa biết.
**Charter:** 1 dòng mục tiêu — *"Khám phá <feature> tìm lỗi về <rủi ro>; account <x>; ~N phút."*
**Tours (đi theo nhiều góc, mỗi tour 1 lăng kính):**
- *Feature tour* — chạm hết control chính (sweep nav).
- *Data tour* — biên/sai dữ liệu (rỗng, dài, ký tự lạ, số âm/lớn).
- *Error-guessing* — đoán chỗ dễ vỡ (double-click, back/refresh giữa chừng, đổi tab rồi quay lại, mạng chậm).
- *CRUD tour* — tạo→đọc→sửa→xoá, kiểm tính nhất quán.
```bash
node ~/.claude/skills/qa-run/scripts/sweep.mjs        # feature tour: bắt HTTP≥400 + console error toàn site
node ~/.claude/skills/qa-run/scripts/api-health.mjs   # tour API: 4xx/5xx
# nghi vấn nào → 1 probe sâu (driver + ui + assert)
```
**Ghi nhận LIVE → `FINDINGS.md`:** Quan sát → Expected → Evidence:<png> → Severity. Gom theo root-cause.
**Clean rule:** mỗi nghi vấn 1 probe riêng; tái dùng `recordNet/waitForText`.

---

## 3. Risk-based testing — "test cái rủi ro cao trước, sâu hơn"
**Khi nào:** thời gian giới hạn → ưu tiên theo **Risk = Impact × Likelihood**.
**Impact cao:** auth/phân quyền, thanh toán/subscription, ghi/đổi dữ liệu, mất dữ liệu, luồng tiền.
**Likelihood cao:** code vừa đổi, tích hợp bên thứ 3 (WhatsApp/Cognito), khu nhiều bug cũ.
**Cách làm:**
1. Liệt kê target → chấm risk (H/M/L).
2. **H** = sâu (nhiều ca + biên + verify network). **L** = chạm 1 happy path.
3. Bug ghi-dữ-liệu (vd #135 add-on) là H → bắt buộc đọc **response network**, không tin mỗi toast.
```js
const net = recordNet(page, /subscription|addon/i, { withBody:true });
// ... thao tác ...
check('Backend thực sự persist', net.some(c => c.status===200 && !/"updated_addons":\[\]/.test(c.body)),
      JSON.stringify(net.at(-1)));
```
**Clean rule:** khai báo risk ngay đầu probe (comment) để người sau biết vì sao test sâu/nông.

---

## 4. Sanity testing — "fix này chạy chưa + cái sát bên có vỡ không"
**Khi nào:** sau khi dev báo fix (ticket "Ready to Test") — kiểm **nông & nhanh**, không full regression.
**Phạm vi:**
- Đúng **acceptance criteria** của ticket (đọc kỹ — vd #430 yêu cầu *combine nhiều filter AND* → phải test, đừng chỉ 1 filter).
- Chức năng **kề bên** không vỡ (đổi tab, nút liên quan, điều hướng quanh đó).
**Verdict pattern:**
```js
import { eq, check, summary } from '<skill>/lib/assert.mjs';
eq('Filter Status=Pending', totalAfter, 6);
check('Combine AND <= single filter', combined <= single, `${combined}<=${single}`);
check('Clear khôi phục baseline', afterClear === baseline);
summary('#430');   // -> PASS/FAIL rõ ràng
```
**Clean rule:** reload trang giữa các ca để tránh state bẩn; mỗi assertion 1 dòng `check/eq`.

---

## 5. Regression testing — "bộ TC cố định, chạy lặp tất định, bắt lỗi tái phát"
**Khi nào:** trước release / sau loạt fix — đảm bảo cái cũ KHÔNG vỡ.
**Khác sanity:** rộng + **deterministic** + lặp y hệt mỗi lần. KHÔNG để ở engine global — đặt ở instance dự án: `MyProject/qa/regression/`.
**Cấu trúc đề xuất:**
```
MyProject/qa/regression/
├── cases.mjs        # mảng {id, route, steps(page), assert(page)} — khai báo, không lặp code
├── run.mjs          # vòng lặp: mỗi case -> chạy -> assert.mjs -> shot -> summary
└── baseline/        # ảnh/figure mong đợi (nếu so sánh)
```
**Yêu cầu bắt buộc:**
- **Idempotent**: chạy nhiều lần ra cùng kết quả. Mọi thao tác GHI bọc `withRevert()`.
- **Independent**: case không phụ thuộc thứ tự; tự setup/teardown data.
- **Verdict máy đọc được**: `summary()` trả exit-code (`process.exit(ok?0:1)`) để CI dùng.
```js
// run.mjs (rút gọn)
import { browser, shot } from '<skill>/lib/driver.mjs';
import { check, summary } from '<skill>/lib/assert.mjs';
import { cases } from './cases.mjs';
const { b, page } = await browser();
for (const c of cases) { try { await c.run(page); await c.assert(page, check); } catch(e){ check(c.id,false,e.message.split('\n')[0]); } await shot(page, 'reg-'+c.id); }
process.exit(summary('REGRESSION') ? 0 : 1);
await b.close();
```
**Clean rule:** logic test ở `cases.mjs` (data-driven), `run.mjs` chỉ là vòng lặp — không nhân bản.

---

## 6. Boundary & Validation Testing — payload list (dùng chung cho Error Guessing + CRUD + Negative)

Mỗi input field, thử **toàn bộ danh sách** này (1 cái / probe, read-back validation + error message):

| Nhóm | Giá trị test | Bắt cái gì |
|---|---|---|
| **Empty/Null** | `""`, `"   "` (whitespace), `null`, `undefined` | required validation |
| **Number biên** | `0`, `-1`, `0.5`, `9999999999`, `Number.MAX_SAFE_INTEGER+1` | overflow, âm, làm tròn |
| **String biên** | 1 ký tự, **10.000 ký tự** (very long), ký tự `null` `\0` | maxlength, DB truncate |
| **SQL injection** | `' OR 1=1--`, `"; DROP TABLE users;--`, `'; EXEC xp_cmdshell` | escape hoá (báo security!) |
| **XSS** | `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>` | output encoding (báo security!) |
| **Regex special** | `.*+?^${}()|[]\` | regex DoS / parse err |
| **Unicode** | tiếng Việt có dấu, `中文`, `العربية`, `日本語`, `₫ € ₽` | encoding UTF-8 |
| **Emoji** | `😀🎉`, ZWJ sequence `👨‍👩‍👧`, `🇻🇳` | UTF-16 surrogate pair |
| **RTL / control** | RTL text, `\n\t\r`, zero-width `​` | layout / newline injection |
| **Date** | quá khứ, tương lai xa (năm 9999), `29/2` năm không nhuận, timezone khác | date parse / tz bug |
| **Format sai** | email `a@b`, URL `htp://`, phone `abc`, IP `999.999.999.999` | format validation |
| **File upload** | sai extension, file rỗng 0 byte, file > limit, tên file ký tự lạ `../../../etc/passwd` | type/size check, path traversal |

**Tool:** `browser_fill_form` / `browser_type` → submit → `browser_evaluate` read-back value + error message + `browser_network_requests` check có gọi API không. Verdict qua `check/eq`.

---

## 7. Monkey Testing — thao tác ngẫu nhiên, kiểm độ ổn định
**Khi nào:** kiểm **độ ổn định / crash resistance** — KHÔNG cần theo AC. Sau khi đã test happy path.
**Cách làm:**
1. Lấy inventory mọi interactive element từ `browser_snapshot` (buttons, links, inputs, tabs).
2. **Click ngẫu nhiên** N phần tử (không thứ tự logic) — có thể dùng script npm playwright loop random.
3. **Input ngẫu nhiên** vào mọi field (dùng payload list §6 xen kẽ).
4. **Bấm liên tục nhanh** vào 1 nút (giống double-fire nhưng 5-10 lần).
5. Bắt: `pageerror` (crash), `CONSOLE error`, HTTP 5xx, state bị "kẹt" (UI không response), white screen.

**Phân biệt:** Monkey = **vô định** (random); Exploratory = **có chủ đích** (charter). Monkey thường đi **sau** exploratory, ở phase "cố tình phá".

**Tool nhanh (AI lái):** `browser_evaluate` lấy list selector → AI click bừa 5-10 cái + `browser_console_messages` + `browser_network_requests` check có vỡ. Hoặc viết `monkey.mjs` (loop random trong `cases`).

---

## 8. CRUD Testing — Create / Read / Update / Delete + nhất quán
Cho mỗi entity/resource (vd "user", "event", "order"):
- **C**reate: tạo mới → verify **xuất hiện ở list** + read-back network có persist (KHÔNG tin mỗi toast).
- **R**ead: mở list + chi tiết → verify data đúng, count đúng, sort đúng.
- **U**pdate: sửa field → **reload trang** → verify change còn (KHÔNG mất sau refresh).
- **D**elete: xoá → verify **biến mất khỏi list** + không leak ở chỗ khác (search vẫn ra? = bug).

**Consistency check (sau CRUD):**
- Count: tạo 1 → list +1; xoá 1 → list −1.
- Sort/filter: CRUD xong vẫn đúng.
- Cross-page: tạo ở page A → page B (list tổng) phải thấy.

**Tool:** `recordNet` bắt API persist + `waitForStable` chờ data load + `withRevert()` xoá data test sau khi xong. Verdict `eq/check`.

---

## 9. Happy Path & Negative Testing
**Happy Path** (xác nhận feature chạy được):
- Đúng flow spec, data hợp lệ, role đúng → **PHẢI PASS**.
- Mục đích: baseline — nếu happy path fail, đừng test tiếp, báo blocker.

**Negative Testing** (xác nhận feature xử lý sai tốt):
- Thiếu field required → có error message rõ, KHÔNG submit.
- Sai format → validation bắt, KHÔNG gọi API.
- Quyền sai (user thường gọi endpoint admin) → 403, KHÔNG leak data.
- Server fail (mock 500 / disconnect) → graceful error, KHÔNG crash, KHÔNG để state nửa vời.
- Conflict (edit cùng record) → conflict handling, KHÔNG ghi đè im lặng.

**Verdict pattern:**
```js
section('#9 happy + negative');
eq('Happy: tạo event thành công', created, true);
check('Negative: thiếu title → block submit', !net.some(c => c.url.includes('/events') && c.method === 'POST'),
      'submit vẫn bắn dù thiếu field!');
```

---

## 10. Workflow Testing — end-to-end theo luồng nghiệp vụ
**Khi nào:** feature nhiều bước liên tiếp (vd đăng ký → đăng nhập → tạo đơn → thanh toán → huỷ).
**Cách làm:**
1. Vẽ **state machine**: State A → (action) → State B → ... (vd `guest → registered → logged-in → has-order → paid → cancelled`).
2. Đi đúng luồng → assert state chuyển đúng ở **mỗi bước** (đừng chỉ check cuối).
3. **Branch test** (workflow negative):
   - Huỷ giữa chừng → state rollback đúng?
   - Back/forward button → có duplicate submit?
   - Refresh giữa chừng → resume hay reset?
   - Đổi tab rồi quay lại → state còn?
4. Verify **data persist** qua các bước (đơn tạo ở step 3 vẫn còn ở step 5).

**Tool:** `browser_navigate` + `browser_click` theo flow + `browser_evaluate` assert state mỗi bước + `browser_network_requests` verify API sequence đúng thứ tự.

---

## 11. Compatibility Testing — cross-browser + cross-device
**Khi nào:** trước release, hoặc khi user báo "trên Chrome OK nhưng Firefox lỗi".
**Cross-browser:** Chrome, Edge, Firefox, Safari (webkit).
**Cross-device:** mobile (iPhone, Pixel), tablet (iPad), desktop (1440).
**Tool:**
```bash
# Cài firefox/webkit 1 lần:
npx playwright install firefox webkit
# Chạy matrix engine × device:
node ~/.claude/skills/qa-run/scripts/compat.mjs /dashboard chromium,firefox,webkit iphone-12,ipad-11
```
→ In matrix (nav status / load time / errors mỗi combo) + screenshot `evidence/compat-*.png`. **So sánh screenshot bằng mắt** để bắt layout/render diff giữa browser.

**MCP Playwright limitation:** MCP chỉ chạy **chromium**. Cross-browser thật (Firefox/Safari) → phải dùng `compat.mjs` (npm playwright). Đừng claim "test cross-browser" nếu chỉ chạy chromium qua MCP.

---

## 12. Session-based Testing — timebox + log
**Khi nào:** exploratory có cấu trúc, tránh lan man.
**Quy tắc:**
- **Timebox 30-90 phút / session** (charter ghi rõ `"~60 phút"`).
- **Charter 1 dòng:** *"Khám phá <feature> tìm lỗi về <risk>; account <role>; ~60 phút."*
- **Log vào `session-log.md`** trong thư mục dự án, mỗi session 1 mục:

```markdown
## Session 2026-06-29 14:00 (60') — Charter: khám phá Filter events
**Tested:**
- Filter Status (Pending/In Progress/Done)
- Filter combine AND (Staff × Status)
- Clear-all + re-apply

**Bugs tìm được:**
- #MT-427 Status=Pending trả 0 thay vì 6 (H)
- #MT-428 Clear-all không reset page (M)

**Next (chưa kịp):**
- Filter theo date range
- Export sau filter
- Performance filter với 10k events
```

**Review cuối session** → lập charter session tiếp theo dựa trên "Next". Giúp QA không quên mảng chưa test.

---

## 13. API Inspection — DevTools/Postman style
**Khi nào:** verify logic phía server, bắt mismatch UI↔API, probe endpoint không qua UI.
**Tool (4 cách, chọn theo nhu cầu):**
1. **`browser_network_requests({filter: /api\//, static: false})`** — list mọi request đã xảy ra (sau khi tương tác UI).
2. **`browser_network_request(<index>, part: 'response-body')`** — xem full body request cụ thể (headers/body/status).
3. **`browser_evaluate(() => fetch('/api/x', {credentials:'include'}).then(r=>r.json()))`** — probe endpoint **trực tiếp** (không cần UI).
4. **`node scripts/api-health.mjs`** — quét hàng loạt endpoint từ `endpoints.txt` tìm 4xx/5xx.

**Verify:**
- **Status**: 2xx OK · 3xx redirect · 4xx client err (401/403/404/422) · 5xx server err.
- **Payload**: request body đúng shape, response data đúng, field không null bất thường.
- **Auth**: endpoint bảo vệ có check token? (probe không credentials → phải 401).
- **Consistency**: UI show 6 row nhưng API trả 13 → bug.

---

## 14. Luồng chạy HỢP NHẤT (chọn đúng kỹ thuật, tối ưu token)

```
Mục tiêu phiên test là gì?
├─ Câu hỏi lẻ, nhanh ........................ ▶ Ad-hoc (§1, explore.mjs)
├─ Khu vực mới / săn lỗi chưa biết .......... ▶ Exploratory (§2, charter + sweep + probe) → FINDINGS.md
├─ Có form / entity .......................... ▶ CRUD (§8) + Boundary payload (§6)
├─ Đúng/sai flow ............................ ▶ Happy Path & Negative (§9)
├─ Luồng nhiều bước end-to-end ............... ▶ Workflow (§10)
├─ Cố tình phá / độ ổn định .................. ▶ Monkey (§7)
├─ Cross-browser/device ...................... ▶ Compatibility (§11, compat.mjs)
├─ Đoán chỗ dễ vỡ theo kinh nghiệm ........... ▶ Error Guessing (§6 payload list)
├─ Timebox có cấu trúc ...................... ▶ Session-based (§12, session-log.md)
├─ Verify logic server ....................... ▶ API Inspection (§13)
├─ UI/UX (giật, click, layout, a11y) ......... ▶ UI/UX (SKILL §🎨, ux-health.mjs)
├─ Ít thời gian, nhiều thứ phải test ........ ▶ Risk-based (§3, chấm H/M/L)
├─ Dev báo đã fix (Ready to Test) ........... ▶ Sanity (§4, đúng AC + adjacent)
└─ Trước release / sau loạt fix ............. ▶ Regression (§5, idempotent + CI exit-code)
```
**Kết hợp thực tế (vd retest #430 filter + exploratory xung quanh):**
1. **Hiểu** (SKILL Nguyên tắc #1): đọc AC ticket → build bản đồ logic.
2. **Sanity** (§4) đúng AC #430 (vòng 1 confirmation, vòng 2 adjacent + edge).
3. **Boundary** (§6) rải payload: empty, Unicode, SQL/XSS, date biên cho filter.
4. **CRUD** (§8) nếu filter có save preset: tạo→sửa→xoá→verify.
5. **Workflow** (§10): filter → export → verify data đúng.
6. **Exploratory** (§2) xen kẽ: group-by khác, combine AND/OR, clear + re-apply.
7. **API Inspection** (§13): `browser_network_requests` verify filter gọi đúng endpoint, payload đúng.
8. **UI/UX** (🎨): `ux-health.mjs` đo latency filter + double-fire Apply button.
9. Verdict `assert.mjs`; bằng chứng `shot()`; report theo `report/REPORT-TEMPLATE.md` (Actual xuống dòng từng ý).
10. Thao tác ghi bọc `withRevert()` → không side-effect. Log bug `log-bug.mjs`.

---

## 15. Checklist "đúng & sạch" trước khi kết luận
- [ ] Verdict đến từ **state/network thật**, không từ giả định (đọc lại value / response).
- [ ] Wait tất định ở chỗ then chốt: `waitForText` cho UI, **`waitForStable` cho số liệu/list** (không đọc sớm khi data đang load); sleep cứng chỉ khi bất khả kháng.
- [ ] Mọi assertion qua `check/eq/ge` → có `summary()` PASS/FAIL.
- [ ] Thao tác GHI đã `withRevert()`; không còn data rác / không gửi ra ngoài thật.
- [ ] Screenshot đúng bước kết luận; report Actual **xuống dòng từng ý**.
- [ ] Probe tái dùng helper, không copy-paste; tên `probe-<ticket>-<aspect>.mjs`.
- [ ] **Nếu test cross-browser**: đã chạy `compat.mjs` (đừng claim "cross-browser" nếu chỉ chromium qua MCP).
- [ ] **Bug security** (SQL/XSS/path traversal ở §6): tag `[SECURITY]` + severity H, KHÔNG chỉ là "validation bug" thường.
