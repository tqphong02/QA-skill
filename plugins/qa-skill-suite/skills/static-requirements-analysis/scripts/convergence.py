#!/usr/bin/env python3
"""Fail-closed source snapshot and semantic convergence gate for BA outputs."""

from __future__ import annotations

import hashlib
import json
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
        logical_name = source.name.casefold()
        if logical_name in seen_names:
            fail(f"duplicate source Markdown basename: {source.name}")
        seen_names.add(logical_name)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        sources.append({"name": source.name, "sha256": digest})
    sources.sort(key=lambda item: item["name"].casefold())
    canonical = json.dumps(sources, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sources, hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def semantic_map(data: dict) -> tuple[dict[str, str], dict[str, str]]:
    flows = {}
    for module in data.get("modules") or []:
        for flow in module.get("flows") or []:
            key = str(flow.get("semantic_key") or "").strip()
            flow_id = str(flow.get("id") or "").strip()
            if not KEY_RE.fullmatch(key):
                fail(f"invalid or missing flow semantic_key: {key or '<empty>'}")
            if key in flows:
                fail(f"duplicate flow semantic_key: {key}")
            flows[key] = flow_id

    questions = {}
    for question in data.get("questions") or []:
        key = str(question.get("decision_key") or "").strip()
        question_id = str(question.get("id") or "").strip()
        if not KEY_RE.fullmatch(key):
            fail(f"invalid or missing question decision_key: {key or '<empty>'}")
        if key in questions:
            fail(f"duplicate question decision_key: {key}")
        questions[key] = question_id
    return flows, questions


def completion_status(data: dict) -> str:
    active = any(str(item.get("status") or "") in ACTIVE_QUESTION_STATUSES for item in data.get("questions") or [])
    return "DONE_WITH_OPEN_QA" if active else "DONE"


def build_state(data: dict, analysis_path: Path) -> dict:
    sources, source_set_sha256 = source_snapshot(data, analysis_path)
    flows, questions = semantic_map(data)
    return {
        "schema_version": "1.0",
        "source_set_sha256": source_set_sha256,
        "sources": sources,
        "flow_keys": flows,
        "question_keys": questions,
        "completion_status": completion_status(data),
    }


def check_previous(current: dict, state_path: Path) -> str:
    if not state_path.is_file():
        return "BASELINE"
    try:
        previous = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read prior convergence state: {exc}")

    if previous.get("source_set_sha256") != current["source_set_sha256"]:
        return "SOURCE_CHANGED"

    for field, label in (("flow_keys", "flow"), ("question_keys", "question")):
        old = previous.get(field) or {}
        new = current.get(field) or {}
        added = sorted(set(new) - set(old))
        if added:
            fail(f"UNCHANGED_SOURCE_GROWTH: new {label} semantic keys {added}")
        changed_ids = sorted(key for key in set(new) & set(old) if new[key] != old[key])
        if changed_ids:
            fail(f"stable IDs changed for {label} keys {changed_ids}")
    return "UNCHANGED_RECONCILED"


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
    print(f"SEMANTIC COUNTS: flows={len(current['flow_keys'])}; questions={len(current['question_keys'])}")
    print(f"ANALYSIS COMPLETION: {current['completion_status']}")


if __name__ == "__main__":
    main()
