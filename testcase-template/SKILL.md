---
name: testcase-template
description: Viết / sinh test case ra Excel theo template chuẩn team (Nina Studio — 4 sheet Cover/Test cases_App/Dropdown Keys/Report). Format MANUAL: Description "Xác minh rằng...", Scenario Name shared cho nhiều case. Test case ID hardcoded theo STT. 1 template chung assets/Template.xlsx cho MỌI project. Config từ JSON. Dùng khi: "viết test case", "tạo test case excel", "sinh test case theo template", "fill test case vào template", "test case từ spec/ticket".
---

# testcase-template — sinh test case Excel theo template chuẩn team

Template gốc: `assets/Template.xlsx` (1 file chung cho MỌI project). Mọi thông tin project (name, code, modules) configurable từ JSON input. **KHÔNG cần tạo template riêng cho từng project**.

> **Khi nào dùng**: User muốn viết test case Excel theo chuẩn team.
> **KHÁC** `qa-run` (live exploratory) và `playwright-pom-automation` (code automation `.spec.ts`): skill này = document test case Excel (manual test design).
> **API key**: dùng chung từ `../config/api_keys.json` (xem scripts/ai_provider.py) — KHÔNG cần key nếu dùng Copilot Pro/Antigravity/Claude Code CLI. Member khi git clone code về chạy được ngay với project bất kỳ.

## Workflow — AI gen test case (5 bước)

### Bước 1 — Đọc & trích requirements
**BẮT BUỘC bám document**. Mỗi case phải trace về 1 AC. Nếu KHÔNG có document → hỏi user. Chi tiết fetch từ Plane: `@references/plane-integration.md`.

### Bước 2 — Tổ chức theo 2 phần + type order
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

### Bước 3 — Gen cases theo type order
8 loại: `happy → alternative → validation → edge → negative → error → ui → additional`. Chi tiết + ví dụ: `@references/test-types.md`.

### Bước 4 — Build JSON input
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

### Bước 5 — Chạy script gen
```bash
python3 scripts/gen-testcases.py input.json output.xlsx
```
→ Script copy template → update Cover từ JSON → clear sample rows (chỉ giữ groups khai báo trong JSON) → **xóa hẳn dòng mẫu không dùng** → ghi section/group/case rows theo type order → hardcode test case ID (vd `[BCP-01]`, `[BCP-02]`) → save.

### Output cleanup (auto)

Template gốc `assets/Template.xlsx` cố tình giữ **nhiều group headers mẫu** (REGISTER, LOGIN, HOME, BOOKING, PROFILE, SETTING, NOTIFICATION, DASHBOARD) làm reference cho AI biết cấu trúc + padding rows từ Excel. Khi sinh file output, script tự động:

1. **Dynamic whitelist**: chỉ giữ group header nào khai báo trong `JSON sections[].groups[].name`. Group mẫu không dùng → xóa hẳn.
2. **Delete rows**: dòng trống nào còn sót (group bị bỏ + sample case rows) → `ws.delete_rows()` xóa hoàn toàn, không giữ fill color / row height.
3. **STT liên tục**: `[CODE-UI-NN]` cho UI (1-4), `[CODE-NN]` cho Functional (5-30) trong cùng file.

**Kết quả**: file output gọn, chỉ chứa dữ liệu thật của dự án hiện tại (vd demo project với 1 group LOGIN × 2 sections → file ~43 rows thay vì 657 rows như template).

## Format columns (Test cases_App)

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

## Cấu trúc template chi tiết

Xem `@references/template-schema.md` để biết chi tiết về 4 sheet (Cover, Test cases_App, Dropdown Keys, Report).

## Tóm tắt nhanh

- **Template**: 1 file `assets/Template.xlsx` (dùng chung, có sample rows làm reference)
- **Output cleanup**: Tự động xóa group/sample rows không dùng → file gọn
- **Format**: MANUAL tester, hardcoded ID, shared scenario name
- **API key**: từ `config/api_keys.json` hoặc env var hoặc auto-detect (Antigravity/Copilot)
- **Row height**: 51pt cố định
- **Wrap text**: bật cho E, F, G, H
- **Cột I, J, K, L, M**: để trống cho tester

## Lưu ý quan trọng

- Mỗi case **BẮT BUỘC** có `req` trỏ về 1 AC (trong Notes ghi `Ref: ACx`)
- Case `additional` (ngoài spec) → flag rõ `Ref: (out-of-spec)` + báo user
- **KHÔNG bịa** expected result dựa trên spec mơ hồ — hỏi user
- Description format MANUAL: "Xác minh rằng..." không có `[STT]`, `[Type]`, `/` lạ
- Nhiều case có thể cùng `scenario_name` (chia sẻ tên nhóm chức năng)

## Bản chính - 3 skill này dùng chung key

Cấu hình key 1 lần tại `../config/api_keys.json` (gitignored), dùng được cho cả 3 skill. Xem [README.md](../README.md) mục "API Keys".
