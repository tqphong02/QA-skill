import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "convergence.py"
SPEC = importlib.util.spec_from_file_location("requirements_convergence", SCRIPT)
CONVERGENCE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(CONVERGENCE)


class ConvergenceTests(unittest.TestCase):
    def fixture(self, root: Path):
        source = root / "requirements.md"
        source.write_text("# Login\n\nRegistered users can log in\n", encoding="utf-8")
        analysis = root / "analysis.json"
        payload = {
            "source_markdown": ["requirements.md"],
            "modules": [{"flows": [{"id": "FLOW-001", "semantic_key": "auth.login"}]}],
            "business_goals": [],
            "requirements": [{"id": "REQ-001", "semantic_key": "requirement.auth.login"}],
            "business_rules": [],
            "validation_rules": [],
            "dependencies": [],
            "risks": [],
            "api_operations": [],
            "questions": [{"id": "QA-001", "decision_key": "auth.login.error-policy", "status": "Open"}],
        }
        analysis.write_text(json.dumps(payload), encoding="utf-8")
        return analysis, payload

    def test_unchanged_snapshot_accepts_same_semantic_set(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            analysis, _ = self.fixture(root)
            current = CONVERGENCE.build_state(json.loads(analysis.read_text()), analysis)
            state_path = root / "state.json"
            state_path.write_text(json.dumps(current), encoding="utf-8")
            self.assertEqual(CONVERGENCE.check_previous(current, state_path), "UNCHANGED_RECONCILED")

    def test_unchanged_snapshot_rejects_new_question_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            analysis, payload = self.fixture(root)
            previous = CONVERGENCE.build_state(payload, analysis)
            state_path = root / "state.json"
            state_path.write_text(json.dumps(previous), encoding="utf-8")
            payload["questions"].append({"id": "QA-002", "decision_key": "auth.login.retry-policy", "status": "Open"})
            current = CONVERGENCE.build_state(payload, analysis)
            with self.assertRaisesRegex(SystemExit, "UNCHANGED_SOURCE_GROWTH"):
                CONVERGENCE.check_previous(current, state_path)

    def test_changed_snapshot_allows_new_semantic_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            analysis, payload = self.fixture(root)
            previous = CONVERGENCE.build_state(payload, analysis)
            state_path = root / "state.json"
            state_path.write_text(json.dumps(previous), encoding="utf-8")
            (root / "requirements.md").write_text("# Login\n\nRegistered users can log in\n\nUsers can reset passwords\n", encoding="utf-8")
            payload["modules"][0]["flows"].append({"id": "FLOW-002", "semantic_key": "auth.reset-password"})
            current = CONVERGENCE.build_state(payload, analysis)
            self.assertEqual(CONVERGENCE.check_previous(current, state_path), "SOURCE_CHANGED")

    def test_unchanged_snapshot_rejects_new_requirement_key(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            analysis, payload = self.fixture(root)
            previous = CONVERGENCE.build_state(payload, analysis)
            state_path = root / "state.json"
            state_path.write_text(json.dumps(previous), encoding="utf-8")
            payload["requirements"].append({"id": "REQ-002", "semantic_key": "requirement.auth.reset"})
            current = CONVERGENCE.build_state(payload, analysis)
            with self.assertRaisesRegex(SystemExit, "UNCHANGED_SOURCE_GROWTH"):
                CONVERGENCE.check_previous(current, state_path)

    def test_no_active_question_finishes_done(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            analysis, payload = self.fixture(root)
            payload["questions"][0]["status"] = "Answered"
            current = CONVERGENCE.build_state(payload, analysis)
            self.assertEqual(current["completion_status"], "DONE")


if __name__ == "__main__":
    unittest.main()
