#!/usr/bin/env python3
"""Evaluate deterministic assertions in an executed AI JSONL dataset."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


def normalize(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return re.sub(r"\s+", " ", str(value).strip()).casefold()


def percentile(values: list[float], percent: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = (len(ordered) - 1) * percent
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return ordered[low]
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def parse_actual_json(actual: Any) -> tuple[bool, Any]:
    if isinstance(actual, (dict, list)):
        return True, actual
    try:
        return True, json.loads(str(actual))
    except (TypeError, json.JSONDecodeError):
        return False, None


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    case_id = str(case.get("id", "")).strip()
    if not case_id:
        raise ValueError("Every case requires a non-empty id")
    if "actual" not in case:
        raise ValueError(f"Case {case_id} has no actual output")

    actual = case["actual"]
    actual_text = normalize(actual)
    assertions: list[dict[str, Any]] = []

    def add(name: str, passed: bool, detail: Any = None) -> None:
        item: dict[str, Any] = {"name": name, "passed": passed}
        if detail is not None:
            item["detail"] = detail
        assertions.append(item)

    if "expected" in case:
        add("exact_match", normalize(case["expected"]) == actual_text)

    required_terms = [normalize(term) for term in case.get("required_terms", [])]
    if required_terms:
        missing = [term for term in required_terms if term not in actual_text]
        add("required_terms", not missing, {"missing": missing})

    forbidden_terms = [normalize(term) for term in case.get("forbidden_terms", [])]
    if forbidden_terms:
        found = [term for term in forbidden_terms if term in actual_text]
        add("forbidden_terms", not found, {"found": found})

    if case.get("expect_json"):
        valid, parsed = parse_actual_json(actual)
        add("valid_json", valid)
        required_fields = case.get("required_fields", [])
        if required_fields:
            missing_fields = []
            if not isinstance(parsed, dict):
                missing_fields = list(required_fields)
            else:
                missing_fields = [field for field in required_fields if field not in parsed]
            add("required_fields", not missing_fields, {"missing": missing_fields})

    if not assertions:
        raise ValueError(f"Case {case_id} defines no deterministic assertion")

    return {
        "id": case_id,
        "passed": all(item["passed"] for item in assertions),
        "assertions": assertions,
        "latency_ms": case.get("latency_ms"),
        "cost_usd": case.get("cost_usd"),
        "tags": case.get("tags", []),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Executed JSONL dataset")
    parser.add_argument("--min-pass-rate", type=float, default=1.0)
    parser.add_argument("--max-p95-latency-ms", type=float)
    parser.add_argument("--max-average-cost-usd", type=float)
    parser.add_argument("--output")
    args = parser.parse_args()
    if not 0 <= args.min_pass_rate <= 1:
        parser.error("--min-pass-rate must be between 0 and 1")

    results = []
    try:
        with Path(args.input).open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                raw = json.loads(line)
                if not isinstance(raw, dict):
                    raise ValueError(f"Line {line_number} must be a JSON object")
                results.append(evaluate_case(raw))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

    if not results:
        print(json.dumps({"error": "No evaluation cases found"}), file=sys.stderr)
        return 2

    latencies = [float(item["latency_ms"]) for item in results if item["latency_ms"] is not None]
    costs = [float(item["cost_usd"]) for item in results if item["cost_usd"] is not None]
    passed_count = sum(1 for item in results if item["passed"])
    pass_rate = passed_count / len(results)
    p95_latency = percentile(latencies, 0.95)
    average_cost = sum(costs) / len(costs) if costs else None

    gates = {
        "pass_rate": pass_rate >= args.min_pass_rate,
        "p95_latency": args.max_p95_latency_ms is None
        or (p95_latency is not None and p95_latency <= args.max_p95_latency_ms),
        "average_cost": args.max_average_cost_usd is None
        or (average_cost is not None and average_cost <= args.max_average_cost_usd),
    }
    report = {
        "passed": all(gates.values()),
        "summary": {
            "cases": len(results),
            "passed_cases": passed_count,
            "pass_rate": pass_rate,
            "p95_latency_ms": p95_latency,
            "average_cost_usd": average_cost,
        },
        "gates": gates,
        "failed_case_ids": [item["id"] for item in results if not item["passed"]],
        "results": results,
    }
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
