# QA Report / Comment Template

Mục tiêu: report retest và comment Plane phải ngắn, rõ, dễ scan, không lẫn nhiều ý vào một đoạn.

## Ticket Retest Template

```markdown
## <PASS/FAILED/N/A/UNTEST> — #<id> — <tên ngắn>

**Requirement source:** <Plane URL>
**Business flow:** <1-2 câu mô tả flow đã xác nhận>
**Environment:** Web <browser> — <URL> — <tài khoản tham chiếu đã che>

**Role/Data mapping**
| Vai trò nghiệp vụ | Tài khoản tham chiếu đã che | Phạm vi hoặc quyền | Kết quả |
|---|---|---|---|
| <tên vai trò cụ thể> | <đã che> | <quyền/phạm vi> | <PASS/FAILED/N/A/UNTEST> |

**Test contract**
- <role/data/setup 1>
- <role/data/setup 2>

**AC results**
1. <AC1 mô tả> — <PASS/FAILED/N/A/UNTEST> — <evidence hoặc quan sát 1 dòng>
2. <AC2 mô tả> — <PASS/FAILED/N/A/UNTEST> — <evidence hoặc quan sát 1 dòng>

**Adjacent checks**
- <impact area 1> — <PASS/FAILED/N/A/UNTEST> — <note ngắn>
- <impact area 2> — <PASS/FAILED/N/A/UNTEST> — <note ngắn>

**Steps**
1. <bước 1>
2. <bước 2>
3. <bước 3>

**Expected**
- <expected 1>
- <expected 2>

**Actual**
- <quan sát 1>
- <quan sát 2>
- <số liệu trước → sau nếu có>

**Technical notes**
- <endpoint/log/network only when needed>

**Verdict:** <PASS/FAILED/N/A/UNTEST> — <1 câu kết luận>
**Evidence:**
- <path/to/evidence-1.png>
- <path/to/evidence-2.png>
```

## Rules

1. `AC results` phải tách từng AC một dòng, không gộp nhiều AC vào một bullet.
2. `Steps`, `Expected`, `Actual` đều dùng bullet/numbered list, không viết thành paragraph dài.
3. Mỗi `Actual` nên là một quan sát hoặc một số liệu trước → sau.
4. `Technical notes` chỉ ghi khi có API/log/network đủ để hỗ trợ root cause.
5. `Evidence` luôn là danh sách path ảnh riêng, không nhét vào dòng `Verdict`.
6. Không đặt dấu `.` cuối câu nếu nội dung dùng cho Plane comment hoặc report human-facing.
7. Không dùng mã account/role rút gọn kiểu `U1`, `U2`, `U3`, `U4` trong report human-facing; nếu cần trace machine thì giữ alias ở evidence JSON đã che và hiển thị tên vai trò nghiệp vụ trong report.

## Plane comment HTML

- Mỗi khối cần thẻ riêng để giữ xuống dòng ổn định
- Dùng `<p>` cho nhãn, `<ul><li>…</li></ul>` cho list, không dồn `Actual` vào một `<p>`
- Escape ký tự đặc biệt: `&` → `&amp;`, `"` → `&quot;`, `<`/`>` → `&lt;`/`&gt;`

## Minimal PASS example

```html
<p><strong>AC results</strong></p>
<ul>
  <li>AC1 — PASS — Ticket flow hoạt động đúng</li>
  <li>AC2 — PASS — Adjacent control không vỡ</li>
</ul>
<p><strong>Verdict:</strong> PASS — Không còn lệch business flow</p>
```
