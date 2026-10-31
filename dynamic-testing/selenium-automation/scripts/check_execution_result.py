#!/usr/bin/env python3
"""Turn a Cucumber JSON report into a deterministic PASS/FAILED/UNTEST verdict.

Never let the model claim PASS from prose ("tests look green") alone — this
script is the single source of truth for Selenium/Cucumber execution verdicts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def scenario_status(element: dict[str, Any]) -> str:
    statuses = []
    for step in element.get("steps", []):
        result = step.get("result", {})
        statuses.append(result.get("status", "undefined"))
    if not statuses:
        return "undefined"
    if any(status == "failed" for status in statuses):
        return "failed"
    if any(status in {"undefined", "pending", "ambiguous"} for status in statuses):
        return "undefined"
    if any(status == "skipped" for status in statuses):
        return "skipped"
    return "passed"


def evaluate(report_path: Path) -> dict[str, Any]:
    if not report_path.is_file():
        return {
            "schema_version": "1.0",
            "verdict": "UNTEST",
            "reason": f"cucumber report not found at {report_path}",
            "totals": {},
        }
    try:
        raw = report_path.read_text(encoding="utf-8")
        features = json.loads(raw) if raw.strip() else []
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "schema_version": "1.0",
            "verdict": "UNTEST",
            "reason": f"cucumber report unreadable or invalid JSON: {exc}",
            "totals": {},
        }
    if not isinstance(features, list) or not features:
        return {
            "schema_version": "1.0",
            "verdict": "UNTEST",
            "reason": "cucumber report is empty; no scenario ran",
            "totals": {},
        }

    totals = {"passed": 0, "failed": 0, "undefined": 0, "skipped": 0}
    failures: list[dict[str, Any]] = []
    for feature in features:
        feature_name = feature.get("name", feature.get("uri", "unknown feature"))
        for element in feature.get("elements", []):
            if element.get("type") != "scenario":
                continue
            status = scenario_status(element)
            totals[status] = totals.get(status, 0) + 1
            if status in {"failed", "undefined"}:
                failures.append({
                    "feature": feature_name,
                    "scenario": element.get("name", "unknown scenario"),
                    "line": element.get("line"),
                    "status": status,
                })

    scenario_count = sum(totals.values())
    if scenario_count == 0:
        verdict = "UNTEST"
        reason = "cucumber report has no scenario elements"
    elif totals["failed"] > 0 or totals["undefined"] > 0:
        verdict = "FAILED"
        reason = f"{totals['failed']} failed, {totals['undefined']} undefined/pending out of {scenario_count} scenarios"
    else:
        verdict = "PASS"
        reason = f"all {scenario_count} scenarios passed"

    return {
        "schema_version": "1.0",
        "source": str(report_path),
        "verdict": verdict,
        "reason": reason,
        "totals": {**totals, "scenarios": scenario_count},
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cucumber-json",
        default="target/cucumber-reports/cucumber.json",
        help="Path to the Cucumber JSON report produced by `mvn clean test`",
    )
    parser.add_argument("--output")
    args = parser.parse_args()

    report = evaluate(Path(args.cucumber_json))
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
