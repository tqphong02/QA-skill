# Playwright POM Automation — Skill template cho project QA

Template scaffold + quy trình viết test Playwright + TypeScript theo **Page Object Model**, deterministic, chạy trong CI. **Project-agnostic** — không hardcode domain/URL/business logic; mỗi project adapt theo `PLACEHOLDERS.md`.

## 📚 Tài liệu

- **[README.md](README.md)** (file này) — quickstart + directory map ⭐ **bắt đầu từ đây**
- **[assets/templates/](assets/templates/)** — folder scaffold copy vào project thật
- **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)** — danh sách placeholder cần fill
- **[SKILL.md](SKILL.md)** — quy trình chi tiết (AI đọc khi kích hoạt; **human thường bỏ qua**)
- **[references/](references/)** — UI/API/perf/CI patterns (đọc khi cần deep-dive)

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
├── fixtures/                      ← auth, test-data, session, env, global setup/teardown
├── tests/
│   ├── ui/                          @ui    — browser-driven, per-page
│   ├── api/                         @api   — request-level, no browser
│   ├── functional/                  @functional — E2E business flow
│   └── performance/                 @perf  — Playwright + k6 (Tier 2)
├── sessions/                      ← runtime-generated auth state (gitignored) — xem README riêng
├── testdata/                      ← runtime-generated test data (gitignored) — xem README riêng
├── scripts/                       ← CI helpers (check-placeholders.sh)
└── testcases/                     ← manual test case Excel template
```

## ➕ Thêm page mới (4 bước)

1. Tạo `selectors/<feature>.selectors.ts` — gồm raw `as const` + factory `build<Feature>Locators(page)` + type alias
2. Thêm `export * from './<feature>.selectors';` vào `selectors/index.ts`
3. Tạo `pages/<feature>.page.ts` extend `BasePage`, import từ selectors (xem `pages/example.page.ts` hoặc `pages/dashboard.page.ts`)
4. Viết `tests/ui/<feature>.ui.spec.ts` — tag `@ui`, instantiate page object trong `beforeEach`

Chi tiết POM convention xem **[references/ui-testing.md](references/ui-testing.md)**.

## ✅ Validation

```bash
npm run placeholder-check        # quét <UPPERCASE_SNAKE> còn sót
npm run lint                     # tsc --noEmit + eslint
```

Chi tiết placeholder semantics xem **[assets/templates/PLACEHOLDERS.md](assets/templates/PLACEHOLDERS.md)**.

## 🔄 CI/CD

`Jenkinsfile` + `github-actions-ci.yml` đã có sẵn (template, không hardcode secrets). Fill secrets trong CI dashboard:

- `API_BASE_URL`, `UI_BASE_URL` — Jenkins Credentials / GitHub Secrets
- `TEST_USER`, `TEST_PASS` — Jenkins Credentials / GitHub Secrets

**KHÔNG commit secrets vào YAML** — xem **[references/cicd.md](references/cicd.md)**.

## 🔗 Skill liên quan

- **[qa-run](../qa-run/)** — exploratory QA dùng MCP Playwright (live AI-driven)
- **[testcase-template](../testcase-template/)** — sinh test case Excel theo template team
