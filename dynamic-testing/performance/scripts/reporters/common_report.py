"""Write machine JSON plus human-readable Markdown and HTML performance reports."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any


def _number(value: Any, suffix: str = "") -> str:
    if isinstance(value, float):
        return f"{value:,.3f}{suffix}"
    return f"{value:,}{suffix}" if isinstance(value, int) else f"{value}{suffix}"


def markdown_report(result: dict[str, Any]) -> str:
    summary = result["summary"]
    lines = [
        "# Performance Test Report",
        "",
        f"- Test Result: {result['status']}",
        f"- Engine: {result['engine']}",
        f"- Environment: {result['environment']}",
        f"- Test Type: {result['testType']}",
        f"- Workload Model: {result['workload']['model']}",
        f"- Users: {result['workload']['users']}",
        f"- Total Requests: {summary['requests']}",
        f"- Successful Requests: {summary['successful']}",
        f"- Failed Requests: {summary['failed']}",
        f"- Error Rate: {summary['errorRate'] * 100:.3f}%",
        "",
        "## KPI",
        "",
        "| Metric | Actual | Threshold | Result |",
        "|---|---:|---:|---|",
    ]
    label = {
        "p95": "P95 response time",
        "p99": "P99 response time",
        "errorRate": "Error rate",
        "requestsPerSecond": "Throughput",
    }
    for threshold in result["thresholds"]:
        metric = threshold["metric"]
        suffix = "%" if metric == "errorRate" else " ms" if metric in {"p95", "p99"} else " req/s"
        multiplier = 100 if metric == "errorRate" else 1
        lines.append(
            f"| {label.get(metric, metric)} | "
            f"{_number(threshold['actual'] * multiplier, suffix)} | "
            f"{threshold['comparison']} {_number(threshold['expected'] * multiplier, suffix)} | "
            f"{threshold['status']} |"
        )
    lines.extend(
        [
            f"| Average | {_number(summary['averageMs'], ' ms')} | N/A | INFO |",
            f"| P90 | {_number(summary['p90Ms'], ' ms')} | N/A | INFO |",
            "",
            "## Slowest endpoints",
            "",
            "| Endpoint | Requests | P95 | Error rate |",
            "|---|---:|---:|---:|",
        ]
    )
    for endpoint in result.get("slowestEndpoints", []):
        lines.append(
            f"| {endpoint['endpoint']} | {endpoint['requests']} | "
            f"{endpoint['p95Ms']:.3f} ms | {endpoint['errorRate'] * 100:.3f}% |"
        )
    if not result.get("slowestEndpoints"):
        lines.append("| No endpoint submetric | 0 | 0 ms | 0% |")
    lines.extend(["", "## Top errors", ""])
    if result.get("topErrors"):
        for error in result["topErrors"]:
            lines.append(
                f"- {error['endpoint']} — {error.get('code', '')} — "
                f"{error.get('message', '')} — {error['count']} occurrences"
            )
    else:
        lines.append("- No engine error detail was available")
    failed = [item["metric"] for item in result["thresholds"] if item["status"] == "FAIL"]
    conclusion = (
        f"Test FAIL because these thresholds failed: {', '.join(failed)}"
        if failed
        else "Test PASS because every configured threshold passed"
    )
    lines.extend(["", "## Conclusion", "", conclusion, ""])
    return "\n".join(lines)


def html_report(result: dict[str, Any], markdown: str) -> str:
    escaped = html.escape(markdown)
    color = "#b42318" if result["status"] == "FAIL" else "#067647"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Performance Test Report</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 1100px; margin: 32px auto; padding: 0 20px; color: #182230; }}
    .status {{ color: {color}; font-size: 28px; font-weight: 700; }}
    pre {{ white-space: pre-wrap; background: #f8fafc; border: 1px solid #e4e7ec; border-radius: 8px; padding: 20px; }}
  </style>
</head>
<body>
  <div class="status">{result['status']}</div>
  <pre>{escaped}</pre>
</body>
</html>
"""


def write_reports(result: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "result.json"
    markdown_path = output_dir / "summary.md"
    html_path = output_dir / "summary.html"
    markdown = markdown_report(result)
    json_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    markdown_path.write_text(markdown, encoding="utf-8")
    html_path.write_text(html_report(result, markdown), encoding="utf-8")
    return {
        "json": str(json_path.resolve()),
        "markdown": str(markdown_path.resolve()),
        "html": str(html_path.resolve()),
    }
