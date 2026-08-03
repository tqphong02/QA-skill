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
REQUIRED_V2_FIELDS = ("browser_profiles", "os_versions", "viewports", "required_browser_vendors", "required_devices")


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("compatibility matrix root must be an object")
    return value


def _positive_dimension(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def _as_set(value: Any, fallback: set[str]) -> set[str]:
    return set(value) if isinstance(value, (list, tuple, set)) else set(fallback)


def check(matrix: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    matrix_version = matrix.get("matrix_version", 1)
    if not isinstance(matrix_version, int) or matrix_version < 1:
        errors.append({"check": "matrix_version", "message": "matrix_version must be a positive integer"})
        matrix_version = 1
    is_v2 = matrix_version >= 2
    dimensions = {
        "browsers": matrix.get("browsers", []),
        "devices": matrix.get("devices", []),
        "locales": matrix.get("locales", []),
        "timezones": matrix.get("timezones", []),
    }
    for field in ("project", "target", "browsers", "devices", "locales", "timezones", "cases"):
        if not matrix.get(field):
            errors.append({"check": "required_fields", "message": f"missing {field}"})
    browsers = _as_set(matrix.get("browsers"), set())
    devices = _as_set(matrix.get("devices"), set())
    locales = _as_set(matrix.get("locales"), set())
    required_browsers = _as_set(matrix.get("required_browsers"), REQUIRED_BROWSERS)
    required_devices = _as_set(matrix.get("required_devices"), REQUIRED_DEVICES)
    required_locales = _as_set(matrix.get("required_locales"), REQUIRED_LOCALES)
    profile_entries: list[Any] = []
    viewport_entries: list[Any] = []
    os_versions: Any = []

    if is_v2:
        for field in REQUIRED_V2_FIELDS:
            if not matrix.get(field):
                errors.append({"check": "v2_required_fields", "message": f"missing {field}"})
        profiles = matrix.get("browser_profiles", [])
        profile_entries = profiles if isinstance(profiles, list) else []
        profile_map: dict[str, dict[str, Any]] = {}
        if isinstance(profiles, list):
            for index, profile in enumerate(profiles):
                prefix = f"browser_profiles[{index}]"
                if not isinstance(profile, dict):
                    errors.append({"check": "browser_profile_shape", "message": f"{prefix} must be an object"})
                    continue
                profile_id = str(profile.get("id", ""))
                if not profile_id or profile_id in profile_map:
                    errors.append({"check": "browser_profile_id", "message": f"{prefix}.id must be unique and non-empty"})
                    continue
                profile_map[profile_id] = profile
                for field in ("vendor", "version", "engine", "os"):
                    if not str(profile.get(field, "")).strip():
                        errors.append({"check": "browser_profile_fields", "message": f"{prefix}.{field} is required"})
                if profile.get("engine") not in REQUIRED_BROWSERS:
                    errors.append({"check": "browser_profile_engine", "message": f"{prefix}.engine must be chromium, firefox or webkit"})
        else:
            errors.append({"check": "browser_profile_shape", "message": "browser_profiles must be a list"})
        dimensions["browserProfiles"] = profiles

        os_versions = matrix.get("os_versions", [])
        if not isinstance(os_versions, list) or not all(isinstance(item, str) and item.strip() for item in os_versions):
            errors.append({"check": "os_versions", "message": "os_versions must contain non-empty version labels"})
        dimensions["osVersions"] = os_versions

        viewports = matrix.get("viewports", [])
        viewport_entries = viewports if isinstance(viewports, list) else []
        viewport_map: dict[str, dict[str, Any]] = {}
        if isinstance(viewports, list):
            for index, viewport in enumerate(viewports):
                prefix = f"viewports[{index}]"
                if not isinstance(viewport, dict):
                    errors.append({"check": "viewport_shape", "message": f"{prefix} must be an object"})
                    continue
                viewport_id = str(viewport.get("id", ""))
                if not viewport_id or viewport_id in viewport_map:
                    errors.append({"check": "viewport_id", "message": f"{prefix}.id must be unique and non-empty"})
                    continue
                viewport_map[viewport_id] = viewport
                if not _positive_dimension(viewport.get("width")) or not _positive_dimension(viewport.get("height")):
                    errors.append({"check": "viewport_dimensions", "message": f"{prefix} requires positive width and height"})
                if viewport.get("device") not in devices:
                    errors.append({"check": "viewport_device", "message": f"{prefix}.device must be declared in devices"})
        else:
            errors.append({"check": "viewport_shape", "message": "viewports must be a list"})
        dimensions["viewports"] = viewports

        missing_vendors = _as_set(matrix.get("required_browser_vendors"), set()) - {
            str(profile.get("vendor")) for profile in profile_map.values()
        }
        if missing_vendors:
            errors.append({"check": "browser_vendor_coverage", "message": f"missing browser vendors: {', '.join(sorted(missing_vendors))}"})
        missing_devices = required_devices - devices
        if missing_devices:
            errors.append({"check": "required_device_declaration", "message": f"required devices are not declared: {', '.join(sorted(missing_devices))}"})
    else:
        warnings.append({"check": "legacy_matrix", "message": "matrix_version 2 is recommended for browser vendor/version, OS and viewport coverage"})

    if not required_browsers.issubset(browsers):
        errors.append({"check": "browser_coverage", "message": f"required browser engines are missing: {', '.join(sorted(required_browsers - browsers))}"})
    if not required_devices.issubset(devices):
        errors.append({"check": "device_coverage", "message": f"required devices are missing: {', '.join(sorted(required_devices - devices))}"})
    if not required_locales.issubset(locales):
        errors.append({"check": "locale_coverage", "message": "en-US and vi-VN are required"})
    if matrix.get("rtl_supported") is True and not ({"ar", "ar-SA", "he"} & locales):
        errors.append({"check": "rtl_coverage", "message": "an RTL locale is required when rtl_supported is true"})
    if matrix.get("rtl_supported") is not True:
        warnings.append({"check": "rtl_scope", "message": "RTL is recorded as out of scope; confirm this against product requirements"})

    cases = matrix.get("cases", [])
    seen = set()
    represented = {
        "browsers": set(),
        "browserVendors": set(),
        "browserProfiles": set(),
        "devices": set(),
        "locales": set(),
        "osVersions": set(),
        "viewports": set(),
    }
    profiles_by_id = {
        str(profile.get("id")): profile
        for profile in profile_entries
        if isinstance(profile, dict) and profile.get("id")
    }
    for case in cases if isinstance(cases, list) else []:
        if not isinstance(case, dict):
            errors.append({"check": "case_shape", "message": "each case must be an object"})
            continue
        case_id = str(case.get("id", "unknown"))
        profile = profiles_by_id.get(case.get("browser_profile")) if is_v2 else None
        browser = profile.get("engine") if profile else case.get("browser")
        signature = (
            case.get("browser_profile") if is_v2 else browser,
            case.get("os") if is_v2 else None,
            case.get("viewport") if is_v2 else None,
            case.get("device"),
            case.get("locale"),
            case.get("timezone"),
        )
        if signature in seen:
            warnings.append({"check": "duplicate_case", "message": f"duplicate coverage signature in {case_id}"})
        seen.add(signature)
        if not case.get("expected"):
            errors.append({"check": "case_expected", "message": f"{case_id} has no expected behavior"})
        if is_v2:
            if not profile:
                errors.append({"check": "case_browser_profile", "message": f"{case_id} uses undeclared browser_profile"})
            else:
                represented["browserProfiles"].add(case.get("browser_profile"))
                represented["browserVendors"].add(profile.get("vendor"))
                represented["browsers"].add(profile.get("engine"))
                if case.get("os") not in set(os_versions if isinstance(os_versions, list) else []):
                    errors.append({"check": "case_os", "message": f"{case_id} uses undeclared os"})
                else:
                    represented["osVersions"].add(case.get("os"))
                if case.get("os") != profile.get("os"):
                    errors.append({"check": "case_profile_os", "message": f"{case_id} OS must match browser_profile OS"})
            if case.get("viewport") not in {
                item.get("id") for item in viewport_entries if isinstance(item, dict)
            }:
                errors.append({"check": "case_viewport", "message": f"{case_id} uses undeclared viewport"})
            else:
                represented["viewports"].add(case.get("viewport"))
        else:
            represented["browsers"].add(case.get("browser"))
        for key, allowed in (("browser", browsers), ("device", devices), ("locale", locales)):
            value = browser if key == "browser" and is_v2 else case.get(key)
            if value not in allowed:
                errors.append({"check": "case_dimension", "message": f"{case_id} uses undeclared {key}"})
        represented["devices"].add(case.get("device"))
        represented["locales"].add(case.get("locale"))

    for field, required in (("browsers", required_browsers), ("devices", required_devices), ("locales", required_locales)):
        missing = sorted(required - represented[field])
        if missing:
            errors.append({"check": "case_coverage", "message": f"no executable case represents {field}: {', '.join(missing)}"})
    if is_v2:
        required_vendors = _as_set(matrix.get("required_browser_vendors"), set())
        missing_vendors = sorted(required_vendors - represented["browserVendors"])
        if missing_vendors:
            errors.append({"check": "case_vendor_coverage", "message": f"no executable case represents browser vendors: {', '.join(missing_vendors)}"})
        required_os = _as_set(matrix.get("required_os_versions"), _as_set(matrix.get("os_versions"), set()))
        missing_os = sorted(required_os - represented["osVersions"])
        if missing_os:
            errors.append({"check": "case_os_coverage", "message": f"no executable case represents OS versions: {', '.join(missing_os)}"})
        required_viewports = _as_set(
            matrix.get("required_viewports"),
            {item.get("id") for item in viewport_entries if isinstance(item, dict)},
        )
        missing_viewports = sorted(required_viewports - represented["viewports"])
        if missing_viewports:
            errors.append({"check": "case_viewport_coverage", "message": f"no executable case represents viewports: {', '.join(missing_viewports)}"})

    passed = not errors
    return {
        "schema_version": "1.0",
        "passed": passed,
        "project": matrix.get("project"),
        "target": matrix.get("target"),
        "matrix_version": matrix_version,
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
