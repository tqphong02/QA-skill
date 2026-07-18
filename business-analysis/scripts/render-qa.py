#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ICON_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")
SENSITIVE_KEYS = {
    "password", "token", "access_token", "refresh_token", "api_key", "apikey",
    "client_secret", "cookie", "authorization", "secret",
}
REVIEW_AREAS = [
    "Scope and actors",
    "Entry and preconditions",
    "Happy flow",
    "Alternate and exception flow",
    "Business rules",
    "States and transitions",
    "Roles and permissions",
    "Input and validation",
    "Data lifecycle and persistence",
    "API and integration",
    "Error handling and recovery",
    "Concurrency and idempotency",
    "Security and privacy",
    "Performance and capacity",
    "UI UX and accessibility",
    "Audit logging and observability",
    "Compatibility and migration",
    "Testability and acceptance criteria",
]
QUESTION_HEADERS = [
    "Question ID",
    "Category",
    "Module / Flow",
    "Source Reference",
    "Ambiguity / Gap",
    "Risk if unresolved",
    "Question",
    "Proposed Assumption",
    "Owner",
    "Priority",
    "Status",
    "Answer",
]


def fail(message):
    raise SystemExit(message)


def clean(value, field="content"):
    text = str(value or "").strip()
    if ICON_RE.search(text):
        fail(f"{field} must not contain emoji or icons")
    return "\n".join(line.rstrip().rstrip(".") for line in text.splitlines())


def is_placeholder(value):
    text = str(value or "").strip()
    return not text or bool(re.fullmatch(r"<[^<>]+>|\[?redacted\]?", text, re.I))


def reject_secrets(value, label="root"):
    if isinstance(value, list):
        for index, item in enumerate(value):
            reject_secrets(item, f"{label}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            current = f"{label}.{key}"
            if key.lower() in SENSITIVE_KEYS and not is_placeholder(item):
                fail(f"{current} must not contain a real credential")
            reject_secrets(item, current)


def slugify(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return text or "business"


def normalize_questions(items):
    questions = []
    seen = set()
    for index, raw in enumerate(items or [], 1):
        item = dict(raw)
        qid = clean(item.get("id") or f"QA-{index:03d}", f"questions[{index}].id")
        if qid in seen:
            fail(f"Duplicate question ID: {qid}")
        seen.add(qid)
        item["id"] = qid
        item["priority"] = clean(item.get("priority") or "P2", f"{qid}.priority").upper()
        item["status"] = clean(item.get("status") or "Open", f"{qid}.status").title()
        if item["priority"] not in {"P0", "P1", "P2", "P3"}:
            fail(f"{qid}.priority must be P0, P1, P2 or P3")
        if item["status"] not in {"Open", "Answered", "Blocked", "Cancelled"}:
            fail(f"{qid}.status must be Open, Answered, Blocked or Cancelled")
        if not clean(item.get("question"), f"{qid}.question"):
            fail(f"{qid}.question is required")
        if item["status"] == "Answered" and not clean(item.get("answer"), f"{qid}.answer"):
            fail(f"{qid}.answer is required when status is Answered")
        questions.append(item)
    return questions


def validate(data):
    for field in ["project", "scope", "analysis_date", "source_markdown", "review_coverage", "modules", "questions"]:
        if field not in data or data[field] in (None, ""):
            fail(f"Missing required field: {field}")
    if not isinstance(data["source_markdown"], list) or not data["source_markdown"]:
        fail("source_markdown must be a non-empty list")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(data["analysis_date"])):
        fail("analysis_date must use YYYY-MM-DD")
    coverage = data["review_coverage"]
    if not isinstance(coverage, list):
        fail("review_coverage must be a list")
    area_map = {item.get("area"): item for item in coverage if isinstance(item, dict)}
    missing = [area for area in REVIEW_AREAS if area not in area_map]
    extra = [area for area in area_map if area not in REVIEW_AREAS]
    if missing or extra:
        fail(f"Review coverage mismatch; missing={missing}; extra={extra}")
    for area, item in area_map.items():
        status = str(item.get("status") or "").lower()
        if status not in {"checked", "blocked", "not_applicable"}:
            fail(f"{area}.status must be checked, blocked or not_applicable")
        if status in {"blocked", "not_applicable"} and not clean(item.get("notes"), f"{area}.notes"):
            fail(f"{area}.notes is required for {status}")
    if not isinstance(data["modules"], list):
        fail("modules must be a list")
    reject_secrets(data)
    return normalize_questions(data["questions"])


def md_cell(value):
    return clean(value).replace("|", "\\|").replace("\n", "<br>") or ""


def question_row(item):
    return [
        item["id"],
        clean(item.get("category")),
        clean(item.get("module_flow")),
        clean(item.get("source_ref")),
        clean(item.get("ambiguity_gap")),
        clean(item.get("risk")),
        clean(item.get("question")),
        clean(item.get("proposed_assumption")),
        clean(item.get("owner")),
        item["priority"],
        item["status"],
        clean(item.get("answer")),
    ]


def write_markdown(data, questions, output_path):
    lines = [
        f"# Business Q&A — {clean(data['project'], 'project')}",
        "",
        "## Analysis metadata",
        "",
        f"- Project: {clean(data['project'])}",
        f"- Scope: {clean(data['scope'])}",
        f"- Analysis date: {clean(data['analysis_date'])}",
        f"- Sources: {', '.join(clean(item) for item in data['source_markdown'])}",
        "",
        "## Executive summary",
        "",
        clean(data.get("executive_summary") or "No confirmed summary"),
        "",
        "## Review coverage",
        "",
        "| Area | Status | Notes | Source reference | Question IDs |",
        "|---|---|---|---|---|",
    ]
    for item in data["review_coverage"]:
        ids = ", ".join(item.get("question_ids") or [])
        lines.append(
            f"| {md_cell(item.get('area'))} | {md_cell(item.get('status'))} | "
            f"{md_cell(item.get('notes'))} | {md_cell(item.get('source_ref'))} | {md_cell(ids)} |"
        )
    lines.extend(["", f"## Questions ({len(questions)})", ""])
    if not questions:
        lines.extend(["No clarification question identified", ""])
    for item in questions:
        lines.extend([
            f"### {item['id']} — {clean(item.get('category') or 'General')}",
            "",
            f"- Module / Flow: {clean(item.get('module_flow'))}",
            f"- Source reference: {clean(item.get('source_ref'))}",
            f"- Ambiguity / Gap: {clean(item.get('ambiguity_gap'))}",
            f"- Risk if unresolved: {clean(item.get('risk'))}",
            f"- Question: {clean(item.get('question'))}",
            f"- Proposed assumption: {clean(item.get('proposed_assumption'))}",
            f"- Owner: {clean(item.get('owner'))}",
            f"- Priority: {item['priority']}",
            f"- Status: {item['status']}",
            f"- Answer: {clean(item.get('answer'))}",
            "",
        ])
    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def apply_header(ws, row=1):
    fill = PatternFill("solid", fgColor="1F4E78")
    for cell in ws[row]:
        cell.fill = fill
        cell.font = Font(color="FFFFFF", bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def write_excel(data, questions, output_path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Q&A"
    ws.append(QUESTION_HEADERS)
    for item in questions:
        ws.append(question_row(item))
    apply_header(ws)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:L{max(ws.max_row, 1)}"
    widths = [14, 26, 28, 30, 38, 38, 48, 38, 16, 10, 14, 42]
    for index, width in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + index)].width = width
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    priority_dv = DataValidation(type="list", formula1='"P0,P1,P2,P3"', allow_blank=False)
    status_dv = DataValidation(type="list", formula1='"Open,Answered,Blocked,Cancelled"', allow_blank=False)
    ws.add_data_validation(priority_dv)
    ws.add_data_validation(status_dv)
    priority_dv.add(f"J2:J{max(ws.max_row, 1000)}")
    status_dv.add(f"K2:K{max(ws.max_row, 1000)}")
    red_fill = PatternFill("solid", fgColor="F4CCCC")
    yellow_fill = PatternFill("solid", fgColor="FFF2CC")
    green_fill = PatternFill("solid", fgColor="D9EAD3")
    ws.conditional_formatting.add(f"A2:L{max(ws.max_row, 2)}", FormulaRule(formula=['$J2="P0"'], fill=red_fill))
    ws.conditional_formatting.add(f"A2:L{max(ws.max_row, 2)}", FormulaRule(formula=['$K2="Open"'], fill=yellow_fill))
    ws.conditional_formatting.add(f"A2:L{max(ws.max_row, 2)}", FormulaRule(formula=['$K2="Answered"'], fill=green_fill))

    coverage = wb.create_sheet("Review Coverage")
    coverage.append(["Area", "Status", "Notes", "Source Reference", "Question IDs"])
    for item in data["review_coverage"]:
        coverage.append([
            clean(item.get("area")), clean(item.get("status")), clean(item.get("notes")),
            clean(item.get("source_ref")), ", ".join(item.get("question_ids") or []),
        ])
    apply_header(coverage)
    coverage.freeze_panes = "A2"
    coverage.auto_filter.ref = f"A1:E{coverage.max_row}"
    for letter, width in zip("ABCDE", [34, 18, 52, 36, 24]):
        coverage.column_dimensions[letter].width = width
    for row in coverage.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    overview = wb.create_sheet("Overview", 0)
    overview.append(["Field", "Value"])
    overview.append(["Project", clean(data["project"])])
    overview.append(["Scope", clean(data["scope"])])
    overview.append(["Analysis date", clean(data["analysis_date"])])
    overview.append(["Sources", "\n".join(clean(item) for item in data["source_markdown"])])
    overview.append(["Total questions", len(questions)])
    overview.append(["Open", '=COUNTIF(\'Q&A\'!K:K,"Open")'])
    overview.append(["Answered", '=COUNTIF(\'Q&A\'!K:K,"Answered")'])
    overview.append(["Blocked", '=COUNTIF(\'Q&A\'!K:K,"Blocked")'])
    apply_header(overview)
    overview.column_dimensions["A"].width = 24
    overview.column_dimensions["B"].width = 80
    for row in overview.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    wb.save(output_path)


def check_outputs(md_path, xlsx_path):
    markdown = md_path.read_text(encoding="utf-8")
    md_ids = re.findall(r"^### (QA-[A-Za-z0-9_-]+)\s+—", markdown, flags=re.M)
    wb = load_workbook(xlsx_path, read_only=True, data_only=False)
    if "Q&A" not in wb.sheetnames or "Review Coverage" not in wb.sheetnames:
        fail("Q&A workbook is missing required sheets")
    ws = wb["Q&A"]
    headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    if headers != QUESTION_HEADERS:
        fail("Q&A workbook headers do not match the contract")
    xlsx_ids = [row[0] for row in ws.iter_rows(min_row=2, values_only=True) if row[0]]
    if md_ids != xlsx_ids:
        fail(f"Question ID mismatch: markdown={md_ids}, excel={xlsx_ids}")
    print(f"Q&A PASS: {md_path} and {xlsx_path} with {len(md_ids)} matching IDs")


def main():
    args = sys.argv[1:]
    if args and args[0] == "--check":
        if len(args) != 3:
            fail("Usage: render-qa.py --check <qa.md> <qa.xlsx>")
        check_outputs(Path(args[1]).resolve(), Path(args[2]).resolve())
        return
    if len(args) < 2:
        fail("Usage: render-qa.py <analysis.json> <output-dir> [base-name]")
    input_path = Path(args[0]).resolve()
    output_dir = Path(args[1]).resolve()
    data = json.loads(input_path.read_text(encoding="utf-8"))
    questions = validate(data)
    base = args[2] if len(args) > 2 else slugify(data["project"])
    output_dir.mkdir(parents=True, exist_ok=True)
    md_path = output_dir / f"{base}-business-qa.md"
    xlsx_path = output_dir / f"{base}-business-qa.xlsx"
    write_markdown(data, questions, md_path)
    write_excel(data, questions, xlsx_path)
    check_outputs(md_path, xlsx_path)
    print(f"Q&A MARKDOWN WRITTEN: {md_path}")
    print(f"Q&A EXCEL WRITTEN: {xlsx_path}")


if __name__ == "__main__":
    main()
