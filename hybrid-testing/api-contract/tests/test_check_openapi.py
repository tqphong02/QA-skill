"""Unit tests for check_openapi.py (structural preflight)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import check_openapi as checker  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _minimal_doc(**overrides: object) -> dict:
    doc = {
        "openapi": "3.0.3",
        "info": {"title": "Test API", "version": "1.0.0"},
        "paths": {
            "/items": {
                "get": {
                    "operationId": "listItems",
                    "responses": {"200": {"description": "OK"}},
                }
            }
        },
    }
    doc.update(overrides)
    return doc


def _check(doc: dict) -> dict:
    return checker.check_document(doc)


def _write_json(directory: Path, name: str, content: dict) -> Path:
    p = directory / name
    p.write_text(json.dumps(content), encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class CheckOpenAPIPassTests(unittest.TestCase):
    """Passing cases — valid minimal specs."""

    def test_minimal_valid_spec(self):
        result = _check(_minimal_doc())
        self.assertTrue(result["passed"])
        self.assertEqual(result["operation_count"], 1)
        self.assertEqual(result["errors"], [])

    def test_operations_list_contains_correct_fields(self):
        result = _check(_minimal_doc())
        op = result["operations"][0]
        self.assertEqual(op["method"], "GET")
        self.assertEqual(op["path"], "/items")
        self.assertEqual(op["operation_id"], "listItems")

    def test_version_30x_is_accepted(self):
        for version in ("3.0.0", "3.0.3", "3.1.0"):
            result = _check(_minimal_doc(openapi=version))
            no_version_error = all(
                "version" not in err["message"].lower() for err in result["errors"]
                if "openapi" in err["location"]
            )
            self.assertTrue(no_version_error, f"Version {version} rejected unexpectedly")

    def test_missing_2xx_produces_warning_not_error(self):
        doc = _minimal_doc()
        doc["paths"]["/items"]["get"]["responses"] = {"404": {"description": "Not found"}}
        result = _check(doc)
        self.assertTrue(result["passed"])
        self.assertTrue(any("2xx" in w["message"] for w in result["warnings"]))

    def test_path_param_with_required_true_passes(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items/{id}": {
                    "get": {
                        "operationId": "getItem",
                        "parameters": [
                            {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
                        ],
                        "responses": {"200": {"description": "OK"}},
                    }
                }
            },
        }
        result = _check(doc)
        self.assertTrue(result["passed"], result["errors"])

    def test_resolved_local_ref_passes(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "responses": {
                            "200": {
                                "description": "OK",
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/Item"}
                                    }
                                },
                            }
                        },
                    }
                }
            },
            "components": {
                "schemas": {
                    "Item": {"type": "object", "properties": {"id": {"type": "string"}}}
                }
            },
        }
        result = _check(doc)
        self.assertTrue(result["passed"], result["errors"])


class CheckOpenAPIErrorTests(unittest.TestCase):
    """Error cases — invalid specs."""

    def test_missing_openapi_field(self):
        doc = {
            "info": {"title": "T", "version": "1"},
            "paths": {"/x": {"get": {"responses": {"200": {"description": "OK"}}}}},
        }
        result = _check(doc)
        self.assertFalse(result["passed"])
        self.assertTrue(any("openapi" in e["location"].lower() for e in result["errors"]))

    def test_wrong_openapi_version(self):
        result = _check(_minimal_doc(openapi="2.0.0"))
        self.assertFalse(result["passed"])

    def test_missing_info_object(self):
        doc = {
            "openapi": "3.0.3",
            "paths": {"/x": {"get": {"responses": {"200": {"description": "OK"}}}}},
        }
        result = _check(doc)
        self.assertFalse(result["passed"])

    def test_missing_info_title(self):
        doc = _minimal_doc()
        doc["info"]["title"] = ""
        result = _check(doc)
        self.assertFalse(result["passed"])

    def test_empty_paths(self):
        doc = _minimal_doc(paths={})
        result = _check(doc)
        self.assertFalse(result["passed"])

    def test_path_not_starting_with_slash(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "items": {
                    "get": {"operationId": "x", "responses": {"200": {"description": "OK"}}}
                }
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])

    def test_duplicate_operation_id(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/a": {
                    "get": {"operationId": "sameId", "responses": {"200": {"description": "OK"}}}
                },
                "/b": {
                    "post": {"operationId": "sameId", "responses": {"200": {"description": "OK"}}}
                },
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])
        self.assertTrue(any("Duplicate" in e["message"] for e in result["errors"]))

    def test_unresolved_local_ref(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "responses": {
                            "200": {
                                "description": "OK",
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/Missing"}
                                    }
                                },
                            }
                        },
                    }
                }
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])
        self.assertTrue(any("Unresolved" in e["message"] for e in result["errors"]))

    def test_path_param_not_declared(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items/{id}": {
                    "get": {
                        "operationId": "getItem",
                        "responses": {"200": {"description": "OK"}},
                    }
                }
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])
        self.assertTrue(any("{id}" in e["message"] for e in result["errors"]))

    def test_path_param_not_required(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items/{id}": {
                    "get": {
                        "operationId": "getItem",
                        "parameters": [
                            {"name": "id", "in": "path", "required": False, "schema": {"type": "string"}}
                        ],
                        "responses": {"200": {"description": "OK"}},
                    }
                }
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])

    def test_duplicate_parameter_in_same_operation(self):
        doc = {
            "openapi": "3.0.3",
            "info": {"title": "T", "version": "1"},
            "paths": {
                "/items": {
                    "get": {
                        "operationId": "listItems",
                        "parameters": [
                            {"name": "page", "in": "query", "schema": {"type": "integer"}},
                            {"name": "page", "in": "query", "schema": {"type": "integer"}},
                        ],
                        "responses": {"200": {"description": "OK"}},
                    }
                }
            },
        }
        result = _check(doc)
        self.assertFalse(result["passed"])


class CheckOpenAPIFileTests(unittest.TestCase):
    """Test the full CLI path via load_document and main."""

    def test_load_document_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = _write_json(Path(tmp), "spec.json", _minimal_doc())
            doc = checker.load_document(p)
            self.assertEqual(doc["openapi"], "3.0.3")

    def test_load_document_invalid_json_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "bad.json"
            p.write_text("not json", encoding="utf-8")
            with self.assertRaises(Exception):
                checker.load_document(p)


if __name__ == "__main__":
    unittest.main()
