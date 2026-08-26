"""Normalize engine metrics and evaluate common thresholds."""

from __future__ import annotations

from typing import Any

from lib.config import public_config, workload_numbers


def build_result(
    config: dict[str, Any],
    engine: str,
    metrics: dict[str, float | int],
    endpoints: list[dict[str, Any]] | None = None,
    errors: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    thresholds = config["thresholds"]
    checks = [
        {
            "metric": "p95",
            "expected": float(thresholds["p95Ms"]),
            "actual": float(metrics.get("p95Ms", 0)),
            "comparison": "<=",
            "status": "PASS" if float(metrics.get("p95Ms", 0)) <= float(thresholds["p95Ms"]) else "FAIL",
        },
        {
            "metric": "p99",
            "expected": float(thresholds["p99Ms"]),
            "actual": float(metrics.get("p99Ms", 0)),
            "comparison": "<=",
            "status": "PASS" if float(metrics.get("p99Ms", 0)) <= float(thresholds["p99Ms"]) else "FAIL",
        },
        {
            "metric": "errorRate",
            "expected": float(thresholds["maxErrorRate"]),
            "actual": float(metrics.get("errorRate", 0)),
            "comparison": "<=",
            "status": "PASS"
            if float(metrics.get("errorRate", 0)) <= float(thresholds["maxErrorRate"])
            else "FAIL",
        },
    ]
    minimum_rps = float(thresholds.get("minRequestsPerSecond", 0) or 0)
    if minimum_rps > 0:
        checks.append(
            {
                "metric": "requestsPerSecond",
                "expected": minimum_rps,
                "actual": float(metrics.get("requestsPerSecond", 0)),
                "comparison": ">=",
                "status": "PASS"
                if float(metrics.get("requestsPerSecond", 0)) >= minimum_rps
                else "FAIL",
            }
        )
    status = "FAIL" if any(check["status"] == "FAIL" for check in checks) else "PASS"
    numbers = workload_numbers(config)
    return {
        "status": status,
        "engine": engine,
        "testType": config["testType"],
        "environment": config["target"]["environment"],
        "target": {
            "baseUrl": config["target"]["baseUrl"],
            "owner": config["target"].get("owner"),
            "authorizationReference": config["target"].get("authorizationReference"),
        },
        "workload": {
            "model": numbers["model"],
            "users": numbers["maxUsers"],
            "iterations": numbers["iterations"],
            "targetRate": numbers["targetRate"],
            "rampUpSeconds": numbers["rampUpSeconds"],
            "holdDurationSeconds": numbers["holdSeconds"],
            "rampDownSeconds": numbers["rampDownSeconds"],
        },
        "testProfile": {
            "dataProfile": config.get("dataProfile"),
            "scalability": config.get("scalability"),
        },
        "summary": {
            "requests": int(metrics.get("requests", 0)),
            "successful": int(metrics.get("successful", 0)),
            "failed": int(metrics.get("failed", 0)),
            "errorRate": round(float(metrics.get("errorRate", 0)), 6),
            "requestsPerSecond": round(float(metrics.get("requestsPerSecond", 0)), 3),
            "averageMs": round(float(metrics.get("averageMs", 0)), 3),
            "p90Ms": round(float(metrics.get("p90Ms", 0)), 3),
            "p95Ms": round(float(metrics.get("p95Ms", 0)), 3),
            "p99Ms": round(float(metrics.get("p99Ms", 0)), 3),
            "durationSeconds": round(float(metrics.get("durationSeconds", 0)), 3),
        },
        "thresholds": checks,
        "slowestEndpoints": endpoints or [],
        "topErrors": errors or [],
        "safety": public_config(config).get("safety", {}),
    }
