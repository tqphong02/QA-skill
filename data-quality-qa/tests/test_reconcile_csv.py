from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = SKILL_ROOT / "tests" / "fixtures"
SCRIPT = SKILL_ROOT / "scripts" / "reconcile_csv.py"
SPEC = importlib.util.spec_from_file_location("reconcile_csv", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def reconcile(source: Path, target: Path, key: str = "id"):
    args = argparse.Namespace(
        source=str(source),
        target=str(target),
        key=key,
        ignore_columns="",
        null_values=",null,none,n/a,na",
        allow_extra_target_columns=False,
        sample_limit=20,
        output=None,
    )
    return MODULE.reconcile(args)


def check(report: dict[str, object], name: str) -> dict[str, object]:
    return next(item for item in report["checks"] if item["name"] == name)


class ReconcileCsvTests(unittest.TestCase):
    def test_unicode_decimal_timezone_and_null_baseline_pass(self) -> None:
        report, passed = reconcile(
            FIXTURES / "etl_source_v1.csv", FIXTURES / "etl_target_v1.csv"
        )
        self.assertTrue(passed, report)
        self.assertTrue(check(report, "null_profile")["passed"])
        self.assertTrue(check(report, "row_values")["passed"])

    def test_schema_drift_is_detected(self) -> None:
        report, passed = reconcile(
            FIXTURES / "etl_source_v1.csv",
            FIXTURES / "etl_target_schema_drift.csv",
        )
        self.assertFalse(passed)
        self.assertFalse(check(report, "schema")["passed"])

    def test_null_semantic_drift_is_detected(self) -> None:
        report, passed = reconcile(
            FIXTURES / "etl_source_v1.csv",
            FIXTURES / "etl_target_null_mismatch.csv",
        )
        self.assertFalse(passed)
        self.assertFalse(check(report, "null_profile")["passed"])

    def test_retry_duplicate_is_not_idempotent(self) -> None:
        report, passed = reconcile(
            FIXTURES / "etl_source_v1.csv",
            FIXTURES / "etl_target_duplicate_retry.csv",
        )
        self.assertFalse(passed)
        self.assertFalse(check(report, "business_key_uniqueness")["passed"])

    def test_incremental_load_and_replay_are_idempotent(self) -> None:
        source = FIXTURES / "etl_source_v2_incremental.csv"
        target = FIXTURES / "etl_target_v2_incremental.csv"
        first_report, first_passed = reconcile(source, target)
        replay_report, replay_passed = reconcile(source, target)
        self.assertTrue(first_passed, first_report)
        self.assertTrue(replay_passed, replay_report)
        self.assertEqual(first_report["checks"], replay_report["checks"])

    def test_spaced_headers_cannot_hide_changed_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.csv"
            target = Path(temp_dir) / "target.csv"
            source.write_text(" id , name \n1,Alice\n", encoding="utf-8")
            target.write_text(" id , name \n9,Bob\n", encoding="utf-8")
            report, passed = reconcile(source, target)
        self.assertFalse(passed)
        self.assertFalse(check(report, "row_values")["passed"])

    def test_sensitive_business_keys_are_redacted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.csv"
            target = Path(temp_dir) / "target.csv"
            source.write_text("email,amount\nalice@example.com,10\n", encoding="utf-8")
            target.write_text("email,amount\nbob@example.com,10\n", encoding="utf-8")
            report, passed = reconcile(source, target, key="email")
        payload = json.dumps(report, ensure_ascii=False)
        self.assertFalse(passed)
        self.assertNotIn("alice@example.com", payload)
        self.assertNotIn("bob@example.com", payload)
        self.assertIn("sha256:", payload)


if __name__ == "__main__":
    unittest.main()
