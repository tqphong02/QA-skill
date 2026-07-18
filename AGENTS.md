<!--
Mirror of ./<skill>/SKILL.md — keep in sync.
6 skills: playwright-pom-automation, qa-run, testcase-template, doc-to-md, plane-qa, google-drive-qa
-->

# QA-skill — Hướng dẫn cho AI coding agent

Repo này phân phối 6 skill Quality Engineering (QE) dùng chung cho nhiều AI coding assistant (Claude Code, Codex, Cursor, Windsurf, Copilot). File này được đọc tự động bởi **OpenAI Codex CLI** và các tool khác cũng đọc chuẩn `AGENTS.md`.

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
- Tối ưu token (scope snapshot, batch fill, deterministic wait)
- Fallback sang Antigravity nếu Claude Code + Playwright không khả dụng

### Nguyên tắc cốt lõi
> Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Đọc chi tiết: [`.claude/skills/qa-run/SKILL.md`](qa-run/SKILL.md)

## Test Case Template

### Khi nào áp dụng
- Sinh test case document (Excel / CSV / MD)
- Cần cột nhất quán + key dùng chung

### Không dùng
- Ghi chú exploratory
- Viết bug report

### Phải làm
- Dùng schema cột cố định (xem template `assets/Template.xlsx`)
- Key dùng chung giữa 3 skill (config từ `../config/api_keys.json`)
- Cleanup output tự động trước khi giao

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

## Plane QA

### Khi nào áp dụng
- Đọc hoặc CRUD ticket Plane ở một hay nhiều workspace
- Log bug theo format chuẩn, comment PASS/FAILED/BLOCKED và upload evidence inline
- Viết daily report hoặc test report trên Plane

### Phải làm
- Parse workspace/project/ticket từ URL trước khi dùng cấu hình mặc định
- Chạy `scripts/doctor.sh` trước live read/write
- Bug mới vào `Todo`; retest `FAILED` phải comment evidence rồi chuyển `In Progress`
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
- Không commit OAuth client secret, access token hoặc refresh token

Đọc chi tiết: [`google-drive-qa/SKILL.md`](google-drive-qa/SKILL.md)

## Cài đặt & cấu hình chung

- **AI API key**: lưu trong `config/api_keys.json` (gitignored) hoặc environment. Plane key và Google OAuth phải dùng environment/local credential riêng, không commit.
- **Clone**: `git clone git@github.com:tqphong02/QA-skill.git` rồi copy vào `~/.claude/skills/`.
- **Setup chi tiết**: xem [`SETUP-GUIDE.md`](SETUP-GUIDE.md).
