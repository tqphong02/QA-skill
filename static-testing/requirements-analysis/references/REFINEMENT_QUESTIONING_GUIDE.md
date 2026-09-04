# Refinement Questioning Guide & Khung 5W1H cho QA

> Hướng dẫn tư duy phản biện, đặt câu hỏi đào sâu trong các buổi Refinement và kỹ thuật phân tích tĩnh yêu cầu (Static Testing) ở giai đoạn Upstream.

---

## 1. Thay đổi tư duy: Từ "Hỏi AC" sang "Dự đoán rủi ro"

Trong các buổi Backlog Refinement truyền thống, câu hỏi quen thuộc nhất của QA thường là:
> *"Acceptance Criteria (Tiêu chí chấp nhận) của tính năng này là gì?"*

Đây là câu hỏi cần thiết, nhưng **chưa đủ để bảo vệ chất lượng phần mềm**. Acceptance Criteria thường chỉ phản ánh "Happy Path" (kịch bản lý tưởng) mà Product Owner (PO) hình dung. 

### Câu hỏi cốt lõi làm thay đổi cục diện:
> **"Chuyện gì sẽ xảy ra khi tính năng này gặp lỗi hoặc đi sai hướng?"**  
> *(What happens when this goes wrong?)*

### 3 lý do câu hỏi này thay đổi cuộc chơi:
1. **Khai thác 80% lỗi tiềm ẩn**: Đa số bug nghiêm trọng trên Production không nằm ở luồng chính, mà nằm ở nhánh ngoại lệ: mất mạng, timeout, dữ liệu rỗng, xung đột đồng thời, hệ thống bên thứ ba phản hồi chậm hoặc chết hẳn.
2. **Kích hoạt tư duy phòng thủ (Defensive Thinking)**: Buộc PO, Solution Architect và Developer phải đối mặt với các kịch bản chưa được lường trước ngay từ khi ticket còn nằm trên giấy.
3. **Kinh tế học Shift-Left (Phát hiện sớm - Chi phí thấp)**:
   - Phát hiện thiếu sót ở Refinement: Tốn **5 – 10 phút thảo luận** để thống nhất rule.
   - Phát hiện khi Dev đang code: Tốn **nhiều giờ refactor** kiến trúc.
   - Phát hiện khi QA test: Tốn **vài ngày re-open ticket, re-test, delay sprint**.
   - Để lọt lên Production: Tốn **hàng ngàn USD, khủng hoảng truyền thông, mất uy tín khách hàng**.

### Tác động của AI đối với công việc QA:
- Các công cụ AI (Copilot, ChatGPT, v.v.) có thể viết code và sinh testcase cho Happy Path cực nhanh, nhưng **AI không có trực giác nghi ngờ và không biết chủ động thắc mắc về các kịch bản bị bỏ quên**.
- AI tạo ra các câu trả lời sai hoặc logic thiếu sót nhưng với phong thái **rất tự tin và thuyết phục** (hallucination).
- Do đó, vai trò của QA không hề bị thu hẹp mà **dịch chuyển mạnh mẽ lên giai đoạn sớm hơn (Upstream Testing)**: Giá trị lớn nhất của QA nằm ở **tư duy phản biện, khả năng nhìn thấy điểm mù và việc đặt đúng câu hỏi trước khi viết một dòng code nào**.

---

## 2. 5 Câu hỏi Đào sâu Cốt lõi trong Refinement

Bên cạnh câu hỏi chính *"Chuyện gì sẽ xảy ra khi gặp lỗi?"*, Senior QA cần sử dụng bộ 5 câu hỏi đào sâu sau đây:

### Q1. "Chuyện gì sẽ xảy ra khi tính năng này gặp lỗi hoặc đi sai hướng?"
*(What happens when this goes wrong?)*
- **Mục tiêu**: Bóc trần các nhánh ngoại lệ, phục hồi và xử lý lỗi.
- **Các câu hỏi đào sâu**:
  - Mất mạng giữa chừng khi đang submit form/thanh toán thì frontend xử lý thế nào? Có cơ chế idempotent để tránh trừ tiền 2 lần không?
  - API bên thứ ba (Cổng thanh toán, SMS OTP, AI service) timeout hoặc trả về HTTP 500 thì người dùng thấy gì? Có retry không hay fail ngay?
  - Khi một giao dịch gồm nhiều bước bị lỗi ở bước cuối, hệ thống có tự động rollback (bồi hoàn) dữ liệu không hay để lại dữ liệu rác?

### Q2. "Ai là người dùng mà chúng ta chưa nghĩ tới?"
*(Who are the forgotten users?)*
- **Mục tiêu**: Khai thác các tệp người dùng thiểu số hoặc điều kiện biên đặc biệt mà PO thường bỏ sót.
- **Các câu hỏi đào sâu**:
  - Người dùng ở vùng sóng yếu (3G, tầng hầm, thang máy) có bị treo app khi load dữ liệu lớn không?
  - Người dùng khiếm thị hoặc suy giảm thị lực có dùng được tính năng này qua Screen Reader không (Accessibility / WCAG)? Độ tương phản màu sắc có đạt chuẩn không?
  - Người dùng sử dụng thiết bị đời cũ, màn hình nhỏ, hoặc độ phân giải đặc biệt có bị vỡ giao diện hay che mất nút bấm chính không?
  - Kẻ xấu (Malicious Actor): Người dùng cố tình spam click, truyền script injection hoặc dùng công cụ tự động gọi API trực tiếp thì hệ thống có chặn (rate-limit, sanitize) không?

### Q3. "Định nghĩa 'Hoàn thành' (Done) ở đây thực sự nghĩa là gì đối với người dùng?"
*(What does Done actually mean to the end user?)*
- **Mục tiêu**: Phân biệt giữa **Technical Done** (Xong về mặt kỹ thuật) và **User-perceived Done** (Cảm nhận hoàn thành của người dùng).
- **Các câu hỏi đào sâu**:
  - Backend ghi dữ liệu vào DB và trả về `HTTP 200` đã được coi là xong chưa? Người dùng đã thực sự nhìn thấy trạng thái thay đổi trên màn hình chưa?
  - Với các tác vụ bất đồng bộ (Async Job/Export/Import), khi nào người dùng mới nhận được kết quả cuối cùng? Có thanh tiến trình (progress bar), email hay push notification thông báo không?
  - Người dùng có thể ngay lập tức sử dụng dữ liệu vừa tạo cho bước tiếp theo không, hay phải chờ hệ thống đồng bộ (Eventual Consistency lag)?

### Q4. "Có kịch bản nào nhìn như xong nhưng thực ra chưa hoàn thiện không?"
*(What looks done but is an illusion?)*
- **Mục tiêu**: Phát hiện các ảo giác hoàn thành (Illusion of Done), trạng thái không nhất quán giữa Client và Server.
- **Các câu hỏi đào sâu**:
  - **Optimistic UI Rollback**: Giao diện hiển thị trạng thái "Đã like / Đã lưu" ngay lập tức để tạo cảm giác mượt, nhưng nếu request backend bị lỗi thì UI có rollback trạng thái cũ và báo cho người dùng biết không?
  - **Cache Stale**: Người dùng vừa chỉnh sửa thông tin thành công, nhưng khi F5 lại trang vẫn thấy thông tin cũ do CDN hoặc Redis cache chưa invalidate?
  - **Background Worker Stuck**: Màn hình thông báo "Yêu cầu đang được xử lý", nhưng nếu queue worker chết ngầm thì người dùng có bị kẹt ở trạng thái loading vô tận không?

### Q5. "Mức độ ảnh hưởng là gì nếu tính năng này bị lỗi suốt 1 tuần mà không ai phát hiện?"
*(What is the blast radius if this fails silently for a week?)*
- **Mục tiêu**: Đánh giá rủi ro lỗi âm thầm (Silent Failures), khả năng giám sát (Observability) và thời gian phát hiện lỗi (MTTD - Mean Time To Detect).
- **Các câu hỏi đào sâu**:
  - Có kịch bản lỗi nào không văng HTTP 500 nhưng gây sai lệch dữ liệu ngầm không (ví dụ: tính sai thuế, gửi thiếu email khuyến mãi, bỏ sót record kế toán)?
  - Nếu sự cố xảy ra, làm thế nào để team phát hiện trong vòng **15 phút** thay vì chờ khách hàng gọi điện lên tổng đài sau 1 tuần?
  - Cần có log, metric, alert, hay reconciliation job (đối soát tự động) nào chạy định kỳ để giám sát tính năng này trên Production?

---

## 3. Khung 5W1H dành cho QA trong Phân tích Yêu cầu

Khung **5W1H** là lăng kính toàn diện giúp QA quét sạch các góc khuất của một User Story / Requirement trước khi triển khai:

```
                  ┌──────────────┐
                  │    5W1H      │
                  │   CHO QA     │
                  └──────┬───────┘
     ┌──────────┬────────┼────────┬──────────┬──────────┐
     ▼          ▼        ▼        ▼          ▼          ▼
   WHO        WHAT     WHEN     WHERE       WHY        HOW
 (Chủ thể)  (Hành vi) (Thời điểm) (Vị trí) (Mục đích) (Cơ chế)
```

### 1. WHO (Ai?)
- **Actor chính**: Ai là người dùng trực tiếp thực hiện tính năng này?
- **Actor liên quan**: Những role/phòng ban nào khác bị ảnh hưởng (Kế toán, CSKH, Quản trị viên, Pháp chế)?
- **Phân quyền (RBAC)**: Ai có quyền Xem, Tạo, Sửa, Xoá, Phê duyệt? Ai bị cấm tuyệt đối?
- **Đối tượng chưa lường trước**: Ai là người dùng mạng yếu, người dùng cần trợ năng (accessibility), hoặc kẻ xấu cố tình phá hoại?

### 2. WHAT (Cái gì?)
- **Mục tiêu tính năng**: Tính năng này cung cấp giá trị gì cụ thể (Happy Path)?
- **Phạm vi loại trừ (Out-of-Scope)**: Cái gì **chắc chắn không làm** trong giai đoạn này để tránh scope creep?
- **Dữ liệu & Biên giá trị**: Kiểu dữ liệu, độ dài, định dạng, ký tự đặc biệt, giá trị rỗng (`null`/`undefined`), giá trị biên âm/dương?
- **Dữ liệu nhạy cảm**: Có thông tin cá nhân (PII), mật khẩu, số thẻ ngân hàng cần che mờ (masking) hay mã hóa không?
- **Hành vi khi lỗi**: Gặp sự cố thì trả về thông điệp gì? Thông báo lỗi có thân thiện với người dùng và không làm lộ cấu trúc hệ thống (stack trace) không?

### 3. WHEN (Khi nào?)
- **Thời điểm kích hoạt**: Điều kiện tiên quyết (Preconditions) nào phải thỏa mãn trước khi bắt đầu?
- **Thời điểm kết thúc**: Khi nào tính năng được xem là hoàn tất toàn bộ chu trình?
- **Đồng thời (Concurrency & Race Condition)**: Chuyện gì xảy ra khi 2 người cùng thao tác trên 1 bản ghi tại cùng một giây? Người dùng bấm nút submit liên tiếp 2 lần (Double-click)?
- **Thời hạn & Hết hạn**: Session hết hạn, token hết hạn, link kích hoạt hết hạn sau bao lâu?
- **Hiệu lực**: Quy tắc nghiệp vụ này áp dụng từ ngày nào, múi giờ nào?

### 4. WHERE (Ở đâu?)
- **Môi trường & Kênh**: Tính năng chạy trên Web, Mobile App, Tablet, hay tích hợp qua API bên thứ ba?
- **Nguồn chân lý (Single Source of Truth)**: Dữ liệu này được lưu chính thức ở đâu (Database quan hệ, NoSQL, Cache Redis, ElasticSearch)?
- **Điểm nghẽn rủi ro (Points of Failure)**: Lỗi có khả năng phát sinh ở tầng nào (Client UI, API Gateway, Microservice, Message Queue, Database, hay 3rd-party)?
- **Giám sát ở đâu**: Log lỗi, correlation ID, metrics được ghi ở đâu để QA và DevOps có thể truy vết khi xảy ra sự cố?

### 5. WHY (Tại sao?)
- **Mục đích nghiệp vụ**: Tại sao doanh nghiệp cần tính năng này? Nó giải quyết bài toán gì hoặc đo lường bằng chỉ số (KPI/Metric) nào?
- **Lý do ràng buộc**: Tại sao lại có rule này (Ví dụ: Tại sao timeout phải là 30s? Tại sao mật khẩu phải có ký tự đặc biệt?) — Có quy định pháp lý (compliance) nào chi phối không?
- **Lý do bỏ cuộc (Drop-off)**: Tại sao người dùng có thể huỷ ngang hoặc thoát giữa chừng? Khi họ thoát thì trạng thái dữ liệu lưu tạm thế nào?

### 6. HOW (Như thế nào?)
- **Trải nghiệm người dùng (UX Flow)**: Người dùng thao tác qua từng bước như thế nào? Các trạng thái Loading, Empty, Error, Disabled hiển thị ra sao?
- **Cơ chế phục hồi (Recovery/Compensate)**: Khi hệ thống gặp sự cố mạng hoặc crash ứng dụng, làm thế nào để người dùng tiếp tục mà không phải nhập lại từ đầu?
- **Khả năng kiểm thử (Testability)**: Làm thế nào để QA giả lập được các trường hợp khó (mạng chập chờn, tài khoản hết hạn, bên thứ 3 chết)? Có tool hoặc mock service hỗ trợ không?

---

## 4. Cheat-Sheet: Bảng phản xạ nhanh cho QA trong phòng họp

Khi PO vừa trình bày xong một User Story ngắn trong buổi Refinement, QA có thể dùng bảng phản xạ nhanh sau để đặt câu hỏi:

| Tình huống / Dạng Story | Câu hỏi phản xạ nhanh của QA | Rủi ro nếu không hỏi |
|---|---|---|
| **Form nhập liệu & Submit** | *"Nếu người dùng bấm nút 2 lần thật nhanh, hoặc mất mạng ngay lúc bấm, hệ thống xử lý thế nào?"* | Trùng lặp đơn hàng, trừ tiền 2 lần, crash client |
| **Tích hợp bên thứ 3 (Payment, SMS, AI)** | *"Nếu service bên thứ 3 phản hồi chậm 10s hoặc trả về lỗi, màn hình hiển thị gì và có cơ chế retry/fallback không?"* | Người dùng bị treo màn hình loading, mất giao dịch |
| **Xử lý Async / Batch / Import** | *"Nếu file import 10.000 dòng có 1 dòng bị lỗi ở giữa thì huỷ cả file hay import các dòng còn lại? Làm sao người dùng biết dòng nào lỗi?"* | Dữ liệu rác một phần, khách hàng hoang mang |
| **Cập nhật dữ liệu quan trọng** | *"Nếu tính năng này tính sai tiền mà không văng lỗi 500, chúng ta có công cụ gì để phát hiện trong ngày đầu tiên không?"* | Thất thoát tài chính kéo dài hàng tuần |
| **Phân quyền / User Role** | *"Nếu một user copy trực tiếp đường link API này và gọi bằng Postman mà không qua màn hình UI, hệ thống có chặn không?"* | Lỗ hổng bảo mật leo thang đặc quyền (BOLA/IDOR) |
| **Xóa hoặc Huỷ dữ liệu** | *"Dữ liệu bị xoá là Soft-delete (ẩn đi) hay Hard-delete (xoá vĩnh viễn khỏi DB)? Lịch sử audit log lưu ở đâu?"* | Mất dữ liệu vĩnh viễn, vi phạm quy định kế toán/pháp lý |

---

## 5. Nguyên tắc vàng khi QA đặt câu hỏi

1. **Hỏi kèm Giải pháp gợi ý (Proposed Assumption)**:  
   Không bao giờ chỉ hỏi cộc lốc: *"Chỗ này lỗi thì làm sao?"*.  
   Hãy hỏi kèm đề xuất: *"Nếu API bên thứ ba timeout, em đề xuất hệ thống retry tối đa 3 lần cách nhau 2s, nếu vẫn lỗi thì báo lỗi thân thiện 'Vui lòng thử lại sau' và hoàn tiền tự động. Anh/chị PO thấy hướng này ổn không?"*.
2. **Ghi nhận quyết định thành văn bản (Source of Truth)**:  
   Mọi câu trả lời trong buổi họp phải được cập nhật ngay vào User Story hoặc bảng Q&A. Không chấp nhận "nói miệng" rồi quên khi vào Sprint.
3. **Phân biệt Blocking Question vs Non-blocking**:  
   - Câu hỏi ảnh hưởng đến luồng chính hoặc cấu trúc dữ liệu: **Bắt buộc chốt trước khi Sprint Planning (Blocking)**.
   - Câu hỏi chi tiết về câu chữ thông báo lỗi nhỏ: Có thể chốt trong Sprint (Non-blocking).
