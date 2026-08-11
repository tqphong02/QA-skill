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


ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def load_env_file(env_file: Path) -> dict[str, str]:
    """Load a small dotenv file without executing shell syntax."""

    if not env_file.is_file():
        raise ValueError(f"env file not found: {env_file}")

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(env_file.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ValueError(f"malformed env file line {line_number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        if not ENV_KEY_RE.fullmatch(key):
            raise ValueError(f"invalid env key on line {line_number}: {key}")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


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


def wizard(output: Path, env_file: Path | None = None, non_interactive: bool = False) -> None:
    env_values = {key: value for key, value in os.environ.items() if key.startswith("PERF_")}
    if env_file:
        env_values.update(load_env_file(env_file))

    def ask(key: str, label: str, default: str | None = None, required: bool = False) -> str:
        configured = env_values[key] if key in env_values else default
        suffix = f" [{configured}]" if configured not in (None, "") else ""
        if non_interactive:
            value = "" if configured is None else str(configured).strip()
        else:
            value = input(f"{label}{suffix}: ").strip()
            if not value and configured is not None:
                value = str(configured).strip()
        if required and not value:
            raise ValueError(f"{key} is required; set it in the env file or enter it interactively")
        return value

    def number(
        key: str,
        label: str,
        default: str | None,
        kind: type[int] | type[float],
        required: bool = False,
    ) -> int | float:
        value = ask(key, label, default, required=required)
        try:
            return kind(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a valid {kind.__name__}") from exc

    def boolean(key: str, label: str, default: str = "false") -> bool:
        value = ask(key, label, default).lower()
        if value in {"1", "true", "yes", "y", "on"}:
            return True
        if value in {"0", "false", "no", "n", "off"}:
            return False
        raise ValueError(f"{key} must be true/false or yes/no")

    def csv_values(key: str, label: str, default: str = "") -> list[str]:
        return [item.strip() for item in ask(key, label, default).split(",") if item.strip()]

    print("Performance QA common configuration wizard")
    engine = ask("PERF_ENGINE", "Engine (auto|jmeter|k6)", "auto").lower()
    test_type = ask(
        "PERF_TEST_TYPE",
        "Test type (smoke|load|stress|spike|soak|volume|scalability|custom)",
        "smoke",
    ).lower()
    model = ask(
        "PERF_WORKLOAD_MODEL",
        "Workload model (concurrent-users|request-rate|total-iterations)",
        "concurrent-users",
    ).lower()
    base_url = ask("PERF_TARGET_BASE_URL", "Target base URL", required=True)
    environment = ask(
        "PERF_TARGET_ENVIRONMENT",
        "Environment (dev|qa|staging|production)",
        "qa",
        required=True,
    )
    workload: dict[str, Any] = {"model": model}
    if model == "concurrent-users":
        workload.update(
            {
                "users": number("PERF_USERS", "Virtual users", "1", int),
                "rampUp": ask("PERF_RAMP_UP", "Ramp-up", "30s"),
                "holdDuration": ask("PERF_HOLD_DURATION", "Hold duration", "2m"),
                "rampDown": ask("PERF_RAMP_DOWN", "Ramp-down", "30s"),
                "thinkTime": ask("PERF_THINK_TIME", "Think time", "1s"),
            }
        )
    elif model == "request-rate":
        workload.update(
            {
                "targetRate": number("PERF_TARGET_RATE", "Target requests per time unit", "10", float),
                "timeUnit": ask("PERF_TIME_UNIT", "Time unit", "1s"),
                "preAllocatedVUs": number("PERF_PRE_ALLOCATED_VUS", "Pre-allocated VUs", "2", int),
                "maxVUs": number("PERF_MAX_VUS", "Maximum VUs", "10", int),
                "holdDuration": ask("PERF_HOLD_DURATION", "Duration", "10m"),
                "rampUp": "0s",
                "rampDown": "0s",
                "thinkTime": "0s",
            }
        )
    else:
        workload.update(
            {
                "iterations": number("PERF_ITERATIONS", "Total iterations", "100", int),
                "users": number("PERF_USERS", "Virtual users", "1", int),
                "holdDuration": ask("PERF_HOLD_DURATION", "Maximum duration", "10m"),
                "rampUp": "0s",
                "rampDown": "0s",
                "thinkTime": ask("PERF_THINK_TIME", "Think time", "1s"),
            }
        )
    test_data_file = ask("PERF_TEST_DATA_FILE", "Test data file", "")
    config = {
        "engine": engine,
        "testType": test_type,
        "target": {
            "environment": environment,
            "baseUrl": base_url,
            "owner": ask("PERF_TARGET_OWNER", "System owner", required=True),
            "authorizationReference": ask(
                "PERF_AUTHORIZATION_REFERENCE",
                "Authorization reference",
                required=True,
            ),
            "production": environment.lower() in {"prod", "production"},
        },
        "workload": workload,
        "thresholds": {
            "p95Ms": number("PERF_P95_MS", "Maximum P95 ms", "1000", float),
            "p99Ms": number("PERF_P99_MS", "Maximum P99 ms", "2000", float),
            "maxErrorRate": number("PERF_MAX_ERROR_RATE", "Maximum error rate", "0.01", float),
            "minRequestsPerSecond": number(
                "PERF_MIN_REQUESTS_PER_SECOND", "Minimum requests/second", "0", float
            ),
            "abortOnFailure": boolean("PERF_ABORT_ON_FAILURE", "Abort on failure"),
        },
        "script": {
            "path": ask("PERF_SCRIPT_PATH", "Existing .jmx/.js/.ts path, or blank to generate", "") or None
        },
        "requests": [],
        "safety": {
            "maxUsers": number("PERF_MAX_USERS", "Safety maximum users", "100", int),
            "abortConditions": csv_values(
                "PERF_ABORT_CONDITIONS",
                "Abort conditions, comma-separated",
                "error rate exceeds agreed limit, service health check fails",
            ),
            "cleanup": ask("PERF_CLEANUP", "Cleanup", "no mutated test data"),
            "monitoring": ask("PERF_MONITORING", "Monitoring reference", "service dashboard"),
        },
        "report": {"html": True, "markdown": True, "json": True, "keepRawResult": True},
    }
    if test_data_file:
        config["testData"] = {
            "file": test_data_file,
            "variables": ask("PERF_TEST_DATA_VARIABLES", "Test data variables", ""),
            "uniquePerUser": boolean("PERF_TEST_DATA_UNIQUE_PER_USER", "Unique data per user", "false"),
        }
    if test_type == "volume":
        config["dataProfile"] = {
            "datasetReference": ask("PERF_DATASET_REFERENCE", "Dataset reference", required=True),
            "records": number("PERF_RECORDS", "Record count", "100000", int),
            "payloadSizeBytes": number("PERF_PAYLOAD_SIZE_BYTES", "Payload size bytes", "1024", int),
            "cleanup": ask("PERF_VOLUME_CLEANUP", "Volume cleanup", "remove the isolated tenant"),
            "integrityCheck": ask(
                "PERF_INTEGRITY_CHECK",
                "Data integrity check",
                "compare record count and checksum",
            ),
        }
    elif test_type == "scalability":
        config["scalability"] = {
            "comparisonGroup": ask("PERF_COMPARISON_GROUP", "Scalability comparison group", required=True),
            "profile": ask("PERF_RESOURCE_PROFILE", "Resource profile name", required=True),
            "resourceReference": ask("PERF_RESOURCE_REFERENCE", "Resource reference", required=True),
            "expectedCapacity": {
                "minUsers": number("PERF_MIN_CAPACITY_USERS", "Minimum supported users", "100", int),
                "minRequestsPerSecond": number(
                    "PERF_MIN_CAPACITY_RPS", "Minimum requests/second", "1", float
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
    wizard_parser.add_argument(
        "--env-file",
        help="dotenv file containing PERF_* defaults; values are never printed or executed as shell code",
    )
    wizard_parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="generate the config from env values and fail when a required value is missing",
    )

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
            wizard(
                Path(args.output),
                Path(args.env_file) if args.env_file else None,
                args.non_interactive,
            )
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
