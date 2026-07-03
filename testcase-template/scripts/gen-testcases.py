#!/usr/bin/env python3
"""
gen-testcases.py — Generate test cases into a COPY of the team template,
GIỮ NGUYÊN format (formulas, dropdowns, styles, Report auto-aggregate).

Cách dùng:
  python3 gen-testcases.py input.json output.xlsx

Template structure:
  R9:  Headers
  R10: 1.1. USER INTERFACE (section header - cyan)
  R11: REGISTER (group header)
  R12-13: (empty - for REGISTER UI cases)
  R14: LOGIN (group header)
  R15-19: (empty - for LOGIN UI cases)
  R20: 1.2. FUNCTION (section header - green)
  R21: HOME (group header)
  R22-30: (empty - for HOME Functional cases)
  R31: LOGIN (group header)
  R32+: (empty - for LOGIN Functional cases)

Logic:
  - Đọc template, tìm vị trí các group/section
  - Ghi test cases vào đúng vị trí row trống theo từng (section, group)
  - Section UI có anchor_row cho công thức test case ID [BCP-UI-NN]
  - Section Functional có anchor_row cho công thức test case ID [BCP-NN]
  - STT liên tục trong toàn bộ file
"""
import sys, json, shutil, datetime, os
from copy import copy
import openpyxl
from openpyxl.styles import Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

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
    t = (t or 'happy').lower().strip()
    return TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER)

def type_label(t):
    t = (t or 'happy').lower().strip()
    return TYPE_LABEL.get(t, t.capitalize())

# ---------- helpers ----------
def capture_style(ws, coord):
    c = ws[coord]
    return {
        'font': copy(c.font),
        'fill': copy(c.fill),
        'border': copy(c.border),
        'alignment': copy(c.alignment),
        'number_format': c.number_format,
    }

def apply_style(cell, style, wrap_text=False):
    if not style: return
    cell.font = copy(style['font'])
    cell.fill = copy(style['fill'])
    cell.border = copy(style['border'])
    cell.alignment = copy(style['alignment'])
    if wrap_text:
        cell.alignment = Alignment(
            horizontal=style['alignment'].horizontal or 'left',
            vertical=style['alignment'].vertical or 'top',
            wrap_text=True,
            indent=style['alignment'].indent or 0
        )
    cell.number_format = style['number_format']

def safe_set(ws, coord, value):
    try:
        ws[coord] = value
    except AttributeError:
        for mr in list(ws.merged_cells.ranges):
            cell_ref = ws[coord].coordinate
            if cell_ref in mr:
                ws.unmerge_cells(str(mr))
                ws[coord] = value
                break

def d_formula(row, anchor_row, is_ui, project_code):
    """Cột D — Test case ID tự sinh.
    Đếm số row đã có H (Expected) trong cùng section từ anchor_row đến row hiện tại.
    """
    prefix = f'{project_code}-UI-' if is_ui else f'{project_code}-'
    return (f'=IF(H{row}="","","[{prefix}'
            f'&TEXT(COUNTIF($H${anchor_row+1}:H{row},"<>"),"00")&"]")')

def parse_date(s):
    if not s: return None
    if isinstance(s, (datetime.date, datetime.datetime)): return s
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d'):
        try: return datetime.datetime.strptime(str(s), fmt)
        except ValueError: continue
    return None

def find_group_position(ws, section_title, group_name):
    """Tìm vị trí row của group trong template theo (section_title, group_name).
    Returns: (anchor_row, first_empty_row) hoặc None nếu không tìm thấy.
    """
    section_row = None
    for r in range(1, ws.max_row + 1):
        val = ws.cell(row=r, column=3).value
        if val == section_title:
            section_row = r
            break
    if section_row is None:
        return None
    # Tìm group_row trong section này
    group_row = None
    for r in range(section_row + 1, ws.max_row + 1):
        val = ws.cell(row=r, column=3).value
        if val == group_name:
            group_row = r
            break
        # Nếu gặp section mới thì dừng
        if val and (val.startswith('1.1.') or val.startswith('1.2.') or val.startswith('1.3.')):
            break
    if group_row is None:
        return None
    # Tìm row trống đầu tiên SAU group_row
    first_empty = None
    for r in range(group_row + 1, ws.max_row + 1):
        b_val = ws.cell(row=r, column=2).value
        # Nếu row có data thì stop
        if b_val and b_val not in ('', None):
            break
        # Nếu row trống và có thể ghi
        if first_empty is None:
            first_empty = r
        # Nếu gặp section/group khác thì dừng
        c_val = ws.cell(row=r, column=3).value
        if c_val and c_val not in ('', None) and r > group_row + 1:
            break
    if first_empty is None:
        first_empty = group_row + 1
    return section_row, group_row, first_empty

def get_template_path(specified_path, project_code):
    if specified_path:
        return specified_path
    base_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(os.path.dirname(base_dir), 'assets')
    project_specific = os.path.join(assets_dir, f'{project_code}-Template.xlsx')
    if os.path.exists(project_specific):
        return project_specific
    return os.path.join(assets_dir, 'Template.xlsx')

# ---------- main ----------
def main():
    if len(sys.argv) < 3:
        print("Cách dùng: gen-testcases.py <input.json> <output.xlsx> [template.xlsx]")
        sys.exit(1)
    inp_path, out_path = sys.argv[1], sys.argv[2]
    # Đọc JSON input trước để lấy project code (cho template auto-detect)
    with open(inp_path, encoding='utf-8') as f:
        data = json.load(f)
    project_code_from_json = data.get('project', {}).get('code', '')
    # Auto-detect template: ưu tiên CLI arg, sau đó project_code từ JSON, cuối cùng fallback Template.xlsx
    cli_template = sys.argv[3] if len(sys.argv) > 3 else None
    if cli_template:
        tmpl = cli_template
    elif project_code_from_json:
        # Tìm template riêng cho project code này
        base_dir = os.path.dirname(os.path.abspath(__file__))
        assets_dir = os.path.join(os.path.dirname(base_dir), 'assets')
        project_specific = os.path.join(assets_dir, f'{project_code_from_json}-Template.xlsx')
        if os.path.exists(project_specific):
            tmpl = project_specific
        else:
            tmpl = os.path.join(assets_dir, 'Template.xlsx')
    else:
        # Không có project code → dùng Template.xlsx mặc định (Nina Studio)
        base_dir = os.path.dirname(os.path.abspath(__file__))
        assets_dir = os.path.join(os.path.dirname(base_dir), 'assets')
        tmpl = os.path.join(assets_dir, 'Template.xlsx')

    # 1. Copy template → output
    shutil.copyfile(tmpl, out_path)
    wb = openpyxl.load_workbook(out_path)
    ws = wb["Test cases_App"]
    cover = wb["Cover"]

    # 2. Capture styles
    sty_section = capture_style(ws, 'C10')
    sty_section2 = capture_style(ws, 'C20')
    sty_group = capture_style(ws, 'C11')
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

    # 3. Clear existing data rows (10..max) - GIỮ section/group headers
    section_titles = ['1.1. USER INTERFACE', '1.2. FUNCTION', '1.3. PERFORMANCE']
    group_names = ['REGISTER', 'LOGIN', 'HOME', 'BOOKING', 'PROFILE', 'SETTING', 'NOTIFICATION', 'DASHBOARD']
    max_r = ws.max_row
    for r in range(10, max_r + 1):
        c_val = ws.cell(row=r, column=3).value
        b_val = ws.cell(row=r, column=2).value
        # Giữ section header và group header
        if c_val in section_titles or c_val in group_names:
            continue
        # Clear data
        for c in range(1, 32):
            try:
                cell = ws.cell(row=r, column=c)
                if cell.value not in (None, ''):
                    cell.value = None
            except AttributeError:
                pass

    # Xoá data validation cũ
    ws.data_validations.dataValidation = []

    # 4. Update Cover metadata
    p = data.get('project', {})
    project_code = p.get('code', '')
    if not project_code:
        print("  ⚠️  CẢNH BÁO: project.code chưa có trong JSON. Test case ID sẽ trống prefix (vd '[NN]' thay vì '[BCP-NN]').")
    safe_set(cover, 'B3', p.get('name', ''))
    safe_set(cover, 'C3', project_code)
    safe_set(cover, 'D3', p.get('device', ''))
    safe_set(cover, 'E3', p.get('priority', 'Medium'))
    safe_set(cover, 'B5', p.get('description', ''))
    safe_set(cover, 'D5', p.get('version', ''))
    d = parse_date(p.get('test_date'))
    if d: safe_set(cover, 'E5', d)
    safe_set(cover, 'B7', p.get('objective', ''))
    safe_set(cover, 'D7', p.get('author', ''))
    safe_set(cover, 'E7', p.get('reviewer', ''))

    # 5. Write test cases vào đúng vị trí group trong template
    sections_in = data.get('sections', [])
    stt_counter = 0
    all_data_ranges = []

    for sec in sections_in:
        sec_title = sec.get('title', '')
        is_ui = sec.get('kind', '').lower() == 'ui'
        for grp in sec.get('groups', []):
            grp_name = grp.get('name', '')
            # Tìm vị trí group trong template
            pos = find_group_position(ws, sec_title, grp_name)
            if pos is None:
                print(f"  ⚠️  Không tìm thấy vị trí cho section='{sec_title}', group='{grp_name}'. Bỏ qua.")
                continue
            section_row, group_row, current_row = pos
            # Ghi từng scenario
            for sc in grp.get('scenarios', []):
                sid = sc.get('scenario_id', '')
                # Scenario name (shared cho tất cả case trong scenario này)
                sc_name = sc.get('scenario_name') or sc.get('name') or grp_name
                cases = sorted(sc.get('cases', []), key=lambda c: type_rank(c.get('type')))
                for case in cases:
                    stt_counter += 1
                    all_data_ranges.append(current_row)
                    ctype = case.get('type', 'happy')
                    # Description: KHÔNG prefix [STT N][TYPE] - ghi dạng manual "Xác minh rằng..."
                    desc = case.get('description', '')
                    req = case.get('req') or sc.get('requirement', '')
                    note = f"Ref: {req}" if req else ("Ref: (out-of-spec)" if ctype == 'additional' else "")
                    vals = {
                        2: sid,                      # B: Scenario ID
                        3: sc_name,                  # C: Scenario Name (tên nhóm chức năng - shared)
                        5: desc,                     # E: Description (manual "Xác minh rằng...")
                        6: case.get('pre_condition', ''),  # F: Pre-condition
                        7: case.get('procedure', ''),      # G: Procedure
                        8: case.get('expected', ''),       # H: Expected Results
                        # Cột I (Results), J (Priority), K (Date), L (Tester), M (Notes) - KHÔNG fill, để tester điền sau
                    }
                    for col, v in vals.items():
                        cell = ws.cell(row=current_row, column=col, value=v)
                        letter = get_column_letter(col)
                        wrap = col in (5, 6, 7, 8)
                        apply_style(cell, sty.get(letter) or sty['E'], wrap_text=wrap)
                    # Cột D = hardcoded Test case ID (BCP-NN hoặc BCP-UI-NN) thay vì formula
                    d_id = f"[{project_code}{'-UI' if is_ui else ''}-{stt_counter:02d}]"
                    dcell = ws.cell(row=current_row, column=4, value=d_id)
                    apply_style(dcell, sty['D'])
                    # I (Results), J (Priority), K (Date), L (Tester), M (Notes) - để trống cho tester
                    # CHỈ apply style (không fill value) để giữ format
                    for empty_col in [9, 10, 11, 12, 13]:
                        empty_cell = ws.cell(row=current_row, column=empty_col)
                        apply_style(empty_cell, sty.get(get_column_letter(empty_col)) or sty['E'])
                    # Set row height = 51pt
                    ws.row_dimensions[current_row].height = 51.0
                    current_row += 1

    # 6. Add data validation cho tất cả data rows
    if all_data_ranges:
        rmin, rmax = min(all_data_ranges), max(all_data_ranges)
        dv_i = DataValidation(type='list', formula1='"Pass,Fail,N/A,Untested"', allow_blank=True)
        dv_i.add(f'I{rmin}:I{rmax}')
        ws.add_data_validation(dv_i)
        dv_j = DataValidation(type='list', formula1='"Critical,High,Medium,Low,N/A"', allow_blank=True)
        dv_j.add(f'J{rmin}:J{rmax}')
        ws.add_data_validation(dv_j)

    # 7. Save
    wb.save(out_path)
    print(f"✅ Generated {out_path}")
    print(f"   Template: {os.path.basename(tmpl)}")
    print(f"   {len(all_data_ranges)} test cases across {len(sections_in)} sections.")
    print(f"   STT from 1 to {stt_counter} (continuous)")
    print(f"   Cover metadata updated (code={project_code}).")

if __name__ == '__main__':
    main()