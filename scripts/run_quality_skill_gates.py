#!/usr/bin/env python3
"""Run mandatory release gates for AI and data quality skills."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_AI_TAGS = (
    "happy-path,hallucination,rag-grounding,prompt-injection,safety,"
    "tool-call,structured-output,timeout,cost"
)


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    run(["node", "--check", "data-quality-qa/scripts/supabase_readonly_smoke.js"])
    run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "ai-quality-qa/tests",
            "-p",
            "test_*.py",
            "-v",
        ]
    )
    run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "data-quality-qa/tests",
            "-p",
            "test_*.py",
            "-v",
        ]
    )
    run(
        [
            sys.executable,
            "ai-quality-qa/scripts/evaluate_jsonl.py",
            "ai-quality-qa/tests/fixtures/duocare_golden_v1.jsonl",
            "--min-pass-rate",
            "1",
            "--max-p95-latency-ms",
            "5000",
            "--max-average-cost-usd",
            "0.01",
            "--required-tags",
            REQUIRED_AI_TAGS,
            "--required-critical-tags",
            REQUIRED_AI_TAGS,
            "--require-version-metadata",
        ]
    )
    run([sys.executable, "scripts/validate_cross_model.py"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
