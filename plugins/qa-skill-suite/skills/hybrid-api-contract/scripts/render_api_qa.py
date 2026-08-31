#!/usr/bin/env python3
"""Render _API_Q&A.md and _API_Q&A.xlsx from an _API_Analysis_Source.json.

Produces the same visual format as static-requirements-analysis render-qa.py:
  - Sheet 1: Q&A (16 columns, colour-coded by status)
  - Sheet 2: Operation Ledger (13 columns)
  - Sheet 3: Review Coverage (18 areas)

Usage:
    python3 render_api_qa.py <API_Analysis_Source.json> <output_dir> <project_name>
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Optional rich Excel output (openpyxl); graceful fallback to JSON-only
# ---------------------------------------------------------------------------
try:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.table import Table, TableStyleInfo
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

# ---------------------------------------------------------------------------
# Constants — matching render-qa.py colour palette
# ---------------------------------------------------------------------------
NAVY  = "17365D"
TEAL  = "0F6B78"
GREEN = "1E7145"
RED   = "C00000"
AMBER = "ED7D31"
GREY  = "808080"
WHITE = "FFFFFF"
LIGHT_BLUE  = "DAEEF3"
LIGHT_GREEN = "EBF1DE"
LIGHT_RED   = "FCE4D6"
LIGHT_GREY  = "F2F2F2"
LIGHT_AMBER = "FFF2CC"

ICON_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")

QUESTION_HEADERS = [
    "Mã câu hỏi", "Decision key", "Loại gap", "Nhóm vấn đề",
    "Module / Endpoint", "Nguồn", "ID bị ảnh hưởng",
    "Điểm chưa rõ / Thiếu", "Rủi ro nếu chưa trả lời", "Câu hỏi",
    "Giả định đề xuất", "Người trả lời", "Mức ưu tiên",
    "Trạng thái", "Câu trả lời", "Nguồn câu trả lời",
]

API_HEADERS = [
    "API ID", "Operation ID", "Protocol", "Method", "Path", "Vai trò",
    "Request contract", "Response contract", "Business side effects",
    "Cleanup", "Requirement IDs", "Coverage", "Nguồn",
]

COVERAGE_HEADERS = [
    "Review Area", "Khu vực (VI)", "Trạng thái", "Bị chặn bởi",
]

AREA_VI = {
    "Scope and actors": "Phạm vi và vai trò",
    "Entry and preconditions": "Điểm vào và điều kiện tiên quyết",
    "Happy flow": "Luồng chính",
    "Alternate and exception flow": "Luồng thay thế và ngoại lệ",
    "Business rules": "Quy tắc nghiệp vụ",
    "States and transitions": "Trạng thái và chuyển trạng thái",
    "Roles and permissions": "Vai trò và phân quyền",
    "Input and validation": "Dữ liệu đầu vào và kiểm tra hợp lệ",
    "Data lifecycle and persistence": "Vòng đời và lưu trữ dữ liệu",
    "API and integration": "API và tích hợp",
    "Error handling and recovery": "Xử lý lỗi và khôi phục",
    "Concurrency and idempotency": "Đồng thời và chống xử lý lặp",
    "Security and privacy": "Bảo mật và quyền riêng tư",
    "Performance and capacity": "Hiệu năng và tải",
    "UI UX and accessibility": "UI UX và khả năng tiếp cận",
    "Audit logging and observability": "Nhật ký kiểm toán và khả năng theo dõi",
    "Compatibility and migration": "Tương thích và chuyển đổi dữ liệu",
    "Testability and acceptance criteria": "Khả năng kiểm thử và tiêu chí chấp nhận",
}

STATUS_VI = {
    "Open": "Mở",
    "Answered": "Đã trả lời",
    "Blocked": "Bị chặn",
    "Cancelled": "Đã huỷ",
    "checked": "Đã review",
    "blocked": "Bị chặn",
    "not_applicable": "Không áp dụng",
}

BASIS_VI = {
    "ambiguous_text": "Văn bản mơ hồ",
    "contradiction": "Mâu thuẫn",
    "missing_required_rule": "Thiếu rule bắt buộc",
    "untestable_acceptance": "Không kiểm thử được",
    "unclear_ownership": "Không rõ chủ sở hữu",
}

PRIORITY_COLOR = {"P0": RED, "P1": AMBER, "P2": GREY, "P3": GREY}
STATUS_COLOR   = {
    "Open": LIGHT_RED,
    "Answered": LIGHT_GREEN,
    "Blocked": LIGHT_AMBER,
    "Cancelled": LIGHT_GREY,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(v: Any) -> str:
    """Strip emoji and convert to string."""
    s = str(v) if v is not None else ""
    return ICON_RE.sub("", s).strip()


def _join(v: Any) -> str:
    if isinstance(v, list):
        return "; ".join(_clean(x) for x in v)
    return _clean(v)


def _safe_name(name: str) -> str:
    return re.sub(r"[^\w\-]", "_", name)


# ---------------------------------------------------------------------------
# Markdown renderer
# ---------------------------------------------------------------------------

def render_markdown(data: dict[str, Any], out_path: Path) -> None:
    lines: list[str] = []
    project = data.get("project", "")
    api_title = data.get("api_title", project)
    total = data["summary"]["total_operations"]
    open_qa = data["summary"]["open_qa"]
    result = data.get("terminal_result", "DONE")

    lines += [
        f"# API Static Analysis — {api_title}",
        "",
        f"**Spec:** {data.get('spec_source', '')}  ",
        f"**Ngày phân tích:** {data.get('analysis_date', '')}  ",
        f"**Phiên bản API:** {data.get('api_version', '')}  ",
        f"**Tổng operation:** {total}  ",
        f"**Câu hỏi mở:** {open_qa}  ",
        f"**Kết quả:** `{result}`",
        "",
        "---",
        "",
    ]

    questions = data.get("questions") or []
    if questions:
        lines += [
            "## Câu hỏi cần làm rõ (Q&A)",
            "",
            "| Mã | Nhóm | Endpoint | Điểm chưa rõ / Thiếu | Câu hỏi | Giả định | Người trả lời | Ưu tiên | Trạng thái |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        for q in questions:
            row = [
                _clean(q.get("id")),
                _clean(q.get("category")),
                _clean(q.get("module_flow")),
                _clean(q.get("ambiguity_gap")),
                _clean(q.get("question")),
                _clean(q.get("proposed_assumption")),
                _clean(q.get("owner")),
                _clean(q.get("priority")),
                STATUS_VI.get(q.get("status", ""), q.get("status", "")),
            ]
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")
    else:
        lines += ["## Câu hỏi cần làm rõ (Q&A)", "", "_Không có gap — spec đầy đủ_", ""]

    lines += ["---", "", "## Operation Ledger", ""]
    lines += [
        "| API ID | Method | Path | Auth | Coverage | Fact status |",
        "|---|---|---|---|---|---|",
    ]
    for op in data.get("api_operations") or []:
        lines.append(
            f"| {op.get('id')} | {op.get('method')} | {op.get('path')} "
            f"| {_join(op.get('roles'))} "
            f"| {op.get('coverage_status')} "
            f"| {op.get('fact_status')} |"
        )
    lines.append("")

    lines += ["---", "", "## Review Coverage", ""]
    lines += ["| Review Area | Trạng thái | Bị chặn bởi |", "|---|---|---|"]
    for rc in data.get("review_coverage") or []:
        area = rc.get("area", "")
        status_vi = STATUS_VI.get(rc.get("status", ""), rc.get("status", ""))
        blocked_by = rc.get("blocked_by") or ""
        lines.append(f"| {AREA_VI.get(area, area)} | {status_vi} | {blocked_by} |")
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Excel renderer
# ---------------------------------------------------------------------------

def _header_fill(hex_color: str) -> "PatternFill":
    return PatternFill("solid", fgColor=hex_color)


def _cell_fill(hex_color: str) -> "PatternFill":
    return PatternFill("solid", fgColor=hex_color)


def _bold_font(color: str = WHITE, size: int = 11) -> "Font":
    return Font(bold=True, color=color, size=size)


def _normal_font(size: int = 10) -> "Font":
    return Font(size=size)


def _thin_border() -> "Border":
    side = Side(style="thin", color="CCCCCC")
    return Border(left=side, right=side, top=side, bottom=side)


def _wrap_align() -> "Alignment":
    return Alignment(wrap_text=True, vertical="top")


def _set_col_widths(ws: Any, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        col_letter = ws.cell(row=1, column=i).column_letter
        ws.column_dimensions[col_letter].width = w


def _write_header_row(ws: Any, headers: list[str], fill_color: str) -> None:
    for col, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = _bold_font(WHITE)
        cell.fill = _header_fill(fill_color)
        cell.border = _thin_border()
        cell.alignment = _wrap_align()


def _write_data_row(ws: Any, row_idx: int, values: list[Any], fill: str | None = None) -> None:
    for col, v in enumerate(values, start=1):
        cell = ws.cell(row=row_idx, column=col, value=str(v) if v is not None else "")
        cell.font = _normal_font()
        if fill:
            cell.fill = _cell_fill(fill)
        cell.border = _thin_border()
        cell.alignment = _wrap_align()


def render_excel(data: dict[str, Any], out_path: Path) -> None:
    if not HAS_OPENPYXL:
        print("[WARN] openpyxl not installed; skipping Excel output", file=sys.stderr)
        return

    wb = Workbook()

    # ---- Sheet 1: Q&A -------------------------------------------------------
    ws_qa = wb.active
    ws_qa.title = "Q&A"
    ws_qa.freeze_panes = "A2"
    ws_qa.row_dimensions[1].height = 30

    _write_header_row(ws_qa, QUESTION_HEADERS, NAVY)

    questions = data.get("questions") or []
    for row_idx, q in enumerate(questions, start=2):
        status = q.get("status", "Open")
        priority = q.get("priority", "P2")
        row_fill = STATUS_COLOR.get(status, LIGHT_GREY)

        values = [
            _clean(q.get("id")),
            _clean(q.get("decision_key")),
            BASIS_VI.get(q.get("basis", ""), q.get("basis", "")),
            _clean(q.get("category")),
            _clean(q.get("module_flow")),
            _clean(q.get("source_ref")),
            _join(q.get("impact_ids")),
            _clean(q.get("ambiguity_gap")),
            _clean(q.get("risk")),
            _clean(q.get("question")),
            _clean(q.get("proposed_assumption")),
            _clean(q.get("owner")),
            priority,
            STATUS_VI.get(status, status),
            _clean(q.get("answer")),
            _clean(q.get("answer_source_ref")),
        ]
        _write_data_row(ws_qa, row_idx, values, fill=row_fill)

        # Priority cell colour override
        priority_cell = ws_qa.cell(row=row_idx, column=13)
        p_color = PRIORITY_COLOR.get(priority)
        if p_color:
            priority_cell.fill = _cell_fill(p_color)
            priority_cell.font = Font(bold=True, color=WHITE, size=10)

    _set_col_widths(ws_qa, [12, 35, 22, 18, 28, 35, 18, 45, 38, 50, 45, 15, 10, 14, 45, 35])

    # ---- Sheet 2: Operation Ledger ------------------------------------------
    ws_op = wb.create_sheet("Operation Ledger")
    ws_op.freeze_panes = "A2"
    ws_op.row_dimensions[1].height = 30

    _write_header_row(ws_op, API_HEADERS, TEAL)

    for row_idx, op in enumerate(data.get("api_operations") or [], start=2):
        fact = op.get("fact_status", "verified")
        row_fill = (
            LIGHT_RED if fact == "unresolved"
            else LIGHT_GREEN if fact == "verified"
            else LIGHT_AMBER
        )
        values = [
            op.get("id"),
            op.get("operation_id"),
            op.get("protocol"),
            op.get("method"),
            op.get("path"),
            _join(op.get("roles")),
            _join(op.get("request_contract")),
            _join(op.get("response_contract")),
            _join(op.get("business_side_effects")),
            op.get("cleanup"),
            _join(op.get("requirement_ids")),
            op.get("coverage_status"),
            op.get("source_ref"),
        ]
        _write_data_row(ws_op, row_idx, values, fill=row_fill)

    _set_col_widths(ws_op, [10, 30, 10, 8, 35, 20, 35, 45, 40, 22, 18, 14, 40])

    # ---- Sheet 3: Review Coverage -------------------------------------------
    ws_rc = wb.create_sheet("Review Coverage")
    ws_rc.freeze_panes = "A2"
    ws_rc.row_dimensions[1].height = 30

    _write_header_row(ws_rc, COVERAGE_HEADERS, GREEN)

    for row_idx, rc in enumerate(data.get("review_coverage") or [], start=2):
        status = rc.get("status", "checked")
        row_fill = (
            LIGHT_GREEN if status == "checked"
            else LIGHT_GREY if status == "not_applicable"
            else LIGHT_AMBER
        )
        area = rc.get("area", "")
        values = [
            area,
            AREA_VI.get(area, area),
            STATUS_VI.get(status, status),
            rc.get("blocked_by") or "",
        ]
        _write_data_row(ws_rc, row_idx, values, fill=row_fill)

    _set_col_widths(ws_rc, [35, 42, 18, 18])

    # ---- Summary tab ---------------------------------------------------------
    ws_sum = wb.create_sheet("Summary")
    _write_header_row(ws_sum, ["Thông tin", "Giá trị"], NAVY)
    summary_rows = [
        ("Project", data.get("project", "")),
        ("API Title", data.get("api_title", "")),
        ("API Version", data.get("api_version", "")),
        ("Spec Source", data.get("spec_source", "")),
        ("Ngày phân tích", data.get("analysis_date", "")),
        ("Tổng operation", str(data["summary"]["total_operations"])),
        ("Tổng câu hỏi", str(data["summary"]["total_qa_items"])),
        ("Câu hỏi mở", str(data["summary"]["open_qa"])),
        ("Kết quả terminal", data.get("terminal_result", "")),
    ]
    for r_idx, (k, v) in enumerate(summary_rows, start=2):
        ws_sum.cell(row=r_idx, column=1, value=k).font = _bold_font(NAVY, size=10)
        ws_sum.cell(row=r_idx, column=1).fill = _cell_fill(LIGHT_GREY)
        ws_sum.cell(row=r_idx, column=1).border = _thin_border()
        ws_sum.cell(row=r_idx, column=2, value=v).border = _thin_border()
    _set_col_widths(ws_sum, [28, 55])

    # Move Summary to first position
    wb.move_sheet("Summary", offset=-wb.index(ws_sum))

    wb.save(str(out_path))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    if len(sys.argv) < 4:
        print(
            "Usage: render_api_qa.py <API_Analysis_Source.json> <output_dir> <project_name>",
            file=sys.stderr,
        )
        return 2

    source_path = Path(sys.argv[1])
    output_dir  = Path(sys.argv[2])
    project     = sys.argv[3]

    try:
        data = json.loads(source_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Error reading source: {exc}", file=sys.stderr)
        return 2

    output_dir.mkdir(parents=True, exist_ok=True)
    safe = _safe_name(project)

    md_path   = output_dir / f"{safe}_API_Q&A.md"
    xlsx_path = output_dir / f"{safe}_API_Q&A.xlsx"

    render_markdown(data, md_path)
    print(f"Markdown : {md_path}")

    render_excel(data, xlsx_path)
    if HAS_OPENPYXL:
        print(f"Excel    : {xlsx_path}")

    result = data.get("terminal_result", "DONE")
    open_qa = data["summary"]["open_qa"]
    total   = data["summary"]["total_operations"]

    print(f"\nResult   : {result}")
    print(f"Operations: {total}  |  Open Q&A: {open_qa}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
