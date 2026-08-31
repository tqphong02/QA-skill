from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

import analyze_openapi as analyzer  # noqa: E402
import render_api_qa as renderer  # noqa: E402


def referenced_document() -> dict:
    error_ref = {"$ref": "#/components/responses/ErrorResponse"}
    return {
        "openapi": "3.0.3",
        "info": {"title": "Orders API", "version": "1.0.0"},
        "servers": [{"url": "https://api.example.test/v1"}],
        "security": [{"bearerAuth": []}],
        "paths": {
            "/orders": {
                "get": {
                    "operationId": "listOrders",
                    "summary": "List orders",
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "operationId": "createOrder",
                    "summary": "Create and persist one order",
                    "tags": ["Orders"],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/CreateOrder"},
                                "example": {"customerId": "CUS-1"},
                            }
                        },
                    },
                    "responses": {
                        "201": {
                            "description": "Created",
                            "headers": {
                                "Location": {"schema": {"type": "string"}},
                                "X-Request-ID": {"schema": {"type": "string"}},
                            },
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/Order"}
                                }
                            },
                        },
                        "400": error_ref,
                        "401": {"$ref": "#/components/responses/Unauthorized"},
                        "403": error_ref,
                        "409": error_ref,
                        "429": {"$ref": "#/components/responses/RateLimited"},
                        "500": error_ref,
                    },
                },
            }
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
            },
            "schemas": {
                "CreateOrder": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["customerId"],
                    "properties": {
                        "customerId": {"type": "string", "maxLength": 40}
                    },
                },
                "Order": {
                    "type": "object",
                    "required": ["id", "created_at", "updated_at"],
                    "properties": {
                        "id": {"type": "string", "format": "uuid"},
                        "created_at": {"type": "string", "format": "date-time"},
                        "updated_at": {"type": "string", "format": "date-time"},
                    },
                },
                "Error": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string"},
                        "message": {"type": "string"},
                    },
                },
            },
            "responses": {
                "ErrorResponse": {
                    "description": "Error",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "Unauthorized": {
                    "description": "Unauthorized",
                    "headers": {"WWW-Authenticate": {"schema": {"type": "string"}}},
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "RateLimited": {
                    "description": "Rate limited",
                    "headers": {"Retry-After": {"schema": {"type": "integer"}}},
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
            },
        },
    }


class StaticAnalysisTests(unittest.TestCase):
    def test_local_refs_source_identity_and_server_version_are_respected(self):
        resolved = analyzer.resolve_local_refs(referenced_document())
        result = analyzer.analyse(resolved, "Orders", r"C:\specs\orders.json")
        gaps = "\n".join(item["ambiguity_gap"] for item in result["questions"])

        self.assertNotIn("WWW-Authenticate", gaps)
        self.assertNotIn("Retry-After", gaps)
        self.assertNotIn("versioning strategy", gaps)
        self.assertNotIn("contact info", gaps)
        self.assertNotIn("license", gaps)
        self.assertNotIn("root level", gaps)
        self.assertNotIn("CORS", gaps)
        self.assertEqual(result["spec_source"], "orders.json")
        self.assertTrue(all(q["source_ref"].startswith("orders.json") for q in result["questions"]))
        self.assertEqual([op["id"] for op in result["api_operations"]], ["API-001", "API-002"])

    def test_explicit_browser_consumer_requires_cors_contract(self):
        document = referenced_document()
        document["x-browser-consumers"] = True
        result = analyzer.analyse(analyzer.resolve_local_refs(document), "Orders", "orders.yaml")
        self.assertTrue(any("CORS" in q["ambiguity_gap"] for q in result["questions"]))

    def test_missing_local_ref_blocks_resolution(self):
        document = referenced_document()
        document["paths"]["/orders"]["post"]["requestBody"]["content"]["application/json"]["schema"] = {
            "$ref": "#/components/schemas/Missing"
        }
        with self.assertRaisesRegex(ValueError, "Unresolved local reference"):
            analyzer.resolve_local_refs(document)

    def test_recursive_local_ref_is_bounded(self):
        document = referenced_document()
        document["components"]["schemas"]["Node"] = {
            "type": "object",
            "properties": {"child": {"$ref": "#/components/schemas/Node"}},
        }
        resolved = analyzer.resolve_local_refs(document)
        child = resolved["components"]["schemas"]["Node"]["properties"]["child"]
        self.assertEqual(child["properties"]["child"]["$ref"], "#/components/schemas/Node")

    def test_renderer_writes_markdown_and_four_sheet_workbook(self):
        result = analyzer.analyse(
            analyzer.resolve_local_refs(referenced_document()), "Orders", "orders.json"
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "Orders_API_Analysis_Source.json"
            source.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            markdown = root / "Orders_API_Q&A.md"
            workbook = root / "Orders_API_Q&A.xlsx"
            renderer.render_markdown(result, markdown)
            renderer.render_excel(result, workbook)
            self.assertIn("orders.json", markdown.read_text(encoding="utf-8"))
            self.assertTrue(workbook.is_file())
            if renderer.HAS_OPENPYXL:
                from openpyxl import load_workbook

                opened = load_workbook(workbook, read_only=True)
                self.assertEqual(
                    opened.sheetnames,
                    ["Summary", "Q&A", "Operation Ledger", "Review Coverage"],
                )
                opened.close()


if __name__ == "__main__":
    unittest.main()
