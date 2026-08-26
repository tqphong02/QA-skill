# QA-skill

Bộ skill QA và Security Engineering đa model cho **QA team** (MIT), dùng được với Codex, Claude Code, Gemini/Antigravity, Cursor, Windsurf và Copilot.

## 23 skill public + nested/bundled skill trong scope

| Skill | Mục đích | Đầu ra |
|---|---|---|
| [dynamic-web-exploratory](./dynamic-testing/web-exploratory/SKILL.md) | Agentic UI-first browser QA + one-command FAST task, extraction/state delta/judge, same-session network/console | ranked charters + `FINDINGS.md` + evidence + ticket Plane |
| [support-testcase-authoring](./support/testcase-authoring/SKILL.md) | Sinh testcase manual, RBAC Matrix và execution contract lossless cho unified POM | `.md` + `.automation.json` + `.xlsx` |
| [dynamic-web-automation](./dynamic-testing/web-automation/SKILL.md) | Build automation POM sạch cho UI/API/functional, chạy Playwright, thu evidence và trả verdict | selectors/pages/API clients/specs + execution/evidence JSON + `PASS/FAILED/N/A/UNTEST` |
| [support-document-conversion](./support/document-conversion/SKILL.md) | Convert PDF/DOCX/PPTX/XLSX sang Markdown bằng MarkItDown (Microsoft) | `.md` files |
| [static-requirements-analysis](./static-testing/requirements-analysis/SKILL.md) | Phân tích business như senior fullstack QA/QC, dựng flow và Q&A | `.xmind` + Q&A `.md`/`.xlsx` + requirement registry ẩn cho browser mapping |
| [dynamic-security-pentest](./dynamic-testing/security-pentest/SKILL.md) | Điều phối pentest được ủy quyền từ scope, recon đến validation và report | engagement contract + evidence + findings |
| [integration-plane](./integration/plane/SKILL.md) | CRUD ticket Plane đa workspace, log bug, comment retest và evidence inline | ticket/comment Plane |
| [integration-google-drive](./integration/google-drive/SKILL.md) | CRUD Drive, Docs, Sheets, Slides và permissions qua MCP | file/folder/report trên Drive |
| [dynamic-data-quality](./dynamic-testing/data-quality/SKILL.md) | Database, ETL/ELT, reconciliation, lineage và schema drift | data-quality evidence |
| [dynamic-ai-evaluation](./dynamic-testing/ai-evaluation/SKILL.md) | LLM, RAG, agent, structured output, safety và regression | eval dataset + report |
| [hybrid-accessibility](./hybrid-testing/accessibility/SKILL.md) | WCAG 2.2, axe, keyboard và screen reader | accessibility evidence |
| [dynamic-performance](./dynamic-testing/performance/SKILL.md) | Một orchestrator cho JMeter/k6, common config, threshold, report và bottleneck | `.jmx`/k6 + JSON/Markdown/HTML report |
| [hybrid-api-contract](./hybrid-testing/api-contract/SKILL.md) | OpenAPI/Postman/GraphQL/gRPC contract verification | contract evidence |
| [integration-postman](./integration/postman/SKILL.md) | OAuth MCP, Postman CLI, Newman và collection execution | MCP connection + JSON/JUnit/console evidence |
| [dynamic-mobile](./dynamic-testing/mobile/SKILL.md) | Android/iOS, Appium MCP, WebdriverIO, scrcpy Wi-Fi và authorized network proxy inspection | mobile QA evidence + sanitized HAR/network report + test code |
| [hybrid-source-coverage](./hybrid-testing/source-coverage/SKILL.md) | White-box đa ngôn ngữ, call graph, NestJS DI, Jest/Vitest và runtime coverage | compact/full analysis + executable test + coverage evidence + support-testcase-authoring handoff |
| [integration-github](./integration/github/SKILL.md) | GitHub MCP, repository, PR, Issues và Actions CI/CD | MCP config + verified operation |
| [adapter-browser-session](./adapter/browser-session/SKILL.md) | Browser driver macOS kế thừa login state thật, có safety gate cho external effects | browser session + UI evidence |
| [hybrid-ui-ux-review](./hybrid-testing/ui-ux-review/SKILL.md) | Review design-to-code, visual hierarchy, responsive states và UX evidence | UI/UX review packet + screenshot/video evidence |
| [governance-release-quality](./governance/release-quality/SKILL.md) | Risk-based release gate, defect risk, evidence, approval và exit criteria | release gate JSON + go/no-go decision |
| [static-supply-chain-security](./static-testing/supply-chain-security/SKILL.md) | Local redacted secret, dependency, SBOM và secure-CI preflight | supply-chain report + candidate findings |
| [dynamic-resilience](./dynamic-testing/resilience/SKILL.md) | Validate fault-injection, recovery, observability, RTO/RPO và stop conditions | bounded resilience plan + readiness report |
| [dynamic-compatibility](./dynamic-testing/compatibility/SKILL.md) | Browser/device/locale/timezone/currency/i18n/RTL coverage | compatibility matrix + coverage report |

## 🗺️ Master Skill Architecture & Flow Diagram

![QA Skill Master Architecture Flow](assets/qa-skill-architecture.png)

Sơ đồ luồng & mapping chi tiết giữa các skill: [SKILL_FLOW_MAPPING.md](./SKILL_FLOW_MAPPING.md)

Bundle đầy đủ ngày `04-08-2026` theo `plannotator/effective-html`, render bằng `catalog-v2`:

- [QA-skill — full skill flow và branch index trong một file](./skill-catalog/QA-skill-effective-html-04-08-2026/QA-skill.html)
- [Dữ liệu JSON chuẩn (provenance nội bộ)](./skill-catalog/QA-skill-effective-html-04-08-2026/QA-skill-du-lieu.json)

File HTML có canvas skill-level, route chips, detail drawer và full index tìm kiếm. Catalog hiện bao phủ `37 skill trong scope`: `23 public-root` + nested `pentest-security` + `13` bundled Codex Security skill, `5 capability nội bộ/phụ trợ`, `389` mục branch H2–H4/phụ trợ, `238` nhánh vận hành, `29` relationship và `15` bề mặt vendor được ghi nhận nhưng không nạp theo scope contract.

HTML public không hiển thị đường dẫn, link hoặc nội dung file nguồn; provenance chi tiết chỉ giữ trong JSON canonical nội bộ để validate

Format tương tác hiện tại:

- Kéo chuột hoặc cuộn hai ngón trên trackpad để di chuyển sơ đồ theo hai chiều
- Chụm/xòe hai ngón trên trackpad để zoom tại vị trí con trỏ; hỗ trợ cả tín hiệu Chrome `Ctrl/Meta+Wheel` và Safari/WebKit `gesturestart/gesturechange`
- Dùng nút `−`, `+` hoặc `Đặt lại` để điều khiển zoom thủ công
- Canvas không tạo text highlight khi kéo
- Nhãn mũi tên dùng pill có nền riêng và lane tách biệt để không bị đường nối che hoặc chồng lên nhau
- Click/tap skill card được xử lý trực tiếp ở `pointerup` khi dịch chuyển dưới 5 px; drag thật chỉ di chuyển canvas và không mở panel
- Card hiển thị số nhánh thực thi nếu skill có workflow nội bộ; tìm kiếm bao phủ cả tên workflow và tên mục
- `Exploratory Browser QA & Ad-hoc` là một flow riêng: dynamic-web-exploratory tự quan sát visible content + AX browser live, suy luận task plan từ UI, chọn next action theo deterministic state delta, replan khi không tiến triển, independent-judge success signal, rồi chạy Exploratory + Ad-hoc + UI/UX và đối chiếu Network + Console + Page Error cùng session
- `BROWSER_TASK_FAST` là nhãn của profile FAST bên trong `EXPLORATORY_BROWSER_QA` cho task đơn giản chạy ngay; native path có `quick-start`, structured `extract`, read-only `batch` tối đa 5 action và `quick-finish`; khi có bug/business rule/expected/PASS-FAILED thì chuyển sang profile exploratory đầy đủ trong cùng skill; verdict user-facing chỉ gồm PASS, FAILED, N/A, UNTEST
- `Browser MCP: Network & Console` tách riêng Playwright MCP, Chrome DevTools MCP và runtime observer theo hard gate cùng session
- `Mobile: Appium & Network` tách Appium MCP thực thi UI khỏi proxy capture bằng Proxyman, mitmproxy, Fiddler, Charles hoặc HTTP Toolkit; evidence phải được làm sạch và đối chiếu với bước UI
- Detail drawer hiển thị `Làm được gì`, thông tin flow, toàn bộ branch/child branch, ưu điểm, hạn chế và resource counts; không hiển thị đường dẫn, link hoặc nội dung file nguồn
- Full index tìm kiếm cả public/nested/bundled skill, branch, child branch và handoff; canvas là overview dễ đọc, không được dùng để tuyên bố coverage của vendor surfaces

Tạo lại catalog đệ quy và render Effective HTML chuẩn:

```bash
node scripts/build-effective-skill-html.mjs \
  --bundle skill-catalog/QA-skill-effective-html-04-08-2026

node dynamic-testing/web-exploratory/scripts/writers/render-intelligence-html.mjs \
  --check skill-catalog/QA-skill-effective-html-04-08-2026/QA-skill.html
```

Hướng dẫn cài đặt, cấu hình công cụ và ví dụ sử dụng security skill: [PENTEST-RUN-GUIDE.md](./PENTEST-RUN-GUIDE.md)

Hướng dẫn dùng skill performance cho JMeter/k6: [dynamic-testing/performance/GUIDE.md](./dynamic-testing/performance/GUIDE.md)

Hướng dẫn phân biệt skill với MCP và kết nối QA MCP stack: [qa-mcp-stack-vi.md](./integration/github/references/qa-mcp-stack-vi.md)

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

Report dễ đọc nằm tại `<project-root>/evidence/skill-readiness/latest.md`, JSON pretty-print tại `<project-root>/evidence/skill-readiness/latest.json`. `<project-root>` được resolve theo thứ tự `QA_SKILL_PROJECT_ROOT` → `INIT_CWD` của npm → thư mục hiện tại. Có thể dùng `--output-dir` để chỉ định thư mục khác. Report tách ba tầng: local deterministic, adapter/fail-closed preflight và live target evidence. Vì vậy live `BLOCKED` do thiếu credential/target/device/approval không bị diễn giải thành lỗi lõi; strict-live vẫn chỉ PASS khi không còn integration BLOCKED

Regression routing tích lũy, p95 router latency và instruction-token proxy:

```bash
npm run test:routing
```

Chạy riêng one-shot certification holdout chưa dùng để tune:

```bash
npm run test:routing:certify
```

Kết quả regression nằm tại `<project-root>/evidence/ai-eval/core-routing-latest.json`; certification nằm tại `core-routing-certification-latest.json`. Regression PASS không tự chứng nhận độ tổng quát. Certification chỉ PASS khi mọi critical case và toàn bộ holdout mới PASS. Lịch sử first-run được giữ trong `config/core-routing-eval-history.json` để không biến failed holdout thành số đẹp sau khi tune

Proxy UTF-8/4 không thay thế token hoặc latency do provider báo; thêm `provider_usage` vào các case thực thi trên từng model để có p50/p95 model telemetry thật. Nếu `provider_reported.status` là `NOT_MEASURED`, chỉ được kết luận về deterministic route latency và context-size proxy

## Senior QA operating model

Bộ skill dùng thêm hai lớp vận hành để tránh chỉ có checklist mà thiếu quản trị chất lượng:

- Manual QA: [dynamic-testing/web-exploratory/references/SENIOR-QA-OPERATING-MODEL.md](dynamic-testing/web-exploratory/references/SENIOR-QA-OPERATING-MODEL.md) — test strategy, risk, environment/test data, defect triage, RCA, metrics và post-release verification
- Release packet: [dynamic-testing/web-exploratory/references/RELEASE-QUALITY-METRICS.md](dynamic-testing/web-exploratory/references/RELEASE-QUALITY-METRICS.md) — numerator/denominator, risk coverage, flaky rate, evidence rate và ownership
- Automation: [dynamic-testing/web-automation/references/AUTOMATION-QUALITY-GATES.md](dynamic-testing/web-automation/references/AUTOMATION-QUALITY-GATES.md) — component/contract/UI routing, visual/axe, coverage và CI gates
- Flaky tests: [dynamic-testing/web-automation/references/FLAKY-TEST-MANAGEMENT.md](dynamic-testing/web-automation/references/FLAKY-TEST-MANAGEMENT.md) — retry evidence, quarantine, owner và stability window

Playwright template có `quality-gates.json` và `scripts/quality-gate.mjs` để đánh giá failed tests, retry-derived flaky tests, evidence completeness, duration và coverage sau khi tạo `reports/playwright.json`

## Optional persistent memory

Repository `rohitg00/agentmemory` được dùng như lớp memory phụ trợ, không phải code project để copy vào từng skill. Các native skills tĩnh cần thiết đã được cài vào `~/.codex/skills`: recall, remember, recap, session-history, handoff, commit-context, forget cùng tài liệu MCP/config/hooks

Memory chỉ hỗ trợ recall và handoff giữa phiên. Requirement, source code, `qa-knowledge`, testcase Markdown, selector evidence và runtime evidence vẫn là source of truth. Không lưu credential, token, cookie, auth state hoặc dữ liệu nhạy cảm vào memory. Agentmemory daemon, Codex MCP và plugin marketplace đã được bật ở chế độ core/zero-LLM; auto-compress và context injection vẫn tắt để không phát sinh chi phí token ngoài ý muốn. Sau khi cài hoặc nâng cấp cần mở thread Codex mới để nạp MCP và hooks

Evaluation cases và pass criteria nằm trong [MODEL-COMPATIBILITY.md](./MODEL-COMPATIBILITY.md).

## Cài đặt (máy mới)

### Cài private plugin và tự dọn bản clone

Chạy từ thư mục cha, không `cd` vào repository. Repository GitHub phải để private:

```bash
git clone git@github.com:tqphong02/QA-skill.git QA-skill
node QA-skill/scripts/install-private-plugin.mjs --cleanup-source
```

Lệnh này thực hiện theo thứ tự:

1. Xác minh bundle có đúng 23 skill và khớp registry
2. Cài standalone skills vào `$HOME/.agents/skills` để Codex IDE tự dùng
3. Cài private plugin vào `$HOME/plugins/qa-skill-suite`
4. Đăng ký personal marketplace và chạy `codex plugin add qa-skill-suite@personal`
5. Chỉ xóa folder `QA-skill` vừa clone khi plugin, marketplace và 23 standalone skills đều đã được xác minh

Nếu clone có file sửa, file untracked hoặc file ignored, cleanup sẽ bị từ chối để tránh mất dữ liệu. Codex IDE extension không hỗ trợ plugin nên dùng standalone skills đã cài ở bước 2; Codex CLI/Desktop dùng plugin. Mở phiên Codex mới sau khi cài.

Muốn giữ repository để cập nhật bằng `git pull`, bỏ `--cleanup-source`:

```bash
node QA-skill/scripts/install-private-plugin.mjs
```

### Cài standalone skills theo cách truyền thống

```bash
# 1. Clone
git clone git@github.com:tqphong02/QA-skill.git
cd QA-skill

# 2a. Codex
./scripts/setup.sh --agent=codex --profile=full --yes

# 2b. Antigravity
./scripts/setup.sh --agent=antigravity --profile=full --yes

# 2c. Claude Code
./scripts/setup.sh --agent=claude --profile=full --yes

# Profile full tự discover mọi top-level folder có SKILL.md, gồm cả skill mới build

# Cài Postman skill + MCP + Postman CLI + Newman
./scripts/setup.sh --agent=antigravity --only=integration-postman --yes

# Cấp đúng 1 skill cho intern, không kèm nested/vendor skill
./scripts/setup.sh --agent=codex --only=dynamic-web-exploratory --skip-deps --yes

# 3. Export Plane API key trước khi mở agent
export PLANE_API_KEY="plane_pat_xxx"

# 4. Google Drive MCP: dùng OAuth Desktop credential đã có
codex mcp add google-drive \
  --env GOOGLE_DRIVE_OAUTH_CREDENTIALS="$HOME/.config/google-drive-mcp/gcp-oauth.keys.json" \
  --env GOOGLE_DRIVE_MCP_SCOPES="drive,drive.file,documents,spreadsheets,presentations" \
  -- npx -y @piotr-agier/google-drive-mcp

# 5. GitHub MCP cho Codex dùng PAT từ environment, không ghi token vào repo
# Export GITHUB_PAT_TOKEN bằng secret manager hoặc terminal hiện tại trước bước này
bash integration/github/scripts/install-codex.sh

# 6. Kiểm tra host và QA MCP stack
bash scripts/doctor-agent.sh --agent=codex
bash integration/github/scripts/doctor-stack.sh --agent=codex
```

Windows PowerShell:

```powershell
.\scripts\setup.ps1 -Agent codex -Profile core -Yes
.\scripts\setup.ps1 -Agent antigravity -Profile core -Yes
.\scripts\setup.ps1 -Agent claude -Profile core -Yes
.\scripts\setup.ps1 -Agent antigravity -Profile full -Yes
```

Không commit Plane API key, OAuth credential hoặc token. Có thể tạo profile định tuyến cục bộ từ `integration/plane/ACCOUNT-PROFILE.example.md` và `integration/google-drive/ACCOUNT-PROFILE.example.md`.

Với Postman trên Antigravity, setup tự thêm hoặc bật `mcpServers.postman`, cài local Postman CLI và Newman, đồng thời giữ nguyên các MCP khác. Sau setup, restart Antigravity, chạy `/mcp` và đăng nhập Postman qua OAuth; không cần sửa JSON

Google Drive MCP lần đầu cần cấu hình Google Cloud project, APIs, Audience, scopes và OAuth Desktop client theo [GOOGLE_CLOUD_OAUTH_SETUP.md](./integration/google-drive/references/GOOGLE_CLOUD_OAUTH_SETUP.md)

Xem [SETUP-GUIDE.md](./SETUP-GUIDE.md) và [WINDOWS-SETUP.md](./WINDOWS-SETUP.md). GitHub MCP có guide riêng cho [Codex](./integration/github/references/codex-github-mcp-vi.md) và [Antigravity](./integration/github/references/antigravity-github-mcp-vi.md)

## API Keys (cho AI models)

Bộ skill này dùng AI model (Claude, GPT, Gemini) cho một số tác vụ (vd support-testcase-authoring có thể dùng AI để suggest test cases). Hỗ trợ 3 cách config:

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
