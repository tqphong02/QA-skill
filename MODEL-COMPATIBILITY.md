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
| `<Plane URL>` | integration-plane | Không hỏi user chọn skill; parse URL, chạy doctor và đọc đúng ticket |
| `<Plane ticket ID>` | integration-plane | Không hỏi user chọn skill; chạy doctor và đọc đúng ticket |
| `Retest <Plane URL>` | integration-plane → dynamic-web-exploratory → integration-plane | Doctor đúng workspace, chạy Scoped Business Discovery rồi đủ RETEST_PLUS, comment ngắn, state theo verdict |
| `Retest failed ticket ABC-1` | integration-plane + dynamic-web-exploratory | FAILED, comment Actual/Expected, kéo `In Progress` |
| `Retest pass ticket ABC-1` | integration-plane + dynamic-web-exploratory | PASS, comment Result/Conclusion, kéo `Done` |
| `Test feature này không có doc/testcase` | dynamic-web-exploratory | Chạy DISCOVERY_CORE gồm Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX, cập nhật business guide sau run |
| `Chạy execution testcase toàn bộ từ <Sheet URL>` | dynamic-web-exploratory + integration-google-drive | Chạy `execute-sheet.mjs --parallel --plan-only`, hiển thị scope `all` và available module rồi hỏi user xác nhận scope, số worker 1-4 và all/worker ID/cancel; mỗi Pass/Fail có screenshot/video trong folder chức năng/ngày rồi mới batch update và hoàn tất SHEET_EXECUTION_PLUS |
| `Chạy execution testcase module LOGIN từ <Sheet URL>` | dynamic-web-exploratory + integration-google-drive | Chạy `execute-sheet.mjs --module LOGIN --parallel --plan-only`, hiển thị requested/resolved/available module rồi hỏi user xác nhận `LOGIN`, số worker 1-4 và all/worker ID/cancel; shard LOGIN theo worker count, lưu media ở `evidence/sheet/login/<YYYY-MM-DD>/<run-id>/worker-<id>/`, rồi mới batch update và hoàn tất SHEET_EXECUTION_PLUS |
| `Khám phá tổng thể web app này` | dynamic-web-exploratory | Chạy APP_BASELINE_DISCOVERY, tạo app-business-guide.md với coverage_map và feature guide cho vùng đã khám phá sâu |
| `Viết testcase login` | support-testcase-authoring | Tạo Markdown testcase đầy đủ trước Excel, ID/content khớp, lần sau đọc Markdown trước |
| `Viết testcase API từ swagger.json` | support-testcase-authoring | Chạy importer, kiểm tra `review_required`, chỉ gen Excel khi contract đủ, không bịa status |
| `Đọc BRD này, vẽ business flow XMind và tạo Q&A` | support-document-conversion → static-requirements-analysis | Convert Markdown trước, review đủ 18 vùng, sinh `.xmind`, Q&A `.md` và `.xlsx` có ID khớp |
| `Review UI login theo Figma và mobile responsive` | hybrid-ui-ux-review → dynamic-web-exploratory; hybrid-accessibility khi cần | Validate requirement mapping, viewport, interaction states và screenshot/video evidence; live browser phải same-session |
| `Đánh giá release này có go/no-go không` | governance-release-quality | Đọc release packet, kiểm test summary, defect risk, evidence, approvals và exit criteria; thiếu proof là `BLOCKED` |
| `Quét secret, dependency và SBOM readiness cho repo local` | static-supply-chain-security | Chạy redacted local scan; không đọc keychain/registry, finding là `Candidate` cho tới reproduction và control comparison |
| `Thiết kế resilience test khi payment timeout` | dynamic-resilience | Validate steady state, stop condition, rollback, observability, RTO/RPO; active fault injection cần approval |
| `Kiểm tra browser, locale vi-VN, timezone và RTL` | dynamic-compatibility → dynamic-testing/web-exploratory/dynamic-mobile | Tạo matrix có executable case cho browser/device/locale và expected formatting trước live execution |
| `Pentest target này, tôi có quyền kiểm tra` | dynamic-security-pentest | Tạo engagement contract, chạy doctor, passive trước, xin duyệt trước Level 2, chỉ confirm finding có control comparison |
| `Update Google Sheet <URL>` | integration-google-drive | Resolve exact ID, dùng Drive MCP, update đúng range, read-back |
| `<Drive/Docs/Sheets/Slides URL>` | integration-google-drive | Không hỏi user chọn skill; resolve exact ID và đọc metadata/nội dung, không tự write |
| `Log bug mới lên Plane <URL>` | integration-plane | Doctor URL workspace, dry-run, tạo ở `Todo`, read-back |
| `Kết nối Chrome DevTools MCP` | dynamic-performance | Dùng package chính chủ, isolated profile, doctor rồi smoke test read-only |
| `Kết nối k6 MCP và chạy load` | dynamic-performance | Cấu hình MCP nhưng vẫn bắt đầu một user; load cần contract, approval và abort condition |
| `Kết nối Postman MCP` | integration-postman | Bootstrap remote endpoint chính chủ, OAuth, mở phiên mới rồi liệt kê workspace read-only |
| `Chạy Postman collection bằng CLI` | integration-postman | Runtime doctor, ưu tiên Postman CLI; Newman chỉ fallback cho v2/v2.1; giữ exit code và report |
| `Kết nối database MCP` | dynamic-data-quality | Không chọn connector khi chưa biết engine; DB role thật phải read-only, có row limit và timeout |
| `Audit accessibility trang login` | hybrid-accessibility | Chạy axe ở state đúng rồi kiểm keyboard, focus, zoom và manual gaps |
| `Đánh giá chatbot RAG` | dynamic-ai-evaluation | Xác định golden dataset, groundedness, tool-call và safety metric trước run |
| `Test mobile app trên Android và iOS` | dynamic-mobile | Chốt device matrix, lifecycle và capability Appium trước execution |
| `Phân tích white-box function processPayment, tạo unit test và đo coverage` | hybrid-source-coverage → support-testcase-authoring khi cần document | Resolve exact file/class/function, analyze compact, graph bounded, generate Jest/Vitest từ mapping, chạy/import coverage; static candidate vẫn không phải runtime evidence |
| `Tạo JMeter JMX cho API` | dynamic-performance | Chọn internal JMeter adapter, tạo common workload contract, generate JMX, smoke một thread rồi mới approved load |
| `GitHub MCP đã có skill nhưng không dùng được` | integration-github | Chạy doctor và phân biệt skill, config, auth, loaded tools và repository permission |
| `Cài skill core cho Codex` | installer | Chạy `setup.sh --agent=codex --profile=core`, cài 10 skill thường dùng rồi mở phiên mới |
| `Cài toàn bộ skill cho Antigravity` | installer | Chạy `setup.sh --agent=antigravity --profile=full`, kiểm tra skill và MCP, không ghi credential vào repo |
| `Cài riêng dynamic-web-exploratory cho intern` | installer | Chạy `setup.sh --agent=<host> --only=dynamic-web-exploratory`; package chỉ có 1 `SKILL.md`, không có vendor, tests hoặc nested skill |
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
