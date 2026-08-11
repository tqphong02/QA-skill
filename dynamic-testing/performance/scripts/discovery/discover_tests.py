"""Discover JMeter and k6 scripts without loading their contents into model context."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "vendor",
    "artifacts",
    "evidence",
    "dist",
    "build",
    "__pycache__",
}
K6_SIGNAL = re.compile(r"\bfrom\s+['\"]k6(?:/[^'\"]*)?['\"]|\bk6/http\b|\bexport\s+const\s+options\b")


def discover(root: Path) -> dict[str, list[str]]:
    found = {"jmeter": [], "k6": [], "csv": []}
    if not root.exists():
        return found
    for candidate in root.rglob("*"):
        if any(part in EXCLUDED_DIRS for part in candidate.parts):
            continue
        if not candidate.is_file() or candidate.stat().st_size > 2_000_000:
            continue
        suffix = candidate.suffix.lower()
        relative = str(candidate.relative_to(root))
        if suffix == ".jmx":
            found["jmeter"].append(relative)
        elif suffix == ".csv":
            found["csv"].append(relative)
        elif suffix in {".js", ".ts", ".mjs"}:
            try:
                sample = candidate.read_text(encoding="utf-8", errors="ignore")[:100_000]
            except OSError:
                continue
            if K6_SIGNAL.search(sample):
                found["k6"].append(relative)
    for values in found.values():
        values.sort()
    return found


def resolve_engine(config: dict[str, Any], root: Path) -> tuple[str | None, str | None, dict[str, list[str]]]:
    requested = str(config.get("engine", "auto")).lower()
    script = config.get("script", {})
    script_value = script.get("path") if isinstance(script, dict) else None
    script_path = None
    if script_value:
        candidate = Path(str(script_value))
        script_path = candidate if candidate.is_absolute() else root / candidate
        suffix = script_path.suffix.lower()
        detected = "jmeter" if suffix == ".jmx" else "k6" if suffix in {".js", ".ts", ".mjs"} else None
        if not detected:
            raise ValueError("script.path must point to .jmx, .js, .ts, or .mjs")
        if requested != "auto" and requested != detected:
            raise ValueError(f"engine={requested} conflicts with script.path engine={detected}")
        return detected, str(script_path.resolve()), {"jmeter": [], "k6": [], "csv": []}

    found = discover(root)
    if requested in {"jmeter", "k6"}:
        candidates = found[requested]
        return requested, str((root / candidates[0]).resolve()) if len(candidates) == 1 else None, found
    engines = [engine for engine in ("jmeter", "k6") if found[engine]]
    if len(engines) == 1 and len(found[engines[0]]) == 1:
        engine = engines[0]
        return engine, str((root / found[engine][0]).resolve()), found
    if not engines:
        return None, None, found
    raise ValueError("Auto engine is ambiguous; choose jmeter or k6, or set script.path")
