#!/usr/bin/env python3
"""Prepare, run, normalize, and report JMeter or k6 performance tests."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from adapters import jmeter_adapter, k6_adapter  # noqa: E402
from discovery.discover_tests import discover, resolve_engine  # noqa: E402
from lib.config import (  # noqa: E402
    is_production,
    load_run_config,
    public_config,
    requires_load_approval,
    validate_run_config,
    workload_numbers,
)
from parsers.jtl_parser import parse_jtl  # noqa: E402
from parsers.k6_parser import parse_k6  # noqa: E402
from reporters.common_report import write_reports  # noqa: E402
from reporters.comparison_report import compare_results, write_comparison  # noqa: E402


def emit(value: Any, stream: Any = sys.stdout) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2), file=stream)


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def doctor() -> dict[str, Any]:
    java = shutil.which("java")
    jmeter = shutil.which("jmeter")
    k6 = shutil.which("k6")
    return {
        "java": {"status": "available" if java else "runtime_missing", "path": java},
        "jmeter": {"status": "available" if jmeter else "runtime_missing", "path": jmeter},
        "k6": {"status": "available" if k6 else "runtime_missing", "path": k6},
        "note": "A missing runner blocks execution only; prepare and static validation remain available",
    }


def load_validated(config_path: Path) -> tuple[dict[str, Any], list[str]]:
    config = load_run_config(config_path.resolve(), SKILL_ROOT)
    errors, warnings = validate_run_config(config)
    if errors:
        raise ValueError("; ".join(errors))
    return config, warnings


def build_run_plan(
    config: dict[str, Any],
    project_root: Path,
    output_root: Path,
    warnings: list[str],
) -> tuple[Path, dict[str, Any]]:
    engine, script_path, found = resolve_engine(config, project_root)
    if engine is None:
        raise ValueError(
            "Auto engine unresolved: set engine to jmeter or k6, or provide one .jmx/.js/.ts script"
        )
    run_dir = output_root / f"run-{utc_stamp()}"
    suffix = 1
    while run_dir.exists():
        run_dir = output_root / f"run-{utc_stamp()}-{suffix}"
        suffix += 1
    for directory in (run_dir, run_dir / "logs", run_dir / "raw", run_dir / "engine-report"):
        directory.mkdir(parents=True, exist_ok=False)

    if engine == "jmeter":
        engine_plan = jmeter_adapter.prepare(config, run_dir, script_path)
    else:
        engine_plan = k6_adapter.prepare(config, run_dir, script_path)
    engine_plan["warnings"] = sorted(set(warnings + engine_plan.get("warnings", [])))
    plan = {
        "status": "PREPARED",
        "runId": run_dir.name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "engine": engine,
        "projectRoot": str(project_root.resolve()),
        "config": public_config(config),
        "discovery": found,
        "enginePlan": engine_plan,
        "safety": {
            "requiresLoadApproval": requires_load_approval(config),
            "production": is_production(config),
            "maxUsers": workload_numbers(config)["maxUsers"],
            "configuredMaxUsers": int(config.get("safety", {}).get("maxUsers", 100)),
        },
    }
    (run_dir / "run-config.yaml").write_text(
        yaml.safe_dump(public_config(config), sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    (run_dir / "run-plan.json").write_text(
        json.dumps(plan, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return run_dir, plan


def _redact(text: str) -> str:
    patterns = [
        (re.compile(r"(?i)(authorization|token|password|cookie|api[_-]?key)\s*[:=]\s*\S+"), r"\1=[REDACTED]"),
        (re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+"), "Bearer [REDACTED]"),
    ]
    for pattern, replacement in patterns:
        text = pattern.sub(replacement, text)
    return text


def _execute(
    command: list[str],
    environment: dict[str, str],
    log_path: Path,
    timeout_seconds: int,
) -> int:
    completed = subprocess.run(
        command,
        cwd=log_path.parent.parent,
        env={**os.environ, **environment},
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        check=False,
    )
    log_path.write_text(
        _redact(f"exit_code={completed.returncode}\n\nSTDOUT\n{completed.stdout}\n\nSTDERR\n{completed.stderr}"),
        encoding="utf-8",
    )
    return completed.returncode


def normalize(engine: str, raw_result: Path, config: dict[str, Any], run_dir: Path) -> dict[str, Any]:
    if engine == "jmeter":
        result = parse_jtl(raw_result, config)
    elif engine == "k6":
        result = parse_k6(raw_result, config)
    else:
        raise ValueError("engine must be jmeter or k6")
    artifacts = write_reports(result, run_dir)
    return {"result": result, "artifacts": artifacts}


def run_prepared(
    run_dir: Path,
    approve_load: bool,
    approve_production: bool,
    approve_high_load: bool,
) -> dict[str, Any]:
    plan_path = run_dir / "run-plan.json"
    if not plan_path.is_file():
        raise ValueError(f"run plan not found: {plan_path}")
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    config = plan["config"]
    safety = plan["safety"]
    engine_plan = plan["enginePlan"]
    if safety["production"] and not approve_production:
        raise PermissionError("Production target requires --approve-production immediately before execution")
    if safety["requiresLoadApproval"] and not approve_load:
        raise PermissionError("Main load requires --approve-load immediately before execution")
    if safety["maxUsers"] > safety["configuredMaxUsers"] and not approve_high_load:
        raise PermissionError(
            "Workload exceeds configured maxUsers and requires --approve-high-load"
        )
    runtime = doctor()[plan["engine"]]
    if runtime["status"] != "available":
        raise RuntimeError(f"{plan['engine']} runtime_missing; prepare succeeded but execution is blocked")

    numbers = workload_numbers(config)
    timeout_seconds = max(
        120,
        int(numbers["rampUpSeconds"])
        + int(numbers["holdSeconds"])
        + int(numbers["rampDownSeconds"])
        + 120,
    )
    smoke_code = _execute(
        engine_plan["smokeCommand"],
        engine_plan.get("smokeEnvironment", {}),
        run_dir / "logs" / "smoke.log",
        min(timeout_seconds, 300),
    )
    if smoke_code != 0:
        plan["status"] = "BLOCKED_SMOKE_FAILED"
        plan["smokeExitCode"] = smoke_code
        plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"status": plan["status"], "runDir": str(run_dir.resolve()), "smokeExitCode": smoke_code}

    main_code = _execute(
        engine_plan["mainCommand"],
        engine_plan.get("mainEnvironment", {}),
        run_dir / "logs" / "main.log",
        timeout_seconds,
    )
    raw_result = Path(engine_plan["rawResult"])
    if not raw_result.is_file():
        raise RuntimeError(f"engine produced no raw result: {raw_result}")
    normalized = normalize(plan["engine"], raw_result, config, run_dir)
    plan["status"] = normalized["result"]["status"]
    plan["smokeExitCode"] = smoke_code
    plan["mainExitCode"] = main_code
    plan["finishedAt"] = datetime.now(timezone.utc).isoformat()
    plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    return {
        "status": normalized["result"]["status"],
        "runDir": str(run_dir.resolve()),
        "mainExitCode": main_code,
        "artifacts": normalized["artifacts"],
    }


def wizard(output: Path) -> None:
    print("Performance QA common configuration wizard")
    engine = input("Engine [auto|jmeter|k6]: ").strip().lower() or "auto"
    test_type = input("Test type [smoke|load|stress|spike|soak|volume|scalability|custom]: ").strip().lower() or "smoke"
    model = input("Workload model [concurrent-users|request-rate|total-iterations]: ").strip().lower()
    model = model or "concurrent-users"
    base_url = input("Target base URL: ").strip()
    environment = input("Environment [dev|qa|staging|production]: ").strip() or "qa"
    workload: dict[str, Any] = {"model": model}
    if model == "concurrent-users":
        workload.update(
            {
                "users": int(input("Virtual users: ").strip() or "1"),
                "rampUp": input("Ramp-up [30s]: ").strip() or "30s",
                "holdDuration": input("Hold duration [2m]: ").strip() or "2m",
                "rampDown": input("Ramp-down [30s]: ").strip() or "30s",
                "thinkTime": input("Think time [1s]: ").strip() or "1s",
            }
        )
    elif model == "request-rate":
        workload.update(
            {
                "targetRate": float(input("Target requests per time unit: ").strip()),
                "timeUnit": input("Time unit [1s]: ").strip() or "1s",
                "preAllocatedVUs": int(input("Pre-allocated VUs: ").strip()),
                "maxVUs": int(input("Maximum VUs: ").strip()),
                "holdDuration": input("Duration [10m]: ").strip() or "10m",
                "rampUp": "0s",
                "rampDown": "0s",
                "thinkTime": "0s",
            }
        )
    else:
        workload.update(
            {
                "iterations": int(input("Total iterations: ").strip()),
                "users": int(input("Virtual users [1]: ").strip() or "1"),
                "holdDuration": input("Maximum duration [10m]: ").strip() or "10m",
                "rampUp": "0s",
                "rampDown": "0s",
                "thinkTime": input("Think time [1s]: ").strip() or "1s",
            }
        )
    config = {
        "engine": engine,
        "testType": test_type,
        "target": {
            "environment": environment,
            "baseUrl": base_url,
            "owner": input("System owner: ").strip(),
            "authorizationReference": input("Authorization reference: ").strip(),
            "production": environment.lower() in {"prod", "production"},
        },
        "workload": workload,
        "thresholds": {
            "p95Ms": float(input("Maximum P95 ms [1000]: ").strip() or "1000"),
            "p99Ms": float(input("Maximum P99 ms [2000]: ").strip() or "2000"),
            "maxErrorRate": float(input("Maximum error rate [0.01]: ").strip() or "0.01"),
            "minRequestsPerSecond": float(input("Minimum requests/second [0]: ").strip() or "0"),
            "abortOnFailure": (input("Abort on failure [yes|no]: ").strip().lower() == "yes"),
        },
        "script": {"path": input("Existing .jmx/.js/.ts path, or blank to generate: ").strip() or None},
        "requests": [],
        "safety": {
            "maxUsers": 100,
            "abortConditions": [
                item.strip()
                for item in input("Abort conditions, comma-separated: ").split(",")
                if item.strip()
            ],
            "cleanup": input("Cleanup: ").strip(),
            "monitoring": input("Monitoring reference: ").strip(),
        },
        "report": {"html": True, "markdown": True, "json": True, "keepRawResult": True},
    }
    if test_type == "volume":
        config["dataProfile"] = {
            "datasetReference": input("Dataset reference: ").strip(),
            "records": int(input("Record count [100000]: ").strip() or "100000"),
            "payloadSizeBytes": int(input("Payload size bytes [1024]: ").strip() or "1024"),
            "cleanup": input("Volume cleanup: ").strip(),
            "integrityCheck": input("Data integrity check: ").strip(),
        }
    elif test_type == "scalability":
        config["scalability"] = {
            "comparisonGroup": input("Scalability comparison group: ").strip(),
            "profile": input("Resource profile name: ").strip(),
            "resourceReference": input("Resource reference: ").strip(),
            "expectedCapacity": {
                "minUsers": int(input("Minimum supported users [100]: ").strip() or "100"),
                "minRequestsPerSecond": float(
                    input("Minimum requests/second [1]: ").strip() or "1"
                ),
            },
        }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8")
    emit({"written": str(output.resolve()), "next": "Add requests when no script is supplied, then validate"})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("doctor")

    discover_parser = subparsers.add_parser("discover")
    discover_parser.add_argument("--root", default=".")

    wizard_parser = subparsers.add_parser("wizard")
    wizard_parser.add_argument("--output", default="run-config.yaml")

    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("--config", required=True)

    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--config", required=True)
    prepare_parser.add_argument("--project-root", default=".")
    prepare_parser.add_argument("--output-root", default="artifacts")

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--run-dir", required=True)
    run_parser.add_argument("--approve-load", action="store_true")
    run_parser.add_argument("--approve-production", action="store_true")
    run_parser.add_argument("--approve-high-load", action="store_true")

    normalize_parser = subparsers.add_parser("normalize")
    normalize_parser.add_argument("--engine", choices=("jmeter", "k6"), required=True)
    normalize_parser.add_argument("--input", required=True)
    normalize_parser.add_argument("--config", required=True)
    normalize_parser.add_argument("--output-dir", required=True)

    compare_parser = subparsers.add_parser("compare")
    compare_parser.add_argument("--baseline", required=True)
    compare_parser.add_argument("--candidate", required=True)
    compare_parser.add_argument("--output-dir", required=True)

    args = parser.parse_args()
    try:
        if args.command == "doctor":
            emit(doctor())
        elif args.command == "discover":
            emit(discover(Path(args.root).resolve()))
        elif args.command == "wizard":
            wizard(Path(args.output))
        elif args.command == "validate":
            config, warnings = load_validated(Path(args.config))
            engine, script, found = resolve_engine(config, Path(args.config).resolve().parent)
            if engine is None:
                emit(
                    {
                        "passed": False,
                        "status": "ENGINE_REQUIRED",
                        "error": "Choose jmeter or k6 because auto-discovery found no exact engine",
                        "discovery": found,
                        "warnings": warnings,
                    },
                    sys.stderr,
                )
                return 3
            emit({"passed": True, "engine": engine, "script": script, "discovery": found, "warnings": warnings})
        elif args.command == "prepare":
            config, warnings = load_validated(Path(args.config))
            run_dir, plan = build_run_plan(
                config,
                Path(args.project_root).resolve(),
                Path(args.output_root).resolve(),
                warnings,
            )
            emit({"passed": True, "runDir": str(run_dir.resolve()), "plan": plan})
        elif args.command == "run":
            emit(
                run_prepared(
                    Path(args.run_dir).resolve(),
                    args.approve_load,
                    args.approve_production,
                    args.approve_high_load,
                )
            )
        elif args.command == "normalize":
            config, _ = load_validated(Path(args.config))
            emit(
                normalize(
                    args.engine,
                    Path(args.input).resolve(),
                    config,
                    Path(args.output_dir).resolve(),
                )
            )
        elif args.command == "compare":
            baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
            candidate = json.loads(Path(args.candidate).read_text(encoding="utf-8"))
            comparison = compare_results(baseline, candidate)
            emit(
                {
                    "comparison": comparison,
                    "artifacts": write_comparison(comparison, Path(args.output_dir).resolve()),
                }
            )
        return 0
    except PermissionError as exc:
        emit({"passed": False, "status": "APPROVAL_REQUIRED", "error": str(exc)}, sys.stderr)
        return 3
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, yaml.YAMLError) as exc:
        emit({"passed": False, "status": "BLOCKED", "error": str(exc)}, sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
