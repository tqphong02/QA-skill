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
from datetime import datetime
from pathlib import Path

# ─── Canonical sheet schema ───────────────────────────────────────────────────
# Single source of truth: dynamic-testing/web-exploratory/references/TESTCASE_SHEET_SCHEMA.json
# AI and scripts read this file instead of scanning Excel/Sheet headers every run.
_SCHEMA_SEARCH_PATHS = [
    Path(__file__).parent.parent.parent / "dynamic-testing" / "web-exploratory" / "references" / "TESTCASE_SHEET_SCHEMA.json",
    Path(__file__).parent.parent / "references" / "TESTCASE_SHEET_SCHEMA.json",
    Path(__file__).parent / "TESTCASE_SHEET_SCHEMA.json",
]

def _load_sheet_schema():
    for p in _SCHEMA_SEARCH_PATHS:
        if p.exists():
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    return None

_SHEET_SCHEMA = _load_sheet_schema()

def _default_col_map():
    """Return the canonical column mapping from schema file, or legacy inline fallback."""
    if _SHEET_SCHEMA and "column_mapping" in _SHEET_SCHEMA:
        return dict(_SHEET_SCHEMA["column_mapping"])
    # Legacy inline fallback (kept for safety if schema file is missing)
    return {
        "scenario_id": 1, "scenario_name": 2, "testcase_id": 3,
        "description": 4, "precondition": 5, "procedure": 6,
        "expected": 7, "result": 8, "priority": 9, "date": 10,
        "tester": 11, "note": 12
    }

def _default_header_row():
    """Return the 0-indexed header row index from schema, default row 9 (index 8)."""
    if _SHEET_SCHEMA and "header_row" in _SHEET_SCHEMA:
        return int(_SHEET_SCHEMA["header_row"]) - 1  # convert 1-indexed → 0-indexed
    return 8  # row 9, 0-indexed

# Insert current script directory into sys.path to load drive_common
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import drive_common
from googleapiclient.discovery import build

VALID_RESULTS = {"Pass", "Fail", "N/A", "Untest", "Untested"}
VALID_PRIORITIES = {"Critical", "High", "Medium", "Low"}

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
    return text

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

def read_local_excel(filepath, sheet_name=None):
    import openpyxl
    wb = openpyxl.load_workbook(filepath, data_only=True)
    target_sheet = sheet_name or wb.sheetnames[0]
    if sheet_name:
        for name in wb.sheetnames:
            if name.lower() == sheet_name.lower():
                target_sheet = name
                break
    ws = wb[target_sheet]
    rows = []
    for r in ws.iter_rows(values_only=True):
        rows.append([str(c) if c is not None else "" for c in r])

    header_idx = -1
    col_map = {}
    for idx, r in enumerate(rows):
        mapping = parse_header_indices(r)
        if "testcase_id" in mapping or "description" in mapping:
            header_idx = idx
            col_map = mapping
            break

    if header_idx == -1:
        header_idx = 0
        col_map = parse_header_indices(rows[0]) if rows else {}

    testcases = []
    current_module = "GENERAL"
    current_group = ""

    for r_idx in range(header_idx + 1, len(rows)):
        row = rows[r_idx]
        def get_col(key):
            idx = col_map.get(key)
            if idx is not None and idx < len(row):
                return str(row[idx]).strip()
            return ""

        tc_id = get_col("testcase_id")
        desc = get_col("description")
        if not tc_id and not desc:
            continue

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

def update_local_excel(filepath, updates, sheet_name=None):
    import openpyxl
    data_info = read_local_excel(filepath, sheet_name)
    target_sheet = data_info["sheet_name"]
    col_map = data_info["column_mapping"]
    tc_by_row = {tc["row_number"]: tc for tc in data_info["testcases"]}

    wb = openpyxl.load_workbook(filepath)
    ws = wb[target_sheet]

    today_str = datetime.now().strftime("%Y-%m-%d")
    updated_count = 0

    for up in updates:
        row_num = up.get("row_number")
        if row_num and row_num in tc_by_row:
            if "result" in col_map: ws.cell(row=row_num, column=col_map["result"] + 1, value=up.get("result", "Untest"))
            if "priority" in col_map: ws.cell(row=row_num, column=col_map["priority"] + 1, value=up.get("priority", "Medium"))
            if "date" in col_map: ws.cell(row=row_num, column=col_map["date"] + 1, value=today_str)
            if "tester" in col_map: ws.cell(row=row_num, column=col_map["tester"] + 1, value=up.get("tester", "AI-Agent"))
            if "note" in col_map: ws.cell(row=row_num, column=col_map["note"] + 1, value=sanitize_note(up.get("note", "")))
            updated_count += 1

    wb.save(filepath)
    return {"status": "success", "updated_count": updated_count, "errors": []}

def read_testcases(spreadsheet_id, sheet_name=None):
    if is_local_excel(spreadsheet_id):
        return read_local_excel(spreadsheet_id, sheet_name)
    service = get_sheets_service()
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheets = meta.get("sheets", [])
    if not sheets:
        raise ValueError("Spreadsheet has no sheets")

    target_sheet = None
    if sheet_name:
        for s in sheets:
            if s["properties"]["title"].lower() == sheet_name.lower():
                target_sheet = s["properties"]["title"]
                break

    if not target_sheet:
        # Prefer "Test cases_App" or first sheet
        for s in sheets:
            if "test cases" in s["properties"]["title"].lower():
                target_sheet = s["properties"]["title"]
                break
        if not target_sheet:
            target_sheet = sheets[0]["properties"]["title"]

    range_name = f"'{target_sheet}'!A1:Z2000"
    res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    rows = res.get("values", [])

    if not rows:
        return {"sheet_name": target_sheet, "testcases": []}

    # Find header row
    header_idx = -1
    col_map = {}
    for i, r in enumerate(rows):
        m = parse_header_indices(r)
        if "testcase_id" in m or "description" in m or ("scenario_id" in m and "expected" in m):
            header_idx = i
            col_map = m
            break

    if header_idx == -1:
        # Canonical schema fallback — loaded from dynamic-testing/web-exploratory/references/TESTCASE_SHEET_SCHEMA.json
        col_map = _default_col_map()
        header_idx = _default_header_row()

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
            if "1." in col_c or "USER INTERFACE" in col_c or "FUNCTION" in col_c:
                current_module = col_c
            else:
                current_group = col_c
            continue

        tc_id = get_col("testcase_id")
        desc = get_col("description")
        if not tc_id and not desc:
            continue

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
        res_val = str(up.get("result", "Untest")).strip()
        if res_val.lower() == "pass": res_val = "Pass"
        elif res_val.lower() == "fail": res_val = "Fail"
        elif res_val.lower() in ("n/a", "na"): res_val = "N/A"
        elif res_val.lower() in ("untest", "untested"): res_val = "Untest"
        else: res_val = "Untest"

        # Validate Priority value
        prio_val = str(up.get("priority", "Medium")).strip()
        if prio_val.lower() == "critical": prio_val = "Critical"
        elif prio_val.lower() == "high": prio_val = "High"
        elif prio_val.lower() == "medium": prio_val = "Medium"
        elif prio_val.lower() == "low": prio_val = "Low"
        else: prio_val = "Medium"

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
