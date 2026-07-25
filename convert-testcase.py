import re

with open("testcase-template/SKILL.md", "r", encoding="utf-8") as f:
    content = f.read()

translations = [
    (r"Cùng một bộ cột — không sáng tạo cột mới\.", r"Same set of columns — do not invent new columns."),
    (r"Template gốc: `assets/Template\.xlsx` \(1 file chung cho MỌI project\)\. Mọi thông tin project \(name, code, modules\) configurable từ JSON input\.", r"Original template: `assets/Template.xlsx` (1 shared file for ALL projects). All project information (name, code, modules) is configurable from JSON input."),
    (r"\*\*KHÔNG cần tạo template riêng cho từng project\*\*\.", r"**NO need to create separate templates per project**."),
    (r"> \*\*Khi nào dùng\*\*: User muốn viết test case Excel theo chuẩn team\.", r"> **When to use**: User wants to write Excel test cases according to team standards."),
    (r"> \*\*KHÁC\*\* `qa-run` \(live exploratory\) và `playwright-pom-automation` \(code automation `\.spec\.ts`\): skill này = document test case Excel \(manual test design\)\.", r"> **DIFFERENT** from `qa-run` (live exploratory) and `playwright-pom-automation` (code automation `.spec.ts`): this skill = document Excel test cases (manual test design)."),
    (r"> \*\*API key\*\*: dùng chung từ `\.\./config/api_keys\.json` \(xem scripts/ai_provider\.py\) — KHÔNG cần key nếu dùng Copilot Pro/Antigravity/Claude Code CLI\. Member khi git clone code về chạy được ngay với project bất kỳ\.", r"> **API key**: shared from `../config/api_keys.json` (see scripts/ai_provider.py) — NO key needed if using Copilot Pro/Antigravity/Claude Code CLI. Members can run immediately with any project after git clone."),
    (r"Áp dụng nguyên thứ tự này cho mọi model:", r"Apply this exact order for all models:"),
    (r"1\. Chọn mode trước khi viết: mặc định dùng flow UI/FUNCTION hiện tại; chỉ dùng API mode khi user yêu cầu rõ viết testcase API hoặc viết testcase cho endpoint, OpenAPI/Swagger, Postman hay curl; chỉ nhắc đến artifact API thì chưa đủ để đổi mode", r"1. Choose mode before writing: default to current UI/FUNCTION flow; only use API mode when user explicitly requests writing API testcases or writing testcases for endpoints, OpenAPI/Swagger, Postman or curl; merely mentioning API artifacts is not enough to switch modes"),
    (r"2\. Nếu API mode có file nguồn, chạy `scripts/import-api-spec\.py` trước; không tự đọc rồi chép endpoint thủ công", r"2. If API mode has source files, run `scripts/import-api-spec.py` first; do not manually read and copy endpoints"),
    (r"3\. Kiểm tra `review_required`; nếu còn item thì dừng Excel generation và lấy expected còn thiếu từ user hoặc tài liệu", r"3. Check `review_required`; if items remain, stop Excel generation and get missing expected from user or documents"),
    (r"4\. Đọc requirement/AC và liệt kê requirement ID trước khi viết case", r"4. Read requirement/AC and list requirement IDs before writing cases"),
    (r"5\. Chọn đúng UI hoặc FUNCTION theo hành vi cần chứng minh; không gọi một case là UI-only chỉ vì thao tác qua dialog/button", r"5. Choose UI or FUNCTION correctly based on the behavior to prove; do not call a case UI-only just because it operates via dialog/button"),
    (r"6\. Tách scenario khi khác field, behavior hoặc AC; một scenario chỉ chứa một nhóm chức năng cụ thể", r"6. Split scenario when field, behavior or AC differs; one scenario contains only one specific functional group"),
    (r"7\. Tạo JSON đúng schema, giữ nguyên Scenario ID, Testcase ID và requirement reference", r"7. Create JSON with correct schema, preserve Scenario ID, Testcase ID and requirement reference"),
    (r"8\. Chạy `scripts/gen-testcases\.py`; script phải tạo `<output>\.md` trước `<output>\.xlsx` với cùng ngày `Asia/Ho_Chi_Minh`", r"8. Run `scripts/gen-testcases.py`; script must create `<output>.md` before `<output>.xlsx` with the same `Asia/Ho_Chi_Minh` date"),
    (r"9\. Đọc lại Markdown trước rồi đối chiếu Excel: số case, Scenario/Testcase ID và nội dung design phải khớp; cột I-M chỉ có ở Excel và để trống", r"9. Read Markdown first then compare with Excel: number of cases, Scenario/Testcase ID and design content must match; columns I-M exist only in Excel and are left blank"),
    (r"Nếu expected chưa có trong requirement, dừng case đó ở trạng thái cần làm rõ; không tự bịa business rule\.", r"If expected is not in requirements, pause that case in a clarification state; do not fabricate business rules."),
    (r"### 1\. Đọc & trích requirements", r"### 1. Read & extract requirements"),
    (r"\*\*BẮT BUỘC bám document\*\*\. Mỗi case phải trace về 1 AC\. Nếu KHÔNG có document → hỏi user\. Chi tiết fetch từ Plane: `@references/plane-integration\.md`\.", r"**MANDATORY to stick to documents**. Every case must trace to 1 AC. If NO document -> ask user. Plane fetch details: `@references/plane-integration.md`."),
    (r"### 2\. Tổ chức theo 2 phần \+ type order", r"### 2. Organize in 2 parts + type order"),
    (r"\*\*Cùng feature có ở cả 2 phần\*\* \(UI test hiển thị, Functional test logic\)\.", r"**Same feature can exist in both parts** (UI test for display, Functional test for logic)."),
    (r"\*\*API mode là tùy chọn\*\*: chỉ khi user yêu cầu testcase API, đọc \[references/api-testcases\.md\]\(references/api-testcases\.md\)\. API case vẫn nằm trong `1\.2\. FUNCTION`, dùng `kind=api` và giữ nguyên các cột B-M\. Nếu user không yêu cầu API thì không đọc reference này và tiếp tục flow hiện tại với `kind=ui` hoặc `kind=function`\.", r"**API mode is optional**: only when user requests API testcases, read [references/api-testcases.md](references/api-testcases.md). API cases still go in `1.2. FUNCTION`, use `kind=api` and keep columns B-M. If user does not request API, do not read this reference and continue current flow with `kind=ui` or `kind=function`."),
    (r"\*\*Quy tắc 1 scenario = 1 nhóm chức năng cụ thể\*\* \(KHÔNG gộp nhiều field/behavior\):", r"**Rule: 1 scenario = 1 specific functional group** (DO NOT group multiple fields/behaviors):"),
    (r"- Tách scenario khi khác \*\*field/input\*\* \(email validation ≠ password validation → 2 scenario\)", r"- Split scenario when **field/input** differs (email validation != password validation -> 2 scenarios)"),
    (r"- Tách scenario khi khác \*\*behavior\*\* \(submit-fail ≠ account-lock\)", r"- Split scenario when **behavior** differs (submit-fail != account-lock)"),
    (r"- Tách scenario khi khác \*\*AC\*\* \(AC3 ≠ AC4 ≠ AC5\)", r"- Split scenario when **AC** differs (AC3 != AC4 != AC5)"),
    (r"- Cùng `scenario_name` SHARED cho nhiều case CÙNG scenario — nhưng KHÔNG dùng chung scenario_name cho validation của field khác nhau", r"- Same `scenario_name` SHARED across cases IN THE SAME scenario — but DO NOT share scenario_name for validations of different fields"),
    (r"Ví dụ SAI vs ĐÚNG cho trang login:", r"WRONG vs CORRECT examples for login page:"),
    (r"❌ SAI: 1 scenario \"Validation email và password\" gộp 6 case", r"❌ WRONG: 1 scenario \"Validation email and password\" groups 6 cases"),
    (r"       \(3 case email validation \+ 2 case password validation \+ 1 case cả 2 trống\)", r"       (3 cases email validation + 2 cases password validation + 1 case both empty)"),
    (r"       → Tester khó filter, khó coverage check, scenario_name mơ hồ", r"       -> Hard for tester to filter, hard to check coverage, ambiguous scenario_name"),
    (r"✅ ĐÚNG: tách 2 scenario riêng", r"✅ CORRECT: split 2 separate scenarios"),
    (r"   - SCN-LOG-002 \"Validation email\"        → case về email \(trống, thiếu @, thiếu domain, subdomain\)", r"   - SCN-LOG-002 \"Validation email\"        -> email cases (empty, missing @, missing domain, subdomain)"),
    (r"   - SCN-LOG-003 \"Validation password\"     → case về password \(trống, cả 2 trống, <8 chars, =8 chars\)", r"   - SCN-LOG-003 \"Validation password\"     -> password cases (empty, both empty, <8 chars, =8 chars)"),
    (r"   → Mỗi scenario có 1 nhóm rõ ràng, tester filter được, coverage dễ check", r"   -> Each scenario has 1 clear group, tester can filter, coverage easy to check"),
    (r"### 3\. Gen cases theo type order", r"### 3. Gen cases by type order"),
    (r"8 loại:", r"8 types:"),
    (r"Chi tiết \+ ví dụ:", r"Details + examples:"),
    (r"- `scenario_name` \(string\) — tên nhóm chức năng, \*\*SHARED\*\* cho nhiều case cùng scenario", r"- `scenario_name` (string) — functional group name, **SHARED** for multiple cases in same scenario"),
    (r"- `scenario_id` \(string\) — mã scenario, vd `SCN-LOG-001`", r"- `scenario_id` (string) — scenario code, e.g. `SCN-LOG-001`"),
    (r"- Mỗi case có `type` \(1 trong 8\) \+ `req` \(trace về AC\) - BẮT BUỘC", r"- Each case has `type` (1 of 8) + `req` (trace to AC) - MANDATORY"),
    (r"- Riêng API mode, mỗi case thêm object `api`; xem \[examples/sample-api-input\.json\]\(examples/sample-api-input\.json\)\. Không có object `api` thì generator dùng nguyên `pre_condition`, `procedure`, `expected` như hiện tại", r"- In API mode specifically, each case adds `api` object; see [examples/sample-api-input.json](examples/sample-api-input.json). Without `api` object, generator uses `pre_condition`, `procedure`, `expected` as is"),
    (r"### 5\. Chạy script gen", r"### 5. Run gen script"),
    (r"Nếu user yêu cầu API testcase từ file hoặc folder nguồn, import trước:", r"If user requests API testcases from source file/folder, import first:"),
    (r"Chỉ chạy bước Excel khi command trả exit code `0` và `review_required` trống\. Với endpoint/curl không khai báo response status, user có thể xác nhận rồi truyền `--default-success-status 200`; không tự thêm option này nếu chưa được xác nhận\.", r"Only run Excel step when command returns exit code `0` and `review_required` is empty. For endpoints/curls without declared response status, user can confirm and pass `--default-success-status 200`; do not auto-add this option without confirmation."),
    (r"→ Script tự sinh `OneBrain_Testcases_<DD-MM-YYYY>\.md` trước → copy template → update Cover từ JSON → cleanup → ghi section/group/case rows → hardcode cùng Testcase ID → save `OneBrain_Testcases_<DD-MM-YYYY>\.xlsx`\.", r"-> Script auto-generates `OneBrain_Testcases_<DD-MM-YYYY>.md` first -> copies template -> updates Cover from JSON -> cleanups -> writes section/group/case rows -> hardcodes matching Testcase IDs -> saves `OneBrain_Testcases_<DD-MM-YYYY>.xlsx`."),
    (r"Markdown là bản AI đọc để hiểu testcase mà không cần parse Excel\. Đọc \[references/markdown-testcases\.md\]\(references/markdown-testcases\.md\) và không chỉnh hai file độc lập\.", r"Markdown is the AI-readable version to understand testcases without parsing Excel. Read [references/markdown-testcases.md](references/markdown-testcases.md) and do not edit the two files independently."),
    (r"Với API mode, generator chỉ ánh xạ object `api` vào F/G/H\. Testcase thường không có object `api` nên giữ nguyên đường chạy và cách đặt row height hiện tại\.", r"In API mode, generator only maps the `api` object to F/G/H. Regular testcases lack the `api` object so it keeps the current execution path and row height settings."),
    (r"Template gốc `assets/Template\.xlsx` cố tình giữ \*\*nhiều group headers mẫu\*\* \(REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD\) làm reference cho AI biết cấu trúc \+ padding rows từ Excel\. Khi sinh file output, script tự động:", r"Original template `assets/Template.xlsx` intentionally keeps **many sample group headers** (REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD) as reference for AI to know structure + row padding from Excel. When generating output, script automatically:"),
    (r"1\. \*\*Dynamic whitelist\*\*: chỉ giữ group header nào khai báo trong `JSON sections\[\]\.groups\[\]\.name`\. Group mẫu không dùng → xóa hẳn\.", r"1. **Dynamic whitelist**: only keep group headers declared in `JSON sections[].groups[].name`. Unused sample groups -> deleted completely."),
    (r"2\. \*\*Dynamic group\*\*: tự tạo group/tag chưa có sẵn trong template và cấp đủ dòng cho toàn bộ case", r"2. **Dynamic group**: auto-creates groups/tags not already in template and allocates enough rows for all cases"),
    (r"3\. \*\*Delete rows\*\*: dòng trống nào còn sót \(group bị bỏ \+ sample case rows\) → `ws\.delete_rows\(\)` xóa hoàn toàn, không giữ fill color / row height\.", r"3. **Delete rows**: any remaining empty rows (skipped groups + sample case rows) -> completely deleted via `ws.delete_rows()`, not keeping fill color / row height."),
    (r"4\. \*\*STT liên tục\*\*: `\[CODE-UI-NN\]` cho UI \(1-4\), `\[CODE-NN\]` cho Functional \(5-30\) trong cùng file\.", r"4. **Sequential numbering**: `[CODE-UI-NN]` for UI (1-4), `[CODE-NN]` for Functional (5-30) in the same file."),
    (r"\*\*Kết quả\*\*: file output gọn, chỉ chứa dữ liệu thật của dự án hiện tại \(vd demo project với 1 group LOGIN × 2 sections → file ~43 rows thay vì 657 rows như template\)\.", r"**Result**: output file is compact, containing only actual data for current project (e.g. demo project with 1 LOGIN group x 2 sections -> file ~43 rows instead of 657 template rows).")
]

for pat, repl in translations:
    content = re.sub(pat, repl, content, flags=re.MULTILINE)

with open("testcase-template/SKILL_TEMP.md", "w", encoding="utf-8") as f:
    f.write(content)

print("Created testcase-template/SKILL_TEMP.md with final translations")
