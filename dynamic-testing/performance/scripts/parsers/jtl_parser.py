"""Parse JMeter CSV or XML JTL into the common result."""

from __future__ import annotations

import csv
import math
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from parsers.common import build_result


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    rank = max(0, math.ceil(quantile * len(ordered)) - 1)
    return ordered[rank]


def _rows(file_path: Path) -> list[dict[str, Any]]:
    with file_path.open("rb") as probe:
        first = probe.read(256).lstrip()[:1]
    if file_path.suffix.lower() == ".xml" or first == b"<":
        root = ET.parse(file_path).getroot()
        rows = []
        for sample in root.iter():
            if sample.tag not in {"httpSample", "sample"}:
                continue
            rows.append(
                {
                    "elapsed": sample.attrib.get("t", 0),
                    "timeStamp": sample.attrib.get("ts", 0),
                    "label": sample.attrib.get("lb", "unknown"),
                    "responseCode": sample.attrib.get("rc", ""),
                    "responseMessage": sample.attrib.get("rm", ""),
                    "success": sample.attrib.get("s", "false"),
                }
            )
        return rows
    with file_path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def parse_jtl(file_path: Path, config: dict[str, Any]) -> dict[str, Any]:
    rows = _rows(file_path)
    if not rows:
        raise ValueError("JTL contains no samples")
    elapsed = [float(row.get("elapsed", 0) or 0) for row in rows]
    failed_rows = [
        row for row in rows if str(row.get("success", "")).strip().lower() not in {"true", "1"}
    ]
    timestamps = [float(row.get("timeStamp", 0) or 0) for row in rows if row.get("timeStamp")]
    duration = (
        (max(timestamps) - min(timestamps) + max(elapsed)) / 1000
        if timestamps
        else sum(elapsed) / 1000
    )
    duration = max(duration, 0.001)

    by_label: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_label[str(row.get("label", "unknown"))].append(row)
    endpoints = []
    for label, samples in by_label.items():
        values = [float(sample.get("elapsed", 0) or 0) for sample in samples]
        failures = sum(
            str(sample.get("success", "")).strip().lower() not in {"true", "1"}
            for sample in samples
        )
        endpoints.append(
            {
                "endpoint": label,
                "requests": len(samples),
                "p95Ms": round(percentile(values, 0.95), 3),
                "errorRate": round(failures / len(samples), 6),
            }
        )
    endpoints.sort(key=lambda item: item["p95Ms"], reverse=True)

    error_counts = Counter(
        (
            str(row.get("label", "unknown")),
            str(row.get("responseCode", "")),
            str(row.get("failureMessage") or row.get("responseMessage") or ""),
        )
        for row in failed_rows
    )
    errors = [
        {"endpoint": label, "code": code, "message": message, "count": count}
        for (label, code, message), count in error_counts.most_common(10)
    ]
    metrics = {
        "requests": len(rows),
        "successful": len(rows) - len(failed_rows),
        "failed": len(failed_rows),
        "errorRate": len(failed_rows) / len(rows),
        "requestsPerSecond": len(rows) / duration,
        "averageMs": sum(elapsed) / len(elapsed),
        "p90Ms": percentile(elapsed, 0.90),
        "p95Ms": percentile(elapsed, 0.95),
        "p99Ms": percentile(elapsed, 0.99),
        "durationSeconds": duration,
    }
    return build_result(config, "jmeter", metrics, endpoints[:10], errors)
