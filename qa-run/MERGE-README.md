# MERGE-README — Hướng dẫn dùng 2 helper mới + 6 phần đã merge

> Tài liệu này bổ sung cho `SKILL.md` chính. Tóm tắt cách dùng 2 file helper vừa tạo + 6 section mới được merge từ `anhtester/codex-testing-kit` (Anh Tester, MIT, 7⭐).

---

## 1. Tổng quan merge

Mượn concept từ **26 skill + 6 rule** của codex-testing-kit, port sang 3 skill Claude Code của bạn:

| Skill Claude | Section mới | Nguồn codex | Mục đích |
|---|---|---|---|
| `qa-run` | **A.1** Test Data Generator | `$generate-test-data` | Sinh data unique + traceable cho probe |
| `qa-run` | **A.2** Flaky Detector | `$analyze-flaky-tests` | Tránh log bug "ảo" do timing/race |
| `playwright-pom-automation` | **A.1** Locator Strategy + Healer | `$generate-locator` + `$locator-healer-agent` | Locator ổn định + tự fallback khi UI đổi |
| `playwright-pom-automation` | **A.2** UI Flow Generator | `$generate-automation-from-ui-flow` | Auto-generate page object + spec từ DOM thật |
| `playwright-pom-automation` | **A.3** API Test Generator | `$generate-api-tests-from-swagger` | Auto-generate API test từ OpenAPI spec |
| `testcase-template` | **A.1** Plane Fetch | `$fetch-jira-requirements` | Auto-fetch ticket Plane từ URL, không hỏi user |

→ 6 section mới nằm ở **cuối** mỗi file `SKILL.md`, có tiêu đề `## A.x` và `## A.x.y` để dễ tham chiếu.

---

## 2. Helper #1 — `tdata.mjs` (Test Data Generator)

**Vị trí:** `~/.claude/skills/qa-run/lib/tdata.mjs`

**Dùng trong Node script:**
```js
import { tdata, emailOf, nameOf, parseTdata } from '~/.../qa-run/lib/tdata.mjs';

// Sinh token traceable
const token = tdata('ing', 'createUser');
// → "ing_createuser_20260702143641_6583"

// Sinh email test (domain .test.local — RFC 6761 reserved, không bao giờ route)
const e = emailOf('wf', 'loginValid');
// → "wf_loginvalid_20260702143705_7B59@test.local"

// Sinh tên hiển thị
const n = nameOf('qlt', 'newRule', 'Rule');
// → "Rule qlt_newrule_20260702143720_A1B2"

// Parse ngược để debug
parseTdata('ing_createuser_20260702143641_6583');
// → { prefix: 'ing', testName: 'createuser', createdAt: Date, rand: 'A3F2' }
```

**Convention:**
- `prefix` viết tắt feature/module: `ing` (ingestion), `wf` (workflows), `qlt` (quality), `dash` (dashboard), `api` (api tests), `exp` (export), `cat` (catalog)
- `testName` snake/camel case: `createUser`, `loginValid`, `searchBounded`, `invalidRange`
- Mọi data tạo → ghi `Trace:` ở header bằng chứng (FINDINGS, comment Plane, log)

**Ví dụ end-to-end trong probe:**
```js
import { emailOf, tdata } from '../lib/tdata.mjs';

const e = emailOf('wf', 'createOrder');
const orderName = `Order ${tdata('wf', 'createOrder')}`;

const res = await page.evaluate(async ([base, e, orderName]) => {
  return await fetch(`${base}/api/orders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e, name: orderName }),
  });
}, [BASE, e, orderName]);

console.log(`Trace: tdata('wf','createOrder') → ${e}`);
// → Dev grep 'wf_createorder' trong DB tìm được record
```

---

## 3. Helper #2 — `fetch-plane-issue.sh` (Plane Fetch)

**Vị trí:** `~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh`

**Setup (1 lần):** File `~/.claude/skills/qa-run/config.env` cần có:
```bash
PLANE_API_KEY="plane_pat_xxx"                  # Profile Settings → Personal Access Tokens
PLANE_BASE_URL="https://projects.metasolutions.ai/api/v1"
PLANE_WORKSPACE="mds-team"
```

**Cách dùng:**

```bash
# Cách 1: theo URL đầy đủ
./fetch-plane-issue.sh "https://projects.metasolutions.ai/mds-team/projects/9482533a-c9ca-4be6-be3f-2c74b1b54137/issues/39/"

# Cách 2: theo (project_id, sequence_id)
./fetch-plane-issue.sh 9482533a-c9ca-4be6-be3f-2c74b1b54137 39

# Format text (dễ đọc, dùng cho AI đọc context)
FORMAT=text ./fetch-plane-issue.sh 9482533a-c9ca-4be6-be3f-2c74b1b54137 39

# Kèm comments
WITH_COMMENTS=1 FORMAT=text ./fetch-plane-issue.sh <pid> <seq>

# Lưu ra file
SAVE_OUT=/tmp/issue-39.json ./fetch-plane-issue.sh <pid> <seq>
```

**Output JSON (mặc định):** Full issue: `id`, `name`, `description_html`, `state`, `priority`, `assignees`, `labels`, `target_date`, `start_date`, `created_at`, `updated_at`.

**Output TEXT:** In `name`, `state`, `priority`, `dates`, rồi `description` (HTML đã strip tag thành plain text, cắt 3000 ký tự đầu).

**Lỗi thường gặp:**
- `❌ Thiếu PLANE_API_KEY` → set env trong `.env` hoặc `~/.claude/skills/qa-run/config.env`
- `❌ Không tìm thấy issue #X trong project Y` → check lại `project_id` và `sequence_id`
- `❌ Không parse được URL` → URL phải có dạng `.../projects/<UUID>/issues/<SEQ>/`

---

## 4. Workflow tích hợp trong 3 skill

### `qa-run` (săn bug)

**Trước (cũ):**
```js
// Tự nghĩ email, dễ đụng
const email = `test_${Date.now()}@example.com`;
```

**Sau (merge A.1):**
```js
import { emailOf } from '../lib/tdata.mjs';
const email = emailOf('ing', 'createCustomer');
// → ing_createcustomer_20260702143641_6583@test.local
// + ghi "Trace: tdata('ing','createCustomer')" trong FINDINGS
```

**Khi nghi bug flaky (merge A.2):**
1. Không log bug ngay
2. Chạy probe 3 lần
3. Nếu 1-2/3 fail lung tung → mark flaky, ghi vào `FINDINGS.md` section "⚠ Flaky (chưa log Plane)"
4. Nếu 3/3 fail cùng step → log bug bình thường

### `playwright-pom-automation` (viết auto)

**Locator (merge A.1):**
```typescript
// ❌ Xấu — class dễ vỡ
this.submit = page.locator('.btn-primary.submit');

// ✅ Tốt — role ưu tiên
this.submit = page.getByRole('button', { name: /đăng nhập|login/i });

// ✅ Tốt hơn — fallback chain khi UI đổi
this.submit = this.heal(
  page.getByRole('button', { name: /login/i }),
  [page.getByTestId('login-submit'), page.locator('#login-btn')],
  'login button'
);
```

**UI flow generator (merge A.2) — 4 bước:**
1. AI lái UI thật qua browser 1 lần → hiểu flow
2. `scripts/extract-locators.ts` → ghi `selectors/<page>.json`
3. `scripts/gen-page-from-selectors.ts <ClassName> selectors/<page>.json` → sinh `pages/<page>.page.ts`
4. AI viết spec happy path dựa trên page object

**API test generator (merge A.3):**
1. Có `openapi.yaml` trong project root
2. `npx tsx scripts/gen-api-tests.ts` → sinh `tests/api/<tag>/<opId>.spec.ts` (1 file / endpoint)
3. Refine tay cho edge case, auth, schema

### `testcase-template` (sinh test case Excel)

**Trước (cũ):**
- User paste spec/PRD/ticket nội dung

**Sau (merge A.1):**
- User paste URL Plane → AI tự chạy `fetch-plane-issue.sh`, parse AC, gen Excel
- Không hỏi lại "ticket ở đâu?", "AC là gì?"

**Ví dụ trigger mới:**
> User: "Sinh test case cho ticket https://projects.metasolutions.ai/mds-team/projects/9482533a-.../issues/466/"

> AI:
> 1. Parse URL → `project=9482533a-...`, `seq=466`
> 2. Chạy `FORMAT=text fetch-plane-issue.sh 9482533a-... 466`
> 3. Đọc text: `[iOS] Calendar - Crash app khi tạo mới event`
> 4. Trích AC từ description
> 5. Build JSON → gen Excel

---

## 5. Test nhanh (smoke test)

```bash
# Test tdata.mjs
node -e "import('~/.../qa-run/lib/tdata.mjs').then(m => console.log(m.tdata('demo', 'test')))"
# → demo_test_<14-số YYYYMMDDHHMMSS>_<4-hex>     VD: demo_test_20260702143959_9BA5

# Test fetch-plane-issue.sh
bash ~/.claude/skills/qa-run/scripts/fetch-plane-issue.sh <project_id> <seq_id> 2>&1 | head -20
# → JSON của issue (nếu API key OK)
# → ❌ Thiếu PLANE_API_KEY (nếu chưa set env)
```

---

## 6. Roadmap nếu muốn mở rộng thêm

| Bước | Effort | Giá trị |
|---|---|---|
| Tạo `scripts/probe-flaky.mjs` template (merge A.2 chưa có file) | 30 phút | Trung bình |
| Tạo `scripts/extract-locators.ts` + `gen-page-from-selectors.ts` (merge A.2 code) | 1 giờ | Cao cho project mới |
| Tạo `scripts/gen-api-tests.ts` (merge A.3 code) | 1 giờ | Cao nếu có OpenAPI |
| Rule `delivery_checklist.md` (tách ra `.agents/rules/` như codex) | 2 giờ | Trung bình |

→ Tất cả snippet code đã có sẵn trong 3 file `SKILL.md` phần Appendix, chỉ cần copy ra file riêng.

---

## 7. Nguồn tham khảo

- `anhtester/codex-testing-kit` — https://github.com/anhtester/codex-testing-kit (MIT, 7⭐)
- 26 skill + 6 rule + 3 plan + 10 prompt của Anh Tester
- License: MIT — OK dùng thoải mái, ghi credit nếu build dựa trên
