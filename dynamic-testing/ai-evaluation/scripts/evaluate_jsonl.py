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


def string_list(value: Any, field: str, case_id: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"Case {case_id} field {field} must be a list of strings")
    return value


def optional_metric(value: Any, field: str, case_id: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"Case {case_id} field {field} must be a non-negative finite number")
    try:
        metric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Case {case_id} field {field} must be a non-negative finite number"
        ) from exc
    if not math.isfinite(metric) or metric < 0:
        raise ValueError(f"Case {case_id} field {field} must be a non-negative finite number")
    return metric


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

    required_terms = [
        normalize(term) for term in string_list(case.get("required_terms"), "required_terms", case_id)
    ]
    if required_terms:
        missing = [term for term in required_terms if term not in actual_text]
        add("required_terms", not missing, {"missing": missing})

    forbidden_terms = [
        normalize(term) for term in string_list(case.get("forbidden_terms"), "forbidden_terms", case_id)
    ]
    if forbidden_terms:
        found = [term for term in forbidden_terms if term in actual_text]
        add("forbidden_terms", not found, {"found_count": len(found)})

    if case.get("expect_json"):
        valid, parsed = parse_actual_json(actual)
        add("valid_json", valid)
        required_fields = string_list(case.get("required_fields"), "required_fields", case_id)
        if required_fields:
            missing_fields = []
            if not isinstance(parsed, dict):
                missing_fields = list(required_fields)
            else:
                missing_fields = [field for field in required_fields if field not in parsed]
            add("required_fields", not missing_fields, {"missing": missing_fields})

    expected_source_ids = set(
        string_list(case.get("expected_source_ids"), "expected_source_ids", case_id)
    )
    if expected_source_ids:
        retrieved_source_ids = set(
            string_list(case.get("retrieved_source_ids"), "retrieved_source_ids", case_id)
        )
        cited_source_ids = set(
            string_list(case.get("cited_source_ids"), "cited_source_ids", case_id)
        )
        add(
            "grounding_sources",
            expected_source_ids <= retrieved_source_ids and expected_source_ids <= cited_source_ids,
            {
                "missing_retrieved": sorted(expected_source_ids - retrieved_source_ids),
                "missing_citations": sorted(expected_source_ids - cited_source_ids),
            },
        )

    if case.get("expect_no_unsupported_claims"):
        unsupported_claims = case.get("unsupported_claims")
        if not isinstance(unsupported_claims, list):
            raise ValueError(f"Case {case_id} field unsupported_claims must be a list")
        add("unsupported_claims", not unsupported_claims, {"count": len(unsupported_claims)})

    if "expected_tool_calls" in case:
        expected_tool_calls = case["expected_tool_calls"]
        actual_tool_calls = case.get("actual_tool_calls")
        if not isinstance(expected_tool_calls, list) or not isinstance(actual_tool_calls, list):
            raise ValueError(
                f"Case {case_id} fields expected_tool_calls and actual_tool_calls must be lists"
            )
        add("tool_calls", normalize(expected_tool_calls) == normalize(actual_tool_calls))

    if case.get("expect_no_unauthorized_tool_calls"):
        unauthorized_tool_calls = case.get("unauthorized_tool_calls")
        if not isinstance(unauthorized_tool_calls, list):
            raise ValueError(f"Case {case_id} field unauthorized_tool_calls must be a list")
        add(
            "unauthorized_tool_calls",
            not unauthorized_tool_calls,
            {"count": len(unauthorized_tool_calls)},
        )

    if "expect_refusal" in case:
        refusal_detected = case.get("refusal_detected")
        if not isinstance(case["expect_refusal"], bool) or not isinstance(refusal_detected, bool):
            raise ValueError(
                f"Case {case_id} fields expect_refusal and refusal_detected must be booleans"
            )
        add("refusal", case["expect_refusal"] == refusal_detected)

    if "expect_timeout" in case:
        timed_out = case.get("timed_out")
        if not isinstance(case["expect_timeout"], bool) or not isinstance(timed_out, bool):
            raise ValueError(
                f"Case {case_id} fields expect_timeout and timed_out must be booleans"
            )
        add("timeout", case["expect_timeout"] == timed_out)

    if case.get("expect_no_safety_violations"):
        safety_violations = case.get("safety_violations")
        if not isinstance(safety_violations, list):
            raise ValueError(f"Case {case_id} field safety_violations must be a list")
        add("safety", not safety_violations, {"count": len(safety_violations)})

    if not assertions:
        raise ValueError(f"Case {case_id} defines no deterministic assertion")

    tags = string_list(case.get("tags"), "tags", case_id)
    critical = case.get("critical", False)
    if not isinstance(critical, bool):
        raise ValueError(f"Case {case_id} field critical must be a boolean")

    return {
        "id": case_id,
        "passed": all(item["passed"] for item in assertions),
        "assertions": assertions,
        "latency_ms": optional_metric(case.get("latency_ms"), "latency_ms", case_id),
        "cost_usd": optional_metric(case.get("cost_usd"), "cost_usd", case_id),
        "tags": tags,
        "critical": critical,
        "dataset_version": str(case.get("dataset_version", "")).strip(),
        "config_version": str(case.get("config_version", "")).strip(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Executed JSONL dataset")
    parser.add_argument("--min-pass-rate", type=float, default=1.0)
    parser.add_argument("--max-p95-latency-ms", type=float)
    parser.add_argument("--max-average-cost-usd", type=float)
    parser.add_argument("--required-tags", default="", help="Comma-separated tags that must be covered")
    parser.add_argument(
        "--required-critical-tags",
        default="",
        help="Comma-separated tags that must be covered by critical cases",
    )
    parser.add_argument(
        "--require-version-metadata",
        action="store_true",
        help="Require one non-empty dataset_version and config_version across all cases",
    )
    parser.add_argument("--output")
    args = parser.parse_args()
    if not 0 <= args.min_pass_rate <= 1:
        parser.error("--min-pass-rate must be between 0 and 1")

    results = []
    seen_ids: set[str] = set()
    try:
        with Path(args.input).open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                raw = json.loads(line)
                if not isinstance(raw, dict):
                    raise ValueError(f"Line {line_number} must be a JSON object")
                result = evaluate_case(raw)
                if result["id"] in seen_ids:
                    raise ValueError(f"Duplicate case id at line {line_number}: {result['id']}")
                seen_ids.add(result["id"])
                results.append(result)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

    if not results:
        print(json.dumps({"error": "No evaluation cases found"}), file=sys.stderr)
        return 2

    latencies = [item["latency_ms"] for item in results if item["latency_ms"] is not None]
    costs = [item["cost_usd"] for item in results if item["cost_usd"] is not None]
    passed_count = sum(1 for item in results if item["passed"])
    pass_rate = passed_count / len(results)
    p95_latency = percentile(latencies, 0.95)
    average_cost = sum(costs) / len(costs) if costs else None
    required_tags = set(split.strip() for split in args.required_tags.split(",") if split.strip())
    required_critical_tags = set(
        split.strip() for split in args.required_critical_tags.split(",") if split.strip()
    )
    covered_tags = {tag for item in results for tag in item["tags"]}
    covered_critical_tags = {
        tag for item in results if item["critical"] for tag in item["tags"]
    }
    critical_failure_ids = [
        item["id"] for item in results if item["critical"] and not item["passed"]
    ]
    dataset_versions = sorted(
        {item["dataset_version"] for item in results if item["dataset_version"]}
    )
    config_versions = sorted(
        {item["config_version"] for item in results if item["config_version"]}
    )
    missing_version_metadata = any(
        not item["dataset_version"] or not item["config_version"] for item in results
    )
    version_metadata_ok = (
        not args.require_version_metadata
        or (
            not missing_version_metadata
            and len(dataset_versions) == 1
            and len(config_versions) == 1
        )
    )

    gates = {
        "pass_rate": pass_rate >= args.min_pass_rate,
        "p95_latency": args.max_p95_latency_ms is None
        or (p95_latency is not None and p95_latency <= args.max_p95_latency_ms),
        "average_cost": args.max_average_cost_usd is None
        or (average_cost is not None and average_cost <= args.max_average_cost_usd),
        "critical_cases": not critical_failure_ids,
        "required_tag_coverage": required_tags <= covered_tags,
        "required_critical_tag_coverage": required_critical_tags <= covered_critical_tags,
        "version_metadata": version_metadata_ok,
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
        "metadata": {
            "dataset_versions": dataset_versions,
            "config_versions": config_versions,
        },
        "coverage": {
            "covered_tags": sorted(covered_tags),
            "missing_required_tags": sorted(required_tags - covered_tags),
            "covered_critical_tags": sorted(covered_critical_tags),
            "missing_required_critical_tags": sorted(
                required_critical_tags - covered_critical_tags
            ),
        },
        "gates": gates,
        "critical_failure_ids": critical_failure_ids,
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
