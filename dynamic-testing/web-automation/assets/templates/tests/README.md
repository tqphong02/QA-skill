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

- `tests/ui/<module>.ui.spec.ts` — đúng 1 spec cho 1 module chức năng; batch plan không được tách thành nhiều file spec
- Mỗi module cũng có đúng 1 `pages/<module>.page.ts` và 1 `selectors/<module>.selectors.ts`; không gom toàn hệ thống vào một Page Object/selector file
- `tests/api/<endpoint>.api.spec.ts` — 1 spec cho 1 endpoint hoặc resource (CRUD)
- `tests/functional/<flow>.functional.spec.ts` — 1 spec cho 1 business flow spanning UI + API
- `tests/performance/k6-*.js` — k6 script (Tier 2); Playwright `*.perf.spec.ts` cho Tier 1

## 📚 Quy ước viết spec

1. **Tag mỗi test** (`test('happy path @ui', ...)`) → CI filter chính xác.
2. **KHÔNG raw `page.locator(...)` hoặc `page.getBy*()` trong spec** — instantiate Page Object trong `beforeEach`, gọi method
3. Mỗi UI target phải map từ `execution.steps[].target.key` và có runtime selector evidence trước khi code được xem là sẵn sàng
4. **`expect()` chỉ ở spec** — không assert trong Page Object method.
5. **Một intent / test** — split flow dài thành nhiều test nhỏ (login → create → delete = 3 test riêng).
6. **Cleanup data tạo ra** — exact ID trong `finally`/fixture teardown; chỉ dùng `afterAll` cho serial worker-owned lifecycle.
7. **Parallel data isolation** — import `test` từ `fixtures/data-driven`, không dùng chung account/record/file mutable.

Sau khi generate code, chạy `npm run pom-plan -- --manifest <generated-automation-manifest>` rồi `npm run traceability -- --testcases <generated-markdown> --manifest <generated-automation-manifest>` để kiểm tra source hash, behavior/RBAC markers, TestCase ID và selector evidence

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
- **[references/automation-audit.md](../../../references/automation-audit.md)** — testcase → spec → selector và token measurement
