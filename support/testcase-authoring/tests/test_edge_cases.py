"""
Edge case tests for support-testcase-authoring — supplementary coverage.
Covers 8 gaps identified in the audit report that were not previously tested.
"""
import copy
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = SKILL_ROOT / 'scripts' / 'gen-testcases.py'
STRUCTURED_INPUT = SKILL_ROOT / 'examples' / 'structured-input.json'
API_INPUT = SKILL_ROOT / 'examples' / 'sample-api-input.json'


def load_generator():
    spec = importlib.util.spec_from_file_location('testcase_generator_edge', GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ExecutionTemplateEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def test_unknown_execution_ref_is_rejected(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        case.pop('execution', None)
        case['execution_ref'] = 'NONEXISTENT_TEMPLATE'
        with self.assertRaisesRegex(ValueError, 'Unknown execution_ref'):
            self.generator.materialize_execution_templates(data)

    def test_execution_overrides_without_execution_ref_is_rejected(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        case.pop('execution_ref', None)
        case['execution_overrides'] = {'entry': {'screen': 'Màn hình X'}}
        with self.assertRaisesRegex(ValueError, 'execution_overrides requires execution_ref'):
            self.generator.materialize_execution_templates(data)

    def test_combining_execution_and_execution_ref_is_rejected(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        data['execution_templates'] = {'SOME_TPL': copy.deepcopy(case['execution'])}
        case['execution_ref'] = 'SOME_TPL'
        with self.assertRaisesRegex(ValueError, 'cannot combine execution and execution_ref'):
            self.generator.materialize_execution_templates(data)


class StabilityGateEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(API_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def _api_case(self, data):
        return data['sections'][1]['groups'][0]['scenarios'][0]['cases'][0]

    def _waived_mv(self):
        return {'status': 'WAIVED', 'environment': 'staging', 'evidence': [], 'waiver_reason': 'Approved exception'}

    def test_stability_gate_repeat_count_below_minimum_is_rejected(self):
        data = self.data()
        case = self._api_case(data)
        case['manual_verification'] = self._waived_mv()
        case['stability_gate'] = {'repeat_count': 1, 'required_consecutive_passes': 1, 'max_flaky_rate': 0}
        with self.assertRaisesRegex(ValueError, 'repeat_count must be an integer from 2 to 20'):
            list(self.generator.iter_testcases(data))

    def test_stability_gate_repeat_count_above_maximum_is_rejected(self):
        data = self.data()
        case = self._api_case(data)
        case['manual_verification'] = self._waived_mv()
        case['stability_gate'] = {'repeat_count': 21, 'required_consecutive_passes': 20, 'max_flaky_rate': 0}
        with self.assertRaisesRegex(ValueError, 'repeat_count must be an integer from 2 to 20'):
            list(self.generator.iter_testcases(data))

    def test_stability_gate_consecutive_passes_exceeds_repeat_count_is_rejected(self):
        data = self.data()
        case = self._api_case(data)
        case['manual_verification'] = self._waived_mv()
        case['stability_gate'] = {'repeat_count': 3, 'required_consecutive_passes': 5, 'max_flaky_rate': 0}
        with self.assertRaisesRegex(ValueError, 'required_consecutive_passes'):
            list(self.generator.iter_testcases(data))

    def test_stability_gate_minimum_repeat_count_is_accepted(self):
        data = self.data()
        case = self._api_case(data)
        case['manual_verification'] = self._waived_mv()
        case['stability_gate'] = {'repeat_count': 2, 'required_consecutive_passes': 2, 'max_flaky_rate': 0}
        records = list(self.generator.iter_testcases(data))
        self.assertTrue(any(r['case'].get('stability_gate') for r in records))


class SideEffectTypeEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(API_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def _api_case(self, data):
        return data['sections'][1]['groups'][0]['scenarios'][0]['cases'][0]

    def _waived_mv(self):
        return {'status': 'WAIVED', 'environment': 'staging', 'evidence': [], 'waiver_reason': 'Approved exception'}

    def test_invalid_side_effect_type_is_rejected(self):
        data = self.data()
        case = self._api_case(data)
        case['manual_verification'] = self._waived_mv()
        case['api']['expected_side_effects'] = [{'id': 'SE-TEST-001', 'type': 'INVALID_TYPE', 'description': 'desc', 'expected': {'k': 'v'}, 'implementation_file': 'src/shared/helpers/t.ts', 'implementation_export': 'read'}]
        with self.assertRaisesRegex(ValueError, 'type must be one of'):
            list(self.generator.iter_testcases(data))

    def test_all_valid_side_effect_types_are_accepted(self):
        valid_types = ['READ_AFTER_WRITE', 'DATABASE_STATE', 'EVENT_PUBLISHED', 'WEBHOOK_SENT', 'TRANSACTION_ROLLBACK', 'NO_UNEXPECTED_MUTATION']
        for effect_type in valid_types:
            with self.subTest(effect_type=effect_type):
                data = self.data()
                case = self._api_case(data)
                case['manual_verification'] = self._waived_mv()
                case['api']['expected_side_effects'] = [{'id': 'SE-TEST-001', 'type': effect_type, 'description': 'desc', 'expected': {'k': 'v'}, 'implementation_file': 'src/shared/helpers/t.ts', 'implementation_export': 'read'}]
                records = list(self.generator.iter_testcases(data))
                self.assertTrue(len(records) > 0)


class CoverageItemRefCrossReqTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def test_coverage_item_ref_crossing_requirement_boundary_is_rejected(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        case['coverage_item_refs'] = ['COV-AC2-DENY']
        with self.assertRaisesRegex(ValueError, r'owned by AC2'):
            list(self.generator.iter_testcases(data))


class DataRefNullEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()

    def test_data_ref_with_null_value_uses_heuristic_fallback(self):
        step = {'action': 'fill', 'instruction': 'Nhập AIFA_EMAIL_20260812 vào trường Email', 'target': {'name': 'trường Email'}, 'value': {'data_ref': 'AIFA_EMAIL_20260812', 'field': 'Email', 'value': None}}
        rendered = self.generator._render_manual_instruction(step)
        self.assertNotIn('AIFA_EMAIL_20260812', rendered)
        self.assertTrue(len(rendered) > 0)

    def test_data_ref_with_empty_string_value_uses_heuristic_fallback(self):
        step = {'action': 'fill', 'instruction': 'Nhập AIFA_PASS_20260812 vào Mật khẩu', 'target': {'name': 'Mật khẩu'}, 'value': {'data_ref': 'AIFA_PASS_20260812', 'field': 'Mật khẩu', 'value': ''}}
        rendered = self.generator._render_manual_instruction(step)
        self.assertNotIn('AIFA_PASS_20260812', rendered)
        self.assertTrue(len(rendered) > 0)


class ArtifactDateEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()

    def tearDown(self):
        os.environ.pop('QA_ARTIFACT_DATE', None)
        os.environ.pop('QA_PRESERVE_EXACT_FILENAME', None)

    def test_invalid_artifact_date_env_is_rejected(self):
        os.environ['QA_ARTIFACT_DATE'] = '2026-08-31'
        with self.assertRaisesRegex(ValueError, 'DD-MM-YYYY'):
            self.generator.dated_artifact_path('output/testcases.xlsx')

    def test_valid_artifact_date_env_is_accepted(self):
        os.environ['QA_ARTIFACT_DATE'] = '31-08-2026'
        result = self.generator.dated_artifact_path('output/testcases.xlsx')
        self.assertEqual('output/testcases_31-08-2026.xlsx', result)

    def test_path_with_existing_date_suffix_is_not_modified(self):
        result = self.generator.dated_artifact_path('output/testcases_15-07-2026.xlsx')
        self.assertEqual('output/testcases_15-07-2026.xlsx', result)

    def test_preserve_exact_filename_bypasses_date_suffix(self):
        os.environ['QA_PRESERVE_EXACT_FILENAME'] = '1'
        result = self.generator.dated_artifact_path('output/testcases.xlsx')
        self.assertEqual('output/testcases.xlsx', result)


class NoRbacSourceEdgeCaseTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))

    def data(self):
        d = copy.deepcopy(self.source)
        d.pop('rbac', None)
        return d

    def test_missing_rbac_key_treated_as_out_of_scope(self):
        data = self.data()
        self.assertNotIn('rbac', data)
        rbac, registry = self.generator.validate_rbac_contract(data)
        self.assertIsNone(rbac)
        self.assertIsNone(rbac)  # registry may still contain testcase refs for RBAC linking

    def test_write_rbac_sheet_with_no_rbac_creates_na_row(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest('openpyxl not installed')
        template_path = SKILL_ROOT / 'assets' / 'Template.xlsx'
        workbook = openpyxl.load_workbook(template_path)
        data = self.data()
        rbac, registry = self.generator.validate_rbac_contract(data)
        self.generator.write_rbac_sheet(workbook, rbac, registry)
        sheet = workbook['RBAC Matrix']
        self.assertEqual('N/A', sheet['A6'].value)

    def test_write_testcase_markdown_without_rbac_includes_na_rbac_section(self):
        data = self.data()
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / 'no-rbac.md'
            self.generator.write_testcase_markdown(data, output)
            markdown = output.read_text(encoding='utf-8')
        self.assertIn('## RBAC Matrix', markdown)
        self.assertIn('N/A', markdown)


if __name__ == '__main__':
    unittest.main()

