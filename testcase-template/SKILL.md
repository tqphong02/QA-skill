---
name: testcase-template
description: Generate or review structured testcase documents with an AI-readable Markdown testcase companion created before the Excel workbook. Keep Markdown and Excel testcase IDs/content synchronized from one JSON source. Use the existing UI and functional flow by default. Enable the optional API flow only when explicitly requested. Not for exploratory testing notes or bug reports.
---

# Test Case Template

**Core principle:** Cùng một bộ cột — không sáng tạo cột mới.

Template gốc: `assets/Template.xlsx` (1 file chung cho MỌI project). Mọi thông tin project (name, code, modules) configurable từ JSON input. **KHÔNG cần tạo template riêng cho từng project**.

> **Khi nào dùng**: User muốn viết test case Excel theo chuẩn team.
> **KHÁC** `qa-run` (live exploratory) và `playwright-pom-automation` (code automation `.spec.ts`): skill này = document test case Excel (manual test design).
> **API key**: dùng chung từ `../config/api_keys.json` (xem scripts/ai_provider.py) — KHÔNG cần key nếu dùng Copilot Pro/Antigravity/Claude Code CLI. Member khi git clone code về chạy được ngay với project bất kỳ.

## Cross-model hard gates

Áp dụng nguyên thứ tự này cho mọi model:

1. Chọn mode trước khi viết: mặc định dùng flow UI/FUNCTION hiện tại; chỉ dùng API mode khi user yêu cầu rõ viết testcase API hoặc viết testcase cho endpoint, OpenAPI/Swagger, Postman hay curl; chỉ nhắc đến artifact API thì chưa đủ để đổi mode
2. Nếu API mode có file nguồn, chạy `scripts/import-api-spec.py` trước; không tự đọc rồi chép endpoint thủ công
3. Kiểm tra `review_required`; nếu còn item thì dừng Excel generation và lấy expected còn thiếu từ user hoặc tài liệu
4. Đọc requirement/AC và liệt kê requirement ID trước khi viết case
5. Chọn đúng UI hoặc FUNCTION theo hành vi cần chứng minh; không gọi một case là UI-only chỉ vì thao tác qua dialog/button
6. Tách scenario khi khác field, behavior hoặc AC; một scenario chỉ chứa một nhóm chức năng cụ thể
7. Tạo JSON đúng schema, giữ nguyên Scenario ID, Testcase ID và requirement reference
8. Chạy `scripts/gen-testcases.py`; script phải tạo `<output>.md` trước `<output>.xlsx`
9. Đọc lại Markdown trước rồi đối chiếu Excel: số case, Scenario/Testcase ID và nội dung design phải khớp; cột I-M chỉ có ở Excel và để trống

Nếu expected chưa có trong requirement, dừng case đó ở trạng thái cần làm rõ; không tự bịa business rule.

## The trap this skill exists to prevent

**Freeform columns per author** — each tester invents their own column set, breaking cross-project aggregation and review tooling. Skill enforces a single shared template so test cases from different projects can be queried, compared, and rolled up.

## Process

### 1. Đọc & trích requirements
**BẮT BUỘC bám document**. Mỗi case phải trace về 1 AC. Nếu KHÔNG có document → hỏi user. Chi tiết fetch từ Plane: `@references/plane-integration.md`.

### 2. Tổ chức theo 2 phần + type order
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
**Cùng feature có ở cả 2 phần** (UI test hiển thị, Functional test logic).

**API mode là tùy chọn**: chỉ khi user yêu cầu testcase API, đọc [references/api-testcases.md](references/api-testcases.md). API case vẫn nằm trong `1.2. FUNCTION`, dùng `kind=api` và giữ nguyên các cột B-M. Nếu user không yêu cầu API thì không đọc reference này và tiếp tục flow hiện tại với `kind=ui` hoặc `kind=function`.

**Quy tắc 1 scenario = 1 nhóm chức năng cụ thể** (KHÔNG gộp nhiều field/behavior):
- Tách scenario khi khác **field/input** (email validation ≠ password validation → 2 scenario)
- Tách scenario khi khác **behavior** (submit-fail ≠ account-lock)
- Tách scenario khi khác **AC** (AC3 ≠ AC4 ≠ AC5)
- Cùng `scenario_name` SHARED cho nhiều case CÙNG scenario — nhưng KHÔNG dùng chung scenario_name cho validation của field khác nhau

Ví dụ SAI vs ĐÚNG cho trang login:
```
❌ SAI: 1 scenario "Validation email và password" gộp 6 case
       (3 case email validation + 2 case password validation + 1 case cả 2 trống)
       → Tester khó filter, khó coverage check, scenario_name mơ hồ

✅ ĐÚNG: tách 2 scenario riêng
   - SCN-LOG-002 "Validation email"        → case về email (trống, thiếu @, thiếu domain, subdomain)
   - SCN-LOG-003 "Validation password"     → case về password (trống, cả 2 trống, <8 chars, =8 chars)
   → Mỗi scenario có 1 nhóm rõ ràng, tester filter được, coverage dễ check
```

### 3. Gen cases theo type order
8 loại: `happy → alternative → validation → edge → negative → error → ui → additional`. Chi tiết + ví dụ: `@references/test-types.md`.

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
      "pre_condition": "Có account test",
      "procedure": "1. Mở /login\n2. Nhập email + password\n3. Click nút Login",
      "expected": "1. Đăng nhập thành công",
      "priority": "High"
    }]
  }]
}
```
- `scenario_name` (string) — tên nhóm chức năng, **SHARED** cho nhiều case cùng scenario
- `scenario_id` (string) — mã scenario, vd `SCN-LOG-001`
- Mỗi case có `type` (1 trong 8) + `req` (trace về AC) - BẮT BUỘC
- Riêng API mode, mỗi case thêm object `api`; xem [examples/sample-api-input.json](examples/sample-api-input.json). Không có object `api` thì generator dùng nguyên `pre_condition`, `procedure`, `expected` như hiện tại

### 5. Chạy script gen

Nếu user yêu cầu API testcase từ file hoặc folder nguồn, import trước:

```bash
python3 scripts/import-api-spec.py api-file output-api.json \
  --project-code CODE --project-name "Project Name"
```

Chỉ chạy bước Excel khi command trả exit code `0` và `review_required` trống. Với endpoint/curl không khai báo response status, user có thể xác nhận rồi truyền `--default-success-status 200`; không tự thêm option này nếu chưa được xác nhận.

```bash
python3 scripts/gen-testcases.py input.json output.xlsx
```
→ Script tạo `output.md` đầy đủ trước → copy template → update Cover từ JSON → cleanup → ghi section/group/case rows → hardcode cùng Testcase ID → save `output.xlsx`.

Markdown là bản AI đọc để hiểu testcase mà không cần parse Excel. Đọc [references/markdown-testcases.md](references/markdown-testcases.md) và không chỉnh hai file độc lập.

Với API mode, generator chỉ ánh xạ object `api` vào F/G/H. Testcase thường không có object `api` nên giữ nguyên đường chạy và cách đặt row height hiện tại.

### Output cleanup (auto)

Template gốc `assets/Template.xlsx` cố tình giữ **nhiều group headers mẫu** (REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD) làm reference cho AI biết cấu trúc + padding rows từ Excel. Khi sinh file output, script tự động:

1. **Dynamic whitelist**: chỉ giữ group header nào khai báo trong `JSON sections[].groups[].name`. Group mẫu không dùng → xóa hẳn.
2. **Dynamic group**: tự tạo group/tag chưa có sẵn trong template và cấp đủ dòng cho toàn bộ case
3. **Delete rows**: dòng trống nào còn sót (group bị bỏ + sample case rows) → `ws.delete_rows()` xóa hoàn toàn, không giữ fill color / row height.
4. **STT liên tục**: `[CODE-UI-NN]` cho UI (1-4), `[CODE-NN]` cho Functional (5-30) trong cùng file.

**Kết quả**: file output gọn, chỉ chứa dữ liệu thật của dự án hiện tại (vd demo project với 1 group LOGIN × 2 sections → file ~43 rows thay vì 657 rows như template).

### Column schema (Test cases_App sheet)

| Col | Fill | Ghi chú |
|---|---|---|
| B | Scenario ID | vd `SCN-LOG-001` |
| C | **Scenario Name** (shared) | Tên nhóm chức năng, không phải tên test case |
| D | **Test case ID** (hardcoded) | `[CODE-NN]` (Functional) hoặc `[CODE-UI-NN]` (UI). STT liên tục. |
| E | **Description** (manual) | Bắt đầu "Xác minh rằng...", KHÔNG có prefix kỹ thuật |
| F | Pre-condition | Điều kiện trước khi chạy |
| G | Procedure | Steps đánh số `1. ...\n2. ...` |
| H | Expected Results | Kết quả mong đợi, đo được |
| I-M | **TRỐNG** | Tester điền khi execution |

**Quan trọng**: Cột I, J, K, L, M để trống. Script chỉ apply style, KHÔNG fill value. Tester tự điền khi chạy test thực tế.

### Human-readable format

- Không đặt dấu `.` ở cuối Scenario Name, Description, Pre-condition, Procedure hoặc Expected Results
- Không chèn emoji/icon vào nội dung testcase
- Giữ nguyên Scenario ID, Testcase ID, requirement ID, URL, filename, formula, code và số thập phân
- Generator tự validate icon và tự bỏ dấu chấm cuối từng dòng prose

### Template structure chi tiết

Xem `@references/template-schema.md` để biết chi tiết về 4 sheet (Cover, Test cases_App, Dropdown Keys, Report).

## Red flags

| Symptom | Why it's wrong | Fix |
|---|---|---|
| File output > 200 rows cho project nhỏ | Sample rows từ template không bị xóa | Verify dynamic whitelist trong JSON có đầy đủ groups |
| Test case ID không liên tục (`[BCP-01]`, `[BCP-03]` thiếu `[BCP-02]`) | Hardcoded STT bị lệch khi type order thay đổi | Re-run script; đảm bảo thứ tự type đúng 8 loại chuẩn |
| Cột I-M bị fill sẵn data | Script apply sai style | Verify branch trong `gen-testcases.py` chỉ apply style, không fill value |
| Description bắt đầu bằng `[STT]` hoặc `[Type]` | Format manual bị vi phạm | AI phải reformat lại trước khi ghi JSON |
| Expected result mơ hồ ("hệ thống hoạt động đúng") | Không đo được | Hỏi user để biết expected cụ thể |
| Tạo thêm cột Method/Endpoint/Status | Phá format testcase hiện tại | Đưa dữ liệu API vào F/G/H theo reference API |
| Tự bật API mode cho testcase thường | Làm thay đổi cấu hình hiện tại | Chỉ bật khi user yêu cầu API rõ ràng |
| API case chỉ kiểm tra status code | Thiếu contract và business effect | Kiểm tra body/schema/headers/side-effect khi requirement có định nghĩa |
| Ghi token, cookie hoặc API key thật | Rò rỉ credential vào workbook | Dùng placeholder như `<valid_token>` |
| Tự đặt status 200 cho endpoint không có response contract | Bịa expected result | Để importer ghi `review_required` rồi hỏi user hoặc đọc thêm tài liệu |
| Đọc Swagger thủ công và bỏ sót endpoint | Không deterministic, model yếu dễ sai | Luôn chạy `scripts/import-api-spec.py` |
| Chỉ tạo Excel, không có Markdown testcase | AI lần sau phải parse workbook lại | Luôn dùng generator để tạo Markdown trước Excel |
| Markdown và Excel lệch ID/nội dung | Hai artifact được sửa độc lập | Sửa JSON source rồi regenerate cả hai |

## Common mistakes

- **Mỗi case BẮT BUỘC có `req` trỏ về 1 AC** (trong Notes ghi `Ref: ACx`). Không có ref → case không trace được, fail coverage check.

- **Gộp nhiều field/behavior khác nhau vào 1 scenario** — ví dụ: 1 scenario "Validation email và password" gộp cả email validation + password validation. SAI. Phải tách thành 2 scenario riêng: "Validation email" (case về email) và "Validation password" (case về password). Xem Process step 2 để biết tiêu chí tách cụ thể.

- **Case `additional` (ngoài spec)** → flag rõ `Ref: (out-of-spec)` + báo user. Đừng ship như case bình thường.

- **KHÔNG bịa expected result** dựa trên spec mơ hồ — hỏi user. Spec nói "xử lý lỗi hợp lệ" → KHÔNG ĐƯỢC tự định nghĩa "hợp lệ" là gì.

- **Description format MANUAL**: "Xác minh rằng..." không có `[STT]`, `[Type]`, `/` lạ. Format này để tester (người đọc Excel) hiểu nhanh.

- **Nhiều case CÙNG scenario có thể cùng `scenario_name`** (chia sẻ tên nhóm chức năng). Đừng duplicate tên cho mỗi case. **NHƯNG** không gộp case của field/behavior khác vào cùng scenario — tách ra (xem Process step 2).

- **Khi git clone về máy mới**: chạy `pip install openpyxl PyYAML` trước. `PyYAML` cần cho Swagger/OpenAPI YAML. API key config 1 lần ở `config/api_keys.json` (gitignored) — dùng chung cho cả 3 skill.

- **Cấu hình key**: 1 file config chung `../config/api_keys.json` (gitignored), dùng được cho cả 3 skill. Xem [README.md](../README.md) mục "API Keys".

## References

- [assets/Template.xlsx](assets/Template.xlsx) — master template (239 KB), 1 file dùng chung
- [examples/sample-input.json](examples/sample-input.json) — ví dụ JSON input hoàn chỉnh
- [examples/sample-api-input.json](examples/sample-api-input.json) — ví dụ tùy chọn chỉ dùng khi user yêu cầu testcase API
- [scripts/gen-testcases.py](scripts/gen-testcases.py) — generator script (openpyxl)
- [scripts/import-api-spec.py](scripts/import-api-spec.py) — importer OpenAPI/Swagger/Postman/JSON/curl/source endpoint
- [references/template-schema.md](references/template-schema.md) — 4 sheet chi tiết (Cover, Test cases_App, Dropdown Keys, Report)
- [references/test-types.md](references/test-types.md) — 8 loại test case + ví dụ
- [references/api-testcases.md](references/api-testcases.md) — mapping và coverage chỉ cho API mode
- [references/markdown-testcases.md](references/markdown-testcases.md) — contract Markdown tạo trước Excel và read order cho AI
- [references/plane-integration.md](references/plane-integration.md) — fetch AC từ Plane API
- Related skill: [playwright-pom-automation](../playwright-pom-automation/SKILL.md) (code automation, output `.spec.ts`)
- Related skill: [qa-run](../qa-run/SKILL.md) (live exploratory)
