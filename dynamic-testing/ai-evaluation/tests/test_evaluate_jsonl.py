from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "evaluate_jsonl.py"
GOLDEN = SKILL_ROOT / "tests" / "fixtures" / "duocare_golden_v1.jsonl"
REQUIRED_TAGS = (
    "happy-path,hallucination,rag-grounding,prompt-injection,safety,"
    "tool-call,structured-output,timeout,cost"
)


def run_evaluator(lines: list[dict[str, object]], *extra_args: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as temp_dir:
        dataset = Path(temp_dir) / "cases.jsonl"
        dataset.write_text(
            "".join(json.dumps(line, ensure_ascii=False) + "\n" for line in lines),
            encoding="utf-8",
        )
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(dataset), *extra_args],
            check=False,
            capture_output=True,
            text=True,
        )


class EvaluateJsonlTests(unittest.TestCase):
    def test_versioned_golden_dataset_passes_release_gates(self) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(GOLDEN),
                "--min-pass-rate",
                "1",
                "--max-p95-latency-ms",
                "5000",
                "--max-average-cost-usd",
                "0.01",
                "--required-tags",
                REQUIRED_TAGS,
                "--required-critical-tags",
                REQUIRED_TAGS,
                "--require-version-metadata",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        report = json.loads(result.stdout)
        self.assertTrue(report["passed"])
        self.assertEqual(report["critical_failure_ids"], [])
        self.assertEqual(report["coverage"]["missing_required_critical_tags"], [])
        self.assertEqual(report["metadata"]["dataset_versions"], ["duocare-golden-v1"])

    def test_duplicate_case_ids_are_rejected(self) -> None:
        result = run_evaluator(
            [
                {"id": "AI-DUP", "expected": "one", "actual": "one"},
                {"id": "AI-DUP", "expected": "two", "actual": "two"},
            ]
        )
        self.assertEqual(result.returncode, 2)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("Duplicate case id", json.loads(result.stderr)["error"])

    def test_invalid_metric_is_structured_input_error(self) -> None:
        result = run_evaluator(
            [{"id": "AI-METRIC", "expected": "ok", "actual": "ok", "latency_ms": "bad"}],
            "--max-p95-latency-ms",
            "5000",
        )
        self.assertEqual(result.returncode, 2)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("latency_ms", json.loads(result.stderr)["error"])

    def test_critical_failure_blocks_release(self) -> None:
        result = run_evaluator(
            [
                {
                    "id": "AI-SAFE",
                    "actual": "unsafe",
                    "expect_no_safety_violations": True,
                    "safety_violations": ["policy breach"],
                    "tags": ["safety"],
                    "critical": True,
                }
            ],
            "--required-critical-tags",
            "safety",
        )
        self.assertEqual(result.returncode, 1)
        report = json.loads(result.stdout)
        self.assertEqual(report["critical_failure_ids"], ["AI-SAFE"])
        self.assertFalse(report["gates"]["critical_cases"])

    def test_missing_critical_coverage_blocks_release(self) -> None:
        result = run_evaluator(
            [{"id": "AI-HAPPY", "expected": "ok", "actual": "ok", "tags": ["happy-path"]}],
            "--required-critical-tags",
            "safety",
        )
        self.assertEqual(result.returncode, 1)
        report = json.loads(result.stdout)
        self.assertEqual(report["coverage"]["missing_required_critical_tags"], ["safety"])


if __name__ == "__main__":
    unittest.main()
