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


if __name__ == "__main__":
    unittest.main()
