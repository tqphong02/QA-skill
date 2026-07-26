"""Parse k6 --summary-export JSON into the common result."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from parsers.common import build_result


def _values(metrics: dict[str, Any], name: str) -> dict[str, Any]:
    metric = metrics.get(name, {})
    return metric.get("values", {}) if isinstance(metric, dict) else {}


def _first(values: dict[str, Any], *names: str, default: float = 0) -> float:
    for name in names:
        if name in values:
            return float(values[name])
    return default


def parse_k6(file_path: Path, config: dict[str, Any]) -> dict[str, Any]:
    payload = json.loads(file_path.read_text(encoding="utf-8"))
    metrics = payload.get("metrics", {})
    if not isinstance(metrics, dict):
        raise ValueError("k6 summary has no metrics object")
    requests_values = _values(metrics, "http_reqs")
    failed_values = _values(metrics, "http_req_failed")
    duration_values = _values(metrics, "http_req_duration")
    requests = int(_first(requests_values, "count"))
    if requests < 1:
        raise ValueError("k6 summary reports zero requests")
    error_rate = _first(failed_values, "rate")
    failed = min(requests, round(requests * error_rate))
    duration_seconds = float(payload.get("state", {}).get("testRunDurationMs", 0) or 0) / 1000
    request_rate = _first(requests_values, "rate")
    if not duration_seconds and request_rate:
        duration_seconds = requests / request_rate

    endpoints = []
    for name, metric in metrics.items():
        if not name.startswith("http_req_duration{"):
            continue
        match = re.search(r"endpoint:([^,}]+)", name)
        if not match:
            continue
        values = metric.get("values", {})
        endpoints.append(
            {
                "endpoint": match.group(1),
                "requests": int(_first(values, "count")),
                "p95Ms": _first(values, "p(95)", "p95"),
                "errorRate": 0,
            }
        )
    endpoints.sort(key=lambda item: item["p95Ms"], reverse=True)
    metrics_common = {
        "requests": requests,
        "successful": requests - failed,
        "failed": failed,
        "errorRate": error_rate,
        "requestsPerSecond": request_rate,
        "averageMs": _first(duration_values, "avg"),
        "p90Ms": _first(duration_values, "p(90)", "p90"),
        "p95Ms": _first(duration_values, "p(95)", "p95"),
        "p99Ms": _first(duration_values, "p(99)", "p99"),
        "durationSeconds": duration_seconds,
    }
    return build_result(config, "k6", metrics_common, endpoints[:10], [])
