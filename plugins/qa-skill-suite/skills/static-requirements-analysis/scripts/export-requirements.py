#!/usr/bin/env python3
"""Export an explicit BA requirement registry for dynamic-web-exploratory UI reconciliation."""

from __future__ import annotations

import json
import pathlib
import sys


ALLOWED_KEYS = {
    "id", "text", "source_ref", "page", "actor", "state", "expected_behavior",
    "fact_status", "human_confirmed", "ui", "expected", "source_refs", "testcase_ids",
}


def fail(message: str) -> None:
    raise SystemExit(f"REQUIREMENT EXPORT FAILED: {message}")


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: export-requirements.py <analysis.json> <requirements.json>")
    source = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    data = json.loads(source.read_text(encoding="utf-8"))
    requirements = data.get("requirements")
    if requirements is None:
        print("REQUIREMENT EXPORT SKIPPED: analysis has no explicit requirements[]")
        return
    if not isinstance(requirements, list):
        fail("requirements must be an array")

    seen: set[str] = set()
    exported: list[dict] = []
    for index, requirement in enumerate(requirements):
        if not isinstance(requirement, dict):
            fail(f"requirements[{index}] must be an object")
        unknown = set(requirement) - ALLOWED_KEYS
        if unknown:
            fail(f"requirements[{index}] has unsupported keys: {', '.join(sorted(unknown))}")
        for field in ("id", "text", "source_ref"):
            if not str(requirement.get(field, "")).strip():
                fail(f"requirements[{index}].{field} is required")
        if requirement["id"] in seen:
            fail(f"duplicate requirement ID: {requirement['id']}")
        seen.add(requirement["id"])
        exported.append(requirement)

    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema_version": "1.0", "project": data.get("project", ""), "requirements": exported}
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    check = json.loads(output.read_text(encoding="utf-8"))
    if [item["id"] for item in check["requirements"]] != [item["id"] for item in requirements]:
        fail("read-back ID mismatch")
    print(f"REQUIREMENT EXPORT PASS: {output} ({len(exported)} requirements)")


if __name__ == "__main__":
    main()
