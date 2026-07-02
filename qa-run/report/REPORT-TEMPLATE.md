# 📝 QA Report / Comment — Format chuẩn (qa-run)

> Mục tiêu: report & comment **dễ đọc, tường minh**. Quy tắc số 1: phần **Actual** (và Steps) phải **xuống dòng từng ý** — KHÔNG viết liền 1 đoạn dài "luông tuồng".

## Cấu trúc 1 ticket (PASS hoặc FAIL)

```markdown
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAIL>

**Môi trường:** Web (Chrome) — <URL> — <account>

**Steps:**
1. <bước 1>
2. <bước 2>
3. ...

**Expected:** <1 câu mong đợi>

**Actual:**
- <quan sát 1 — mỗi ý 1 gạch đầu dòng>
- <quan sát 2>
- <số liệu cụ thể, vd: Total events 13 → 6>
- ...

**Ghi chú kỹ thuật (dev):**   ← chỉ khi cần (bug có API/log)
- Request: `POST /...` body `{...}`
- Response `200`: `{...}`
- <root cause 1 dòng>

**Kết luận:** <1 câu> → <Done / In Progress / ...>

**Evidence:** `path/a.png`, `path/b.png`
```

## Quy tắc bắt buộc

1. **Actual = bullet list**, mỗi quan sát/số liệu một dòng. Tối kỵ gộp tất cả vào 1 paragraph.
2. **Steps = danh sách đánh số** (`1.` `2.` …), không gộp 1 dòng.
3. Số liệu nêu rõ **trước → sau** (vd `13 → 6`, `qty 2 → reset 0`).
4. In đậm nhãn (`**Môi trường:**`, `**Actual:**`) và từ khóa quan trọng (tên filter, toast).
5. Phần kỹ thuật (endpoint/mã lỗi/response) tách riêng ở **Ghi chú kỹ thuật (dev)**, không trộn vào Actual.
6. **Kết luận** luôn 1 câu + state đích (Done / In Progress).
7. Mỗi ticket kết bằng **Evidence** = danh sách path ảnh.

## Lưu ý khi post lên Plane (comment_html)
- Mỗi mục bọc trong thẻ riêng để xuống dòng: dùng `<p>` cho từng nhãn và `<ul><li>…</li></ul>` cho Actual/Steps — **không** nhét cả Actual vào một `<p>` duy nhất.
- Ví dụ Actual đúng:
  ```html
  <p><strong>Actual:</strong></p>
  <ul>
    <li>Filter Staff/Event Type/Status/Team đầy đủ &amp; hoạt động.</li>
    <li>Status = Pending: Total events 13 → 6, In Progress 7 → 0.</li>
    <li>Combine AND: Booking AND Pending → 6 (giao đúng).</li>
  </ul>
  ```
- Escape: `&` → `&amp;`, `"` → `&quot;`, `<`/`>` trong JSON mẫu → `&lt;`/`&gt;`.
