"""Load, normalize, and validate the engine-neutral performance run config."""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import yaml
except ImportError as exc:  # pragma: no cover - setup installs PyYAML
    raise SystemExit("PyYAML is required: install package 'PyYAML'") from exc


ENGINES = {"auto", "jmeter", "k6"}
TEST_TYPES = {"smoke", "load", "stress", "spike", "soak", "volume", "scalability", "custom"}
WORKLOAD_MODELS = {"concurrent-users", "request-rate", "total-iterations"}
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
SENSITIVE_KEYS = {
    "password",
    "passwd",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "private_key",
}
PLACEHOLDER_RE = re.compile(r"(\$\{[^}]+\}|__ENV|__P\(|^<[^>]+>$)")


def load_document(file_path: Path) -> dict[str, Any]:
    text = file_path.read_text(encoding="utf-8")
    if file_path.suffix.lower() == ".json":
        value = json.loads(text)
    else:
        value = yaml.safe_load(text)
    if not isinstance(value, dict):
        raise ValueError(f"Config root must be an object: {file_path}")
    return value


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def parse_duration(value: Any, field: str) -> int:
    if isinstance(value, (int, float)) and value >= 0:
        return int(value)
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h)\s*", str(value or ""))
    if not match:
        raise ValueError(f"{field} must use ms, s, m, or h")
    amount = float(match.group(1))
    unit = match.group(2)
    seconds = {
        "ms": amount / 1000,
        "s": amount,
        "m": amount * 60,
        "h": amount * 3600,
    }[unit]
    return max(0, int(seconds))


def duration_text(seconds: int) -> str:
    if seconds % 3600 == 0 and seconds:
        return f"{seconds // 3600}h"
    if seconds % 60 == 0 and seconds:
        return f"{seconds // 60}m"
    return f"{seconds}s"


def _is_placeholder(value: Any) -> bool:
    return isinstance(value, str) and bool(PLACEHOLDER_RE.search(value))


def _scan_secrets(value: Any, location: str = "config") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_location = f"{location}.{key}"
            if str(key).lower() in SENSITIVE_KEYS and child not in (None, "") and not _is_placeholder(child):
                errors.append(f"{child_location} looks like a hardcoded secret; use an environment placeholder")
            errors.extend(_scan_secrets(child, child_location))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(_scan_secrets(child, f"{location}[{index}]"))
    return errors


def _positive_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def _validate_test_profile(config: dict[str, Any]) -> list[str]:
    """Validate the data/capacity contract required by volume-oriented runs."""

    errors: list[str] = []
    test_type = str(config.get("testType", "")).lower()

    if test_type == "volume":
        profile = config.get("dataProfile")
        if not isinstance(profile, dict):
            return ["dataProfile is required for volume testing"]
        if not str(profile.get("datasetReference", "")).strip():
            errors.append("dataProfile.datasetReference is required for volume testing")
        if not _positive_number(profile.get("records")) and not _positive_number(profile.get("payloadSizeBytes")):
            errors.append(
                "dataProfile.records or dataProfile.payloadSizeBytes must be a positive number for volume testing"
            )
        for field in ("records", "payloadSizeBytes"):
            if field in profile and profile[field] is not None and not _positive_number(profile[field]):
                errors.append(f"dataProfile.{field} must be a positive number when provided")
        if not str(profile.get("cleanup", "")).strip():
            errors.append("dataProfile.cleanup is required for volume testing")
        if not str(profile.get("integrityCheck", "")).strip():
            errors.append("dataProfile.integrityCheck is required for volume testing")

    if test_type == "scalability":
        profile = config.get("scalability")
        if not isinstance(profile, dict):
            return ["scalability is required for scalability testing"]
        for field in ("comparisonGroup", "profile", "resourceReference"):
            if not str(profile.get(field, "")).strip():
                errors.append(f"scalability.{field} is required for scalability testing")
        capacity = profile.get("expectedCapacity")
        if not isinstance(capacity, dict):
            errors.append("scalability.expectedCapacity is required for scalability testing")
        else:
            min_users = capacity.get("minUsers")
            min_rps = capacity.get("minRequestsPerSecond")
            if not _positive_number(min_users) and not _positive_number(min_rps):
                errors.append(
                    "scalability.expectedCapacity.minUsers or minRequestsPerSecond must be a positive number"
                )
            if min_users is not None and not _positive_number(min_users):
                errors.append("scalability.expectedCapacity.minUsers must be a positive number when provided")
            if min_rps is not None and not _positive_number(min_rps):
                errors.append(
                    "scalability.expectedCapacity.minRequestsPerSecond must be a positive number when provided"
                )

    return errors


def load_run_config(config_path: Path, skill_root: Path) -> dict[str, Any]:
    raw = load_document(config_path)
    defaults = load_document(skill_root / "config" / "defaults.yaml")
    test_type = str(raw.get("testType", defaults.get("testType", "smoke"))).lower()
    threshold_path = skill_root / "config" / "thresholds" / f"{test_type}.yaml"
    environment = str(raw.get("target", {}).get("environment", "")).lower()
    environment_path = skill_root / "config" / "environments" / f"{environment}.yaml"

    merged = defaults
    if threshold_path.is_file():
        merged = deep_merge(merged, load_document(threshold_path))
    if environment_path.is_file():
        merged = deep_merge(merged, load_document(environment_path))
    merged = deep_merge(merged, raw)
    merged["testType"] = test_type
    merged["_meta"] = {
        "configPath": str(config_path.resolve()),
        "skillRoot": str(skill_root.resolve()),
    }
    return merged


def workload_numbers(config: dict[str, Any]) -> dict[str, int | float]:
    workload = config.get("workload", {})
    model = str(workload.get("model", "concurrent-users"))
    users = int(workload.get("users", 1) or 1)
    max_vus = int(workload.get("maxVUs", users) or users)
    return {
        "users": users,
        "maxUsers": max(users, max_vus),
        "iterations": int(workload.get("iterations", 1) or 1),
        "targetRate": float(workload.get("targetRate", 0) or 0),
        "rampUpSeconds": parse_duration(workload.get("rampUp", "1s"), "workload.rampUp"),
        "holdSeconds": parse_duration(workload.get("holdDuration", "30s"), "workload.holdDuration"),
        "rampDownSeconds": parse_duration(workload.get("rampDown", "1s"), "workload.rampDown"),
        "thinkTimeSeconds": parse_duration(workload.get("thinkTime", "0s"), "workload.thinkTime"),
        "model": model,
    }


def is_production(config: dict[str, Any]) -> bool:
    target = config.get("target", {})
    if target.get("production") is True:
        return True
    environment = str(target.get("environment", "")).lower()
    host = (urlparse(str(target.get("baseUrl", ""))).hostname or "").lower()
    return environment in {"prod", "production"} or bool(re.search(r"(^|[.-])prod(uction)?([.-]|$)", host))


def requires_load_approval(config: dict[str, Any]) -> bool:
    numbers = workload_numbers(config)
    if str(config.get("testType", "")).lower() in {"stress", "spike", "soak", "volume", "scalability"}:
        return True
    if numbers["model"] == "request-rate":
        return numbers["targetRate"] > 1
    if numbers["model"] == "total-iterations":
        return numbers["iterations"] > 1 or numbers["maxUsers"] > 1
    return numbers["maxUsers"] > 1


def validate_run_config(config: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    engine = str(config.get("engine", "")).lower()
    test_type = str(config.get("testType", "")).lower()
    if engine not in ENGINES:
        errors.append(f"engine must be one of {sorted(ENGINES)}")
    if test_type not in TEST_TYPES:
        errors.append(f"testType must be one of {sorted(TEST_TYPES)}")

    target = config.get("target")
    if not isinstance(target, dict):
        errors.append("target must be an object")
        target = {}
    parsed = urlparse(str(target.get("baseUrl", "")))
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        errors.append("target.baseUrl must be an absolute HTTP or HTTPS URL")
    if parsed.username or parsed.password:
        errors.append("target.baseUrl must not contain embedded credentials")
    if not str(target.get("environment", "")).strip():
        errors.append("target.environment is required")

    workload = config.get("workload")
    if not isinstance(workload, dict):
        errors.append("workload must be an object")
        workload = {}
    model = str(workload.get("model", ""))
    if model not in WORKLOAD_MODELS:
        errors.append(f"workload.model must be one of {sorted(WORKLOAD_MODELS)}")
    try:
        numbers = workload_numbers(config)
    except (TypeError, ValueError) as exc:
        errors.append(str(exc))
        numbers = {"maxUsers": 1, "iterations": 1, "targetRate": 0, "model": model}

    if model == "concurrent-users" and int(workload.get("users", 0) or 0) < 1:
        errors.append("workload.users must be a positive integer")
    if model == "request-rate":
        if float(workload.get("targetRate", 0) or 0) <= 0:
            errors.append("workload.targetRate must be positive")
        if int(workload.get("preAllocatedVUs", 0) or 0) < 1:
            errors.append("workload.preAllocatedVUs must be positive")
        if int(workload.get("maxVUs", 0) or 0) < int(workload.get("preAllocatedVUs", 0) or 0):
            errors.append("workload.maxVUs must be >= workload.preAllocatedVUs")
    if model == "total-iterations" and int(workload.get("iterations", 0) or 0) < 1:
        errors.append("workload.iterations must be a positive integer")

    thresholds = config.get("thresholds")
    if not isinstance(thresholds, dict):
        errors.append("thresholds must be an object")
        thresholds = {}
    for field in ("p95Ms", "p99Ms"):
        if not isinstance(thresholds.get(field), (int, float)) or thresholds.get(field, 0) <= 0:
            errors.append(f"thresholds.{field} must be positive")
    error_rate = thresholds.get("maxErrorRate")
    if not isinstance(error_rate, (int, float)) or not 0 <= error_rate <= 1:
        errors.append("thresholds.maxErrorRate must be between 0 and 1")
    minimum_rps = thresholds.get("minRequestsPerSecond", 0)
    if not isinstance(minimum_rps, (int, float)) or minimum_rps < 0:
        errors.append("thresholds.minRequestsPerSecond must be non-negative")

    script = config.get("script", {})
    script_path = script.get("path") if isinstance(script, dict) else None
    requests = config.get("requests", [])
    if not script_path and (not isinstance(requests, list) or not requests):
        errors.append("provide script.path or at least one request")
    if isinstance(requests, list):
        for index, request in enumerate(requests):
            prefix = f"requests[{index}]"
            if not isinstance(request, dict):
                errors.append(f"{prefix} must be an object")
                continue
            if not str(request.get("name", "")).strip():
                errors.append(f"{prefix}.name is required")
            if str(request.get("method", "")).upper() not in METHODS:
                errors.append(f"{prefix}.method is invalid")
            if not str(request.get("path", "")).startswith("/"):
                errors.append(f"{prefix}.path must begin with /")
            status = request.get("expectedStatus")
            if not isinstance(status, int) or not 100 <= status <= 599:
                errors.append(f"{prefix}.expectedStatus must be an HTTP status integer")

    safety = config.get("safety")
    if not isinstance(safety, dict):
        errors.append("safety must be an object")
        safety = {}
    configured_max = int(safety.get("maxUsers", 100) or 100)
    if numbers["maxUsers"] > configured_max:
        warnings.append(
            f"workload requests {numbers['maxUsers']} users, above configured maxUsers={configured_max}"
        )
    if requires_load_approval(config):
        authorization = str(target.get("authorizationReference", "")).strip()
        if not authorization:
            errors.append("target.authorizationReference is required for load above one user")
        abort_conditions = safety.get("abortConditions")
        if not isinstance(abort_conditions, list) or not abort_conditions:
            errors.append("safety.abortConditions is required for load above one user")
        if not str(target.get("owner", "")).strip():
            errors.append("target.owner is required for load above one user")
    if is_production(config):
        warnings.append("target is production; runtime requires explicit --approve-production")

    errors.extend(_validate_test_profile(config))
    errors.extend(_scan_secrets(config))
    return sorted(set(errors)), sorted(set(warnings))


def public_config(config: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in config.items() if not key.startswith("_")}
