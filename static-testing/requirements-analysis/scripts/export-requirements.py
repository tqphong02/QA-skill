#!/usr/bin/env python3
"""Export UI-compatible requirements and an optional API contract handoff."""

from __future__ import annotations

import json
import pathlib
import re
import sys


UI_OUTPUT_KEYS = {
    "id", "text", "source_ref", "page", "actor", "state", "expected_behavior",
    "fact_status", "human_confirmed", "ui", "expected", "source_refs", "testcase_ids",
}
FACT_STATUSES = {"verified", "inferred", "unresolved"}
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def fail(message: str) -> None:
    raise SystemExit(f"REQUIREMENT EXPORT FAILED: {message}")


def required_text(item: dict, field: str, label: str) -> str:
    value = str(item.get(field) or "").strip()
    if not value:
        fail(f"{label}.{field} is required")
    return value


def write_json(output: pathlib.Path, payload: dict) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if json.loads(output.read_text(encoding="utf-8")) != payload:
        fail(f"read-back mismatch: {output}")


def export_ui_registry(data: dict, output: pathlib.Path) -> int:
    requirements = data.get("requirements")
    if not isinstance(requirements, list):
        fail("requirements must be an array")
    seen: set[str] = set()
    exported: list[dict] = []
    for index, requirement in enumerate(requirements):
        if not isinstance(requirement, dict):
            fail(f"requirements[{index}] must be an object")
        label = f"requirements[{index}]"
        requirement_id = required_text(requirement, "id", label)
        required_text(requirement, "semantic_key", label)
        required_text(requirement, "text", label)
        required_text(requirement, "source_ref", label)
        required_text(requirement, "source_excerpt", label)
        if requirement_id in seen:
            fail(f"duplicate requirement ID: {requirement_id}")
        seen.add(requirement_id)
        if not KEY_RE.fullmatch(str(requirement["semantic_key"])):
            fail(f"{label}.semantic_key is invalid")
        if requirement.get("fact_status") not in FACT_STATUSES:
            fail(f"{label}.fact_status is invalid")
        exported.append({key: requirement[key] for key in UI_OUTPUT_KEYS if key in requirement})

    payload = {"schema_version": "1.0", "project": data.get("project", ""), "requirements": exported}
    write_json(output, payload)
    print(f"REQUIREMENT EXPORT PASS: {output} ({len(exported)} requirements)")
    return len(exported)


def export_api_handoff(data: dict, output: pathlib.Path) -> int:
    operations = data.get("api_operations")
    if not isinstance(operations, list):
        fail("api_operations must be an array")
    seen: set[str] = set()
    exported: list[dict] = []
    for index, operation in enumerate(operations):
        if not isinstance(operation, dict):
            fail(f"api_operations[{index}] must be an object")
        label = f"api_operations[{index}]"
        operation_id = required_text(operation, "id", label)
        for field in ("semantic_key", "operation_id", "protocol", "method", "path", "cleanup", "source_ref", "source_excerpt"):
            required_text(operation, field, label)
        if operation_id in seen:
            fail(f"duplicate API operation ID: {operation_id}")
        seen.add(operation_id)
        if operation.get("coverage_status") != "not_covered":
            fail(f"{label}.coverage_status must be not_covered for static analysis")
        exported.append(dict(operation))

    payload = {
        "schema_version": "1.0",
        "project": data.get("project", ""),
        "evidence_kind": "documented_expectation",
        "runtime_verified": False,
        "operations": exported,
    }
    write_json(output, payload)
    print(f"API HANDOFF EXPORT PASS: {output} ({len(exported)} operations)")
    return len(exported)


def main() -> None:
    if len(sys.argv) not in {3, 4}:
        fail("usage: export-requirements.py <analysis.json> <requirements.json> [api-handoff.json]")
    source = pathlib.Path(sys.argv[1])
    data = json.loads(source.read_text(encoding="utf-8"))
    export_ui_registry(data, pathlib.Path(sys.argv[2]))
    if len(sys.argv) == 4:
        export_api_handoff(data, pathlib.Path(sys.argv[3]))


if __name__ == "__main__":
    main()
