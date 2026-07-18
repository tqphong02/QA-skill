#!/usr/bin/env python3
"""
gen-testcases.py — Generate test cases into a COPY of the team template,
GIỮ NGUYÊN format (formulas, dropdowns, styles, Report auto-aggregate).

Cách dùng:
  python3 gen-testcases.py input.json output.xlsx

Output:
  output.md được tạo trước output.xlsx để AI đọc testcase không cần parse Excel

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
import sys, json, shutil, datetime, os, re
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
ICON_RE = re.compile(r'[\U0001F300-\U0001FAFF\u2600-\u27BF]')
PLACEHOLDER_RE = re.compile(r'<[^<>]+>')
ALLOWED_HTTP_METHODS = {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'}
SENSITIVE_HEADER_NAMES = {
    'authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'api-key'
}
SENSITIVE_PAYLOAD_KEYS = {
    'password', 'token', 'access_token', 'refresh_token', 'api_key', 'apikey',
    'client_secret', 'secret'
}


def human_text(value, field='content'):
    """Normalize testcase prose while preserving internal punctuation and numbers."""
    if value is None:
        return ''
    text = str(value).strip()
    if ICON_RE.search(text):
        raise ValueError(f'{field} must not contain emoji or icons')
    return '\n'.join(line.rstrip().rstrip('.').rstrip() for line in text.splitlines())


def compact_json(value):
    """Render machine-readable API input without changing keys or values."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ': '))


def validate_api_headers(headers):
    """Prevent real credentials from being written into testcase documents."""
    if not isinstance(headers, dict):
        raise ValueError('api.headers must be an object')
    for name, value in headers.items():
        if str(name).lower() not in SENSITIVE_HEADER_NAMES:
            continue
        rendered = compact_json(value) if isinstance(value, (dict, list)) else str(value)
        if rendered and not PLACEHOLDER_RE.search(rendered):
            raise ValueError(
                f'api.headers.{name} must use a placeholder such as <valid_token>'
            )


def validate_api_secrets(value, path):
    """Require placeholders for secret-looking values in structured API payloads."""
    if isinstance(value, dict):
        for key, item in value.items():
            child_path = f'{path}.{key}'
            if str(key).lower() in SENSITIVE_PAYLOAD_KEYS and item not in (None, ''):
                rendered = compact_json(item) if isinstance(item, (dict, list)) else str(item)
                if not PLACEHOLDER_RE.search(rendered):
                    raise ValueError(
                        f'{child_path} must use a placeholder such as <valid_password>'
                    )
            validate_api_secrets(item, child_path)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            validate_api_secrets(item, f'{path}[{index}]')


def render_api_case(case):
    """Map an optional structured API case into the existing F, G and H columns."""
    api = case.get('api')
    if api is None:
        return (
            human_text(case.get('pre_condition', ''), 'pre_condition'),
            human_text(case.get('procedure', ''), 'procedure'),
            human_text(case.get('expected', ''), 'expected'),
        )
    if not isinstance(api, dict):
        raise ValueError('case.api must be an object')

    method = str(api.get('method', '')).strip().upper()
    endpoint = str(api.get('endpoint', '')).strip()
    expected_status = api.get('expected_status')
    if method not in ALLOWED_HTTP_METHODS:
        raise ValueError(f'api.method must be one of {sorted(ALLOWED_HTTP_METHODS)}')
    if not endpoint:
        raise ValueError('api.endpoint is required')
    if type(expected_status) is not int or not 100 <= expected_status <= 599:
        raise ValueError('api.expected_status must be an integer from 100 to 599')

    headers = api.get('headers') or {}
    validate_api_headers(headers)
    for field in ('query', 'body', 'expected_body'):
        if field in api:
            validate_api_secrets(api[field], f'api.{field}')

    steps = [f'Chuẩn bị request {method} {endpoint}']
    if headers:
        steps.append(f'Headers: {compact_json(headers)}')
    if api.get('query'):
        steps.append(f'Query parameters: {compact_json(api["query"])}')
    if 'body' in api:
        steps.append(f'Request body: {compact_json(api["body"])}')
    for extra_step in api.get('additional_steps') or []:
        steps.append(str(extra_step))
    steps.append('Gửi request và ghi nhận status, headers và response body')

    expected = [f'HTTP status = {expected_status}']
    if api.get('expected_headers'):
        expected.append(f'Response headers khớp: {compact_json(api["expected_headers"])}')
    if api.get('expected_schema'):
        schema = api['expected_schema']
        if isinstance(schema, list):
            expected.append(f'Response body có đủ field: {", ".join(map(str, schema))}')
        else:
            expected.append(f'Response schema khớp: {compact_json(schema)}')
    if 'expected_body' in api:
        expected.append(f'Response body khớp: {compact_json(api["expected_body"])}')
    if api.get('side_effect'):
        expected.append(str(api['side_effect']))
    for extra_expected in api.get('additional_expected') or []:
        expected.append(str(extra_expected))

    numbered_steps = '\n'.join(f'{index}. {value}' for index, value in enumerate(steps, 1))
    numbered_expected = '\n'.join(f'{index}. {value}' for index, value in enumerate(expected, 1))
    return (
        human_text(case.get('pre_condition', ''), 'pre_condition'),
        human_text(numbered_steps, 'procedure'),
        human_text(numbered_expected, 'expected'),
    )


def append_markdown_block(lines, label, value):
    lines.append(f'- **{label}:**')
    content = human_text(value, label.lower())
    if not content:
        lines.append('  N/A')
        return
    for line in content.splitlines():
        lines.append(f'  {line}')


def write_testcase_markdown(data, output_path):
    """Write the complete AI-readable testcase design before Excel generation."""
    project = data.get('project') or {}
    project_code = str(project.get('code') or '')
    project_name = human_text(project.get('name') or project_code or 'Project', 'project.name')
    lines = [f'# Testcases — {project_name}', '', '## Project metadata', '']
    metadata = (
        ('Project code', project_code),
        ('Device', project.get('device')),
        ('Version', project.get('version')),
        ('Test date', project.get('test_date')),
        ('Author', project.get('author')),
        ('Reviewer', project.get('reviewer')),
        ('Source document', data.get('source_document')),
        ('Objective', project.get('objective')),
    )
    for label, value in metadata:
        lines.append(f'- **{label}:** {human_text(value, label.lower()) or "N/A"}')

    lines.extend(['', '## Requirements', ''])
    requirements = data.get('requirements') or []
    if requirements:
        for requirement in requirements:
            req_id = str(requirement.get('id') or 'UNRESOLVED')
            req_text = human_text(requirement.get('text') or '', f'requirement {req_id}')
            lines.append(f'- `{req_id}`: {req_text or "Cần làm rõ"}')
    else:
        lines.append('- Chưa có requirement được xác nhận')

    stt_counter = 0
    for section in data.get('sections') or []:
        section_title = human_text(section.get('title') or '', 'section title')
        lines.extend(['', f'## {section_title}', ''])
        groups = section.get('groups') or []
        if not groups:
            lines.append('- Không có testcase trong section này')
            continue
        for group in groups:
            group_name_value = human_text(group.get('name') or 'GROUP', 'group name')
            lines.extend([f'### {group_name_value}', ''])
            scenarios = group.get('scenarios') or []
            if not scenarios:
                lines.append('- Không có testcase trong group này')
                lines.append('')
                continue
            for scenario in scenarios:
                scenario_id = str(scenario.get('scenario_id') or '')
                scenario_name = human_text(
                    scenario.get('scenario_name') or scenario.get('name') or group_name_value,
                    'scenario_name',
                )
                lines.extend([f'#### `{scenario_id}` — {scenario_name}', ''])
                cases = sorted(scenario.get('cases') or [], key=lambda case: type_rank(case.get('type')))
                for case in cases:
                    stt_counter += 1
                    is_ui = str(section.get('kind') or '').lower() == 'ui'
                    test_id = f"[{project_code}{'-UI' if is_ui else ''}-{stt_counter:02d}]"
                    description = human_text(case.get('description') or '', 'description')
                    requirement = case.get('req') or scenario.get('requirement') or (
                        '(out-of-spec)' if case.get('type') == 'additional' else 'UNRESOLVED'
                    )
                    pre_condition, procedure, expected = render_api_case(case)
                    lines.extend([f'##### `{test_id}` — {description}', ''])
                    lines.append(f'- **Type:** {type_label(case.get("type"))}')
                    lines.append(f'- **Requirement:** `{requirement}`')
                    lines.append(f'- **Priority:** {human_text(case.get("priority") or "N/A", "priority")}')
                    append_markdown_block(lines, 'Pre-condition', pre_condition)
                    append_markdown_block(lines, 'Procedure', procedure)
                    append_markdown_block(lines, 'Expected Results', expected)
                    lines.append('')

    with open(output_path, 'w', encoding='utf-8') as markdown_file:
        markdown_file.write('\n'.join(lines).rstrip() + '\n')
    return stt_counter

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


def ensure_group_capacity(ws, section_title, group_name, required_rows, group_style):
    """Create an arbitrary group and reserve enough rows without changing existing groups."""
    if required_rows <= 0:
        return
    section_row = None
    next_section_row = None
    group_row = None
    for r in range(1, ws.max_row + 1):
        value = ws.cell(row=r, column=3).value
        if value == section_title:
            section_row = r
            continue
        if section_row is None:
            continue
        if value == group_name:
            group_row = r
            break
        if value and str(value).startswith(('1.1.', '1.2.', '1.3.')):
            next_section_row = r
            break
    if section_row is None:
        raise ValueError(f'Section not found in template: {section_title}')

    if group_row is None:
        insert_at = next_section_row or (ws.max_row + 1)
        ws.insert_rows(insert_at, amount=required_rows + 1)
        group_row = insert_at
        group_cell = ws.cell(row=group_row, column=3, value=group_name)
        apply_style(group_cell, group_style)
        return

    boundary = ws.max_row + 1
    for r in range(group_row + 1, ws.max_row + 1):
        value = ws.cell(row=r, column=3).value
        if value not in (None, ''):
            boundary = r
            break
    available_rows = boundary - group_row - 1
    if available_rows < required_rows:
        ws.insert_rows(boundary, amount=required_rows - available_rows)

def get_template_path(specified_path=None, project_code=None):
    """Lấy template path. Ưu tiên:
    1. CLI argument (specified_path)
    2. Default template (Template.xlsx) - dùng chung cho mọi project

    Lưu ý: Skill này dùng 1 template duy nhất cho mọi project. Mọi thông tin
    project-specific (name, code, modules) đều configurable từ JSON input.
    Member khi clone code về chạy được ngay với project bất kỳ.
    """
    if specified_path:
        return specified_path
    base_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(os.path.dirname(base_dir), 'assets')
    return os.path.join(assets_dir, 'Template.xlsx')


# ---------- main ----------
def main():
    if len(sys.argv) < 3:
        print("Cách dùng: gen-testcases.py <input.json> <output.xlsx> [template.xlsx]")
        sys.exit(1)
    inp_path, out_path = sys.argv[1], sys.argv[2]
    # Ưu tiên CLI arg, nếu không có thì dùng Template.xlsx (template chung cho mọi project)
    cli_template = sys.argv[3] if len(sys.argv) > 3 else None
    tmpl = get_template_path(specified_path=cli_template)
    with open(inp_path, encoding='utf-8') as f:
        data = json.load(f)

    # 0. Generate the AI-readable testcase document before touching Excel
    md_path = os.path.splitext(out_path)[0] + '.md'
    markdown_case_count = write_testcase_markdown(data, md_path)
    print(f"  Generated Markdown first: {md_path} ({markdown_case_count} test cases)")

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

    # 3. Clear existing data rows (10..max) - GIỮ section headers + group headers
    # mà JSON input thực sự khai báo. Template gốc (assets/Template.xlsx) chứa
    # nhiều group mẫu (HOME, BOOKING, PROFILE, ...) để AI biết cấu trúc; nếu
    # project hiện tại không có group đó thì row phải được clear.
    section_titles = ['1.1. USER INTERFACE', '1.2. FUNCTION', '1.3. PERFORMANCE']
    # Whitelist group names từ JSON input sections -> groups (KHÔNG hardcode nữa).
    sections_input = data.get('sections', []) or []
    declared_groups = set()
    for sec in sections_input:
        for grp in sec.get('groups', []) or []:
            gn = grp.get('name')
            if gn:
                declared_groups.add(gn)
    max_r = ws.max_row
    for r in range(10, max_r + 1):
        c_val = ws.cell(row=r, column=3).value
        # Giữ section headers (always) + group headers thuộc whitelist
        if c_val in section_titles or (c_val in declared_groups):
            continue
        # Clear data row (group mẫu không dùng, hoặc sample case row)
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
    safe_set(cover, 'B3', human_text(p.get('name', ''), 'project.name'))
    safe_set(cover, 'C3', project_code)
    safe_set(cover, 'D3', human_text(p.get('device', ''), 'project.device'))
    safe_set(cover, 'E3', p.get('priority', 'Medium'))
    safe_set(cover, 'B5', human_text(p.get('description', ''), 'project.description'))
    safe_set(cover, 'D5', p.get('version', ''))
    d = parse_date(p.get('test_date'))
    if d: safe_set(cover, 'E5', d)
    safe_set(cover, 'B7', human_text(p.get('objective', ''), 'project.objective'))
    safe_set(cover, 'D7', human_text(p.get('author', ''), 'project.author'))
    safe_set(cover, 'E7', human_text(p.get('reviewer', ''), 'project.reviewer'))

    # 5. Write test cases vào đúng vị trí group trong template
    sections_in = data.get('sections', [])
    stt_counter = 0
    all_data_ranges = []
    api_case_ids = set()

    for sec in sections_in:
        sec_title = sec.get('title', '')
        section_kind = sec.get('kind', '').lower()
        is_ui = section_kind == 'ui'
        has_api_cases = any(
            case.get('api') is not None
            for grp in sec.get('groups', [])
            for sc in grp.get('scenarios', [])
            for case in sc.get('cases', [])
        )
        if has_api_cases and (section_kind != 'api' or sec_title != '1.2. FUNCTION'):
            raise ValueError(
                'Structured API cases require kind="api" under title="1.2. FUNCTION"'
            )
        for grp in sec.get('groups', []):
            grp_name = grp.get('name', '')
            required_rows = sum(
                len(sc.get('cases', []))
                for sc in grp.get('scenarios', [])
            )
            ensure_group_capacity(ws, sec_title, grp_name, required_rows, sty_group)
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
                sc_name = human_text(sc.get('scenario_name') or sc.get('name') or grp_name, 'scenario_name')
                cases = sorted(sc.get('cases', []), key=lambda c: type_rank(c.get('type')))
                for case in cases:
                    stt_counter += 1
                    all_data_ranges.append(current_row)
                    ctype = case.get('type', 'happy')
                    # Description: KHÔNG prefix [STT N][TYPE] - ghi dạng manual "Xác minh rằng..."
                    desc = human_text(case.get('description', ''), 'description')
                    pre_condition, procedure, expected_result = render_api_case(case)
                    req = case.get('req') or sc.get('requirement', '')
                    note = f"Ref: {req}" if req else ("Ref: (out-of-spec)" if ctype == 'additional' else "")
                    vals = {
                        2: sid,                      # B: Scenario ID
                        3: sc_name,                  # C: Scenario Name (tên nhóm chức năng - shared)
                        5: desc,                     # E: Description (manual "Xác minh rằng...")
                        6: pre_condition,             # F: Pre-condition
                        7: procedure,                 # G: Procedure
                        8: expected_result,           # H: Expected Results
                        # Cột I (Results), J (Priority), K (Date), L (Tester), M (Notes) - KHÔNG fill, để tester điền sau
                    }
                    for col, v in vals.items():
                        cell = ws.cell(row=current_row, column=col, value=v)
                        letter = get_column_letter(col)
                        wrap = col in (5, 6, 7, 8)
                        apply_style(cell, sty.get(letter) or sty['E'], wrap_text=wrap)
                    # Cột D = hardcoded Test case ID (BCP-NN hoặc BCP-UI-NN) thay vì formula
                    d_id = f"[{project_code}{'-UI' if is_ui else ''}-{stt_counter:02d}]"
                    if case.get('api') is not None:
                        api_case_ids.add(d_id)
                    dcell = ws.cell(row=current_row, column=4, value=d_id)
                    apply_style(dcell, sty['D'])
                    # I (Results), J (Priority), K (Date), L (Tester), M (Notes) - để trống cho tester
                    # CHỈ apply style (không fill value) để giữ format
                    for empty_col in [9, 10, 11, 12, 13]:
                        empty_cell = ws.cell(row=current_row, column=empty_col)
                        apply_style(empty_cell, sty.get(get_column_letter(empty_col)) or sty['E'])
                    # Base height; normalize again after sample-row deletion shifts indexes
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

    # 7. Xoá HẲN các row mẫu còn sót (group headers KHÔNG có trong JSON + sample
    # case rows) thay vì chỉ clear value. Sau bước này, file đầu ra sẽ KHÔNG
    # còn dòng rác (trống nhưng vẫn giữ fill color + row height).
    # Tìm các row từ 10..max mà TẤT CẢ các cột B/C/D/E/F/G/H đều trống.
    # Chỉ giữ section rows. Duyệt từ dưới lên để delete_rows không shift index.
    rows_to_delete = []
    for r in range(10, ws.max_row + 1):
        c_val = ws.cell(row=r, column=3).value
        if c_val in section_titles:
            continue  # section header — luôn giữ
        # Check empty
        is_empty = all(
            (ws.cell(row=r, column=c).value in (None, ''))
            for c in range(2, 9)  # B..H
        )
        if is_empty:
            rows_to_delete.append(r)
    # Delete từ cuối lên đầu để index không bị shift sai
    for r in reversed(rows_to_delete):
        ws.delete_rows(r, 1)

    if rows_to_delete:
        print(f"  Đã xóa {len(rows_to_delete)} dòng mẫu (group header + sample rows không dùng)")

    # Expand only API rows after deletion; normal testcase row dimensions stay untouched
    for r in range(10, ws.max_row + 1):
        if ws.cell(row=r, column=2).value in (None, ''):
            continue
        if ws.cell(row=r, column=4).value in api_case_ids:
            line_count = max(
                str(ws.cell(row=r, column=c).value or '').count('\n') + 1
                for c in range(5, 9)
            )
            ws.row_dimensions[r].height = min(180.0, max(51.0, line_count * 15.0))

    # 8. Save
    wb.save(out_path)
    print(f"✅ Generated {out_path}")
    print(f"   Template: {os.path.basename(tmpl)}")
    print(f"   {len(all_data_ranges)} test cases across {len(sections_in)} sections.")
    print(f"   STT from 1 to {stt_counter} (continuous)")
    print(f"   Cover metadata updated (code={project_code}).")

if __name__ == '__main__':
    main()
