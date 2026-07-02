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

## Cách dùng catalog khi test
1. **Exploratory 1 feature**: pick 2-3 category liên quan (vd form → §1+§3+§6; dashboard → §2+§3+§4).
2. **Mỗi category**: rải 2-3 check từ bảng + chạy `ux-health.mjs` cho cái auto (overflow/truncation/touch/overlap/spam).
3. **Bug tìm được**: note category trong FINDINGS → dễ sort pattern (vd "nhiều bug §1 → team quên debounce").

> **Priority categories** (hay vỡ nhất): §1 Action safety, §2 Overlap, §3 Overflow, §5 Responsive.
