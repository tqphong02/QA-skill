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
| `Retest <Plane URL>` | plane-qa → qa-run → plane-qa | Doctor đúng workspace, chạy đủ RETEST_PLUS, comment ngắn, state theo verdict |
| `Retest failed ticket ABC-1` | plane-qa + qa-run | FAILED, comment Actual/Expected, kéo `In Progress` |
| `Retest pass ticket ABC-1` | plane-qa + qa-run | PASS, comment Result/Conclusion, kéo `Done` |
| `Test feature này không có doc/testcase` | qa-run | Đọc guide khớp feature nếu có, vẫn chạy exploratory/ad-hoc/UI/UX, cập nhật business guide sau run |
| `Khám phá tổng thể web app này` | qa-run | Chạy APP_BASELINE_DISCOVERY, tạo app-business-guide.md với coverage_map và feature guide cho vùng đã khám phá sâu |
| `Viết testcase login` | testcase-template | Tạo Markdown testcase đầy đủ trước Excel, ID/content khớp, lần sau đọc Markdown trước |
| `Viết testcase API từ swagger.json` | testcase-template | Chạy importer, kiểm tra `review_required`, chỉ gen Excel khi contract đủ, không bịa status |
| `Đọc BRD này, vẽ business flow XMind và tạo Q&A` | doc-to-md → business-analysis | Convert Markdown trước, review đủ 18 vùng, sinh `.xmind`, Q&A `.md` và `.xlsx` có ID khớp |
| `Update Google Sheet <URL>` | google-drive-qa | Resolve exact ID, dùng Drive MCP, update đúng range, read-back |
| `Log bug mới lên Plane <URL>` | plane-qa | Doctor URL workspace, dry-run, tạo ở `Todo`, read-back |

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
