from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("release_checker", ROOT / "scripts/evaluate_release.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def release_packet() -> dict:
    return {
        "release_id": "SJK-2026.08.01",
        "target": "local",
        "scope": ["login"],
        "risk": "medium",
        "test_summary": {"status": "PASS", "passed": True, "pass_rate": 1.0, "run_id": "run-local"},
        "quality_metrics": {"executed": 10, "passed": 10, "failed": 0, "blocked": 0, "flaky": 0, "with_evidence": 10, "risk_coverage": 1.0},
        "defects": [{"id": "BUG-1", "severity": "P2", "status": "closed"}],
        "evidence": ["summary.md"],
        "approvals": {"qa_owner": True, "release_owner": True},
        "exit_criteria": [{"id": "functional", "passed": True}],
        "post_release": {"owner": "qa-owner", "smoke_required": True, "rollback_ready": True},
    }


class ReleaseGateTests(unittest.TestCase):
    def test_complete_packet_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "summary.md").write_text("local evidence\n", encoding="utf-8")
            report = MODULE.evaluate(release_packet(), base)
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["decision"], "PASS")

    def test_open_high_risk_defect_fails(self) -> None:
        packet = release_packet()
        packet["defects"] = [{"id": "BUG-P1", "severity": "P1", "status": "open"}]
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "summary.md").write_text("local evidence\n", encoding="utf-8")
            report = MODULE.evaluate(packet, base)
        self.assertFalse(report["passed"])
        self.assertEqual(report["decision"], "FAIL")
        self.assertTrue(any(item["gate"] == "defect_risk" for item in report["errors"]))

    def test_declared_non_functional_scope_requires_local_evidence(self) -> None:
        packet = release_packet()
        packet["required_non_functional"] = ["performance", "security"]
        packet["non_functional"] = {
            "performance": {"status": "PASS", "runIds": ["perf-run-1"], "evidence": ["performance.json"]},
            "security": {"status": "PASS", "runIds": ["security-run-1"], "evidence": ["security.json"]},
        }
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            for name in ("summary.md", "performance.json", "security.json"):
                (base / name).write_text("local evidence\n", encoding="utf-8")
            report = MODULE.evaluate(packet, base)
        self.assertTrue(report["passed"], report)
        self.assertTrue(any(item["name"] == "nfr_performance" for item in report["gates"]))

    def test_declared_non_functional_scope_without_evidence_is_blocked(self) -> None:
        packet = release_packet()
        packet["required_non_functional"] = ["usability"]
        packet["non_functional"] = {"usability": {"status": "PASS", "runIds": [], "evidence": []}}
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "summary.md").write_text("local evidence\n", encoding="utf-8")
            report = MODULE.evaluate(packet, base)
        self.assertFalse(report["passed"])
        self.assertEqual(report["decision"], "BLOCKED")
        self.assertTrue(any(item["gate"] == "nfr_usability" for item in report["errors"]))


if __name__ == "__main__":
    unittest.main()
