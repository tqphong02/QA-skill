import re

with open("playwright-pom-automation/SKILL.md", "r", encoding="utf-8") as f:
    content = f.read()

translations = [
    (r"Default dùng Playwright `request` fixture \(`APIRequestContext`\)\.", r"Default to using Playwright `request` fixture (`APIRequestContext`)."),
    (r"Validate response schema với `zod` \(ưu tiên\)", r"Validate response schema with `zod` (priority)"),
    (r"Annotate với `allure\.step\(\)`, `allure\.attachment\(\)` trong UI/API/perf tests", r"Annotate with `allure.step()`, `allure.attachment()` in UI/API/perf tests"),
    (r"k6 → Allure qua JSON output \+ converter \(hoặc Grafana cho live dashboard\)", r"k6 -> Allure via JSON output + converter (or Grafana for live dashboard)"),
    (r"Cấu trúc `reports/`:", r"`reports/` structure:"),
    (r"\*\*5 stages chuẩn\*\* \(cú pháp khác nhau, logic giống\):", r"**5 standard stages** (different syntax, same logic):"),
    (r"`test:ui` \+ `test:api` song song", r"`test:ui` + `test:api` in parallel"),
    (r"\*\*k6\*\*: chạy job/job stage RIÊNG, KHÔNG block main pipeline\.", r"**k6**: run standalone job/stage, DO NOT block main pipeline."),
    (r"\*\*KHÔNG hardcode\*\* trong pipeline file hoặc commit", r"**DO NOT hardcode** in pipeline file or commit"),
    (r"\+ firefox / webkit nếu cần", r"+ firefox / webkit if needed"),
    (r"Tier 2: brew install k6 \(mac\) / xem `references/performance-testing\.md` \(Linux/Windows\)", r"Tier 2: brew install k6 (mac) / see `references/performance-testing.md` (Linux/Windows)"),
    (r"Thêm scripts vào package\.json", r"Add scripts to package.json"),
    (r"Spec dùng `page\.locator\('\.btn-primary'\)` trực tiếp trong spec", r"Spec uses `page.locator('.btn-primary')` directly in spec"),
    (r"Class CSS auto-generated, brittle", r"CSS class auto-generated, brittle"),
    (r"Move vào `selectors/`, dùng `getByRole`/`getByTestId`", r"Move to `selectors/`, use `getByRole`/`getByTestId`"),
    (r"Page Object method có `expect\(\)` bên trong", r"Page Object method has `expect()` inside"),
    (r"Action methods phải thuần túy return, assertion ở spec", r"Action methods must be purely return, assertions in spec"),
    (r"Tách expect ra spec file", r"Extract expect to spec file"),
    (r"Test tạo data nhưng không cleanup", r"Test creates data but no cleanup"),
    (r"DB pollution, test sau fail vì data cũ", r"DB pollution, subsequent tests fail due to old data"),
    (r"Thêm `afterAll` delete", r"Add `afterAll` delete"),
    (r"CI/CD hardcode `API_BASE_URL` hoặc credentials trong YAML", r"CI/CD hardcodes `API_BASE_URL` or credentials in YAML"),
    (r"Secret leak, không rotate được", r"Secret leak, cannot be rotated"),
    (r"Dùng `secrets\.\*` \(GitHub\) hoặc `credentials\(\)` \(Jenkins\)", r"Use `secrets.*` (GitHub) or `credentials()` (Jenkins)"),
    (r"Test chỉ assert `status === 200`", r"Test only asserts `status === 200`"),
    (r"Không verify business rule, chỉ check route có respond", r"Does not verify business rule, only checks if route responds"),
    (r"Thêm schema validation \(zod\), check field quan trọng", r"Add schema validation (zod), check critical fields"),
    (r"Tier 1 perf test chạy 50 concurrent user", r"Tier 1 perf test runs 50 concurrent users"),
    (r"Playwright không scale được", r"Playwright cannot scale"),
    (r"Escalate lên k6 \(Tier 2\)", r"Escalate to k6 (Tier 2)"),
    (r"### Templates \(copy từ `assets/templates/`\)", r"### Templates (copy from `assets/templates/`)"),
    (r"— CI guard chống placeholder chưa fill", r"— CI guard preventing unfilled placeholders"),
    (r"— API test với zod schema, auth fixtures", r"— API tests with zod schema, auth fixtures"),
    (r"— live AI-driven exploratory \(KHÁC với deterministic test-as-code này\)", r"— live AI-driven exploratory (DIFFERENT from this deterministic test-as-code)"),
    (r"— document test case Excel \(KHÁC với bug hunting này\)", r"— document Excel test cases (DIFFERENT from this bug hunting)")
]

for pat, repl in translations:
    content = re.sub(pat, repl, content, flags=re.MULTILINE)

with open("playwright-pom-automation/SKILL_TEMP.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Created playwright-pom-automation/SKILL_TEMP.md with final translations")
