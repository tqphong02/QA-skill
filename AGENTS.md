<!--
Mirror of ./<skill>/SKILL.md — keep in sync.
7 skills: playwright-pom-automation, qa-run, testcase-template, doc-to-md, business-analysis, plane-qa, google-drive-qa
-->

# QA-skill — Hướng dẫn cho AI coding agent

Repo này phân phối 7 skill Quality Engineering (QE) dùng chung cho nhiều AI coding assistant (Claude Code, Codex, Gemini/Antigravity, Cursor, Windsurf, Copilot). File này được đọc tự động bởi **OpenAI Codex CLI** và các tool khác cũng đọc chuẩn `AGENTS.md`.

## Cross-model deterministic mode

Phần này là hợp đồng thực thi bắt buộc cho mọi model, đặc biệt model nhanh hoặc context nhỏ như Gemini Flash/Pro. Không được bỏ bước vì model nghĩ rằng đã hiểu yêu cầu.

### Router cố định

| Tín hiệu yêu cầu | Skill phải đọc | Hành động đầu tiên |
|---|---|---|
| Plane URL, ticket ID, log bug, comment PASS/FAILED/BLOCKED | `plane-qa/SKILL.md` | Parse URL rồi chạy Plane doctor |
| Retest, re-test, verify bug/ticket | `plane-qa/SKILL.md` + `qa-run/SKILL.md` | Plane doctor/read → RETEST_PLUS |
| App baseline discovery, sanity, regression, exploratory, ad-hoc, UI/UX | `qa-run/SKILL.md` | Đọc app guide rồi feature guide; baseline map business flow tổng thể, retest chỉ chạy scope ảnh hưởng |
| Viết/sửa/review testcase, Scenario ID/Name, hoặc yêu cầu rõ viết testcase API hay viết testcase cho OpenAPI/Swagger/Postman/curl | `testcase-template/SKILL.md` | Đọc testcase Markdown cũ nếu có; generator phải tạo Markdown trước Excel |
| Drive, Docs, Sheets, Slides, upload/share/CRUD | `google-drive-qa/SKILL.md` | Resolve URL/ID rồi dùng Drive MCP |
| Viết Playwright automation/POM | `playwright-pom-automation/SKILL.md` | Đọc template POM |
| Chuyển PDF/DOCX/PPTX sang Markdown | `doc-to-md/SKILL.md` | Chọn converter theo file type |
| Phân tích business document, dựng business flow, tạo XMind hoặc Q&A Markdown/Excel | `business-analysis/SKILL.md` + `doc-to-md/SKILL.md` khi nguồn chưa là Markdown | Convert trước, review đủ 18 vùng rồi generate 3 output khớp nhau |

### Hard gates

1. Chỉ đọc các skill match router và reference mà skill yêu cầu; không tìm implementation khác
2. Trước mutation, ghi execution contract gồm `Target`, `Operation`, `Required inputs`, `Write action`, `Verification`
3. Dùng script canonical/dry-run nếu skill có cung cấp; không tự chế lại API payload
4. Sau mutation, đọc lại object và đối chiếu ID, content, evidence, state hoặc permission
5. Nếu thiếu target, expected, role/data hoặc quyền truy cập thì ghi đúng phần thiếu hay `BLOCKED`; không đoán
6. Với business analysis, không sinh testcase trước khi Q&A quan trọng được trả lời hoặc assumption được đánh dấu rõ

### Invariant bắt buộc

- Retest ticket luôn chạy đủ Retest, Sanity, Impacted regression, Exploratory, Ad-hoc và UI/UX
- PASS → `Done`
- FAILED → `In Progress`
- BLOCKED → giữ nguyên trạng thái
- Bug mới → `Todo`
- Comment Plane, testcase prose và nội dung người đọc thấy được tạo/sửa qua Drive CRUD không có dấu `.` cuối câu và không có emoji/icon
- Giữ nguyên ID, URL, filename, sheet/tab name, formula, code, decimal number và machine-readable value
- Business analysis phải sinh `.xmind`, Q&A Markdown và Q&A Excel từ cùng một JSON; Question ID giữa hai Q&A phải khớp

## Playwright POM Automation

### Khi nào áp dụng
- Scaffold dự án Playwright mới
- Viết test UI / API / Performance
- Setup CI cho QA project

### Không dùng
- Click exploratory ad-hoc (dùng `qa-run` thay thế)
- Debug app production

### Phải làm
- Dùng Page Object Model — không viết `page.locator()` trực tiếp trong spec
- Tách selector khỏi spec, đặt trong `selectors/`
- Gắn tag cho test (`@ui`, `@api`, `@functional`)
- Wire Allure + CI

### Nguyên tắc cốt lõi
> Mọi selector phải đi qua Page Object — không viết `page.locator()` trực tiếp trong spec.

Đọc chi tiết: [`.claude/skills/playwright-pom-automation/SKILL.md`](playwright-pom-automation/SKILL.md)

## QA Run

### Khi nào áp dụng
- Lên kế hoạch / thực thi chu trình QA
- Chọn kỹ thuật test
- Chạy sanity / regression
- Sign-off release

### Không dùng
- Viết script automation mới (→ `playwright-pom-automation`)
- Tạo test case document (→ `testcase-template`)

### Phải làm
- Phân tầng Sanity → Smoke → Regression (không full regression mỗi cycle)
- Mọi yêu cầu retest ticket tự chạy RETEST_PLUS gồm retest flow gốc, sanity, impacted regression, exploratory, ad-hoc và UI/UX
- Tối ưu token (scope snapshot, batch fill, deterministic wait)
- Fallback sang Antigravity nếu Claude Code + Playwright không khả dụng
- Đọc `qa-knowledge/<feature>-business-guide.md` trước browser action nếu có
- Sau mọi run, ghi và validate business guide bằng `scripts/write-business-guide.mjs`
- Khi khám phá tổng thể hoặc bootstrap app, tạo `qa-knowledge/app-business-guide.md` với module coverage map; retest không lặp lại full-app baseline

### Nguyên tắc cốt lõi
> Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Đọc chi tiết: [`.claude/skills/qa-run/SKILL.md`](qa-run/SKILL.md)

## Test Case Template

### Khi nào áp dụng
- Sinh test case document (Excel / CSV / MD)
- Cần cột nhất quán + key dùng chung
- Sinh testcase API khi user yêu cầu rõ viết testcase API hoặc viết testcase cho endpoint, OpenAPI/Swagger, Postman hay curl

### Không dùng
- Ghi chú exploratory
- Viết bug report

### Phải làm
- Dùng schema cột cố định (xem template `assets/Template.xlsx`)
- Key dùng chung giữa 3 skill (config từ `../config/api_keys.json`)
- Cleanup output tự động trước khi giao
- Không đặt dấu `.` cuối nội dung testcase và không chèn emoji/icon
- Giữ flow hiện tại làm mặc định; chỉ đọc `references/api-testcases.md` và tạo object `api` khi user yêu cầu viết testcase API rõ ràng; chỉ nhắc tới artifact API thì không đổi mode
- Với API file, luôn chạy `scripts/import-api-spec.py`; chỉ chạy Excel khi `review_required` trống
- Generator phải tạo testcase Markdown đầy đủ trước Excel; lần sau đọc Markdown thay vì parse Excel

### Nguyên tắc cốt lõi
> Cùng một bộ cột — không sáng tạo cột mới.

Đọc chi tiết: [`.claude/skills/testcase-template/SKILL.md`](testcase-template/SKILL.md)

## Doc to MD

### Khi nào áp dụng
- Convert PDF / DOCX / PPTX / HTML sang Markdown
- Để nạp vào skill khác (testcase-template, qa-run)

### Không dùng
- Edit file Markdown có sẵn
- Scrape trang web

### Phải làm
- Giữ cấu trúc heading / bảng
- Dùng tool convert phù hợp với từng format (MarkItDown)
- Trên macOS: dùng `--only-binary=:all:` để tránh build cryptography wheel

### Nguyên tắc cốt lõi
> Convert đúng cấu trúc — không retype thủ công từ PDF.

Đọc chi tiết: [`.claude/skills/doc-to-md/SKILL.md`](doc-to-md/SKILL.md)

## Business Analysis

### Khi nào áp dụng
- Đọc BRD/SRS/FRS hoặc business document để dựng flow hệ thống
- Tạo file XMind editable và Q&A Markdown/Excel
- Tìm ambiguity, contradiction, missing rule hoặc expected result khó kiểm thử

### Phải làm
- Chạy `doc-to-md` trước nếu nguồn chưa là Markdown
- Review đủ 18 vùng trong senior fullstack QA/QC checklist
- Tạo một analysis JSON rồi chạy `business-analysis/scripts/generate.sh`
- Read-back `.xmind`, Q&A Markdown và Q&A Excel trước khi bàn giao

Đọc chi tiết: [`business-analysis/SKILL.md`](business-analysis/SKILL.md)

## Plane QA

### Khi nào áp dụng
- Đọc hoặc CRUD ticket Plane ở một hay nhiều workspace
- Log bug theo format chuẩn, comment PASS/FAILED/BLOCKED và upload evidence inline
- Viết daily report hoặc test report trên Plane
- Đổi trạng thái và đính evidence theo kết quả retest

### Phải làm
- Parse workspace/project/ticket từ URL trước khi dùng cấu hình mặc định
- Chạy `scripts/doctor.sh` trước live read/write
- Dùng `post-result.py` cho PASS/FAILED/BLOCKED rồi read-back comment và state
- PASS → `Done`; FAILED → `In Progress`; BLOCKED giữ nguyên; bug mới → `Todo`
- Không nhận hoặc lưu mật khẩu; chỉ dùng Personal API Key từ environment

Đọc chi tiết: [`plane-qa/SKILL.md`](plane-qa/SKILL.md)

## Google Drive QA

### Khi nào áp dụng
- CRUD file/folder Drive, Docs, Sheets, Slides hoặc permissions
- Đọc, lưu hoặc archive report/evidence QA trên Google Drive
- Khôi phục luồng khi OAuth/MCP hết quyền hoặc không được load

### Phải làm
- Ưu tiên `google-drive` MCP và native tool theo loại file
- Resolve chính xác file/folder trước write; xác nhận thao tác destructive theo `references/CRUD.md`
- Read-back ID, name, parent/location và changed content/permission sau write
- Không dùng web search thay cho private Drive
- Không commit OAuth client secret, access token hoặc refresh token

Đọc chi tiết: [`google-drive-qa/SKILL.md`](google-drive-qa/SKILL.md)

## Cài đặt & cấu hình chung

- **API key**: 1 file config chung `config/api_keys.json` (gitignored) cho helper AI. Plane và Drive dùng environment/MCP credential riêng; không commit secret. Xem [`README.md`](README.md) mục "API Keys" và `scripts/ai_provider.py`.
- **Clone**: `git clone git@github.com:tqphong02/QA-skill.git` rồi copy vào `~/.claude/skills/`.
- **Setup chi tiết**: xem [`SETUP-GUIDE.md`](SETUP-GUIDE.md).
