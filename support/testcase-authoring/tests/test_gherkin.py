import importlib.util
import pathlib
import unittest

SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, SKILL_ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GherkinGeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gherkin = load_module('gen_gherkin', 'scripts/gen-gherkin.py')
        cls.coverage = load_module('coverage_report', 'scripts/coverage-report.py')

    def test_bva_technique_renders_scenario_outline(self):
        source = {
            "project": "Checkout Module",
            "scope": "Order Discount Validation",
            "sections": [
                {
                    "name": "Discount Rules",
                    "scenarios": [
                        {
                            "id": "SCN-DISC-001",
                            "name": "Validate discount percentage boundary values",
                            "cases": [
                                {
                                    "testcase_id": "TC-BVA-01",
                                    "bb_technique": "BVA",
                                    "preconditions": ["User is logged in as Gold member"],
                                    "action_summary": "User enters discount rate",
                                    "input": "0%",
                                    "expected_result": "Discount 0% accepted with no reduction",
                                },
                                {
                                    "testcase_id": "TC-BVA-02",
                                    "bb_technique": "BVA",
                                    "preconditions": ["User is logged in as Gold member"],
                                    "action_summary": "User enters discount rate",
                                    "input": "100%",
                                    "expected_result": "Discount 100% accepted with full waiver",
                                },
                            ],
                        }
                    ],
                }
            ],
        }

        output = self.gherkin.render_feature(source)
        self.assertIn("Feature: Checkout Module — Order Discount Validation", output)
        self.assertIn("Scenario Outline: Validate discount percentage boundary values", output)
        self.assertIn("Given User is logged in as Gold member", output)
        self.assertIn("When User enters discount rate", output)
        self.assertIn("Then the result should be <expected_result>", output)
        self.assertIn("Examples:", output)
        self.assertIn("| testcase_id | input | expected_result |", output)
        self.assertIn("| TC-BVA-01 | 0% | Discount 0% accepted with no reduction |", output)
        self.assertIn("| TC-BVA-02 | 100% | Discount 100% accepted with full waiver |", output)

    def test_ep_technique_renders_standard_scenarios(self):
        source = {
            "project": "User Authentication",
            "sections": [
                {
                    "name": "Login",
                    "groups": [
                        {
                            "name": "Standard Login",
                            "scenarios": [
                                {
                                    "id": "SCN-AUTH-001",
                                    "name": "Valid credentials login",
                                    "cases": [
                                        {
                                            "testcase_id": "TC-EP-01",
                                            "bb_technique": "EP",
                                            "description": "User enters valid email and password",
                                            "preconditions": ["User account exists and is active"],
                                            "action_summary": "User clicks login button",
                                            "expected_result": "Dashboard page is displayed",
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ],
        }

        output = self.gherkin.render_feature(source)
        self.assertIn("Feature: User Authentication", output)
        self.assertIn("Scenario: User enters valid email and password", output)
        self.assertIn("Given User account exists and is active", output)
        self.assertIn("When User clicks login button", output)
        self.assertIn("Then Dashboard page is displayed", output)
        self.assertNotIn("Scenario Outline:", output)
        self.assertNotIn("Examples:", output)

    def test_missing_expected_result_raises_validation_error(self):
        invalid_source = {
            "project": "Invalid Test",
            "sections": [
                {
                    "scenarios": [
                        {
                            "id": "SCN-ERR-001",
                            "name": "Missing expected result case",
                            "cases": [
                                {
                                    "testcase_id": "TC-ERR-01",
                                    "description": "Do something",
                                    # expected_result is omitted
                                }
                            ],
                        }
                    ]
                }
            ],
        }

        with self.assertRaises(ValueError) as ctx:
            self.gherkin.render_feature(invalid_source)
        self.assertIn("missing expected_result", str(ctx.exception))

    def test_requirement_coverage_report(self):
        source = {
            "project": "Coverage Test",
            "requirements": [
                {
                    "id": "REQ-01",
                    "text": "User registration with email",
                    "coverage_items": [
                        {"id": "COV-01", "description": "Valid email format"},
                        {"id": "COV-02", "description": "Duplicate email check"},
                    ],
                }
            ],
            "sections": [
                {
                    "scenarios": [
                        {
                            "id": "SCN-01",
                            "cases": [
                                {
                                    "testcase_id": "TC-01",
                                    "coverage_item_refs": ["COV-01"],
                                    "expected_result": "Success",
                                }
                            ],
                        }
                    ]
                }
            ],
        }

        report = self.coverage.build_report(source)
        summary = self.coverage.calculate_summary(report)

        self.assertEqual(summary["total_items"], 2)
        self.assertEqual(summary["covered_items"], 1)
        self.assertEqual(summary["uncovered_items"], 1)
        self.assertEqual(summary["coverage_pct"], 50.0)


if __name__ == "__main__":
    unittest.main()
