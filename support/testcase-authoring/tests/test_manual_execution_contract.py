import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR_PATH = SKILL_ROOT / 'scripts' / 'gen-testcases.py'
STRUCTURED_INPUT = SKILL_ROOT / 'examples' / 'structured-input.json'


def load_generator():
    spec = importlib.util.spec_from_file_location('testcase_generator', GENERATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ManualExecutionContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.source = json.loads(STRUCTURED_INPUT.read_text(encoding='utf-8'))
        cls.valid_case = cls.source['sections'][0]['groups'][0]['scenarios'][0]['cases'][0]

    def case(self):
        return copy.deepcopy(self.valid_case)

    def test_manual_projection_is_numbered_and_hides_machine_keys(self):
        precondition, procedure, expected, execution = self.generator.render_case(
            self.case(), execution_required=True
        )

        self.assertIn('1. Môi trường: UAT tại <BASE_URL>', precondition)
        self.assertIn('5. Quy tắc phân quyền áp dụng: RBAC-DASH-001', precondition)
        self.assertIn('10. Dữ liệu chuẩn bị: Mật khẩu: Bộ dữ liệu Login_Valid_01', precondition)
        self.assertIn('3. Nhấp vào ô Email', procedure)
        self.assertIn('5. Tại ô Email, nhập giá trị qa.login@example.com', procedure)
        self.assertIn('Người dùng đăng nhập thành công', expected)
        for machine_text in ('[S01]', 'email_input', '[OUTCOME]', '{"', ' | ', 'visible'):
            self.assertNotIn(machine_text, f'{precondition}\n{procedure}\n{expected}')
        self.assertIsNotNone(execution)

    def test_manual_projection_resolves_data_refs_without_exposing_input_keys(self):
        case = self.case()
        case['execution']['entry']['data'] = [
            {
                'name': 'Email',
                'value': 'AIFA_LOGIN_VALID_EMAIL_20260812',
                'condition': 'Tài khoản đang hoạt động',
            },
            {
                'name': 'Mật khẩu',
                'value': 'AIFA_LOGIN_VALID_20260812',
                'condition': 'Lấy từ kho dữ liệu kiểm thử bảo mật',
            },
        ]
        email_step = case['execution']['steps'][2]
        email_step['instruction'] = 'Nhập AIFA_LOGIN_VALID_EMAIL_20260812 vào Email'
        email_step['value'] = {
            'data_ref': 'AIFA_LOGIN_VALID_EMAIL_20260812',
            'field': 'Email',
        }
        password_step = case['execution']['steps'][4]
        password_step['instruction'] = (
            'Nhập giá trị từ bộ dữ liệu AIFA_LOGIN_VALID_20260812 vào Mật khẩu'
        )
        password_step['value'] = {
            'data_ref': 'AIFA_LOGIN_VALID_20260812',
            'field': 'Mật khẩu',
        }

        precondition, procedure, _expected, _execution = self.generator.render_case(
            case, execution_required=True
        )
        manual_text = f'{precondition}\n{procedure}'

        self.assertNotIn('AIFA_LOGIN_VALID_EMAIL_20260812', manual_text)
        self.assertNotIn('AIFA_LOGIN_VALID_20260812', manual_text)
        self.assertNotIn('Bộ dữ liệu qa.owner@example.test', manual_text)
        self.assertNotIn('giá trị từ bộ dữ liệu AifaSample@2026!', manual_text)
        self.assertIn('qa.owner@example.test', manual_text)
        self.assertIn('AifaSample@2026!', manual_text)

        question_step = {
            'action': 'fill',
            'instruction': 'Nhập AIFA_GOLDEN_PROMPT_AI_1 vào trường câu hỏi',
            'target': {'name': 'trường câu hỏi'},
            'value': {
                'data_ref': 'AIFA_GOLDEN_PROMPT_AI_1',
                'value': 'Tổng phát sinh tài khoản 111 trong năm 2024 là bao nhiêu?',
            },
        }
        rendered_question = self.generator._render_manual_instruction(question_step)
        self.assertNotIn('AIFA_GOLDEN_PROMPT_AI_1', rendered_question)
        self.assertIn('Tổng phát sinh tài khoản 111 trong năm 2024 là bao nhiêu?', rendered_question)

    def test_manual_projection_keeps_real_fixture_filename(self):
        upload_step = {
            'action': 'upload',
            'instruction': 'Tải lên AIFA_UPLOAD_VALID_20260812.xlsx tại vùng tải file',
            'target': {'name': 'vùng tải file'},
            'value': 'AIFA_UPLOAD_VALID_20260812.xlsx',
        }

        rendered = self.generator._render_manual_instruction(upload_step)

        self.assertIn('AIFA_UPLOAD_VALID_20260812.xlsx', rendered)

    def test_manual_projection_avoids_repeating_context_around_data_ref(self):
        step = {
            'action': 'click',
            'instruction': 'Nhấp vào hội thoại AIFA_CHAT_20260812',
            'target': {'name': 'hội thoại AIFA_CHAT_20260812'},
        }

        rendered = self.generator._render_manual_instruction(step)

        self.assertNotIn('hội thoại hội thoại', rendered)
        self.assertIn('Nhấp vào hội thoại AIFA Sample Conversation 20260812', rendered)

    def test_markdown_keeps_pom_contract_separate_from_manual_projection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = pathlib.Path(temp_dir) / 'testcases.md'
            self.generator.write_testcase_markdown(self.source, output)
            markdown = output.read_text(encoding='utf-8')

        self.assertIn('| Step | Action | Target key | Manual instruction |', markdown)
        self.assertIn('| S01 | navigate | login_page |', markdown)
        self.assertIn('{"data_ref": "Login_Valid_01","field": "Mật khẩu"}', markdown)
        self.assertIn('## RBAC Matrix', markdown)
        self.assertIn('| RBAC-DASH-001 | LOGIN | Dashboard |', markdown)
        self.assertIn('| DEMO-01 | DEMO-02 | ĐỦ |', markdown)

    def test_combined_actions_are_rejected(self):
        case = self.case()
        case['execution']['steps'][1]['instruction'] = (
            'Nhấp vào ô Email rồi nhập qa.login@example.com'
        )
        with self.assertRaisesRegex(ValueError, 'combines multiple actions'):
            self.generator.render_case(case, execution_required=True)

    def test_fill_without_value_is_rejected(self):
        case = self.case()
        case['execution']['steps'][2].pop('value')
        with self.assertRaisesRegex(ValueError, 'value is required for action=fill'):
            self.generator.render_case(case, execution_required=True)

    def test_fill_without_focus_step_is_rejected(self):
        case = self.case()
        case['execution']['steps'].pop(1)
        with self.assertRaisesRegex(ValueError, 'requires a separate click/focus step'):
            self.generator.render_case(case, execution_required=True)

    def test_missing_detailed_precondition_is_rejected(self):
        case = self.case()
        case['execution']['entry'].pop('permissions')
        with self.assertRaisesRegex(ValueError, 'missing permissions'):
            self.generator.render_case(case, execution_required=True)

    def test_vague_expected_result_is_rejected(self):
        case = self.case()
        case['execution']['outcome']['assertions'][0]['text'] = 'Hệ thống xử lý đúng'
        with self.assertRaisesRegex(ValueError, 'observable result'):
            self.generator.render_case(case, execution_required=True)

    def test_selector_evidence_records_hidden_visibility_without_forcing_visible_true(self):
        target = {
            'selector_evidence': {
                'status': 'runtime_verified',
                'strategy': 'role',
                'locator': "page.getByRole('button', { name: 'Sửa' })",
                'verification': {'count': 1, 'visible': False},
            }
        }
        self.generator._validate_selector_evidence(target, 'execution.outcome.target')

        target['selector_evidence']['verification'].pop('visible')
        with self.assertRaisesRegex(ValueError, r'visible=true\|false'):
            self.generator._validate_selector_evidence(target, 'execution.outcome.target')

    def test_new_contract_rejects_legacy_but_compatibility_remains_available(self):
        legacy = {
            'pre_condition': 'Có tài khoản',
            'procedure': 'Thực hiện đăng nhập',
            'expected': 'Hệ thống xử lý đúng',
        }
        with self.assertRaisesRegex(ValueError, 'requires case.execution'):
            self.generator.render_case(legacy, execution_required=True)

        rendered = self.generator.render_case(legacy, execution_required=False)
        self.assertEqual('Thực hiện đăng nhập', rendered[1])
        self.assertIsNone(rendered[3])


if __name__ == '__main__':
    unittest.main()
