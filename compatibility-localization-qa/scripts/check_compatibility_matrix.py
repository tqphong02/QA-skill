#!/usr/bin/env python3
"""Validate a browser/device/locale compatibility plan locally."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_BROWSERS = {"chromium", "firefox", "webkit"}
REQUIRED_DEVICES = {"desktop", "mobile"}
REQUIRED_LOCALES = {"en-US", "vi-VN"}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("compatibility matrix root must be an object")
    return value


def check(matrix: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    dimensions = {
        "browsers": matrix.get("browsers", []),
        "devices": matrix.get("devices", []),
        "locales": matrix.get("locales", []),
        "timezones": matrix.get("timezones", []),
    }
    for field in ("project", "target", "browsers", "devices", "locales", "timezones", "cases"):
        if not matrix.get(field):
            errors.append({"check": "required_fields", "message": f"missing {field}"})
    browsers = set(matrix.get("browsers", []))
    devices = set(matrix.get("devices", []))
    locales = set(matrix.get("locales", []))
    if not REQUIRED_BROWSERS.issubset(browsers):
        errors.append({"check": "browser_coverage", "message": "chromium, firefox and webkit are required"})
    if not REQUIRED_DEVICES.issubset(devices):
        errors.append({"check": "device_coverage", "message": "desktop and mobile are required"})
    if not REQUIRED_LOCALES.issubset(locales):
        errors.append({"check": "locale_coverage", "message": "en-US and vi-VN are required"})
    if matrix.get("rtl_supported") is True and not ({"ar", "ar-SA", "he"} & locales):
        errors.append({"check": "rtl_coverage", "message": "an RTL locale is required when rtl_supported is true"})
    if matrix.get("rtl_supported") is not True:
        warnings.append({"check": "rtl_scope", "message": "RTL is recorded as out of scope; confirm this against product requirements"})

    cases = matrix.get("cases", [])
    seen = set()
    for case in cases if isinstance(cases, list) else []:
        if not isinstance(case, dict):
            errors.append({"check": "case_shape", "message": "each case must be an object"})
            continue
        case_id = str(case.get("id", "unknown"))
        signature = (case.get("browser"), case.get("device"), case.get("locale"), case.get("timezone"))
        if signature in seen:
            warnings.append({"check": "duplicate_case", "message": f"duplicate coverage signature in {case_id}"})
        seen.add(signature)
        if not case.get("expected"):
            errors.append({"check": "case_expected", "message": f"{case_id} has no expected behavior"})
        for key, allowed in (("browser", browsers), ("device", devices), ("locale", locales)):
            if case.get(key) not in allowed:
                errors.append({"check": "case_dimension", "message": f"{case_id} uses undeclared {key}"})

    represented = {
        "browsers": {case.get("browser") for case in cases if isinstance(case, dict)},
        "devices": {case.get("device") for case in cases if isinstance(case, dict)},
        "locales": {case.get("locale") for case in cases if isinstance(case, dict)},
    }
    for field, required in (("browsers", REQUIRED_BROWSERS), ("devices", REQUIRED_DEVICES), ("locales", REQUIRED_LOCALES)):
        missing = sorted(required - represented[field])
        if missing:
            errors.append({"check": "case_coverage", "message": f"no executable case represents {field}: {', '.join(missing)}"})

    passed = not errors
    return {
        "schema_version": "1.0",
        "passed": passed,
        "project": matrix.get("project"),
        "target": matrix.get("target"),
        "dimensions": dimensions,
        "coverage": {key: sorted(value) for key, value in represented.items()},
        "cases": cases,
        "errors": errors,
        "warnings": warnings,
        "limitations": ["matrix validation does not launch browsers/devices or verify translation quality"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        report = check(load(Path(args.input).resolve()))
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
