# Playwright POM Automation — Skill template cho project QA

Template scaffold + quy trình viết test Playwright + TypeScript theo **Page Object Model**, deterministic, chạy trong CI. **Project-agnostic** — không hardcode domain/URL/business logic; mỗi project adapt theo `PLACEHOLDERS.md`.

## 📚 Tài liệu

- **[README.md](README.md)** (file này) — quickstart + directory map ⭐ **bắt đầu từ đây**
- **[assets/templates/](assets/templates/)** — folder scaffold copy vào project thật
- **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)** — danh sách placeholder cần fill
- **[SKILL.md](SKILL.md)** — quy trình chi tiết (AI đọc khi kích hoạt; **human thường bỏ qua**)
- **[references/](references/)** — UI/API/DDT/perf/CI patterns (đọc khi cần deep-dive)

## 🚀 Quickstart

```bash
# Bước 1: Copy template + cài đặt tự động
cp -r assets/templates <your-project>/qa
cd <your-project>/qa
npm install                      # postinstall hook tự cài Chromium
npm run bootstrap                # copy .env nếu thiếu + in hướng dẫn tiếp

# Bước 2: Sửa .env + chạy test
#   Mở .env — fill 4 giá trị REQUIRED:
#     API_BASE_URL, UI_BASE_URL, TEST_USER, TEST_PASS
npm run test:ui                  # @ui          — browser-driven
# npm run test:api               # @api         — request-level
# npm run test:functional        # @functional  — E2E business flow
```

> Tip: `npm run bootstrap` idempotent — chạy lại không lỗi. Nó check `node_modules/`, browser status, `.env` rồi hướng dẫn bước tiếp theo.

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
├── fixtures/                      ← auth, test-data, session, env, global setup/teardown
├── test-data/                     ← typed, versioned, read-only DDT case rows
├── tests/
│   ├── ui/                          @ui    — browser-driven, per-page
│   ├── api/                         @api   — request-level, no browser
│   ├── functional/                  @functional — E2E business flow
│   └── performance/                 @perf  — Playwright + k6 (Tier 2)
├── sessions/                      ← runtime-generated auth state (gitignored) — xem README riêng
├── testdata/                      ← runtime-generated test data (gitignored) — xem README riêng
├── scripts/                       ← CI helpers (check-placeholders.sh)
├── quality-gates.json             ← thresholds for failed/flaky/evidence/duration/coverage
└── testcases/                     ← manual test case Excel template
```

`assets/templates/` là phần reusable của skill và được copy sang project automation thật. Không đặt `.env` thật, credential, auth/storage state, live selector evidence, testcase hay runtime data của bất kỳ project nào vào repository skill; các file đó thuộc project đích. Template đã có sẵn `.env.example`, `fixtures/`, `test-data/` và `testdata/` để project đích tiếp tục dùng

## ➕ Thêm page mới (4 bước)

1. Read the testcase `execution` contract, then run selector discovery for every `target.key`
2. Tạo `selectors/<feature>.selectors.ts` — gồm runtime-verified locator factory + type alias
3. Thêm `export * from './<feature>.selectors';` vào `selectors/index.ts`
4. Tạo `pages/<feature>.page.ts` extend `BasePage`, import từ selectors (xem `pages/example.page.ts` hoặc `pages/dashboard.page.ts`)
5. Viết `tests/ui/<feature>.ui.spec.ts` — tag `@ui`, instantiate page object trong `beforeEach`

Chi tiết POM convention xem **[references/ui-testing.md](references/ui-testing.md)**.

## 🧪 Data-Driven Testing và parallel

- Khai báo case rows typed/read-only trong `test-data/cases/`
- Tạo một test riêng cho mỗi row bằng `for...of`
- Dùng `fixtures/data-driven.ts` để sinh email, resource key và namespace khác nhau theo run/project/worker/test/retry
- Nếu test thay đổi dữ liệu gắn với account, cấu hình `TEST_ACCOUNTS_JSON` đủ ít nhất bằng số parallel slots
- Không dùng chung một JSON runtime, record, cart, tenant hoặc account giữa các worker

Xem **[references/data-driven-testing.md](references/data-driven-testing.md)** và template `tests/ui/example.data-driven.ui.spec.ts`.

## ✅ Validation

```bash
npm run placeholder-check        # quét <UPPERCASE_SNAKE> còn sót
npm run lint                     # tsc --noEmit + eslint
npm run quality-gate:config      # kiểm tra cấu hình quality gate
# Sau khi Playwright tạo reports/playwright.json:
npm run quality-gate              # đánh giá quality gate và ghi reports/quality-gate.json
npm run traceability -- --testcases testcases/<feature>.md
```

Chi tiết placeholder semantics xem **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)**.

`traceability` tạo `reports/testcase-automation-traceability.json`: file này ghi testcase Markdown đã đọc (kèm SHA-256), mapping TestCase ID → spec, target key → selector evidence và token measurement. Xem **[references/automation-audit.md](references/automation-audit.md)** để phân biệt provider-reported token với estimate

## 🔄 CI/CD

`Jenkinsfile` + `github-actions-ci.yml` đã có sẵn (template, không hardcode secrets). Fill secrets trong CI dashboard:

- `API_BASE_URL`, `UI_BASE_URL` — Jenkins Credentials / GitHub Secrets
- `TEST_USER`, `TEST_PASS` — Jenkins Credentials / GitHub Secrets

**KHÔNG commit secrets vào YAML** — xem **[references/cicd.md](references/cicd.md)**.

Quality gate phải giữ lại first-attempt/retry evidence, phân loại flaky riêng và không biến retry-pass thành PASS sạch. Xem [references/FLAKY-TEST-MANAGEMENT.md](references/FLAKY-TEST-MANAGEMENT.md) và [references/AUTOMATION-QUALITY-GATES.md](references/AUTOMATION-QUALITY-GATES.md)

## 🔗 Skill liên quan

- **[qa-run](../qa-run/)** — exploratory QA dùng MCP Playwright (live AI-driven)
- **[testcase-template](../testcase-template/)** — sinh test case Excel theo template team
