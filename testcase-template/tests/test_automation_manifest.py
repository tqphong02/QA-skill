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


if __name__ == '__main__':
    unittest.main()
