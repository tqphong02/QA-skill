# Tests Folder

Chứa 4 loại test theo **tag**. Mỗi test trong `describe()` PHẢI có tag tương ứng để CI filter được.

## 🏷️ Tag cheat-sheet

| Folder | Tag | Lệnh filter | Đặc điểm |
|---|---|---|---|
| `tests/ui/` | `@ui` | `npx playwright test --grep @ui` | Browser-driven, per-page/component |
| `tests/api/` | `@api` | `npx playwright test --grep @api` | Request-level, không browser |
| `tests/functional/` | `@functional` | `npx playwright test --grep @functional` | E2E business flow (UI + API) |
| `tests/performance/` | `@perf` | `npx playwright test --grep @perf` | Smoke perf gate; k6 cho scale (Tier 2) |

## 📄 Quy ước đặt tên file

- `tests/ui/<feature>.ui.spec.ts` — 1 spec cho 1 page hoặc component
- `tests/api/<endpoint>.api.spec.ts` — 1 spec cho 1 endpoint hoặc resource (CRUD)
- `tests/functional/<flow>.functional.spec.ts` — 1 spec cho 1 business flow spanning UI + API
- `tests/performance/k6-*.js` — k6 script (Tier 2); Playwright `*.perf.spec.ts` cho Tier 1

## 📚 Quy ước viết spec

1. **Tag mỗi test** (`test('happy path @ui', ...)`) → CI filter chính xác.
2. **KHÔNG raw `page.locator(...)` trong spec** — instantiate Page Object trong `beforeEach`, gọi method.
3. **`expect()` chỉ ở spec** — không assert trong Page Object method.
4. **Một intent / test** — split flow dài thành nhiều test nhỏ (login → create → delete = 3 test riêng).
5. **Cleanup data tạo ra** — exact ID trong `finally`/fixture teardown; chỉ dùng `afterAll` cho serial worker-owned lifecycle.
6. **Parallel data isolation** — import `test` từ `fixtures/data-driven`, không dùng chung account/record/file mutable.

## 📂 Example files hiện có

- `tests/ui/example.ui.spec.ts` — Login happy path + 2 negative (`@ui`)
- `tests/ui/example.data-driven.ui.spec.ts` — typed case rows + isolated runtime data (`@data-driven`)
- `tests/api/example.api.spec.ts` — CRUD lifecycle (`@api`)
- `tests/functional/example.functional.spec.ts` — business flow span UI + API (`@functional`)
- `tests/performance/k6-load-test.js` — k6 load test (Tier 2)
- `tests/performance/performance-contract.example.json` — workload, approval, threshold và abort condition cho k6 load lớn hơn một user

## 🔗 Reference

- **[references/ui-testing.md](../../../references/ui-testing.md)** — POM pattern, locator priority, spec convention
- **[references/api-testing.md](../../../references/api-testing.md)** — request-level + zod schema + auth fixture
- **[references/data-driven-testing.md](../../../references/data-driven-testing.md)** — typed datasets + parallel worker/test isolation
- **[references/performance-testing.md](../../../references/performance-testing.md)** — Tier 1 Playwright + Tier 2 k6 escalation
