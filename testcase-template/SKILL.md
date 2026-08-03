---
name: testcase-template
description: Generate, edit, or review structured testcase documents with complete Markdown created before Excel and synchronized IDs/content from one JSON source. Trigger on write/create/review testcase, test case, test scenario, Scenario ID/Name, testcase Excel/CSV/Markdown, or explicit API testcase requests for endpoints, OpenAPI/Swagger, Postman, or curl; do not require the skill name. Use UI/functional flow by default and enable API mode only when explicitly requested. Not for exploratory notes or bug reports.
---

# Test Case Template

**Core principle:** Same set of columns — do not invent new columns.

Original template: `assets/Template.xlsx` (1 shared file for ALL projects). All project information (name, code, modules) is configurable from JSON input. **NO need to create separate templates per project**.

> **When to use**: User wants to write Excel test cases according to team standards.
> **DIFFERENT** from `qa-run` (live exploratory) and `playwright-pom-automation` (code automation `.spec.ts`): this skill = document Excel test cases (manual test design).
> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI. Members can run immediately with any project after git clone.

## Cross-model hard gates

Apply this exact order for all models:

1. Choose mode before writing: default to current UI/FUNCTION flow; only use API mode when user explicitly requests writing API testcases or writing testcases for endpoints, OpenAPI/Swagger, Postman or curl; merely mentioning API artifacts is not enough to switch modes
2. If API mode has source files, run `scripts/import-api-spec.py` first; do not manually read and copy endpoints
3. Check `review_required`; if items remain, stop Excel generation and get missing expected from user or documents
4. Read requirement/AC and list requirement IDs before writing cases
5. Choose UI or FUNCTION correctly based on the behavior to prove; do not call a case UI-only just because it operates via dialog/button
6. Split scenario when field, behavior or AC differs; one scenario contains only one specific functional group
7. Create JSON with correct schema, preserve Scenario ID, Testcase ID and requirement reference
8. Run `scripts/gen-testcases.py`; script must create `<output>.md` before `<output>.xlsx` with the same `Asia/Ho_Chi_Minh` date
9. Read Markdown first then compare with Excel: number of cases, Scenario/Testcase ID and design content must match; columns I-M exist only in Excel and are left blank
10. For every new UI/FUNCTION testcase that will be executed or automated, create the structured `execution` contract from [references/execution-contract.md](references/execution-contract.md); F/G/H are the human-readable projection of that contract, not a second source of truth

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
  "project": {"code": "BCP", "name": "BCP AI", ...},
  "scenarios": [{
    "scenario_id": "SCN-LOG-001",
    "requirement": "AC1",
    "scenario_name": "Đăng nhập thành công",
    "cases": [{
      "type": "happy", "req": "AC1",
      "description": "Xác minh rằng người dùng có thể đăng nhập với email + password đúng",
      "priority": "High",
      "execution": {
        "version": 1,
        "entry": {"route": "/login", "role": "Guest", "state": "Chưa đăng nhập", "data": {"email": "<valid_email>", "password": "<valid_password>"}},
        "steps": [{
          "id": "S01",
          "action": "navigate",
          "instruction": "Mở trình duyệt và truy cập trang đăng nhập: <BASE_URL>/login",
          "target": {"key": "login_page", "kind": "page", "name": "Trang đăng nhập", "route": "/login"},
          "wait_for": {"kind": "url", "value": "/login"},
          "assertions": [{"kind": "visible", "target": "login_form", "text": "Biểu mẫu đăng nhập hiển thị"}]
        }],
        "outcome": {"assertions": [{"kind": "url", "value": "/dashboard", "text": "Trang chuyển đến Dashboard"}]},
        "cleanup": "Đăng xuất nếu phiên kiểm thử được tạo"
      }
    }]
  }]
}
```
- `scenario_name` (string) — functional group name, **SHARED** for multiple cases in same scenario
- `scenario_id` (string) — scenario code, e.g. `SCN-LOG-001`
- Each case has `type` (1 of 8) + `req` (trace to AC) - MANDATORY
- New executable UI/FUNCTION cases have `execution` (version 1) with `entry`, ordered `steps`, `outcome.assertions` and `cleanup` when the flow mutates data
- Each `execution.steps[]` has a stable ID, one atomic action, Vietnamese `instruction`, semantic `target`, `wait_for` or assertions; target locators are not guessed in this skill
- In API mode specifically, each case adds `api` object; see [examples/sample-api-input.json](examples/sample-api-input.json). Without `api` object, generator uses `pre_condition`, `procedure`, `expected` as is

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
-> Script auto-generates `OneBrain_Testcases_<DD-MM-YYYY>.md` first -> copies template -> updates Cover from JSON -> cleanups -> writes section/group/case rows -> hardcodes matching Testcase IDs -> saves `OneBrain_Testcases_<DD-MM-YYYY>.xlsx`.

### Artifact filename date

- Append the `Asia/Ho_Chi_Minh` creation date immediately before the extension as `_DD-MM-YYYY`, for example `OneBrain_Testcases_20-07-2026.xlsx`
- Use the same date for the Markdown and Excel companions
- Do not append a second date when the requested basename already ends in `_DD-MM-YYYY`
- Do not rename existing artifacts
- When the user supplies an exact filename that must remain unchanged, set `QA_PRESERVE_EXACT_FILENAME=1` for the generator

Markdown is the AI-readable version to understand testcases without parsing Excel. Read [references/markdown-testcases.md](references/markdown-testcases.md) and do not edit the two files independently.

In API mode, generator only maps the `api` object to F/G/H. Regular testcases lack the `api` object so it keeps the current execution path and row height settings.

### Output cleanup (auto)

Original template `assets/Template.xlsx` intentionally keeps **many sample group headers** (REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD) as reference for AI to know structure + row padding from Excel. When generating output, script automatically:

1. **Dynamic whitelist**: only keep group headers declared in `JSON sections[].groups[].name`. Unused sample groups -> deleted completely.
2. **Dynamic group**: auto-creates groups/tags not already in template and allocates enough rows for all cases
3. **Delete rows**: any remaining empty rows (skipped groups + sample case rows) -> completely deleted via `ws.delete_rows()`, not keeping fill color / row height.
4. **Sequential numbering**: `[CODE-UI-NN]` for UI (1-4), `[CODE-NN]` for Functional (5-30) in the same file.

**Result**: output file is compact, containing only actual data for current project (e.g. demo project with 1 LOGIN group x 2 sections -> file ~43 rows instead of 657 template rows).

### Column schema (Test cases_App sheet)

| Col | Fill | Notes |
|---|---|---|
| B | Scenario ID | e.g. `SCN-LOG-001` |
| C | **Scenario Name** (shared) | Feature group name, not the test case name |
| D | **Test case ID** (hardcoded) | `[CODE-NN]` (Functional) or `[CODE-UI-NN]` (UI). Sequential. |
| E | **Description** (manual) | Start with "Verify that...", NO technical prefix |
| F | Pre-condition | State/data required before step 1 |
| G | Procedure | Generated from `execution.steps[]`: numbered atomic steps with `[S##]`, exact action/target/value and wait condition |
| H | Expected Results | Generated from step assertions plus `execution.outcome.assertions`; each check is observable and measurable |
| I-M | **LEAVE BLANK** | Tester fills during execution |

**Important**: Columns I-M are left empty by the generator. Script applies style only — no value fill. Testers fill these when running actual tests.

### Manual-Friendly Writing Rules (MANDATORY for every case)

> **Invariant rule**: Every testcase in this system is written for a **Manual Tester who reads the Excel sheet and executes immediately** — not for developers or API tools.

> **Language rule**: Rule files and skill instructions are written in English for faster AI parsing. However, ALL testcase content written into Excel/Markdown (Description, Pre-condition, Procedure, Expected Results) MUST be in **Vietnamese**, as Testers read and execute from those files.

**1. Description — Use end-user language, written in Vietnamese:**
- ✅ CORRECT: *Xác minh rằng người dùng không thể đăng nhập khi để trống ô Mật khẩu*
- ❌ WRONG: *Verify POST /auth/login returns 400 when password=null*
- ❌ WRONG: *[TC-03][negative] Empty password validation*

**2. Procedure / Steps — Detailed enough for anyone to follow without interpretation:**

Each step must specify: **What to do** + **Where** + **Exact value/content** (if applicable). Never combine multiple actions into one line.

- ✅ CORRECT (Vietnamese content):
  ```
  1. Mở trình duyệt và truy cập trang đăng nhập: [URL]/login
  2. Tại ô "Email", nhập email hợp lệ: test@example.com
  3. Tại ô "Mật khẩu", để trống (không nhập gì)
  4. Nhấp vào nút "Đăng nhập"
  5. Quan sát kết quả hiển thị trên màn hình
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

- `entry` must state the route, role, starting state, permissions and test data needed before `S01`
- Every step must have one atomic action and a stable ID such as `S01`, `S02`; do not write “nhập dữ liệu rồi bấm nút” as one step
- `target` describes the semantic UI object with a stable `key`, `kind`, human-facing `name` and known accessibility hints such as `role`, `label` or `test_id`
- `wait_for` states the signal that allows the executor to continue; a fixed sleep is not an expected result
- Step assertions verify each transition; `outcome.assertions` verifies the final business state, route, message, record or side effect
- `cleanup` is required for flows that create or change data
- Do not invent XPath or CSS from the requirement. Selector evidence is captured by POM only after runtime DOM verification

Existing text-only cases remain backward-compatible, but the generator marks them `Legacy text-only`; convert them before deterministic automation

### Human-readable format

- No trailing `.` at the end of Scenario Name, Description, Pre-condition, Procedure, or Expected Results
- No emoji/icons in testcase content
- Keep Scenario ID, Testcase ID, requirement ID, URL, filename, formula, code, and decimal numbers unchanged
- New Markdown and Excel filenames must share the same basename with suffix `_DD-MM-YYYY`
- Generator auto-validates icons and strips trailing dots from prose

### Template structure details

See `@references/template-schema.md` for details on the 4 sheets (Cover, Test cases_App, Dropdown Keys, Report).

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
| Non-sequential test case IDs (`[BCP-01]`, `[BCP-03]` missing `[BCP-02]`) | STT offset when type order changes | Re-run script; ensure correct 8-type canonical order |
| Columns I-M pre-filled with data | Script applied value fill instead of style only | Verify `gen-testcases.py` branch applies style only, no value fill |
| Description starts with `[STT]` or `[Type]` | Manual format violated | AI must reformat before writing to JSON |
| Procedure is a single line combining multiple actions | Tester cannot identify where to act | Split each action into its own numbered step; include field/button name and input value |
| New executable case has no `execution` object | qa-run and POM must infer state, target and assertions from prose | Add `entry`, `[S##]` steps, target keys, wait signals, step assertions, outcome and cleanup |
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
| Markdown and Excel content diverge | Two artifacts edited independently | Fix JSON source then regenerate both |

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
- [examples/sample-input.json](examples/sample-input.json) — complete JSON input example
- [examples/structured-input.json](examples/structured-input.json) — execution contract example for qa-run and POM
- [examples/sample-api-input.json](examples/sample-api-input.json) — optional, used only when user requests API testcases
- [scripts/gen-testcases.py](scripts/gen-testcases.py) — generator script (openpyxl)
- [scripts/import-api-spec.py](scripts/import-api-spec.py) — importer for OpenAPI/Swagger/Postman/JSON/curl/source endpoints
- [references/template-schema.md](references/template-schema.md) — 4 sheet details (Cover, Test cases_App, Dropdown Keys, Report)
- [references/test-types.md](references/test-types.md) — 8 test case types + BB technique mapping
- [references/blackbox-techniques.md](references/blackbox-techniques.md) — 7 BB techniques: EP, BVA, Decision Table, State Transition, Use Case, Error Guessing, Pairwise
- [references/ui-testcases.md](references/ui-testcases.md) — UI testing checklist (8 categories)
- [references/api-testcases.md](references/api-testcases.md) — mapping and coverage for API mode only
- [references/markdown-testcases.md](references/markdown-testcases.md) — contract: Markdown created before Excel, AI read order
- [references/execution-contract.md](references/execution-contract.md) — shared testcase → qa-run → POM contract
- [references/execution-contract.schema.json](references/execution-contract.schema.json) — machine-readable execution schema
- [references/plane-integration.md](references/plane-integration.md) — fetch AC from Plane API
- Related skill: [playwright-pom-automation](../playwright-pom-automation/SKILL.md) (code automation, output `.spec.ts`)
- Related skill: [qa-run](../qa-run/SKILL.md) (live exploratory)
