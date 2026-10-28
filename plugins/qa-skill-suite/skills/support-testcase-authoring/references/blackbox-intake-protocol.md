# Black-Box Testing Intake & Authoring Protocol

> **Khi nào đọc file này**: Khi người dùng yêu cầu phân tích yêu cầu, bóc tách context chức năng và thiết kế test case theo phương pháp Black-box Testing từ đầu hoặc theo prompt mẫu. Tham chiếu `@references/blackbox-intake-protocol.md` trong `SKILL.md`.

---

## 1. Context & thông tin nghiệp vụ chuẩn (Intake Schema)

Khi tiếp nhận yêu cầu phân tích và viết test case cho một chức năng, cấu trúc thông tin đầu vào chuẩn bao gồm:

### 1. Context dự án
- **Tên hệ thống**: Tên ứng dụng hoặc dự án đang phát triển
- **Loại hệ thống**: Web / Mobile / API / ERP / CRM / AI Chatbot
- **Chức năng cần kiểm thử**: Tên module hoặc tính năng cụ thể
- **Đối tượng sử dụng**: Admin / User / Manager / Khách vãng lai...
- **Mục tiêu nghiệp vụ**: Ý nghĩa và mục tiêu vận hành của chức năng

### 2. Thông tin nghiệp vụ (Business Specs)
- **Business rules**: Các quy tắc nghiệp vụ bắt buộc tuân thủ
- **Điều kiện đầu vào**: Input, định dạng, độ dài, ràng buộc dữ liệu và validation
- **Trạng thái dữ liệu**: Các trạng thái vòng đời của thực thể (vd: Draft, Active, Suspended, Expired...)
- **Điều kiện xử lý**: Các điều kiện logic ảnh hưởng đến kết quả đầu ra
- **Luồng xử lý chính**: Main flow / Happy path từng bước
- **Luồng ngoại lệ**: Exception flows, lỗi hệ thống, xử lý biên đặc biệt
- **Tài liệu tham khảo**: BRD / SRS / User Story / API Document / UI Design

---

## 2. Quy trình phân tích và làm rõ trước khi viết test case

Trước khi sinh test case, AI Senior QA Engineer bắt buộc thực hiện theo các bước:

1. **Phân tích context và quy tắc nghiệp vụ**: Xác định toàn bộ business rules ảnh hưởng trực tiếp đến chức năng
2. **Xác định thông tin thiếu hoặc mâu thuẫn**:
   - Chỉ ra cụ thể các khoảng trống dữ liệu, điều kiện biên chưa xác định, thông báo lỗi chưa mô tả
   - Đặt câu hỏi làm rõ (Clarification Questions) thay vì tự tiện suy diễn nghiệp vụ
   - Nếu có giả định bắt buộc phải đưa ra để tiếp tục phân tích, tách thành mục riêng và chờ người dùng xác nhận
3. **Phân tích phân rã các luồng (Flow Breakdown)**:
   - Luồng chính (Main / Happy path)
   - Luồng thay thế (Alternative flows)
   - Luồng ngoại lệ (Exception / Error flows)
4. **Áp dụng kỹ thuật Black-box Testing cốt lõi**:
   - **Equivalence Partitioning (EP)**: Chia vùng hợp lệ (valid) và không hợp lệ (invalid) cho từng trường
   - **Boundary Value Analysis (BVA)**: Kiểm thử giá trị biên (min-1, min, min+1, max-1, max, max+1)
   - **Decision Table Testing**: Lập bảng quyết định cho tính năng có từ 2 điều kiện logic kết hợp trở lên
   - **State Transition Testing**: Kiểm thử mọi chuyển đổi trạng thái hợp lệ và bất hợp lệ của thực thể
   - **Use Case Testing / Error Guessing / Pairwise**: Bổ sung theo ngữ cảnh rủi ro thực tế
5. **Xây dựng bộ test case toàn diện**:
   - Positive (Happy path, Alternative flows)
   - Negative (Nhập sai, vi phạm validation, lỗi dữ liệu)
   - Boundary (Giá trị sát biên và vượt biên)
   - Business Rules (Thỏa mãn và vi phạm từng quy tắc nghiệp vụ)
   - Risk / Edge Cases (Xử lý sự cố mạng, timeout, dữ liệu bất thường)
6. **Kiểm tra dữ liệu, phân quyền (RBAC) và API / tính nhất quán**:
   - Ma trận phân quyền theo vai trò (Admin / User / v.v.)
   - Tính nhất quán trạng thái dữ liệu trước và sau thao tác

---

## 3. Định dạng đầu ra chuẩn

Test case được trình bày theo bảng chuẩn 6 cột, đồng bộ trực tiếp với sheet `Test cases_App` của template Excel:

| Cột | Ý nghĩa | Quy tắc thể hiện | Ánh xạ Template Excel / JSON |
|---|---|---|---|
| **ID** | Mã định danh test case | Ổn định, có tiền tố hệ thống (vd: `AUTH-01`, `PROJ-01`, `PROJ-UI-01`, `PROJ-API-01`) | Cột D (`Test case ID`) |
| **Function** | Tên chức năng / Nhóm chức năng | Tên phân hệ hoặc nhóm kịch bản (vd: Đăng nhập, Tạo đơn hàng) | Cột C (`Scenario Name`) / Group |
| **Test Case Description** | Mô tả mục tiêu kiểm thử | Bắt đầu bằng "Xác minh rằng..." hoặc "Kiểm tra...", rõ ràng, đơn nghĩa | Cột E (`Description`) |
| **Pre-condition** | Tiền điều kiện | Trạng thái hệ thống, tài khoản đăng nhập, dữ liệu có sẵn trước khi thực hiện | Cột F (`Pre-condition`) |
| **Test Case Procedure** | Các bước thực hiện | Đánh số thứ tự (Step 1, Step 2, Step 3...), ghi rõ thao tác và dữ liệu nhập cụ thể | Cột G (`Test Case Procedure`) |
| **Expected Output** | Kết quả mong đợi | Đánh số thứ tự tương ứng hoặc nêu rõ kết quả quan sát được, trạng thái màn hình, thông báo lỗi | Cột H (`Expected Results`) |

---

## 4. Ràng buộc cứng (Hard Constraints)

- **Closed-World Assumption**: Chỉ sử dụng thông tin đã được cung cấp hoặc xác nhận trong tài liệu/ngữ cảnh. Tuyệt đối không tự bịa thêm quy tắc nghiệp vụ
- **Hỏi trước khi viết**: Khi thiếu thông tin quan trọng hoặc logic mâu thuẫn, phải nêu câu hỏi làm rõ trước khi tạo test case
- **Rõ ràng và khả thi**: Mỗi test case phải có dữ liệu cụ thể, các bước thao tác rõ ràng và kết quả có thể đo lường/quan sát được
- **Không trùng lặp**: Tránh các test case trùng lặp bản chất hoặc chỉ khác cách hành văn
- **Ưu tiên phát hiện lỗi thực tế**: Tập trung vào các ca biên, điều kiện kết hợp và điểm dễ phát sinh lỗi
- **Tách riêng giả định**: Mọi giả định cần thiết phải được liệt kê riêng và chờ người dùng xác nhận
- **Quy chuẩn văn phong QA-skill**:
  - Không có dấu chấm `.` ở cuối các câu mô tả, tiền điều kiện, bước thực hiện hay kết quả mong đợi
  - Không sử dụng emoji hoặc icon trong nội dung test case
  - Sử dụng tiếng Việt chuẩn cho phần mô tả và nội dung kiểm thử


---

## 5. Quy trình phân tích và thiết kế theo 4 nhóm kỹ thuật ISTQB CTAL

Áp dụng khi người dùng yêu cầu phân tích yêu cầu nghiệp vụ và thiết kế test case theo phương pháp Black-box Testing chuẩn ISTQB CTAL Test Analyst.

### Bước 1 — Phân tích context

- Đọc yêu cầu nghiệp vụ, User Story, BRD/SRS hoặc API Documentation
- Xác định chức năng, actor, input, output, business rules và các trạng thái dữ liệu
- Liệt kê thông tin còn thiếu hoặc mâu thuẫn
- Hỏi lại trước khi implement — không tự suy diễn nghiệp vụ
- Khi không có BRD/SRS dùng được và người dùng yêu cầu khôi phục hành vi từ code: dùng `static-requirements-analysis` → `references/SOURCE_SPEC_MINING.md`; mệnh đề rút từ code chỉ là `candidate` (EXTRACTED/INFERRED/AMBIGUOUS) và phải được chủ nghiệp vụ xác nhận trước khi thành expected result

### Bước 2 — Chọn kỹ thuật kiểm thử

Xác định kỹ thuật phù hợp theo 4 nhóm, giải thích lý do lựa chọn ngắn gọn:

| Nhóm | Kỹ thuật trong nhóm | Chọn khi |
|---|---|---|
| **Data-Based** | Domain Testing, Combinatorial/Pairwise, Random Testing | Input có miền, ràng buộc, nhiều field kết hợp |
| **Behavior-Based** | CRUD Testing, State Transition, Scenario-Based | Feature có lifecycle, trạng thái hoặc luồng đa bước |
| **Rule-Based** | Decision Table, Metamorphic Testing | Điều kiện logic kết hợp hoặc không có oracle |
| **Experience-Based** | Session-Based, Checklist-Based, Crowd Testing | Khám phá, review nhanh hoặc môi trường đa dạng |

Không áp dụng máy móc tất cả kỹ thuật. Chỉ chọn kỹ thuật thực sự phù hợp với đặc điểm chức năng.

### Bước 3 — Thiết kế test case

Bao gồm đủ 5 loại:
- **Positive**: Happy path và alternative flows
- **Negative**: Input sai, vi phạm validation, lỗi dữ liệu
- **Boundary**: Giá trị tại biên và vượt biên
- **Business Rules**: Thỏa mãn và vi phạm từng quy tắc nghiệp vụ
- **Edge/Risk**: Race condition, timeout, dữ liệu bất thường, phân quyền

### Bước 4 — Review chất lượng

Review từng case theo 9 tiêu chí (Correctness, Feasibility, Necessity, Precision, Understandability, Completeness, Traceability, Consistency, Conciseness) trong [testcase-quality-review.md](testcase-quality-review.md)

Trước khi hoàn tất, tự review:
- Expected result có căn cứ từ spec không? Nếu không → đánh dấu `review_required`
- Có scenario bị thiếu (coverage gap) không?
- Có test case trùng lặp bản chất không?
- Có rủi ro về dữ liệu, phân quyền, side effects không?
- Code/test có tuân thủ framework và dễ maintain không?

---

## 6. Định dạng đầu ra chuẩn 4 phần

### Phần 1 — Phân tích chức năng và business rules

Trình bày:
- Tổng quan chức năng, actor và mục tiêu nghiệp vụ
- Danh sách business rules đã xác nhận từ tài liệu
- Input/output và trạng thái dữ liệu
- Dependency và precondition

### Phần 2 — Bảng lựa chọn kỹ thuật kiểm thử

| Nhóm kỹ thuật | Kỹ thuật cụ thể | Lý do lựa chọn | Scenario cần kiểm tra |
|---|---|---|---|
| Data-Based Testing | Domain Testing | Trường tuổi có miền 18–65 | Min-1=17, Min=18, Max=65, Max+1=66 |
| Behavior-Based Testing | CRUD Testing | Feature quản lý đơn hàng | Create/Read/Update/Delete với verify |
| Rule-Based Testing | Decision Table | 3 điều kiện kết hợp → 8 outcome | Ma trận điều kiện đầy đủ |
| Experience-Based Testing | Checklist-Based | Review security baseline trước release | 8 mục security checklist |

### Phần 3 — Bảng test case (6 cột chuẩn)

| ID | Function | Test Case Description | Pre-condition | Test Case Procedure | Expected Output |
|---|---|---|---|---|---|
| TC-01 | Đăng ký | Xác minh rằng... | User ở /register... | 1. Mở /register\n2. ... | 1. Hệ thống... |

Quy tắc:
- ID: tiền tố hệ thống ổn định (AUTH-01, ORD-01, API-01)
- Description: bắt đầu bằng "Xác minh rằng..." hoặc "Kiểm tra..."
- Procedure: đánh số từng bước, ghi rõ thao tác và dữ liệu nhập
- Expected Output: đánh số tương ứng, trạng thái màn hình hoặc thông báo cụ thể
- Không dấu chấm `.` cuối câu, không emoji

### Phần 4 — Thông tin còn thiếu, giả định và rủi ro

Trình bày 3 mục riêng biệt:

**Thông tin còn thiếu / cần làm rõ:**
- [Liệt kê câu hỏi cụ thể cần QA xác nhận trước khi implement]

**Giả định đã đưa ra:**
- [Các giả định bắt buộc để tiếp tục — cần QA xác nhận]

**Rủi ro kiểm thử:**
- [Rủi ro về dữ liệu, phân quyền, dependency, side effects, môi trường]
