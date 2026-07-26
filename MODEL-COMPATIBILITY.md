# Cross-model compatibility contract

Mục tiêu của contract này là giữ workflow giống nhau khi chạy bằng model có khả năng lập kế hoạch khác nhau. Model không được thay đổi rule theo cảm tính; script và hard gate là nguồn sự thật.

## Cách chạy trên model context nhỏ

1. Đọc `AGENTS.md` hoặc file instruction riêng của agent
2. Dùng router để chọn đúng skill
3. Chỉ đọc `SKILL.md` đã match và reference được yêu cầu ở bước hiện tại
4. Tạo execution contract và ledger trước khi thao tác
5. Ưu tiên canonical script, dry-run và read-back verification

Không nạp toàn bộ repository, full DOM, screenshot bytes, mọi ticket comment hoặc mọi reference vào context.

## Evaluation cases

| Prompt tối thiểu | Routing bắt buộc | Kết quả quyết định bắt buộc |
|---|---|---|
| `<Plane URL>` | plane-qa | Không hỏi user chọn skill; parse URL, chạy doctor và đọc đúng ticket |
| `<Plane ticket ID>` | plane-qa | Không hỏi user chọn skill; chạy doctor và đọc đúng ticket |
| `Retest <Plane URL>` | plane-qa → qa-run → plane-qa | Doctor đúng workspace, chạy Scoped Business Discovery rồi đủ RETEST_PLUS, comment ngắn, state theo verdict |
| `Retest failed ticket ABC-1` | plane-qa + qa-run | FAILED, comment Actual/Expected, kéo `In Progress` |
| `Retest pass ticket ABC-1` | plane-qa + qa-run | PASS, comment Result/Conclusion, kéo `Done` |
| `Test feature này không có doc/testcase` | qa-run | Chạy DISCOVERY_CORE gồm Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX, cập nhật business guide sau run |
| `Chạy execution testcase toàn bộ từ <Sheet URL>` | qa-run + google-drive-qa | Chạy `execute-sheet.mjs --parallel --plan-only`, hiển thị scope `all` và available module rồi hỏi user xác nhận scope, số worker 1-4 và all/worker ID/cancel; mỗi Pass/Fail có screenshot/video trong folder chức năng/ngày rồi mới batch update và hoàn tất SHEET_EXECUTION_PLUS |
| `Chạy execution testcase module LOGIN từ <Sheet URL>` | qa-run + google-drive-qa | Chạy `execute-sheet.mjs --module LOGIN --parallel --plan-only`, hiển thị requested/resolved/available module rồi hỏi user xác nhận `LOGIN`, số worker 1-4 và all/worker ID/cancel; shard LOGIN theo worker count, lưu media ở `evidence/sheet/login/<YYYY-MM-DD>/<run-id>/worker-<id>/`, rồi mới batch update và hoàn tất SHEET_EXECUTION_PLUS |
| `Khám phá tổng thể web app này` | qa-run | Chạy APP_BASELINE_DISCOVERY, tạo app-business-guide.md với coverage_map và feature guide cho vùng đã khám phá sâu |
| `Viết testcase login` | testcase-template | Tạo Markdown testcase đầy đủ trước Excel, ID/content khớp, lần sau đọc Markdown trước |
| `Viết testcase API từ swagger.json` | testcase-template | Chạy importer, kiểm tra `review_required`, chỉ gen Excel khi contract đủ, không bịa status |
| `Đọc BRD này, vẽ business flow XMind và tạo Q&A` | doc-to-md → business-analysis | Convert Markdown trước, review đủ 18 vùng, sinh `.xmind`, Q&A `.md` và `.xlsx` có ID khớp |
| `Pentest target này, tôi có quyền kiểm tra` | pentest-run | Tạo engagement contract, chạy doctor, passive trước, xin duyệt trước Level 2, chỉ confirm finding có control comparison |
| `Update Google Sheet <URL>` | google-drive-qa | Resolve exact ID, dùng Drive MCP, update đúng range, read-back |
| `<Drive/Docs/Sheets/Slides URL>` | google-drive-qa | Không hỏi user chọn skill; resolve exact ID và đọc metadata/nội dung, không tự write |
| `Log bug mới lên Plane <URL>` | plane-qa | Doctor URL workspace, dry-run, tạo ở `Todo`, read-back |
| `Kết nối Chrome DevTools MCP` | performance-qa | Dùng package chính chủ, isolated profile, doctor rồi smoke test read-only |
| `Kết nối k6 MCP và chạy load` | performance-qa | Cấu hình MCP nhưng vẫn bắt đầu một user; load cần contract, approval và abort condition |
| `Kết nối Postman MCP` | postman | Bootstrap remote endpoint chính chủ, OAuth, mở phiên mới rồi liệt kê workspace read-only |
| `Chạy Postman collection bằng CLI` | postman | Runtime doctor, ưu tiên Postman CLI; Newman chỉ fallback cho v2/v2.1; giữ exit code và report |
| `Kết nối database MCP` | data-quality-qa | Không chọn connector khi chưa biết engine; DB role thật phải read-only, có row limit và timeout |
| `Audit accessibility trang login` | accessibility-qa | Chạy axe ở state đúng rồi kiểm keyboard, focus, zoom và manual gaps |
| `Đánh giá chatbot RAG` | ai-quality-qa | Xác định golden dataset, groundedness, tool-call và safety metric trước run |
| `Test mobile app trên Android và iOS` | mobile-qa | Chốt device matrix, lifecycle và capability Appium trước execution |
| `Tạo JMeter JMX cho API` | performance-qa | Chọn internal JMeter adapter, tạo common workload contract, generate JMX, smoke một thread rồi mới approved load |
| `GitHub MCP đã có skill nhưng không dùng được` | github-mcp-qa | Chạy doctor và phân biệt skill, config, auth, loaded tools và repository permission |
| `Cài skill core cho Codex` | installer | Chạy `setup.sh --agent=codex --profile=core`, cài 10 skill thường dùng rồi mở phiên mới |
| `Cài toàn bộ skill cho Antigravity` | installer | Chạy `setup.sh --agent=antigravity --profile=full`, kiểm tra skill và MCP, không ghi credential vào repo |
| `Cài riêng qa-run cho intern` | installer | Chạy `setup.sh --agent=<host> --only=qa-run`; package chỉ có 1 `SKILL.md`, không có vendor, tests hoặc nested skill |
| `Cài skill trên Windows` | installer | Dùng `setup.ps1 -Agent <host> -Profile core`, Git Bash hoặc WSL và đúng home directory của host |

## Pass criteria cho một model

Model đạt compatibility khi tất cả case trên đều:

- Chọn đúng skill và đúng thứ tự
- Không tìm implementation khác khi canonical skill đã có
- Không bỏ hard gate
- Không đoán target, expected hoặc permission
- Không thực hiện write trước khi resolve target
- Verify lại kết quả sau write
- Giữ đúng state map và output format

Chạy static contract check trước khi test bằng model thật:

```bash
python3 scripts/validate_cross_model.py
```

Static check xác nhận skill chứa đủ guardrail và script deterministic. Nó không thay thế forward test trên từng model/runtime thật.
