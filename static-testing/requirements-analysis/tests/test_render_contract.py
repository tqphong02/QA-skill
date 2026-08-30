import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render-qa.py"
SPEC = importlib.util.spec_from_file_location("requirements_render", SCRIPT)
RENDER = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(RENDER)


class RenderContractTests(unittest.TestCase):
    def fixture(self):
        path = ROOT / "examples" / "sample-analysis.json"
        return path, json.loads(path.read_text(encoding="utf-8"))

    def test_sample_v3_contract_is_valid(self):
        path, data = self.fixture()
        questions, completion = RENDER.validate(data, path)
        self.assertEqual(completion, "DONE_WITH_OPEN_QA")
        self.assertEqual([item["id"] for item in questions], ["QA-001"])

    def test_step_excerpt_must_exist_under_referenced_heading(self):
        path, data = self.fixture()
        data["modules"][0]["flows"][0]["steps"][0]["source_excerpt"] = "Quản trị viên có thể vô hiệu tài khoản đang hoạt động"
        with self.assertRaisesRegex(SystemExit, "was not found under"):
            RENDER.validate(data, path)

    def test_answered_question_requires_authority_evidence(self):
        path, data = self.fixture()
        question = data["questions"][0]
        question["status"] = "Answered"
        question["answer"] = "Thu hồi ngay"
        with self.assertRaisesRegex(SystemExit, "answer.source_ref"):
            RENDER.validate(data, path)

    def test_static_api_operation_cannot_claim_runtime_coverage(self):
        path, data = self.fixture()
        data["api_operations"][0]["coverage_status"] = "covered"
        with self.assertRaisesRegex(SystemExit, "must be not_covered"):
            RENDER.validate(data, path)

    def test_requirement_matrix_covers_requested_dimensions(self):
        path, data = self.fixture()
        questions, _ = RENDER.validate(copy.deepcopy(data), path)
        rows = RENDER.requirement_matrix_rows(data, questions)
        first = rows[0]
        self.assertEqual(len(first), len(RENDER.MATRIX_HEADERS))
        self.assertIn("BG-001", first[1])
        self.assertIn("BR-AUTH-001", first[3])
        self.assertIn("VR-AUTH-001", first[4])
        self.assertIn("DEP-AUTH-001", first[5])


if __name__ == "__main__":
    unittest.main()
