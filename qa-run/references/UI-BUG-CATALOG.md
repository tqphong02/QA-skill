# 🐛 UI Bug Catalog — danh mục bug UI tinh tế để săn

> Companion cho SKILL.md §🎨. Đọc khi test UI/interaction. Mỗi bug: **triệu chứng → cách phát hiện → ví dụ**. AI rải các check này khi exploratory + chạy `ux-health.mjs` cho cái auto.

## TOC
1. Action safety (spam / double-submit / race)
2. Overlap & z-index (UI che content)
3. Overflow & layout (vượt khung, truncation)
4. State & loading (stuck spinner, skeleton mãi)
5. Responsive & breakpoint
6. Form UX
7. Navigation & routing
8. Animation & motion
9. Concurrency UI (multi-tab, real-time)
10. Accessibility (sâu)

---

## 1. Action safety — spam / double-submit / race (_PRIORITY)

| Bug | Triệu chứng | Phát hiện | Ví dụ |
|---|---|---|---|
| **Spam button không debounce** | User click "Sync" 5 lần nhanh → 5 API sync (phải 1) | Click N lần nhanh (delay 50ms), đếm mutating API → phải = 1 | nút Sync/Save/Export spam → duplicate records, waste quota |
| **Submit form 2 lần** | Double-click Submit → tạo 2 record | `clickCount:2`, đếm POST → phải = 1 | tạo đơn 2 lần, charge 2 lần |
| **Submit khi đang loading** | Click Submit, trong lúc pending click lại → 2 request | Click → chờ 100ms → click lại → đếm API | optimistic UI race |
| **Toggle spam (switch)** | Bật/tắt switch 5 lần nhanh → state cuối sai | Click N lần, đọc state cuối vs mong đợi | feature flag lệch backend |
| **Optimistic update rollback race** | UI update ngay, API fail → rollback nhưng user đã click tiếp | Trigger API fail (mock 500) giữa thao tác → check state cuối | cart count lệch |
| **Idempotency key thiếu** | Retry cùng request → duplicate server-side | Cùng payload POST 2 lần → phải idempotent | tạo payment 2 lần |
| **Refresh giữa action** | Submit rồi F5 → resubmit confirm / duplicate | Submit → F5 → check có duplicate không | form resubmit dialog |

**Auto check:** `ux-health.mjs --spam "button:has-text('Sync')" /sync 5` → click 5 lần, báo số API call.

**Fix pattern frontend:** disable button trong pending + debounce + idempotency key.

---

## 2. Overlap & z-index (UI CHE content)

| Bug | Triệu chứng | Phát hiện | Ví dụ |
|---|---|---|---|
| **Modal/drawer che content** | Mở modal → che nút quan trọng bên dưới, KHÔNG đóng được | elementsFromPoint tại tọa độ nút → modal trên cùng? | modal che "Save", user kẹt |
| **Sticky header che anchor** | Click anchor `#section` → section bị header che phần đầu | Scroll to anchor, check getBoundingClientRect top < headerHeight | docs link nhảy xuống nhưng bị che |
| **Tooltip/popover che nút bấm** | Hover hiện tooltip đè lên nút cần click tiếp | Hover trigger → elementsFromPoint tại nút kế | tooltip không biến mất, che CTA |
| **Dropdown menu z-index thấp** | Menu mở nhưng bị element khác đè (hiện sau) | Mở dropdown → snapshot → menu có visible trên cùng? | select menu ẩn sau card |
| **Toast/notification che action** | Toast stack đè nút Save/Submit | Trigger toast → check vùng action có bị che | user bấm miss do toast |
| **Fixed sidebar overlap main** | Sidebar fixed đè content ở breakpoint nhất | Resize qua breakpoints → check overlap | tablet width sidebar đè text |
| **Backdrop không full** | Modal backdrop không cover toàn viewport (để lộ click ra sau) | Check backdrop尺寸 = viewport | click ra ngoài vẫn active |
| **Floating button che FAB menu** | FAB + menu mở đè nội dung | Mở FAB menu → check content bên dưới | che list item cuối |

**Auto check:** `ux-health.mjs` quét CTA buttons → elementsFromPoint xem nút có là topmost không.

---

## 3. Overflow & layout (VƯỢT khung / truncation)

| Bug | Triệu chứng | Phát hiện | Ví dụ |
|---|---|---|---|
| **Horizontal scroll xuất hiện** | Content rộng hơn viewport → scrollbar ngang | `document.documentElement.scrollWidth > window.innerWidth` | table/side-by-side tràn |
| **Text truncation cắt quan trọng** | "..." cắt số tiền/tên/ID | `el.scrollWidth > el.clientWidth` trên text element | "Total: 1 234..." cắt số |
| **Long string không break** | URL/email dài không xuống dòng → tràn | Nhập chuỗi dài 200 ký tự → check container | long URL phá card layout |
| **Element escape container** | Child trượt ra ngoài parent (no overflow:hidden, absolute sai) | Check child rect ngoài parent rect | badge trôi ra ngoài button |
| **Table cột tràn** | Nhiều cột → table vượt viewport, không scroll được | Đếm cột × min-width vs viewport | table 15 cột trên mobile |
| **Image破 aspect ratio** | Image bóp méo / tràn | naturalWidth/Height vs rendered ratio | avatar méo |
| **Content under fixed footer** | Content cuối bị fixed footer che, không scroll tới | Last element rect.bottom > viewport - footerHeight | không đọc được dòng cuối |
| **Negative margin leak** | Margin âm đẩy element đè hàng xóm | Check rect overlap giữa siblings | title đè lên image |
| **Flex/Grid item không shrink** | 1 item cứng → đẩy layout tràn | Resize container nhỏ lại → item có co không? | tag list không wrap |

**Auto check:** `ux-health.mjs` quét body + containers → báo horizontal overflow + truncation list.

---

## 4. State & loading (stuck / confuse)

| Bug | Triệu chứng | Phát hiện |
|---|---|---|
| **Spinner stuck mãi** | Loading không bao giờ resolve | Trigger load → chờ 10s → spinner còn? |
| **Skeleton forever** | Skeleton hiển thị mãi (API fail silently) | Mock API fail → skeleton có rơi về error không? |
| **Empty vs loading confuse** | Hiện "No data" khi đang load (chưa fetch xong) | `waitForStable` chờ data → check có đọc sớm "0" |
| **State không clear** | Error message ở lại sau khi fix + retry | Trigger error → fix → retry → message có biến? |
| **Optimistic hiển thị sai thứ tự** | Item mới hiện trên cùng nhưng sort là dưới | Tạo item → check vị trí vs sort rule |
| **Disabled button stuck** | Button disabled sau API done (enable quên) | Submit success → button có enable lại? |
| **Cache stale** | Quay lại page → data cũ (cache không invalidate) | Edit record → back → forward → check data mới? |

---

## 5. Responsive & breakpoint

| Bug | Phát hiện |
|---|---|
| **Layout vỡ ở width nhất định** | `browser_resize` qua 320/375/425/768/1024/1440 → snapshot từng cái |
| **Mobile menu không mở** | Resize nhỏ → click hamburger → menu hiện? |
| **Touch target < 44×44px** | Đo button rect < 44 (WCAG) |
| **Text < 12px trên mobile** | Computed font-size check |
| **Side-by-side thành overlap** | 2 cột → 1 cột có properly? |
| **Horizontal scroll trên mobile** | overflow check ở viewport 375 |
| **Fixed desktop element lỗi trên mobile** | Hover-only menu không dùng được touch |

---

## 6. Form UX

| Bug | Phát hiện |
|---|---|
| **Autofill phá layout** | Trigger autofill → check layout có vỡ |
| **Password manager overlay che** | Focus input → check manager popup che |
| **Input mất focus mỗi char** | Type từng char → check focus còn (controlled component bug) |
| **Paste lớn freeze** | Paste 10k ký tự → check UI responsive |
| **Special char vỡ input** | Nhập emoji/Unicode/`<script>` → check value read-back |
| **Date picker sai timezone** | Chọn ngày → check value gửi API vs hiển thị |
| **Required field không mark** | Required field không có `*` / aria-required |

---

## 7. Navigation & routing

| Bug | Phát hiện |
|---|---|
| **Back button trap** | Navigate → Back → có quay về đúng không (hoặc kẹt) |
| **Deep link 404** | Refresh trang deep → có load lại đúng không |
| **Redirect loop** | Navigate → check có loop (url nhảy qua lại) |
| **Stale data sau nav** | Edit → navigate away → back → data mới hay cũ? |
| **Scroll position không restore** | Back → scroll có ở vị trí cũ? |
| **Active nav sai** | Ở trang A, nav A có highlight? |

---

## 8. Animation & motion

| Bug | Phát hiện |
|---|---|
| **Animation janky** | DevTools timeline / đo FPS |
| **Transition stuck mid** | Trigger action giữa transition → check end state |
| **Reduced motion không respect** | `prefers-reduced-motion` → animation có tắt? |
| **Auto-advance carousel stuck** | Chờ → có auto-next không? |
| **Skeleton→content flicker** | Timing: skeleton biến mất trước content về → flicker |

---

## 9. Concurrency UI (multi-tab / real-time)

| Bug | Phát hiện |
|---|---|
| **2 tab cùng edit** | Mở 2 tab, edit cùng record → check conflict handling |
| **Real-time update push layout** | Nhận WS push → check layout có nhảy không |
| **Notification stack overflow** | Trigger 10 notification → check stack tràn |
| **Live counter race** | 2 update gần nhau → counter lệch |
| **Tab 1 logout, tab 2 vẫn active** | Logout tab A → tab B có sync không |

---

## 10. Accessibility (sâu — hơn basic)

| Bug | Phát hiện |
|---|---|
| **Focus trap modal hỏng** | Tab trong modal → focus có thoát ra ngoài? |
| **Focus không trả về** | Đóng modal → focus có về trigger button? |
| **Keyboard nav thứ tự sai** | Tab qua → focus đi theo logic hay nhảy loạn? |
| **Screen reader annonce thiếu** | aria-live cho dynamic content, aria-label cho icon button |
| **Color-only indication** | Error chỉ hiện bằng màu đỏ (không icon/text) → mù màu kẹt |
| **Heading order skip** | h1 → h3 (bỏ h2) → screen reader nav hỏng |
| **Contrast < 4.5:1** | Computed fg/bg → tính ratio |
| **Target size < 24px** (WCAG 2.2 AAA) | Đo interactive element |

---

## 11. Human UX & Gánh nặng nhận thức (Cognitive Friction & Flow UX)

Các lỗi khiến người dùng bị hoang mang, tốn quá nhiều thao tác hoặc dễ thao tác nhầm:

| Bug | Triệu chứng | Phát hiện | Ví dụ thực tế |
|---|---|---|---|
| **Silent Success (Thao tác ngầm không báo)** | Bấm Save/Submit thành công nhưng không có Toast, Banner hay đổi trang | Bấm action → kiểm tra DOM xem có Feedback UI xuất hiện không | Bấm "Lưu cấu hình", giao diện đứng yên → user bấm lại 5 lần vì tưởng lag |
| **Dead End (Đường cấm / Kẹt luồng)** | Trang báo thành công / Empty state nhưng không có đường thoát hay nút tiếp theo | Kiểm tra trang kết quả xem có CTA nào để tiếp tục công việc không | "Tạo đơn thành công" nhưng không có nút "Về danh sách" hay "In đơn", user phải tự gõ URL |
| **Too Many Clicks (UX Friction)** | Thao tác cơ bản phải qua quá nhiều bước/modal không cần thiết | Đếm số lần click để hoàn thành 1 nghiệp vụ đơn giản | Cần duyệt 1 bản ghi phải: Click view → Scroll → Click Edit → Click Status -> Select Approved -> Click Save -> Click Back |
| **Ambiguous CTA (Nút bấm mập mờ)** | Dùng từ chung chung "OK", "Submit", "Process", "Execute" | Inspect text nút bấm → check xem có nêu rõ hành động nghiệp vụ không | Nút ghi "Submit" thay vì "Tạo hóa đơn", "Gửi báo cáo", "Thanh toán $50" |
| **Dark Pattern / Primary Swap** | Vị trí nút Đồng ý / Hủy hoán đổi bất ngờ giữa các popup, hoặc nút Hủy nổi bật hơn nút chính | Kiểm tra vị trí & màu sắc nút bấm giữa các modal cùng app | Popup A nút Đồng ý bên phải, Popup B nút Đồng ý bên trái → bấm nhầm |
| **Destructive Action no Confirm** | Nút Xóa vĩnh viễn / Reset nằm sát nút Lưu và không có Dialog xác nhận | Click xóa record quan trọng → check xem có confirmation modal không | Nút "Xóa tài khoản" bấm 1 cái ăn ngay, không gõ lại tên hay xác nhận |
| **Unsaved Changes Loss** | Đang nhập dở form → vô tình click link khác hoặc Back → mất sạch dữ liệu | Nhập form → click link ngoài → check xem có `beforeunload` warning không | Nhập form 20 trường, lỡ tay bấm Back → mất toàn bộ dữ liệu vừa nhập |
| **Disappearing Input Context** | Modal/Form quá dài, khi cuộn xuống dưới không còn thấy title hay thông tin tổng quan | Scroll form → check header status/title có sticky không | Điền thông tin thanh toán nhưng không còn nhìn thấy tổng tiền ở đâu |

---

## 12. Overly Technical & Dev-centric UI (UI quá kỹ thuật / Lộ thuật ngữ Developer)

Các lỗi hiển thị mang tư duy của lập trình viên, làm lộ chi tiết kỹ thuật backend làm người dùng phổ thông hoang mang:

| Bug | Triệu chứng | Phát hiện | Ví dụ thực tế |
|---|---|---|---|
| **Raw DB/API Error Leak** | Hiển thị nguyên văn Stacktrace hoặc SQL Error cho người dùng xem | Trigger 500 error → check text hiển thị trên UI | `Internal Server Error: NullPointerException at UserService.java:142` hoặc `Key (email) already exists in table users_tbl` |
| **Backend Jargon in Labels** | Dùng tên biến/column DB làm label giao diện | Quét DOM tìm các từ chứa underscore, camelCase hoặc thuật ngữ dev | Label ghi `is_active_flag`, `cron_expression_val`, `created_at_timestamp`, `foreign_key_id` |
| **Exposing UUID / Raw Hashes** | Hiển thị chuỗi GUID/UUID ngoằn ngoèo cho người dùng thay vì mã thân thiện | Quét text regex `[0-9a-f]{8}-[0-9a-f]{4}...` trên bảng/detail | Bảng hiển thị `ID: 550e8400-e29b-41d4-a716-446655440000` thay vì mã đơn `HD-00123` |
| **Unformatted Raw JSON/XML** | Hiển thị chuỗi JSON thô chưa parse lên màn hình | Quét text UI chứa `{"status":...}` hoặc `<xml>...` | Trang chi tiết hiển thị `{"code": 200, "message": "SUCCESS", "data": {...}}` |
| **HTTP Status Code Only Error** | Báo lỗi bằng mã số HTTP khô khan mà không giải thích ngôn ngữ tự nhiên | Trigger lỗi validation/server → check text thông báo | "Lỗi 422 Unprocessable Entity" hoặc "502 Bad Gateway" mà không bảo user phải làm gì tiếp |
| **Dev Debug Toggles Leaked** | Nút Debug, Bypass Validation, Reset Test Data trôi nổi ở UI production/UAT | Quét nút bấm chứa `Debug`, `Test`, `Bypass`, `Force`, `Dump` | Màn hình thanh toán có nút "Bypass Payment Validation (Dev only)" |
| **Boolean Values Exposed Raw** | Hiển thị `true`/`false`, `1`/`0`, `NULL` thay vì `Có`/`Không`, `Đã kích hoạt`/`Chưa` | Quét cột trong bảng hiển thị `TRUE`, `FALSE`, `null`, `undefined` | Cột Trạng thái hiển thị `true` thay vì badge "Đang hoạt động" |

---

## 📊 So sánh các phương pháp kiểm thử UI/UX

| Phương pháp | Bắt được | KHÔNG bắt tốt |
|---|---|---|
| **Accessibility snapshot** | Thiếu label, sai role, button không có tên, element không tồn tại | Lệch UI, màu sắc, spacing, overlap |
| **DOM và CSS analysis** | Overflow, element ngoài màn hình, kích thước button, z-index | Giao diện có đẹp hay dễ hiểu không |
| **Visual regression** | Lệch layout, mất icon, sai font, sai màu, text bị cắt | Luồng UX khó sử dụng |
| **Axe Core** | Contrast, thiếu label, accessibility, duplicate ID | UX nghiệp vụ và thẩm mỹ |
| **Interaction testing** | Focus, keyboard, modal, hover, scroll, loading | Đánh giá giao diện đẹp hay không |
| **AI Vision** | Bố cục bất thường, hierarchy, UI khó nhìn | Không ổn định và tốn token |
| **Cognitive & Human UX Audit** (§11) | Dead end, silent success, quá nhiều click, mập mờ CTA, mất data | Cấu trúc code DOM, CSS style tĩnh |
| **Technical Leak Audit** (§12) | Lộ SQL error, stacktrace, UUID, backend jargon (`is_active_flag`, JSON thô) | Visual alignment, animation smoothness |

---

## Cách dùng catalog khi test
1. **Exploratory 1 feature**: pick 2-3 category liên quan (vd form → §1+§3+§6+§11; dashboard → §2+§3+§4+§12).
2. **Mỗi category**: rải 2-3 check từ bảng + chạy `ux-health.mjs` cho cái auto + `attack-surface.mjs` cho form/auth.
3. **Bug tìm được**: note category trong FINDINGS → dễ sort pattern (vd "nhiều bug §12 → backend dev làm UI chưa qua designer/BA polish").

> **Priority categories**: §1 Action safety, §2 Overlap, §3 Overflow, §5 Responsive, §11 Human UX, §12 Dev-centric UI.
