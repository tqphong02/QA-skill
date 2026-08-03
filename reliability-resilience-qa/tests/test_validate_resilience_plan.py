from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("resilience_checker", ROOT / "scripts/validate_resilience_plan.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def plan() -> dict:
    return {
        "target": "local-staging",
        "scope": "checkout dependency timeout",
        "environment": "staging",
        "execution_mode": "plan",
        "hypothesis": "checkout degrades gracefully when payment times out",
        "failure_injection": {"type": "dependency_timeout", "duration_seconds": 5},
        "steady_state": {"slo": "error rate < 1%", "window_minutes": 5},
        "stop_conditions": {"abort_on": "error rate > 5%", "owner_contact": "qa-owner"},
        "recovery": {
            "rollback": "remove fault rule",
            "rto_target": "60s",
            "rpo_target": "0",
            "backup_restore_in_scope": False,
            "backup_restore_reason": "dependency timeout does not mutate persistent data",
        },
        "observability": {"signals": ["http_errors", "latency", "trace_id"]},
        "cleanup": {"steps": ["remove rule", "verify steady state"]},
        "approval": False,
    }


class ResiliencePlanTests(unittest.TestCase):
    def test_read_only_plan_is_ready(self) -> None:
        report = MODULE.validate(plan())
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["status"], "READY")

    def test_active_injection_without_approval_is_blocked(self) -> None:
        candidate = plan()
        candidate["execution_mode"] = "execute"
        report = MODULE.validate(candidate)
        self.assertFalse(report["passed"])
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any(item["gate"] == "execution_authorization" for item in report["errors"]))

    def test_backup_restore_in_scope_requires_restore_proof(self) -> None:
        candidate = plan()
        candidate["recovery"] = {
            "rollback": "remove fault rule",
            "rto_target": "60s",
            "rpo_target": "0",
            "backup_restore_in_scope": True,
        }
        report = MODULE.validate(candidate)
        self.assertFalse(report["passed"])
        self.assertTrue(any(item["gate"] == "backup_restore" for item in report["errors"]))

    def test_backup_restore_in_scope_can_be_ready(self) -> None:
        candidate = plan()
        candidate["recovery"] = {
            "rollback": "remove fault rule",
            "rto_target": "60s",
            "rpo_target": "0",
            "backup_restore_in_scope": True,
            "backup_reference": "backup-run-42",
            "restore_steps": ["restore snapshot", "replay validation query"],
            "data_integrity_check": "compare checkout records and checksums",
        }
        report = MODULE.validate(candidate)
        self.assertTrue(report["passed"], report)
        self.assertTrue(any(item["name"] == "backup_restore" and item["status"] == "PASS" for item in report["gates"]))


if __name__ == "__main__":
    unittest.main()
