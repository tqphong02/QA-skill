import copy
import importlib.util
import json
import pathlib
import unittest

import openpyxl


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = SKILL_ROOT / 'scripts' / 'gen-testcases.py'
STRUCTURED_INPUT = SKILL_ROOT / 'examples' / 'structured-input.json'
TEMPLATE_PATH = SKILL_ROOT / 'assets' / 'Template.xlsx'


def load_generator():
    spec = importlib.util.spec_from_file_location('testcase_rbac_generator', GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RbacMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))

    def data(self):
        return copy.deepcopy(self.source)

    def test_rbac_contract_resolves_allow_and_deny_testcase_ids(self):
        rbac, registry = self.generator.validate_rbac_contract(self.data())
        rule = rbac['rules'][0]

        self.assertEqual('[DEMO-01]', registry[rule['allow_case_refs'][0]]['test_id'])
        self.assertEqual('[DEMO-02]', registry[rule['deny_case_refs'][0]]['test_id'])
        self.assertEqual('ĐỦ', self.generator._rbac_coverage_label(rule))

    def test_required_deny_coverage_is_rejected_when_missing(self):
        data = self.data()
        data['rbac']['rules'][0]['deny_case_refs'] = []
        with self.assertRaisesRegex(ValueError, 'requires at least one deny_case_ref'):
            self.generator.validate_rbac_contract(data)

    def test_all_allow_rule_does_not_require_a_deny_case(self):
        data = self.data()
        rule = data['rbac']['rules'][0]
        rule['expectations']['unauthenticated'] = 'ALLOW'
        rule['allow_case_refs'].extend(rule['deny_case_refs'])
        rule['deny_case_refs'] = []

        rbac, _ = self.generator.validate_rbac_contract(data)
        self.assertEqual('ĐỦ', self.generator._rbac_coverage_label(rbac['rules'][0]))

    def test_case_role_must_match_expected_branch(self):
        data = self.data()
        negative_case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][1]
        negative_case['execution']['entry']['role_key'] = 'employee'
        negative_case['execution']['entry']['role'] = 'Nhân viên'
        with self.assertRaisesRegex(ValueError, 'not DENY'):
            self.generator.validate_rbac_contract(data)

    def test_unknown_rbac_reference_is_rejected(self):
        data = self.data()
        positive_case = data['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]
        positive_case['execution']['entry']['rbac_refs'].append('RBAC-UNKNOWN')
        with self.assertRaisesRegex(ValueError, 'unknown rbac_refs'):
            self.generator.validate_rbac_contract(data)

    def test_unresolved_permission_requires_qna_note(self):
        data = self.data()
        rule = data['rbac']['rules'][0]
        rule['expectations']['unauthenticated'] = 'UNRESOLVED'
        rule['deny_case_refs'] = []
        rule['notes'] = ''
        with self.assertRaisesRegex(ValueError, 'notes is required'):
            self.generator.validate_rbac_contract(data)

        rule['notes'] = 'Cần BA xác nhận quyền truy cập Dashboard khi chưa đăng nhập'
        rbac, _ = self.generator.validate_rbac_contract(data)
        self.assertEqual('CHƯA RÕ', self.generator._rbac_coverage_label(rbac['rules'][0]))

    def test_sheet_is_inserted_after_testcases_and_is_manual_friendly(self):
        data = self.data()
        rbac, registry = self.generator.validate_rbac_contract(data)
        workbook = openpyxl.load_workbook(TEMPLATE_PATH)
        self.generator.write_rbac_sheet(workbook, rbac, registry)

        self.assertEqual('RBAC Matrix', workbook.sheetnames[2])
        sheet = workbook['RBAC Matrix']
        headers = [sheet.cell(5, column).value for column in range(1, sheet.max_column + 1)]
        self.assertIn('Nhân viên', headers)
        self.assertIn('Người chưa đăng nhập', headers)
        self.assertEqual('RBAC-DASH-001', sheet['A6'].value)
        self.assertEqual('CHO PHÉP', sheet['H6'].value)
        self.assertEqual('TỪ CHỐI', sheet['I6'].value)
        self.assertEqual('[DEMO-01]', sheet['J6'].value)
        self.assertEqual('[DEMO-02]', sheet['K6'].value)
        self.assertEqual('ĐỦ', sheet['L6'].value)

    def test_no_rbac_scope_is_explicitly_na(self):
        workbook = openpyxl.load_workbook(TEMPLATE_PATH)
        self.generator.write_rbac_sheet(workbook, None, {})
        sheet = workbook['RBAC Matrix']

        self.assertEqual('N/A', sheet['A6'].value)
        self.assertEqual('Không có rule RBAC trong phạm vi testcase', sheet['C6'].value)
        self.assertEqual('N/A', sheet['J6'].value)


if __name__ == '__main__':
    unittest.main()
