#!/usr/bin/env python3
"""Fail-closed source snapshot and semantic convergence gate for BA outputs."""

from __future__ import annotations

import hashlib
import json
import posixpath
import re
import sys
from pathlib import Path


KEY_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
ACTIVE_QUESTION_STATUSES = {"Open", "Blocked"}


def fail(message: str) -> None:
    raise SystemExit(f"ANALYSIS BLOCKED: {message}")


def resolve_source(raw: object, analysis_path: Path) -> Path:
    value = str(raw or "").strip()
    if not value:
        fail("source_markdown contains an empty path")
    requested = Path(value)
    candidates = [requested]
    if not requested.is_absolute():
        candidates.append(analysis_path.parent / requested)
    source = next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)
    if source is None:
        fail(f"source Markdown not found: {value}")
    if source.suffix.lower() not in {".md", ".markdown"}:
        fail(f"source must be converted to Markdown: {value}")
    return source


def source_snapshot(data: dict, analysis_path: Path) -> tuple[list[dict], str]:
    raw_sources = data.get("source_markdown")
    if not isinstance(raw_sources, list) or not raw_sources:
        fail("source_markdown must be a non-empty list")
    sources = []
    seen_names = set()
    for raw in raw_sources:
        source = resolve_source(raw, analysis_path)
        raw_value = str(raw).strip().replace("\\", "/")
        logical_name = source.name if Path(raw_value).is_absolute() else posixpath.normpath(raw_value)
        logical_key = logical_name.casefold()
        if logical_key in seen_names:
            fail(f"duplicate logical source Markdown path: {logical_name}")
        seen_names.add(logical_key)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        sources.append({"name": logical_name, "sha256": digest})
    sources.sort(key=lambda item: item["name"].casefold())
    canonical = json.dumps(sources, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sources, hashlib.sha256(canonical.encode("utf-8")).hexdigest()


SEMANTIC_COLLECTIONS = {
    "business_goal": "business_goals",
    "requirement": "requirements",
    "business_rule": "business_rules",
    "validation_rule": "validation_rules",
    "dependency": "dependencies",
    "risk": "risks",
    "api_operation": "api_operations",
}


def semantic_maps(data: dict) -> dict[str, dict[str, str]]:
    maps: dict[str, dict[str, str]] = {label: {} for label in SEMANTIC_COLLECTIONS}
    for label, field in SEMANTIC_COLLECTIONS.items():
        for item in data.get(field) or []:
            key = str(item.get("semantic_key") or "").strip()
            item_id = str(item.get("id") or "").strip()
            if not KEY_RE.fullmatch(key):
                fail(f"invalid or missing {label} semantic_key: {key or '<empty>'}")
            if key in maps[label]:
                fail(f"duplicate {label} semantic_key: {key}")
            maps[label][key] = item_id

    flows: dict[str, str] = {}
    for module in data.get("modules") or []:
        for flow in module.get("flows") or []:
            key = str(flow.get("semantic_key") or "").strip()
            flow_id = str(flow.get("id") or "").strip()
            if not KEY_RE.fullmatch(key):
                fail(f"invalid or missing flow semantic_key: {key or '<empty>'}")
            if key in flows:
                fail(f"duplicate flow semantic_key: {key}")
            flows[key] = flow_id

    maps["flow"] = flows

    questions: dict[str, str] = {}
    for question in data.get("questions") or []:
        key = str(question.get("decision_key") or "").strip()
        question_id = str(question.get("id") or "").strip()
        if not KEY_RE.fullmatch(key):
            fail(f"invalid or missing question decision_key: {key or '<empty>'}")
        if key in questions:
            fail(f"duplicate question decision_key: {key}")
        questions[key] = question_id
    maps["question"] = questions
    return maps


def completion_status(data: dict) -> str:
    active = any(str(item.get("status") or "") in ACTIVE_QUESTION_STATUSES for item in data.get("questions") or [])
    return "DONE_WITH_OPEN_QA" if active else "DONE"


def build_state(data: dict, analysis_path: Path) -> dict:
    sources, source_set_sha256 = source_snapshot(data, analysis_path)
    maps = semantic_maps(data)
    return {
        "schema_version": "3.0",
        "source_set_sha256": source_set_sha256,
        "sources": sources,
        "semantic_maps": maps,
        "completion_status": completion_status(data),
    }


def check_previous(current: dict, state_path: Path) -> str:
    if not state_path.is_file():
        return "BASELINE"
    try:
        previous = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read prior convergence state: {exc}")

    old_maps = previous.get("semantic_maps")
    if old_maps is None:
        old_maps = {
            "flow": previous.get("flow_keys") or {},
            "question": previous.get("question_keys") or {},
        }
    new_maps = current.get("semantic_maps") or {}
    source_changed = previous.get("source_set_sha256") != current["source_set_sha256"]
    for label in sorted(set(old_maps) | set(new_maps)):
        old = old_maps.get(label) or {}
        new = new_maps.get(label) or {}
        added = sorted(set(new) - set(old))
        if added and not source_changed:
            fail(f"UNCHANGED_SOURCE_GROWTH: new {label} semantic keys {added}")
        changed_ids = sorted(key for key in set(new) & set(old) if new[key] != old[key])
        if changed_ids:
            fail(f"stable IDs changed for {label} keys {changed_ids}")
    return "SOURCE_CHANGED" if source_changed else "UNCHANGED_RECONCILED"


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] not in {"--check", "--commit"}:
        fail("usage: convergence.py --check|--commit <analysis.json> <state.json>")
    operation, analysis_raw, state_raw = sys.argv[1:]
    analysis_path = Path(analysis_raw).resolve()
    state_path = Path(state_raw).resolve()
    try:
        data = json.loads(analysis_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read analysis JSON: {exc}")

    current = build_state(data, analysis_path)
    mode = check_previous(current, state_path)
    if operation == "--commit":
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        read_back = json.loads(state_path.read_text(encoding="utf-8"))
        if read_back != current:
            fail("convergence state read-back mismatch")
    print(f"CONVERGENCE PASS: {mode}")
    print(f"SOURCE SNAPSHOT: {current['source_set_sha256']}")
    counts = "; ".join(f"{label}={len(values)}" for label, values in current["semantic_maps"].items())
    print(f"SEMANTIC COUNTS: {counts}")
    print(f"ANALYSIS COMPLETION: {current['completion_status']}")


if __name__ == "__main__":
    main()
