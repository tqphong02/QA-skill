from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("usability_checker", ROOT / "scripts/check_usability_artifact.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def packet(mode: str = "plan") -> dict:
    task = {
        "id": "TASK-001",
        "name": "Sign in",
        "successCriteria": "Participant reaches the account home page",
        "maxSteps": 5,
        "maxTimeSeconds": 120,
        "checks": {
            "discoverability": "Find the primary sign-in action without moderator help",
            "comprehension": "Explain what the validation message means",
            "errorRecovery": "Correct an invalid password and complete the task",
        },
    }
    if mode == "observed":
        task["observations"] = [{
            "participantId": "P01",
            "completed": True,
            "durationSeconds": 42,
            "errors": 0,
            "assistance": False,
        }]
    return {
        "project": "SJK",
        "target": "login",
        "mode": mode,
        "requirements": [{"id": "REQ-UI-001"}],
        "participants": {
            "count": 5,
            "profile": "target users",
            "consentPolicy": "obtained" if mode == "observed" else "required",
            "pseudonymousIds": True,
        },
        "tasks": [task],
        "metrics": {
            "successRate": {"targetMin": 0.8, **({"observed": 1.0} if mode == "observed" else {})},
            "medianTimeSeconds": {"targetMax": 120, **({"observed": 42} if mode == "observed" else {})},
            "errorRate": {"targetMax": 0.2, **({"observed": 0.0} if mode == "observed" else {})},
            "assistanceRate": {"targetMax": 0.2, **({"observed": 0.0} if mode == "observed" else {})},
            "susScore": {"targetMin": 70, **({"observed": 82} if mode == "observed" else {})},
        },
        "evidence": [],
    }


class UsabilityCheckerTests(unittest.TestCase):
    def test_complete_plan_is_ready(self) -> None:
        report = MODULE.check_packet(packet(), Path(tempfile.gettempdir()))
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["status"], "READY")

    def test_observed_result_requires_evidence_and_passes_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "session-notes.md").write_text("pseudonymous observation\n", encoding="utf-8")
            observed = packet("observed")
            observed["evidence"] = ["session-notes.md"]
            report = MODULE.check_packet(observed, base)
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["status"], "PASS")

    def test_missing_usability_dimension_fails_closed(self) -> None:
        invalid = packet()
        invalid["tasks"][0]["checks"].pop("comprehension")
        invalid["metrics"].pop("errorRate")
        report = MODULE.check_packet(invalid, Path(tempfile.gettempdir()))
        self.assertFalse(report["passed"])
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any(item["check"] == "task_checks" for item in report["errors"]))
        self.assertTrue(any(item["check"] == "metric_definition" for item in report["errors"]))


if __name__ == "__main__":
    unittest.main()
