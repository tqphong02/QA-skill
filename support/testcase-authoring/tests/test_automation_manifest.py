import copy
import hashlib
import importlib.util
import json
import pathlib
import tempfile
import unittest


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = SKILL_ROOT / 'scripts' / 'gen-testcases.py'
STRUCTURED_INPUT = SKILL_ROOT / 'examples' / 'structured-input.json'


def load_generator():
    spec = importlib.util.spec_from_file_location('testcase_manifest_generator', GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AutomationManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def test_manifest_preserves_lossless_pom_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_path = pathlib.Path(temp_dir) / 'login.md'
            manifest_path = pathlib.Path(temp_dir) / 'login.automation.json'
            self.generator.write_testcase_markdown(self.data(), markdown_path)
            manifest = self.generator.write_automation_manifest(
                self.data(), markdown_path, manifest_path
            )

            persisted = json.loads(manifest_path.read_text(encoding='utf-8'))
            markdown_hash = hashlib.sha256(markdown_path.read_bytes()).hexdigest()

        self.assertEqual(manifest, persisted)
        self.assertEqual(['DEMO-01', 'DEMO-02'], [case['testcase_id'] for case in manifest['testcases']])
        first = manifest['testcases'][0]
        self.assertEqual('Use Case Testing', first['bb_technique'])
        self.assertEqual('employee', first['execution']['entry']['role_key'])
        self.assertEqual(['RBAC-DASH-001'], first['execution']['entry']['rbac_refs'])
        self.assertEqual('dashboard_heading', first['execution']['outcome']['assertions'][1]['target'])
        self.assertEqual(
            markdown_hash,
            manifest['source']['markdown_sha256'],
        )

    def test_required_contract_rejects_missing_stable_testcase_id(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        case.pop('testcase_id')
        with self.assertRaisesRegex(ValueError, 'require stable case.testcase_id'):
            list(self.generator.iter_testcases(data))

    def test_explicit_ids_do_not_shift_when_a_case_is_inserted(self):
        data = self.data()
        scenario = data['sections'][0]['groups'][0]['scenarios'][0]
        inserted = copy.deepcopy(scenario['cases'][0])
        inserted['testcase_id'] = 'DEMO-00'
        inserted['case_ref'] = 'LOGIN_EMPLOYEE_INSERTED'
        scenario['cases'].insert(0, inserted)

        ids = {
            record['case'].get('case_ref'): record['testcase_id']
            for record in self.generator.iter_testcases(data)
        }
        self.assertEqual('DEMO-01', ids['LOGIN_EMPLOYEE_SUCCESS'])
        self.assertEqual('DEMO-02', ids['DASHBOARD_UNAUTHENTICATED_DENY'])

    def test_ui_testcase_id_is_supported(self):
        data = self.data()
        data['sections'][0]['kind'] = 'ui'
        first_case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        first_case['testcase_id'] = 'DEMO-UI-01'
        records = list(self.generator.iter_testcases(data))
        self.assertEqual('DEMO-UI-01', records[0]['testcase_id'])

    def test_cases_are_sorted_by_black_box_type_order(self):
        data = self.data()
        section = data['sections'][0]
        group = section['groups'][0]
        scenario = group['scenarios'][0]
        base_case = copy.deepcopy(scenario['cases'][0])
        technique_by_type = {
            'happy': ['Use Case Testing'],
            'alternative': ['Use Case Testing'],
            'validation': ['EP'],
            'edge': ['BVA'],
            'negative': ['EP'],
            'error': ['Error Guessing'],
            'ui': ['Use Case Testing'],
            'additional': ['Error Guessing'],
        }
        input_order = [
            'additional',
            'ui',
            'error',
            'negative',
            'edge',
            'validation',
            'alternative',
            'happy',
        ]
        scenario['cases'] = []
        for index, case_type in enumerate(input_order, start=1):
            case = copy.deepcopy(base_case)
            case['testcase_id'] = f'DEMO-ORDER-{index:02d}'
            case['case_ref'] = f'ORDER_{case_type.upper()}'
            case['type'] = case_type
            case['bb_technique'] = technique_by_type[case_type]
            if case_type == 'additional':
                case['req'] = '(out-of-spec)'
            scenario['cases'].append(case)
        group['scenarios'] = [scenario]
        section['groups'] = [group]

        records = list(self.generator.iter_testcases(data))

        self.assertEqual(
            ['happy', 'alternative', 'validation', 'edge', 'negative', 'error', 'ui', 'additional'],
            [record['case']['type'] for record in records],
        )

    def test_function_group_sorts_happy_scenario_before_validation_scenario(self):
        data = self.data()
        group = data['sections'][0]['groups'][0]
        group['scenarios'] = list(reversed(group['scenarios']))

        records = list(self.generator.iter_testcases(data))

        self.assertEqual('happy', records[0]['case']['type'])
        self.assertEqual('SCN-LOG-001', records[0]['scenario']['scenario_id'])

    def test_function_group_rejects_missing_happy_path(self):
        data = self.data()
        group = data['sections'][0]['groups'][0]
        validation_scenario = copy.deepcopy(group['scenarios'][0])
        validation_scenario['cases'][0]['type'] = 'validation'
        validation_scenario['cases'][0]['bb_technique'] = ['EP']
        group['scenarios'] = [validation_scenario]

        with self.assertRaisesRegex(ValueError, 'requires at least one happy case'):
            list(self.generator.iter_testcases(data))

    def test_required_contract_enforces_requirement_type_scenario_and_bb_technique(self):
        mutations = [
            ('case.req', lambda data: data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0].pop('req'), 'require case.req'),
            ('case.type', lambda data: data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0].__setitem__('type', 'other'), 'case.type must be one of'),
            ('scenario_id', lambda data: data['sections'][0]['groups'][0]['scenarios'][0].__setitem__('scenario_id', ''), 'require scenario_id'),
            ('bb_technique', lambda data: data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0].pop('bb_technique'), 'require bb_technique'),
        ]
        for label, mutate, message in mutations:
            with self.subTest(label=label):
                data = self.data()
                mutate(data)
                with self.assertRaisesRegex(ValueError, message):
                    list(self.generator.iter_testcases(data))

    def test_required_contract_rejects_mixed_scenario_requirements(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        case['req'] = 'AC2'
        with self.assertRaisesRegex(ValueError, 'mixes requirements'):
            list(self.generator.iter_testcases(data))

    def test_execution_template_reuse_materializes_deterministically(self):
        data = self.data()
        case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        data['execution_templates'] = {'LOGIN_BASE': copy.deepcopy(case['execution'])}
        case.pop('execution')
        case['execution_ref'] = 'LOGIN_BASE'
        case['execution_overrides'] = {
            'entry': {'screen': 'Đăng nhập dành cho kiểm thử'},
            'outcome': {'state': 'Đã xác minh'},
        }

        compact_size = len(json.dumps(data, ensure_ascii=False))
        materialized = self.generator.materialize_execution_templates(data)
        resolved = materialized['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]['execution']

        self.assertEqual('Đăng nhập dành cho kiểm thử', resolved['entry']['screen'])
        self.assertEqual('Đã xác minh', resolved['outcome']['state'])
        self.assertGreater(len(resolved['steps']), 1)
        self.assertLess(compact_size, len(json.dumps(materialized, ensure_ascii=False)))
        with tempfile.TemporaryDirectory() as temp_dir:
            markdown_path = pathlib.Path(temp_dir) / 'compact.md'
            manifest_path = pathlib.Path(temp_dir) / 'compact.automation.json'
            self.generator.write_testcase_markdown(materialized, markdown_path)
            manifest = self.generator.write_automation_manifest(
                materialized, markdown_path, manifest_path
            )
        self.assertEqual('Đăng nhập dành cho kiểm thử', manifest['testcases'][0]['execution']['entry']['screen'])


if __name__ == '__main__':
    unittest.main()
