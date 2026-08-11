# Attack Taxonomy — Checklist tấn công theo Feature Type

Mỗi khi bắt đầu exploratory hoặc ad-hoc, **BẮT BUỘC** chọn ít nhất 1 feature type từ danh sách bên dưới, đọc attack vectors tương ứng, rồi mới mở browser.

Không click mù. Không test theo cảm tính. Mỗi action phải map về 1 attack vector trong danh sách này.

---

## 1. Form / Input

**Trigger dùng taxonomy này khi:** trang có form, input field, text area, date picker, dropdown, file upload, rich text editor.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Required field bypass** | Bỏ trống field bắt buộc, submit | Form submit không báo lỗi |
| **Whitespace bypass** | Nhập chỉ space/tab/newline, submit | Lưu được data rỗng |
| **Boundary - min** | Nhập 0, -1, min-1 vào field số | Không validate âm |
| **Boundary - max** | Nhập max+1, INT_MAX, 10000 ký tự | Không giới hạn độ dài |
| **Type mismatch** | Nhập chữ vào field số, nhập số âm vào trường % | Crash hoặc lưu sai |
| **Special chars** | `<script>`, `'OR 1=1`, `../../../`, null byte | XSS reflected, SQL error lộ, path traversal |
| **Double submit** | Click Submit 2 lần nhanh | Tạo duplicate record |
| **Slow submit** | Submit → đợi 10s → submit lại | Duplicate sau timeout |
| **Paste attack** | Paste 10000 ký tự vào textarea | Browser lag, server error |
| **Date boundary** | 29/02 năm không nhuận, 31/06 | Crash hoặc tính sai |
| **Autocomplete leak** | Inspect input có `autocomplete` | Lộ dữ liệu nhạy cảm từ browser |

### Script hỗ trợ
```bash
node <skill>/scripts/attack-surface.mjs --path /your-form-path
```

---

## 2. Table / List / Data Grid

**Trigger dùng taxonomy này khi:** trang có bảng dữ liệu, danh sách, grid, paginated list.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Empty state** | Xóa hết data hoặc filter không match | Blank page, no empty state message |
| **Single item** | Chỉ để 1 record | Layout vỡ, pagination hiển thị sai |
| **Large dataset** | Load trang có 10k+ records | Lag, timeout, pagination sai |
| **Filter + sort combo** | Lọc + sắp xếp đồng thời | Sort sai sau filter |
| **Pagination edge** | Trang cuối + next, trang 1 + prev | Không guard, load trang 0 hoặc -1 |
| **Select all across pages** | Select all → thao tác bulk | Chỉ apply cho trang hiện tại |
| **Column sort direction** | Click header 3 lần | Không reset về default |
| **Long text in cell** | Record có tên 500 ký tự | Cell overflow, layout vỡ |
| **Delete last record** | Xóa record cuối cùng | List vẫn hiện, pagination còn |
| **Real-time update conflict** | Mở 2 tab, update cùng 1 record | Race condition, stale data |

---

## 3. Filter / Search

**Trigger dùng taxonomy này khi:** trang có search bar, filter panel, dropdown filter, date range, tag filter.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Empty search** | Nhấn Search không nhập gì | Crash hoặc load toàn bộ data không filter |
| **Special chars in search** | `<script>`, `%`, `*`, `_` | XSS, SQL wildcard leak, regex error |
| **No results** | Tìm chuỗi chắc chắn không có | Không có empty state UI |
| **Very long query** | Paste 5000 ký tự vào search | Request timeout, server error |
| **Unicode search** | Tìm tiếng Việt có dấu, Japanese, Arabic | Encoding fail, không tìm được |
| **Filter combination** | Áp 3+ filter cùng lúc | Logic AND/OR sai, kết quả trống do bug |
| **Filter persistence** | Filter → navigate → back | Filter có reset về default không? |
| **Date range edge** | From > To, same day from+to | Không validate, range âm |
| **Clear filter** | Click Clear All | Không clear hết, 1 filter còn sót |
| **URL share filter state** | Copy URL khi đang filter | URL không encode filter state |

---

## 4. Modal / Dialog / Drawer

**Trigger dùng taxonomy này khi:** có popup, modal dialog, side drawer, confirmation dialog.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **ESC key close** | Nhấn Esc khi modal mở | Không đóng hoặc đóng không clean |
| **Click outside** | Click backdrop/overlay | Không đóng hoặc trigger action sai |
| **Scroll behind modal** | Cuộn khi modal đang mở | Body vẫn scroll được |
| **Nested modal** | Mở modal từ trong modal | Z-index conflict, focus trap break |
| **Quick open/close** | Mở → đóng nhanh → mở lại | State bị lẫn từ lần trước |
| **Form in modal submit** | Submit form trong modal bằng Enter | Trigger ngoài ý muốn |
| **Long content modal** | Modal có nội dung dài | Không scroll được, nút bị che |
| **Modal on mobile** | Mở modal trên 375px | Cắt 2 bên, không scroll nội dung |
| **Focus trap** | Tab qua hết element trong modal | Focus thoát ra khỏi modal |
| **Screen reader** | Modal không có role=dialog, aria-modal | Không accessible |

---

## 5. Authentication / Authorization

**Trigger dùng taxonomy này khi:** có login, logout, role-based UI, protected routes, API endpoint.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Direct URL access** | Truy cập /admin khi chưa login | Không redirect về /login |
| **Role escalation** | User thường truy cập URL của admin | 200 OK thay vì 403 |
| **Expired token** | Xóa token khỏi localStorage → reload | Không redirect, hiện data cũ |
| **Token in URL** | Inspect network, search URL cho token | Token lộ trong URL/logs |
| **Concurrent session** | Login 2 tab khác nhau cùng account | Session conflict không thông báo |
| **Logout + back** | Logout → nhấn Back | Vẫn xem được trang cũ (cache) |
| **Remember me** | Login với remember → clear session cookie | Còn token hay không? |
| **IDOR test** | Đổi ID trong URL sang ID của user khác | Xem được data người khác |
| **API without auth** | Gọi trực tiếp API endpoint không có Bearer token | 200 OK thay vì 401 |
| **Permission UI leak** | Inspect DOM xem có element ẩn cho admin không | Admin button bị hide bằng CSS thay vì không render |

### Script hỗ trợ
```bash
node <skill>/scripts/attack-surface.mjs --path /dashboard
# Tự test session boundary và direct URL access
```

---

## 6. CRUD Operations

**Trigger dùng taxonomy này khi:** có Create, Read, Update, Delete bất kỳ loại entity.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Create duplicate** | Tạo 2 record có cùng tên/email | Không validate unique, tạo được duplicate |
| **Create then immediate edit** | Tạo record → edit ngay | ID chưa có, edit crash |
| **Update to conflict** | Đổi tên record A thành tên đã có của record B | Không validate unique trên update |
| **Delete while in use** | Xóa entity đang được reference | Orphan data, cascade delete không đủ |
| **Delete last item** | Xóa record cuối | Empty state không hiển thị |
| **Bulk delete** | Chọn tất cả → delete | Không có confirm, xóa hết ngay |
| **Optimistic UI race** | Tạo record → xóa nhanh trước khi server confirm | UI không nhất quán |
| **Archive vs delete** | Có 2 trạng thái soft/hard delete? | Archived item vẫn hiện trong list |
| **Restore deleted** | Xóa → khôi phục → xóa lại | State machine bị kẹt |
| **Edit mid-list-change** | Mở edit form → list real-time update → submit | Submit data cũ thay vì current |

---

## 7. Async / Real-time / Long Operations

**Trigger dùng taxonomy này khi:** có background job, export, import, real-time feed, websocket, progress bar, file processing.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Slow network** | Throttle network → click action | Loading state không hiện, button spam được |
| **Offline mid-action** | Offline → click action | Crash, no error message |
| **Cancel mid-progress** | Start long job → cancel | Job vẫn chạy, orphan state |
| **Navigate away mid-job** | Start job → navigate away → back | Job result mất, không thông báo |
| **Concurrent start** | Click "Run export" 2 lần nhanh | 2 jobs chạy song song |
| **Error recovery** | Server trả 500 giữa chừng | No retry, no error message |
| **Progress stuck at 99%** | Import/export job đang chạy | Spinner không tắt, không thông báo done |
| **Timeout** | Job chạy >30s | Frontend timeout không đúng, user không biết |
| **Real-time data stale** | Mở 2 tab, update tab 1 | Tab 2 không refresh, hiện data cũ |
| **WebSocket disconnect** | Kill network → reconnect | Feed dừng, không tự reconnect |

### Script hỗ trợ
```bash
# Kiểm tra button spam (double-submit guard)
node <skill>/scripts/attack-surface.mjs --path /your-path
# Kết hợp với: browser devtools → Network → Throttle → Slow 3G
```

---

## 8. File Upload / Download

**Trigger dùng taxonomy này khi:** có upload button, drag-drop zone, file picker, download button, attachment.

### Attack vectors

| Vector | Cách test | Lỗi hay gặp |
|---|---|---|
| **Wrong file type** | Upload .exe khi chỉ accept .pdf | Accept hoặc crash |
| **File type bypass** | Đổi tên .exe thành .pdf rồi upload | Server chỉ check extension không check MIME |
| **Oversized file** | Upload file > limit (thử 2x limit) | No size validation, server crash |
| **Empty file** | Upload file 0 byte | Server xử lý sai |
| **Filename special chars** | Upload file có tên `../../etc.pdf` hoặc `<script>.pdf` | Path traversal, XSS in filename |
| **Double upload** | Chọn file → upload đang chạy → upload lại | 2 file hoặc confusion |
| **Upload then delete** | Upload → ngay lập tức delete | File orphan trên storage |
| **Download corrupted** | Download file lớn trên slow network | Truncated file không thông báo |
| **Concurrent upload** | Upload 10 file cùng lúc | Race condition, one overwrites another |
| **Virus-like name** | Upload file tên `EICAR-TEST-FILE` | Antivirus trigger, không xử lý gracefully |

---

## Quick Reference — Chọn taxonomy khi nào

```
Có form?         → [1] Form/Input + attack-surface.mjs
Có table/list?   → [2] Table + visual-audit.mjs (empty state, overflow)
Có search?       → [3] Filter/Search
Có modal?        → [4] Modal
Có login/role?   → [5] Auth + attack-surface.mjs (session boundary)
Có CRUD?         → [6] CRUD (dùng withRevert để cleanup)
Có jobs/export?  → [7] Async
Có upload?       → [8] File Upload
```

## Cách dùng trong exploratory session

```
1. Đọc app guide (qa-knowledge/app-flow-map.json)
2. Identify feature type cho khu vực đang test
3. Chọn 3-5 attack vectors HIGH priority từ taxonomy
4. Với mỗi vector:
   a. Chạy script nếu có (attack-surface.mjs / visual-audit.mjs)
   b. Hoặc thực hiện thủ công qua MCP Playwright
   c. Record snapshot + network + console sau mỗi vector
5. Chấm finding theo severity và ghi vào FINDINGS.md
```

## Severity mapping

| Severity | Điều kiện |
|---|---|
| **HIGH** | Data leak, auth bypass, duplicate record tạo được, XSS reflected |
| **MEDIUM** | No validation error, silent fail, missing confirmation, broken pagination |
| **LOW** | UX issue, missing empty state, minor overflow |
| **INFO** | Observation không phải bug, cần clarification |
