---
name: testcase-template
description: Generate, edit, or review structured testcase Markdown, Excel, or CSV with synchronized Scenario/Testcase IDs and optional RBAC Role × Rule × Testcase coverage from one JSON source. Trigger on test case/scenario writing, RBAC/role-permission testcase matrices, or explicit API testcase requests for endpoints, OpenAPI, Swagger, Postman, or curl. Not for exploratory notes or bug reports. Auto-route; do not require the skill name.
---

# Test Case Template

**Core principle:** Same set of columns — do not invent new columns.

Original template: `assets/Template.xlsx` (1 shared file for ALL projects). All project information (name, code, modules) is configurable from JSON input. **NO need to create separate templates per project**.

> **When to use**: User wants to write Excel test cases according to team standards.
> **DIFFERENT** from `qa-run` (live exploratory) and `playwright-pom-automation` (code automation `.spec.ts`): this skill = document Excel test cases (manual test design).
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI. Members can run immediately with any project after git clone.

## Optional agentmemory context layer

When available, recall confirmed business decisions, Q&A answers and prior testcase design choices for the same project/feature before writing new cases. Use current requirements and the validated JSON source as the oracle; memory must not create a missing expected result or requirement

After Markdown and Excel read-back passes, save only stable testcase IDs, design decisions, assumptions explicitly marked as assumptions and artifact paths. Never save passwords, tokens, cookies, personal data or full sensitive testcase datasets. If agentmemory is unavailable, continue normally

## Cross-model hard gates

Apply this exact order for all models:

1. Choose mode before writing: default to current UI/FUNCTION flow; only use API mode when user explicitly requests writing API testcases or writing testcases for endpoints, OpenAPI/Swagger, Postman or curl; merely mentioning API artifacts is not enough to switch modes
2. If API mode has source files, run `scripts/import-api-spec.py` first; do not manually read and copy endpoints
3. Check `review_required`; if items remain, stop Excel generation and get missing expected from user or documents
4. Read requirement/AC and list requirement IDs before writing cases
5. Choose UI or FUNCTION correctly based on the behavior to prove; do not call a case UI-only just because it operates via dialog/button
6. Split scenario when field, behavior or AC differs; one scenario contains only one specific functional group
7. Create JSON with correct schema, preserve Scenario ID, stable explicit `testcase_id` and requirement reference
8. Run `scripts/gen-testcases.py`; create `<output>.md` before `<output>.xlsx`, with `<output>.automation.json` generated between them and the same `Asia/Ho_Chi_Minh` date
9. Read Markdown first, validate the lossless automation manifest, then compare with Excel: number of cases, Scenario/Testcase ID and design content must match; columns I-M exist only in Excel and are left blank
10. For every new UI/FUNCTION testcase that will be executed or automated, create the structured `execution` contract from [references/execution-contract.md](references/execution-contract.md); F/G/H are the human-readable projection of that contract, not a second source of truth
11. Write every Procedure as a complete manual reproduce script: screen/route → target control → one action → exact value → immediate observation/wait. Never collapse multiple interactions into a summary such as `Nhập email và password rồi click Login`
12. When roles or permissions are in scope, create the top-level `rbac` contract before finalizing cases; every declared role has one explicit expectation per rule, and every required ALLOW/DENY branch maps through `case_ref` to a testcase

If expected is not in requirements, pause that case in a clarification state; do not fabricate business rules.

## The trap this skill exists to prevent

**Freeform columns per author** — each tester invents their own column set, breaking cross-project aggregation and review tooling. Skill enforces a single shared template so test cases from different projects can be queried, compared, and rolled up.

## Process

### 1. Read & extract requirements
**MANDATORY to stick to documents**. Every case must trace to 1 AC. If NO document -> ask user. Plane fetch details: `@references/plane-integration.md`.

### 2. Organize in 2 parts + type order
```
PHẦN 1 — UI: 1.1. USER INTERFACE (kind=ui)    ← col C, xanh nhạt
└─ Group (LOGIN, REGISTER...)                 ← col C, group header
   └─ Scenario (SCN-LOG-001)                  ← col B
      └─ Cases — type order

PHẦN 2 — FUNCTIONAL: 1.2. FUNCTION (kind=function) ← col C, xanh lá
└─ Group (LOGIN, REGISTER...)
   └─ Scenario (SCN-LOG-001)
      └─ Cases — type order
```
**Same feature can exist in both parts** (UI test for display, Functional test for logic). For UI testcases (`kind=ui`), you MUST read [references/ui-testcases.md](references/ui-testcases.md) to follow the UI testing checklist.

**API mode is optional**: only when user requests API testcases, read [references/api-testcases.md](references/api-testcases.md). API cases still go in `1.2. FUNCTION`, use `kind=api` and keep columns B-M. If user does not request API, do not read this reference and continue current flow with `kind=ui` or `kind=function`.

**Rule: 1 scenario = 1 specific functional group** (DO NOT group multiple fields/behaviors):
- Split scenario when **field/input** differs (email validation != password validation -> 2 scenarios)
- Split scenario when **behavior** differs (submit-fail != account-lock)
- Split scenario when **AC** differs (AC3 != AC4 != AC5)
- Same `scenario_name` SHARED across cases IN THE SAME scenario — but DO NOT share scenario_name for validations of different fields

WRONG vs CORRECT examples for login page:
```
❌ WRONG: 1 scenario \"Validation email and password\" groups 6 cases
       (3 cases email validation + 2 cases password validation + 1 case both empty)
       -> Hard for tester to filter, hard to check coverage, ambiguous scenario_name

✅ CORRECT: split 2 separate scenarios
   - SCN-LOG-002 \"Validation email\"        -> email cases (empty, missing @, missing domain, subdomain)
   - SCN-LOG-003 \"Validation password\"     -> password cases (empty, both empty, <8 chars, =8 chars)
   -> Each scenario has 1 clear group, tester can filter, coverage easy to check
```

### 3. Gen cases by type order

**Before writing any case, identify the BB technique:**

- `happy` / `alternative` → Use Case Testing
- `validation` → EP + BVA; if ≥2 combined conditions → **build Decision Table first**
- `edge` → BVA: list min−1, min, min+1, max−1, max, max+1 before writing
- `negative` → EP (invalid partition) + Error Guessing checklist
- `error` → Error Guessing + State Transition
- `additional` → Error Guessing; always flag `Ref: (out-of-spec)`

8 types: `happy → alternative → validation → edge → negative → error → ui → additional`. Full technique guide + JSON examples: `@references/blackbox-techniques.md`.

### 4. Build JSON input
```json
{
  "execution_contract": "required",
  "project": {"code": "BCP", "name": "BCP AI", ...},
  "sections": [{
    "title": "1.2. FUNCTION",
    "kind": "function",
    "groups": [{
      "name": "LOGIN",
      "scenarios": [{
        "scenario_id": "SCN-LOG-001",
        "requirement": "AC-LOGIN-PAGE",
        "scenario_name": "Mở màn hình Đăng nhập",
        "cases": [{
          "testcase_id": "BCP-01",
          "type": "happy", "req": "AC-LOGIN-PAGE",
          "description": "Xác minh rằng người dùng có thể mở màn hình Đăng nhập",
          "priority": "High",
          "execution": {
            "version": 1,
            "mutates": false,
            "entry": {
              "environment": "UAT tại <BASE_URL>",
              "screen": "Đăng nhập",
              "route": "<BASE_URL>/login",
              "role": "Nhân viên",
              "state": ["Tài khoản đang hoạt động", "Trình duyệt chưa có phiên đăng nhập"],
              "permissions": ["Được phép sử dụng chức năng Đăng nhập"],
              "data": [{"name": "Email", "value": "qa.login@example.com", "condition": "Thuộc tài khoản đang hoạt động"}]
            },
            "steps": [{
              "id": "S01",
              "action": "navigate",
              "instruction": "Mở trình duyệt và truy cập trang đăng nhập: <BASE_URL>/login",
              "target": {"key": "login_page", "kind": "page", "name": "Trang đăng nhập", "route": "/login"},
              "wait_for": {"kind": "url", "value": "/login", "text": "Chờ màn hình Đăng nhập hiển thị đầy đủ"},
              "assertions": [{"kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị"}]
            }],
            "outcome": {"assertions": [{"kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị đầy đủ"}]}
          }
        }]
      }]
    }]
  }]
}
```
See [examples/structured-input.json](examples/structured-input.json) for the complete login flow with focus, input, submit, outcome and cleanup
- `scenario_name` (string) — functional group name, **SHARED** for multiple cases in same scenario
- `scenario_id` (string) — scenario code, e.g. `SCN-LOG-001`
- Each case has `type` (1 of 8) + `req` (trace to AC) - MANDATORY
- Every case under `execution_contract=required` has an explicit stable `testcase_id`; adding or reordering cases must not renumber existing automation IDs
- Set top-level `execution_contract` to `required` for every new UI/FUNCTION source. Use `legacy_text_only` only to regenerate an existing text-only source while it is being migrated
- New executable UI/FUNCTION cases have `execution` (version 1), explicit `mutates`, detailed `entry`, ordered `steps`, `outcome.assertions` and `cleanup` when the flow mutates data
- `entry` includes environment, visible starting screen, route, business role, starting state, permissions and named test data; write `Không yêu cầu ...` explicitly when an item is not applicable
- Each `execution.steps[]` has a stable ID, one atomic action, Vietnamese `instruction`, semantic `target`, and a Vietnamese `wait_for.text` or observable assertions; target locators are not guessed in this skill
- `fill`, `select`, `press` and `upload` require an exact value or named test-data reference; every `fill` or `clear` has a separate click/focus step immediately before it
- Cases used by RBAC coverage have a stable `case_ref`; their `execution.entry` includes `role_key` and `rbac_refs` matching the business-facing `role`
- In API mode specifically, each case adds `api` object; see [examples/sample-api-input.json](examples/sample-api-input.json). Without `api` object, generator uses `pre_condition`, `procedure`, `expected` as is

### RBAC Matrix when roles or permissions are in scope

Use the top-level `rbac` object defined by [references/rbac-matrix.schema.json](references/rbac-matrix.schema.json). Keep one canonical normalized rule per `RBAC ID` with module, resource/function, action, data scope, condition, requirement, every declared role's `ALLOW|DENY|N/A|UNRESOLVED` expectation, testcase references, verification status, evidence and Q&A notes

When `qa-run` repository discovery already produced `permission-matrix.json`, use its `permissionEntries` as provenance-aware candidate input and normalize it into this contract. Preserve `REQUIREMENT_ONLY`, `STATIC_CONFIRMED`, conflict and runtime statuses; never upgrade source-only grants to runtime truth. When only requirements are available, build the matrix from confirmed AC/BR and keep missing cells `UNRESOLVED`

The generator always creates the `RBAC Matrix` sheet immediately after `Test cases_App`. When no RBAC rule applies, the sheet says `N/A`; absence of data is never treated as confirmed permission coverage

For every rule with `coverage_required=true`:

- At least one ALLOW role requires an `allow_case_ref`
- At least one DENY role requires a `deny_case_ref`
- A rule containing only ALLOW roles may keep `deny_case_refs=[]`; a rule containing only DENY roles may keep `allow_case_refs=[]`
- Each referenced case declares matching `execution.entry.role_key` and includes the `RBAC ID` in `rbac_refs`
- Source-only evidence remains `STATIC_CONFIRMED`; only runtime evidence may use `RUNTIME_CONFIRMED`
- Missing expected permission is `UNRESOLVED` and becomes BA/PO Q&A; do not invent ALLOW or DENY

The JSON schemas validate each object's shape. The generator is the final gate for cross-object rules: every declared role must appear exactly once in each expectation map, every `case_ref` must exist and be unique, and the referenced case's `role_key`, visible role name, `rbac_refs` and ALLOW/DENY branch must match

### 5. Run gen script

If user requests API testcases from source file/folder, import first:

```bash
python3 scripts/import-api-spec.py api-file output-api.json \
  --project-code CODE --project-name "Project Name"
```

Only run Excel step when command returns exit code `0` and `review_required` is empty. For endpoints/curls without declared response status, user can confirm and pass `--default-success-status 200`; do not auto-add this option without confirmation.

```bash
python3 scripts/gen-testcases.py input.json OneBrain_Testcases.xlsx
```
-> Script auto-generates `OneBrain_Testcases_<DD-MM-YYYY>.md` first -> writes `OneBrain_Testcases_<DD-MM-YYYY>.automation.json` -> copies template -> updates Cover from JSON -> cleanups -> writes section/group/case rows -> hardcodes matching Testcase IDs -> saves `OneBrain_Testcases_<DD-MM-YYYY>.xlsx`.

The `.automation.json` companion is the lossless POM source. It preserves the exact entry, steps, values, waits, assertion kinds/targets, outcome, cleanup, `role_key`, `rbac_refs`, requirement and stable Testcase ID. Markdown and Excel remain human-readable projections; POM must not reconstruct missing machine fields from prose

### Artifact filename date

- Append the `Asia/Ho_Chi_Minh` creation date immediately before the extension as `_DD-MM-YYYY`, for example `OneBrain_Testcases_20-07-2026.xlsx`
- Use the same date for the Markdown and Excel companions
- Do not append a second date when the requested basename already ends in `_DD-MM-YYYY`
- Do not rename existing artifacts
- When the user supplies an exact filename that must remain unchanged, set `QA_PRESERVE_EXACT_FILENAME=1` for the generator

Markdown is the AI-readable version to understand testcases without parsing Excel. Read [references/markdown-testcases.md](references/markdown-testcases.md) and do not edit Markdown, automation manifest or Excel independently.

In API mode, generator only maps the `api` object to F/G/H. Regular testcases lack the `api` object so it keeps the current execution path and row height settings.

### Output cleanup (auto)

Original template `assets/Template.xlsx` intentionally keeps **many sample group headers** (REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD) as reference for AI to know structure + row padding from Excel. When generating output, script automatically:

1. **Dynamic whitelist**: only keep group headers declared in `JSON sections[].groups[].name`. Unused sample groups -> deleted completely.
2. **Dynamic group**: auto-creates groups/tags not already in template and allocates enough rows for all cases
3. **Delete rows**: any remaining empty rows (skipped groups + sample case rows) -> completely deleted via `ws.delete_rows()`, not keeping fill color / row height.
4. **Stable IDs and continuous row STT**: new executable cases keep their explicit `[CODE-NN]` or `[CODE-UI-NN]` unchanged even when cases move; gaps are valid. Only legacy text-only sources may receive generated sequential IDs.

**Result**: output file is compact, containing only actual data for current project (e.g. demo project with 1 LOGIN group x 2 sections -> file ~43 rows instead of 657 template rows).

### Column schema (Test cases_App sheet)

| Col | Fill | Notes |
|---|---|---|
| B | Scenario ID | e.g. `SCN-LOG-001` |
| C | **Scenario Name** (shared) | Feature group name, not the test case name |
| D | **Test case ID** (hardcoded) | Stable explicit `[CODE-NN]` (Functional) or `[CODE-UI-NN]` (UI); unique, gaps allowed, never renumber existing executable cases |
| E | **Description** (manual) | Start with "Verify that...", NO technical prefix |
| F | Pre-condition | Numbered manual setup: environment, screen, route, role, state, permissions and named test data |
| G | Procedure | Numbered Vietnamese actions and wait/observation lines; do not expose `S##`, `target.key`, JSON or selector terms |
| H | Expected Results | Numbered observable step checks plus final business outcome; do not expose assertion syntax |
| I-M | **LEAVE BLANK** | Tester fills during execution |

**Important**: Columns I-M are left empty by the generator. Script applies style only — no value fill. Testers fill these when running actual tests.

### Manual-Friendly Writing Rules (MANDATORY for every case)

> **Invariant rule**: Every testcase in this system is written for a **Manual Tester who reads the Excel sheet and executes immediately** — not for developers or API tools.

> **Language rule**: Rule files and skill instructions are written in English for faster AI parsing. However, ALL testcase content written into Excel/Markdown (Description, Pre-condition, Procedure, Expected Results) MUST be in **Vietnamese**, as Testers read and execute from those files.

**Two-layer output rule:**

- Excel columns F/G/H and their main Markdown projection are the manual layer: natural Vietnamese, numbered lines, exact visible names and test-data references
- The Markdown `Execution contract` table is the automation layer: it retains `S##`, `action`, `target.key`, structured value, wait signal and assertions for qa-run/POM
- Never copy machine keys such as `email_input`, raw JSON, `visible`, `[OUTCOME]`, XPath or CSS into Excel F/G/H

**Pre-condition gate — MANDATORY for every new executable UI/FUNCTION case:**

Write separate numbered lines for environment, starting screen, route, business role, starting state, permissions and named test data. Include setup or account/data conditions when applicable. Do not write only `Có tài khoản`, `Có dữ liệu`, `User ở trang đăng nhập` or `Người dùng đã đăng nhập`

Use a safe data reference for passwords or secrets, for example `Bộ dữ liệu Login_Valid_01`; never place the real secret in the testcase artifact

**1. Description — Use end-user language, written in Vietnamese:**
- ✅ CORRECT: *Xác minh rằng người dùng không thể đăng nhập khi để trống ô Mật khẩu*
- ❌ WRONG: *Verify POST /auth/login returns 400 when password=null*
- ❌ WRONG: *[TC-03][negative] Empty password validation*

**Manual reproduce gate — MANDATORY for every Procedure (G):**

The testcase must be executable by a manual tester who has only the testcase row and the test data. Write each interaction as a separate numbered step. A step must identify:

1. the current screen or route when the tester enters or changes context
2. the exact visible target, such as `ô Email`, `ô Mật khẩu`, `nút Đăng nhập`
3. one action only, such as mở, nhấp, chọn, nhập, xóa, nhấn phím, or quan sát
4. the exact value/content to use, or explicitly state `để trống` when no value is entered
5. the immediate observation or wait condition when the next action depends on it

For every form field, keep focus/click and data entry as separate steps. Do not let a `fill` action hide the click/focus step when the manual tester needs to reproduce the interaction:

```
1. Mở trình duyệt và truy cập màn hình Đăng nhập: [URL]/login
2. Nhấp vào ô "Email"
3. Nhập giá trị: qa@example.com
4. Nhấp vào ô "Mật khẩu"
5. Nhập giá trị: Test@1234
6. Nhấp nút "Đăng nhập"
7. Quan sát kết quả hiển thị trên màn hình
```

Do not write `Nhập email`, `Điền form`, `Thực hiện đăng nhập`, or `Nhập email và password rồi click Login` without the target, exact value, and separate action steps. If a field is intentionally empty, say `Nhấp vào ô ...` followed by `Để trống, không nhập giá trị`.

**2. Procedure / Steps — Detailed enough for anyone to follow without interpretation:**

Each step must specify: **What to do** + **Where** + **Exact value/content** (if applicable). Never combine multiple actions into one line.

- ✅ CORRECT (Vietnamese content):
  ```
  1. Mở trình duyệt và truy cập trang đăng nhập: [URL]/login
  2. Chờ màn hình Đăng nhập hiển thị đầy đủ
  3. Nhấp vào ô "Email"
  4. Nhập giá trị test@example.com
  5. Kiểm tra ô Email hiển thị đúng giá trị test@example.com
  6. Nhấp vào ô "Mật khẩu"
  7. Để trống, không nhập giá trị
  8. Nhấp vào nút "Đăng nhập"
  9. Chờ hệ thống hoàn tất xử lý
  10. Quan sát kết quả hiển thị trên màn hình
  ```
- ❌ WRONG: *Nhập email hợp lệ và để trống mật khẩu, click login*
- ❌ WRONG: *Send request with empty password field*

**3. Expected Results — Observable, measurable, visible to the eye:**

Describe exactly what the Tester sees or can verify after performing the steps. Avoid vague language.

- ✅ CORRECT (Vietnamese content):
  ```
  1. Hệ thống không thực hiện đăng nhập
  2. Dưới ô "Mật khẩu" hiển thị thông báo màu đỏ: "Mật khẩu không được để trống"
  3. Trang không chuyển hướng, vẫn ở màn hình đăng nhập
  ```
- ❌ WRONG: *Hệ thống xử lý đúng*
- ❌ WRONG: *Response body: {"error": "password required"}*

**4. Forbidden technical language in columns F, G, H (write in Vietnamese instead):**

| Instead of this ❌ | Write this ✅ (Vietnamese) |
|---|---|
| `POST /api/login` | Nhấp nút "Đăng nhập" |
| `HTTP 400 Bad Request` | Hiển thị thông báo lỗi |
| `response.body.token` | Hệ thống cấp quyền truy cập |
| `null`, `undefined`, `NaN` | Để trống, không nhập gì |
| `assert status == 200` | Kiểm tra trang chuyển hướng về Dashboard |

### Execution contract for qa-run and POM

The structured contract is mandatory for new executable UI/FUNCTION cases and is documented in [references/execution-contract.md](references/execution-contract.md)

- `entry` must state environment, visible starting screen, route, business role, starting state, permissions and named test data needed before `S01`
- For RBAC-linked cases, `entry.role_key` maps the displayed business role to the RBAC role key and `entry.rbac_refs` lists the exact rules being proved
- Every step must have one atomic action and a stable ID such as `S01`, `S02`; do not write “nhập dữ liệu rồi bấm nút” as one step
- `fill`, `select`, `press` and `upload` must include `value`; `fill` and `clear` require a separate click/focus step for the same target immediately before them
- `target` describes the semantic UI object with a stable `key`, `kind`, human-facing `name` and known accessibility hints such as `role`, `label` or `test_id`
- `wait_for` states the machine signal and includes Vietnamese `text` for the manual wait/observation line; a fixed sleep is not an expected result
- Step assertions verify each transition; `outcome.assertions` verifies the final business state, route, message, record or side effect
- `cleanup` is required for flows that create or change data
- Do not invent XPath or CSS from the requirement. Selector evidence is captured by POM only after runtime DOM verification

Existing text-only cases remain backward-compatible, but the generator marks them `Legacy text-only`; convert them before deterministic automation

### Human-readable format

- No trailing `.` at the end of Scenario Name, Description, Pre-condition, Procedure, or Expected Results
- No emoji/icons in testcase content
- Keep Scenario ID, Testcase ID, requirement ID, URL, filename, formula, code, and decimal numbers unchanged
- New Markdown, automation manifest and Excel filenames must share the same basename with suffix `_DD-MM-YYYY`
- Generator auto-validates icons and strips trailing dots from prose

### Template structure details

See `@references/template-schema.md` for the master workbook sheets and the generated `RBAC Matrix` sheet

## Black-Box Techniques

Mọi case phải dùng it́ nhát 1 kĩ thuạt BB. Xác định khi làm buước 3, ghi vào `bb_technique` để trace (generator bỏ qua, không ảnh huưởng Excel).

| Kĩ thuạt | Type áp dụng | Khi nào bát buọc |
|---|---|---|
| **Equivalence Partitioning (EP)** | `validation`, `negative` | Luôn áp dụng khi có input partition |
| **Boundary Value Analysis (BVA)** | `edge`, `validation` | Khi field có giới hạn số, độ dài, ngày |
| **Decision Table** | `validation`, `negative`, `happy` | Bắt buộc khi ≥2 điều kiện kết hợp |
| **State Transition** | `happy`, `alternative`, `error`, `negative` | Khi object có ≥2 trạng thái rõ ràng |
| **Use Case Testing** | `happy`, `alternative`, `ui` | Mặc định cho flow AC |
| **Error Guessing** | `negative`, `error`, `additional` | Luôn áp dụng sau các kỹ thuật khác |
| **Pairwise** | `validation`, `edge` | Khi ≥3 input field độc lập |

**Decision rule:**

```
≥2 điều kiện kết hợp?  → Decision Table bắt buộc trước
Có giá trị biên (độ dài, số, ngày)?  → BVA bắt buộc cho edge
Có ≥2 traạng thái?  → Veẽ state diagram trướng
Có ≥3 field đọc lạp?  → Dùng Pairwise thay full factorial
Còn lại?  → Use Case Testing + EP + Error Guessing
```

Xem hướng dẫn đầy đủ + JSON mẫu: [`references/blackbox-techniques.md`](references/blackbox-techniques.md)

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| Output file > 200 rows for a small project | Sample rows from template not deleted | Verify dynamic whitelist in JSON includes all required groups |
| Existing Testcase IDs change after a case is inserted or reordered | Automation traceability becomes stale | Keep explicit stable IDs; gaps such as `[BCP-01]`, `[BCP-03]` are valid and only the Excel row STT must remain continuous |
| Columns I-M pre-filled with data | Script applied value fill instead of style only | Verify `gen-testcases.py` branch applies style only, no value fill |
| Description starts with `[STT]` or `[Type]` | Manual format violated | AI must reformat before writing to JSON |
| Procedure is a single line combining multiple actions | Tester cannot identify where to act | Split each action into its own numbered step; include field/button name and input value |
| Procedure uses shorthand such as `Nhập email`, `Điền form`, or `Nhập email và password rồi click Login` | Manual tester cannot reproduce the exact interaction or data | Write screen, target, one action, exact value, and observation as separate numbered steps |
| New executable case has no `execution` object | qa-run and POM must infer state, target and assertions from prose | Add `entry`, `[S##]` steps, target keys, wait signals, step assertions, outcome and cleanup |
| Permissions appear only as free text in Pre-condition | No proof that every role and allow/deny branch was considered | Add top-level `rbac`, stable `case_ref`, `role_key`, `rbac_refs` and positive/negative coverage |
| RBAC rule has ALLOW but no DENY testcase | Privilege escalation or unauthenticated access can remain untested | Add a comparison role and `deny_case_ref`, or mark the role `N/A`/`UNRESOLVED` with evidence |
| Target includes a guessed XPath | Locator may match the wrong element after a UI change | Keep semantic target hints in testcase; verify selector in the real DOM and record evidence in POM |
| Procedure or Expected uses technical terms (`POST`, `HTTP 400`, `null`, `assert`) | Not manual-tester language | Replace with UI descriptions the tester sees (button names, displayed messages) |
| Expected result is vague ("system works correctly", "error handled") | Not measurable; tester does not know what to check | State the exact message shown, the page redirected to, or data displayed |
| Expected result contains JSON body or HTTP status code | Written as an API test; tester cannot verify visually | Replace with what the user sees on the UI |
| New columns added (Method/Endpoint/Status) | Breaks fixed template format | Put API data into F/G/H per the API reference |
| API mode auto-enabled for regular testcases | Changes current configuration | Only enable when user explicitly requests API testcases |
| API case only checks status code | Missing contract and business effect | Also verify body/schema/headers/side-effects when requirement defines them |
| Real token, cookie, or API key written into workbook | Credential leak into artifact | Use placeholder like `<valid_token>` |
| Status 200 assumed for endpoint with no response contract | Fabricated expected result | Let importer set `review_required` then ask user or read docs |
| Swagger read manually with missed endpoints | Non-deterministic; weak models make mistakes | Always run `scripts/import-api-spec.py` |
| Only Excel created, no Markdown testcase companion | AI must parse workbook next time | Always use generator to create Markdown before Excel |
| Markdown, automation manifest and Excel content diverge | Derived artifacts edited independently | Fix JSON source then regenerate all three |

## Common mistakes

- **Every case MUST have `req` pointing to one AC** (Notes: `Ref: ACx`). No ref → case cannot be traced, fails coverage check.

- **Grouping different fields/behaviors into one scenario** — e.g. one scenario "Email and password validation" combining both. WRONG. Must split into two: "Email validation" and "Password validation". See Process step 2 for split criteria.

- **`additional` cases (outside spec)** → flag clearly with `Ref: (out-of-spec)` and notify user. Do not ship as a normal case.

- **NEVER fabricate expected results** from vague spec — ask user. Spec says "handle error gracefully" → DO NOT self-define what "gracefully" means.

- **Description format MANUAL**: "Verify that..." — no `[STT]`, `[Type]`, stray `/`. This format lets testers reading the Excel understand immediately.

- **Multiple cases in the SAME scenario may share `scenario_name`** (shared feature group name). Don't duplicate names per case. BUT do not merge cases of different fields/behaviors — split them (see Process step 2).

- **When cloning to a new machine**: run `pip install openpyxl PyYAML` first. `PyYAML` is required for Swagger/OpenAPI YAML. API key configured once in `config/api_keys.json` (gitignored) — shared across all 3 skills.

- **Key configuration**: one shared config file `../config/api_keys.json` (gitignored), usable by all 3 skills. See [README.md](../README.md) section "API Keys".

## References

- [assets/Template.xlsx](assets/Template.xlsx) — master template (239 KB), shared across all projects
- [examples/sample-input.json](examples/sample-input.json) — legacy text-only compatibility example; do not copy it for new executable cases
- [examples/structured-input.json](examples/structured-input.json) — canonical new UI/FUNCTION execution contract example for manual, qa-run and POM
- [examples/sample-api-input.json](examples/sample-api-input.json) — optional, used only when user requests API testcases
- [scripts/gen-testcases.py](scripts/gen-testcases.py) — generator script (openpyxl)
- [scripts/import-api-spec.py](scripts/import-api-spec.py) — importer for OpenAPI/Swagger/Postman/JSON/curl/source endpoints
- [references/template-schema.md](references/template-schema.md) — master workbook plus generated RBAC Matrix details
- [references/test-types.md](references/test-types.md) — 8 test case types + BB technique mapping
- [references/blackbox-techniques.md](references/blackbox-techniques.md) — 7 BB techniques: EP, BVA, Decision Table, State Transition, Use Case, Error Guessing, Pairwise
- [references/ui-testcases.md](references/ui-testcases.md) — UI testing checklist (8 categories)
- [references/api-testcases.md](references/api-testcases.md) — mapping and coverage for API mode only
- [references/markdown-testcases.md](references/markdown-testcases.md) — contract: Markdown created before Excel, AI read order
- [references/execution-contract.md](references/execution-contract.md) — shared testcase → qa-run → POM contract
- [references/execution-contract.schema.json](references/execution-contract.schema.json) — machine-readable execution schema
- [references/rbac-matrix.schema.json](references/rbac-matrix.schema.json) — machine-readable Role × Rule × Testcase coverage schema
- [references/automation-manifest.schema.json](references/automation-manifest.schema.json) — lossless testcase → POM handoff schema
- [references/plane-integration.md](references/plane-integration.md) — fetch AC from Plane API
- Related skill: [playwright-pom-automation](../playwright-pom-automation/SKILL.md) (code automation, output `.spec.ts`)
- Related skill: [qa-run](../qa-run/SKILL.md) (live exploratory)
