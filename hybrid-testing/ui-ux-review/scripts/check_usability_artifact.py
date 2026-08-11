#!/usr/bin/env python3
"""Validate a usability study plan or observed result without contacting a live target."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = ("project", "target", "requirements", "participants", "tasks", "metrics")
REQUIRED_METRICS = {
    "successRate": ("targetMin", "min"),
    "medianTimeSeconds": ("targetMax", "max"),
    "errorRate": ("targetMax", "max"),
    "assistanceRate": ("targetMax", "max"),
}
PARTICIPANT_ID = re.compile(r"^P[A-Z0-9_-]+$")


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("usability packet root must be an object")
    return value


def _positive_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def _bounded_rate(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 1


def check_packet(packet: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    checks: list[dict[str, Any]] = []
    metric_verdicts: list[dict[str, Any]] = []

    def error(name: str, message: str) -> None:
        errors.append({"check": name, "message": message})

    def warning(name: str, message: str) -> None:
        warnings.append({"check": name, "message": message})

    for field in REQUIRED_FIELDS:
        if packet.get(field) in (None, "", [], {}):
            error("required_fields", f"missing {field}")

    mode = str(packet.get("mode", "plan")).lower()
    if mode not in {"plan", "observed"}:
        error("mode", "mode must be plan or observed")

    requirements = packet.get("requirements", [])
    if not isinstance(requirements, list) or not all(isinstance(item, dict) and item.get("id") for item in requirements):
        error("requirements", "requirements must contain stable id values")

    participants = packet.get("participants", {})
    if not isinstance(participants, dict):
        error("participants", "participants must be an object")
        participants = {}
    if not isinstance(participants.get("count"), int) or participants.get("count", 0) < 1:
        error("participants", "participants.count must be a positive integer")
    if not str(participants.get("profile", "")).strip():
        error("participants", "participants.profile is required")
    if participants.get("consentPolicy") not in {"required", "obtained"}:
        error("participants", "participants.consentPolicy must be required or obtained")
    if participants.get("pseudonymousIds") is not True:
        error("participants", "participants.pseudonymousIds must be true")
    if mode == "observed" and participants.get("consentPolicy") != "obtained":
        error("participants", "observed usability results require obtained participant consent")

    tasks = packet.get("tasks", [])
    if not isinstance(tasks, list) or not tasks:
        error("tasks", "tasks must be a non-empty list")
        tasks = []
    task_ids: set[str] = set()
    for task in tasks:
        if not isinstance(task, dict):
            error("task_shape", "each task must be an object")
            continue
        task_id = str(task.get("id", "unknown"))
        if task_id in task_ids:
            error("task_id", f"duplicate task id: {task_id}")
        task_ids.add(task_id)
        for field in ("id", "name", "successCriteria"):
            if not str(task.get(field, "")).strip():
                error("task_fields", f"{task_id} is missing {field}")
        for field in ("maxSteps", "maxTimeSeconds"):
            if not isinstance(task.get(field), int) or task.get(field, 0) < 1:
                error("task_length", f"{task_id}.{field} must be a positive integer")
        checks_for_task = task.get("checks")
        if not isinstance(checks_for_task, dict):
            error("task_checks", f"{task_id}.checks must declare discoverability, comprehension and errorRecovery")
        else:
            for field in ("discoverability", "comprehension", "errorRecovery"):
                if not str(checks_for_task.get(field, "")).strip():
                    error("task_checks", f"{task_id}.checks.{field} is required")

        if mode == "observed":
            observations = task.get("observations")
            if not isinstance(observations, list) or not observations:
                error("observations", f"{task_id} has no participant observations")
                continue
            for index, observation in enumerate(observations):
                prefix = f"{task_id}.observations[{index}]"
                if not isinstance(observation, dict):
                    error("observation_shape", f"{prefix} must be an object")
                    continue
                participant_id = str(observation.get("participantId", ""))
                if not PARTICIPANT_ID.fullmatch(participant_id):
                    error("participant_id", f"{prefix}.participantId must be pseudonymous, for example P01")
                if not isinstance(observation.get("completed"), bool):
                    error("observation", f"{prefix}.completed must be boolean")
                if not isinstance(observation.get("durationSeconds"), (int, float)) or observation.get("durationSeconds", -1) < 0:
                    error("observation", f"{prefix}.durationSeconds must be non-negative")
                if not isinstance(observation.get("errors"), int) or observation.get("errors", -1) < 0:
                    error("observation", f"{prefix}.errors must be a non-negative integer")
                if not isinstance(observation.get("assistance"), bool):
                    error("observation", f"{prefix}.assistance must be boolean")

    metrics = packet.get("metrics", {})
    if not isinstance(metrics, dict):
        error("metrics", "metrics must be an object")
        metrics = {}
    for metric, (target_key, direction) in REQUIRED_METRICS.items():
        definition = metrics.get(metric)
        if not isinstance(definition, dict):
            error("metric_definition", f"metrics.{metric} must declare {target_key}")
            continue
        target = definition.get(target_key)
        valid_target = _bounded_rate(target) if metric != "medianTimeSeconds" else _positive_number(target)
        if not valid_target:
            error("metric_target", f"metrics.{metric}.{target_key} has an invalid value")
        if mode == "observed":
            observed = definition.get("observed")
            valid_observed = _bounded_rate(observed) if metric != "medianTimeSeconds" else _positive_number(observed) or observed == 0
            if not valid_observed:
                error("metric_observed", f"metrics.{metric}.observed is required for observed mode")
                continue
            passed = observed >= target if direction == "min" else observed <= target
            metric_verdicts.append({
                "metric": metric,
                "observed": observed,
                "target": target,
                "comparison": ">=" if direction == "min" else "<=",
                "status": "PASS" if passed else "FAIL",
            })

    sus = metrics.get("susScore")
    if sus is not None:
        if not isinstance(sus, dict) or not _positive_number(sus.get("targetMin")) or sus.get("targetMin", 0) > 100:
            error("metric_target", "metrics.susScore.targetMin must be between 0 and 100")
        elif mode == "observed":
            observed = sus.get("observed")
            if not isinstance(observed, (int, float)) or not 0 <= observed <= 100:
                error("metric_observed", "metrics.susScore.observed must be between 0 and 100")
            else:
                metric_verdicts.append({
                    "metric": "susScore",
                    "observed": observed,
                    "target": sus["targetMin"],
                    "comparison": ">=",
                    "status": "PASS" if observed >= sus["targetMin"] else "FAIL",
                })
    else:
        warning("sus_score", "SUS is optional; add it when a standardized usability score is appropriate")

    evidence = packet.get("evidence", [])
    evidence_status: list[dict[str, Any]] = []
    if mode == "observed":
        if not isinstance(evidence, list) or not evidence:
            error("evidence", "observed usability results require screenshot, recording or notes evidence")
        else:
            for raw_path in evidence:
                evidence_path = Path(str(raw_path))
                resolved = evidence_path if evidence_path.is_absolute() else base_dir / evidence_path
                exists = resolved.is_file()
                evidence_status.append({"path": str(evidence_path), "exists": exists})
                if not exists:
                    error("evidence_exists", f"missing evidence: {evidence_path}")
    elif evidence:
        warning("evidence", "plan evidence is optional and cannot prove observed usability")

    checks.append({
        "name": "task_and_metric_contract",
        "passed": not any(item["check"] in {"task_fields", "task_length", "task_checks", "metric_definition", "metric_target"} for item in errors),
        "detail": "tasks cover discoverability, comprehension, error recovery and measurable task length",
    })
    checks.append({
        "name": "privacy_contract",
        "passed": not any(item["check"] in {"participants", "participant_id"} for item in errors),
        "detail": "participant identity is pseudonymous and consent policy is explicit",
    })

    if errors:
        status = "BLOCKED"
    elif mode == "plan":
        status = "READY"
    elif any(item["status"] == "FAIL" for item in metric_verdicts):
        status = "FAIL"
    else:
        status = "PASS"

    return {
        "schema_version": "1.0",
        "status": status,
        "passed": status in {"READY", "PASS"},
        "project": packet.get("project"),
        "target": packet.get("target"),
        "mode": mode,
        "participants": participants,
        "tasks": tasks,
        "metricVerdicts": metric_verdicts,
        "checks": checks,
        "errors": errors,
        "warnings": warnings,
        "evidence": evidence_status,
        "limitations": [
            "A validated plan does not prove usability until representative participants complete the tasks",
            "Visual design and WCAG conformance remain separate UI/UX and accessibility evidence",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--base-dir", default=None)
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        input_path = Path(args.input).resolve()
        report = check_packet(load_json(input_path), Path(args.base_dir).resolve() if args.base_dir else input_path.parent)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "status": "BLOCKED", "error": str(exc)}, ensure_ascii=False, indent=2))
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
