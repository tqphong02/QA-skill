#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import Counter
import json
import math
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlsplit


def percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * ratio) - 1)
    return round(ordered[index], 2)


def safe_endpoint(request: dict[str, Any]) -> str:
    method = str(request.get("method", "UNKNOWN")).upper()
    parsed = urlsplit(str(request.get("url", "")))
    host = parsed.hostname or "unknown-host"
    path = parsed.path or "/"
    return f"{method} {host}{path}"


def graphql_operation(entry: dict[str, Any]) -> str | None:
    request = entry.get("request") or {}
    post_data = request.get("postData") or {}
    mime_type = str(post_data.get("mimeType", "")).lower()
    if "json" not in mime_type:
        return None
    text = post_data.get("text")
    if not isinstance(text, str) or not text.strip():
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, list):
        names = [
            str(item.get("operationName"))
            for item in payload
            if isinstance(item, dict) and item.get("operationName")
        ]
        return ",".join(names) if names else None
    if isinstance(payload, dict) and payload.get("operationName"):
        return str(payload["operationName"])
    return None


def summarize(document: dict[str, Any], slow_ms: float) -> dict[str, Any]:
    entries = ((document.get("log") or {}).get("entries") or [])
    if not isinstance(entries, list):
        raise ValueError("HAR log.entries must be an array")

    methods: Counter[str] = Counter()
    hosts: Counter[str] = Counter()
    statuses: Counter[str] = Counter()
    endpoints: Counter[str] = Counter()
    graphql: Counter[str] = Counter()
    durations: list[float] = []
    errors: list[dict[str, Any]] = []
    slow: list[dict[str, Any]] = []
    total_response_bytes = 0
    websocket_messages = 0

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        request = entry.get("request") or {}
        response = entry.get("response") or {}
        endpoint = safe_endpoint(request)
        parsed = urlsplit(str(request.get("url", "")))
        method = str(request.get("method", "UNKNOWN")).upper()
        status = int(response.get("status") or 0)
        duration = float(entry.get("time") or 0)
        content = response.get("content") or {}
        size = response.get("_transferSize")
        if not isinstance(size, (int, float)) or size < 0:
            size = response.get("bodySize")
        if not isinstance(size, (int, float)) or size < 0:
            size = content.get("size")
        if isinstance(size, (int, float)) and size > 0:
            total_response_bytes += int(size)

        methods[method] += 1
        hosts[parsed.hostname or "unknown-host"] += 1
        statuses[str(status)] += 1
        endpoints[endpoint] += 1
        durations.append(duration)
        websocket_messages += len(entry.get("_webSocketMessages") or [])

        operation = graphql_operation(entry)
        if operation:
            graphql[operation] += 1

        item = {"endpoint": endpoint, "status": status, "time_ms": round(duration, 2)}
        if status == 0 or status >= 400:
            errors.append(item)
        if duration >= slow_ms:
            slow.append(item)

    repeated = [
        {"endpoint": endpoint, "count": count}
        for endpoint, count in endpoints.most_common()
        if count > 1
    ]

    return {
        "schema_version": 1,
        "request_count": len(entries),
        "http_error_count": len(errors),
        "slow_request_count": len(slow),
        "total_response_bytes": total_response_bytes,
        "timing_ms": {
            "p50": percentile(durations, 0.50),
            "p95": percentile(durations, 0.95),
            "max": round(max(durations), 2) if durations else 0.0,
            "slow_threshold": slow_ms,
        },
        "methods": dict(methods.most_common()),
        "statuses": dict(statuses.most_common()),
        "hosts": dict(hosts.most_common()),
        "graphql_operations": dict(graphql.most_common()),
        "websocket_message_count": websocket_messages,
        "repeated_endpoints": repeated[:20],
        "http_errors": errors[:50],
        "slow_requests": sorted(slow, key=lambda item: item["time_ms"], reverse=True)[:50],
        "redaction": {
            "headers_included": False,
            "cookies_included": False,
            "query_values_included": False,
            "bodies_included": False,
        },
    }


def escape_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def markdown(summary: dict[str, Any]) -> str:
    timing = summary["timing_ms"]
    lines = [
        "# Mobile network HAR summary",
        "",
        f"- Requests: {summary['request_count']}",
        f"- HTTP errors: {summary['http_error_count']}",
        f"- Slow requests: {summary['slow_request_count']} at or above {timing['slow_threshold']} ms",
        f"- Timing p50/p95/max: {timing['p50']} / {timing['p95']} / {timing['max']} ms",
        f"- Response bytes: {summary['total_response_bytes']}",
        f"- WebSocket messages represented in HAR extensions: {summary['websocket_message_count']}",
        "",
        "## Statuses",
        "",
        "| Status | Count |",
        "|---|---:|",
    ]
    lines.extend(
        f"| {escape_cell(status)} | {count} |"
        for status, count in summary["statuses"].items()
    )
    lines.extend(["", "## HTTP errors", "", "| Endpoint | Status | Time ms |", "|---|---:|---:|"])
    lines.extend(
        f"| {escape_cell(item['endpoint'])} | {item['status']} | {item['time_ms']} |"
        for item in summary["http_errors"]
    )
    if not summary["http_errors"]:
        lines.append("| None |  |  |")
    lines.extend(["", "## Slow requests", "", "| Endpoint | Status | Time ms |", "|---|---:|---:|"])
    lines.extend(
        f"| {escape_cell(item['endpoint'])} | {item['status']} | {item['time_ms']} |"
        for item in summary["slow_requests"]
    )
    if not summary["slow_requests"]:
        lines.append("| None |  |  |")
    lines.extend(["", "## GraphQL operations", "", "| Operation | Count |", "|---|---:|"])
    lines.extend(
        f"| {escape_cell(operation)} | {count} |"
        for operation, count in summary["graphql_operations"].items()
    )
    if not summary["graphql_operations"]:
        lines.append("| None detected | 0 |")
    lines.extend(
        [
            "",
            "## Redaction",
            "",
            "This summary excludes headers, cookies, query values, and request/response bodies",
            "",
        ]
    )
    return "\n".join(lines)


def self_test() -> int:
    fixture = {
        "log": {
            "entries": [
                {
                    "time": 120,
                    "request": {"method": "GET", "url": "https://api.example.test/v1/profile?token=secret"},
                    "response": {"status": 200, "bodySize": 100},
                },
                {
                    "time": 1250,
                    "request": {
                        "method": "POST",
                        "url": "https://api.example.test/graphql",
                        "postData": {
                            "mimeType": "application/json",
                            "text": json.dumps({"operationName": "LoadHome", "variables": {"secret": "hidden"}}),
                        },
                    },
                    "response": {"status": 200, "bodySize": 200},
                },
                {
                    "time": 300,
                    "request": {"method": "GET", "url": "https://api.example.test/v1/orders"},
                    "response": {"status": 503, "bodySize": 50},
                },
            ]
        }
    }
    result = summarize(fixture, 1000)
    checks = [
        result["request_count"] == 3,
        result["http_error_count"] == 1,
        result["slow_request_count"] == 1,
        result["graphql_operations"] == {"LoadHome": 1},
        "secret" not in json.dumps(result),
    ]
    if all(checks):
        print("PASS analyze-mobile-har self-test")
        return 0
    print("FAIL analyze-mobile-har self-test", file=sys.stderr)
    return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a sanitized mobile-network summary from HAR")
    parser.add_argument("har", nargs="?", type=Path)
    parser.add_argument("--slow-ms", type=float, default=1000)
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        return self_test()
    if args.har is None:
        print("HAR path is required unless --self-test is used", file=sys.stderr)
        return 2
    try:
        document = json.loads(args.har.read_text(encoding="utf-8"))
        summary = summarize(document, args.slow_ms)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"BLOCKED: invalid HAR: {exc}", file=sys.stderr)
        return 2
    rendered = (
        json.dumps(summary, ensure_ascii=False, indent=2)
        if args.format == "json"
        else markdown(summary)
    )
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
        print(args.output)
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
