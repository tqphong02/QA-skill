<!--
Mirror of ./<skill>/SKILL.md — keep in sync.
23 skills; xem router bên dưới và README.md để biết danh sách đầy đủ
-->

# QA-skill — Hướng dẫn cho AI coding agent

Repo này phân phối 23 skill Quality Engineering (QE), Security Engineering và MCP integration dùng chung cho nhiều AI coding assistant (Claude Code, Codex, Gemini/Antigravity, Cursor, Windsurf, Copilot). File này là router chính cho **Gemini và Antigravity**; phải đọc phần cross-model trước khi chọn skill.

## Cross-model deterministic mode

Phần này là hợp đồng thực thi bắt buộc cho mọi model, đặc biệt model nhanh hoặc context nhỏ như Gemini Flash/Pro. Không được bỏ bước vì model nghĩ rằng đã hiểu yêu cầu.

### Plane inline evidence bắt buộc cho mọi model

Áp dụng nguyên vẹn cho Gemini, GLM, Codex, Claude và mọi provider khác

- Sau `plane-qa/SKILL.md` phải đọc `plane-qa/QUICK_REF.md`
- Khi Description hoặc Comment có ảnh, tạo input theo `plane-qa/inline-evidence-template.json`, chạy `node plane-qa/scripts/browser-inline-evidence.mjs --input <request.json>` để dry-run rồi chỉ thêm `--apply` khi write đã được phép
- Dùng đúng placeholder `{{PLANE_DESCRIPTION_IMAGE_N}}` và `{{PLANE_COMMENT_IMAGE_N}}`; không dựa vào vị trí con trỏ ProseMirror sau khi paste HTML dài
- Chỉ báo thành công khi read-back đúng ticket/comment ID, đủ image node, preview hiển thị, state đúng, `attachments_count: 0`, `issue_attachment_requests` rỗng và không còn placeholder
- Không click `Attach`, không gọi `/issue-attachments/`, không copy credential sang host khác và không fallback sang attachment khi browser staging lỗi

### URL/artifact-first dispatch

Luôn scan nguyên văn user message trước khi trả lời. User không cần gọi tên skill hoặc viết câu lệnh đầy đủ. Tín hiệu URL, ID, filename, extension và động từ nghiệp vụ trong router là đủ để load skill tương ứng.

Áp dụng các default read-only sau:

- Chỉ có Plane URL hoặc ticket ID → load `plane-qa`, parse target, chạy doctor và đọc ticket
- Plane URL/ticket ID kèm `retest`, `re-test`, `verify`, `kiểm tra lại`, `PASS`, `FAILED` hoặc `BLOCKED` → `plane-qa` doctor/read → `qa-run` RETEST_PLUS → `plane-qa` comment/state
- Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID → load `google-drive-qa`, resolve và đọc metadata/nội dung bằng Drive MCP
- Chỉ có GitHub repository/PR/Issue/Actions URL → load `github-mcp-qa` và inspect resource read-only
- URL hoặc artifact kèm động từ mutation rõ ràng → thực hiện đúng operation được yêu cầu sau exact-target check; link đứng một mình không cấp quyền write

Sau khi route, bắt đầu action read-only hoặc canonical doctor phù hợp. Không dừng ở việc giới thiệu skill, yêu cầu user tự gọi `$skill-name`, hoặc hỏi “muốn dùng skill nào”. Nếu runtime/tool không có, chạy doctor tương ứng và báo đúng failing layer.

### Router cố định

| Tín hiệu yêu cầu | Skill phải đọc | Hành động đầu tiên |
|---|---|---|
| Plane URL (`projects.metasolutions.ai`, path có `/issues/` hoặc `/work-items/`), ticket ID, log bug, comment PASS/FAILED/BLOCKED | `plane-qa/SKILL.md` | Parse URL rồi chạy Plane doctor; bare URL/ID thì đọc ticket |
| Retest, re-test, verify bug/ticket | `plane-qa/SKILL.md` + `qa-run/SKILL.md` | Plane doctor/read → RETEST_PLUS |
| App baseline discovery, sanity, regression, exploratory, ad-hoc hoặc UI/UX không có deterministic testcase suite | `qa-run/SKILL.md` | Khởi động từ URL + objective; baseline map flow tổng thể, retest chỉ chạy scope ảnh hưởng |
| Phân tích repo, học business flow từ source code, quét logic hệ thống, tạo business guide từ code | `qa-run/SKILL.md` (REPO_BUSINESS_DISCOVERY) | Chạy `scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode full`; Phần 2+3 sẽ merge vào `qa-knowledge/merged/system-business-guide.md` dùng chung bởi qa-run và business-analysis |
| Từ UI suy ra flow, đối chiếu Source Code + Docs + Runtime, tìm mâu thuẫn UI vs Backend/BRD, sinh câu hỏi BA/PO/Dev | `qa-run/SKILL.md` (UI_BUSINESS_RECONCILIATION) | Chạy `scripts/orchestrators/ui-business-reconciliation.mjs --url <url> --page <slug> --requirements <registry.json>`; map từng UI item với requirement theo 7 trạng thái, kiểm tra 10 ambiguity patterns, xuất traceability JSON và guide 12 sections |
| Figma, design token, design-to-code fidelity, responsive visual review, interaction state hoặc UX spec | `ui-ux-design-qa/SKILL.md` | Validate review packet requirement/viewport/state/media trước; live browser execution chuyển sang `qa-run`, accessibility chuyển sang `accessibility-qa` |
| Release readiness, go/no-go, quality gate, exit criteria, risk acceptance hoặc sign-off | `release-governance-qa/SKILL.md` | Đánh giá release packet local trước; thiếu evidence/approval là `BLOCKED`, không tự đổi trạng thái deploy/ticket |
| SAST, SCA, SBOM, secret scan, dependency/license hoặc secure CI | `appsec-supply-chain-qa/SKILL.md` | Chạy local redacted preflight; không đọc secret/keychain/registry và exploit validation chuyển sang `pentest-run` |
| Resilience, chaos, fault injection, failover, recovery, RTO/RPO, retry hoặc timeout | `reliability-resilience-qa/SKILL.md` | Validate plan và stop condition trước; active injection cần target, rollback, owner approval và execution contract |
| Cross-browser, device/OS, locale, i18n/l10n, timezone, currency hoặc RTL | `compatibility-localization-qa/SKILL.md` | Validate matrix trước; live web chuyển `qa-run`, native mobile chuyển `mobile-qa`, thiếu target thì `BLOCKED` |
| Viết/sửa/review testcase, Scenario ID/Name, hoặc yêu cầu rõ viết testcase API hay viết testcase cho OpenAPI/Swagger/Postman/curl | `testcase-template/SKILL.md` | Đọc testcase Markdown cũ nếu có; generator phải tạo Markdown trước Excel |
| `drive.google.com`, `docs.google.com/document`, `docs.google.com/spreadsheets`, `docs.google.com/presentation`, Drive ID, Docs, Sheets, Slides, upload/share/CRUD | `google-drive-qa/SKILL.md` | Resolve URL/ID rồi dùng Drive MCP; bare URL/ID thì đọc object |
| Viết hoặc chạy deterministic testcase/Excel/Sheet automation, Playwright hoặc POM | `playwright-pom-automation/SKILL.md` | Chạy unified `BUILD`, `RUN` hoặc mặc định `BUILD_AND_RUN`; browser execution phải có evidence và verdict `PASS|FAILED|N/A|UNTEST` |
| ego-browser, ego-lite, ego lite, task space, browser automation không cần Playwright MCP, kế thừa login state thật của user | `ego-browser/SKILL.md` | Kiểm tra ego lite đã install chưa bằng `ego-browser nodejs <<'EOF' cliLog(typeof snapshotText) EOF`; nếu chưa, đọc `ego-browser/references/install.md` |
| Chuyển PDF/DOCX/PPTX sang Markdown | `doc-to-md/SKILL.md` | Chọn converter theo file type |
| Phân tích business document, dựng business flow, tạo XMind hoặc Q&A Markdown/Excel | `business-analysis/SKILL.md` + `doc-to-md/SKILL.md` khi nguồn chưa là Markdown | Convert trước, review đủ 18 vùng rồi generate 3 output khớp nhau |
| Pentest được ủy quyền, security assessment, bug bounty, source-security scan, Codex Security, recon, IDOR, SSRF, SSTI, JWT, GraphQL, race condition, Burp, Raccoon, DockerScan hoặc GhidraGPT | `pentest-run/SKILL.md` | Đọc engagement contract rồi chạy doctor; source scan trên Antigravity không API key thì đọc `references/PENTEST_SECURITY.md` → `antigravity-host` |
| GitHub MCP, repository API, PR, Issues, Actions, CI/CD, OAuth/PAT hoặc đổi account MCP | `github-mcp-qa/SKILL.md` | Phân biệt MCP auth với Git SSH rồi chạy doctor |
| Database, ETL/ELT, reconciliation, lineage, freshness, schema drift hoặc Database read-only MCP | `data-quality-qa/SKILL.md` | Xác nhận nguồn/đích và read-only boundary thật ở DB role |
| LLM, chatbot, RAG, agent, prompt/model evaluation | `ai-quality-qa/SKILL.md` | Xác định golden dataset và metric trước run |
| WCAG, axe, keyboard, focus hoặc screen reader | `accessibility-qa/SKILL.md` | Kết hợp automated scan với manual interaction |
| Latency, load, stress, spike, soak, k6, JMeter, `.jmx`, JTL, Chrome DevTools MCP, k6 MCP hoặc bottleneck | `performance-qa/SKILL.md` | Chọn engine nội bộ, xác nhận common workload contract và stop condition |
| Postman setup, Postman MCP/CLI, Newman, OAuth, collection run, workspace, environment, spec, mock hoặc monitor operation | `postman/SKILL.md` | Bootstrap MCP, chạy runtime doctor, ưu tiên Postman CLI và chỉ fallback Newman cho collection v2/v2.1 |
| OpenAPI, Swagger, Postman contract/collection validation, GraphQL, gRPC hoặc webhook contract | `api-contract-qa/SKILL.md` | Validate spec rồi đối chiếu implementation |
| Android/iOS, APK/IPA, Appium, emulator hoặc real device | `mobile-qa/SKILL.md` | Chọn device matrix và lifecycle coverage |
| White-box, glass-box, branch/path/decision coverage, TypeScript/JavaScript/Python/Java/Go/C#/Dart, call graph, NestJS DI, Jest/Vitest hoặc runtime coverage | `whitebox-qa/SKILL.md` | Chạy `find` → `analyze` compact; chỉ dùng full JSON cho graph/test/coverage/handoff và testcase document phải qua `testcase-template` |
| Tạo/import/chạy JMeter `.jmx` | `performance-qa/SKILL.md` | Dùng internal JMeter adapter; smoke một thread trước approved load |

### Hard gates

1. Chỉ đọc các skill match router và reference mà skill yêu cầu; không tìm implementation khác
2. Trước mutation, ghi execution contract gồm `Target`, `Operation`, `Required inputs`, `Write action`, `Verification`
3. Dùng script canonical/dry-run nếu skill có cung cấp; không tự chế lại API payload
4. Sau mutation, đọc lại object và đối chiếu ID, content, evidence, state hoặc permission
5. Nếu thiếu target, expected, role/data hoặc quyền truy cập thì ghi đúng phần thiếu hay `BLOCKED`; không đoán
6. Với business analysis, không sinh testcase trước khi Q&A quan trọng được trả lời hoặc assumption được đánh dấu rõ
7. Với pentest, phải có `.pentest/engagement.md`, target, authorization, exclusions và rate limit trước request mạng; Level 2 hoặc Level 3 phải xin duyệt ngay trước khi chạy
8. Source pentest đã clone chỉ là `source_available`; chỉ chạy tool khi doctor xác nhận executable và dependency là `available`
9. Skill Markdown không thay thế MCP runtime; trước khi báo integration lỗi phải phân biệt `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded` và `permission_denied`
10. Với qa-run, chạy `scripts/helpers/context-builder.mjs` theo feature scope trước normal browser action; chỉ tiếp tục khi Business Execution Brief là `READY`, `NEEDS_DISCOVERY` chỉ cho scoped discovery và `BLOCKED` phải dừng đúng trường thiếu
11. Với ego-browser: chạy `node ego-browser/scripts/detect.mjs` trước task; không dùng `drainEvents()` để claim request/response body; không thực hiện action phá huỷ với session thật khi chưa được user xác nhận; `browser-driver` và `network-observer` phải resolve độc lập theo [BROWSER-DRIVER-RESOLUTION.md](qa-run/references/BROWSER-DRIVER-RESOLUTION.md)
12. Với `pentest-security` trên Antigravity không API key: chạy `detect --engine antigravity-host` → `prepare` → active host agent hoàn thành exact assignment result → `status` → `finalize`; không đọc token/keychain, không gọi Gemini API và không tuyên bố OpenAI `codex-security` CLI đang chạy bằng Gemini
13. Với interactive companion HTML: chỉ render từ canonical JSON đã validate bằng `qa-run/scripts/writers/render-intelligence-html.mjs`; output phải dùng layout `catalog-v2` đồng bộ `QA-skill.html`, cuộn 2 ngón để pan, pinch/`Ctrl`/`Cmd`+wheel để zoom, có route chip làm nổi bật tuyến end-to-end, edge label dạng pill chỉ hiện khi hover/active và click node phải highlight đường vào/ra kèm detail drawer có `Làm được gì`, thông tin flow và đường liên quan, rồi pass `--check`; không bàn giao template legacy
14. UI business reconciliation phải có URL/snapshot thật và requirement registry có stable ID/source_ref; thiếu input thì fail closed, không dùng fixture ngầm; runtime click phải có `--verify-runtime` và exact selector được user duyệt
15. UI/UX review phải giữ design source, requirement, implementation và runtime provenance riêng; screenshot/video là bắt buộc cho visual `PASS`
16. Release governance không được biến thiếu evidence hoặc approval thành PASS; phải phân biệt `FAIL` với `BLOCKED`
17. AppSec local scan phải redacted; scanner alert luôn là `Candidate` cho đến khi có reproduction và control comparison
18. Resilience không được chạy fault injection hoặc concurrency khi chưa có target, rollback, stop condition và owner approval
19. Compatibility phải ghi rõ supported browsers/devices/locales/timezones; matrix plan không được tuyên bố là runtime execution PASS

### Invariant bắt buộc

- `DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- `performance-qa` là public skill duy nhất cho performance; JMeter và k6 là engine nội bộ dùng chung config, smoke gate và result schema
- Retest ticket = Original Retest + Sanity + Impacted Regression + `DISCOVERY_CORE`; vẫn giữ ledger RETEST_PLUS 6 dòng riêng
- Deterministic Sheet execution = unified POM BUILD_AND_RUN với Testcase ID chính xác, browser evidence và verdict projection; chỉ chạy `DISCOVERY_CORE` riêng khi user yêu cầu exploratory coverage, còn row có ticket/previous failure dùng RETEST_PLUS
- Không được tự thay business flow thiếu bằng flow generic; test contract phải copy từ Business Execution Brief `READY` cùng source hash
- Retest ticket luôn chạy đủ Retest, Sanity, Impacted regression, Exploratory, Ad-hoc và UI/UX
- PASS → `Done`
- FAILED → `In Progress`
- BLOCKED → giữ nguyên trạng thái
- Bug mới → `Todo`
- Comment Plane, testcase prose và nội dung người đọc thấy được tạo/sửa qua Drive CRUD không có dấu `.` cuối câu và không có emoji/icon
- Giữ nguyên ID, URL, filename, sheet/tab name, formula, code, decimal number và machine-readable value
- Business analysis phải sinh `.xmind`, Q&A Markdown và Q&A Excel từ cùng một JSON; Question ID giữa hai Q&A phải khớp
- Pentest scanner alert luôn là `Candidate` cho đến khi có reproduction evidence và control comparison
- Antigravity host-native source scan là Codex Security-compatible pipeline, không phải thay provider bên trong OpenAI `codex-security`; mọi finding từ host model luôn `unverified` sau finalize
- Interactive HTML luôn là derived presentation artifact; validator phải xác nhận `catalog-v2`, self-contained, dark mode, keyboard interaction, trackpad pan, gesture zoom, progressive edge labels, route navigation và capability detail drawer trước bàn giao
- Whitebox path/testcase tĩnh luôn là `source-derived-candidate`; chỉ tuyên bố measured coverage sau `coverage`/`run-coverage`, giữ `unknown` khác `uncovered`, và không tự tạo template testcase ngoài `testcase-template`
- ego-browser là browser driver riêng, không phải chỉ là fallback của Playwright; `browser-driver` và `network-observer` resolve độc lập; ego-browser chỉ cung cấp basic network events qua `drainEvents()` — không có request/response body
- ego-browser `drainEvents()` luôn là `reduced_confidence` cho network assertion; muốn body/headers phải attach `chrome-devtools-mcp` vào đúng CDP port của ego lite
- ego-browser không available trên Windows/Linux; resolve `unsupported_platform` và fallback sang `playwright-mcp` hoặc `chrome-devtools-mcp`
- ego-browser có login state thật của user — phải tuân thủ 8 hard gate trong `ego-browser/SKILL.md` trước mọi action có tác dụng ngoài app
- Không bật `/yolo` ngoài isolated lab được cho phép rõ ràng
- Không xem `source_available` là tool đã cài hoặc được phép chạy

## Testcase Execution and Playwright POM

### Khi nào áp dụng
- Scaffold dự án Playwright mới
- Viết test UI / API / Performance
- Chạy deterministic testcase từ Markdown, Excel, Sheet hoặc `.automation.json`
- Setup CI cho QA project

### Không dùng
- Click exploratory ad-hoc (dùng `qa-run` thay thế)
- Debug app production

### Phải làm
- Dùng Page Object Model — không viết `page.locator()` trực tiếp trong spec
- Tách selector khỏi spec, đặt trong `selectors/`
- Gắn tag cho test (`@ui`, `@api`, `@functional`)
- Wire Allure + CI
- Mặc định dùng `BUILD_AND_RUN`: build POM → traceability PASS → browser run → screenshot/video + same-session trace → `PASS`, `FAILED`, `N/A` hoặc `UNTEST`
- Không dùng `qa-run` để chạy lại cùng deterministic testcase suite

### Nguyên tắc cốt lõi
> Một manifest, một POM, một browser run và một verdict có evidence

Đọc chi tiết: [`playwright-pom-automation/SKILL.md`](playwright-pom-automation/SKILL.md)

## QA Run

### Khi nào áp dụng
- Lên kế hoạch / thực thi chu trình QA
- Chọn kỹ thuật test
- Chạy sanity / regression
- Sign-off release

### Không dùng
- Viết script automation mới (→ `playwright-pom-automation`)
- Chạy deterministic testcase/Excel/Sheet hoặc POM (→ `playwright-pom-automation`)
- Tạo test case document (→ `testcase-template`)

### Phải làm
- Phân tầng Sanity → Smoke → Regression (không full regression mỗi cycle)
- Mọi yêu cầu retest ticket tự chạy RETEST_PLUS gồm retest flow gốc, sanity, impacted regression, exploratory, ad-hoc và UI/UX
- Tối ưu token (scope snapshot, batch fill, deterministic wait)
- Fallback sang Antigravity nếu Claude Code + Playwright không khả dụng
- Đọc `qa-knowledge/app-business-guide.md` rồi `<feature>-business-guide.md` trước browser action nếu có
- Sau mọi run, ghi và validate business guide bằng `scripts/writers/write-business-guide.mjs`
- Dùng `APP_BASELINE_DISCOVERY` khi khám phá tổng thể hoặc bootstrap app; ghi `coverage_map`; không chạy lại full-app baseline trong retest

### Senior QA operating layer
- Khi lập kế hoạch, release gate, triage, RCA, metrics hoặc post-release verification, đọc `qa-run/references/SENIOR-QA-OPERATING-MODEL.md`
- Mọi cycle phải ghi scope/risk, build/environment/data readiness, entry/exit criteria, executed/blocked counts, evidence completeness, defect decision và owner post-release khi áp dụng
- Dùng `qa-run/references/RELEASE-QUALITY-METRICS.md` để giữ numerator/denominator, source run ID và limitation; không dùng test count thay cho risk coverage
- Defect phải phân biệt severity/priority, giữ actual/expected/evidence/repro và ghi root-cause/prevention cho defect escaped hoặc reopened

### Nguyên tắc cốt lõi
> Chạy đúng phạm vi đúng lúc — không full regression mỗi cycle.

Đọc chi tiết: [`qa-run/SKILL.md`](qa-run/SKILL.md)

## Automation quality gates

- Đọc `playwright-pom-automation/references/AUTOMATION-QUALITY-GATES.md` và `FLAKY-TEST-MANAGEMENT.md` trước khi tạo CI automation
- Retry-pass phải được phân loại `flaky`, giữ first-attempt và retry evidence, không tự biến thành PASS sạch
- CI phải kiểm tra compile/lint, placeholder/secret, failed test, flaky rate, evidence, duration, declared coverage và supported browser matrix
- Dùng component/contract/API ở lower test level; UI chỉ giữ critical business journeys; service virtualization phải có ít nhất một real-dependency check
- Visual baseline phải gắn commit/browser/viewport/locale/theme; axe không thay thế keyboard/focus/manual evidence

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

Đọc chi tiết: [`testcase-template/SKILL.md`](testcase-template/SKILL.md)

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

Đọc chi tiết: [`doc-to-md/SKILL.md`](doc-to-md/SKILL.md)

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

## Pentest Run

### Khi nào áp dụng
- Pentest hoặc bug bounty có ủy quyền rõ ràng
- Recon, kiểm tra phân quyền, injection, race condition hoặc container security
- Phân tích Burp traffic hoặc binary được cung cấp

### Phải làm
- Tạo hoặc đọc `.pentest/engagement.md`
- Chạy `pentest-run/scripts/doctor.sh` trước request mạng
- Phân biệt source `source_available` với executable `available`
- Bắt đầu từ passive hoặc low-impact discovery
- Xin duyệt ngay trước state-changing, exploit validation, concurrency hoặc high-volume action
- Chỉ xác nhận finding khi có evidence tái hiện và control comparison

Đọc chi tiết: [`pentest-run/SKILL.md`](pentest-run/SKILL.md)

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
- Dùng `browser-inline-evidence.mjs` với placeholder chính xác cho Description hoặc Comment có ảnh; không tự chế cách đặt con trỏ editor
- Giữ `Attachments 0` và fail nếu có request `/issue-attachments/`
- Credential chỉ nằm trong `.env` ignored; bản publish dùng `PLANE_LOCAL_CONFIG_DIR` rõ ràng để trỏ tới một config local dùng chung, không copy secret
- PASS → `Done`; FAILED → `In Progress`; BLOCKED giữ nguyên; bug mới → `Todo`
- API dùng Personal API Key; password chỉ dùng cho browser auto-login đã được user cho phép và không bao giờ in ra

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

## GitHub MCP QA

### Khi nào áp dụng
- Cài hoặc chẩn đoán GitHub MCP cho Antigravity
- Quản lý repository, PR, Issues hoặc Actions CI/CD qua GitHub API
- Đổi account MCP cá nhân/công ty mà vẫn giữ Git SSH riêng

### Phải làm
- Dùng endpoint chính chủ `https://api.githubcopilot.com/mcp/x/all`
- Không commit OAuth credential hoặc PAT
- Phân biệt Git SSH với MCP OAuth/PAT
- Xác nhận account, repository và branch trước write; read-back sau mutation

Đọc chi tiết: [`github-mcp-qa/SKILL.md`](github-mcp-qa/SKILL.md)

## Cài đặt & cấu hình chung

- **API key**: 1 file config chung `config/api_keys.json` (gitignored) cho helper AI. Plane và Drive dùng environment/MCP credential riêng; không commit secret. Xem [`README.md`](README.md) mục "API Keys" và `scripts/ai_provider.py`.
- **Clone**: `git clone git@github.com:tqphong02/QA-skill.git` rồi chạy `./scripts/setup.sh --agent=antigravity --yes`
- **Setup chi tiết**: xem [`SETUP-GUIDE.md`](SETUP-GUIDE.md).
