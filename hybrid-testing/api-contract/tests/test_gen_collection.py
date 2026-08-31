"""Unit tests for gen_postman_collection.py."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import gen_postman_collection as gen  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _openapi_doc(**overrides: object) -> dict:
    """Return a minimal well-formed OpenAPI 3.x document."""
    doc: dict = {
        "openapi": "3.0.3",
        "info": {"title": "Orders API", "version": "1.0.0"},
        "servers": [{"url": "https://api.example.test/v1"}],
        "security": [{"bearerAuth": []}],
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                }
            },
            "schemas": {
                "CreateOrder": {
                    "type": "object",
                    "required": ["customerId"],
                    "properties": {
                        "customerId": {"type": "string", "maxLength": 40},
                        "amount": {"type": "number"},
                    },
                },
                "Order": {
                    "type": "object",
                    "required": ["id", "created_at"],
                    "properties": {
                        "id": {"type": "string", "format": "uuid"},
                        "created_at": {"type": "string", "format": "date-time"},
                    },
                },
            },
        },
        "paths": {
            "/orders": {
                "get": {
                    "operationId": "listOrders",
                    "summary": "List orders",
                    "tags": ["Orders"],
                    "parameters": [
                        {
                            "name": "page",
                            "in": "query",
                            "schema": {"type": "integer"},
                            "description": "Page number",
                        }
                    ],
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "operationId": "createOrder",
                    "summary": "Create order",
                    "tags": ["Orders"],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/CreateOrder"}
                            }
                        },
                    },
                    "responses": {
                        "201": {
                            "description": "Created",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/Order"}
                                }
                            },
                        },
                        "400": {"description": "Bad request"},
                    },
                },
            },
            "/orders/{id}": {
                "get": {
                    "operationId": "getOrder",
                    "summary": "Get order",
                    "tags": ["Orders"],
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string", "format": "uuid"},
                        }
                    ],
                    "responses": {"200": {"description": "OK"}, "404": {"description": "Not found"}},
                },
                "delete": {
                    "operationId": "deleteOrder",
                    "summary": "Delete order",
                    "tags": ["Orders"],
                    "parameters": [
                        {
                            "name": "id",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {"204": {"description": "No content"}},
                },
            },
        },
    }
    doc.update(overrides)
    return doc


def _build(doc: dict | None = None, **kwargs: object) -> dict:
    if doc is None:
        doc = _openapi_doc()
    return gen.build_collection(
        doc,
        project=kwargs.get("project", "TestAPI"),  # type: ignore[arg-type]
        base_url=kwargs.get("base_url", "https://api.example.test/v1"),  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Schema validation helpers
# ---------------------------------------------------------------------------

def _all_requests(collection: dict) -> list[dict]:
    """Flatten all request items (including inside folders)."""
    results = []
    for item in collection.get("item") or []:
        if "item" in item:
            results.extend(item["item"])
        else:
            results.append(item)
    return results


# ---------------------------------------------------------------------------
# Tests — collection structure
# ---------------------------------------------------------------------------


class CollectionStructureTests(unittest.TestCase):
    def test_collection_has_required_postman_fields(self):
        col = _build()
        self.assertIn("info", col)
        self.assertIn("item", col)
        self.assertIn("variable", col)
        self.assertEqual(col["info"]["schema"], gen.POSTMAN_SCHEMA)

    def test_collection_name_includes_project_and_api_title(self):
        col = _build(project="MyProject")
        self.assertIn("MyProject", col["info"]["name"])

    def test_base_url_variable_is_set(self):
        col = _build(base_url="https://staging.example.test")
        var = next((v for v in col["variable"] if v["key"] == "baseUrl"), None)
        self.assertIsNotNone(var)
        self.assertEqual(var["value"], "https://staging.example.test")

    def test_operations_are_grouped_into_folders_by_tag(self):
        col = _build()
        folder_names = [item["name"] for item in col["item"] if "item" in item]
        self.assertIn("Orders", folder_names)

    def test_all_four_operations_are_generated(self):
        items = _all_requests(_build())
        self.assertEqual(len(items), 4)

    def test_collection_is_valid_json_serializable(self):
        col = _build()
        payload = json.dumps(col, ensure_ascii=False)
        loaded = json.loads(payload)
        self.assertEqual(loaded["info"]["schema"], gen.POSTMAN_SCHEMA)

    def test_collection_generation_is_deterministic(self):
        first = json.dumps(_build(), ensure_ascii=False, sort_keys=True)
        second = json.dumps(_build(), ensure_ascii=False, sort_keys=True)
        self.assertEqual(first, second)


# ---------------------------------------------------------------------------
# Tests — GET request
# ---------------------------------------------------------------------------


class GetRequestTests(unittest.TestCase):
    def setUp(self):
        self.items = _all_requests(_build())
        self.get_list = next(i for i in self.items if i.get("request", {}).get("method") == "GET"
                             and "orders/{id}" not in i["request"]["url"]["raw"])

    def test_method_is_get(self):
        self.assertEqual(self.get_list["request"]["method"], "GET")

    def test_url_raw_uses_baseurl_variable(self):
        self.assertIn("{{baseUrl}}", self.get_list["request"]["url"]["raw"])

    def test_query_param_is_in_url_query(self):
        url = self.get_list["request"]["url"]
        self.assertIn("query", url)
        param_keys = [q["key"] for q in url["query"]]
        self.assertIn("page", param_keys)

    def test_no_body_on_get(self):
        self.assertNotIn("body", self.get_list["request"])

    def test_test_script_is_present(self):
        self.assertTrue(any(e["listen"] == "test" for e in self.get_list["event"]))

    def test_test_script_checks_status_200(self):
        script = next(e for e in self.get_list["event"] if e["listen"] == "test")
        exec_text = "".join(script["script"]["exec"])
        self.assertIn("200", exec_text)


# ---------------------------------------------------------------------------
# Tests — POST request with body
# ---------------------------------------------------------------------------


class PostRequestTests(unittest.TestCase):
    def setUp(self):
        self.items = _all_requests(_build())
        self.post_item = next(i for i in self.items if i["request"]["method"] == "POST")

    def test_method_is_post(self):
        self.assertEqual(self.post_item["request"]["method"], "POST")

    def test_body_mode_is_raw(self):
        body = self.post_item["request"]["body"]
        self.assertEqual(body["mode"], "raw")

    def test_body_raw_is_valid_json(self):
        raw = self.post_item["request"]["body"]["raw"]
        parsed = json.loads(raw)
        self.assertIsInstance(parsed, dict)

    def test_body_contains_required_fields(self):
        raw = json.loads(self.post_item["request"]["body"]["raw"])
        self.assertIn("customerId", raw)

    def test_content_type_header_is_application_json(self):
        headers = {h["key"]: h["value"] for h in self.post_item["request"]["header"]}
        self.assertEqual(headers.get("Content-Type"), "application/json")

    def test_test_script_checks_201(self):
        script = next(e for e in self.post_item["event"] if e["listen"] == "test")
        exec_text = "".join(script["script"]["exec"])
        self.assertIn("201", exec_text)

    def test_json_body_assertion_in_201_response(self):
        script = next(e for e in self.post_item["event"] if e["listen"] == "test")
        exec_text = "".join(script["script"]["exec"])
        self.assertIn("application/json", exec_text)


# ---------------------------------------------------------------------------
# Tests — DELETE request
# ---------------------------------------------------------------------------


class DeleteRequestTests(unittest.TestCase):
    def setUp(self):
        self.items = _all_requests(_build())
        self.delete_item = next(i for i in self.items if i["request"]["method"] == "DELETE")

    def test_method_is_delete(self):
        self.assertEqual(self.delete_item["request"]["method"], "DELETE")

    def test_test_script_checks_204(self):
        script = next(e for e in self.delete_item["event"] if e["listen"] == "test")
        exec_text = "".join(script["script"]["exec"])
        self.assertIn("204", exec_text)


# ---------------------------------------------------------------------------
# Tests — Auth injection
# ---------------------------------------------------------------------------


class AuthInjectionTests(unittest.TestCase):
    def test_bearer_auth_produces_collection_auth_block(self):
        col = _build()
        auth = col.get("auth") or {}
        self.assertEqual(auth.get("type"), "bearer")

    def test_api_key_header_auth(self):
        doc = _openapi_doc()
        doc["components"]["securitySchemes"] = {
            "apiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}
        }
        doc["security"] = [{"apiKeyAuth": []}]
        col = gen.build_collection(doc, project="T", base_url="https://api.example.test")
        auth = col.get("auth") or {}
        self.assertEqual(auth.get("type"), "apikey")

    def test_basic_auth_scheme(self):
        doc = _openapi_doc()
        doc["components"]["securitySchemes"] = {
            "basicAuth": {"type": "http", "scheme": "basic"}
        }
        doc["security"] = [{"basicAuth": []}]
        col = gen.build_collection(doc, project="T", base_url="https://api.example.test")
        auth = col.get("auth") or {}
        self.assertEqual(auth.get("type"), "basic")

    def test_no_security_scheme_produces_no_auth(self):
        doc = _openapi_doc()
        doc.pop("security", None)
        doc["components"]["securitySchemes"] = {}
        col = gen.build_collection(doc, project="T", base_url="https://api.example.test")
        self.assertNotIn("auth", col)

    def test_auth_scheme_override_applies_to_collection_and_requests(self):
        doc = _openapi_doc()
        doc["components"]["securitySchemes"]["apiKeyAuth"] = {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
        }
        col = gen.build_collection(
            doc,
            project="T",
            base_url="https://api.example.test",
            auth_scheme="apiKeyAuth",
        )
        self.assertEqual(col["auth"]["type"], "apikey")
        self.assertTrue(
            all(item["request"]["auth"]["type"] == "apikey" for item in _all_requests(col))
        )

    def test_unknown_auth_scheme_is_blocked(self):
        with self.assertRaisesRegex(ValueError, "Unknown auth scheme"):
            gen.build_collection(
                _openapi_doc(),
                project="T",
                base_url="https://api.example.test",
                auth_scheme="missingAuth",
            )


# ---------------------------------------------------------------------------
# Tests — Body synthesis
# ---------------------------------------------------------------------------


class BodySynthesisTests(unittest.TestCase):
    def test_unresolved_local_ref_is_blocked(self):
        with self.assertRaisesRegex(ValueError, "Unresolved local"):
            gen.resolve_node(_openapi_doc(), {"$ref": "#/components/schemas/Missing"})

    def test_external_ref_requires_bundled_document(self):
        with self.assertRaisesRegex(ValueError, "bundled OpenAPI"):
            gen.resolve_node(_openapi_doc(), {"$ref": "schemas.json#/Order"})

    def test_synthesise_object_includes_required_fields(self):
        schema = {
            "type": "object",
            "required": ["name"],
            "properties": {"name": {"type": "string"}, "age": {"type": "integer"}},
        }
        result = gen._synthesise_example(schema)
        self.assertIn("name", result)

    def test_synthesise_uuid_format(self):
        schema = {"type": "string", "format": "uuid"}
        result = gen._synthesise_example(schema)
        self.assertEqual(len(result), 36)
        self.assertIn("-", result)

    def test_synthesise_date_time_format(self):
        schema = {"type": "string", "format": "date-time"}
        result = gen._synthesise_example(schema)
        self.assertIn("T", result)

    def test_synthesise_array(self):
        schema = {"type": "array", "items": {"type": "string"}}
        result = gen._synthesise_example(schema)
        self.assertIsInstance(result, list)

    def test_sensitive_field_uses_variable_placeholder(self):
        schema = {
            "type": "object",
            "required": ["password"],
            "properties": {"password": {"type": "string"}},
        }
        result = gen._synthesise_example(schema)
        self.assertIn("{{", result.get("password", ""))

    def test_example_in_schema_takes_priority(self):
        schema = {"type": "string", "example": "explicit-value"}
        result = gen._synthesise_example(schema)
        self.assertEqual(result, "explicit-value")

    def test_depth_limit_prevents_infinite_recursion(self):
        schema = {"type": "object", "properties": {"self": {"type": "object"}}}
        # Should not raise RecursionError
        result = gen._synthesise_example(schema, depth=9)
        self.assertIsInstance(result, (dict, type(None)))


# ---------------------------------------------------------------------------
# Tests — Server URL detection
# ---------------------------------------------------------------------------


class ServerUrlTests(unittest.TestCase):
    def test_first_server_url_extracted(self):
        doc = _openapi_doc()
        url = gen._first_server_url(doc)
        self.assertEqual(url, "https://api.example.test/v1")

    def test_no_servers_returns_default(self):
        doc = _openapi_doc()
        doc.pop("servers", None)
        url = gen._first_server_url(doc)
        self.assertEqual(url, "https://api.example.test")

    def test_trailing_slash_stripped(self):
        doc = _openapi_doc()
        doc["servers"] = [{"url": "https://api.example.test/v1/"}]
        url = gen._first_server_url(doc)
        self.assertFalse(url.endswith("/"))


# ---------------------------------------------------------------------------
# Tests — CLI end-to-end (file write)
# ---------------------------------------------------------------------------


class CLIEndToEndTests(unittest.TestCase):
    def test_write_collection_to_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            spec = tmp_path / "openapi.json"
            spec.write_text(json.dumps(_openapi_doc()), encoding="utf-8")
            output = tmp_path / "out.postman_collection.json"

            col = gen.build_collection(
                gen.load_document(spec),
                project="Orders",
                base_url="https://api.example.test/v1",
            )
            output.write_text(json.dumps(col, indent=2, ensure_ascii=False), encoding="utf-8")

            self.assertTrue(output.is_file())
            loaded = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(loaded["info"]["schema"], gen.POSTMAN_SCHEMA)

    def test_load_invalid_json_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text("NOT JSON", encoding="utf-8")
            with self.assertRaises(Exception):
                gen.load_document(bad)

    def test_output_collection_passes_runner_inspection(self):
        """Generated collection must pass runner.py inspect_collection."""
        runner_dir = Path(__file__).resolve().parents[3] / "integration" / "postman" / "scripts"
        sys.path.insert(0, str(runner_dir))
        try:
            import runner as postman_runner  # noqa: PLC0415
        except ImportError:
            self.skipTest("postman runner not available at relative path")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            col = gen.build_collection(
                _openapi_doc(),
                project="Orders",
                base_url="https://api.example.test/v1",
            )
            col_path = tmp_path / "Orders.postman_collection.json"
            col_path.write_text(json.dumps(col, indent=2, ensure_ascii=False), encoding="utf-8")

            inspection = postman_runner.inspect_collection(str(col_path))
            self.assertGreater(inspection["request_count"], 0)
            self.assertTrue(inspection["has_tests"])


if __name__ == "__main__":
    unittest.main()
