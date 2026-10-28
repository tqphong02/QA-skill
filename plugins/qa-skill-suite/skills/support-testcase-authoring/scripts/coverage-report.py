#!/usr/bin/env python3
"""
coverage-report.py — Requirement coverage report from testcase JSON source
Usage: python scripts/coverage-report.py <input.json> [--fail-uncovered]

Outputs a table: requirement → coverage_items → case count → COVERED/PARTIAL/UNCOVERED
Exit code 1 if any UNCOVERED item found and --fail-uncovered is set (default: True)
"""
import argparse
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Coverage calculation
# ---------------------------------------------------------------------------
def collect_case_refs(source: dict) -> dict[str, list[str]]:
    """
    Returns mapping: coverage_item_id → list of testcase_ids that reference it
    """
    refs: dict[str, list[str]] = {}
    for section in source.get("sections", []):
        for group in section.get("groups", []):
            for scenario in group.get("scenarios", []):
                for case in scenario.get("cases", []):
                    tc_id = case.get("testcase_id", "?")
                    for cov_ref in case.get("coverage_item_refs", []):
                        refs.setdefault(cov_ref, []).append(tc_id)
        for scenario in section.get("scenarios", []):
            for case in scenario.get("cases", []):
                tc_id = case.get("testcase_id", "?")
                for cov_ref in case.get("coverage_item_refs", []):
                    refs.setdefault(cov_ref, []).append(tc_id)
    return refs


def build_report(source: dict) -> list[dict]:
    case_refs = collect_case_refs(source)
    rows = []

    for req in source.get("requirements", []):
        req_id = req.get("id", "?")
        req_text = req.get("text", "")[:60]
        coverage_items = req.get("coverage_items", [])

        if not coverage_items:
            rows.append({
                "requirement_id": req_id,
                "requirement_text": req_text,
                "coverage_item_id": None,
                "coverage_item_desc": "(no coverage items defined)",
                "case_count": 0,
                "case_ids": [],
                "status": "UNCOVERED",
            })
            continue

        for item in coverage_items:
            item_id = item.get("id", "?")
            item_desc = item.get("description", "")[:60]
            case_ids = case_refs.get(item_id, [])
            count = len(case_ids)

            if count == 0:
                status = "UNCOVERED"
            elif count < item.get("minimum_cases", 1):
                status = "PARTIAL"
            else:
                status = "COVERED"

            rows.append({
                "requirement_id": req_id,
                "requirement_text": req_text,
                "coverage_item_id": item_id,
                "coverage_item_desc": item_desc,
                "case_count": count,
                "case_ids": case_ids,
                "status": status,
            })

    return rows


# ---------------------------------------------------------------------------
# Output renderers
# ---------------------------------------------------------------------------
STATUS_ICON = {"COVERED": "✓", "PARTIAL": "~", "UNCOVERED": "✗"}

def calculate_summary(rows: list[dict]) -> dict:
    total = len(rows)
    covered = sum(1 for r in rows if r["status"] == "COVERED")
    partial = sum(1 for r in rows if r["status"] == "PARTIAL")
    uncovered = sum(1 for r in rows if r["status"] == "UNCOVERED")
    pct = round(covered / total * 100, 1) if total else 0.0
    return {
        "total_items": total,
        "covered_items": covered,
        "partial_items": partial,
        "uncovered_items": uncovered,
        "coverage_pct": pct,
    }


def print_table(rows: list[dict]) -> None:
    if not rows:
        print("No requirements found in source.")
        return

    col_w = [14, 20, 14, 22, 5, 10]
    header = ["Req ID", "Req (preview)", "Cov Item", "Description", "Cases", "Status"]
    sep = "  ".join("-" * w for w in col_w)

    def fmt(row_vals):
        return "  ".join(str(v)[:w].ljust(w) for v, w in zip(row_vals, col_w))

    print(fmt(header))
    print(sep)
    for r in rows:
        icon = STATUS_ICON.get(r["status"], "?")
        print(fmt([
            r["requirement_id"],
            r["requirement_text"],
            r["coverage_item_id"] or "",
            r["coverage_item_desc"],
            r["case_count"],
            f"{icon} {r['status']}",
        ]))

    summary = calculate_summary(rows)
    print()
    print(f"Coverage: {summary['covered_items']}/{summary['total_items']} COVERED  |  {summary['partial_items']} PARTIAL  |  {summary['uncovered_items']} UNCOVERED")
    print(f"Coverage %: {round(summary['coverage_pct'])}%")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Requirement coverage report from testcase JSON source"
    )
    parser.add_argument("input", help="Path to testcase JSON source file")
    parser.add_argument(
        "--no-fail-uncovered",
        action="store_true",
        help="Exit 0 even when UNCOVERED items exist (default: exit 1)",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON instead of table")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    source = json.loads(input_path.read_text(encoding="utf-8"))
    rows = build_report(source)

    if args.json:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
    else:
        print_table(rows)

    has_uncovered = any(r["status"] == "UNCOVERED" for r in rows)
    if has_uncovered and not args.no_fail_uncovered:
        sys.exit(1)


if __name__ == "__main__":
    main()
