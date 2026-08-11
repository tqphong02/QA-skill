from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("compatibility_checker", ROOT / "scripts/check_compatibility_matrix.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def matrix() -> dict:
    cases = []
    for browser in ("chromium", "firefox", "webkit"):
        for device in ("desktop", "mobile"):
            for locale in ("en-US", "vi-VN"):
                cases.append({
                    "id": f"{browser}-{device}-{locale}",
                    "browser": browser,
                    "device": device,
                    "locale": locale,
                    "timezone": "Asia/Ho_Chi_Minh",
                    "expected": ["no clipping", "localized validation"],
                })
    return {
        "project": "SJK",
        "target": "login",
        "browsers": ["chromium", "firefox", "webkit"],
        "devices": ["desktop", "mobile"],
        "locales": ["en-US", "vi-VN"],
        "timezones": ["UTC", "Asia/Ho_Chi_Minh"],
        "rtl_supported": False,
        "cases": cases,
    }


def release_matrix_v2() -> dict:
    return {
        "matrix_version": 2,
        "project": "SJK",
        "target": "login",
        "browsers": ["chromium", "firefox", "webkit"],
        "required_browser_vendors": ["Chrome", "Safari", "Firefox", "Edge"],
        "browser_profiles": [
            {"id": "chrome-win", "vendor": "Chrome", "version": "stable", "engine": "chromium", "os": "Windows 11"},
            {"id": "edge-win", "vendor": "Edge", "version": "stable", "engine": "chromium", "os": "Windows 11"},
            {"id": "firefox-win", "vendor": "Firefox", "version": "latest", "engine": "firefox", "os": "Windows 11"},
            {"id": "safari-mac", "vendor": "Safari", "version": "latest", "engine": "webkit", "os": "macOS"},
        ],
        "os_versions": ["Windows 11", "macOS"],
        "devices": ["desktop", "tablet", "mobile"],
        "required_devices": ["desktop", "tablet", "mobile"],
        "viewports": [
            {"id": "desktop-1440", "device": "desktop", "width": 1440, "height": 900},
            {"id": "tablet-768", "device": "tablet", "width": 768, "height": 1024},
            {"id": "mobile-390", "device": "mobile", "width": 390, "height": 844},
        ],
        "locales": ["en-US", "vi-VN"],
        "timezones": ["UTC", "Asia/Ho_Chi_Minh"],
        "cases": [
            {"id": "chrome-desktop", "browser_profile": "chrome-win", "os": "Windows 11", "device": "desktop", "viewport": "desktop-1440", "locale": "en-US", "timezone": "UTC", "expected": ["no clipping"]},
            {"id": "edge-tablet", "browser_profile": "edge-win", "os": "Windows 11", "device": "tablet", "viewport": "tablet-768", "locale": "vi-VN", "timezone": "Asia/Ho_Chi_Minh", "expected": ["localized validation"]},
            {"id": "firefox-mobile", "browser_profile": "firefox-win", "os": "Windows 11", "device": "mobile", "viewport": "mobile-390", "locale": "en-US", "timezone": "UTC", "expected": ["no overflow"]},
            {"id": "safari-desktop", "browser_profile": "safari-mac", "os": "macOS", "device": "desktop", "viewport": "desktop-1440", "locale": "vi-VN", "timezone": "Asia/Ho_Chi_Minh", "expected": ["localized validation"]},
        ],
    }


class CompatibilityMatrixTests(unittest.TestCase):
    def test_complete_matrix_passes(self) -> None:
        report = MODULE.check(matrix())
        self.assertTrue(report["passed"], report)
        self.assertEqual(set(report["coverage"]["browsers"]), {"chromium", "firefox", "webkit"})

    def test_missing_mobile_case_fails(self) -> None:
        candidate = matrix()
        candidate["cases"] = [case for case in candidate["cases"] if case["device"] == "desktop"]
        report = MODULE.check(candidate)
        self.assertFalse(report["passed"])
        self.assertTrue(any(item["check"] == "case_coverage" for item in report["errors"]))

    def test_release_matrix_v2_covers_vendor_os_viewport_and_tablet(self) -> None:
        report = MODULE.check(release_matrix_v2())
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["matrix_version"], 2)
        self.assertEqual(set(report["coverage"]["browserVendors"]), {"Chrome", "Safari", "Firefox", "Edge"})
        self.assertEqual(set(report["coverage"]["viewports"]), {"desktop-1440", "tablet-768", "mobile-390"})

    def test_release_matrix_v2_requires_exact_browser_profile_case_fields(self) -> None:
        candidate = release_matrix_v2()
        candidate["cases"][0].pop("viewport")
        candidate["browser_profiles"][0].pop("version")
        report = MODULE.check(candidate)
        self.assertFalse(report["passed"])
        self.assertTrue(any(item["check"] == "browser_profile_fields" for item in report["errors"]))
        self.assertTrue(any(item["check"] == "case_viewport" for item in report["errors"]))

    def test_release_matrix_v2_rejects_profile_os_mismatch(self) -> None:
        candidate = release_matrix_v2()
        candidate["cases"][0]["os"] = "macOS"
        report = MODULE.check(candidate)
        self.assertFalse(report["passed"])
        self.assertTrue(any(item["check"] == "case_profile_os" for item in report["errors"]))


if __name__ == "__main__":
    unittest.main()
