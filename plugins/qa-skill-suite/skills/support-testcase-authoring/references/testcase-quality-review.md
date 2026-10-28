# Testcase Quality Review - 9 tiêu chí chất lượng kịch bản kiểm thử

> Khi nào đọc: ở bước Review chất lượng (Bước 4) trước khi bàn giao testcase, và khi review testcase do người khác viết. Nguồn định nghĩa: 9 tiêu chí chất lượng test case do QA cung cấp, đối chiếu thuộc tính bắt buộc theo ISO/IEC/IEEE 29119-3. Kết quả review ghi theo từng case: `OK`, `FIX` (kèm lý do) hoặc `ASK` (cần QA xác nhận). Không tự sửa expected result khi chưa có căn cứ nguồn

## Nhóm 1 - Tính đúng đắn và khả thi

| # | Tiêu chí | Giải thích | Ví dụ thực tế | Câu hỏi kiểm tra | Dấu hiệu lỗi |
|---|---|---|---|---|---|
| 1 | Correctness (Tính chính xác) | Test case xác thực chính xác các điều kiện kiểm thử (test conditions) làm cơ sở cho nó | Tính phí giao hàng: kết quả kỳ vọng phải khớp công thức trong tài liệu nghiệp vụ, ví dụ đơn trên 500.000 VNĐ được miễn phí vận chuyển | Expected có trích được từ BRD/SRS/AC/API doc không? `bb_technique` có đúng bản chất (biên đúng giá trị, đủ cột bảng quyết định)? | Expected suy diễn, thông báo lỗi tự đặt, biên lệch 1 đơn vị |
| 2 | Feasibility (Tính khả thi) | Có khả năng thực thi trong thực tế về kỹ thuật, môi trường, dữ liệu và quyền hạn | Không yêu cầu đăng nhập Super Admin nếu môi trường test không cấp quyền hoặc không hỗ trợ khởi tạo tài khoản đó | QA khác có thực hiện được bằng đúng pre-condition, role và data đã nêu không? | Thiếu tài khoản/role, dữ liệu không tồn tại, bước phụ thuộc case khác |
| 3 | Necessity (Tính cần thiết) | Mỗi case bao phủ một mục tiêu kiểm thử rõ ràng, thể hiện qua tiêu đề hoặc tóm tắt; tránh case trùng lặp; không thiết kế cho đối tượng ngoài phạm vi kiểm thử | Không viết 5 case nhập các tên khác nhau (`An`, `Bình`, `Cường`) khi logic hệ thống không xử lý đặc biệt cho từng tên | Case có phát hiện defect mà case khác chưa phát hiện được không? | Cùng partition hoặc cùng biên chỉ khác dữ liệu; case `additional` đội lốt requirement |

## Nhóm 2 - Độ rõ ràng và hoàn thiện

| # | Tiêu chí | Giải thích | Ví dụ thực tế | Câu hỏi kiểm tra | Dấu hiệu lỗi |
|---|---|---|---|---|---|
| 4 | Understandability (Tính dễ hiểu) | Người không phải tác giả vẫn review, sửa và thực thi được; dùng ngôn ngữ và định dạng mọi stakeholder hiểu; case phức tạp phải đơn giản hóa hoặc chia nhỏ | Thay vì một kịch bản 30 bước liên tục, tách thành 3 case ngắn theo luồng: Đăng ký, Chọn hàng, Thanh toán | Người mới đọc có hiểu mục tiêu ngay từ Description không? | Description không bắt đầu bằng "Xác minh rằng..." hoặc "Kiểm tra...", viết tắt không giải thích, case quá dài |
| 7 | Precision (Tính rõ ràng, độ chính xác) | Chỉ có một cách hiểu duy nhất để tránh false-positive hoặc false-negative; tránh từ mơ hồ như "phù hợp", "khi cần thiết", "một vài" | Thay "Chờ hệ thống phản hồi trong thời gian vừa đủ" bằng "Màn hình hiển thị thông báo thành công trong vòng tối đa 2 giây" | Mỗi bước là một hành động với input cụ thể? Expected quan sát và đo được? | Từ mơ hồ, "dữ liệu hợp lệ" không nêu giá trị, "hiển thị đúng" |
| 8 | Completeness (Tính đầy đủ) | Đủ mọi thuộc tính bắt buộc theo ISO/IEC/IEEE 29119-3, gồm dữ liệu kiểm thử cần thiết và kết quả mong đợi rõ ràng để so sánh với kết quả thực tế | Ghi rõ Precondition (tài khoản A có số dư 1.000.000 VNĐ), Input (chuyển 200.000 VNĐ) và Expected Output (báo chuyển tiền thành công, số dư tài khoản A còn 800.000 VNĐ) | Đủ ID, Description, Pre-condition, Procedure, Expected, dữ liệu? Đủ positive, negative, boundary, business rule, RBAC? Mọi `COV-*` đều có case? | Thiếu precondition hoặc số liệu, nhóm FUNCTION không có `happy` đầu tiên, thiếu biên min-1 hoặc max+1 |

## Nhóm 3 - Bảo trì và tổ chức

| # | Tiêu chí | Giải thích | Ví dụ thực tế | Câu hỏi kiểm tra | Dấu hiệu lỗi |
|---|---|---|---|---|---|
| 5 | Traceability (Tính truy xuất nguồn gốc) | Truy ngược được điều kiện kiểm thử, yêu cầu (requirements) và rủi ro (risks) để dễ cập nhật khi có thay đổi | Gắn mã `REQ-PAY-01` vào case `TC_PAY_01` trên Jira; khi PO đổi `REQ-PAY-01`, Tester biết ngay case nào cần cập nhật | Case truy ngược được về requirement, `COV-*` và nguồn (mục, trang, ticket)? | `req` sai hoặc trống, `coverage_item_refs` thiếu, ID đổi giữa các lần sinh |
| 6 | Consistency (Tính nhất quán) | Nhất quán về ngôn ngữ, định dạng và cấu trúc; dùng Bảng thuật ngữ (Glossary) khi cần | Thống nhất thuật ngữ "Thanh toán" (Checkout/Payment) toàn tài liệu, không lúc "Thanh toán", lúc "Trả tiền", "Giao dịch" | Thuật ngữ, tên field, thông báo lỗi, định dạng ID, ngôn ngữ giống nhau xuyên suốt? Markdown, manifest, Excel khớp nhau? | Một field gọi hai tên, ID khác tiền tố, Excel lệch Markdown |
| 9 | Conciseness (Tính súc tích, độ gọn gàng) | Mức chi tiết (granularity) tương ứng cơ sở kiểm thử và điều kiện kiểm thử; ưu tiên case nhỏ tập trung một mục tiêu để dễ tìm nguyên nhân lỗi, linh hoạt ghép thành bộ test, và một case fail không làm block các case khác | Tách luồng chuyển tiền thành `TC_01: Kiểm tra hạn mức`, `TC_02: Kiểm tra số dư` thay vì gộp 1 case khổng lồ khiến bước 1 hỏng chặn toàn bộ các bước sau | Mỗi case chỉ một mục tiêu? Bước lặp, precondition dài dòng có bỏ được không? Có dùng `execution_templates` được mà copy không? | Case khổng lồ nhiều mục tiêu, bước lặp lại, case trùng lặp |

Lưu ý ranh giới: Conciseness yêu cầu case nhỏ và tập trung, còn Necessity yêu cầu không trùng lặp. Chia nhỏ theo mục tiêu khác nhau là đúng; chia nhỏ chỉ để đổi dữ liệu trong cùng partition là vi phạm Necessity

## Từ khóa (Keywords Matrix)

| Thuật ngữ (EN) | Tiếng Việt | Giải thích ngắn | Ví dụ thực tế |
|---|---|---|---|
| Correctness | Tính chính xác | Case xác thực đúng điều kiện kiểm thử | Kết quả kỳ vọng tính đúng công thức thuế 10% |
| Feasibility | Tính khả thi | Có thể thực hiện trong thực tế | Môi trường test cấp đủ quyền hạn để thực thi các bước |
| Necessity | Tính cần thiết | Mục tiêu rõ ràng, không trùng lặp hay thừa | Loại bỏ các case trùng lặp kiểm tra cùng một giá trị biên |
| Understandability | Tính dễ hiểu | Ngôn ngữ và định dạng rõ ràng cho mọi stakeholder | Câu lệnh rõ ràng, không dùng từ viết tắt vô lý hay cấu trúc quá phức tạp |
| Traceability | Tính truy xuất nguồn gốc | Liên kết case với yêu cầu, điều kiện test và rủi ro | Liên kết `TC_01` với `REQ_LOGIN` trên Jira để theo dõi khi yêu cầu thay đổi |
| Consistency | Tính nhất quán | Thống nhất cấu trúc, thuật ngữ và định dạng | Dùng chung thuật ngữ "Giỏ hàng" (Shopping Cart) toàn bộ tài liệu test |
| Precision | Tính rõ ràng | Chỉ có một cách hiểu duy nhất, tránh từ ngữ mơ hồ | Thay "chờ một lúc" bằng "hệ thống phản hồi trong vòng 3 giây" |
| Completeness | Tính đầy đủ | Đủ thuộc tính, tiền điều kiện, dữ liệu test và kết quả kỳ vọng | Ghi rõ số dư tài khoản trước test và số dư kỳ vọng sau khi thực hiện giao dịch |
| Conciseness | Tính súc tích | Kích thước case gọn gàng, tập trung vào mục tiêu cụ thể | Chia case lớn thành các bài test nhỏ để không bị gián đoạn khi một bước fail |

## Nguyên tắc áp dụng thực tế

Định dạng và mức độ chi tiết của kịch bản phụ thuộc bối cảnh dự án, sản phẩm và phải được thống nhất trong nội bộ đội kiểm thử (test team). Khi dự án đã có quy ước riêng, ưu tiên quy ước đó và ghi rõ chỗ khác biệt thay vì ép lại theo tài liệu này

## Quy trình review

1. Chạy generator và `scripts/coverage-report.py`, xử lý mọi lỗi fail-closed trước khi review thủ công
2. Duyệt từng case theo 9 tiêu chí, đánh dấu `OK`, `FIX` hoặc `ASK`
3. Gom mọi `ASK` thành danh sách câu hỏi cho QA ở Phần 4 của đầu ra; không đoán expected
4. Sửa nguồn JSON rồi sinh lại; không sửa riêng Markdown hoặc Excel
5. Báo cáo: số case theo `OK`/`FIX`/`ASK`, tiêu chí nào còn rủi ro, phần nào chưa kiểm chứng

## Mẫu báo cáo review

| ID | Correct | Feasible | Necessary | Understandable | Precise | Complete | Traceable | Consistent | Concise | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | OK | OK | OK | OK | OK | OK | OK | OK | OK | |
| AUTH-07 | ASK | OK | OK | OK | FIX | OK | OK | OK | OK | Thông báo lỗi chưa có trong AC3; bước 4 ghi "chờ một lúc" |

Giới hạn: Correctness và Necessity cần QA xác nhận; AI chỉ phát hiện dấu hiệu, không thay QA quyết định
