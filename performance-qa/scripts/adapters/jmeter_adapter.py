"""Translate common performance config into a JMeter plan and commands."""

from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from engines.jmeter.generate_jmx import generate, validate_config
from lib.config import workload_numbers


def _parameterize_existing(source: Path, output: Path, config: dict[str, Any]) -> None:
    tree = ET.parse(source)
    root = tree.getroot()
    numbers = workload_numbers(config)
    main_loops = (
        max(1, math.ceil(int(numbers["iterations"]) / int(numbers["maxUsers"])))
        if numbers["model"] == "total-iterations"
        else 1
    )
    replacements = {
        "ThreadGroup.num_threads": f"${{__P(THREADS,{int(numbers['maxUsers'])})}}",
        "ThreadGroup.ramp_time": f"${{__P(RAMP_UP,{int(numbers['rampUpSeconds'])})}}",
        "LoopController.loops": f"${{__P(LOOPS,{main_loops})}}",
        "ThreadGroup.duration": (
            f"${{__P(DURATION,"
            f"{int(numbers['rampUpSeconds']) + int(numbers['holdSeconds']) + int(numbers['rampDownSeconds'])}"
            ")}"
        ),
    }
    for node in root.iter("stringProp"):
        name = node.attrib.get("name")
        if name in replacements:
            node.text = replacements[name]
        if name == "ThreadGroup.on_sample_error" and config["thresholds"].get("abortOnFailure"):
            node.text = "stoptestnow"
    ET.indent(root, space="  ")
    payload = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    ET.fromstring(payload)
    output.write_bytes(payload + b"\n")


def _request(raw: dict[str, Any]) -> dict[str, Any]:
    mapped = {
        "name": raw["name"],
        "method": str(raw["method"]).upper(),
        "path": raw["path"],
        "expected_status": raw["expectedStatus"],
    }
    aliases = {
        "body": "body",
        "headers": "headers",
        "responseContains": "response_contains",
        "timeoutMs": "timeout_ms",
    }
    for source, target in aliases.items():
        if source in raw:
            mapped[target] = raw[source]
    if "jsonExtractors" in raw:
        mapped["json_extractors"] = [
            {
                "name": extractor["name"],
                "json_path": extractor.get("jsonPath", extractor.get("json_path")),
                "match_number": extractor.get("matchNumber", extractor.get("match_number", 1)),
                "default": extractor.get("default", "NOT_FOUND"),
            }
            for extractor in raw["jsonExtractors"]
        ]
    return mapped


def translate(config: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    numbers = workload_numbers(config)
    workload = config["workload"]
    model = str(workload["model"])
    users = int(numbers["maxUsers"])
    loops = 1
    duration = 0
    warnings: list[str] = []
    if model == "total-iterations":
        loops = max(1, math.ceil(int(numbers["iterations"]) / users))
    else:
        duration = max(
            1,
            int(numbers["rampUpSeconds"])
            + int(numbers["holdSeconds"])
            + int(numbers["rampDownSeconds"]),
        )
    if int(numbers["rampDownSeconds"]) > 0:
        warnings.append(
            "Standard JMeter Thread Group uses total scheduler duration; exact ramp-down needs an approved plugin"
        )

    test_data = config.get("testData", {})
    csv_config = None
    if isinstance(test_data, dict) and test_data.get("file"):
        csv_config = {
            "filename": test_data["file"],
            "variable_names": test_data.get("variables", ""),
            "delimiter": test_data.get("delimiter", ","),
            "recycle": not bool(test_data.get("uniquePerUser", False)),
            "stop_thread": bool(test_data.get("uniquePerUser", False)),
            "share_mode": "shareMode.all",
        }
        if not csv_config["variable_names"]:
            warnings.append("testData.variables is empty; configure CSV variable names before execution")

    mapped = {
        "name": config.get("name", f"{config['testType']} performance run"),
        "base_url": config["target"]["baseUrl"],
        "threads": users,
        "ramp_up_seconds": int(numbers["rampUpSeconds"]),
        "loops": loops,
        "duration_seconds": duration,
        "think_time_ms": int(numbers["thinkTimeSeconds"]) * 1000,
        "think_time_variation_ms": 0,
        "headers": config.get("headers", {}),
        "requests": [_request(request) for request in config.get("requests", [])],
        "abort_on_failure": bool(config["thresholds"].get("abortOnFailure", False)),
    }
    if csv_config:
        mapped["csv"] = csv_config
    if model == "request-rate":
        mapped["target_rps"] = float(numbers["targetRate"])
    return mapped, warnings


def prepare(
    config: dict[str, Any],
    run_dir: Path,
    script_path: str | None,
) -> dict[str, Any]:
    warnings: list[str] = []
    if script_path:
        source_path = Path(script_path)
        ET.parse(source_path)
        plan_path = run_dir / source_path.name
        _parameterize_existing(source_path, plan_path, config)
        warnings.append("Existing JMX was copied and workload properties were parameterized; review the copied plan")
    else:
        mapped, warnings = translate(config)
        errors = validate_config(mapped)
        if errors:
            raise ValueError("; ".join(errors))
        plan_path = run_dir / "generated-test-plan.jmx"
        payload = ET.tostring(generate(mapped).getroot(), encoding="utf-8", xml_declaration=True)
        ET.fromstring(payload)
        plan_path.write_bytes(payload + b"\n")
        (run_dir / "jmeter-adapter-config.json").write_text(
            json.dumps(mapped, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    numbers = workload_numbers(config)
    main_loops = (
        max(1, math.ceil(int(numbers["iterations"]) / int(numbers["maxUsers"])))
        if numbers["model"] == "total-iterations"
        else 1
    )
    raw_dir = run_dir / "raw"
    engine_report = run_dir / "engine-report"
    smoke = [
        "jmeter",
        "-n",
        "-t",
        str(plan_path),
        "-JTHREADS=1",
        "-JRAMP_UP=1",
        "-JLOOPS=1",
        "-JDURATION=0",
        "-l",
        str(raw_dir / "smoke.jtl"),
    ]
    main = [
        "jmeter",
        "-n",
        "-t",
        str(plan_path),
        f"-JTHREADS={int(numbers['maxUsers'])}",
        f"-JRAMP_UP={int(numbers['rampUpSeconds'])}",
        f"-JLOOPS={main_loops}",
        f"-JDURATION={int(numbers['rampUpSeconds']) + int(numbers['holdSeconds']) + int(numbers['rampDownSeconds'])}",
        "-l",
        str(raw_dir / "results.jtl"),
        "-e",
        "-o",
        str(engine_report),
    ]
    return {
        "engine": "jmeter",
        "script": str(plan_path.resolve()),
        "smokeCommand": smoke,
        "mainCommand": main,
        "rawResult": str((raw_dir / "results.jtl").resolve()),
        "nativeReport": str(engine_report.resolve()),
        "warnings": warnings,
    }
