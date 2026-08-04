# QA-skill

Bộ skill QA và Security Engineering đa model cho **QA team** (MIT), dùng được với Codex, Claude Code, Gemini/Antigravity, Cursor, Windsurf và Copilot.

## 23 skill

| Skill | Mục đích | Đầu ra |
|---|---|---|
| [qa-run](./qa-run/SKILL.md) | Agentic UI-first browser QA + one-command FAST task, extraction/state delta/judge, same-session network/console | ranked charters + `FINDINGS.md` + evidence + ticket Plane |
| [testcase-template](./testcase-template/SKILL.md) | Sinh test case Excel theo template Nina Studio (4 sheet, formulas, dropdowns) | `Template.xlsx` |
| [playwright-pom-automation](./playwright-pom-automation/SKILL.md) | Scaffold & viết Playwright + TS + POM (UI / API / Performance / CI-CD) | `.spec.ts` + `pages/` + `selectors/` + pipeline |
| [doc-to-md](./doc-to-md/SKILL.md) | Convert PDF/DOCX/PPTX/XLSX sang Markdown bằng MarkItDown (Microsoft) | `.md` files |
| [business-analysis](./business-analysis/SKILL.md) | Phân tích business như senior fullstack QA/QC, dựng flow và Q&A | `.xmind` + Q&A `.md`/`.xlsx` + requirement registry ẩn cho browser mapping |
| [pentest-run](./pentest-run/SKILL.md) | Điều phối pentest được ủy quyền từ scope, recon đến validation và report | engagement contract + evidence + findings |
| [plane-qa](./plane-qa/SKILL.md) | CRUD ticket Plane đa workspace, log bug, comment retest và evidence inline | ticket/comment Plane |
| [google-drive-qa](./google-drive-qa/SKILL.md) | CRUD Drive, Docs, Sheets, Slides và permissions qua MCP | file/folder/report trên Drive |
| [data-quality-qa](./data-quality-qa/SKILL.md) | Database, ETL/ELT, reconciliation, lineage và schema drift | data-quality evidence |
| [ai-quality-qa](./ai-quality-qa/SKILL.md) | LLM, RAG, agent, structured output, safety và regression | eval dataset + report |
| [accessibility-qa](./accessibility-qa/SKILL.md) | WCAG 2.2, axe, keyboard và screen reader | accessibility evidence |
| [performance-qa](./performance-qa/SKILL.md) | Một orchestrator cho JMeter/k6, common config, threshold, report và bottleneck | `.jmx`/k6 + JSON/Markdown/HTML report |
| [api-contract-qa](./api-contract-qa/SKILL.md) | OpenAPI/Postman/GraphQL/gRPC contract verification | contract evidence |
| [postman](./postman/SKILL.md) | OAuth MCP, Postman CLI, Newman và collection execution | MCP connection + JSON/JUnit/console evidence |
| [mobile-qa](./mobile-qa/SKILL.md) | Android/iOS, Appium MCP, WebdriverIO, scrcpy Wi-Fi và authorized network proxy inspection | mobile QA evidence + sanitized HAR/network report + test code |
| [whitebox-qa](./whitebox-qa/SKILL.md) | White-box đa ngôn ngữ, call graph, NestJS DI, Jest/Vitest và runtime coverage | compact/full analysis + executable test + coverage evidence + testcase-template handoff |
| [github-mcp-qa](./github-mcp-qa/SKILL.md) | GitHub MCP, repository, PR, Issues và Actions CI/CD | MCP config + verified operation |
| [ego-browser](./ego-browser/SKILL.md) | Browser driver macOS kế thừa login state thật, có safety gate cho external effects | browser session + UI evidence |
| [ui-ux-design-qa](./ui-ux-design-qa/SKILL.md) | Review design-to-code, visual hierarchy, responsive states và UX evidence | UI/UX review packet + screenshot/video evidence |
| [release-governance-qa](./release-governance-qa/SKILL.md) | Risk-based release gate, defect risk, evidence, approval và exit criteria | release gate JSON + go/no-go decision |
| [appsec-supply-chain-qa](./appsec-supply-chain-qa/SKILL.md) | Local redacted secret, dependency, SBOM và secure-CI preflight | supply-chain report + candidate findings |
| [reliability-resilience-qa](./reliability-resilience-qa/SKILL.md) | Validate fault-injection, recovery, observability, RTO/RPO và stop conditions | bounded resilience plan + readiness report |
| [compatibility-localization-qa](./compatibility-localization-qa/SKILL.md) | Browser/device/locale/timezone/currency/i18n/RTL coverage | compatibility matrix + coverage report |

## 🗺️ Master Skill Architecture & Flow Diagram

![QA Skill Master Architecture Flow](assets/qa-skill-architecture.png)

Sơ đồ luồng & mapping chi tiết giữa các skill: [SKILL_FLOW_MAPPING.md](./SKILL_FLOW_MAPPING.md)

Bundle tiếng Việt ngày `30-07-2026` theo `plannotator/effective-html/html-diagram`:

- [QA-skill — kiến trúc, danh mục và luồng định tuyến trong một file](./skill-catalog/QA-skill-effective-html-30-07-2026/QA-skill.html)
- [Dữ liệu JSON chuẩn](./skill-catalog/QA-skill-effective-html-30-07-2026/QA-skill-du-lieu.json)

File HTML duy nhất có ba tab nội bộ: `Kiến trúc`, `Tất cả skill` và `Luồng định tuyến`. Sơ đồ phân biệt rõ `23 skill công khai` với `5 capability nội bộ/phụ trợ`: JMeter, k6, Graphify, effective-html và bề mặt `jmeter-qa` đã ngừng dùng. Bản catalog hiện lập chỉ mục `211` nhánh công khai, `23` nhánh phụ trợ, tổng cộng `234` mục cấu trúc, `29` relationship và `32` nhánh thực thi. Mỗi mũi tên phải có `sourceRefs` trỏ đến file, dòng và đoạn nguồn khớp chính xác; generator cũng từ chối edge đi xuyên node không liên quan.

Format tương tác hiện tại:

- Kéo chuột hoặc cuộn hai ngón trên trackpad để di chuyển sơ đồ theo hai chiều
- Chụm/xòe hai ngón trên trackpad để zoom tại vị trí con trỏ; hỗ trợ cả tín hiệu Chrome `Ctrl/Meta+Wheel` và Safari/WebKit `gesturestart/gesturechange`
- Dùng nút `−`, `+` hoặc `Đặt lại` để điều khiển zoom thủ công
- Canvas không tạo text highlight khi kéo
- Nhãn mũi tên dùng pill có nền riêng và lane tách biệt để không bị đường nối che hoặc chồng lên nhau
- Click/tap skill card được xử lý trực tiếp ở `pointerup` khi dịch chuyển dưới 5 px; drag thật chỉ di chuyển canvas và không mở panel
- Card hiển thị số nhánh thực thi nếu skill có workflow nội bộ; tìm kiếm bao phủ cả tên workflow và tên mục
- `Exploratory Browser QA & Ad-hoc` là một flow riêng: qa-run tự quan sát visible content + AX browser live, suy luận task plan từ UI, chọn next action theo deterministic state delta, replan khi không tiến triển, independent-judge success signal, rồi chạy Exploratory + Ad-hoc + UI/UX và đối chiếu Network + Console + Page Error cùng session
- `BROWSER_TASK_FAST` là nhãn của profile FAST bên trong `EXPLORATORY_BROWSER_QA` cho task đơn giản chạy ngay; native path có `quick-start`, structured `extract`, read-only `batch` tối đa 5 action và `quick-finish`; khi có bug/business rule/expected/PASS-FAILED thì chuyển sang profile exploratory đầy đủ trong cùng skill; verdict user-facing chỉ gồm PASS, FAILED, N/A, UNTEST
- `Browser MCP: Network & Console` tách riêng Playwright MCP, Chrome DevTools MCP và runtime observer theo hard gate cùng session
- `Mobile: Appium & Network` tách Appium MCP thực thi UI khỏi proxy capture bằng Proxyman, mitmproxy, Fiddler, Charles hoặc HTTP Toolkit; evidence phải được làm sạch và đối chiếu với bước UI
- Panel chi tiết hiển thị `Làm được gì`, `Ưu điểm`, `Hạn chế`, `Nhánh thực thi` và `Cấu trúc hướng dẫn`; không hiển thị nội dung thô `SKILL.md`

Tạo lại catalog từ toàn bộ `SKILL.md` và kiểm tra artifact:

```bash
node scripts/build-skill-catalog.mjs \
  --bundle skill-catalog/QA-skill-effective-html-30-07-2026

node scripts/build-skill-catalog.mjs \
  --check skill-catalog/QA-skill-effective-html-30-07-2026/QA-skill.html
```

Hướng dẫn cài đặt, cấu hình công cụ và ví dụ sử dụng security skill: [PENTEST-RUN-GUIDE.md](./PENTEST-RUN-GUIDE.md)

Hướng dẫn dùng skill performance cho JMeter/k6: [performance-qa/GUIDE.md](./performance-qa/GUIDE.md)

Hướng dẫn phân biệt skill với MCP và kết nối QA MCP stack: [qa-mcp-stack-vi.md](./github-mcp-qa/references/qa-mcp-stack-vi.md)

## Cross-model compatibility

Mọi agent đọc router và hard gate trong [AGENTS.md](./AGENTS.md). Gemini/Antigravity đọc bản mirror [GEMINI.md](./GEMINI.md).

Kiểm tra contract trước khi dùng hoặc push:

```bash
python3 scripts/validate_cross_model.py
```

## Senior readiness suite

Chạy toàn bộ 23 skill trong phạm vi local, read-only. Suite chạy fixture/unit/compile, kiểm tra mapping BA → browser, chạy doctor cho MCP/device/target và tạo report nhiều dòng; không tự gọi Docker, Postgres, load test, target mạng hoặc mutation ngoài repo:

```bash
npm test
```

Chạy riêng readiness hoặc bật cổng strict-live:

```bash
npm run test:skills
npm run test:skills:strict-live
```

Report dễ đọc nằm tại `evidence/skill-readiness/latest.md`, JSON pretty-print tại `evidence/skill-readiness/latest.json`. `PASS` là evidence đã chạy local, `BLOCKED` là integration cần credential/target/device/approval, còn `FAIL` là lỗi deterministic phải sửa. Strict-live chỉ PASS khi không còn integration BLOCKED

## Senior QA operating model

Bộ skill dùng thêm hai lớp vận hành để tránh chỉ có checklist mà thiếu quản trị chất lượng:

- Manual QA: [qa-run/references/SENIOR-QA-OPERATING-MODEL.md](qa-run/references/SENIOR-QA-OPERATING-MODEL.md) — test strategy, risk, environment/test data, defect triage, RCA, metrics và post-release verification
- Release packet: [qa-run/references/RELEASE-QUALITY-METRICS.md](qa-run/references/RELEASE-QUALITY-METRICS.md) — numerator/denominator, risk coverage, flaky rate, evidence rate và ownership
- Automation: [playwright-pom-automation/references/AUTOMATION-QUALITY-GATES.md](playwright-pom-automation/references/AUTOMATION-QUALITY-GATES.md) — component/contract/UI routing, visual/axe, coverage và CI gates
- Flaky tests: [playwright-pom-automation/references/FLAKY-TEST-MANAGEMENT.md](playwright-pom-automation/references/FLAKY-TEST-MANAGEMENT.md) — retry evidence, quarantine, owner và stability window

Playwright template có `quality-gates.json` và `scripts/quality-gate.mjs` để đánh giá failed tests, retry-derived flaky tests, evidence completeness, duration và coverage sau khi tạo `reports/playwright.json`

## Optional persistent memory

Repository `rohitg00/agentmemory` được dùng như lớp memory phụ trợ, không phải code project để copy vào từng skill. Các native skills tĩnh cần thiết đã được cài vào `~/.codex/skills`: recall, remember, recap, session-history, handoff, commit-context, forget cùng tài liệu MCP/config/hooks

Memory chỉ hỗ trợ recall và handoff giữa phiên. Requirement, source code, `qa-knowledge`, testcase Markdown, selector evidence và runtime evidence vẫn là source of truth. Không lưu credential, token, cookie, auth state hoặc dữ liệu nhạy cảm vào memory. Agentmemory daemon, Codex MCP và plugin marketplace đã được bật ở chế độ core/zero-LLM; auto-compress và context injection vẫn tắt để không phát sinh chi phí token ngoài ý muốn. Sau khi cài hoặc nâng cấp cần mở thread Codex mới để nạp MCP và hooks

Evaluation cases và pass criteria nằm trong [MODEL-COMPATIBILITY.md](./MODEL-COMPATIBILITY.md).

## Cài đặt (máy mới)

```bash
# 1. Clone
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill

# 2a. Codex
./scripts/setup.sh --agent=codex --profile=core --yes

# 2b. Antigravity
./scripts/setup.sh --agent=antigravity --profile=core --yes

# 2c. Claude Code
./scripts/setup.sh --agent=claude --profile=core --yes

# Cài đủ 23 skill chuyên sâu khi cần
./scripts/setup.sh --agent=antigravity --profile=full --yes

# Cài Postman skill + MCP + Postman CLI + Newman
./scripts/setup.sh --agent=antigravity --only=postman --yes

# Cấp đúng 1 skill cho intern, không kèm nested/vendor skill
./scripts/setup.sh --agent=codex --only=qa-run --skip-deps --yes

# 3. Export Plane API key trước khi mở agent
export PLANE_API_KEY="plane_pat_xxx"

# 4. Google Drive MCP: dùng OAuth Desktop credential đã có
codex mcp add google-drive \
  --env GOOGLE_DRIVE_OAUTH_CREDENTIALS="$HOME/.config/google-drive-mcp/gcp-oauth.keys.json" \
  --env GOOGLE_DRIVE_MCP_SCOPES="drive,drive.file,documents,spreadsheets,presentations" \
  -- npx -y @piotr-agier/google-drive-mcp

# 5. GitHub MCP cho Codex dùng PAT từ environment, không ghi token vào repo
# Export GITHUB_PAT_TOKEN bằng secret manager hoặc terminal hiện tại trước bước này
bash github-mcp-qa/scripts/install-codex.sh

# 6. Kiểm tra host và QA MCP stack
bash scripts/doctor-agent.sh --agent=codex
bash github-mcp-qa/scripts/doctor-stack.sh --agent=codex
```

Windows PowerShell:

```powershell
.\scripts\setup.ps1 -Agent codex -Profile core -Yes
.\scripts\setup.ps1 -Agent antigravity -Profile core -Yes
.\scripts\setup.ps1 -Agent claude -Profile core -Yes
.\scripts\setup.ps1 -Agent antigravity -Profile full -Yes
```

Không commit Plane API key, OAuth credential hoặc token. Có thể tạo profile định tuyến cục bộ từ `plane-qa/ACCOUNT-PROFILE.example.md` và `google-drive-qa/ACCOUNT-PROFILE.example.md`.

Với Postman trên Antigravity, setup tự thêm hoặc bật `mcpServers.postman`, cài local Postman CLI và Newman, đồng thời giữ nguyên các MCP khác. Sau setup, restart Antigravity, chạy `/mcp` và đăng nhập Postman qua OAuth; không cần sửa JSON

Google Drive MCP lần đầu cần cấu hình Google Cloud project, APIs, Audience, scopes và OAuth Desktop client theo [GOOGLE_CLOUD_OAUTH_SETUP.md](./google-drive-qa/references/GOOGLE_CLOUD_OAUTH_SETUP.md)

Xem [SETUP-GUIDE.md](./SETUP-GUIDE.md) và [WINDOWS-SETUP.md](./WINDOWS-SETUP.md). GitHub MCP có guide riêng cho [Codex](./github-mcp-qa/references/codex-github-mcp-vi.md) và [Antigravity](./github-mcp-qa/references/antigravity-github-mcp-vi.md)

## API Keys (cho AI models)

Bộ skill này dùng AI model (Claude, GPT, Gemini) cho một số tác vụ (vd testcase-template có thể dùng AI để suggest test cases). Hỗ trợ 3 cách config:

**Cách 1: Dùng môi trường free (KHÔNG cần API key)**

| Môi trường | Cách detect |
|---|---|
| GitHub Copilot Pro | Tự detect qua env `COPILOT_PRO` hoặc `GITHUB_COPILOT_TOKEN` |
| Google Antigravity | Tự detect qua env `ANTIGRAVITY_API_KEY` hoặc app `/Applications/Antigravity.app` |
| Claude Code CLI | Tự detect qua env `ANTHROPIC_API_KEY` |

**Cách 2: Config API key vào `config/api_keys.json` (gitignored)**

```bash
# 1. Copy template
cp config/api_keys.example.json config/api_keys.json

# 2. Edit file, paste key thật
nano config/api_keys.json

# 3. Verify provider đang dùng
python3 scripts/ai_provider.py
```

**Cách 3: Env var (ưu tiên cao nhất)**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="AIza..."
export PLANE_API_KEY="plane_pat_..."
```

### Helper module

`scripts/ai_provider.py` — tự detect môi trường và load key:

```python
from scripts.ai_provider import (
    get_anthropic_client,    # Returns anthropic.Anthropic or None
    get_openai_client,       # Returns openai.OpenAI or None
    get_google_client,       # Returns google.generativeai or None
    get_provider_info,       # Returns dict với status
    detect_environment,      # 'antigravity' | 'copilot_pro' | 'claude_code' | 'standalone'
)

info = get_provider_info()
# {'environment': 'antigravity', 'active_provider': 'Antigravity (Gemini - free)', ...}
```

## License

MIT — xem [LICENSE](./LICENSE).
