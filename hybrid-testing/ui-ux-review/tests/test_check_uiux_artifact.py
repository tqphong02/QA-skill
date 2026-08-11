from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("uiux_checker", ROOT / "scripts/check_uiux_artifact.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def packet(evidence: str = "login.png") -> dict:
    return {
        "project": "SJK",
        "target": "login",
        "requirements": [{"id": "REQ-UI-001", "description": "primary login action"}],
        "viewport_matrix": [
            {"name": "desktop", "width": 1440, "height": 900},
            {"name": "mobile", "width": 390, "height": 844},
        ],
        "screens": [{
            "id": "login",
            "requirement_ids": ["REQ-UI-001"],
            "states": ["default", "loading", "validation", "error", "empty", "success"],
            "evidence": [evidence],
        }],
        "accessibility_handoff": "hybrid-accessibility",
    }


class UiUxCheckerTests(unittest.TestCase):
    def test_valid_packet_requires_existing_media(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "login.png").write_bytes(b"fixture")
            report = MODULE.check_packet(packet(), base)
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["evidence"][0]["exists"], True)

    def test_missing_state_and_evidence_fail_closed(self) -> None:
        invalid = packet("missing.png")
        invalid["screens"][0]["states"] = ["default"]
        report = MODULE.check_packet(invalid, Path(tempfile.gettempdir()))
        self.assertFalse(report["passed"])
        self.assertTrue(any(item["check"] == "screen_states" for item in report["errors"]))
        self.assertTrue(any(item["check"] == "evidence_exists" for item in report["errors"]))


if __name__ == "__main__":
    unittest.main()
