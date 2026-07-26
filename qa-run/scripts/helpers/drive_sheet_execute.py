#!/usr/bin/env python3
"""drive_sheet_execute.py — Google Sheet Testcase Reader & Batch Updater

Reads testcases from a Google Sheet (Test cases_App sheet or active sheet),
parses headers, and provides batch update capabilities for Result, Priority, Note, Date, Tester.

Usage:
  # Read testcases from Sheet URL or ID
  python3 drive_sheet_execute.py read <SHEET_URL_OR_ID> [--sheet-name "Test cases_App"]

  # Update testcase execution results from JSON file or stdin
  python3 drive_sheet_execute.py update <SHEET_URL_OR_ID> --updates updates.json [--sheet-name "Test cases_App"]
"""

import json
import os
import re
import sys
import argparse
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

# Insert current script directory into sys.path to load drive_common
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import drive_common
from googleapiclient.discovery import build

VALID_RESULTS = {"Pass", "Fail", "N/A", "Untest", "Untested"}
VALID_PRIORITIES = {"Critical", "High", "Medium", "Low"}
SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOCUMENT_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

def is_local_excel(url_or_id):
    return url_or_id.endswith('.xlsx') or os.path.isfile(url_or_id)

def extract_spreadsheet_id(url_or_id):
    """Extract 44-character spreadsheet ID from URL or return raw ID/local path."""
    if is_local_excel(url_or_id):
        return os.path.abspath(url_or_id)
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url_or_id)
    if match:
        return match.group(1)
    if re.match(r"^[a-zA-Z0-9-_]{20,}$", url_or_id):
        return url_or_id
    raise ValueError(f"Invalid Google Sheet URL or ID: {url_or_id}")

def get_sheets_service():
    client_path = drive_common.resolve_existing_path(drive_common.CLIENT_CANDIDATES)
    creds = None
    if os.path.isfile(drive_common.PYTHON_TOKEN_PATH):
        try:
            from google.oauth2.credentials import Credentials
            creds = Credentials.from_authorized_user_file(drive_common.PYTHON_TOKEN_PATH, drive_common.SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        creds = drive_common._try_build_creds_from_mcp_token(client_path)
        if creds and creds.valid:
            drive_common.save_token(creds)

    if not creds or not creds.valid:
        raise SystemExit("Failed to authenticate Google Sheets API. Run drive_common login first.")

    return build("sheets", "v4", credentials=creds)

def sanitize_note(note_text):
    """Ensure note context is non-technical, human-readable, and free of raw stacktraces/codes."""
    if not note_text:
        return ""
    text = str(note_text).strip()

    # Remove raw stacktraces or HTTP error codes alone
    text = re.sub(r"Internal Server Error:.*", "Hệ thống gặp lỗi phía máy chủ", text, flags=re.IGNORECASE)
    text = re.sub(r"HTTP\s*(?:status\s*)?[45]\d\d.*", "Giao diện không nhận được phản hồi từ hệ thống", text, flags=re.IGNORECASE)
    text = re.sub(r"NullPointerException.*", "Lỗi dữ liệu hệ thống", text, flags=re.IGNORECASE)
    text = re.sub(r"at\s+[a-zA-Z0-9_.]+\([a-zA-Z0-9_.]+:\d+\)", "", text) # java stacklines

    # Remove trailing dots or emojis if any
    text = re.sub(r"[\u1F300-\u1FAFF\u2600-\u27BF]", "", text).strip()
    return text.rstrip(".")

def normalize_result(value):
    normalized = str(value or "Untest").strip().lower()
    if normalized == "pass":
        return "Pass"
    if normalized == "fail":
        return "Fail"
    if normalized in ("n/a", "na"):
        return "N/A"
    if normalized in ("untest", "untested"):
        return "Untest"
    return "Untest"

def normalize_priority(value):
    normalized = str(value or "Medium").strip().lower()
    if normalized == "critical":
        return "Critical"
    if normalized == "high":
        return "High"
    if normalized == "low":
        return "Low"
    return "Medium"

def parse_header_indices(header_row):
    """Locate column 0-indexed positions for testcase fields."""
    mapping = {}
    for idx, cell in enumerate(header_row):
        val = str(cell).strip().lower()
        if "scenario id" in val: mapping["scenario_id"] = idx
        elif "scenario name" in val or "scenario" in val: mapping["scenario_name"] = idx
        elif "test case id" in val or "testcase id" in val or "tc id" in val: mapping["testcase_id"] = idx
        elif "description" in val: mapping["description"] = idx
        elif "pre-condition" in val or "precondition" in val: mapping["precondition"] = idx
        elif "procedure" in val or "steps" in val: mapping["procedure"] = idx
        elif "expected" in val: mapping["expected"] = idx
        elif "results" == val or "result" == val or "status" == val: mapping["result"] = idx
        elif "priority" == val: mapping["priority"] = idx
        elif "date" == val: mapping["date"] = idx
        elif "tester" == val: mapping["tester"] = idx
        elif "notes" == val or "note" == val: mapping["note"] = idx
    return mapping

def is_testcase_header(mapping):
    """Reject metadata rows such as a standalone DESCRIPTION label."""
    keys = set(mapping)
    return (
        "testcase_id" in keys
        and len(keys) >= 3
        and bool(keys.intersection({"description", "procedure", "expected"}))
    )

def find_header(rows):
    for idx, row in enumerate(rows):
        mapping = parse_header_indices(row)
        if is_testcase_header(mapping):
            return idx, mapping
    return -1, {}

def choose_testcase_sheet(sheet_names, requested=None):
    if requested:
        for name in sheet_names:
            if name.lower() == requested.lower():
                return name
        raise ValueError(f"Sheet not found: {requested}")

    for name in sheet_names:
        if name.lower() == "test cases_app":
            return name
    for name in sheet_names:
        if "test cases" in name.lower():
            return name
    return sheet_names[0]

def read_local_excel(filepath, sheet_name=None):
    import openpyxl
    wb = openpyxl.load_workbook(filepath, data_only=True)
    target_sheet = choose_testcase_sheet(wb.sheetnames, sheet_name)
    ws = wb[target_sheet]
    rows = []
    for r in ws.iter_rows(values_only=True):
        rows.append([str(c) if c is not None else "" for c in r])

    header_idx, col_map = find_header(rows)

    if header_idx == -1:
        raise ValueError(
            f"Testcase header not found in sheet '{target_sheet}'; "
            "expected Test case ID plus Description/Procedure/Expected Results"
        )

    testcases = []
    current_module = "General"
    current_group = "General"

    for r_idx in range(header_idx + 1, len(rows)):
        row = rows[r_idx]
        def get_col(key):
            idx = col_map.get(key)
            if idx is not None and idx < len(row):
                return str(row[idx]).strip()
            return ""

        col_c = get_col("scenario_name") or (row[2] if len(row) > 2 else "")
        if col_c and not get_col("testcase_id") and not get_col("description"):
            if "1." in col_c or "USER INTERFACE" in col_c.upper() or "FUNCTION" in col_c.upper():
                current_module = col_c
                current_group = "General"
            else:
                current_group = col_c
            continue

        tc_id = get_col("testcase_id")
        if not tc_id:
            continue
        desc = get_col("description")

        testcases.append({
            "row_number": r_idx + 1,
            "module": current_module,
            "group": current_group,
            "scenario_id": get_col("scenario_id"),
            "scenario_name": get_col("scenario_name"),
            "testcase_id": tc_id,
            "description": desc,
            "precondition": get_col("precondition"),
            "procedure": get_col("procedure"),
            "expected": get_col("expected"),
            "result": get_col("result") or "Untest",
            "priority": get_col("priority") or "Medium",
            "date": get_col("date"),
            "tester": get_col("tester"),
            "note": get_col("note"),
        })

    return {
        "spreadsheet_id": filepath,
        "sheet_name": target_sheet,
        "header_row": header_idx + 1,
        "column_mapping": col_map,
        "total_testcases": len(testcases),
        "testcases": testcases,
    }

def column_letter(column_index):
    letters = ""
    current = column_index + 1
    while current:
        current, remainder = divmod(current - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters

def resolve_worksheet_archive_path(archive, sheet_name):
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rel_id = None
    for sheet in workbook_root.findall(f".//{{{SPREADSHEET_NS}}}sheet"):
        if sheet.attrib.get("name", "").lower() == sheet_name.lower():
            rel_id = sheet.attrib.get(f"{{{DOCUMENT_REL_NS}}}id")
            break
    if not rel_id:
        raise ValueError(f"Sheet not found in workbook archive: {sheet_name}")

    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = None
    for relationship in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship"):
        if relationship.attrib.get("Id") == rel_id:
            target = relationship.attrib.get("Target")
            break
    if not target:
        raise ValueError(f"Worksheet relationship not found: {rel_id}")

    normalized = target.lstrip("/")
    return normalized if normalized.startswith("xl/") else f"xl/{normalized}"

def set_inline_string_cell(sheet_root, coordinate, row_number, value):
    sheet_data = sheet_root.find(f"{{{SPREADSHEET_NS}}}sheetData")
    if sheet_data is None:
        raise ValueError("Worksheet XML has no sheetData")

    row = sheet_data.find(f"{{{SPREADSHEET_NS}}}row[@r='{row_number}']")
    if row is None:
        row = ET.SubElement(sheet_data, f"{{{SPREADSHEET_NS}}}row", {"r": str(row_number)})

    cell = row.find(f"{{{SPREADSHEET_NS}}}c[@r='{coordinate}']")
    if cell is None:
        cell = ET.SubElement(row, f"{{{SPREADSHEET_NS}}}c", {"r": coordinate})

    for child in list(cell):
        cell.remove(child)
    cell.set("t", "inlineStr")
    inline = ET.SubElement(cell, f"{{{SPREADSHEET_NS}}}is")
    text = ET.SubElement(inline, f"{{{SPREADSHEET_NS}}}t")
    text.text = str(value or "")

def patch_local_excel_cells(filepath, sheet_name, changes):
    """Patch only target cells so formula cached values elsewhere remain intact."""
    source_path = os.path.abspath(filepath)
    source_mode = os.stat(source_path).st_mode
    temp_handle, temp_path = tempfile.mkstemp(
        prefix=".sheet-update-",
        suffix=".xlsx",
        dir=os.path.dirname(source_path),
    )
    os.close(temp_handle)

    try:
        with zipfile.ZipFile(source_path, "r") as source_archive:
            worksheet_path = resolve_worksheet_archive_path(source_archive, sheet_name)
            sheet_root = ET.fromstring(source_archive.read(worksheet_path))
            for coordinate, row_number, value in changes:
                set_inline_string_cell(sheet_root, coordinate, row_number, value)
            updated_sheet_xml = ET.tostring(
                sheet_root,
                encoding="utf-8",
                xml_declaration=True,
            )

            with zipfile.ZipFile(temp_path, "w") as target_archive:
                for item in source_archive.infolist():
                    payload = (
                        updated_sheet_xml
                        if item.filename == worksheet_path
                        else source_archive.read(item.filename)
                    )
                    target_archive.writestr(item, payload)
        os.chmod(temp_path, source_mode)
        os.replace(temp_path, source_path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

def update_local_excel(filepath, updates, sheet_name=None):
    data_info = read_local_excel(filepath, sheet_name)
    target_sheet = data_info["sheet_name"]
    col_map = data_info["column_mapping"]
    tc_by_row = {tc["row_number"]: tc for tc in data_info["testcases"]}

    today_str = datetime.now().strftime("%Y-%m-%d")
    updated_count = 0
    errors = []
    changes = []

    for up in updates:
        row_num = up.get("row_number")
        if not row_num or row_num not in tc_by_row:
            errors.append(f"Testcase not found for update: row={row_num}")
            continue

        values = {
            "result": normalize_result(up.get("result")),
            "priority": normalize_priority(up.get("priority")),
            "date": up.get("date", today_str),
            "tester": up.get("tester", "QA Agent"),
            "note": sanitize_note(up.get("note", "")),
        }
        if values["result"] in ("Fail", "Untest", "N/A") and not values["note"]:
            values["note"] = f"Thực thi {values['result']}: chưa đạt kết quả kỳ vọng"

        for key, value in values.items():
            if key not in col_map:
                continue
            coordinate = f"{column_letter(col_map[key])}{row_num}"
            changes.append((coordinate, row_num, value))
        updated_count += 1

    if changes:
        patch_local_excel_cells(filepath, target_sheet, changes)
    return {"status": "success", "updated_count": updated_count, "errors": errors}

def read_testcases(spreadsheet_id, sheet_name=None):
    if is_local_excel(spreadsheet_id):
        return read_local_excel(spreadsheet_id, sheet_name)
    service = get_sheets_service()
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = meta.get("sheets", [])
    if not sheets:
        raise ValueError("Spreadsheet has no sheets")

    target_sheet = choose_testcase_sheet(
        [sheet["properties"]["title"] for sheet in sheets],
        sheet_name,
    )

    range_name = f"'{target_sheet}'!A1:Z2000"
    res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    rows = res.get("values", [])

    if not rows:
        return {"sheet_name": target_sheet, "testcases": []}

    # Find header row
    header_idx, col_map = find_header(rows)

    if header_idx == -1:
        # Default standard template mapping (B=Scenario ID ... I=Result, J=Priority, K=Date, L=Tester, M=Notes)
        col_map = {
            "scenario_id": 1, "scenario_name": 2, "testcase_id": 3,
            "description": 4, "precondition": 5, "procedure": 6,
            "expected": 7, "result": 8, "priority": 9, "date": 10,
            "tester": 11, "note": 12
        }
        header_idx = 8 # row 9

    testcases = []
    current_module = "General"
    current_group = "General"

    for r_idx in range(header_idx + 1, len(rows)):
        row = rows[r_idx]
        def get_col(key):
            idx = col_map.get(key)
            if idx is not None and idx < len(row):
                return str(row[idx]).strip()
            return ""

        # Section header check (e.g. "1.1. USER INTERFACE" or "GROUP: LOGIN")
        col_c = get_col("scenario_name") or (row[2] if len(row) > 2 else "")
        if col_c and not get_col("testcase_id") and not get_col("description"):
            if "1." in col_c or "USER INTERFACE" in col_c.upper() or "FUNCTION" in col_c.upper():
                current_module = col_c
                current_group = "General"
            else:
                current_group = col_c
            continue

        tc_id = get_col("testcase_id")
        if not tc_id:
            continue
        desc = get_col("description")

        testcases.append({
            "row_number": r_idx + 1, # 1-indexed for Sheet
            "module": current_module,
            "group": current_group,
            "scenario_id": get_col("scenario_id"),
            "scenario_name": get_col("scenario_name"),
            "testcase_id": tc_id,
            "description": desc,
            "precondition": get_col("precondition"),
            "procedure": get_col("procedure"),
            "expected": get_col("expected"),
            "result": get_col("result") or "Untest",
            "priority": get_col("priority") or "Medium",
            "date": get_col("date"),
            "tester": get_col("tester"),
            "note": get_col("note"),
        })

    return {
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": target_sheet,
        "header_row": header_idx + 1,
        "column_mapping": col_map,
        "total_testcases": len(testcases),
        "testcases": testcases,
    }

def update_testcase_results(spreadsheet_id, updates, sheet_name=None):
    """Batch update execution results for specified row numbers in the sheet or local excel."""
    if is_local_excel(spreadsheet_id):
        return update_local_excel(spreadsheet_id, updates, sheet_name)
    data_info = read_testcases(spreadsheet_id, sheet_name)
    target_sheet = data_info["sheet_name"]
    col_map = data_info["column_mapping"]
    tc_by_id = {tc["testcase_id"]: tc for tc in data_info["testcases"] if tc["testcase_id"]}
    tc_by_row = {tc["row_number"]: tc for tc in data_info["testcases"]}

    service = get_sheets_service()
    value_ranges = []
    today_str = datetime.now().strftime("%Y-%m-%d")

    updated_count = 0
    errors = []

    for up in updates:
        row_num = up.get("row_number")
        tc_id = up.get("testcase_id")
        target_tc = None
        if row_num and row_num in tc_by_row:
            target_tc = tc_by_row[row_num]
        elif tc_id and tc_id in tc_by_id:
            target_tc = tc_by_id[tc_id]

        if not target_tc:
            errors.append(f"Testcase not found for update: row={row_num}, id={tc_id}")
            continue

        r_num = target_tc["row_number"]

        # Validate Result value
        res_val = normalize_result(up.get("result"))

        # Validate Priority value
        prio_val = normalize_priority(up.get("priority"))

        # Note sanitization
        note_val = sanitize_note(up.get("note", ""))
        if res_val in ("Fail", "Untest", "N/A") and not note_val:
            note_val = f"Thực thi {res_val}: chưa đạt kết quả kỳ vọng"

        tester_val = up.get("tester", "QA Agent")
        date_val = up.get("date", today_str)

        def col_letter(col_idx):
            return chr(65 + col_idx)

        # Result (Column I / idx 8)
        if "result" in col_map:
            c_let = col_letter(col_map["result"])
            value_ranges.append({"range": f"'{target_sheet}'!{c_let}{r_num}", "values": [[res_val]]})

        # Priority (Column J / idx 9)
        if "priority" in col_map:
            c_let = col_letter(col_map["priority"])
            value_ranges.append({"range": f"'{target_sheet}'!{c_let}{r_num}", "values": [[prio_val]]})

        # Date (Column K / idx 10)
        if "date" in col_map:
            c_let = col_letter(col_map["date"])
            value_ranges.append({"range": f"'{target_sheet}'!{c_let}{r_num}", "values": [[date_val]]})

        # Tester (Column L / idx 11)
        if "tester" in col_map:
            c_let = col_letter(col_map["tester"])
            value_ranges.append({"range": f"'{target_sheet}'!{c_let}{r_num}", "values": [[tester_val]]})

        # Note (Column M / idx 12)
        if "note" in col_map:
            c_let = col_letter(col_map["note"])
            value_ranges.append({"range": f"'{target_sheet}'!{c_let}{r_num}", "values": [[note_val]]})

        updated_count += 1

    if value_ranges:
        body = {"valueInputOption": "USER_ENTERED", "data": value_ranges}
        service.spreadsheets().values().batchUpdate(spreadsheetId=spreadsheet_id, body=body).execute()

    return {
        "spreadsheet_id": spreadsheet_id,
        "sheet_name": target_sheet,
        "updated_count": updated_count,
        "errors": errors
    }

def main():
    parser = argparse.ArgumentParser(description="Google Sheet Testcase Execution CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    read_p = subparsers.add_parser("read")
    read_p.add_argument("sheet_url", help="Google Sheet URL or Spreadsheet ID")
    read_p.add_argument("--sheet-name", help="Specific tab/sheet name")

    update_p = subparsers.add_parser("update")
    update_p.add_argument("sheet_url", help="Google Sheet URL or Spreadsheet ID")
    update_p.add_argument("--updates", help="Path to JSON file with updates list")
    update_p.add_argument("--sheet-name", help="Specific tab/sheet name")

    args = parser.parse_args()

    spreadsheet_id = extract_spreadsheet_id(args.sheet_url)

    if args.command == "read":
        data = read_testcases(spreadsheet_id, args.sheet_name)
        print(json.dumps(data, indent=2, ensure_ascii=False))

    elif args.command == "update":
        if args.updates:
            with open(args.updates, "r", encoding="utf-8") as f:
                updates = json.load(f)
        else:
            updates = json.load(sys.stdin)
        res = update_testcase_results(spreadsheet_id, updates, args.sheet_name)
        print(json.dumps(res, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
