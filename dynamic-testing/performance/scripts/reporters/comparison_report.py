"""Compare two normalized performance results without hiding workload differences."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any


METRICS = ("p95Ms", "p99Ms", "errorRate", "requestsPerSecond")


def _profile(result: dict[str, Any], name: str) -> Any:
    return result.get("testProfile", {}).get(name)


def _same_scalability_group(baseline: dict[str, Any], candidate: dict[str, Any]) -> bool:
    before = _profile(baseline, "scalability") or {}
    after = _profile(candidate, "scalability") or {}
    return (
        baseline.get("testType") == candidate.get("testType") == "scalability"
        and bool(before.get("comparisonGroup"))
        and before.get("comparisonGroup") == after.get("comparisonGroup")
    )


def compare_results(baseline: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    disclosed_differences = []
    expected_differences = []
    scalability_comparison = _same_scalability_group(baseline, candidate)
    for field in ("environment", "testType"):
        if baseline.get(field) != candidate.get(field):
            disclosed_differences.append(
                {"field": field, "baseline": baseline.get(field), "candidate": candidate.get(field)}
            )
    for field in ("model",):
        before = baseline.get("workload", {}).get(field)
        after = candidate.get("workload", {}).get(field)
        if before != after:
            disclosed_differences.append({"field": f"workload.{field}", "baseline": before, "candidate": after})
    for field in ("users", "targetRate"):
        before = baseline.get("workload", {}).get(field)
        after = candidate.get("workload", {}).get(field)
        if before != after:
            difference = {"field": f"workload.{field}", "baseline": before, "candidate": after}
            (expected_differences if scalability_comparison else disclosed_differences).append(difference)

    before_data = _profile(baseline, "dataProfile")
    after_data = _profile(candidate, "dataProfile")
    if before_data != after_data:
        disclosed_differences.append(
            {"field": "testProfile.dataProfile", "baseline": before_data, "candidate": after_data}
        )

    before_scale = _profile(baseline, "scalability")
    after_scale = _profile(candidate, "scalability")
    if before_scale != after_scale:
        difference = {
            "field": "testProfile.scalability",
            "baseline": before_scale,
            "candidate": after_scale,
        }
        (expected_differences if scalability_comparison else disclosed_differences).append(difference)

    deltas = []
    regressions = 0
    improvements = 0
    for metric in METRICS:
        before = float(baseline["summary"].get(metric, 0))
        after = float(candidate["summary"].get(metric, 0))
        delta = after - before
        percent = (delta / before * 100) if before else None
        lower_is_better = metric != "requestsPerSecond"
        if delta == 0:
            direction = "UNCHANGED"
        elif (delta < 0 and lower_is_better) or (delta > 0 and not lower_is_better):
            direction = "IMPROVED"
            improvements += 1
        else:
            direction = "REGRESSED"
            regressions += 1
        deltas.append(
            {
                "metric": metric,
                "baseline": before,
                "candidate": after,
                "delta": delta,
                "percent": percent,
                "direction": direction,
            }
        )
    if disclosed_differences:
        verdict = "NOT_COMPARABLE"
    elif regressions and not improvements:
        verdict = "REGRESSED"
    elif improvements and not regressions:
        verdict = "IMPROVED"
    elif regressions:
        verdict = "MIXED"
    else:
        verdict = "UNCHANGED"
    return {
        "verdict": verdict,
        "baselineStatus": baseline.get("status"),
        "candidateStatus": candidate.get("status"),
        "disclosedDifferences": disclosed_differences,
        "expectedDifferences": expected_differences,
        "metrics": deltas,
    }


def write_comparison(comparison: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "comparison.json"
    md_path = output_dir / "comparison.md"
    html_path = output_dir / "comparison.html"
    json_path.write_text(json.dumps(comparison, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [
        "# Performance Comparison",
        "",
        f"- Verdict: {comparison['verdict']}",
        f"- Baseline status: {comparison['baselineStatus']}",
        f"- Candidate status: {comparison['candidateStatus']}",
        "",
        "| Metric | Baseline | Candidate | Delta | Direction |",
        "|---|---:|---:|---:|---|",
    ]
    for item in comparison["metrics"]:
        lines.append(
            f"| {item['metric']} | {item['baseline']:.6g} | {item['candidate']:.6g} | "
            f"{item['delta']:.6g} | {item['direction']} |"
        )
    lines.extend(["", "## Disclosed differences", ""])
    if comparison["disclosedDifferences"]:
        for difference in comparison["disclosedDifferences"]:
            lines.append(
                f"- {difference['field']}: baseline={difference['baseline']} candidate={difference['candidate']}"
            )
    else:
        lines.append("- None")
    lines.extend(["", "## Expected scalability differences", ""])
    if comparison.get("expectedDifferences"):
        for difference in comparison["expectedDifferences"]:
            lines.append(
                f"- {difference['field']}: baseline={difference['baseline']} candidate={difference['candidate']}"
            )
    else:
        lines.append("- None")
    markdown = "\n".join(lines) + "\n"
    md_path.write_text(markdown, encoding="utf-8")
    html_path.write_text(
        "<!doctype html><meta charset=\"utf-8\"><title>Performance Comparison</title>"
        f"<pre>{html.escape(markdown)}</pre>",
        encoding="utf-8",
    )
    return {
        "json": str(json_path.resolve()),
        "markdown": str(md_path.resolve()),
        "html": str(html_path.resolve()),
    }
