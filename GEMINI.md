<!-- Router cross-model gọn cho 23 skill. Contract chi tiết nằm trong SKILL.md đã route. -->

# QA-skill — Hướng dẫn cho AI coding agent

Repo này phân phối 23 skill Quality Engineering (QE), Security Engineering và MCP integration dùng chung cho nhiều AI coding assistant (Claude Code, Codex, Gemini/Antigravity, Cursor, Windsurf, Copilot). File này là router chính cho **Gemini và Antigravity**; phải đọc phần cross-model trước khi chọn skill.

## Cross-model deterministic mode

Phần này là hợp đồng thực thi bắt buộc cho mọi model, đặc biệt model nhanh hoặc context nhỏ như Gemini Flash/Pro. Không được bỏ bước vì model nghĩ rằng đã hiểu yêu cầu.

### Plane inline evidence bắt buộc cho mọi model

Áp dụng nguyên vẹn cho Gemini, GLM, Codex, Claude và mọi provider khác

- Sau `integration/plane/SKILL.md` phải đọc `integration/plane/QUICK_REF.md`
- Khi Description hoặc Comment có ảnh, tạo input theo `integration/plane/inline-evidence-template.json`, chạy `node integration/plane/scripts/browser-inline-evidence.mjs --input <request.json>` để dry-run rồi chỉ thêm `--apply` khi write đã được phép
- Dùng đúng placeholder `{{PLANE_DESCRIPTION_IMAGE_N}}` và `{{PLANE_COMMENT_IMAGE_N}}`; không dựa vào vị trí con trỏ ProseMirror sau khi paste HTML dài
- Chỉ báo thành công khi read-back đúng ticket/comment ID, đủ image node, preview hiển thị, state đúng, `attachments_count: 0`, `issue_attachment_requests` rỗng và không còn placeholder
- Không click `Attach`, không gọi `/issue-attachments/`, không copy credential sang host khác và không fallback sang attachment khi browser staging lỗi

### URL/artifact-first dispatch

Luôn scan nguyên văn user message trước khi trả lời. User không cần gọi tên skill hoặc viết câu lệnh đầy đủ. Tín hiệu URL, ID, filename, extension và động từ nghiệp vụ trong router là đủ để load skill tương ứng.

Áp dụng các default read-only sau:

- Chỉ có Plane URL hoặc ticket ID → load `integration-plane`, parse target, chạy doctor và đọc ticket
- Plane URL/ticket ID kèm `retest`, `re-test`, `verify`, `kiểm tra lại`, `PASS`, `FAILED` hoặc `BLOCKED` → `integration-plane` doctor/read → `dynamic-web-exploratory` RETEST_PLUS → `integration-plane` comment/state
- Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID → load `integration-google-drive`, resolve và đọc metadata/nội dung bằng Drive MCP
- Chỉ có GitHub repository/PR/Issue/Actions URL → load `integration-github` và inspect resource read-only
- URL hoặc artifact kèm động từ mutation rõ ràng → thực hiện đúng operation được yêu cầu sau exact-target check; link đứng một mình không cấp quyền write

Sau khi route, bắt đầu action read-only hoặc canonical doctor phù hợp. Không dừng ở việc giới thiệu skill, yêu cầu user tự gọi `$skill-name`, hoặc hỏi “muốn dùng skill nào”. Nếu runtime/tool không có, chạy doctor tương ứng và báo đúng failing layer.

### Router cố định

| Tín hiệu yêu cầu | Skill phải đọc | Hành động đầu tiên |
|---|---|---|
| Plane URL (`projects.metasolutions.ai`, path có `/issues/` hoặc `/work-items/`), ticket ID, log bug, comment PASS/FAILED/BLOCKED | `integration/plane/SKILL.md` | Parse URL rồi chạy Plane doctor; bare URL/ID thì đọc ticket |
| Retest, re-test, verify bug/ticket | `integration/plane/SKILL.md` + `dynamic-testing/web-exploratory/SKILL.md` | Plane doctor/read → RETEST_PLUS |
| Generic browser task, open/read/extract/search/scroll/click/fill/download một trang đơn giản | `dynamic-testing/web-exploratory/SKILL.md` (`FAST`) | Validate URL/domain rồi dùng quick-start; không cần business brief |
| App baseline discovery, sanity, regression, exploratory, ad-hoc hoặc UI/UX không có deterministic testcase suite | `dynamic-testing/web-exploratory/SKILL.md` | Bắt đầu UI-first từ URL + objective; tài liệu, source, role/data và brief chỉ là enrichment; baseline map flow tổng thể, retest chỉ chạy scope ảnh hưởng |
| Phân tích repo, học business flow từ source code, quét logic hệ thống, tạo business guide từ code | `dynamic-testing/web-exploratory/SKILL.md` (REPO_BUSINESS_DISCOVERY) | Chạy `scripts/orchestrators/repo-business-discovery.mjs --repo <path> --mode full`; Phần 2+3 sẽ merge vào `qa-knowledge/merged/system-business-guide.md` dùng chung bởi dynamic-web-exploratory và static-requirements-analysis |
| Từ UI suy ra flow, đối chiếu Source Code + Docs + Runtime, tìm mâu thuẫn UI vs Backend/BRD, sinh câu hỏi BA/PO/Dev | `dynamic-testing/web-exploratory/SKILL.md` (UI_BUSINESS_RECONCILIATION) | Chạy `scripts/orchestrators/ui-business-reconciliation.mjs --url <url> --page <slug> --requirements <registry.json>`; map từng UI item với requirement theo 7 trạng thái, kiểm tra 10 ambiguity patterns, xuất traceability JSON và guide 12 sections |
| Figma, design token, design-to-code fidelity, responsive visual review, interaction state hoặc UX spec | `hybrid-testing/ui-ux-review/SKILL.md` | Validate review packet requirement/viewport/state/media trước; live browser execution chuyển sang `dynamic-web-exploratory`, accessibility chuyển sang `hybrid-accessibility` |
| Release readiness, go/no-go, quality gate, exit criteria, risk acceptance hoặc sign-off | `governance/release-quality/SKILL.md` | Đánh giá release packet local trước; thiếu evidence/approval là `BLOCKED`, không tự đổi trạng thái deploy/ticket |
| SAST, SCA, SBOM, secret scan, dependency/license hoặc secure CI | `static-testing/supply-chain-security/SKILL.md` | Chạy local redacted preflight; không đọc secret/keychain/registry và exploit validation chuyển sang `dynamic-security-pentest` |
| Resilience, chaos, fault injection, failover, recovery, RTO/RPO, retry hoặc timeout | `dynamic-testing/resilience/SKILL.md` | Validate plan và stop condition trước; active injection cần target, rollback, owner approval và execution contract |
| Cross-browser, device/OS, locale, i18n/l10n, timezone, currency hoặc RTL | `dynamic-testing/compatibility/SKILL.md` | Validate matrix trước; live web chuyển `dynamic-web-exploratory`, native mobile chuyển `dynamic-mobile`, thiếu target thì `BLOCKED` |
| Viết/sửa/review testcase, Scenario ID/Name, hoặc yêu cầu rõ viết testcase API hay viết testcase cho OpenAPI/Swagger/Postman/curl | `support/testcase-authoring/SKILL.md` | Đọc testcase Markdown cũ nếu có; generator phải tạo Markdown trước Excel |
| `drive.google.com`, `docs.google.com/document`, `docs.google.com/spreadsheets`, `docs.google.com/presentation`, Drive ID, Docs, Sheets, Slides, upload/share/CRUD | `integration/google-drive/SKILL.md` | Resolve URL/ID rồi dùng Drive MCP; bare URL/ID thì đọc object |
| Viết hoặc chạy deterministic testcase/Excel/Sheet automation, Playwright hoặc POM | `dynamic-testing/web-automation/SKILL.md` | Chạy unified `BUILD`, `RUN` hoặc mặc định `BUILD_AND_RUN`; browser execution phải có evidence và verdict `PASS|FAILED|N/A|UNTEST` |
| adapter-browser-session, ego-lite, ego lite, task space, browser automation không cần Playwright MCP, kế thừa login state thật của user | `adapter/browser-session/SKILL.md` | Kiểm tra ego lite đã install chưa bằng `ego-browser nodejs <<'EOF' cliLog(typeof snapshotText) EOF`; nếu chưa, đọc `adapter/browser-session/references/install.md` |
| Chuyển PDF/DOCX/PPTX sang Markdown | `support/document-conversion/SKILL.md` | Chọn converter theo file type |
| Phân tích business document, dựng business flow, tạo XMind hoặc Q&A Markdown/Excel | `static-testing/requirements-analysis/SKILL.md` + `support/document-conversion/SKILL.md` khi nguồn chưa là Markdown | Convert trước, review đủ 18 vùng rồi generate 3 output khớp nhau |
| Pentest được ủy quyền, security assessment, bug bounty, source-security scan, Codex Security, recon, IDOR, SSRF, SSTI, JWT, GraphQL, race condition, Burp, Raccoon, DockerScan hoặc GhidraGPT | `dynamic-testing/security-pentest/SKILL.md` | Đọc engagement contract rồi chạy doctor; source scan trên Antigravity không API key thì đọc `references/PENTEST_SECURITY.md` → `antigravity-host` |
| GitHub MCP, repository API, PR, Issues, Actions, CI/CD, OAuth/PAT hoặc đổi account MCP | `integration/github/SKILL.md` | Phân biệt MCP auth với Git SSH rồi chạy doctor |
| Database, ETL/ELT, reconciliation, lineage, freshness, schema drift hoặc Database read-only MCP | `dynamic-testing/data-quality/SKILL.md` | Xác nhận nguồn/đích và read-only boundary thật ở DB role |
| LLM, chatbot, RAG, agent, prompt/model evaluation | `dynamic-testing/ai-evaluation/SKILL.md` | Xác định golden dataset và metric trước run |
| WCAG, axe, keyboard, focus hoặc screen reader | `hybrid-testing/accessibility/SKILL.md` | Kết hợp automated scan với manual interaction |
| Latency, load, stress, spike, soak, k6, JMeter, `.jmx`, JTL, Chrome DevTools MCP, k6 MCP hoặc bottleneck | `dynamic-testing/performance/SKILL.md` | Chọn engine nội bộ, xác nhận common workload contract và stop condition |
| Postman setup, Postman MCP/CLI, Newman, OAuth, collection run, workspace, environment, spec, mock hoặc monitor operation | `integration/postman/SKILL.md` | Bootstrap MCP, chạy runtime doctor, ưu tiên Postman CLI và chỉ fallback Newman cho collection v2/v2.1 |
| OpenAPI, Swagger, Postman contract/collection validation, GraphQL, gRPC hoặc webhook contract | `hybrid-testing/api-contract/SKILL.md` | Validate spec rồi đối chiếu implementation |
| Android/iOS, APK/IPA, Appium, emulator hoặc real device | `dynamic-testing/mobile/SKILL.md` | Chọn device matrix và lifecycle coverage |
| White-box, glass-box, branch/path/decision coverage, TypeScript/JavaScript/Python/Java/Go/C#/Dart, call graph, NestJS DI, Jest/Vitest hoặc runtime coverage | `hybrid-testing/source-coverage/SKILL.md` | Chạy `find` → `analyze` compact; chỉ dùng full JSON cho graph/test/coverage/handoff và testcase document phải qua `support-testcase-authoring` |
| Tạo/import/chạy JMeter `.jmx` | `dynamic-testing/performance/SKILL.md` | Dùng internal JMeter adapter; smoke một thread trước approved load |

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
10. Với exploratory/ad-hoc và app baseline, bắt đầu UI-first từ URL + objective; document/source/role/data/brief là optional enrichment. Chỉ retest và source-driven route mới chạy context-builder và yêu cầu Business Execution Brief `READY`; deterministic Sheet/testcase chuyển sang `dynamic-web-automation`
11. Với adapter-browser-session: chạy `node adapter/browser-session/scripts/detect.mjs` trước task; không dùng `drainEvents()` để claim request/response body; không thực hiện action phá huỷ với session thật khi chưa được user xác nhận; `browser-driver` và `network-observer` phải resolve độc lập theo [BROWSER-DRIVER-RESOLUTION.md](dynamic-testing/web-exploratory/references/BROWSER-DRIVER-RESOLUTION.md). Gemini/Antigravity là host model, không phải browser override: phải gọi `playwright-runtime` của skill từ terminal project; chỉ dùng `antigravity-native` khi được chọn explicit sau khi đường Playwright unavailable
12. Với `pentest-security` trên Antigravity không API key: chạy `detect --engine antigravity-host` → `prepare` → active host agent hoàn thành exact assignment result → `status` → `finalize`; không đọc token/keychain, không gọi Gemini API và không tuyên bố OpenAI `codex-security` CLI đang chạy bằng Gemini
13. Với interactive companion HTML: chỉ render từ canonical JSON đã validate bằng `dynamic-testing/web-exploratory/scripts/writers/render-intelligence-html.mjs`; output phải dùng layout `catalog-v2` đồng bộ `QA-skill.html`, cuộn 2 ngón để pan, pinch/`Ctrl`/`Cmd`+wheel để zoom, có route chip làm nổi bật tuyến end-to-end, edge label dạng pill chỉ hiện khi hover/active và click node phải highlight đường vào/ra kèm detail drawer có `Làm được gì`, thông tin flow và đường liên quan, rồi pass `--check`; không bàn giao template legacy
14. UI business reconciliation phải có URL/snapshot thật và requirement registry có stable ID/source_ref; thiếu input thì fail closed, không dùng fixture ngầm; runtime click phải có `--verify-runtime` và exact selector được user duyệt
15. UI/UX review phải giữ design source, requirement, implementation và runtime provenance riêng; screenshot/video là bắt buộc cho visual `PASS`
16. Release governance không được biến thiếu evidence hoặc approval thành PASS; phải phân biệt `FAIL` với `BLOCKED`
17. AppSec local scan phải redacted; scanner alert luôn là `Candidate` cho đến khi có reproduction và control comparison
18. Resilience không được chạy fault injection hoặc concurrency khi chưa có target, rollback, stop condition và owner approval
19. Compatibility phải ghi rõ supported browsers/devices/locales/timezones; matrix plan không được tuyên bố là runtime execution PASS

### Invariant bắt buộc

- `DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- `dynamic-performance` là public skill duy nhất cho performance; JMeter và k6 là engine nội bộ dùng chung config, smoke gate và result schema
- Retest ticket = Original Retest + Sanity + Impacted Regression + `DISCOVERY_CORE`; vẫn giữ ledger RETEST_PLUS 6 dòng riêng
- Deterministic Sheet execution = unified POM BUILD_AND_RUN với Testcase ID chính xác, browser evidence và verdict projection; chỉ chạy `DISCOVERY_CORE` riêng khi user yêu cầu exploratory coverage, còn row có ticket/previous failure dùng RETEST_PLUS
- Không được tự thay business flow thiếu bằng flow generic; retest và source-driven execution phải copy test contract từ Business Execution Brief `READY` cùng source hash, còn exploratory/ad-hoc có thể dùng oracle `UI_DERIVED`
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
- Whitebox path/testcase tĩnh luôn là `source-derived-candidate`; chỉ tuyên bố measured coverage sau `coverage`/`run-coverage`, giữ `unknown` khác `uncovered`, và không tự tạo template testcase ngoài `support-testcase-authoring`
- adapter-browser-session là browser driver riêng, không phải chỉ là fallback của Playwright; `browser-driver` và `network-observer` resolve độc lập; adapter-browser-session chỉ cung cấp basic network events qua `drainEvents()` — không có request/response body
- adapter-browser-session `drainEvents()` luôn là `reduced_confidence` cho network assertion; muốn body/headers phải attach `chrome-devtools-mcp` vào đúng CDP port của ego lite
- adapter-browser-session không available trên Windows/Linux; resolve `unsupported_platform` và fallback sang `playwright-mcp` hoặc `chrome-devtools-mcp`
- adapter-browser-session có login state thật của user — phải tuân thủ 8 hard gate trong `adapter/browser-session/SKILL.md` trước mọi action có tác dụng ngoài app
- Không bật `/yolo` ngoài isolated lab được cho phép rõ ràng
- Không xem `source_available` là tool đã cài hoặc được phép chạy

## Progressive disclosure

Sau khi route, phải đọc đầy đủ `SKILL.md` đã chọn trước khi hành động và chỉ đọc reference cần cho mode hiện tại

- Browser exploratory và browser task đơn giản: `dynamic-testing/web-exploratory/SKILL.md`
- Deterministic testcase, Excel, Sheet và POM: `dynamic-testing/web-automation/SKILL.md`
- Tài liệu testcase: `support/testcase-authoring/SKILL.md`
- Input không phải Markdown: đọc `support/document-conversion/SKILL.md` trước skill phân tích chính
- Plane, Drive, GitHub và Postman: đọc integration skill tương ứng và chạy doctor trước khi kết luận lỗi runtime

Routing oracle có version nằm tại `config/core-routing-contract.json`. Mọi thay đổi router phải qua `node scripts/core-skill-router.mjs --self-test`

## Publication

Tên skill cài đặt chuẩn lấy từ `config/skill-registry.json`. Setup phải chuyển legacy alias đang active vào backup có timestamp, cài đúng một canonical copy và verify source parity
