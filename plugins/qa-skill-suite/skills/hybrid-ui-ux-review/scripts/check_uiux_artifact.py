#!/usr/bin/env python3
"""Validate a UI/UX review packet without contacting a live target."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_STATES = {"default", "loading", "validation", "error", "success"}


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("review packet root must be an object")
    return value


def check_packet(packet: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    checks: list[dict[str, Any]] = []

    def error(name: str, message: str) -> None:
        errors.append({"check": name, "message": message})

    def warning(name: str, message: str) -> None:
        warnings.append({"check": name, "message": message})

    def result(name: str, passed: bool, detail: str) -> None:
        checks.append({"name": name, "passed": passed, "detail": detail})
        if not passed:
            error(name, detail)

    for field in ("project", "target", "requirements", "screens", "viewport_matrix"):
        if not packet.get(field):
            error("required_fields", f"missing {field}")

    requirements = packet.get("requirements", [])
    requirement_ids = {
        item.get("id") for item in requirements
        if isinstance(item, dict) and item.get("id")
    }
    result("requirement_ids", bool(requirement_ids), "stable requirement IDs are present")

    viewports = packet.get("viewport_matrix", [])
    viewport_names = {
        item.get("name") for item in viewports
        if isinstance(item, dict) and item.get("name")
    }
    result(
        "viewport_matrix",
        {"desktop", "mobile"}.issubset(viewport_names),
        "desktop and mobile viewport evidence are declared",
    )

    screens = packet.get("screens", [])
    if not isinstance(screens, list) or not screens:
        error("screens", "screens must be a non-empty list")
        screens = []

    evidence: list[dict[str, str]] = []
    for screen in screens:
        if not isinstance(screen, dict):
            error("screen_shape", "each screen must be an object")
            continue
        screen_id = str(screen.get("id", "unknown"))
        linked = set(screen.get("requirement_ids", []))
        if not linked or not linked.issubset(requirement_ids):
            error("screen_requirements", f"{screen_id} is not mapped to known requirement IDs")
        states = set(screen.get("states", []))
        missing_states = sorted(REQUIRED_STATES - states)
        if missing_states:
            error("screen_states", f"{screen_id} is missing states: {', '.join(missing_states)}")
        if "empty" not in states:
            warning("screen_states", f"{screen_id} has no empty-state declaration")
        media = screen.get("evidence", [])
        if not isinstance(media, list) or not media:
            error("screen_evidence", f"{screen_id} has no screenshot or video evidence")
            continue
        for raw_path in media:
            evidence_path = Path(str(raw_path))
            resolved = evidence_path if evidence_path.is_absolute() else base_dir / evidence_path
            exists = resolved.is_file()
            evidence.append({"screen": screen_id, "path": str(evidence_path), "exists": exists})
            if not exists:
                error("evidence_exists", f"missing evidence for {screen_id}: {evidence_path}")

    checks.append({
        "name": "screen_state_and_evidence",
        "passed": not any(item["check"] in {"screen_requirements", "screen_states", "screen_evidence", "evidence_exists"} for item in errors),
        "detail": "screens map requirements, required interaction states and existing media",
    })

    if packet.get("accessibility_handoff") != "hybrid-accessibility":
        warning("accessibility_handoff", "record hybrid-accessibility handoff before claiming accessibility coverage")

    passed = not errors
    return {
        "schema_version": "1.0",
        "passed": passed,
        "project": packet.get("project"),
        "target": packet.get("target"),
        "errors": errors,
        "warnings": warnings,
        "checks": checks,
        "screens": screens,
        "evidence": evidence,
        "limitations": ["static packet validation does not replace human visual review or live browser observation"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--base-dir", default=None)
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        input_path = Path(args.input).resolve()
        packet = load_json(input_path)
        report = check_packet(packet, Path(args.base_dir).resolve() if args.base_dir else input_path.parent)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False, indent=2))
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
