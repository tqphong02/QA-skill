# Testcase Execution & Playwright POM — Skill template cho project QA

Một workflow deterministic để build Page Object Model, chạy Playwright browser, thu evidence cùng session và trả verdict testcase. **Project-agnostic** — không hardcode domain/URL/business logic; mỗi project adapt theo `PLACEHOLDERS.md`.

## 📚 Tài liệu

- **[README.md](README.md)** (file này) — quickstart + directory map ⭐ **bắt đầu từ đây**
- **[assets/templates/](assets/templates/)** — folder scaffold copy vào project thật
- **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)** — danh sách placeholder cần fill
- **[SKILL.md](SKILL.md)** — quy trình chi tiết (AI đọc khi kích hoạt; **human thường bỏ qua**)
- **[references/](references/)** — UI/API/DDT/perf/CI patterns (đọc khi cần deep-dive)

## 🚀 Quickstart

```bash
# Bước 1: Copy template + bootstrap tự động
cp -r assets/templates <your-project>/qa
cd <your-project>/qa
npm run bootstrap                # tự cài dependency, Chromium, typecheck và copy .env nếu thiếu

# Bước 2: Sửa .env + chạy test
#   Mở .env — fill 4 giá trị REQUIRED:
#     API_BASE_URL, UI_BASE_URL, TEST_USER, TEST_PASS
npm run test:ui                  # @ui          — browser-driven
# npm run test:api               # @api         — request-level
# npm run test:functional        # @functional  — E2E business flow
```

> Tip: `npm run bootstrap` idempotent — chạy lại không lỗi. Nó kiểm tra/cài dependency trong project-local, chạy `npx --no-install playwright install chromium`, typecheck, rồi hướng dẫn bước tiếp theo.

**Xem report:**
```bash
npm run test:report              # Playwright HTML
npm run allure:gen && npm run allure:open    # Allure
```

## 📁 Cấu trúc

```
assets/templates/
├── README.md                      ← file này
├── package.json                   ← scripts + version-pinned deps
├── playwright.config.ts           ← baseURL, projects, reporters
├── tsconfig.json
├── .env.example                   ← copy thành .env, fill REQUIRED vars
├── Jenkinsfile                    ← CI template
├── github-actions-ci.yml          ← CI template
├── PLACEHOLDERS.md                ← danh sách <UPPERCASE_SNAKE> cần fill
├── pages/                         ← Page Object classes (1 class / 1 page)
│   ├── base.page.ts                  BasePage abstract — waitForLoad, goto, waitForResponse, textOf
│   ├── example.page.ts               LoginPage mẫu — constructor + getters + actions
│   └── dashboard.page.ts             DashboardPage mẫu — flat (table + pagination)
├── selectors/                     ← Centralized locator repo (single source of truth)
│   ├── index.ts                      barrel export
│   ├── login.selectors.ts            LoginLocators mẫu
│   └── dashboard.selectors.ts        DashboardLocators mẫu
├── selector-evidence/              ← Runtime DOM verification per target.key
├── fixtures/                      ← mandatory POM runtime, account/data slots, auth and test-data helpers
├── test-data/                     ← typed, versioned, read-only DDT case rows
├── tests/
│   ├── ui/                          @ui    — browser-driven, per-page
│   ├── api/                         @api   — request-level, no browser
│   ├── functional/                  @functional — E2E business flow
│   └── performance/                 @perf  — Playwright + k6 (Tier 2)
├── sessions/                      ← runtime-generated auth state (gitignored) — xem README riêng
├── testdata/                      ← runtime-generated test data (gitignored) — xem README riêng
├── scripts/                       ← unified testcase/POM runner, traceability, plan và CI helpers
├── quality-gates.json             ← thresholds for failed/flaky/evidence/duration/coverage
└── testcases/                     ← manual test case Excel template
```

`assets/templates/` là phần reusable của skill và được copy sang project automation thật. Không đặt `.env` thật, credential, auth/storage state, live selector evidence, testcase hay runtime data của bất kỳ project nào vào repository skill; các file đó thuộc project đích. Template đã có sẵn `.env.example`, `fixtures/`, `test-data/` và `testdata/` để project đích tiếp tục dùng

## ➕ Thêm page mới (6 bước)

1. Run a bounded `.automation.json` slice through `npm run pom-plan -- --group <name> --max-cases 20`, then use the same-session Browser MCP to discover every selected target key
2. Export Browser MCP selector evidence and pass it to `npm run discover:selectors -- --browser-mcp-evidence <file>`; the command blocks guessed XPath and non-MCP discovery by default
3. Tạo `selectors/<feature>.selectors.ts` — gồm runtime-verified locator factory + type alias
4. Thêm `export * from './<feature>.selectors';` vào `selectors/index.ts`
5. Tạo `pages/<feature>.page.ts` extend `BasePage`, import từ selectors (xem `pages/example.page.ts` hoặc `pages/dashboard.page.ts`)
6. Viết `tests/ui/<feature>.ui.spec.ts` — tag `@ui`, instantiate page object trong `beforeEach`

Chi tiết POM convention xem **[references/ui-testing.md](references/ui-testing.md)**.

## 🧪 Data-Driven Testing và parallel

- Khai báo case rows typed/read-only trong `test-data/cases/`
- Tạo một test riêng cho mỗi row bằng `for...of`
- Dùng `fixtures/data-driven.ts` để sinh email, resource key và namespace khác nhau theo run/project/worker/test/retry
- Spec sinh từ manifest phải import `test`/`expect` qua `fixtures/pom`; runtime chọn account + dataset theo `parallelIndex`
- Nếu test thay đổi dữ liệu gắn với account, cấu hình `QA_TEST_ACCOUNTS_JSON` và `QA_TEST_DATASETS_JSON` đủ ít nhất bằng số workers; xem `.env.parallel.example`
- Không dùng chung một JSON runtime, record, cart, tenant hoặc account giữa các worker

Xem **[references/data-driven-testing.md](references/data-driven-testing.md)** và template `tests/ui/example.data-driven.ui.spec.ts`.

## ✅ Validation

```bash
npm run placeholder-check        # quét <UPPERCASE_SNAKE> còn sót
npm run lint                     # tsc --noEmit + eslint
npm run quality-gate:config      # kiểm tra cấu hình quality gate
# Sau khi Playwright tạo reports/playwright.json:
npm run quality-gate              # đánh giá quality gate và ghi reports/quality-gate.json
npm run pom-plan -- --manifest testcases/<feature>.automation.json --group <group> --max-cases 20
npm run traceability -- --testcases testcases/<feature>.md --manifest testcases/<feature>.automation.json --require-browser-mcp --app-build "$QA_APP_BUILD"
npm run runtime-scaffold
npm run testcase-workflow -- --phase plan --manifest testcases/<feature>.automation.json --group <group>
npm run testcase-workflow -- --phase execute --manifest testcases/<feature>.automation.json --testcases testcases/<feature>.md --group <group> --app-build "$QA_APP_BUILD"
```

Chi tiết placeholder semantics xem **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)**.

`testcase-workflow --phase execute` chỉ mở browser sau khi runtime-scaffold và traceability PASS, bật screenshot/video/trace và tạo `reports/testcase-pom-execution.json` với `PASS|FAILED|N/A|UNTEST`. Evidence browser nằm trong `evidence/test-results/`, HTML ở `evidence/html/`; các folder này chỉ xuất hiện khi browser test bắt đầu. `fixtures/` là source code được tạo trong BUILD. `traceability` kiểm tra source hash, Testcase ID, action/value/assertion, cleanup, role/RBAC và selector evidence theo build/freshness. Xem **[references/testcase-execution.md](references/testcase-execution.md)** và **[references/automation-audit.md](references/automation-audit.md)**

`testcase-workflow --phase execute` tự gọi `scripts/bootstrap-playwright.mjs` trước traceability/browser execution. Vì vậy project đích không được phụ thuộc vào Playwright cài global; dùng `--skip-bootstrap` chỉ khi runtime đã được kiểm tra độc lập

## 🔄 CI/CD

`Jenkinsfile` + `github-actions-ci.yml` đã có sẵn (template, không hardcode secrets). Fill secrets trong CI dashboard:

- `API_BASE_URL`, `UI_BASE_URL` — Jenkins Credentials / GitHub Secrets
- `TEST_USER`, `TEST_PASS` — Jenkins Credentials / GitHub Secrets

**KHÔNG commit secrets vào YAML** — xem **[references/cicd.md](references/cicd.md)**.

Quality gate phải giữ lại first-attempt/retry evidence, phân loại flaky riêng và không biến retry-pass thành PASS sạch. Xem [references/FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) và [references/AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md)

## 🔗 Skill liên quan

- **[dynamic-web-exploratory](../web-exploratory/)** — chỉ dùng cho exploratory/ad-hoc hoặc ticket retest không có deterministic suite
- **[support-testcase-authoring](../../support/testcase-authoring/)** — sinh test case Excel theo template team
