---
name: testcase-template
description: Viết / sinh test case ra Excel theo ĐÚNG template chuẩn team (Nina Studio format — 4 sheet Cover/Test cases_App/Dropdown Keys/Report, cột Scenario ID/Scenario Name/Description/Pre-condition/Procedure/Expected, Test case ID hardcoded theo STT, dropdown Pass-Fail & Priority, Report auto-aggregate bằng COUNTIFS). BẮT BUỘC bám document — mỗi case trace về 1 requirement/AC (Ref trong Notes), KHÔNG bịa. Case SẮP XẾP theo type order chuẩn: Happy Path → Alternative → Validation → Edge Case → Negative → Error Handling (script tự sort). Format MANUAL tester: Description bắt đầu bằng "Xác minh rằng ...", Scenario Name là tên nhóm chức năng chung cho nhiều case (vd "Email validation", "Login authentication fail"). Skill dùng 1 template chung assets/Template.xlsx cho MỌI project — không cần tạo project-specific template. Mọi thông tin project (name, code, modules) configurable từ JSON input. Member khi git clone code về chạy được ngay với project bất kỳ. Dùng khi: "viết test case", "tạo test case excel", "sinh test case theo template/spec", "QA test case", "fill test case vào template", "test case từ spec/ticket", "SCN test case".
---

# testcase-template — sinh test case Excel theo template chuẩn team

Skill lưu **template gốc** ở `assets/Template.xlsx` (chuẩn format dùng chung cho MỌI project — không cần tạo template riêng cho từng project). Mọi thông tin project-specific (tên, code, modules) đều configurable từ JSON input. Khi cần test case, AI **tạo bản sao** template rồi **gen test case vào** — format (formulas, dropdowns, styles, Report auto-aggregate) giữ **y chang**, chỉ đổi metadata + nội dung test case. Member khi clone code về chạy được ngay với project bất kỳ, chỉ cần thay `project.code` trong JSON input.

> **Khi nào dùng skill này:**
> - User muốn viết test case ra **file Excel** theo chuẩn team.
> - User nói "tạo test case cho feature X", "fill vào template", "sinh test case theo format Nina Studio".
> - Cần document test case bàn giao cho QA/dev/lead review.
>
> **KHÁC `playwright-pom-automation`** (code automation `.spec.ts`) và `qa-run` (live exploratory): skill này = **document test case Excel** (manual test design).

---

## Cấu trúc template (4 sheet — ĐỪNG sửa cấu trúc, chỉ fill nội dung)

### Sheet `Cover` — metadata project
| Cell | Ý nghĩa |
|---|---|
| B3 | Project Name (vd "BCP AI") |
| **C3** | **Project Code** (vd `BCP`, `NSM`, `DEM`) — **QUAN TRỌNG**: cột D dùng code này để sinh Test case ID. Script tự detect template theo code này. |
| D3 | Device (Web/iPhone/...) |
| E3 | Priority tổng |
| B5 | Description |
| D5 | Version |
| E5 | Test Date |
| B7 | Test Objective |
| D7 | Author |
| E7 | Reviewer |

### Sheet `Test cases_App` — test case (header ở **row 9**)

> **Cấu trúc 2 PHẦN BẮT BUỘC** — sheet chia làm 2 phần cố định, theo đúng template:
>
> | Phần | Section header (col C) | `kind` | Style header | Cột D format |
> |---|---|---|---|---|
> | **Phần 1 — UI** | `1.1. USER INTERFACE` | `"ui"` | Xanh nhạt (light blue) | `[CODE-UI-01]`, `[CODE-UI-02]`... |
> | **Phần 2 — Functional** | `1.2. FUNCTION` | `"function"` | Xanh lá (green) | `[CODE-01]`, `[CODE-02]`... |
>
> **Quy tắc:**
> - **Luôn có cả 2 phần**, UI ở ĐẦU TIÊN, Functional ở thứ hai (script cảnh báo nếu sai).
> - Trong mỗi phần: các **Group** (LOGIN, REGISTER, BOOKING...) → **Scenario** (SCN-xxx) → **Cases**.
> - Cùng feature (vd LOGIN) thường có ở CẢ 2 phần: UI part test hiển thị/element, Functional part test logic/flow.
> - Nếu feature KHÔNG có UI (vd API thuần) → vẫn để phần UI với 1 group note "N/A", hoặc bỏ group đó (giữ section header).
> - Thêm phần mới (vd `1.3. PERFORMANCE`) thì đặt SAU Functional, `kind` không phải `ui`.


| Col | Header | Ai fill | Ghi chú |
|---|---|---|---|
| B | Scenario ID | AI | vd `SCN-LOG-001` |
| **C** | **Scenario Name** | **AI** | **Tên nhóm chức năng** - SHARED cho nhiều case cùng scenario (vd "Email validation", "Login authentication fail"). Đặt ở level `scenario` trong JSON, KHÔNG đặt riêng cho từng case. |
| **D** | **Test case ID** | **AI - HARDCODED** | Format `[CODE-NN]` hoặc `[CODE-UI-NN]`. KHÔNG dùng formula. STT liên tục trong file. |
| **E** | **Description** | **AI** | **Format MANUAL tester**: bắt đầu bằng "Xác minh rằng..." (verify that user...). KHÔNG có `[STT]`, `[Type]`, `/` hay ký tự kỹ thuật. |
| F | Pre-condition | AI | Điều kiện trước khi chạy (account, data, state) |
| G | Test Case Procedure | AI | Steps đánh số `1. ...\n2. ...\n3. ...` |
| H | Expected Results | AI | Kết quả mong đợi, đo được |
| I | Results | **Tester** điền khi chạy | dropdown: `Pass | Fail | N/A | Untested` |
| J | Priority | **Tester** điền khi review | dropdown: `Critical | High | Medium | Low | N/A` |
| K | Date | **Tester** | Ngày chạy test |
| L | Tester | **Tester** | Tên người chạy |
| M | Notes | **Tester** | Ghi chú khi chạy |

**Quan trọng:**
- **Cột C (Scenario Name)**: Nhiều case có thể CHIA SẺ cùng tên scenario (vd 5 case "Bỏ trống email", "Email thiếu @", "Email thiếu domain" đều có scenario_name = "Email validation"). KHÔNG dùng tên test case riêng lẻ.
- **Cột D (Test case ID)**: HARDCODED giá trị, không phải formula. Format `[BCP-01]`, `[BCP-02]`, ... `[BCP-NN]` cho Functional; `[BCP-UI-01]`, ... cho UI. STT liên tục trong toàn bộ file (cả UI + Functional).
- **Cột I, J, K, L, M**: ĐỂ TRỐNG khi gen, **chỉ apply style** để giữ format. Tester sẽ tự điền khi execution.
- **Row height**: Set cố định 51pt cho mỗi test case row, 33pt cho section header, 27pt cho group header. KHÔNG để Excel tự co giãn.
- **Wrap text**: Bật cho columns E, F, G, H (description-rich).

**Dropdown** (data validation tự có):
- Cột I (Results): `Pass | Fail | N/A | Untested`
- Cột J (Priority): `Critical | High | Medium | Low | N/A`

### Sheet `Dropdown Keys` — controlled vocabulary (KHÔNG xóa)
Nguồn cho dropdown. Đã có: EXECUTION STATUS, PRIORITY, IMPLEMENTATION STATUS, TEST CASE STATUS.

### Sheet `Report` — tự tổng hợp (KHÔNG cần đụng)
COUNTIFS tự đếm Pass/Fail/NA theo module + priority từ `Test cases_App` (rows 9-1723). **Điều kiện để Report đúng**: Scenario ID (cột B) hoặc grouping phải khớp module code ở cột B của Report (vd `M.01.01`, `M.02.01`). → Khi gen, đặt module code vào Scenario ID hoặc cập nhật danh sách module ở Report cho khớp project.

---

## Workflow — AI gen test case (5 bước) — BẮT BUỘC bám document

### Bước 1 — Đọc & trích requirements từ document (BẮT BUỘC trước)
**KHÔNG được bịa test case.** Mọi case phải trace về 1 requirement/AC trong tài liệu.
- Đọc spec/PRD/ticket/AC (file local, URL, hoặc user paste).
- Trích thành danh sách requirements có ID: `{ "id":"AC1", "text":"User login với email+password đúng → Dashboard" }`, ...
- Nếu KHÔNG có document → **hỏi user** cung cấp, hoặc đồng ý test theo UI hiện có (lúc đó mọi case = `type:"additional"`, ghi rõ `Ref: (out-of-spec)`).

### Bước 2 — Tổ chức test case theo cấu trúc 2 phần + type order
```
PHẦN 1 — UI: 1.1. USER INTERFACE (kind=ui)    ← col C, header xanh nhạt, ID [CODE-UI-xx]
└─ Group (REGISTER / LOGIN / HOME / ...)       ← col C, group header
   └─ Scenario (SCN-LOG-001, map 1 requirement) ← col B
      └─ Cases — type order (UI cases: hiển thị/element/layout)

PHẦN 2 — FUNCTIONAL: 1.2. FUNCTION (kind=function) ← col C, header xanh lá, ID [CODE-xx]
└─ Group (REGISTER / LOGIN / HOME / ...)       ← col C, group header
   └─ Scenario (SCN-LOG-001, map 1 requirement) ← col B
      └─ Cases — type order (happy → alt → validation → edge → negative → error)
```
- **Luôn 2 phần**: UI trước, Functional sau (script cảnh báo nếu thiếu/sai thứ tự).
- Cùng feature (LOGIN) có ở cả 2 phần: UI test hiển thị, Functional test logic.
- Mỗi **Scenario** map về 1 requirement (`requirement: "ACx"`).
- Mỗi **case** phải có `type` + `req`.

### Bước 3 — Gen cases theo taxonomy type (canonical order)
Trong mỗi scenario, gen cases theo **đúng thứ tự** này (script tự sort, AI cứ viết đúng type):

| # | Type | Label trong file | Test cái gì | Ví dụ |
|---|---|---|---|---|
| 1 | `happy` | `[Happy Path]` | Flow đúng, input hợp lệ → phải PASS | login đúng → Dashboard |
| 2 | `alternative` | `[Alternative]` | Cách khác cùng kết quả OK | bấm Enter thay vì click |
| 3 | `validation` | `[Validation]` | Required/format/constraint | bỏ trống, email thiếu @ |
| 4 | `edge` | `[Edge Case]` | Boundary: min/max/empty/long | password đúng 8 ký tự (boundary) |
| 5 | `negative` | `[Negative]` | Input sai, unauthorized, sai flow | password sai, email không tồn tại |
| 6 | `error` | `[Error Handling]` | Server/network fail, graceful | 500, timeout, disconnect |
| 7 | `ui` | `[UI]` | Display/layout (section UI) | element hiển thị đúng |
| 8 | `additional` | `[Additional (out-of-spec)]` | AI thêm ngoài document — PHẢI flag | case đoán thêm, KHÔNG trong AC |

**Quy tắc bám document:**
- Mỗi case PHẢI có `req` trỏ về 1 AC. Script ghi `Ref: <AC>` vào cột Notes.
- Case `additional` (không trong doc) → ghi rõ `Ref: (out-of-spec)` + báo user review.
- **KHÔNG bịa** expected result — phải khớp spec. Nếu spec mơ hồ → hỏi user, đừng tự giải thích.

### Bước 4 — Build JSON input
Schema đầy đủ — xem `examples/sample-input.json`. Tóm tắt:
```json
{
  "project": { "name","code","device","version","priority","test_date","author","reviewer","description","objective" },
  "source_document": "<đường dẫn/URL tài liệu>",
  "requirements": [ { "id":"AC1", "text":"..." } ],
  "sections": [
    { "title":"1.2. FUNCTION", "kind":"function",
      "groups":[ { "name":"LOGIN", "scenarios":[
        { "scenario_id":"SCN-LOG-001", "requirement":"AC1", "cases":[
          { "type":"happy", "req":"AC1", "description","pre_condition","procedure","expected","priority":"High" },
          { "type":"validation", "req":"AC3", "description":"...", ... },
          { "type":"edge", "req":"AC1", "description":"...", ... },
          { "type":"negative", "req":"AC2", "description":"...", ... }
        ] }
      ] } ] }
  ]
}
```
- `"kind":"ui"` → cột D sinh ID `[CODE-UI-xx]`; khác → `[CODE-xx]`.
- Code (C3) viết HOA, ngắn (3-4 ký tự).
- `type` + `req` BẮT BUỘC với mỗi case (mặc định `happy` nếu quên).
- Cases KHÔNG cần viết theo thứ tự — **script tự sort** theo type order.

Quy ước viết nội dung:
- **Procedure** (cột G): steps đánh số `1. ...\n2. ...` (xuống dòng từng bước).
- **Expected** (cột H): cụ thể, đo được — KHÔNG viết "hoạt động tốt".
- **Pre-condition** (cột F): điều kiện trước khi chạy (account, data, state).
- **Priority**: Critical (block) / High (chính) / Medium / Low (cosmetic).

### Bước 5 — Chạy script gen
```bash
python3 ~/.claude/skills/testcase-template/scripts/gen-testcases.py input.json output.xlsx
```
→ Script: copy template → update Cover → clear sample rows (giữ style) → write section/group/case rows **đã sort theo type** + `[TYPE]` prefix ở Description + `Ref:` ở Notes + cột D formula + dropdown → save. **Report tự aggregate**.

---

## Ví dụ dùng

**"Tạo test case cho feature Login theo template team (dựa spec login-spec.md)"**
→ AI: đọc spec → trích AC1-AC5 → build JSON (Function section, group LOGIN, cases theo type: happy/alternative/validation×3/edge/negative×2/error) → chạy script → trả `.xlsx` có `[TYPE]` prefix + `Ref: ACx` ở mỗi case.

**"Sinh test case từ ticket Plane #XXX"**
→ AI: `WebFetch` ticket → trích AC → build JSON (mỗi case map `req: ACx`) → gen.

**"Thêm test case cho module Booking"**
→ AI: đọc spec Booking → trích AC → thêm section/group BOOKING vào JSON → re-gen. (JSON = single source of truth.)

**User KHÔNG đưa document**
→ AI hỏi: *"Chưa có spec — bạn paste tài liệu / cho link, hoặc mình gen theo UI hiện có (mọi case sẽ tag `[Additional (out-of-spec)]` để review)?"* Đừng bịa AC.

---

## Lưu ý quan trọng

- **Bám document là quy tắc #1**: mọi case phải có `req` trace về AC. Case `additional` = ngoại lệ, PHẢI flag.
- **Type order tự sort**: AI viết case theo bất kỳ thứ tự nào trong JSON, script sắp lại happy → alternative → validation → edge → negative → error → ui.
- **Template là bản gốc** (`assets/Template.xlsx`) — KHÔNG edit trực tiếp. Luôn gen file mới.
- **JSON là single source of truth** — lưu ở `<project>/qa/testcases/<feature>.json`, gen xlsx từ đó. Đừng edit xlsx tay rồi re-gen.
- **Report module codes**: để Report tổng hợp đúng, đặt module code (`M.02.01`) vào Scenario ID (cột B) hoặc cập nhật danh sách module ở Report cho khớp project.
- **Giới hạn**: ~1700 test cases/file (COUNTIFS quét rows 9-1723). Vượt → tách file.
- **openpyxl** phải có (`pip3 install openpyxl` — thường có sẵn).

---

## Self-check trước khi trả file
- [ ] **2 phần cấu trúc**: UI (`1.1. USER INTERFACE`, header xanh nhạt, ID `[CODE-UI-xx]`) ở ĐẦU + Functional (`1.2. FUNCTION`, header xanh lá, ID `[CODE-xx]`) ở thứ hai.
- [ ] **Mọi case có `Ref: ACx`** ở Notes — trace về document (KHÔNG có case nào "không rõ base").
- [ ] Case `[Additional (out-of-spec)]` được báo user review.
- [ ] Cases **sắp theo type order**: happy → alternative → validation → edge → negative → error.
- [ ] Mỗi AC trong document có ≥1 case cover (KHÔNG miss requirement).
- [ ] Cover metadata đúng (đặc biệt **C3 = project code**).
- [ ] Cột D là **formula** (không hardcode) → mở Excel tự hiện ID.
- [ ] Dropdown I (Results) + J (Priority) hoạt động.
- [ ] Procedure có steps đánh số; Expected cụ thể đo được; Priority hợp lý.

---

# Appendix — Merge từ `anhtester/codex-testing-kit`

> Nguồn: repo `anhtester/codex-testing-kit` (Anh Tester, MIT). Mượn concept `$fetch-jira-requirements` + `$analyze-requirement-document`, viết lại cho Plane API (MDS team dùng Plane, không dùng Jira).

## A.1 Plane Fetch — Bước 0 tự động (từ `$fetch-jira-requirements`)

### Vấn đề giải quyết
Codex skill `$fetch-jira-requirements` tự fetch ticket từ Jira để AI đọc AC. Bản Plane tương đương: user chỉ paste URL ticket Plane (vd `https://projects.metasolutions.ai/mds-team/projects/<PID>/issues/<SEQ>/`) → AI tự fetch nội dung, **không hỏi lại**.

### Workflow tích hợp (sửa Bước 1)

Trong SKILL.md §"Workflow — AI gen test case (5 bước)", **Bước 1 — Đọc & trích requirements** thêm nhánh:

#### Nhánh 1A — User paste URL Plane (MỚI — recommended)

User chỉ cung cấp URL → AI tự fetch, không hỏi lại:

```bash
# Ví dụ URL:
# https://projects.metasolutions.ai/mds-team/projects/9482533a-.../issues/39/
# → workspace: mds-team, project: 9482533a-..., issue seq: 39
```

**Cấu hình cần có** (1 lần): file `~/.claude/skills/qa-run/config.env` đã có sẵn (skill qa-run dùng chung):
```bash
PLANE_API_KEY="plane_api_..."     # lấy từ: Plane → Profile Settings → Personal Access Tokens
PLANE_WORKSPACE_SLUG="mds-team"   # từ URL dashboard
```

**Helper Bash — fetch 1 ticket:**
```bash
# scripts/fetch-plane-issue.sh <project_id> <sequence_id>
#!/usr/bin/env bash
set -euo pipefail
source ~/.claude/skills/qa-run/config.env

PROJECT_ID="$1"
SEQ_ID="$2"
ISSUE_ID=$(curl -s -H "X-API-Key: $PLANE_API_KEY" \
  "${PLANE_BASE_URL}/api/${PLANE_API_VERSION}/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PROJECT_ID}/work-items/?sequence_id=${SEQ_ID}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['results'][0]['id'])")

curl -s -H "X-API-Key: $PLANE_API_KEY" \
  "${PLANE_BASE_URL}/api/${PLANE_API_VERSION}/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PROJECT_ID}/work-items/${ISSUE_ID}/?expand=state,assignees" \
  | python3 -m json.tool
```

**Cách AI dùng:**
1. Parse URL → `project_id`, `sequence_id`
2. Chạy script trên → lấy JSON issue
3. Trích từ `name`, `description_html` (HTML → text), `state.name`, `assignees[].display_name`, `priority`
4. Map thành requirements JSON:
   ```json
   [
     { "id": "AC1", "text": "User login với email+password đúng → Dashboard" },
     { "id": "AC2", "text": "Email không tồn tại → hiện 'Email not found'" }
   ]
   ```
5. Tiếp tục Bước 2 (tổ chức 2 phần UI/Function) như cũ.

#### Nhánh 1B — User paste nội dung (giữ nguyên flow cũ)
Như §"Bước 1" cũ — đọc file local, paste text.

#### Nhánh 1C — User chỉ có tên feature (giữ nguyên)
Tự suy luận từ UI + tag `[Additional (out-of-spec)]`.

### Khi nào dùng nhánh nào
| Input | Nhánh | Ghi chú |
|---|---|---|
| URL ticket Plane | **1A** (mới) | AI tự fetch, không hỏi |
| File local `.md`/`.txt` | 1B | Đọc file |
| Paste text vào chat | 1B | Parse text |
| Chỉ tên feature | 1C | Suy luận + flag additional |

### Lỗi thường gặp
- **404 / Permission denied** → báo user check API key + project_id đúng chưa.
- **Empty description** → báo user, fallback nhánh 1C.
- **Ticket có PR/commit link kèm** → fetch thêm diff (xem qa-run SKILL.md §"Bước A") để biết validation rule mới.

### Ví dụ end-to-end

User: *"Sinh test case cho ticket https://projects.metasolutions.ai/mds-team/projects/9482533a-c9ca-4be6-be3f-2c74b1b54137/issues/466/"*

AI:
1. Parse URL → project `9482533a-...`, issue seq `466`
2. Chạy `fetch-plane-issue.sh 9482533a-... 466` → lấy JSON
3. Đọc: `name="[iOS] Calendar - Crash app khi tạo mới event"`, `priority="high"`, `description_html` chứa AC
4. Trích AC:
   - AC1: Tap "+" → mở form create event
   - AC2: Save event → xuất hiện trong calendar list
   - AC3: Event có title rỗng → disable Save
   - AC4: Event có end_date < start_date → validation error
5. Build JSON test case (Functional section, group CALENDAR, 6-8 cases theo type order)
6. Sinh Excel, mỗi case `Ref: AC1`/`AC2`/`AC3`/`AC4` ở Notes.

→ Không hỏi user thêm gì, output `.xlsx` trong 1-2 turn.
