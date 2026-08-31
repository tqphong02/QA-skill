import argparse
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import tempfile
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
        "env_var": [],
        "bail": False,
        "timeout": None,
        "timeout_request": None,
        "report_dir": None,
        "cleanup_item": [],
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

    def test_postman_report_omits_headers_and_bodies(self):
        command = RUNNER.build_run_command(
            args(report_dir="evidence"), "postman-cli", "postman", "v2"
        )
        self.assertIn("--reporter-json-omitHeaders", command)
        self.assertIn("--reporter-json-omitRequestBodies", command)
        self.assertIn("--reporter-json-omitResponseBodies", command)

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

    def test_api_test_dry_run_preflights_target_and_assertions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            collection = root / "collection.json"
            collection.write_text(
                json.dumps(
                    {
                        "info": {
                            "name": "API smoke",
                            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                        },
                        "event": [
                            {
                                "listen": "test",
                                "script": {"exec": ["pm.test('status', () => pm.response.to.have.status(200));"]},
                            }
                        ],
                        "item": [
                            {
                                "name": "Health",
                                "request": {"method": "GET", "url": "{{baseUrl}}/health"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            report_dir = root / "report"
            options = args(
                collection=str(collection),
                engine="auto",
                dry_run=True,
                report_dir=str(report_dir),
                target="https://api.example.test",
                target_variable="baseUrl",
                allow_mutations=False,
                cleanup_item=[],
            )
            with contextlib.redirect_stdout(io.StringIO()):
                code = RUNNER.command_api_test(options)
            self.assertEqual(code, 0)
            preflight = json.loads(
                (report_dir / "api-test-preflight.json").read_text(encoding="utf-8")
            )
            self.assertEqual(preflight["status"], "PASS")
            self.assertEqual(preflight["methods"], ["GET"])

    def test_api_test_blocks_mutation_without_cleanup_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            collection = root / "collection.json"
            collection.write_text(
                json.dumps(
                    {
                        "info": {
                            "name": "Mutation",
                            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                        },
                        "event": [{"listen": "test", "script": {"exec": ["pm.test('ok', () => true);"]}}],
                        "item": [
                            {
                                "name": "Create",
                                "request": {"method": "POST", "url": "{{baseUrl}}/orders"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            options = args(
                collection=str(collection),
                engine="auto",
                dry_run=True,
                report_dir=str(root / "report"),
                target="https://api.example.test",
                target_variable="baseUrl",
                allow_mutations=False,
                cleanup_item=[],
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                code = RUNNER.command_api_test(options)
            self.assertEqual(code, 2)
            self.assertIn("mutations_require_explicit_allow_mutations", stderr.getvalue())

    def test_target_mismatch_is_rejected(self):
        inspection = {
            "requests": [{"url": "https://other.example.test/health"}],
            "variables": [],
        }
        with self.assertRaisesRegex(RUNNER.RunnerError, "target_mismatch"):
            RUNNER.validate_target(inspection, "https://api.example.test", "baseUrl")

    def test_execution_summary_requires_assertions_and_cleanup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report = {
                "run": {
                    "stats": {
                        "requests": {"total": 2, "failed": 0},
                        "assertions": {"total": 2, "failed": 0},
                        "testScripts": {"total": 2, "failed": 0},
                    },
                    "executions": [
                        {"item": {"name": "Create"}},
                        {"item": {"name": "Cleanup"}},
                    ],
                }
            }
            (root / "report.json").write_text(json.dumps(report), encoding="utf-8")
            result = RUNNER.write_execution_summary(
                str(root),
                engine="newman",
                collection_kind="v2",
                exit_code=0,
                command=["newman", "run", "collection.json"],
                cleanup_items=["Cleanup"],
            )
            self.assertEqual(result["verdict"], "PASS")
            self.assertTrue(result["cleanup_verified"])


class EnvVarTests(unittest.TestCase):
    def test_env_var_forwarded_to_postman_cli_command(self):
        command = RUNNER.build_run_command(
            args(env_var=["baseUrl=https://api.example.test", "token=abc"]),
            "postman-cli",
            "postman",
            "v2",
        )
        self.assertIn("--env-var", command)
        self.assertIn("baseUrl=https://api.example.test", command)

    def test_env_var_forwarded_to_newman_command(self):
        command = RUNNER.build_run_command(
            args(env_var=["baseUrl=https://api.example.test"]),
            "newman",
            "newman",
            "v2",
        )
        self.assertIn("--env-var", command)

    def test_multiple_env_vars_all_present(self):
        command = RUNNER.build_run_command(
            args(env_var=["k1=v1", "k2=v2", "k3=v3"]),
            "postman-cli",
            "postman",
            "v2",
        )
        env_var_count = command.count("--env-var")
        self.assertEqual(env_var_count, 3)

    def test_env_var_with_sensitive_key_is_redacted_in_safe_command(self):
        # --env-var argument following --env-var flag should be redacted
        command = ["newman", "run", "col.json", "--env-var", "token=super-secret"]
        rendered = RUNNER.safe_command(command)
        self.assertNotIn("super-secret", rendered)


class DryRunTests(unittest.TestCase):
    def test_dry_run_without_report_dir_prints_command_and_returns_zero(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            collection = root / "col.json"
            collection.write_text(
                json.dumps(
                    {
                        "info": {
                            "name": "Dry run",
                            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                        },
                        "item": [
                            {
                                "name": "Health",
                                "request": {"method": "GET", "url": "{{baseUrl}}/health"},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            options = args(
                collection=str(collection),
                engine="auto",
                dry_run=True,
                report_dir=None,
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = RUNNER.command_run(options)
            self.assertEqual(code, 0)
            self.assertIn("ENGINE", stdout.getvalue())


class InspectCollectionTests(unittest.TestCase):
    FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"

    def test_smoke_collection_has_one_request(self):
        col = str(self.FIXTURE_DIR / "api-smoke.collection.json")
        inspection = RUNNER.inspect_collection(col)
        self.assertEqual(inspection["request_count"], 1)
        self.assertTrue(inspection["has_tests"])
        self.assertIn("GET", inspection["methods"])

    def test_nested_collection_counts_all_leaf_requests(self):
        col = str(self.FIXTURE_DIR / "nested.collection.json")
        inspection = RUNNER.inspect_collection(col)
        # nested has: Login, Logout, Get Profile, Health = 4 requests
        self.assertEqual(inspection["request_count"], 4)

    def test_nested_collection_item_names_include_folder_path(self):
        col = str(self.FIXTURE_DIR / "nested.collection.json")
        inspection = RUNNER.inspect_collection(col)
        names = inspection["item_names"]
        # Names should include folder prefix path
        self.assertTrue(any("Login" in n for n in names))
        self.assertTrue(any("Health" in n for n in names))

    def test_mutation_fixture_identifies_mutation_items(self):
        col = str(self.FIXTURE_DIR / "mutation.collection.json")
        inspection = RUNNER.inspect_collection(col)
        self.assertIn("Create Order", inspection["mutation_items"])
        self.assertIn("Delete Order", inspection["mutation_items"])

    def test_mutation_fixture_has_tests_true(self):
        col = str(self.FIXTURE_DIR / "mutation.collection.json")
        inspection = RUNNER.inspect_collection(col)
        self.assertTrue(inspection["has_tests"])

    def test_empty_collection_has_zero_requests(self):
        col = str(self.FIXTURE_DIR / "empty.collection.json")
        inspection = RUNNER.inspect_collection(col)
        self.assertEqual(inspection["request_count"], 0)

    def test_cleanup_item_matched_by_leaf_name(self):
        """api-test allows cleanup-item specified as either full path or leaf name."""
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            collection = root / "col.json"
            collection.write_text(
                json.dumps(
                    {
                        "info": {
                            "name": "Cleanup leaf",
                            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                        },
                        "event": [
                            {
                                "listen": "test",
                                "script": {"exec": ["pm.test('ok', () => true);"]},
                            }
                        ],
                        "item": [
                            {
                                "name": "Folder",
                                "item": [
                                    {
                                        "name": "Cleanup",
                                        "request": {
                                            "method": "DELETE",
                                            "url": "{{baseUrl}}/res/1",
                                        },
                                    }
                                ],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            options = args(
                collection=str(collection),
                engine="auto",
                dry_run=True,
                report_dir=str(root / "report"),
                target="https://api.example.test",
                target_variable="baseUrl",
                allow_mutations=True,
                cleanup_item=["Cleanup"],
            )
            with contextlib.redirect_stdout(io.StringIO()):
                code = RUNNER.command_api_test(options)
            self.assertEqual(code, 0)


class RedactJsonTests(unittest.TestCase):
    def test_sensitive_keys_are_redacted_in_dict(self):
        payload = {"username": "admin", "password": "s3cr3t", "data": "visible"}
        redacted = RUNNER.redact_json(payload)
        self.assertEqual(redacted["password"], "<redacted>")
        self.assertEqual(redacted["data"], "visible")

    def test_nested_sensitive_keys_are_redacted(self):
        payload = {"auth": {"token": "tok123", "user": "bob"}}
        redacted = RUNNER.redact_json(payload)
        self.assertEqual(redacted["auth"]["token"], "<redacted>")
        self.assertEqual(redacted["auth"]["user"], "bob")

    def test_sensitive_key_in_list_context_is_not_redacted_by_parent_key(self):
        # Items inside a list with non-sensitive parent key are checked by their own keys
        payload = {"results": [{"api_key": "k1"}, {"name": "n1"}]}
        redacted = RUNNER.redact_json(payload)
        self.assertEqual(redacted["results"][0]["api_key"], "<redacted>")
        self.assertEqual(redacted["results"][1]["name"], "n1")

    def test_bearer_token_in_string_value_is_redacted(self):
        payload = {"header": "Bearer eyJhbGciOiJIUzI1NiJ9.abc.def"}
        redacted = RUNNER.redact_json(payload)
        self.assertNotIn("eyJhbGciOiJIUzI1NiJ9", redacted["header"])

    def test_non_sensitive_values_pass_through(self):
        payload = {"status": "active", "count": 42, "enabled": True}
        redacted = RUNNER.redact_json(payload)
        self.assertEqual(redacted["status"], "active")
        self.assertEqual(redacted["count"], 42)
        self.assertTrue(redacted["enabled"])


class NewmanReportSummaryTests(unittest.TestCase):
    def test_empty_executions_list_returns_summary_with_zero_executed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report = {
                "run": {
                    "stats": {
                        "requests": {"total": 0, "failed": 0},
                        "assertions": {"total": 0, "failed": 0},
                        "testScripts": {"total": 0, "failed": 0},
                    },
                    "executions": [],
                }
            }
            (root / "report.json").write_text(json.dumps(report), encoding="utf-8")
            summary = RUNNER.newman_report_summary(root / "report.json")
            self.assertIsNotNone(summary)
            self.assertEqual(summary["executed_items"], [])
            self.assertEqual(summary["requests_total"], 0)

    def test_missing_report_file_returns_none(self):
        summary = RUNNER.newman_report_summary(Path("/nonexistent/report.json"))
        self.assertIsNone(summary)

    def test_invalid_json_returns_none(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            bad = Path(temp_dir) / "report.json"
            bad.write_text("NOT JSON", encoding="utf-8")
            summary = RUNNER.newman_report_summary(bad)
            self.assertIsNone(summary)

    def test_execution_summary_untest_when_zero_assertions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report = {
                "run": {
                    "stats": {
                        "requests": {"total": 1, "failed": 0},
                        "assertions": {"total": 0, "failed": 0},
                        "testScripts": {"total": 0, "failed": 0},
                    },
                    "executions": [{"item": {"name": "Health"}}],
                }
            }
            (root / "report.json").write_text(json.dumps(report), encoding="utf-8")
            result = RUNNER.write_execution_summary(
                str(root),
                engine="newman",
                collection_kind="v2",
                exit_code=0,
                command=["newman", "run", "col.json"],
            )
            self.assertEqual(result["verdict"], "UNTEST")

    def test_execution_summary_failed_on_assertion_failure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report = {
                "run": {
                    "stats": {
                        "requests": {"total": 2, "failed": 0},
                        "assertions": {"total": 2, "failed": 1},
                        "testScripts": {"total": 2, "failed": 0},
                    },
                    "executions": [{"item": {"name": "A"}}, {"item": {"name": "B"}}],
                }
            }
            (root / "report.json").write_text(json.dumps(report), encoding="utf-8")
            result = RUNNER.write_execution_summary(
                str(root),
                engine="newman",
                collection_kind="v2",
                exit_code=0,
                command=["newman", "run", "col.json"],
            )
            self.assertEqual(result["verdict"], "FAILED")

    def test_execution_summary_untest_when_cleanup_not_executed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            report = {
                "run": {
                    "stats": {
                        "requests": {"total": 1, "failed": 0},
                        "assertions": {"total": 2, "failed": 0},
                        "testScripts": {"total": 1, "failed": 0},
                    },
                    "executions": [{"item": {"name": "Create"}}],
                }
            }
            (root / "report.json").write_text(json.dumps(report), encoding="utf-8")
            result = RUNNER.write_execution_summary(
                str(root),
                engine="newman",
                collection_kind="v2",
                exit_code=0,
                command=["newman", "run", "col.json"],
                cleanup_items=["Delete"],  # not in executions
            )
            self.assertEqual(result["verdict"], "UNTEST")
            self.assertFalse(result["cleanup_verified"])


class ValidateTargetTests(unittest.TestCase):
    def _inspection(self, urls: list[str]) -> dict:
        return {
            "requests": [{"url": u} for u in urls],
            "variables": ["baseUrl"],
        }

    def test_variable_only_url_passes_any_target(self):
        inspection = self._inspection(["{{baseUrl}}/health"])
        # Should not raise
        RUNNER.validate_target(inspection, "https://api.example.test", "baseUrl")

    def test_http_target_is_accepted(self):
        inspection = self._inspection(["{{baseUrl}}/x"])
        RUNNER.validate_target(inspection, "http://localhost:8080", "baseUrl")

    def test_target_with_credentials_in_url_is_rejected(self):
        inspection = self._inspection(["{{baseUrl}}/x"])
        with self.assertRaisesRegex(RUNNER.RunnerError, "credentials_in_url"):
            RUNNER.validate_target(
                inspection, "https://user:pass@api.example.test", "baseUrl"
            )

    def test_invalid_scheme_is_rejected(self):
        inspection = self._inspection(["{{baseUrl}}/x"])
        with self.assertRaisesRegex(RUNNER.RunnerError, "invalid_target"):
            RUNNER.validate_target(inspection, "ftp://api.example.test", "baseUrl")


if __name__ == "__main__":
    unittest.main()
