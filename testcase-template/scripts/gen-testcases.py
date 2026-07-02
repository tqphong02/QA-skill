#!/usr/bin/env python3
"""
gen-testcases.py — Generate test cases into a COPY of the team template,
GIỮ NGUYÊN format (formulas, dropdowns, styles, Report auto-aggregate).

Cách dùng:
  python3 gen-testcases.py input.json output.xlsx

Input JSON schema — xem examples/sample-input.json. Tóm tắt:
{
  "project": { "name","code","device","version","priority","test_date","author","reviewer","description","objective" },
  "source_document": "<đường dẫn/URL tài liệu spec>",
  "requirements": [ { "id":"AC1", "text":"..." } ],
  "sections": [
    { "title":"1.1. USER INTERFACE", "kind":"ui",
      "groups":[ { "name":"REGISTER", "scenarios":[
        { "scenario_id":"SCN-REG-001", "requirement":"AC1", "cases":[
          { "type":"happy", "req":"AC1", "description","pre_condition","procedure","expected","priority" }
        ] }
      ] } ] }
  ]
}

Sắp xếp case trong scenario theo type (canonical order):
  happy → alternative → validation → edge → negative → error → ui
Mỗi case:
  - Description được prefix [TYPE] (vd "[Happy] Login với ...")
  - Notes (col M) ghi "Ref: <req>" — traceability về tài liệu
  - Case ngoài spec (type=additional) → flag rõ

Logic:
  - Copy Template.xlsx → output.xlsx
  - Update Cover metadata (B3=name, C3=code, D3=device, E3=priority, B5=desc, D5=ver, E5=date, B7=objective, D7=author, E7=reviewer)
  - Clear sample test rows (10..max) trong Test cases_App, GIỮ style (capture trước khi clear)
  - Write section header (C, style section), group header (C, style group), data rows
    (B,E,F,G,H,J + D formula + I/J dropdown); cases SORT theo type order
  - Report sheet tự aggregate qua COUNTIFS ( KHÔNG cần đụng, chỉ cần module code khớp)
"""
import sys, json, shutil, datetime
from copy import copy
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

TEMPLATE = None  # set via argv

# Canonical test-case type order — cases SORT theo thứ tự này trong mỗi scenario.
TYPE_ORDER = ['happy', 'alternative', 'validation', 'edge', 'negative', 'error', 'ui', 'additional']
TYPE_LABEL = {
    'happy': 'Happy Path',
    'alternative': 'Alternative',
    'validation': 'Validation',
    'edge': 'Edge Case',
    'negative': 'Negative',
    'error': 'Error Handling',
    'ui': 'UI',
    'additional': 'Additional (out-of-spec)',
}

def type_rank(t):
    """Index trong TYPE_ORDER; type lạ → cuối (sau additional)."""
    t = (t or 'happy').lower().strip()
    return TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER)

def type_label(t):
    t = (t or 'happy').lower().strip()
    return TYPE_LABEL.get(t, t.capitalize())

# ---------- helpers ----------
def capture_style(ws, coord):
    """Capture (font, fill, border, alignment, number_format) từ 1 cell."""
    c = ws[coord]
    return {
        'font': copy(c.font),
        'fill': copy(c.fill),
        'border': copy(c.border),
        'alignment': copy(c.alignment),
        'number_format': c.number_format,
    }

def apply_style(cell, style):
    if not style: return
    cell.font = copy(style['font'])
    cell.fill = copy(style['fill'])
    cell.border = copy(style['border'])
    cell.alignment = copy(style['alignment'])
    cell.number_format = style['number_format']

def d_formula(row, anchor_row, is_ui):
    """Cột D — Test case ID tự sinh. anchor_row = row của section header."""
    if is_ui:
        return (f'=IF(AND(H{row}=""),"","["&Cover!$C$3&"-UI-"'
                f'&TEXT(ROW()-(ROW($C${anchor_row})-1)-COUNTBLANK($H${anchor_row}:H{row}),"##")&"]")')
    return (f'=IF(AND(H{row}=""),"","["&TEXT(Cover!$C$3,"##")&"-"'
            f'&TEXT(ROW()-(ROW($C${anchor_row})-1)-COUNTBLANK($H${anchor_row}:H{row}),"##")&"]")')

def parse_date(s):
    if not s: return None
    if isinstance(s, (datetime.date, datetime.datetime)): return s
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d'):
        try: return datetime.datetime.strptime(str(s), fmt)
        except ValueError: continue
    return None

# ---------- main ----------
def main():
    if len(sys.argv) < 3:
        print("Cách dùng: gen-testcases.py <input.json> <output.xlsx> [template.xlsx]")
        sys.exit(1)
    inp_path, out_path = sys.argv[1], sys.argv[2]
    tmpl = sys.argv[3] if len(sys.argv) > 3 else __file__.replace('/scripts/gen-testcases.py', '/assets/Template.xlsx')

    with open(inp_path, encoding='utf-8') as f:
        data = json.load(f)

    # 1. Copy template → output
    shutil.copyfile(tmpl, out_path)
    wb = openpyxl.load_workbook(out_path)
    ws = wb["Test cases_App"]
    cover = wb["Cover"]

    # 2. Capture styles từ sample rows TRƯỚC khi clear
    sty_section = capture_style(ws, 'C10')   # section header (UI, light blue)
    sty_section2 = capture_style(ws, 'C20')  # section header (Function, green) — backup
    sty_group = capture_style(ws, 'C11')     # group header
    sty = {
        'B': capture_style(ws, 'B12'), 'C': capture_style(ws, 'C12') or sty_group,
        'D': capture_style(ws, 'D12'), 'E': capture_style(ws, 'E12'),
        'F': capture_style(ws, 'F12') or capture_style(ws, 'E12'),
        'G': capture_style(ws, 'G12') or capture_style(ws, 'E12'),
        'H': capture_style(ws, 'H12'), 'I': capture_style(ws, 'I12'),
        'J': capture_style(ws, 'J12'), 'K': capture_style(ws, 'K12') or capture_style(ws, 'I12'),
        'L': capture_style(ws, 'L12') or capture_style(ws, 'I12'),
        'M': capture_style(ws, 'M12') or capture_style(ws, 'E12'),
        'N': capture_style(ws, 'N12') or capture_style(ws, 'E12'),
    }

    # 3. Clear sample content rows 10..max (chỉ value, giữ style row)
    max_r = ws.max_row
    for r in range(10, max_r + 1):
        for c in range(1, 32):
            ws.cell(row=r, column=c).value = None
    # Xoá data validation cũ (trên range sample) để add lại clean
    ws.data_validations.dataValidation = []

    # 4. Update Cover metadata
    p = data.get('project', {})
    cover['B3'] = p.get('name', '')
    cover['C3'] = p.get('code', '')
    cover['D3'] = p.get('device', '')
    cover['E3'] = p.get('priority', 'Medium')
    cover['B5'] = p.get('description', '')
    cover['D5'] = p.get('version', '')
    d = parse_date(p.get('test_date'))
    if d: cover['E5'] = d
    cover['B7'] = p.get('objective', '')
    cover['D7'] = p.get('author', '')
    cover['E7'] = p.get('reviewer', '')

    # 5. Write test cases
    # Template chia 2 phần BẮT BUỘC: Phần 1 = UI (1.1), Phần 2 = Functional (1.2).
    sections_in = data.get('sections', [])
    has_ui = any(s.get('kind', '').lower() == 'ui' for s in sections_in)
    ui_first = sections_in and sections_in[0].get('kind', '').lower() == 'ui'
    if not has_ui:
        print("  ⚠️  CẢNH BÁO: thiếu phần UI (kind='ui'). Template chuẩn có 2 phần: UI (1.1) + Functional (1.2).")
    elif not ui_first:
        print("  ⚠️  CẢNH BÁO: phần UI nên ĐẦU TIÊN (trước Functional). Đang xếp sai thứ tự.")

    row = 10
    data_ranges = []  # (i_range, j_range) để add validation
    data_start = None
    for sec in sections_in:
        is_ui = sec.get('kind', '').lower() == 'ui'
        anchor = row
        # Section header row (col C)
        c = ws.cell(row=row, column=3, value=sec.get('title', ''))
        apply_style(c, sty_section if is_ui else sty_section2)
        for col in (2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14):  # tô style các cell cùng row cho đẹp
            apply_style(ws.cell(row=row, column=col), sty_section if is_ui else sty_section2)
        row += 1

        for grp in sec.get('groups', []):
            # Group header row (col C)
            c = ws.cell(row=row, column=3, value=grp.get('name', ''))
            apply_style(c, sty_group)
            for col in (2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14):
                apply_style(ws.cell(row=row, column=col), sty_group)
            row += 1

            for sc in grp.get('scenarios', []):
                sid = sc.get('scenario_id', '')
                # SORT cases theo canonical type order (happy → alt → validation → edge → negative → error → ui)
                cases = sorted(sc.get('cases', []), key=lambda c: type_rank(c.get('type')))
                for case in cases:
                    if data_start is None: data_start = row
                    ctype = case.get('type', 'happy')
                    # Description prefix [TYPE] để type hiện rõ trong file
                    desc_raw = case.get('description', '')
                    desc = f"[{type_label(ctype)}] {desc_raw}" if desc_raw else f"[{type_label(ctype)}]"
                    # Notes = Ref:<req> cho traceability về tài liệu
                    req = case.get('req') or sc.get('requirement', '')
                    note = f"Ref: {req}" if req else ("Ref: (out-of-spec)" if ctype == 'additional' else "")
                    vals = {
                        2: sid,
                        5: desc,
                        6: case.get('pre_condition', ''),
                        7: case.get('procedure', ''),
                        8: case.get('expected', ''),
                        10: case.get('priority', 'Medium'),
                        11: parse_date(p.get('test_date')) or '',
                        12: p.get('author', ''),
                        13: note,
                    }
                    for col, v in vals.items():
                        cell = ws.cell(row=row, column=col, value=v)
                        letter = get_column_letter(col)
                        apply_style(cell, sty.get(letter) or sty['E'])
                    # Cột D = formula
                    dcell = ws.cell(row=row, column=4, value=d_formula(row, anchor, is_ui))
                    apply_style(dcell, sty['D'])
                    # I (Results) để trống — tester điền
                    apply_style(ws.cell(row=row, column=9), sty['I'])
                    data_ranges.append(row)
                    row += 1
            # dòng trống sau mỗi group (theo template)
            row += 0

    # 6. Add data validation cho tất cả data rows
    if data_ranges:
        rmin, rmax = min(data_ranges), max(data_ranges)
        dv_i = DataValidation(type='list', formula1='"Pass,Fail,N/A,Untested"', allow_blank=True)
        dv_i.add(f'I{rmin}:I{rmax}')
        ws.add_data_validation(dv_i)
        dv_j = DataValidation(type='list', formula1='"Critical,High,Medium,Low,N/A"', allow_blank=True)
        dv_j.add(f'J{rmin}:J{rmax}')
        ws.add_data_validation(dv_j)

    # 7. Save
    wb.save(out_path)
    print(f"✅ Generated {out_path}")
    print(f"   {len(data_ranges)} test cases across {len(data.get('sections',[]))} sections.")
    print(f"   Cover metadata updated (code={p.get('code','?')}).")
    print(f"   Report sheet auto-aggregates via COUNTIFS (rows 9-1723).")

if __name__ == '__main__':
    main()
