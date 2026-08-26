# Black-Box Testing Techniques

> **Khi nào đọc file này**: Khi thiết kế test case và cần chọn kỹ thuật black-box phù hợp cho từng loại case. AI phải xác định kỹ thuật trước khi viết case. Tham chiếu `@references/blackbox-techniques.md` trong SKILL.md.

Black-box testing thiết kế test case **hoàn toàn từ behavior và AC**, không dựa vào source code nội bộ. Mỗi case phải observable và measurable từ góc nhìn người dùng cuối.

## Mapping nhanh: type → kỹ thuật

| Type | BB Technique bắt buộc xem xét |
|---|---|
| `happy` | Use Case Testing |
| `alternative` | Use Case Testing |
| `validation` | Equivalence Partitioning + BVA + Decision Table (nếu ≥2 điều kiện) |
| `edge` | Boundary Value Analysis + Equivalence Partitioning |
| `negative` | Equivalence Partitioning (invalid partition) + Error Guessing |
| `error` | Error Guessing + State Transition |
| `ui` | Use Case Testing (UI perspective) |
| `additional` | Error Guessing |

---

## 1. Equivalence Partitioning (EP)

### Nguyên tắc
Chia toàn bộ input thành các **partition** (nhóm) mà hệ thống xử lý tương đương nhau. Chỉ cần **1 case đại diện mỗi partition** — không cần test mọi giá trị trong cùng nhóm.

### Quy tắc áp dụng
- Xác định mọi partition hợp lệ (valid) và không hợp lệ (invalid)
- Mỗi partition → ít nhất 1 case
- Không viết nhiều case cho cùng một partition với input khác nhau nhưng behavior giống nhau

### Ví dụ: trường Email đăng ký

| Partition | Giá trị đại diện | Type case |
|---|---|---|
| Email hợp lệ | `qa@example.com` | `happy` |
| Thiếu ký tự `@` | `qaexample.com` | `validation` |
| Thiếu domain | `qa@` | `validation` |
| Chuỗi rỗng | `` (để trống) | `validation` |
| Email đã tồn tại | `existing@example.com` | `negative` |

### JSON mẫu

```json
{
  "type": "validation",
  "bb_technique": "EP",
  "req": "AC3",
  "description": "Xác minh rằng hệ thống không cho phép đăng ký khi email thiếu ký tự @",
  "pre_condition": "User ở trang /register",
  "procedure": "1. Mở /register\n2. Tại ô \"Email\", nhập: qaexample.com\n3. Điền đầy đủ các trường còn lại hợp lệ\n4. Nhấp nút \"Đăng ký\"",
  "expected": "1. Hệ thống không tạo tài khoản\n2. Dưới ô \"Email\" hiển thị thông báo lỗi: \"Email không hợp lệ\"\n3. Trang vẫn ở màn hình đăng ký",
  "priority": "High"
}
```

---

## 2. Boundary Value Analysis (BVA)

### Nguyên tắc
Test tại **biên của partition**: min, min−1, min+1, max−1, max, max+1. Lỗi thường xảy ra tại ranh giới chứ không phải ở giữa partition.

### Quy tắc áp dụng
- Mỗi boundary → ít nhất 1 case riêng
- Ưu tiên: min valid, max valid, min−1 (invalid), max+1 (invalid)
- Kết hợp với EP: EP chọn partition, BVA chọn giá trị tại biên của partition đó

### Ví dụ: trường Password (quy định 8–20 ký tự)

| Boundary | Giá trị | Kết quả mong đợi | Type case |
|---|---|---|---|
| min−1 | 7 ký tự | Invalid | `edge` |
| min | 8 ký tự | Valid | `edge` |
| min+1 | 9 ký tự | Valid | `happy`/`edge` |
| max−1 | 19 ký tự | Valid | `edge` |
| max | 20 ký tự | Valid | `edge` |
| max+1 | 21 ký tự | Invalid | `edge` |

### JSON mẫu (min boundary — hợp lệ)

```json
{
  "type": "edge",
  "bb_technique": "BVA",
  "req": "AC4",
  "description": "Xác minh rằng hệ thống cho phép đăng ký với mật khẩu đúng 8 ký tự (giá trị tối thiểu hợp lệ)",
  "pre_condition": "User ở trang /register",
  "procedure": "1. Mở /register\n2. Tại ô \"Mật khẩu\", nhập đúng 8 ký tự: Aa123456\n3. Điền đầy đủ các trường còn lại hợp lệ\n4. Nhấp nút \"Đăng ký\"",
  "expected": "1. Hệ thống tạo tài khoản thành công\n2. Chuyển hướng về trang xác nhận hoặc Dashboard",
  "priority": "High"
}
```

---

## 3. Decision Table Testing

### Nguyên tắc
Dùng khi feature có **≥2 điều kiện độc lập** kết hợp để tạo ra behavior khác nhau. Mỗi cột trong bảng là 1 test case, đảm bảo không bỏ sót combination.

### Khi nào bắt buộc dùng
- Có ≥2 điều kiện boolean hoặc phân loại (e.g. "email hợp lệ?" × "password hợp lệ?")
- Spec có bảng điều kiện, bảng phân quyền hoặc business rule dạng "nếu A và B thì X, nếu A và không B thì Y"
- Không được tự viết case rời rạc mà bỏ qua tổ hợp

### Cách xây dựng Decision Table

```
Điều kiện 1 (email hợp lệ):     T   T   F   F
Điều kiện 2 (password hợp lệ):  T   F   T   F
─────────────────────────────────────────────
Hành động: Đăng nhập thành công  ✓   ✗   ✗   ✗
Hành động: Lỗi "email sai"       ✗   ✗   ✓   ✓
Hành động: Lỗi "password sai"    ✗   ✓   ✗   ✓
```

→ 4 cột = 4 test case tương ứng.

### JSON mẫu (cột 2: email đúng, password sai)

```json
{
  "type": "negative",
  "bb_technique": "Decision Table",
  "req": "AC2",
  "description": "Xác minh rằng hệ thống báo lỗi mật khẩu khi email đúng nhưng mật khẩu sai",
  "pre_condition": "Có account test với email: qa@example.com",
  "procedure": "1. Mở /login\n2. Tại ô \"Email\", nhập: qa@example.com\n3. Tại ô \"Mật khẩu\", nhập sai: WrongPass99\n4. Nhấp nút \"Đăng nhập\"",
  "expected": "1. Hệ thống không đăng nhập\n2. Hiển thị thông báo lỗi: \"Mật khẩu không đúng\"\n3. Trang vẫn ở màn hình đăng nhập",
  "priority": "High"
}
```

> **Lưu ý**: Ghi comment trong JSON nếu cần, ví dụ `"bb_note": "Decision Table col 2/4: email=valid, password=invalid"` để trace.

---

## 4. State Transition Testing

### Nguyên tắc
Mô hình hóa hệ thống như một **state machine**: mỗi trạng thái (state) và mỗi sự kiện (event/trigger) tạo ra transition sang trạng thái khác. Test phủ toàn bộ:
- Valid transitions (chuyển trạng thái hợp lệ)
- Invalid transitions (cố tình chuyển sai trạng thái)

### Khi nào áp dụng
- Object có nhiều trạng thái rõ ràng (ticket: Draft → Submitted → Approved → Rejected)
- Feature có luồng multi-step (checkout: Cart → Shipping → Payment → Confirmation)
- Phân quyền theo trạng thái (chỉ Approved mới có thể Export)

### Ví dụ State Diagram: Ticket

```
[Draft] ──submit──→ [Submitted] ──approve──→ [Approved] ──export──→ [Exported]
   ↑                     │                       │
   └──reject─────────────┘                       └──reject──→ [Rejected]
```

### Cases cần test

| From State | Event | To State | Type |
|---|---|---|---|
| Draft | submit | Submitted | `happy` |
| Submitted | approve | Approved | `happy` |
| Submitted | reject | Rejected | `alternative` |
| Draft | approve (invalid) | — | `negative` |
| Approved | submit (invalid) | — | `negative` |
| Approved | export | Exported | `happy` |

### JSON mẫu (invalid transition)

```json
{
  "type": "negative",
  "bb_technique": "State Transition",
  "req": "AC6",
  "description": "Xác minh rằng user không thể Approve ticket đang ở trạng thái Draft",
  "pre_condition": "Ticket TEST-001 đang ở trạng thái Draft; user đăng nhập với quyền Manager",
  "procedure": "1. Mở trang chi tiết ticket TEST-001\n2. Kiểm tra trạng thái hiển thị: \"Draft\"\n3. Tìm nút \"Approve\" trên trang\n4. Quan sát trạng thái nút và thử nhấp (nếu hiển thị)",
  "expected": "1. Nút \"Approve\" không hiển thị hoặc bị vô hiệu hóa (disabled)\n2. Không có hành động nào xảy ra\n3. Ticket vẫn ở trạng thái Draft",
  "priority": "High"
}
```

---

## 5. Use Case / User Story Testing

### Nguyên tắc
Mỗi **Acceptance Criteria (AC)** là 1 use case. Test đầy đủ flow từ precondition → steps → postcondition theo đúng ngôn ngữ end-user.

### Quy tắc áp dụng
- `happy` type: main success scenario của use case
- `alternative` type: alternative path dẫn đến cùng kết quả thành công
- Mỗi use case phải có rõ actor, precondition, trigger và postcondition

### JSON mẫu (alternative path)

```json
{
  "type": "alternative",
  "bb_technique": "Use Case Testing",
  "req": "AC1",
  "description": "Xác minh rằng user có thể đăng nhập bằng cách nhấn phím Enter thay vì click nút Đăng nhập",
  "pre_condition": "Có account test; user ở trang /login",
  "procedure": "1. Mở /login\n2. Tại ô \"Email\", nhập: qa@example.com\n3. Tại ô \"Mật khẩu\", nhập: Test@1234\n4. Nhấn phím Enter trên bàn phím",
  "expected": "1. Hệ thống thực hiện đăng nhập\n2. Chuyển hướng về trang Dashboard",
  "priority": "Medium"
}
```

---

## 6. Error Guessing

### Nguyên tắc
Dựa trên **kinh nghiệm tester** để đoán các điểm lỗi thường gặp ngoài spec. Không cần requirement rõ ràng — tester biết hệ thống hay lỗi ở đâu.

### Khi nào áp dụng
- `negative` type: đoán input độc hại hoặc bất ngờ (SQL injection pattern, XSS string, unicode)
- `error` type: đoán edge case server/infra (session hết hạn giữa chừng, mất kết nối khi submit)
- `additional` type: case ngoài spec — **bắt buộc flag `Ref: (out-of-spec)`**

### Danh sách Error Guessing thường dùng

| Loại | Giá trị đoán | Ghi chú |
|---|---|---|
| Input rỗng sau khi xóa | Nhập rồi xóa hết, submit | Khác với để trống từ đầu |
| Khoảng trắng đầu/cuối | `  qa@example.com  ` | Hệ thống có trim không? |
| Ký tự đặc biệt | `<script>`, `' OR 1=1`, `%00` | Chỉ dùng pattern, không exploit thật |
| Copy-paste từ PDF | Unicode zero-width, smart quote `"` | Tester hay dùng |
| Submit nhiều lần liên tiếp | Click nhanh 5 lần | Race condition |
| Back browser sau submit | Quay lại sau khi thành công | Có tạo duplicate không? |
| Session hết hạn giữa form dài | Điền xong rồi submit sau 30 phút | Data có bị mất không? |

### JSON mẫu

```json
{
  "type": "negative",
  "bb_technique": "Error Guessing",
  "req": "AC3",
  "description": "Xác minh rằng hệ thống xử lý đúng khi email có khoảng trắng ở đầu và cuối",
  "pre_condition": "User ở trang /login",
  "procedure": "1. Mở /login\n2. Tại ô \"Email\", nhập có khoảng trắng đầu cuối:   qa@example.com  \n3. Nhập mật khẩu hợp lệ\n4. Nhấp nút \"Đăng nhập\"",
  "expected": "1. Hệ thống tự trim khoảng trắng và đăng nhập thành công\n   HOẶC\n2. Hiển thị thông báo lỗi hướng dẫn nhập lại đúng định dạng",
  "priority": "Medium"
}
```

> **Lưu ý**: Nếu expected chưa rõ trong spec, ghi cả 2 khả năng và đánh dấu clarification cần thiết.

---

## 7. Pairwise / Combinatorial Testing

### Nguyên tắc
Khi có **≥3 input field độc lập**, số tổ hợp đầy đủ (full factorial) quá lớn. Pairwise đảm bảo mọi **cặp giá trị (pair)** của 2 field bất kỳ đều được test ít nhất 1 lần — giảm số case nhưng vẫn bắt được phần lớn lỗi tương tác.

### Khi nào áp dụng
- Có ≥3 field với nhiều giá trị (dropdown, radio, toggle)
- Full factorial quá lớn (>20 tổ hợp)
- Không có tool PICT — AI tự chọn subset thủ công

### Ví dụ: Form lọc báo cáo (3 field)

```
Field A — Loại báo cáo:  [Doanh thu, Chi phí, Lợi nhuận]
Field B — Kỳ:            [Ngày, Tuần, Tháng, Năm]
Field C — Định dạng:     [PDF, Excel]
```

Full factorial: 3 × 4 × 2 = 24 case. Pairwise: ~10 case đại diện.

### Cách chọn thủ công

1. Liệt kê tất cả giá trị cho mỗi field
2. Ưu tiên tổ hợp chưa xuất hiện trong bất kỳ case nào
3. Đảm bảo mỗi giá trị của A xuất hiện cùng mỗi giá trị của B ít nhất 1 lần

### JSON mẫu

```json
{
  "type": "happy",
  "bb_technique": "Pairwise",
  "req": "AC8",
  "description": "Xác minh rằng hệ thống tạo báo cáo Chi phí theo Tuần định dạng Excel thành công",
  "pre_condition": "User đăng nhập với quyền Manager; có dữ liệu tuần hiện tại",
  "procedure": "1. Mở trang Báo cáo\n2. Tại \"Loại báo cáo\", chọn: Chi phí\n3. Tại \"Kỳ\", chọn: Tuần\n4. Tại \"Định dạng\", chọn: Excel\n5. Nhấp nút \"Xuất báo cáo\"",
  "expected": "1. File Excel được tải xuống thành công\n2. File có tên chứa kỳ và loại báo cáo\n3. Dữ liệu trong file khớp với dữ liệu hiển thị trên màn hình",
  "priority": "Medium"
}
```

---

## Quy tắc chọn kỹ thuật

```
1. Có ≥2 điều kiện kết hợp?
   → Bắt buộc dùng Decision Table trước khi viết case

2. Có trường số, độ dài, ngày tháng hoặc giới hạn rõ ràng?
   → Bắt buộc BVA cho type=edge; kết hợp EP cho type=validation

3. Object/flow có nhiều trạng thái?
   → Vẽ state diagram, áp dụng State Transition cho happy + negative

4. Feature có ≥3 input field độc lập, full factorial quá lớn?
   → Áp dụng Pairwise để reduce case

5. Không có trường hợp nào ở trên?
   → Use Case Testing cho happy/alternative; EP cho validation/negative; Error Guessing cho thêm vào
```

## Ghi metadata `bb_technique` (bắt buộc với contract mới)

Mọi case dưới `execution_contract="required"` phải có `bb_technique`. Có thể dùng một chuỗi hoặc mảng khi case kết hợp nhiều kỹ thuật. Generator xác thực giá trị, giữ metadata trong `.automation.json` và chặn case thiếu/sai kỹ thuật. `legacy_text_only` vẫn tương thích mà không bắt buộc field này.

Giá trị hợp lệ: `EP`, `BVA`, `Decision Table`, `State Transition`, `Use Case Testing`, `Error Guessing`, `Pairwise`
