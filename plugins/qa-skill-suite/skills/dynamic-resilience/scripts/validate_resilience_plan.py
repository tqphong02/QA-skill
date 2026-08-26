#!/usr/bin/env python3
"""Validate a bounded resilience experiment plan without executing it."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED = ("target", "scope", "failure_injection", "steady_state", "stop_conditions", "recovery", "observability", "cleanup", "approval")


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("resilience plan root must be an object")
    return value


def validate(plan: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    gates: list[dict[str, str]] = []

    def block(name: str, message: str, status: str = "BLOCKED") -> None:
        errors.append({"gate": name, "message": message})
        gates.append({"name": name, "status": status, "reason": message})

    def passed(name: str, message: str) -> None:
        gates.append({"name": name, "status": "PASS", "reason": message})

    for field in REQUIRED:
        if field not in plan or plan[field] in (None, "", [], {}):
            block("required_fields", f"missing {field}")

    if plan.get("environment") == "production" and plan.get("approval") is not True:
        block("production_authorization", "production execution requires explicit owner approval")
    elif plan.get("execution_mode", "plan") == "execute" and plan.get("approval") is not True:
        block("execution_authorization", "active injection requires explicit owner approval")
    else:
        passed("execution_authorization", "plan is read-only or explicit approval is present")

    stop = plan.get("stop_conditions", {})
    if not isinstance(stop, dict) or not stop.get("abort_on") or not stop.get("owner_contact"):
        block("stop_conditions", "abort threshold and owner contact are required")
    else:
        passed("stop_conditions", "bounded abort condition and owner contact are present")

    recovery = plan.get("recovery", {})
    if not isinstance(recovery, dict) or not recovery.get("rollback") or not recovery.get("rto_target") or not recovery.get("rpo_target"):
        block("recovery", "rollback, RTO target and RPO target are required")
    else:
        passed("recovery", "rollback and RTO/RPO targets are declared")

    backup_scope = recovery.get("backup_restore_in_scope") if isinstance(recovery, dict) else None
    if not isinstance(backup_scope, bool):
        block("backup_restore", "recovery.backup_restore_in_scope must be explicitly true or false")
    elif backup_scope:
        if not isinstance(recovery.get("backup_reference"), str) or not recovery.get("backup_reference").strip():
            block("backup_restore", "backup_reference is required when backup/restore is in scope")
        restore_steps = recovery.get("restore_steps")
        if not isinstance(restore_steps, list) or not restore_steps or any(not isinstance(step, str) or not step.strip() for step in restore_steps):
            block("backup_restore", "restore_steps must be a non-empty list of ordered actions when backup/restore is in scope")
        if not isinstance(recovery.get("data_integrity_check"), str) or not recovery.get("data_integrity_check").strip():
            block("backup_restore", "data_integrity_check is required when backup/restore is in scope")
        if (
            isinstance(recovery.get("backup_reference"), str)
            and recovery.get("backup_reference").strip()
            and isinstance(restore_steps, list)
            and restore_steps
            and all(isinstance(step, str) and step.strip() for step in restore_steps)
            and isinstance(recovery.get("data_integrity_check"), str)
            and recovery.get("data_integrity_check").strip()
        ):
            passed("backup_restore", "backup reference, restore steps and data-integrity check are declared")
    elif not recovery.get("backup_restore_reason"):
        block("backup_restore", "backup_restore_reason is required when backup/restore is out of scope")
    else:
        passed("backup_restore", "backup/restore scope decision and rationale are declared")

    if plan.get("steady_state", {}).get("slo") if isinstance(plan.get("steady_state"), dict) else False:
        passed("steady_state", "baseline SLO is declared")
    else:
        block("steady_state", "baseline SLO/SLI is required")

    if plan.get("observability", {}).get("signals") if isinstance(plan.get("observability"), dict) else False:
        passed("observability", "metrics/logs/traces signals are declared")
    else:
        block("observability", "at least one observable signal is required")

    if plan.get("execution_mode", "plan") == "plan":
        warnings.append({"check": "execution", "message": "plan validation is not a measured resilience result"})
    return {
        "schema_version": "1.0",
        "status": "READY" if not errors else "BLOCKED",
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "gates": gates,
        "hypothesis": plan.get("hypothesis"),
        "recovery": plan.get("recovery"),
        "limitations": ["no fault injection, service stop, traffic generation, or production action was performed"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        report = validate(load(Path(args.input).resolve()))
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
