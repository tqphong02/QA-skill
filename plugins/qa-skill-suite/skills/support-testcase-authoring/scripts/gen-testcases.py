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
  - Section UI có anchor_row cho công thức test case ID BCP-UI-NN
  - Section Functional có anchor_row cho công thức test case ID BCP-NN
  - STT dòng liên tục trong toàn bộ file; Testcase ID explicit được giữ ổn định và có thể có khoảng trống
"""
import sys, json, shutil, datetime, os, re, hashlib
from copy import copy, deepcopy
import openpyxl
from openpyxl.styles import Alignment, PatternFill, Font
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule


def configure_cli_streams():
    """Emit deterministic UTF-8 logs when Windows inherits a legacy code page."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, 'reconfigure', None)
        if not callable(reconfigure):
            continue
        try:
            reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, OSError, ValueError):
            # Redirected or host-owned streams may not support reconfiguration.
            pass


# Canonical black-box display/execution order — cases are sorted in this order
# within each scenario. Alternative is optional; when absent the visible order
# starts with Happy Path, Validation, then Edge Case.
TYPE_ORDER = ['happy', 'alternative', 'validation', 'edge', 'negative', 'error', 'ui', 'additional']
BB_TECHNIQUES = {
    'EP', 'BVA', 'Decision Table', 'State Transition', 'Use Case Testing',
    'Error Guessing', 'Pairwise',
    'Domain Testing', 'Combinatorial Testing', 'Random Testing',
    'CRUD Testing', 'Scenario-Based Testing', 'Metamorphic Testing',
    'Session-Based Testing', 'Checklist-Based Testing', 'Crowd Testing'
}
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
DATE_SUFFIX_RE = re.compile(r'_\d{2}-\d{2}-\d{4}$')
PLACEHOLDER_RE = re.compile(r'<[^<>]+>')
ALLOWED_HTTP_METHODS = {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'}
MANUAL_VERIFICATION_STATUSES = {'PASS', 'FAILED', 'BLOCKED', 'WAIVED'}
API_SIDE_EFFECT_TYPES = {
    'READ_AFTER_WRITE', 'DATABASE_STATE', 'EVENT_PUBLISHED', 'WEBHOOK_SENT',
    'TRANSACTION_ROLLBACK', 'NO_UNEXPECTED_MUTATION'
}
SENSITIVE_HEADER_NAMES = {
    'authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'api-key'
}
SENSITIVE_PAYLOAD_KEYS = {
    'password', 'token', 'access_token', 'refresh_token', 'api_key', 'apikey',
    'client_secret', 'secret'
}
EXECUTION_ACTIONS = {
    'navigate', 'fill', 'clear', 'select', 'check', 'uncheck', 'click',
    'press', 'upload', 'download', 'dialog_accept', 'dialog_dismiss', 'popup',
    'wait', 'observe', 'assert'
}
EXECUTION_SELECTOR_STATUSES = {'unresolved', 'runtime_verified', 'not_applicable'}
TESTCASE_ID_RE = re.compile(r'^[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+$')
SCENARIO_ID_RE = re.compile(r'^SCN[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$')
COVERAGE_ITEM_ID_RE = re.compile(r'^COV[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$')
MACHINE_DATA_REF_RE = re.compile(
    r'\bAIFA_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*(?:@[A-Za-z0-9.-]+)?(?:\.[A-Za-z0-9]+)?\b'
)
SAMPLE_VALUE_RE = re.compile(
    r'(?:qa\.[A-Za-z0-9._%+-]+@example\.test|invalid-email|'
    r'AifaSample@2026!|WrongSample@2026!|AIFA Sample [A-Za-z0-9 ]+|'
    r'Golden Path question \d+ sample)'
)
RBAC_EXPECTATIONS = {'ALLOW', 'DENY', 'N/A', 'UNRESOLVED'}
RBAC_VERIFICATION_STATUSES = {
    'REQUIREMENT_ONLY', 'STATIC_CONFIRMED', 'RUNTIME_CONFIRMED',
    'REQ_CODE_CONFLICT', 'RUNTIME_CONFLICT', 'RUNTIME_BYPASS', 'UNVERIFIED'
}
RBAC_EXPECTATION_LABELS = {
    'ALLOW': 'CHO PHÉP',
    'DENY': 'TỪ CHỐI',
    'N/A': 'N/A',
    'UNRESOLVED': 'CHƯA RÕ',
}
RBAC_VERIFICATION_LABELS = {
    'REQUIREMENT_ONLY': 'Chỉ có yêu cầu, chưa đối chiếu source/runtime',
    'STATIC_CONFIRMED': 'Yêu cầu và source khớp, chưa xác minh runtime',
    'RUNTIME_CONFIRMED': 'Đã xác nhận bằng runtime',
    'REQ_CODE_CONFLICT': 'Yêu cầu và source mâu thuẫn',
    'RUNTIME_CONFLICT': 'Runtime mâu thuẫn với yêu cầu hoặc source',
    'RUNTIME_BYPASS': 'Runtime cho phép thao tác bị cấm',
    'UNVERIFIED': 'Chưa đủ nguồn để xác minh',
}
EXECUTION_ENTRY_FIELDS = (
    'environment', 'screen', 'route', 'role', 'state', 'permissions', 'data'
)
EXECUTION_VALUE_ACTIONS = {'fill', 'select', 'press', 'upload'}


def _automation_tags(case):
    tags = case.get('automation_tags') or []
    if not isinstance(tags, list):
        raise ValueError('case.automation_tags must be an array')
    normalized = [str(tag).strip() for tag in tags]
    if any(not re.fullmatch(r'@[a-z][a-z0-9-]*', tag) for tag in normalized):
        raise ValueError('case.automation_tags must use @lowercase-kebab-case')
    if len(set(normalized)) != len(normalized):
        raise ValueError('case.automation_tags must be unique')
    if any(tag in {'@ui', '@api', '@functional'} for tag in normalized):
        raise ValueError('case.automation_tags cannot repeat generated surface tags')
    return normalized


def _deep_merge(base, override):
    """Merge template objects deterministically; arrays are replaced, not concatenated."""
    if isinstance(base, dict) and isinstance(override, dict):
        merged = deepcopy(base)
        for key, value in override.items():
            merged[key] = _deep_merge(merged.get(key), value) if key in merged else deepcopy(value)
        return merged
    return deepcopy(override)


def materialize_execution_templates(data):
    """Expand compact execution_ref cases before Markdown/manifest/Excel generation."""
    normalized = deepcopy(data)
    templates = normalized.get('execution_templates') or {}
    if not isinstance(templates, dict):
        raise ValueError('execution_templates must be an object keyed by template name')

    for section in normalized.get('sections') or []:
        for group in section.get('groups') or []:
            for scenario in group.get('scenarios') or []:
                for case in scenario.get('cases') or []:
                    execution_ref = str(case.get('execution_ref') or '').strip()
                    overrides = case.get('execution_overrides') or {}
                    if execution_ref and case.get('execution') is not None:
                        raise ValueError(
                            f'case {case.get("testcase_id") or "<unknown>"} cannot combine execution and execution_ref'
                        )
                    if not execution_ref:
                        if case.get('execution_overrides') is not None:
                            raise ValueError('execution_overrides requires execution_ref')
                        continue
                    if execution_ref not in templates:
                        raise ValueError(f'Unknown execution_ref: {execution_ref}')
                    if not isinstance(templates[execution_ref], dict):
                        raise ValueError(f'execution_templates.{execution_ref} must be an object')
                    if not isinstance(overrides, dict):
                        raise ValueError('execution_overrides must be an object')
                    case['execution'] = _deep_merge(templates[execution_ref], overrides)
    return normalized
MANUAL_ACTION_PATTERNS = {
    'navigate': re.compile(r'\b(mở|truy cập|đi đến|đi tới|navigate|open)\b', re.IGNORECASE),
    'fill': re.compile(r'\b(nhập|điền|type|fill)\b', re.IGNORECASE),
    'clear': re.compile(r'\b(xóa|xoá|làm trống|để trống|clear)\b', re.IGNORECASE),
    'select': re.compile(r'\b(chọn|select)\b', re.IGNORECASE),
    'check': re.compile(r'\b(đánh dấu|tick|check)\b', re.IGNORECASE),
    'uncheck': re.compile(r'\b(bỏ chọn|bỏ đánh dấu|uncheck)\b', re.IGNORECASE),
    'click': re.compile(r'\b(nhấp|bấm|click|nhấn(?=\s+(?:vào\s+)?(?:nút|ô|liên kết)))\b', re.IGNORECASE),
    'press': re.compile(r'\b(nhấn phím|press)\b', re.IGNORECASE),
    'upload': re.compile(r'\b(tải lên|upload)\b', re.IGNORECASE),
    'download': re.compile(r'\b(tải xuống|download)\b', re.IGNORECASE),
    'dialog_accept': re.compile(r'\b(chấp nhận|accept)\b.*\b(hộp thoại|dialog)\b', re.IGNORECASE),
    'dialog_dismiss': re.compile(r'\b(hủy|đóng|dismiss)\b.*\b(hộp thoại|dialog)\b', re.IGNORECASE),
    'popup': re.compile(r'\b(cửa sổ mới|popup)\b', re.IGNORECASE),
    'wait': re.compile(r'\b(chờ|đợi|wait)\b', re.IGNORECASE),
    'observe': re.compile(r'\b(quan sát|kiểm tra|xác nhận|observe)\b', re.IGNORECASE),
    'assert': re.compile(r'\b(kiểm tra|xác nhận|assert)\b', re.IGNORECASE),
}
MANUAL_TECHNICAL_RE = re.compile(
    r'(?:\b(?:GET|POST|PUT|PATCH|DELETE)\s+/|\bHTTP\s+\d{3}\b|'
    r'\bresponse(?:\.body)?\b|\bassert\b|\bstatus\s*==|'
    r'\bnull\b|\bundefined\b|\bNaN\b)',
    re.IGNORECASE,
)
VAGUE_MANUAL_RESULTS = {
    'hệ thống xử lý đúng',
    'hệ thống hoạt động đúng',
    'kết quả đúng',
    'hoạt động đúng',
    'thành công',
}


def dated_artifact_path(output_path):
    """Append one Asia/Ho_Chi_Minh creation date before the extension."""
    if os.environ.get('QA_PRESERVE_EXACT_FILENAME') == '1':
        return output_path
    root, extension = os.path.splitext(output_path)
    if DATE_SUFFIX_RE.search(root):
        return output_path
    artifact_date = os.environ.get('QA_ARTIFACT_DATE') or datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=7))
    ).strftime('%d-%m-%Y')
    try:
        datetime.datetime.strptime(artifact_date, '%d-%m-%Y')
    except ValueError as exc:
        raise ValueError(
            f'QA_ARTIFACT_DATE must use DD-MM-YYYY, got {artifact_date}'
        ) from exc
    return f'{root}_{artifact_date}{extension}'


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


def _has_manual_value(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def _manual_strings(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from _manual_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _manual_strings(item)
    elif value is not None:
        rendered = str(value).strip()
        if rendered:
            yield rendered


def validate_manual_language(value, field):
    """Reject developer-facing shorthand from manual-visible testcase content."""
    for text in _manual_strings(value):
        if MANUAL_TECHNICAL_RE.search(text):
            raise ValueError(
                f'{field} must use observable Vietnamese manual language, got: {text}'
            )


def _detected_manual_actions(instruction):
    normalized = re.sub(r'\bkhông\s+nhập\b', '', instruction, flags=re.IGNORECASE)
    normalized = re.sub(r'\bđăng\s+nhập\b', '', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\bbỏ\s+chọn\b', 'uncheck', normalized, flags=re.IGNORECASE)
    return {
        action for action, pattern in MANUAL_ACTION_PATTERNS.items()
        if pattern.search(normalized)
    }


def _validate_atomic_instruction(step, index):
    action = step['action']
    instruction = step['instruction']
    manual_value = _manual_value_display(step.get('value'), step.get('target'), action)
    action_text = instruction
    for value_token in _manual_strings(manual_value):
        action_text = action_text.replace(value_token, '')
    # Strip target name so labels like "nút Xóa" or "cửa sổ mới" don't
    # falsely match 'clear' or 'navigate' patterns.
    _tgt = step.get('target')
    if isinstance(_tgt, dict) and _tgt.get('name'):
        action_text = action_text.replace(_tgt['name'], '')
    detected = _detected_manual_actions(action_text)
    if action in {'download', 'dialog_accept', 'dialog_dismiss'}:
        equivalent = {action, 'click', 'observe', 'assert'}
    elif action == 'popup':
        equivalent = {action, 'click', 'navigate', 'observe', 'assert'}
    else:
        equivalent = {'observe', 'assert'} if action in {'observe', 'assert'} else {action}
    if not detected.intersection(equivalent):
        raise ValueError(
            f'execution.steps[{index}].instruction must clearly describe action={action}'
        )
    unrelated = detected - equivalent
    if unrelated:
        raise ValueError(
            f'execution.steps[{index}].instruction combines multiple actions '
            f'({action} with {sorted(unrelated)}); split them into separate steps'
        )

    target = step.get('target')
    if target is not None and action not in {'navigate'}:
        target_name = _replace_manual_data_refs(
            target.get('name') or '',
            target=target,
            action=action,
        )
        if target_name and target_name.casefold() not in instruction.casefold():
            raise ValueError(
                f'execution.steps[{index}].instruction must name the visible target '
                f'"{target_name}"'
            )

    if action in EXECUTION_VALUE_ACTIONS:
        value_tokens = [
            token for token in _manual_strings(manual_value)
            if len(token) >= 2 and (
                target is None
                or token.casefold() != str(target.get('name') or '').strip().casefold()
            )
        ]
        if value_tokens and not any(
            token.casefold() in instruction.casefold() for token in value_tokens
        ):
            raise ValueError(
                f'execution.steps[{index}].instruction must state the exact value '
                f'or test-data reference used by action={action}'
            )


def _manual_label(value):
    labels = {
        'email': 'Email',
        'password': 'Mật khẩu',
        'username': 'Tên đăng nhập',
        'account': 'Tài khoản',
        'file': 'Tệp kiểm thử',
    }
    key = str(value).strip()
    return labels.get(key.casefold(), key.replace('_', ' ').strip().capitalize())


def _is_machine_data_ref(value):
    return isinstance(value, str) and bool(MACHINE_DATA_REF_RE.fullmatch(value.strip()))


def _is_file_reference(value, target_name=''):
    if not isinstance(value, str):
        return False
    if '@' in value:
        return False
    return bool(re.search(r'\.[A-Za-z0-9]{1,8}$', value.strip()))


def _human_data_reference(data_ref, field='', actual_value=None):
    """Return a safe sample value without leaking a machine data key or secret."""
    ref = str(data_ref or '').strip()
    field_text = str(field or '').strip().casefold()
    if actual_value not in (None, '') and not _is_machine_data_ref(str(actual_value)):
        return human_text(actual_value, 'execution data value')

    ref_lower = ref.casefold()
    if 'invalid' in ref_lower or 'sai' in ref_lower:
        if field_text in {'password', 'mật khẩu'} or 'password' in ref_lower:
            return 'WrongSample@2026!'
        if '@' in ref or 'email' in field_text or 'email' in ref_lower:
            return 'invalid-email'
        return 'AIFA Sample Invalid 20260812'
    if '@' in ref or 'email' in field_text or 'email' in ref_lower or 'invite' in ref_lower:
        if 'guest' in ref_lower:
            return 'qa.guest@example.test'
        if 'invite' in ref_lower:
            return 'qa.member@example.test'
        return 'qa.owner@example.test'
    if field_text in {'password', 'mật khẩu'} or 'password' in ref.casefold():
        return 'AifaSample@2026!'
    golden_match = re.search(r'GOLDEN_PROMPT_AI_(\d+)', ref, re.IGNORECASE)
    if golden_match:
        return f'Golden Path question {golden_match.group(1)} sample'
    if 'prompt' in ref.casefold() or 'question' in ref.casefold():
        return 'AIFA Sample Question 20260812'
    if 'member_role' in ref_lower or 'member' in ref_lower:
        return 'AIFA Sample Member 20260812'
    if 'procedure' in ref_lower or 'dsl' in ref_lower:
        return 'AIFA Sample Procedure 20260812'
    if 'doctype' in ref_lower or 'doc_type' in ref_lower:
        return 'AIFA Sample Document Type 20260812'
    if 'field' in ref_lower:
        return 'AIFA Sample Field 20260812'
    if 'run' in ref_lower:
        return 'AIFA Sample Run 20260812'
    if 'chat' in ref_lower:
        return 'AIFA Sample Conversation 20260812'
    if 'sync' in ref_lower:
        return 'AIFA Sample Sync 20260812'
    return 'AIFA Sample Data 20260812'


def _manual_value_display(value, target=None, action=''):
    """Render an input for a manual tester while preserving machine values for automation."""
    target_name = target.get('name') if isinstance(target, dict) else target
    target_name = str(target_name or '').strip()
    if isinstance(value, dict):
        data_ref = value.get('data_ref') or value.get('reference')
        actual_value = value.get('manual') or value.get('display') or value.get('value')
        if data_ref:
            if _is_file_reference(actual_value, target_name) and action in {'upload', 'click'}:
                return human_text(actual_value, 'execution data value')
            return _human_data_reference(data_ref, value.get('field') or target_name, actual_value)
        if actual_value not in (None, ''):
            return _manual_value_display(actual_value, target, action)
        return _render_execution_value(value)
    if value in (None, ''):
        return ''
    if _is_machine_data_ref(value) and not _is_file_reference(value, target_name):
        return _human_data_reference(value, target_name)
    return human_text(value, 'execution data value')


def _replace_manual_data_refs(text, value=None, target=None, action=''):
    """Replace data keys in manual prose; keep exact fixture filenames unchanged."""
    rendered = human_text(text, 'manual instruction')
    replacements = {}
    target_name = target.get('name') if isinstance(target, dict) else target
    target_name = str(target_name or '').strip()
    if isinstance(value, dict):
        data_ref = value.get('data_ref') or value.get('reference')
        if data_ref:
            replacements[str(data_ref)] = _manual_value_display(value, target, action)
    elif _is_machine_data_ref(value) and not _is_file_reference(value, target_name):
        replacements[str(value)] = _manual_value_display(value, target, action)

    for data_ref in MACHINE_DATA_REF_RE.findall(rendered):
        if _is_file_reference(data_ref, target_name):
            continue
        replacements.setdefault(data_ref, _human_data_reference(data_ref, target_name))
    for data_ref, display in replacements.items():
        search_start = 0
        while True:
            index = rendered.find(data_ref, search_start)
            if index < 0:
                break
            contextual_display = _contextual_data_display(
                rendered[:index],
                display,
            )
            rendered = (
                rendered[:index]
                + contextual_display
                + rendered[index + len(data_ref):]
            )
            search_start = index + len(contextual_display)
    rendered = re.sub(
        r'\bgiá trị từ bộ dữ liệu\s+(?=(?:email|mật khẩu|nội dung câu hỏi|giá trị)\b)',
        '',
        rendered,
        flags=re.IGNORECASE,
    )
    rendered = re.sub(
        r'\bbộ dữ liệu\s+(?=(?:email|mật khẩu|nội dung câu hỏi|giá trị)\b)',
        '',
        rendered,
        flags=re.IGNORECASE,
    )
    rendered = re.sub(
        rf'\b(?:giá trị từ\s+)?bộ dữ liệu\s+(?={SAMPLE_VALUE_RE.pattern})',
        '',
        rendered,
        flags=re.IGNORECASE,
    )
    return rendered


def _render_manual_instruction(step):
    return _replace_manual_data_refs(
        step.get('instruction') or '',
        step.get('value'),
        step.get('target'),
        step.get('action') or '',
    )


def _contextual_data_display(prefix, display):
    """Avoid repeating a noun already written immediately before a data key."""
    words = str(display or '').split()
    if not words:
        return display
    context = prefix[-120:].casefold()
    max_words = min(4, len(words))
    for size in range(max_words, 0, -1):
        phrase = ' '.join(words[:size])
        phrase_lower = phrase.casefold()
        phrase_index = context.rfind(phrase_lower)
        if phrase_index >= 0:
            tail = context[phrase_index + len(phrase_lower):].strip()
            if len(tail.split()) > 2:
                continue
            remainder = ' '.join(words[size:])
            return remainder or display
    return display


def _render_manual_data(value):
    """Render structured entry data as readable Vietnamese lines, never raw JSON."""
    lines = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get('name'):
                name = human_text(item.get('name'), 'execution.entry.data.name')
                raw_item_value = item.get('value') or item.get('reference') or ''
                if isinstance(raw_item_value, str):
                    item_value = _replace_manual_data_refs(
                        raw_item_value,
                        target=item.get('name'),
                        action='entry',
                    )
                else:
                    item_value = _manual_value_display(raw_item_value, item.get('name'), 'entry')
                condition = human_text(item.get('condition') or '', 'execution.entry.data.condition')
                text = f'{name}: {item_value}' if item_value else name
                if condition:
                    text += f'; điều kiện: {condition}'
                lines.append(text)
            else:
                lines.extend(_render_manual_data(item))
    elif isinstance(value, dict):
        for key, item in value.items():
            label = _manual_label(key)
            if isinstance(item, (dict, list)):
                nested = _render_manual_data(item)
                lines.extend(f'{label} - {entry}' for entry in nested)
            else:
                lines.append(
                    f'{label}: {_replace_manual_data_refs(item, target=label, action="entry")}'
                )
    elif value not in (None, ''):
        lines.append(_replace_manual_data_refs(value, action='entry'))
    return lines


def _normalized_testcase_id(value, field='testcase_id'):
    rendered = str(value or '').strip()
    if rendered.startswith('[') and rendered.endswith(']'):
        rendered = rendered[1:-1].strip()
    if not rendered or not TESTCASE_ID_RE.fullmatch(rendered):
        raise ValueError(
            f'{field} must use a stable ID such as DEMO-01, DEMO-UI-01 or TC_LOGIN_01'
        )
    return rendered


def _ui_function_keys(case):
    """Keep optional Browser MCP UI-function coverage refs in the lossless manifest."""
    raw = case.get('ui_function_keys', case.get('coverage_refs', []))
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        raise ValueError('case.ui_function_keys must be an array of stable function keys')
    keys = [str(value or '').strip() for value in raw]
    if any(not key for key in keys):
        raise ValueError('case.ui_function_keys cannot contain empty values')
    if len(set(keys)) != len(keys):
        raise ValueError('case.ui_function_keys cannot contain duplicates')
    return keys


def _coverage_item_refs(case):
    """Return stable source-obligation refs without confusing UI inventory refs."""
    raw = case.get('coverage_item_refs', [])
    if raw is None:
        raw = []
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list):
        raise ValueError('case.coverage_item_refs must be an array of stable coverage item IDs')
    refs = [str(value or '').strip() for value in raw]
    if any(not ref for ref in refs):
        raise ValueError('case.coverage_item_refs cannot contain empty values')
    if len(set(refs)) != len(refs):
        raise ValueError('case.coverage_item_refs cannot contain duplicates')
    return refs


def _validate_api_automation_metadata(case):
    """Validate optional governance metadata before preserving it in the manifest."""
    manual = case.get('manual_verification')
    if manual is not None:
        if not isinstance(manual, dict):
            raise ValueError('case.manual_verification must be an object')
        status = str(manual.get('status') or '').strip().upper()
        if status not in MANUAL_VERIFICATION_STATUSES:
            raise ValueError(
                'case.manual_verification.status must be PASS, FAILED, BLOCKED or WAIVED'
            )
        if not str(manual.get('environment') or '').strip():
            raise ValueError('case.manual_verification.environment is required')
        evidence = manual.get('evidence')
        if not isinstance(evidence, list) or any(not str(item or '').strip() for item in evidence):
            raise ValueError('case.manual_verification.evidence must be an array of non-empty refs')
        if status in {'PASS', 'FAILED'}:
            if not evidence:
                raise ValueError(f'case.manual_verification.evidence is required when status={status}')
            verified_at = str(manual.get('verified_at') or '').strip()
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z', verified_at):
                raise ValueError(
                    'case.manual_verification.verified_at must be an ISO-8601 UTC timestamp when status is PASS or FAILED'
                )
        if status == 'WAIVED' and not str(manual.get('waiver_reason') or '').strip():
            raise ValueError('case.manual_verification.waiver_reason is required when status=WAIVED')

    risk = case.get('risk_profile')
    if risk is not None:
        if not isinstance(risk, dict):
            raise ValueError('case.risk_profile must be an object')
        for field in ('criticality', 'money_or_data_impact', 'recovery_sensitivity'):
            value = risk.get(field)
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
                raise ValueError(f'case.risk_profile.{field} must be an integer from 1 to 5')
        for field in ('third_party_dependency', 'async_behavior'):
            if type(risk.get(field)) is not bool:
                raise ValueError(f'case.risk_profile.{field} must be a boolean')
        dependencies = risk.get('dependency_refs')
        if not isinstance(dependencies, list) or any(not str(item or '').strip() for item in dependencies):
            raise ValueError('case.risk_profile.dependency_refs must be an array of non-empty refs')
        if len(set(map(str, dependencies))) != len(dependencies):
            raise ValueError('case.risk_profile.dependency_refs cannot contain duplicates')
        if risk.get('third_party_dependency') and not dependencies:
            raise ValueError(
                'case.risk_profile.dependency_refs is required when third_party_dependency=true'
            )
        if not str(risk.get('rationale') or '').strip():
            raise ValueError('case.risk_profile.rationale is required')

    stability = case.get('stability_gate')
    if stability is not None:
        if not isinstance(stability, dict):
            raise ValueError('case.stability_gate must be an object')
        repeat_count = stability.get('repeat_count')
        required_passes = stability.get('required_consecutive_passes')
        max_flaky_rate = stability.get('max_flaky_rate')
        if isinstance(repeat_count, bool) or not isinstance(repeat_count, int) or not 2 <= repeat_count <= 20:
            raise ValueError('case.stability_gate.repeat_count must be an integer from 2 to 20')
        if (
            isinstance(required_passes, bool)
            or not isinstance(required_passes, int)
            or not 2 <= required_passes <= repeat_count
        ):
            raise ValueError(
                'case.stability_gate.required_consecutive_passes must be from 2 to repeat_count'
            )
        if isinstance(max_flaky_rate, bool) or not isinstance(max_flaky_rate, (int, float)) or not 0 <= max_flaky_rate <= 1:
            raise ValueError('case.stability_gate.max_flaky_rate must be a number from 0 to 1')

    api = case.get('api')
    if isinstance(api, dict):
        effects = api.get('expected_side_effects')
        if effects is not None:
            if not isinstance(effects, list):
                raise ValueError('case.api.expected_side_effects must be an array')
            seen_ids = set()
            for index, effect in enumerate(effects, 1):
                if not isinstance(effect, dict):
                    raise ValueError(f'case.api.expected_side_effects[{index}] must be an object')
                effect_id = str(effect.get('id') or '').strip()
                if not re.fullmatch(r'SE[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*', effect_id):
                    raise ValueError(f'case.api.expected_side_effects[{index}].id must use SE-<ID>')
                if effect_id in seen_ids:
                    raise ValueError(f'Duplicate API side-effect ID: {effect_id}')
                seen_ids.add(effect_id)
                effect_type = str(effect.get('type') or '').strip().upper()
                if effect_type not in API_SIDE_EFFECT_TYPES:
                    raise ValueError(
                        f'case.api.expected_side_effects[{index}].type must be one of {sorted(API_SIDE_EFFECT_TYPES)}'
                    )
                if not str(effect.get('description') or '').strip():
                    raise ValueError(f'case.api.expected_side_effects[{index}].description is required')
                if 'expected' not in effect:
                    raise ValueError(f'case.api.expected_side_effects[{index}].expected is required')
                implementation_file = str(effect.get('implementation_file') or '').replace('\\', '/')
                if not re.fullmatch(r'src/shared/helpers/.+\.(?:ts|js|mjs)', implementation_file):
                    raise ValueError(
                        f'case.api.expected_side_effects[{index}].implementation_file must stay below src/shared/helpers/'
                    )
                if not re.fullmatch(
                    r'[A-Za-z_$][A-Za-z0-9_$]*',
                    str(effect.get('implementation_export') or ''),
                ):
                    raise ValueError(
                        f'case.api.expected_side_effects[{index}].implementation_export is invalid'
                    )


def _validate_resolved_expected_result(value, field):
    """Reject explicit uncertainty so generated cases never choose an oracle for the source."""
    rendered = str(value or '').strip()
    unresolved_patterns = (
        r'(?im)^\s*(?:or|hoặc)\s*$',
        r'(?i)\b(?:tbd|tbc|unknown|unresolved|to be clarified)\b',
        r'(?i)\b(?:chưa xác định|chưa rõ|cần làm rõ|đang chờ xác nhận)\b',
        r'(?i)\beither\b.{0,120}\bor\b',
    )
    if any(re.search(pattern, rendered) for pattern in unresolved_patterns):
        raise ValueError(
            f'{field} contains an unresolved alternative; add it to review_required and resolve the oracle before generation'
        )
    return rendered


def _requirement_coverage_registry(data, execution_required):
    """Validate the document-derived coverage ledger before testcase projection."""
    requirements = data.get('requirements') or []
    if execution_required and not requirements:
        raise ValueError('execution_contract="required" requires a non-empty requirements registry')
    if not isinstance(requirements, list):
        raise ValueError('requirements must be an array')

    requirement_ids = set()
    coverage_items = {}
    for requirement in requirements:
        if not isinstance(requirement, dict):
            raise ValueError('requirements entries must be objects')
        requirement_id = str(requirement.get('id') or '').strip()
        if not requirement_id:
            raise ValueError('requirements[].id is required')
        if requirement_id in requirement_ids:
            raise ValueError(f'Duplicate requirement ID: {requirement_id}')
        requirement_ids.add(requirement_id)
        if execution_required and not str(requirement.get('text') or '').strip():
            raise ValueError(f'requirement {requirement_id} requires non-empty text')

        items = requirement.get('coverage_items') or []
        if execution_required and not items:
            raise ValueError(
                f'requirement {requirement_id} requires non-empty coverage_items derived from the source document'
            )
        if not isinstance(items, list):
            raise ValueError(f'requirement {requirement_id}.coverage_items must be an array')
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f'requirement {requirement_id}.coverage_items entries must be objects')
            item_id = str(item.get('id') or '').strip()
            if not COVERAGE_ITEM_ID_RE.fullmatch(item_id):
                raise ValueError(
                    f'coverage item ID must use a stable ID such as COV-AC1-HAPPY: {item_id or "<empty>"}'
                )
            if item_id in coverage_items:
                raise ValueError(f'Duplicate coverage item ID: {item_id}')
            description = str(item.get('description') or '').strip()
            source_ref = str(item.get('source_ref') or '').strip()
            expected_result = str(item.get('expected_result') or '').strip()
            if not description or not source_ref or not expected_result:
                raise ValueError(
                    f'coverage item {item_id} requires description, source_ref and expected_result'
                )
            _validate_resolved_expected_result(
                expected_result,
                f'coverage item {item_id}.expected_result',
            )
            minimum_cases = item.get('minimum_cases', 1)
            if isinstance(minimum_cases, bool) or not isinstance(minimum_cases, int) or minimum_cases < 1:
                raise ValueError(f'coverage item {item_id}.minimum_cases must be an integer >= 1')

            required_case_types = item.get('required_case_types') or []
            if isinstance(required_case_types, str):
                required_case_types = [required_case_types]
            if not isinstance(required_case_types, list) or not required_case_types:
                raise ValueError(f'coverage item {item_id} requires required_case_types')
            required_case_types = [str(value or '').strip().lower() for value in required_case_types]
            invalid_case_types = [value for value in required_case_types if value not in TYPE_ORDER]
            if invalid_case_types or 'additional' in required_case_types:
                raise ValueError(
                    f'coverage item {item_id} has invalid required_case_types: {invalid_case_types or ["additional"]}'
                )

            required_techniques = item.get('required_techniques') or []
            if isinstance(required_techniques, str):
                required_techniques = [required_techniques]
            if not isinstance(required_techniques, list) or not required_techniques:
                raise ValueError(f'coverage item {item_id} requires required_techniques')
            invalid_techniques = [value for value in required_techniques if value not in BB_TECHNIQUES]
            if invalid_techniques:
                raise ValueError(
                    f'coverage item {item_id} has unsupported required_techniques: {invalid_techniques}'
                )
            coverage_items[item_id] = {
                'id': item_id,
                'requirement': requirement_id,
                'description': description,
                'source_ref': source_ref,
                'expected_result': expected_result,
                'minimum_cases': minimum_cases,
                'required_case_types': list(dict.fromkeys(required_case_types)),
                'required_techniques': list(dict.fromkeys(required_techniques)),
                'testcase_ids': [],
                'observed_case_types': set(),
                'observed_techniques': set(),
            }
    return requirement_ids, coverage_items


def _validate_source_inventory(data, coverage_item_count):
    inventory = data.get('source_inventory')
    if inventory is None:
        return
    if not isinstance(inventory, dict):
        raise ValueError('source_inventory must be an object')
    generated = inventory.get('generated_obligation_count')
    unresolved = inventory.get('unresolved_obligation_count')
    if generated != coverage_item_count:
        raise ValueError(
            'source_inventory.generated_obligation_count does not match requirements[].coverage_items'
        )
    if unresolved != len(data.get('review_required') or []):
        raise ValueError(
            'source_inventory.unresolved_obligation_count does not match review_required'
        )


def iter_testcases(data):
    """Yield cases in canonical order with stable explicit IDs for new contracts."""
    counter = 0
    project_code = str((data.get('project') or {}).get('code') or '')
    contract_mode = str(data.get('execution_contract') or 'legacy_text_only').strip().lower()
    execution_required = contract_mode == 'required'
    seen_ids = set()
    requirement_ids, coverage_items = _requirement_coverage_registry(data, execution_required)
    _validate_source_inventory(data, len(coverage_items))
    if data.get('review_required'):
        raise ValueError('review_required must be empty before testcase generation')
    for section in data.get('sections') or []:
        is_ui = str(section.get('kind') or '').lower() == 'ui'
        is_function = str(section.get('kind') or '').lower() == 'function'
        for group in section.get('groups') or []:
            group_name = str(group.get('name') or '').strip()
            if execution_required and not group_name:
                raise ValueError('New executable cases require group.name')
            scenarios = ordered_scenarios(group)
            group_case_types = [
                str(case.get('type') or '').strip().lower()
                for scenario in scenarios
                for case in scenario.get('cases') or []
            ]
            if (
                execution_required
                and is_function
                and group_case_types
                and all(case_type in TYPE_ORDER for case_type in group_case_types)
                and 'happy' not in group_case_types
            ):
                raise ValueError(
                    f'FUNCTION group {group_name} requires at least one happy case before validation, edge, negative or error coverage'
                )
            for scenario in scenarios:
                scenario_id = str(scenario.get('scenario_id') or '').strip()
                scenario_name = str(scenario.get('scenario_name') or scenario.get('name') or '').strip()
                scenario_requirement = str(scenario.get('requirement') or '').strip()
                if execution_required:
                    if not SCENARIO_ID_RE.fullmatch(scenario_id):
                        raise ValueError(
                            'New executable cases require scenario_id such as SCN-LOG-001'
                        )
                    if not scenario_name:
                        raise ValueError('New executable cases require scenario_name')
                    if not scenario_requirement:
                        raise ValueError(
                            f'{scenario_id} requires one scenario.requirement so one scenario maps to one AC'
                        )
                    if scenario_requirement not in requirement_ids:
                        raise ValueError(
                            f'{scenario_id} references unknown requirement: {scenario_requirement}'
                        )
                for case in sorted(
                    scenario.get('cases') or [],
                    key=lambda item: type_rank(item.get('type')),
                ):
                    counter += 1
                    if case.get('api') is not None:
                        _validate_api_automation_metadata(case)
                    explicit_id = case.get('testcase_id')
                    case_type = str(case.get('type') or '').strip().lower()
                    if execution_required and case_type not in TYPE_ORDER:
                        raise ValueError(
                            f'case.type must be one of {TYPE_ORDER}: {case.get("type")}'
                        )
                    case_requirement = str(case.get('req') or '').strip()
                    if execution_required:
                        if case_type == 'additional':
                            if case_requirement not in {'', '(out-of-spec)'}:
                                raise ValueError(
                                    'additional testcase req must be empty or (out-of-spec)'
                                )
                        else:
                            if not case_requirement:
                                raise ValueError('New executable cases require case.req')
                            if case_requirement != scenario_requirement:
                                raise ValueError(
                                    f'{scenario_id} mixes requirements {scenario_requirement} and {case_requirement}; split the scenario'
                                )
                            if case_requirement not in requirement_ids:
                                raise ValueError(
                                    f'case.req references unknown requirement: {case_requirement}'
                                )
                        techniques = case.get('bb_technique')
                        if isinstance(techniques, str):
                            techniques = [techniques]
                        if not isinstance(techniques, list) or not techniques:
                            raise ValueError('New executable cases require bb_technique')
                        invalid_techniques = [
                            technique for technique in techniques
                            if technique not in BB_TECHNIQUES
                        ]
                        if invalid_techniques:
                            raise ValueError(
                                f'Unsupported bb_technique: {invalid_techniques}; allowed={sorted(BB_TECHNIQUES)}'
                            )
                        coverage_refs = _coverage_item_refs(case)
                        if case_type == 'additional':
                            if coverage_refs:
                                raise ValueError('additional testcase cannot cover confirmed source obligations')
                        elif not coverage_refs:
                            raise ValueError('New executable cases require case.coverage_item_refs')
                        for coverage_ref in coverage_refs:
                            coverage_item = coverage_items.get(coverage_ref)
                            if not coverage_item:
                                raise ValueError(f'Unknown coverage item reference: {coverage_ref}')
                            if coverage_item['requirement'] != case_requirement:
                                raise ValueError(
                                    f'case {explicit_id or "<unknown>"} maps {case_requirement} to coverage item '
                                    f'{coverage_ref} owned by {coverage_item["requirement"]}'
                                )
                            if case_type not in coverage_item['required_case_types']:
                                raise ValueError(
                                    f'case {explicit_id or "<unknown>"} type {case_type} is not allowed by coverage item '
                                    f'{coverage_ref}: {coverage_item["required_case_types"]}'
                                )
                            if not set(techniques).intersection(coverage_item['required_techniques']):
                                raise ValueError(
                                    f'case {explicit_id or "<unknown>"} techniques {techniques} do not satisfy coverage item '
                                    f'{coverage_ref}: {coverage_item["required_techniques"]}'
                                )
                    if execution_required and explicit_id in (None, ''):
                        raise ValueError(
                            'New executable UI/FUNCTION cases require stable case.testcase_id'
                        )
                    raw_test_id = (
                        _normalized_testcase_id(explicit_id)
                        if explicit_id not in (None, '')
                        else f"{project_code}{'-UI' if is_ui else ''}-{counter:02d}"
                    )
                    if raw_test_id in seen_ids:
                        raise ValueError(f'Duplicate testcase_id: {raw_test_id}')
                    seen_ids.add(raw_test_id)
                    if execution_required:
                        for coverage_ref in _coverage_item_refs(case):
                            coverage_items[coverage_ref]['testcase_ids'].append(raw_test_id)
                            coverage_items[coverage_ref]['observed_case_types'].add(case_type)
                            coverage_items[coverage_ref]['observed_techniques'].update(techniques)
                    # Keep the stable testcase ID readable in every projection.
                    # Brackets were previously added only for the legacy Excel
                    # display and made the ID disagree with JSON/Markdown/POM.
                    test_id = raw_test_id
                    yield {
                        'test_id': test_id,
                        'testcase_id': raw_test_id,
                        'case': case,
                        'section': section,
                        'group': group,
                        'scenario': scenario,
                    }
    if execution_required:
        for coverage_item in coverage_items.values():
            item_id = coverage_item['id']
            actual_count = len(coverage_item['testcase_ids'])
            if actual_count < coverage_item['minimum_cases']:
                raise ValueError(
                    f'coverage item {item_id} requires at least {coverage_item["minimum_cases"]} cases; found {actual_count}'
                )
            missing_case_types = set(coverage_item['required_case_types']) - coverage_item['observed_case_types']
            if missing_case_types:
                raise ValueError(
                    f'coverage item {item_id} is missing required case types: {sorted(missing_case_types)}'
                )
            missing_techniques = set(coverage_item['required_techniques']) - coverage_item['observed_techniques']
            if missing_techniques:
                raise ValueError(
                    f'coverage item {item_id} is missing required techniques: {sorted(missing_techniques)}'
                )


def build_requirement_coverage(data):
    """Return a validated, JSON-safe source-to-test coverage matrix."""
    execution_required = str(data.get('execution_contract') or 'legacy_text_only').strip().lower() == 'required'
    _requirement_ids, coverage_items = _requirement_coverage_registry(data, execution_required)
    records = list(iter_testcases(data))
    refs_by_id = {item_id: [] for item_id in coverage_items}
    for record in records:
        for item_id in _coverage_item_refs(record['case']):
            refs_by_id[item_id].append(record['testcase_id'])
    return [
        {
            'coverage_item_id': item['id'],
            'requirement': item['requirement'],
            'description': item['description'],
            'source_ref': item['source_ref'],
            'expected_result': item['expected_result'],
            'minimum_cases': item['minimum_cases'],
            'required_case_types': item['required_case_types'],
            'required_techniques': item['required_techniques'],
            'testcase_ids': refs_by_id[item['id']],
            'status': 'COVERED',
        }
        for item in coverage_items.values()
    ]


def build_case_registry(data):
    registry = {}
    for record in iter_testcases(data):
        case_ref = str(record['case'].get('case_ref') or '').strip()
        if not case_ref:
            continue
        if not re.fullmatch(r'[A-Z][A-Z0-9_-]+', case_ref):
            raise ValueError(
                f'case_ref must use uppercase letters, digits, underscore or hyphen: {case_ref}'
            )
        if case_ref in registry:
            raise ValueError(f'Duplicate case_ref: {case_ref}')
        registry[case_ref] = record
    return registry


def _rbac_required_text(value, field):
    rendered = human_text(value, field)
    if not rendered:
        raise ValueError(f'{field} is required')
    validate_manual_language(rendered, field)
    return rendered


def _rbac_case_refs(rule, field):
    value = rule.get(field) or []
    if not isinstance(value, list):
        raise ValueError(f'rbac.rules.{rule["id"]}.{field} must be an array')
    refs = [str(item).strip() for item in value if str(item).strip()]
    if len(refs) != len(set(refs)):
        raise ValueError(f'rbac.rules.{rule["id"]}.{field} contains duplicate case_ref')
    return refs


def validate_rbac_contract(data):
    """Validate RBAC rules and their positive/negative testcase coverage."""
    case_registry = build_case_registry(data)
    rbac = data.get('rbac')
    if rbac is None:
        return None, case_registry
    if not isinstance(rbac, dict):
        raise ValueError('rbac must be an object')
    if rbac.get('version') != 1:
        raise ValueError('rbac.version must be 1')

    roles = rbac.get('roles')
    if not isinstance(roles, list) or not roles:
        raise ValueError('rbac.roles must be a non-empty array')
    role_map = {}
    role_names = set()
    for index, role in enumerate(roles, 1):
        if not isinstance(role, dict):
            raise ValueError(f'rbac.roles[{index}] must be an object')
        role_key = str(role.get('key') or '').strip()
        role_name = _rbac_required_text(role.get('name'), f'rbac.roles[{index}].name')
        if not role_key:
            raise ValueError(f'rbac.roles[{index}].key is required')
        if not re.fullmatch(r'[a-z][a-z0-9_-]*', role_key):
            raise ValueError(
                f'rbac.roles[{index}].key must use lowercase letters, digits, underscore or hyphen'
            )
        if role_key in role_map:
            raise ValueError(f'Duplicate rbac role key: {role_key}')
        if role_name.casefold() in role_names:
            raise ValueError(f'Duplicate rbac role display name: {role_name}')
        role_names.add(role_name.casefold())
        role_map[role_key] = role_name

    rules = rbac.get('rules')
    if not isinstance(rules, list) or not rules:
        raise ValueError('rbac.rules must be a non-empty array')
    rule_map = {}
    normalized_rules = []
    required_rule_fields = (
        'id', 'module', 'resource', 'action', 'data_scope', 'condition', 'requirement'
    )
    for index, rule in enumerate(rules, 1):
        if not isinstance(rule, dict):
            raise ValueError(f'rbac.rules[{index}] must be an object')
        normalized = dict(rule)
        for field in required_rule_fields:
            normalized[field] = _rbac_required_text(
                rule.get(field), f'rbac.rules[{index}].{field}'
            )
        rule_id = normalized['id']
        if not re.fullmatch(r'RBAC-[A-Z0-9][A-Z0-9_-]*', rule_id):
            raise ValueError(
                f'rbac.rules[{index}].id must use format RBAC-<MODULE>-<NNN>'
            )
        if rule_id in rule_map:
            raise ValueError(f'Duplicate rbac rule id: {rule_id}')

        requirement_ids = {
            str(item.get('id') or '').strip()
            for item in data.get('requirements') or []
            if isinstance(item, dict)
        }
        if normalized['requirement'] != 'UNRESOLVED' and normalized['requirement'] not in requirement_ids:
            raise ValueError(
                f'rbac.rules.{rule_id}.requirement references unknown requirement: '
                f'{normalized["requirement"]}'
            )
        if normalized['requirement'] == 'UNRESOLVED' and not str(rule.get('notes') or '').strip():
            raise ValueError(
                f'rbac.rules.{rule_id}.notes is required when requirement is UNRESOLVED'
            )

        expectations = rule.get('expectations')
        if not isinstance(expectations, dict):
            raise ValueError(f'rbac.rules.{rule_id}.expectations must be an object')
        missing_roles = [key for key in role_map if key not in expectations]
        unknown_roles = [key for key in expectations if key not in role_map]
        if missing_roles or unknown_roles:
            raise ValueError(
                f'rbac.rules.{rule_id}.expectations role mismatch; '
                f'missing={missing_roles}, unknown={unknown_roles}'
            )
        normalized_expectations = {}
        for role_key, value in expectations.items():
            status = str(value or '').strip().upper()
            if status not in RBAC_EXPECTATIONS:
                raise ValueError(
                    f'rbac.rules.{rule_id}.expectations.{role_key} must be one of '
                    f'{sorted(RBAC_EXPECTATIONS)}'
                )
            normalized_expectations[role_key] = status

        if 'UNRESOLVED' in normalized_expectations.values() and not str(rule.get('notes') or '').strip():
            raise ValueError(
                f'rbac.rules.{rule_id}.notes is required when any role is UNRESOLVED'
            )

        verification = str(rule.get('verification') or '').strip().upper()
        if verification not in RBAC_VERIFICATION_STATUSES:
            raise ValueError(
                f'rbac.rules.{rule_id}.verification must be one of '
                f'{sorted(RBAC_VERIFICATION_STATUSES)}'
            )

        allow_refs = _rbac_case_refs({**rule, 'id': rule_id}, 'allow_case_refs')
        deny_refs = _rbac_case_refs({**rule, 'id': rule_id}, 'deny_case_refs')
        coverage_required = rule.get('coverage_required', True)
        if not isinstance(coverage_required, bool):
            raise ValueError(f'rbac.rules.{rule_id}.coverage_required must be true or false')
        if coverage_required and 'ALLOW' in normalized_expectations.values() and not allow_refs:
            raise ValueError(f'rbac.rules.{rule_id} requires at least one allow_case_ref')
        if coverage_required and 'DENY' in normalized_expectations.values() and not deny_refs:
            raise ValueError(f'rbac.rules.{rule_id} requires at least one deny_case_ref')

        for expected_status, refs in (('ALLOW', allow_refs), ('DENY', deny_refs)):
            for case_ref in refs:
                record = case_registry.get(case_ref)
                if record is None:
                    raise ValueError(
                        f'rbac.rules.{rule_id} references unknown case_ref: {case_ref}'
                    )
                execution = record['case'].get('execution') or {}
                entry = execution.get('entry') or {}
                role_key = str(entry.get('role_key') or '').strip()
                rbac_refs = entry.get('rbac_refs') or []
                if role_key not in role_map:
                    raise ValueError(
                        f'case_ref {case_ref} must declare execution.entry.role_key '
                        f'from rbac.roles'
                    )
                if entry.get('role') != role_map[role_key]:
                    raise ValueError(
                        f'case_ref {case_ref} role display name must match '
                        f'rbac.roles.{role_key}.name'
                    )
                if rule_id not in rbac_refs:
                    raise ValueError(
                        f'case_ref {case_ref} must include {rule_id} in '
                        f'execution.entry.rbac_refs'
                    )
                actual_status = normalized_expectations.get(role_key)
                if actual_status != expected_status:
                    raise ValueError(
                        f'case_ref {case_ref} uses role {role_key}={actual_status}, '
                        f'not {expected_status} for {rule_id}'
                    )

        evidence = rule.get('evidence') or []
        if not isinstance(evidence, (str, list)):
            raise ValueError(f'rbac.rules.{rule_id}.evidence must be a string or array')
        validate_manual_language(evidence, f'rbac.rules.{rule_id}.evidence')
        validate_manual_language(rule.get('notes'), f'rbac.rules.{rule_id}.notes')

        normalized.update({
            'expectations': normalized_expectations,
            'verification': verification,
            'allow_case_refs': allow_refs,
            'deny_case_refs': deny_refs,
            'coverage_required': coverage_required,
        })
        rule_map[rule_id] = normalized
        normalized_rules.append(normalized)

    for case_ref, record in case_registry.items():
        execution = record['case'].get('execution') or {}
        entry = execution.get('entry') or {}
        refs = entry.get('rbac_refs')
        if refs is None:
            continue
        if not isinstance(refs, list):
            raise ValueError(f'case_ref {case_ref} execution.entry.rbac_refs must be an array')
        unknown = [str(item) for item in refs if str(item) not in rule_map]
        if unknown:
            raise ValueError(f'case_ref {case_ref} has unknown rbac_refs: {unknown}')

    return {
        **rbac,
        'roles': [{'key': key, 'name': name} for key, name in role_map.items()],
        'rules': normalized_rules,
    }, case_registry


def _execution_target_name(target, field='execution.target'):
    """Return the human-facing target name from a structured step target."""
    if isinstance(target, dict):
        value = target.get('name') or target.get('key') or target.get('route')
    else:
        value = target
    value = human_text(value, field)
    if not value:
        raise ValueError(f'{field} must include a human-facing name or key')
    return value


def _execution_target_key(target):
    if isinstance(target, dict):
        return str(target.get('key') or target.get('name') or '').strip()
    return str(target or '').strip()


def _validate_selector_evidence(target, field):
    """Reject unverified or incomplete selector evidence in testcase input."""
    if not isinstance(target, dict):
        return
    evidence = target.get('selector_evidence')
    if evidence is None:
        return
    if not isinstance(evidence, dict):
        raise ValueError(f'{field}.selector_evidence must be an object')
    status = str(evidence.get('status') or 'unresolved').strip().lower()
    if status not in EXECUTION_SELECTOR_STATUSES:
        raise ValueError(
            f'{field}.selector_evidence.status must be one of '
            f'{sorted(EXECUTION_SELECTOR_STATUSES)}'
        )
    if status != 'runtime_verified':
        return
    strategy = str(evidence.get('strategy') or '').strip().lower()
    locator = str(evidence.get('locator') or '').strip()
    verification = evidence.get('verification') or {}
    if not strategy or not locator:
        raise ValueError(
            f'{field}.selector_evidence needs strategy and locator when runtime_verified'
        )
    if not isinstance(verification, dict):
        raise ValueError(f'{field}.selector_evidence.verification must be an object')
    if verification.get('count') != 1 or not isinstance(verification.get('visible'), bool):
        raise ValueError(
            f'{field}.selector_evidence must prove count=1 and record visible=true|false'
        )
    if strategy == 'xpath' and not evidence.get('reason'):
        raise ValueError(
            f'{field}.selector_evidence.reason is required when strategy=xpath'
        )


def validate_execution_contract(case):
    """Validate the optional structured contract used by dynamic-web-exploratory and POM.

    Legacy cases with only pre_condition/procedure/expected remain readable for
    backward compatibility. New cases should provide `execution` so the same
    source can drive manual execution and deterministic automation.
    """
    execution = case.get('execution')
    if execution is None:
        return None
    if not isinstance(execution, dict):
        raise ValueError('case.execution must be an object')
    if case.get('api') is not None:
        raise ValueError('case.execution cannot be combined with case.api')

    version = execution.get('version')
    if version != 1:
        raise ValueError('case.execution.version must be 1')

    if not isinstance(execution.get('mutates'), bool):
        raise ValueError('case.execution.mutates must be true or false')

    entry = execution.get('entry')
    if not isinstance(entry, dict):
        raise ValueError('case.execution.entry must be an object')
    missing_entry = [
        field for field in EXECUTION_ENTRY_FIELDS
        if not _has_manual_value(entry.get(field))
    ]
    if missing_entry:
        raise ValueError(
            'case.execution.entry must describe the manual pre-condition; missing '
            + ', '.join(missing_entry)
        )
    validate_manual_language(
        {key: entry.get(key) for key in EXECUTION_ENTRY_FIELDS if key != 'route'},
        'case.execution.entry',
    )
    validate_manual_language(entry.get('setup'), 'case.execution.entry.setup')
    if 'data' in entry:
        validate_api_secrets(entry.get('data'), 'execution.entry.data')

    steps = execution.get('steps')
    if not isinstance(steps, list) or not steps:
        raise ValueError('case.execution.steps must be a non-empty array')
    step_ids = set()
    normalized_steps = []
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            raise ValueError(f'execution.steps[{index}] must be an object')
        step_id = str(step.get('id') or '').strip()
        if not step_id:
            raise ValueError(f'execution.steps[{index}].id is required')
        if not re.fullmatch(r'S\d{2,}', step_id, re.IGNORECASE):
            raise ValueError(
                f'execution.steps[{index}].id must use the stable format S01, S02, ...'
            )
        if step_id in step_ids:
            raise ValueError(f'execution.steps contains duplicate id: {step_id}')
        step_ids.add(step_id)

        action = str(step.get('action') or '').strip().lower()
        if action not in EXECUTION_ACTIONS:
            raise ValueError(
                f'execution.steps[{index}].action must be one of '
                f'{sorted(EXECUTION_ACTIONS)}'
            )
        instruction = _render_manual_instruction(step)
        if not instruction:
            raise ValueError(f'execution.steps[{index}].instruction is required')
        validate_manual_language(instruction, f'execution.steps[{index}].instruction')

        target = step.get('target')
        if action not in {'wait', 'observe', 'assert'} and target is None:
            raise ValueError(
                f'execution.steps[{index}].target is required for action={action}'
            )
        if target is not None:
            if not isinstance(target, dict):
                raise ValueError(
                    f'execution.steps[{index}].target must include key, kind and name'
                )
            for target_field in ('key', 'kind', 'name'):
                if not str(target.get(target_field) or '').strip():
                    raise ValueError(
                        f'execution.steps[{index}].target.{target_field} is required'
                    )
            _execution_target_name(target, f'execution.steps[{index}].target')
            _validate_selector_evidence(target, f'execution.steps[{index}].target')

        value = step.get('value')
        if action in EXECUTION_VALUE_ACTIONS and not _has_manual_value(value):
            raise ValueError(
                f'execution.steps[{index}].value is required for action={action}'
            )
        if action in {'fill', 'clear'}:
            previous = normalized_steps[-1] if normalized_steps else None
            current_key = _execution_target_key(target)
            previous_key = _execution_target_key(previous.get('target')) if previous else ''
            if not previous or previous.get('action') != 'click' or previous_key != current_key:
                raise ValueError(
                    f'execution.steps[{index}] action={action} requires a separate '
                    f'click/focus step for target {current_key} immediately before it'
                )

        wait_for = step.get('wait_for')
        if wait_for is not None:
            if not isinstance(wait_for, dict):
                raise ValueError(f'execution.steps[{index}].wait_for must be an object')
            if not str(wait_for.get('kind') or '').strip():
                raise ValueError(f'execution.steps[{index}].wait_for.kind is required')
            wait_text = human_text(wait_for.get('text') or '', f'execution.steps[{index}].wait_for.text')
            if not wait_text:
                raise ValueError(
                    f'execution.steps[{index}].wait_for.text is required for manual execution'
                )
            validate_manual_language(wait_text, f'execution.steps[{index}].wait_for.text')

        assertions = step.get('assertions') or []
        if not isinstance(assertions, list):
            raise ValueError(f'execution.steps[{index}].assertions must be an array')
        if not assertions and wait_for is None:
            raise ValueError(
                f'execution.steps[{index}] needs assertions or wait_for so the step is verifiable'
            )
        for assertion_index, assertion in enumerate(assertions, 1):
            if not isinstance(assertion, dict):
                raise ValueError(
                    f'execution.steps[{index}].assertions[{assertion_index}] must be an object'
                )
            if not str(assertion.get('kind') or '').strip():
                raise ValueError(
                    f'execution.steps[{index}].assertions[{assertion_index}].kind is required'
                )
            assertion_text = human_text(
                assertion.get('text') or '',
                f'execution.steps[{index}].assertions[{assertion_index}].text',
            )
            if not assertion_text:
                raise ValueError(
                    f'execution.steps[{index}].assertions[{assertion_index}].text '
                    'is required for manual execution'
                )
            validate_manual_language(
                assertion_text,
                f'execution.steps[{index}].assertions[{assertion_index}].text',
            )
            if assertion_text.casefold() in VAGUE_MANUAL_RESULTS:
                raise ValueError(
                    f'execution.steps[{index}].assertions[{assertion_index}].text '
                    'must describe an observable result'
                )

        normalized_step = {**step, 'id': step_id, 'action': action, 'instruction': instruction}
        _validate_atomic_instruction(normalized_step, index)
        normalized_steps.append(normalized_step)

    outcome = execution.get('outcome') or {}
    if not isinstance(outcome, dict):
        raise ValueError('case.execution.outcome must be an object')
    outcome_assertions = outcome.get('assertions') or []
    if not isinstance(outcome_assertions, list) or not outcome_assertions:
        raise ValueError('case.execution.outcome.assertions must be a non-empty array')
    for assertion_index, assertion in enumerate(outcome_assertions, 1):
        if not isinstance(assertion, dict):
            raise ValueError(f'execution.outcome.assertions[{assertion_index}] must be an object')
        if not str(assertion.get('kind') or '').strip():
            raise ValueError(
                f'execution.outcome.assertions[{assertion_index}].kind is required'
            )
        assertion_text = human_text(
            assertion.get('text') or '',
            f'execution.outcome.assertions[{assertion_index}].text',
        )
        if not assertion_text:
            raise ValueError(
                f'execution.outcome.assertions[{assertion_index}].text '
                'is required for manual execution'
            )
        validate_manual_language(
            assertion_text,
            f'execution.outcome.assertions[{assertion_index}].text',
        )
        if assertion_text.casefold() in VAGUE_MANUAL_RESULTS:
            raise ValueError(
                f'execution.outcome.assertions[{assertion_index}].text '
                'must describe an observable result'
            )

    cleanup = execution.get('cleanup')
    mutates = bool(execution.get('mutates', False))
    if mutates and cleanup is None:
        raise ValueError('case.execution.cleanup is required when execution.mutates=true')
    if cleanup is not None and not isinstance(cleanup, (str, dict, list)):
        raise ValueError('case.execution.cleanup must be a string, object or array')
    validate_manual_language(cleanup, 'case.execution.cleanup')

    return {**execution, 'entry': entry, 'steps': normalized_steps, 'outcome': outcome}


def _render_execution_value(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        return compact_json(value)
    return human_text(value, 'execution value')


def _render_wait_for(wait_for):
    if wait_for is None:
        return ''
    if isinstance(wait_for, str):
        return human_text(wait_for, 'wait_for')
    kind = str(wait_for.get('kind') or '').strip().lower()
    value = _render_execution_value(wait_for.get('value'))
    if kind == 'url':
        return f'URL chứa {value}' if value else 'URL tải xong'
    if kind in {'visible', 'enabled', 'text', 'state'}:
        return f'{kind}: {value}' if value else kind
    if kind == 'response':
        return f'Hoàn tất xử lý {value}'.strip()
    return ' '.join(part for part in (kind, value) if part).strip()


def _render_manual_wait_for(wait_for, step=None):
    if not wait_for:
        return ''
    if step is None:
        return human_text(wait_for.get('text') or '', 'wait_for.text')
    return _replace_manual_data_refs(
        wait_for.get('text') or '',
        step.get('value'),
        step.get('target'),
        step.get('action') or '',
    )


def _render_assertion(assertion, step=None):
    text = human_text(assertion.get('text') or '', 'assertion.text')
    if step is not None:
        text = _replace_manual_data_refs(
            text,
            step.get('value'),
            step.get('target'),
            step.get('action') or '',
        )
    else:
        text = _replace_manual_data_refs(text, action='assert')
    if text:
        return text
    kind = str(assertion.get('kind') or '').strip().lower()
    target = assertion.get('target_name') or assertion.get('target') or ''
    if step is not None:
        target = _replace_manual_data_refs(
            target,
            step.get('value'),
            step.get('target'),
            step.get('action') or '',
        )
    else:
        target = human_text(target, 'assertion.target')
    value = _render_execution_value(assertion.get('value') or assertion.get('expected'))
    if kind == 'visible':
        return f'{target} hiển thị' if target else 'Đối tượng hiển thị'
    if kind == 'hidden':
        return f'{target} không hiển thị' if target else 'Đối tượng không hiển thị'
    if kind == 'url':
        return f'URL chứa {value}' if value else 'URL chuyển đúng trang'
    if kind == 'text':
        return f'{target} hiển thị nội dung "{value}"'.strip()
    if kind == 'count':
        return f'{target} có số lượng {value}'.strip()
    if kind in {'value', 'state', 'enabled', 'disabled'}:
        return f'{target} có trạng thái/giá trị {value}'.strip()
    return ' '.join(part for part in (target, kind, value) if part).strip() or 'Kết quả đúng theo yêu cầu'


def _render_execution_case(case, execution):
    entry = execution.get('entry') or {}
    precondition_parts = []
    precondition_parts.append(f'Môi trường: {human_text(entry["environment"], "execution.entry.environment")}')
    precondition_parts.append(f'Màn hình bắt đầu: {human_text(entry["screen"], "execution.entry.screen")}')
    precondition_parts.append(f'Đường dẫn truy cập: {human_text(entry["route"], "execution.entry.route")}')
    precondition_parts.append(f'Vai trò: {human_text(entry["role"], "execution.entry.role")}')
    for rbac_ref in entry.get('rbac_refs') or []:
        precondition_parts.append(
            f'Quy tắc phân quyền áp dụng: {human_text(rbac_ref, "execution.entry.rbac_refs")}'
        )
    states = entry['state'] if isinstance(entry['state'], list) else [entry['state']]
    precondition_parts.extend(
        f'Trạng thái ban đầu: {human_text(value, "execution.entry.state")}'
        for value in states
    )
    permissions = entry['permissions'] if isinstance(entry['permissions'], list) else [entry['permissions']]
    precondition_parts.extend(
        f'Quyền cần có: {human_text(value, "execution.entry.permissions")}'
        for value in permissions
    )
    precondition_parts.extend(
        f'Dữ liệu chuẩn bị: {value}' for value in _render_manual_data(entry['data'])
    )
    setup = entry.get('setup') or []
    setup_items = setup if isinstance(setup, list) else [setup]
    precondition_parts.extend(
        f'Chuẩn bị trước khi chạy: {human_text(value, "execution.entry.setup")}'
        for value in setup_items if value not in (None, '')
    )
    precondition = '\n'.join(
        f'{index}. {value}' for index, value in enumerate(precondition_parts, 1)
    )

    procedure_lines = []
    for step in execution['steps']:
        instruction = _render_manual_instruction(step)
        procedure_lines.append(instruction)
        wait_for = _render_manual_wait_for(step.get('wait_for'), step)
        if wait_for and wait_for.casefold() not in instruction.casefold():
            procedure_lines.append(wait_for)
    cleanup = execution.get('cleanup')
    if cleanup is not None:
        cleanup_items = cleanup if isinstance(cleanup, list) else [cleanup]
        for item in cleanup_items:
            if isinstance(item, dict):
                instruction = item.get('instruction') or item.get('text') or ''
            else:
                instruction = item
            if instruction:
                procedure_lines.append(
                    f'Thực hiện sau kiểm thử: {_replace_manual_data_refs(instruction, action="cleanup")}'
                )

    expected_lines = []
    for step in execution['steps']:
        for assertion in step.get('assertions') or []:
            expected_lines.append(_render_assertion(assertion, step))
    for assertion in execution['outcome'].get('assertions') or []:
        expected_lines.append(_render_assertion(assertion))

    return (
        human_text(precondition, 'pre_condition'),
        human_text(
            '\n'.join(f'{index}. {value}' for index, value in enumerate(procedure_lines, 1)),
            'procedure',
        ),
        human_text('\n'.join(f'{index}. {value}' for index, value in enumerate(expected_lines, 1)), 'expected'),
    )


def render_case(case, execution_required=False):
    """Render API, structured execution, or legacy text into F/G/H."""
    if case.get('api') is not None:
        if case.get('execution') is not None:
            raise ValueError('case.api cannot be combined with case.execution')
        return (*render_api_case(case), None)
    execution = validate_execution_contract(case)
    if execution is not None:
        return (*_render_execution_case(case, execution), execution)
    if execution_required:
        raise ValueError(
            'New UI/FUNCTION testcase requires case.execution; use '
            'execution_contract="legacy_text_only" only for an existing legacy source'
        )
    return (
        human_text(case.get('pre_condition', ''), 'pre_condition'),
        human_text(case.get('procedure', ''), 'procedure'),
        human_text(case.get('expected', ''), 'expected'),
        None,
    )


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
    for effect in api.get('expected_side_effects') or []:
        expected.append(
            f'Side effect {effect["id"]} ({effect["type"]}): '
            f'{effect["description"]}; oracle = {compact_json(effect["expected"])}'
        )
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


def _markdown_cell(value):
    if value is None:
        return ''
    rendered = compact_json(value) if isinstance(value, (dict, list)) else str(value)
    return rendered.replace('|', '\\|').replace('\n', '<br>')


def _execution_target_hints(target):
    if not isinstance(target, dict):
        return ''
    labels = (
        ('kind', 'kind'),
        ('role', 'role'),
        ('label', 'label'),
        ('placeholder', 'placeholder'),
        ('test_id', 'test_id'),
        ('id', 'id'),
        ('frame', 'frame'),
    )
    return '; '.join(
        f'{label}={_markdown_cell(target.get(key))}'
        for key, label in labels
        if target.get(key) not in (None, '')
    )


def append_execution_contract_markdown(lines, execution):
    """Render the machine-facing contract without adding Excel columns."""
    entry = execution.get('entry') or {}
    lines.extend(['', '- **Execution contract:** `v1`', ''])
    lines.append(
        '- **Entry:** '
        + '; '.join(
            item for item in (
                f'environment={_markdown_cell(entry.get("environment"))}' if entry.get('environment') else '',
                f'screen={_markdown_cell(entry.get("screen"))}' if entry.get('screen') else '',
                f'role={_markdown_cell(entry.get("role"))}' if entry.get('role') else '',
                f'role_key={_markdown_cell(entry.get("role_key"))}' if entry.get('role_key') else '',
                f'rbac_refs={_markdown_cell(entry.get("rbac_refs"))}' if entry.get('rbac_refs') else '',
                f'route={_markdown_cell(entry.get("route"))}' if entry.get('route') else '',
                f'state={_markdown_cell(entry.get("state"))}' if entry.get('state') else '',
                f'permissions={_markdown_cell(entry.get("permissions"))}' if entry.get('permissions') else '',
                f'data={_markdown_cell(entry.get("data"))}' if entry.get('data') else '',
            ) if item
        )
        or 'N/A'
    )
    lines.extend([
        '',
        '| Step | Action | Target key | Manual instruction | Target | Value | Semantic hints | Wait for | Step assertions |',
        '|---|---|---|---|---|---|---|---|---|',
    ])
    selector_statuses = []
    for step in execution.get('steps') or []:
        target = step.get('target')
        evidence = target.get('selector_evidence') if isinstance(target, dict) else None
        selector_statuses.append(
            'not_applicable'
            if target is None
            else str((evidence or {}).get('status') or 'unresolved').strip().lower()
        )
        assertions = '<br>'.join(
            _markdown_cell(assertion.get('text') or _render_assertion(assertion))
            for assertion in step.get('assertions') or []
        ) or 'N/A'
        lines.append(
            '| ' + ' | '.join((
                _markdown_cell(step.get('id')),
                _markdown_cell(step.get('action')),
                _markdown_cell(_execution_target_key(target)),
                _markdown_cell(step.get('instruction')),
                _markdown_cell(_execution_target_name(target) if target is not None else 'N/A'),
                _markdown_cell(step.get('value')) or 'N/A',
                _execution_target_hints(target) or 'N/A',
                _markdown_cell(_render_wait_for(step.get('wait_for'))) or 'N/A',
                assertions,
            )) + ' |'
        )

    lines.extend(['', '- **Outcome assertions:**'])
    for assertion in execution.get('outcome', {}).get('assertions') or []:
        lines.append(f'  - {_markdown_cell(assertion.get("text") or _render_assertion(assertion))}')
    cleanup = execution.get('cleanup')
    if cleanup is not None:
        lines.append(f'- **Cleanup:** {_markdown_cell(cleanup)}')

    if selector_statuses and all(status == 'not_applicable' for status in selector_statuses):
        selector_summary = 'not_applicable for this non-UI step set'
    elif selector_statuses and all(status == 'runtime_verified' for status in selector_statuses):
        selector_summary = 'runtime_verified for every target'
    elif any(status == 'runtime_verified' for status in selector_statuses):
        selector_summary = 'partially runtime_verified; unresolved targets must be inspected'
    else:
        selector_summary = 'unresolved; POM must inspect the target DOM in the real environment'
    lines.append(f'- **Selector status:** `{selector_summary}`')


def _rbac_case_ids(case_refs, case_registry):
    return [case_registry[ref]['test_id'] for ref in case_refs if ref in case_registry]


def _rbac_coverage_label(rule):
    if not rule.get('coverage_required', True):
        return 'CHƯA YÊU CẦU'
    expectation_values = set(rule['expectations'].values())
    if 'UNRESOLVED' in expectation_values:
        return 'CHƯA RÕ'
    if expectation_values == {'N/A'}:
        return 'N/A'
    missing = []
    if 'ALLOW' in rule['expectations'].values() and not rule.get('allow_case_refs'):
        missing.append('ALLOW')
    if 'DENY' in rule['expectations'].values() and not rule.get('deny_case_refs'):
        missing.append('DENY')
    return f'THIẾU {", ".join(missing)}' if missing else 'ĐỦ'


def append_rbac_markdown(lines, rbac, case_registry):
    """Render the business-facing RBAC matrix from the validated JSON contract."""
    lines.extend(['', '## RBAC Matrix', ''])
    if rbac is None:
        lines.append('- N/A — Không có rule RBAC trong phạm vi testcase')
        return

    role_headers = [role['name'] for role in rbac['roles']]
    headers = [
        'RBAC ID', 'Module', 'Chức năng/Tài nguyên', 'Hành động',
        'Phạm vi dữ liệu', 'Điều kiện/Trạng thái', 'Requirement Ref',
        *role_headers,
        'Testcase cho phép', 'Testcase từ chối', 'Coverage',
        'Mức xác minh', 'Nguồn/Evidence', 'Ghi chú/Q&A',
    ]
    lines.append('| ' + ' | '.join(_markdown_cell(value) for value in headers) + ' |')
    lines.append('|' + '|'.join('---' for _ in headers) + '|')
    for rule in rbac['rules']:
        evidence = rule.get('evidence') or []
        evidence_values = evidence if isinstance(evidence, list) else [evidence]
        row = [
            rule['id'],
            rule['module'],
            rule['resource'],
            rule['action'],
            rule['data_scope'],
            rule['condition'],
            rule['requirement'],
            *(
                RBAC_EXPECTATION_LABELS[rule['expectations'][role['key']]]
                for role in rbac['roles']
            ),
            ', '.join(_rbac_case_ids(rule['allow_case_refs'], case_registry)) or 'N/A',
            ', '.join(_rbac_case_ids(rule['deny_case_refs'], case_registry)) or 'N/A',
            _rbac_coverage_label(rule),
            RBAC_VERIFICATION_LABELS[rule['verification']],
            '<br>'.join(human_text(value, 'rbac evidence') for value in evidence_values if value) or 'N/A',
            human_text(rule.get('notes') or '', 'rbac notes') or 'N/A',
        ]
        lines.append('| ' + ' | '.join(_markdown_cell(value) for value in row) + ' |')


def write_testcase_markdown(data, output_path):
    """Write the complete AI-readable testcase design before Excel generation."""
    rbac, case_registry = validate_rbac_contract(data)
    testcase_records = list(iter_testcases(data))
    requirement_coverage = build_requirement_coverage(data)
    record_by_case = {id(record['case']): record for record in testcase_records}
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

    lines.extend(['', '## Requirement coverage', ''])
    if requirement_coverage:
        lines.append(
            '| Coverage item | Requirement | Source | Expected result | Required design | Testcase IDs | Status |'
        )
        lines.append('|---|---|---|---|---|---|---|')
        for item in requirement_coverage:
            required_design = (
                f'Type={", ".join(item["required_case_types"])}; '
                f'Technique={", ".join(item["required_techniques"])}; '
                f'Min cases={item["minimum_cases"]}'
            )
            row = [
                item['coverage_item_id'],
                item['requirement'],
                item['source_ref'],
                item['expected_result'],
                required_design,
                ', '.join(item['testcase_ids']),
                item['status'],
            ]
            lines.append('| ' + ' | '.join(_markdown_cell(value) for value in row) + ' |')
    else:
        lines.append('- N/A cho legacy text-only')

    append_rbac_markdown(lines, rbac, case_registry)

    contract_mode = str(data.get('execution_contract') or 'legacy_text_only').strip().lower()
    if contract_mode not in {'required', 'legacy_text_only'}:
        raise ValueError(
            'execution_contract must be "required" or "legacy_text_only"'
        )
    execution_required = contract_mode == 'required'
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
            scenarios = ordered_scenarios(group)
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
                    test_id = record_by_case[id(case)]['test_id']
                    description = human_text(case.get('description') or '', 'description')
                    requirement = case.get('req') or scenario.get('requirement') or (
                        '(out-of-spec)' if case.get('type') == 'additional' else 'UNRESOLVED'
                    )
                    pre_condition, procedure, expected, execution = render_case(
                        case, execution_required=execution_required
                    )
                    lines.extend([f'##### `{test_id}` — {description}', ''])
                    lines.append(f'- **Type:** {type_label(case.get("type"))}')
                    techniques = case.get('bb_technique') or []
                    if isinstance(techniques, str):
                        techniques = [techniques]
                    lines.append(f'- **BB Technique:** {", ".join(techniques) if techniques else "N/A"}')
                    lines.append(f'- **Requirement:** `{requirement}`')
                    lines.append(f'- **Priority:** {human_text(case.get("priority") or "N/A", "priority")}')
                    append_markdown_block(lines, 'Pre-condition', pre_condition)
                    append_markdown_block(lines, 'Procedure', procedure)
                    append_markdown_block(lines, 'Expected Results', expected)
                    if execution is not None:
                        append_execution_contract_markdown(lines, execution)
                    else:
                        lines.append(
                            '- **Automation readiness:** Legacy text-only case; add an `execution` contract before deterministic POM generation'
                        )
                    lines.append('')

    with open(output_path, 'w', encoding='utf-8') as markdown_file:
        markdown_file.write('\n'.join(lines).rstrip() + '\n')
    return stt_counter


def build_automation_manifest(data, markdown_path):
    """Build the lossless machine handoff consumed by POM automation."""
    rbac, _case_registry = validate_rbac_contract(data)
    records = list(iter_testcases(data))
    manifest_cases = []
    for record in records:
        case = record['case']
        execution = validate_execution_contract(case)
        manifest_cases.append({
            'testcase_id': record['testcase_id'],
            'testcase_id_display': record['test_id'],
            'case_ref': str(case.get('case_ref') or '').strip() or None,
            'section_kind': str(record['section'].get('kind') or '').strip().lower(),
            'group': human_text(record['group'].get('name') or '', 'group name'),
            'scenario_id': str(record['scenario'].get('scenario_id') or '').strip(),
            'scenario_name': human_text(
                record['scenario'].get('scenario_name')
                or record['scenario'].get('name')
                or record['group'].get('name')
                or '',
                'scenario_name',
            ),
            'type': str(case.get('type') or 'happy').strip().lower(),
            'bb_technique': deepcopy(case.get('bb_technique')),
            'requirement': str(
                case.get('req')
                or record['scenario'].get('requirement')
                or ('(out-of-spec)' if case.get('type') == 'additional' else 'UNRESOLVED')
            ).strip(),
            'priority': human_text(case.get('priority') or 'N/A', 'priority'),
            'automation_tags': _automation_tags(case),
            'lifecycle_hooks': deepcopy(case.get('lifecycle_hooks')),
            'description': human_text(case.get('description') or '', 'description'),
            'coverage_item_refs': _coverage_item_refs(case),
            'ui_function_keys': _ui_function_keys(case),
            'execution': execution,
            'api': case.get('api'),
            'automation_selection': deepcopy(case.get('automation_selection')),
            'manual_verification': deepcopy(case.get('manual_verification')),
            'risk_profile': deepcopy(case.get('risk_profile')),
            'stability_gate': deepcopy(case.get('stability_gate')),
            'network_interception': deepcopy(case.get('network_interception')),
            'db_verification': deepcopy(case.get('db_verification')),
        })

    with open(markdown_path, 'rb') as markdown_file:
        markdown_bytes = markdown_file.read()
    return {
        'schema_version': 1,
        'source': {
            'project_code': str((data.get('project') or {}).get('code') or ''),
            'source_document': data.get('source_document'),
            'markdown_file': os.path.basename(markdown_path),
            'markdown_sha256': hashlib.sha256(markdown_bytes).hexdigest(),
            'testcase_count': len(manifest_cases),
        },
        'rbac': rbac,
        'requirement_coverage': build_requirement_coverage(data),
        'testcases': manifest_cases,
    }


def write_automation_manifest(data, markdown_path, output_path):
    manifest = build_automation_manifest(data, markdown_path)
    with open(output_path, 'w', encoding='utf-8') as manifest_file:
        json.dump(manifest, manifest_file, ensure_ascii=False, indent=2)
        manifest_file.write('\n')
    return manifest

def type_rank(t):
    t = (t or 'happy').lower().strip()
    return TYPE_ORDER.index(t) if t in TYPE_ORDER else len(TYPE_ORDER)

def scenario_rank(scenario):
    """Rank a scenario by its earliest black-box case type."""
    cases = scenario.get('cases') or []
    return min((type_rank(case.get('type')) for case in cases), default=len(TYPE_ORDER))

def ordered_scenarios(group):
    """Keep scenarios contiguous while putting happy-path scenarios first."""
    return sorted(group.get('scenarios') or [], key=scenario_rank)

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


def apply_row_style(ws, row, start_col, end_col, style):
    """Apply a captured header/group style across the visible row band."""
    if not style:
        return
    for column in range(start_col, end_col + 1):
        apply_style(ws.cell(row=row, column=column), style)

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
    return (f'=IF(H{row}="","","{prefix}'
            f'&TEXT(COUNTIF($H${anchor_row+1}:H{row},"<>"),"00"))')

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


def write_rbac_sheet(workbook, rbac, case_registry):
    """Create the derived, business-facing RBAC Matrix sheet."""
    sheet_name = 'RBAC Matrix'
    if sheet_name in workbook.sheetnames:
        del workbook[sheet_name]
    insert_at = (
        workbook.sheetnames.index('Test cases_App') + 1
        if 'Test cases_App' in workbook.sheetnames
        else len(workbook.sheetnames)
    )
    sheet = workbook.create_sheet(sheet_name, insert_at)
    sheet.sheet_view.showGridLines = False

    roles = rbac['roles'] if rbac else []
    headers = [
        'RBAC ID', 'Module', 'Chức năng/Tài nguyên', 'Hành động',
        'Phạm vi dữ liệu', 'Điều kiện/Trạng thái', 'Requirement Ref',
        *(role['name'] for role in roles),
        'Testcase cho phép', 'Testcase từ chối', 'Coverage',
        'Mức xác minh', 'Nguồn/Evidence', 'Ghi chú/Q&A',
    ]
    last_column = len(headers)
    last_letter = get_column_letter(last_column)

    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=last_column)
    title = sheet.cell(row=1, column=1, value='RBAC Matrix — Vai trò × Quyền × Testcase')
    title.font = Font(bold=True, color='FFFFFF', size=14)
    title.fill = PatternFill('solid', fgColor='1F4E78')
    title.alignment = Alignment(horizontal='center', vertical='center')
    sheet.row_dimensions[1].height = 26

    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=last_column)
    subtitle = sheet.cell(
        row=2,
        column=1,
        value=(
            'Dùng CHO PHÉP, TỪ CHỐI, N/A hoặc CHƯA RÕ; '
            'quyền chưa có expected phải giữ CHƯA RÕ và chuyển sang Q&A'
        ),
    )
    subtitle.font = Font(italic=True, color='404040')
    subtitle.fill = PatternFill('solid', fgColor='D9EAF7')
    subtitle.alignment = Alignment(wrap_text=True, vertical='center')
    sheet.row_dimensions[2].height = 32

    sheet.merge_cells(start_row=3, start_column=1, end_row=3, end_column=last_column)
    sources = (rbac or {}).get('sources') or {}
    if isinstance(sources, dict) and sources:
        source_text = ' | '.join(
            f'{_manual_label(key)}: {human_text(value, f"rbac.sources.{key}")}'
            for key, value in sources.items() if value not in (None, '')
        )
    else:
        source_text = 'Nguồn: N/A'
    source_cell = sheet.cell(row=3, column=1, value=source_text or 'Nguồn: N/A')
    source_cell.alignment = Alignment(wrap_text=True, vertical='center')
    source_cell.font = Font(color='595959')

    header_row = 5
    for column, header in enumerate(headers, 1):
        cell = sheet.cell(row=header_row, column=column, value=header)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='4472C4')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    sheet.row_dimensions[header_row].height = 38

    role_start = 8
    role_end = role_start + len(roles) - 1
    data_row = header_row + 1
    if rbac is None:
        values = ['N/A', '', 'Không có rule RBAC trong phạm vi testcase']
        for column, value in enumerate(values, 1):
            sheet.cell(row=data_row, column=column, value=value)
        coverage_column = 10
        sheet.cell(row=data_row, column=coverage_column, value='N/A')
        sheet.row_dimensions[data_row].height = 32
        last_data_row = data_row
    else:
        for rule in rbac['rules']:
            evidence = rule.get('evidence') or []
            evidence_values = evidence if isinstance(evidence, list) else [evidence]
            values = [
                rule['id'],
                rule['module'],
                rule['resource'],
                rule['action'],
                rule['data_scope'],
                rule['condition'],
                rule['requirement'],
                *(RBAC_EXPECTATION_LABELS[rule['expectations'][role['key']]] for role in roles),
                '\n'.join(_rbac_case_ids(rule['allow_case_refs'], case_registry)) or 'N/A',
                '\n'.join(_rbac_case_ids(rule['deny_case_refs'], case_registry)) or 'N/A',
                _rbac_coverage_label(rule),
                RBAC_VERIFICATION_LABELS[rule['verification']],
                '\n'.join(human_text(value, 'rbac evidence') for value in evidence_values if value) or 'N/A',
                human_text(rule.get('notes') or '', 'rbac notes') or 'N/A',
            ]
            for column, value in enumerate(values, 1):
                cell = sheet.cell(row=data_row, column=column, value=value)
                cell.alignment = Alignment(vertical='top', wrap_text=True)
                if role_start <= column <= role_end:
                    expectation = rule['expectations'][roles[column - role_start]['key']]
                    colors = {
                        'ALLOW': ('C6EFCE', '006100'),
                        'DENY': ('FFC7CE', '9C0006'),
                        'N/A': ('E7E6E6', '595959'),
                        'UNRESOLVED': ('FFEB9C', '9C6500'),
                    }
                    background, foreground = colors[expectation]
                    cell.fill = PatternFill('solid', fgColor=background)
                    cell.font = Font(bold=True, color=foreground)
                    cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            line_count = max(str(value or '').count('\n') + 1 for value in values)
            sheet.row_dimensions[data_row].height = min(180.0, max(34.0, line_count * 18.0))
            data_row += 1
        last_data_row = data_row - 1

    widths = [16, 16, 28, 20, 24, 30, 18]
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    for index in range(role_start, role_end + 1):
        sheet.column_dimensions[get_column_letter(index)].width = 18
    trailing_start = role_end + 1 if roles else 8
    trailing_widths = [20, 20, 14, 34, 34, 34]
    for offset, width in enumerate(trailing_widths):
        sheet.column_dimensions[get_column_letter(trailing_start + offset)].width = width

    sheet.freeze_panes = 'H6'
    sheet.auto_filter.ref = f'A{header_row}:{last_letter}{last_data_row}'
    sheet.print_title_rows = f'1:{header_row}'
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.page_orientation = 'landscape'


# ---------- main ----------
def main():
    if len(sys.argv) < 3:
        print("Cách dùng: gen-testcases.py <input.json> <output.xlsx> [template.xlsx]")
        sys.exit(1)
    inp_path, requested_out_path = sys.argv[1], sys.argv[2]
    out_path = dated_artifact_path(requested_out_path)
    if out_path != requested_out_path:
        print(f"  Dated output: {requested_out_path} -> {out_path}")
    # Ưu tiên CLI arg, nếu không có thì dùng Template.xlsx (template chung cho mọi project)
    cli_template = sys.argv[3] if len(sys.argv) > 3 else None
    tmpl = get_template_path(specified_path=cli_template)
    with open(inp_path, encoding='utf-8') as f:
        data = materialize_execution_templates(json.load(f))
    rbac, case_registry = validate_rbac_contract(data)
    testcase_records = list(iter_testcases(data))
    record_by_case = {id(record['case']): record for record in testcase_records}
    contract_mode = str(data.get('execution_contract') or 'legacy_text_only').strip().lower()
    if contract_mode not in {'required', 'legacy_text_only'}:
        raise ValueError(
            'execution_contract must be "required" or "legacy_text_only"'
        )
    execution_required = contract_mode == 'required'

    # 0. Generate the AI-readable testcase document before touching Excel
    md_path = os.path.splitext(out_path)[0] + '.md'
    markdown_case_count = write_testcase_markdown(data, md_path)
    print(f"  Generated Markdown first: {md_path} ({markdown_case_count} test cases)")

    # 0b. Generate the lossless machine handoff after Markdown and before Excel
    automation_path = os.path.splitext(out_path)[0] + '.automation.json'
    automation_manifest = write_automation_manifest(data, md_path, automation_path)
    print(
        f"  Generated automation manifest: {automation_path} "
        f"({len(automation_manifest['testcases'])} test cases)"
    )

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

    # Make the section and function header fills span the complete visible
    # testcase band. The template stores the title in column C, but readers
    # perceive the whole B:M row as the header.
    section_styles = {
        '1.1. USER INTERFACE': sty_section,
        '1.2. FUNCTION': sty_section2,
        '1.3. PERFORMANCE': sty_section,
    }
    for r in range(10, ws.max_row + 1):
        title = ws.cell(row=r, column=3).value
        if title in section_styles:
            apply_row_style(ws, r, 2, 13, section_styles[title])

    # Xoá data validation cũ
    ws.data_validations.dataValidation = []

    # 4. Update Cover metadata
    p = data.get('project', {})
    project_code = p.get('code', '')
    if not project_code:
        print("  ⚠️  CẢNH BÁO: project.code chưa có trong JSON. Test case ID sẽ trống prefix (vd 'NN' thay vì 'BCP-NN').")
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

    for sec in sections_in:
        sec_title = sec.get('title', '')
        section_kind = sec.get('kind', '').lower()
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
            # Group/function title rows must carry their fill across B:M, not
            # only the cell containing the title.
            apply_row_style(ws, group_row, 2, 13, sty_group)
            # Ghi từng scenario
            for sc in ordered_scenarios(grp):
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
                    pre_condition, procedure, expected_result, _execution = render_case(
                        case, execution_required=execution_required
                    )
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
                    # Cột D uses the same stable ID as Markdown and automation manifest
                    d_id = record_by_case[id(case)]['test_id']
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

    # 6. Add data validation và conditional formatting cho tất cả data rows
    if all_data_ranges:
        rmin, rmax = min(all_data_ranges), max(all_data_ranges)
        # Dropdowns
        dv_i = DataValidation(type='list', formula1='"Pass,Fail,N/A,Untested"', allow_blank=True)
        dv_i.add(f'I{rmin}:I{rmax}')
        ws.add_data_validation(dv_i)
        dv_j = DataValidation(type='list', formula1='"Critical,High,Medium,Low,N/A"', allow_blank=True)
        dv_j.add(f'J{rmin}:J{rmax}')
        ws.add_data_validation(dv_j)
        
        # Colors for Results (Col I)
        colors_i = {
            'Pass': ('C6EFCE', '006100'),
            'Fail': ('FFC7CE', '9C0006'),
            'N/A': ('FFEB9C', '9C6500'),
            'Untested': ('D9D9D9', '595959')
        }
        for val, (bg, fg) in colors_i.items():
            rule = CellIsRule(operator='equal', formula=[f'"{val}"'], stopIfTrue=True,
                              fill=PatternFill(start_color=bg, end_color=bg, fill_type='solid'),
                              font=Font(color=fg))
            ws.conditional_formatting.add(f'I{rmin}:I{rmax}', rule)

        # Colors for Priority (Col J)
        colors_j = {
            'Critical': ('FF0000', 'FFFFFF'),
            'High': ('FFC7CE', '9C0006'),
            'Medium': ('FFEB9C', '9C6500'),
            'Low': ('C6EFCE', '006100'),
            'N/A': ('D9D9D9', '595959')
        }
        for val, (bg, fg) in colors_j.items():
            rule = CellIsRule(operator='equal', formula=[f'"{val}"'], stopIfTrue=True,
                              fill=PatternFill(start_color=bg, end_color=bg, fill_type='solid'),
                              font=Font(color=fg))
            ws.conditional_formatting.add(f'J{rmin}:J{rmax}', rule)

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

    # Fix row_dimensions because delete_rows breaks them (leaves rows hidden).
    # Re-apply outline levels and unhide all rows, then expand API rows.
    for r in range(10, ws.max_row + 1):
        if r not in ws.row_dimensions:
            ws.row_dimensions[r] = openpyxl.worksheet.dimensions.RowDimension(ws, index=r)
        ws.row_dimensions[r].hidden = False
        
        c3 = ws.cell(row=r, column=3).value
        c2 = ws.cell(row=r, column=2).value
        
        if c3 and str(c3).startswith(('1.1', '1.2', '1.3')):
            ws.row_dimensions[r].outlineLevel = 0
        elif c3 and not c2:
            ws.row_dimensions[r].outlineLevel = 1
        elif c2:
            ws.row_dimensions[r].outlineLevel = 2
        else:
            ws.row_dimensions[r].outlineLevel = 0

        if c2 not in (None, '') and ws.cell(row=r, column=4).value not in (None, ''):
            line_count = max(
                str(ws.cell(row=r, column=c).value or '').count('\n') + 1
                for c in range(5, 9)
            )
            ws.row_dimensions[r].height = min(300.0, max(51.0, line_count * 15.0))

        # Row deletion can shift a header. Reapply the full-band style after
        # the final row layout is known.
        if c3 in section_styles:
            apply_row_style(ws, r, 2, 13, section_styles[c3])
        elif c3 in declared_groups and not c2:
            apply_row_style(ws, r, 2, 13, sty_group)

    # 8. Create the derived RBAC Matrix sheet from the same validated JSON source
    write_rbac_sheet(wb, rbac, case_registry)

    # 9. Save
    wb.save(out_path)
    print(f"✅ Generated {out_path}")
    print(f"   Template: {os.path.basename(tmpl)}")
    print(f"   {len(all_data_ranges)} test cases across {len(sections_in)} sections.")
    print(f"   Row STT from 1 to {stt_counter} (continuous; Testcase IDs remain stable)")
    print(f"   Cover metadata updated (code={project_code}).")

if __name__ == '__main__':
    configure_cli_streams()
    main()
