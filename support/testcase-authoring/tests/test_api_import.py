import importlib.util
import pathlib
import types
import unittest


SKILL_ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, SKILL_ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ApiImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.importer = load_module('api_importer', 'scripts/import-api-spec.py')
        cls.generator = load_module('testcase_generator_for_api', 'scripts/gen-testcases.py')

    def args(self):
        return types.SimpleNamespace(
            project_name='Orders',
            project_code='ORD',
            version='v1',
            author='QA',
            reviewer='Lead QA',
            default_success_status=None,
        )

    def operation(self, responses=None):
        return {
            'method': 'POST',
            'endpoint': '/orders',
            'group': 'ORDERS',
            'summary': 'Create order',
            'description': '',
            'headers': {'Content-Type': 'application/json'},
            'query': {},
            'body': {'sku': 'SKU-01'},
            'required_body': ['sku'],
            'required_query': [],
            'path_parameters': [],
            'secured': True,
            'responses': responses or {
                201: {'description': 'Created', 'schema_fields': ['id'], 'example': {'id': 'ORD-01'}, 'media_type': 'application/json'},
                401: {'description': 'Unauthorized', 'schema_fields': ['error'], 'example': {'error': 'unauthorized'}, 'media_type': 'application/json'},
                422: {'description': 'Invalid payload', 'schema_fields': ['errors'], 'example': {'errors': []}, 'media_type': 'application/json'},
            },
            'source_ref': 'createOrder',
        }

    def test_importer_emits_current_coverage_and_automation_contract(self):
        data = self.importer.build_generator_input(
            [self.operation()], self.args(), 'openapi', 'orders.yaml'
        )

        self.assertEqual('required', data['execution_contract'])
        self.assertEqual([], data['review_required'])
        self.assertEqual(3, data['source_inventory']['documented_response_count'])
        records = list(self.generator.iter_testcases(data))
        self.assertEqual(3, len(records))
        self.assertEqual(
            ['ORD-API-001', 'ORD-API-002', 'ORD-API-003'],
            [record['testcase_id'] for record in records],
        )
        for requirement in data['requirements']:
            self.assertEqual(1, len(requirement['coverage_items']))
            coverage = requirement['coverage_items'][0]
            self.assertTrue(coverage['id'].startswith('COV-ORD-API-'))
            self.assertTrue(coverage['source_ref'].startswith('orders.yaml#createOrder/responses/'))
        for record in records:
            case = record['case']
            self.assertTrue(case['coverage_item_refs'])
            self.assertTrue(case['bb_technique'])

    def test_importer_stops_for_documented_response_without_deterministic_trigger(self):
        operation = self.operation()
        operation['responses'][409] = {
            'description': 'Duplicate order',
            'schema_fields': ['error'],
            'example': {'error': 'duplicate'},
            'media_type': 'application/json',
        }
        data = self.importer.build_generator_input(
            [operation], self.args(), 'openapi', 'orders.yaml'
        )

        self.assertEqual(1, len(data['review_required']))
        self.assertEqual(409, data['review_required'][0]['status'])
        with self.assertRaisesRegex(ValueError, 'review_required must be empty'):
            list(self.generator.iter_testcases(data))


if __name__ == '__main__':
    unittest.main()
