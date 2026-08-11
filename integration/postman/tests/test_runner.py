import argparse
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "runner.py"
SPEC = importlib.util.spec_from_file_location("postman_runner", MODULE_PATH)
assert SPEC and SPEC.loader
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


def args(**overrides):
    value = {
        "collection": "collection.json",
        "environment": None,
        "globals": None,
        "iteration_data": None,
        "iterations": None,
        "item": [],
        "bail": False,
        "timeout": None,
        "timeout_request": None,
        "report_dir": None,
    }
    value.update(overrides)
    return argparse.Namespace(**value)


class RunnerTests(unittest.TestCase):
    def test_postman_command(self):
        command = RUNNER.build_run_command(
            args(environment="dev.json", bail=True),
            "postman-cli",
            "postman",
            "v2",
        )
        self.assertEqual(
            command,
            [
                "postman",
                "collection",
                "run",
                "collection.json",
                "-e",
                "dev.json",
                "--bail",
            ],
        )

    def test_newman_report_command(self):
        command = RUNNER.build_run_command(
            args(report_dir="evidence"), "newman", "newman", "v2"
        )
        self.assertIn("--reporter-json-export", command)
        self.assertIn("evidence/report.json", command)
        self.assertIn("--reporter-junit-export", command)

    def test_newman_rejects_v3(self):
        with self.assertRaisesRegex(RUNNER.RunnerError, "incompatible"):
            RUNNER.choose_engine("newman", "v3", dry_run=True)

    def test_redacts_api_key_query(self):
        rendered = RUNNER.safe_command(
            [
                "newman",
                "run",
                "https://example.test/collection?apikey=secret&safe=value",
            ]
        )
        self.assertNotIn("secret", rendered)
        self.assertIn("safe=value", rendered)


if __name__ == "__main__":
    unittest.main()
