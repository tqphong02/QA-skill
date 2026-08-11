# Testcases Template — `<Resource>` API

> **Đây là TEMPLATE cho AI khác đọc skill này để generate code automation**.
> KHÔNG hardcode domain/User CRUD cụ thể. AI đọc template này → fill theo resource của user.
>
> **Mục đích**: User cung cấp manual testcase (markdown/csv/Excel) → AI generate file automation `.spec.ts` mapping 1:1.

---

## Cách dùng

1. User copy file này → đổi tên thành `<resource>.md` (vd: `user.md`, `order.md`).
2. Điền các field có `<placeholder>` theo resource của project.
3. AI (đọc skill `dynamic-web-automation`) sẽ map từng row testcase → 1 `test()` block.

## UI/functional execution contract

When the testcase is a browser flow, use the shared `execution` contract from `support/testcase-authoring/references/execution-contract.md`. The generated `.automation.json` companion is the lossless POM source; Markdown is the readable companion

- `entry`: route, role, starting state and test data
- `steps`: ordered atomic `[S01]`, `[S02]` actions with `target.key`, semantic target hints, wait signal and step assertions
- `outcome.assertions`: final business oracle
- `cleanup`: required when the flow mutates data

The `target.key` is not an XPath. The POM agent must inspect the live DOM, verify the selected locator and record `selector-evidence/<feature>.json` before generating selector code

---

## Resource Info

```
Resource name:    <vd: User, Order, Product>
Endpoint base:    <vd: /api/users, /api/orders>
Auth required:    <Yes/No>
Resource schema:  <link tới file schema nếu có, vd: src/types/user.ts>
```

---

## Endpoint Summary

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `<vd: /api/<resource>>` | `<Yes/No>` | `<List/get all>` |
| GET | `<vd: /api/<resource>/:id>` | `<Yes/No>` | `<Get by id>` |
| POST | `<vd: /api/<resource>>` | `<Yes/No>` | `<Create new>` |
| PUT | `<vd: /api/<resource>/:id>` | `<Yes/No>` | `<Update>` |
| DELETE | `<vd: /api/<resource>/:id>` | `<Yes/No>` | `<Delete>` |
| `<PATCH>` | `<vd: /api/<resource>/:id>` | `<Yes/No>` | `<Partial update>` |

> AI: thêm/bớt endpoint tùy resource thật của project.

---

## Testcase Table — 8 loại chuẩn

> AI: mỗi resource nên có **đủ 8 loại** (happy / alternative / validation / edge / negative / error / additional).
> Nếu resource không áp dụng được loại nào → giải thích lý do hoặc bỏ qua.

| ID | Type | Description | Pre-conditions | Test data | Steps | Expected | Priority |
|---|---|---|---|---|---|---|---|
| `TC_<RESOURCE>_01` | happy | `<mô tả intent trong 1 câu>` | `<điều kiện trước>` | `<input cụ thể>` | `1. <step>` | `<kết quả đo được>` | High |
| `TC_<RESOURCE>_02` | happy | ... | ... | ... | ... | ... | High |
| `TC_<RESOURCE>_03` | alternative | `<cách khác cùng kết quả OK>` | ... | ... | ... | ... | Medium |
| `TC_<RESOURCE>_04` | validation | `<required/format/constraint>` | ... | ... | ... | ... | High |
| `TC_<RESOURCE>_05` | edge | `<boundary: min/max/empty/long>` | ... | ... | ... | ... | Medium |
| `TC_<RESOURCE>_06` | negative | `<input sai, unauthorized>` | ... | ... | ... | ... | High |
| `TC_<RESOURCE>_07` | error | `<server/network fail>` | ... | ... | ... | ... | Medium |
| `TC_<RESOURCE>_08` | additional | `<AI thêm ngoài AC, flag rõ>` | ... | ... | ... | ... | Low |

> **Convention ID**: `TC_<FEATURE>_<NN>` (vd: `TC_USER_01`, `TC_ORDER_03`).
> **Testcase ID ổn định**: không đổi ID cũ khi thêm hoặc sắp xếp lại testcase; khoảng trống ID được phép. Chỉ STT dòng trong Excel phải liên tục.
> **Priority**: High (blocker/critical) / Medium (normal) / Low (minor/trivial).

### 8 loại testcase — định nghĩa (từ `support-testcase-authoring` skill)

| # | Type | Test cái gì | Khi nào dùng |
|---|---|---|---|
| 1 | `happy` | Flow đúng, input hợp lệ → phải PASS | Mỗi endpoint method GET/POST/PUT/DELETE cần ít nhất 1 |
| 2 | `alternative` | Cách khác cùng kết quả OK | Filter khác nhau, sort khác nhau, params khác |
| 3 | `validation` | Required/format/constraint | Field bắt buộc, format email, regex, min/max length |
| 4 | `edge` | Boundary: min/max/empty/long | Min length, max length, exact boundary, 0, 1, rỗng |
| 5 | `negative` | Input sai, unauthorized, sai flow | Wrong id, expired token, missing auth, wrong role |
| 6 | `error` | Server/network fail, graceful | 500, timeout, disconnect, rate limit |
| 7 | `ui` | Display/layout (cho UI tests) | Hiển thị, position, color — **KHÔNG áp dụng cho API** |
| 8 | `additional` | AI thêm ngoài AC, flag rõ | Security (SQL/XSS), i18n, Unicode, performance |

---

## Traceability — Automation

> AI: sau khi generate `.spec.ts`, mapping mỗi TC row → 1 `test()` block với name `<TC_ID> [<type>] — <Description>`.

```
TC_<RESOURCE>_01..NN [happy]        → N test() blocks
TC_<RESOURCE>_NN [alternative]      → 1 test()
TC_<RESOURCE>_NN..NN [validation]   → M test() blocks
TC_<RESOURCE>_NN..NN [edge]         → K test() blocks
TC_<RESOURCE>_NN..NN [negative]     → P test() blocks
TC_<RESOURCE>_NN..NN [error]        → Q test() blocks (mock via page.route())
TC_<RESOURCE>_NN..NN [additional]   → R test() blocks (flag @additional trong Allure)
```

**Verify**:
```bash
# Đếm testcase rows trong file này
grep -c "^| \`TC_" <resource>.md
# → N+M+K+P+Q+R

# Đếm test() trong spec file (sau khi AI generate)
grep -c "test('TC_<RESOURCE>_" tests/api/<resource>.api.spec.ts
# → phải khớp N+M+K+P+Q+R

# UI/functional suite: verify the exact Markdown source and selector evidence
npm run pom-plan -- --manifest testcases/<resource>.automation.json
npm run traceability -- --testcases testcases/<resource>.md --manifest testcases/<resource>.automation.json
```

---

## JSON Schema

> AI: nếu có schema định nghĩa, dùng zod trong spec file để validate response. Mỗi schema → 1 file `schemas/<resource>.schema.ts`.

```typescript
// Schema example — AI generate từ OpenAPI/Swagger hoặc từ description trong testcase
const <Resource>Schema = z.object({
  id: z.string().uuid(),
  // ... các field khác
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

---

## Cleanup Policy

> AI: spec file PHẢI có cleanup logic. Mỗi resource tạo ra → xóa theo exact ID trong `finally` hoặc fixture teardown. Chỉ dùng `afterAll` cho serial lifecycle do một worker sở hữu riêng.

```typescript
test('create resource', async ({ testData }) => {
  let createdId: string | undefined;
  try {
    createdId = await createResource({ externalKey: testData.caseKey('<TC_ID>') });
    // assertions
  } finally {
    if (createdId) await api.delete(`/api/<resource>/${createdId}`, token);
  }
});
```

> Xem chi tiết cleanup pattern ở `fixtures/test-data.ts` (GenericBuilder dùng `Partial<T>`).

---

## Ví dụ — Resource User

> AI đọc phần này để hiểu cách fill, SAU ĐÓ xóa phần này và replace bằng resource thật.

```
Resource: User
Endpoint: /api/users
Auth: Yes

Testcase row mẫu:
| TC_USER_01 | happy | List users | Có auth token | - | 1. GET /api/users | Status 200, array User[] | High |
```

→ AI generate trong `tests/api/users.api.spec.ts`:
```typescript
test('TC_USER_01 [happy] — List users @smoke', async () => {
  const res = await api.get('/api/users', token);
  expect(res.status()).toBe(200);
  // ...
});
```

---

## Checklist khi fill template

- [ ] Endpoint summary đúng với API thật (check OpenAPI/Swagger)
- [ ] Đủ 8 loại testcase (hoặc giải thích loại nào không áp dụng)
- [ ] Mỗi testcase có TestCase ID unique (`TC_<RESOURCE>_<NN>`)
- [ ] Test data cụ thể, đo được (không mơ hồ "giá trị bất kỳ")
- [ ] Expected result đo được (status code, schema field, message cụ thể)
- [ ] Priority phản ánh risk (login = High, format = Medium, cosmetic = Low)
- [ ] Cleanup policy đã ghi rõ (test nào tạo data → phải delete)
