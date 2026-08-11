"""Translate common performance config into a portable k6 script and commands."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from lib.config import duration_text, workload_numbers


def _options(config: dict[str, Any]) -> dict[str, Any]:
    workload = config["workload"]
    numbers = workload_numbers(config)
    model = workload["model"]
    thresholds = config["thresholds"]
    abort_on_failure = bool(thresholds.get("abortOnFailure", False))

    def threshold_rule(expression: str) -> str | dict[str, Any]:
        if not abort_on_failure:
            return expression
        return {"threshold": expression, "abortOnFail": True, "delayAbortEval": "10s"}

    threshold_options = {
        "http_req_duration": [
            threshold_rule(f"p(95)<{thresholds['p95Ms']}"),
            threshold_rule(f"p(99)<{thresholds['p99Ms']}"),
        ],
        "http_req_failed": [threshold_rule(f"rate<{thresholds['maxErrorRate']}")],
    }
    minimum_rps = float(thresholds.get("minRequestsPerSecond", 0) or 0)
    if minimum_rps > 0:
        threshold_options["http_reqs"] = [threshold_rule(f"rate>{minimum_rps}")]

    if model == "request-rate":
        scenarios = {
            "performance": {
                "executor": "constant-arrival-rate",
                "rate": float(numbers["targetRate"]),
                "timeUnit": str(workload.get("timeUnit", "1s")),
                "duration": duration_text(int(numbers["holdSeconds"])),
                "preAllocatedVUs": int(workload["preAllocatedVUs"]),
                "maxVUs": int(workload["maxVUs"]),
            }
        }
    elif model == "total-iterations":
        scenarios = {
            "performance": {
                "executor": "shared-iterations",
                "vus": int(numbers["maxUsers"]),
                "iterations": int(numbers["iterations"]),
                "maxDuration": duration_text(
                    int(numbers["rampUpSeconds"])
                    + int(numbers["holdSeconds"])
                    + int(numbers["rampDownSeconds"])
                ),
            }
        }
    else:
        scenarios = {
            "performance": {
                "executor": "ramping-vus",
                "startVUs": 0,
                "stages": [
                    {"duration": duration_text(int(numbers["rampUpSeconds"])), "target": int(numbers["maxUsers"])},
                    {"duration": duration_text(int(numbers["holdSeconds"])), "target": int(numbers["maxUsers"])},
                    {"duration": duration_text(int(numbers["rampDownSeconds"])), "target": 0},
                ],
            }
        }
    return {
        "scenarios": scenarios,
        "thresholds": threshold_options,
        "summaryTrendStats": ["avg", "p(90)", "p(95)", "p(99)", "max"],
    }


def generate_script(config: dict[str, Any], output: Path) -> None:
    public = {
        "baseUrl": config["target"]["baseUrl"],
        "testType": config["testType"],
        "requests": config.get("requests", []),
        "headers": config.get("headers", {}),
        "thinkTimeSeconds": workload_numbers(config)["thinkTimeSeconds"],
        "dataProfile": config.get("dataProfile"),
        "scalability": config.get("scalability"),
    }
    options = _options(config)
    script = f"""import http from 'k6/http';
import {{ check, sleep }} from 'k6';

const CONFIG = {json.dumps(public, ensure_ascii=False)};
const MAIN_OPTIONS = {json.dumps(options, ensure_ascii=False)};

export const options = __ENV.PERF_SMOKE === 'true'
  ? {{
      scenarios: {{ smoke: {{ executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '1m' }} }},
      thresholds: MAIN_OPTIONS.thresholds,
      summaryTrendStats: MAIN_OPTIONS.summaryTrendStats,
    }}
  : MAIN_OPTIONS;

function resolveValue(value) {{
  if (typeof value === 'string') {{
    return value.replace(/\\$\\{{([A-Z0-9_]+)\\}}/g, (_, name) => __ENV[name] || '');
  }}
  if (Array.isArray(value)) return value.map(resolveValue);
  if (value && typeof value === 'object') {{
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveValue(child)]));
  }}
  return value;
}}

export default function () {{
  const baseUrl = (__ENV.BASE_URL || CONFIG.baseUrl).replace(/\\/$/, '');
  for (const request of CONFIG.requests) {{
    const headers = resolveValue({{ ...CONFIG.headers, ...(request.headers || {{}}) }});
    const body = request.body === undefined ? null : JSON.stringify(resolveValue(request.body));
    const response = http.request(request.method, `${{baseUrl}}${{request.path}}`, body, {{
      headers,
      tags: {{ endpoint: `${{request.method}} ${{request.path}}` }},
    }});
    check(response, {{
      [`${{request.name}} status ${{request.expectedStatus}}`]: (res) => res.status === request.expectedStatus,
      [`${{request.name}} body assertion`]: (res) =>
        request.responseContains === undefined || res.body.includes(String(request.responseContains)),
    }});
  }}
  if (CONFIG.thinkTimeSeconds > 0) sleep(CONFIG.thinkTimeSeconds);
}}
"""
    output.write_text(script, encoding="utf-8")


def generate_wrapper(source: Path, config: dict[str, Any], output: Path) -> None:
    source_text = source.read_text(encoding="utf-8", errors="ignore")
    if "export default" not in source_text:
        raise ValueError("Existing k6 script must export a default flow for common workload adaptation")
    relative = os.path.relpath(source.resolve(), output.parent.resolve()).replace("\\", "/")
    if not relative.startswith("."):
        relative = f"./{relative}"
    options = _options(config)
    wrapper = f"""import sourceDefault, * as source from {json.dumps(relative)};

const MAIN_OPTIONS = {json.dumps(options, ensure_ascii=False)};

export const options = __ENV.PERF_SMOKE === 'true'
  ? {{
      scenarios: {{ smoke: {{ executor: 'shared-iterations', vus: 1, iterations: 1, maxDuration: '1m' }} }},
      thresholds: MAIN_OPTIONS.thresholds,
      summaryTrendStats: MAIN_OPTIONS.summaryTrendStats,
    }}
  : MAIN_OPTIONS;

export function setup() {{
  return typeof source.setup === 'function' ? source.setup() : undefined;
}}

export default function (data) {{
  return sourceDefault(data);
}}

export function teardown(data) {{
  if (typeof source.teardown === 'function') source.teardown(data);
}}
"""
    output.write_text(wrapper, encoding="utf-8")


def prepare(
    config: dict[str, Any],
    run_dir: Path,
    script_path: str | None,
) -> dict[str, Any]:
    warnings: list[str] = []
    if script_path:
        source = Path(script_path)
        selected = run_dir / f"adapted-{source.stem}.js"
        generate_wrapper(source, config, selected)
        warnings.append(
            "Existing k6 flow was wrapped so the common workload and thresholds override script options"
        )
        if config.get("requests"):
            warnings.append("Common requests are ignored because an existing k6 script defines the business flow")
    else:
        selected = run_dir / "generated-test.js"
        generate_script(config, selected)

    raw_dir = run_dir / "raw"
    engine_report = run_dir / "engine-report"
    smoke_summary = raw_dir / "smoke-summary.json"
    result_summary = raw_dir / "results.json"
    smoke = ["k6", "run", "--summary-export", str(smoke_summary), str(selected)]
    main = [
        "k6",
        "run",
        "--summary-export",
        str(result_summary),
        str(selected),
    ]
    numbers = workload_numbers(config)
    env = {
        "BASE_URL": config["target"]["baseUrl"],
        "USERS": str(numbers["maxUsers"]),
        "RAMP_UP": duration_text(int(numbers["rampUpSeconds"])),
        "HOLD_DURATION": duration_text(int(numbers["holdSeconds"])),
        "RAMP_DOWN": duration_text(int(numbers["rampDownSeconds"])),
        "K6_WEB_DASHBOARD": "true",
        "K6_WEB_DASHBOARD_PORT": "-1",
        "K6_WEB_DASHBOARD_EXPORT": str((engine_report / "k6-report.html").resolve()),
    }
    return {
        "engine": "k6",
        "script": str(selected.resolve()),
        "smokeCommand": smoke,
        "smokeEnvironment": {**env, "PERF_SMOKE": "true"},
        "mainCommand": main,
        "mainEnvironment": env,
        "rawResult": str(result_summary.resolve()),
        "nativeReport": str((engine_report / "k6-report.html").resolve()),
        "warnings": warnings,
    }
