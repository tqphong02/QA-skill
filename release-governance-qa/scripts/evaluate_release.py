#!/usr/bin/env python3
"""Evaluate a release packet using only local evidence and explicit approvals."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("release packet root must be an object")
    return value


def evaluate(packet: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    gates: list[dict[str, str]] = []

    def fail(name: str, reason: str, status: str = "FAIL") -> None:
        gates.append({"name": name, "status": status, "reason": reason})
        errors.append({"gate": name, "message": reason})

    def pass_gate(name: str, reason: str) -> None:
        gates.append({"name": name, "status": "PASS", "reason": reason})

    required = ("release_id", "target", "scope", "risk", "test_summary", "defects", "evidence", "approvals", "exit_criteria")
    for field in required:
        if field not in packet or packet[field] in (None, "", [], {}):
            fail("required_fields", f"missing {field}", "BLOCKED")

    test_summary = packet.get("test_summary", {})
    if not isinstance(test_summary, dict) or test_summary.get("status") != "PASS" or test_summary.get("passed") is not True:
        fail("test_summary", "required test summary is not an explicit PASS")
    elif float(test_summary.get("pass_rate", 0)) < 1:
        fail("test_summary", "pass_rate is below 1.0")
    else:
        pass_gate("test_summary", "required test summary and pass rate are PASS")

    exceptions = {
        item.get("defect_id")
        for item in packet.get("exceptions", [])
        if isinstance(item, dict) and item.get("approved") is True and item.get("defect_id")
    }
    high_risk = []
    for defect in packet.get("defects", []):
        if not isinstance(defect, dict):
            fail("defects", "each defect must be an object")
            continue
        severity = str(defect.get("severity", "")).upper()
        status = str(defect.get("status", "")).lower()
        if severity in {"P0", "P1", "CRITICAL", "HIGH"} and status not in {"closed", "resolved"}:
            if defect.get("id") not in exceptions:
                high_risk.append(str(defect.get("id", "unknown")))
    if high_risk:
        fail("defect_risk", f"open high-risk defects without approved exceptions: {', '.join(high_risk)}")
    else:
        pass_gate("defect_risk", "no open high-risk defect lacks an approved exception")

    evidence = packet.get("evidence", [])
    missing_evidence = []
    for item in evidence:
        raw_path = item.get("path") if isinstance(item, dict) else item
        if not raw_path:
            missing_evidence.append("<empty>")
            continue
        candidate = Path(str(raw_path))
        resolved = candidate if candidate.is_absolute() else base_dir / candidate
        if not resolved.is_file():
            missing_evidence.append(str(candidate))
    if missing_evidence:
        fail("evidence", f"missing evidence: {', '.join(missing_evidence)}", "BLOCKED")
    else:
        pass_gate("evidence", "all evidence paths exist locally")

    approvals = packet.get("approvals", {})
    if not isinstance(approvals, dict) or approvals.get("qa_owner") is not True or approvals.get("release_owner") is not True:
        fail("approvals", "qa_owner and release_owner approvals are both required", "BLOCKED")
    else:
        pass_gate("approvals", "named QA and release owner approvals are present")

    criteria = packet.get("exit_criteria", [])
    invalid_criteria = [str(item.get("id", "unknown")) for item in criteria if not isinstance(item, dict) or item.get("passed") is not True]
    if invalid_criteria:
        fail("exit_criteria", f"criteria not passed: {', '.join(invalid_criteria)}")
    else:
        pass_gate("exit_criteria", "every declared exit criterion is explicitly passed")

    if packet.get("exceptions"):
        warnings.append({"check": "exceptions", "message": "approved exceptions remain visible and must be time-bounded"})
    passed = not errors
    return {
        "schema_version": "1.0",
        "decision": "PASS" if passed else "BLOCKED" if any(item.get("status") == "BLOCKED" for item in gates) else "FAIL",
        "passed": passed,
        "release": {key: packet.get(key) for key in ("release_id", "target", "scope", "risk")},
        "errors": errors,
        "warnings": warnings,
        "gates": gates,
        "evidence": evidence,
        "limitations": ["local evaluation does not deploy, change tracker state, or verify remote CI claims"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--base-dir", default=None)
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        input_path = Path(args.input).resolve()
        report = evaluate(load_json(input_path), Path(args.base_dir).resolve() if args.base_dir else input_path.parent)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
