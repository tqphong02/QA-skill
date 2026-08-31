#!/usr/bin/env python3
"""Generate a Postman collection v2.1 from an OpenAPI 3.x document.

Reads a local OpenAPI JSON or YAML file and writes a Postman collection v2.1
JSON file that is immediately usable with ``../../integration-postman/scripts/runner.py
api-test``.

Each operation becomes a Postman request item with:
- Method and URL template using ``{{baseUrl}}``
- Path/query parameters as Postman variables
- Request body example from ``requestBody.content.*.example`` or a
  synthesised skeleton from the schema
- Authorization header from the top-level or operation-level security scheme
- A default ``pm.test`` script that asserts the expected status code

The generator does NOT call a live endpoint. It is a static tool that bridges
the OpenAPI spec and the Postman runner.

Usage::

    python3 scripts/gen_postman_collection.py openapi.json \\
        --project MyAPI \\
        --output run-dir/MyAPI.postman_collection.json \\
        [--base-url https://api.example.test] \\
        [--auth-scheme bearerAuth]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path
from typing import Any


POSTMAN_SCHEMA = (
    "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
)
MUTATING_METHODS = {"post", "put", "patch", "delete"}
HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
_SENSITIVE_FIELD_RE = re.compile(
    r"(password|secret|token|api.?key|authorization)", re.IGNORECASE
)


def _stable_id(*parts: object) -> str:
    """Return a reproducible UUID for reviewable, cache-friendly output."""
    identity = "qa-skill-suite:postman:" + "|".join(str(part) for part in parts)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, identity))


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_document(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise ValueError(
                "YAML input requires PyYAML: pip install pyyaml"
            ) from exc
        value = yaml.safe_load(text)
    else:
        value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("OpenAPI root must be a JSON/YAML object")
    return value


# ---------------------------------------------------------------------------
# $ref resolution (local only)
# ---------------------------------------------------------------------------

def _resolve_ref(document: dict[str, Any], ref: str) -> Any:
    """Return the target of a local JSON Pointer ``#/…`` reference."""
    if not ref.startswith("#/"):
        return None
    node: Any = document
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def resolve_node(document: dict[str, Any], node: Any, depth: int = 0) -> Any:
    """Recursively resolve ``$ref`` pointers in *node* up to a safe depth."""
    if depth > 10:
        return node
    if isinstance(node, dict):
        if "$ref" in node and isinstance(node["$ref"], str):
            ref = node["$ref"]
            if not ref.startswith("#/"):
                raise ValueError(
                    f"External $ref requires a bundled OpenAPI document: {ref}"
                )
            target = _resolve_ref(document, ref)
            if target is not None:
                return resolve_node(document, target, depth + 1)
            raise ValueError(f"Unresolved local $ref: {ref}")
        return {k: resolve_node(document, v, depth + 1) for k, v in node.items()}
    if isinstance(node, list):
        return [resolve_node(document, item, depth + 1) for item in node]
    return node


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _security_schemes(document: dict[str, Any]) -> dict[str, Any]:
    return (
        document.get("components", {}).get("securitySchemes", {}) or {}
    )


def _pick_scheme(
    document: dict[str, Any], security: list[dict[str, Any]] | None
) -> tuple[str, dict[str, Any]] | None:
    """Return the first resolvable security scheme from a security requirement."""
    schemes = _security_schemes(document)
    for req in security or []:
        for name in req:
            defn = schemes.get(name)
            if isinstance(defn, dict):
                return name, defn
    return None


def _auth_header(
    document: dict[str, Any], security: list[dict[str, Any]] | None
) -> dict[str, str] | None:
    """Return a Postman header dict for the first applicable security scheme."""
    found = _pick_scheme(document, security)
    if not found:
        return None
    _, defn = found
    scheme_type = str(defn.get("type", "")).lower()
    if scheme_type == "http":
        http_scheme = str(defn.get("scheme", "")).lower()
        if http_scheme == "bearer":
            return {"key": "Authorization", "value": "Bearer {{token}}"}
        if http_scheme == "basic":
            return {"key": "Authorization", "value": "Basic {{basicCredentials}}"}
    if scheme_type == "apikey":
        in_ = str(defn.get("in", "")).lower()
        key_name = str(defn.get("name", "X-Api-Key"))
        if in_ == "header":
            return {"key": key_name, "value": "{{apiKey}}"}
    return None


def _postman_auth(
    document: dict[str, Any], security: list[dict[str, Any]] | None
) -> dict[str, Any] | None:
    """Return a Postman auth block for the collection or request level."""
    found = _pick_scheme(document, security)
    if not found:
        return None
    _, defn = found
    scheme_type = str(defn.get("type", "")).lower()
    if scheme_type == "http":
        http_scheme = str(defn.get("scheme", "")).lower()
        if http_scheme == "bearer":
            return {
                "type": "bearer",
                "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}],
            }
        if http_scheme == "basic":
            return {
                "type": "basic",
                "basic": [
                    {"key": "username", "value": "{{username}}", "type": "string"},
                    {"key": "password", "value": "{{password}}", "type": "string"},
                ],
            }
    if scheme_type == "apikey":
        in_ = str(defn.get("in", "")).lower()
        key_name = str(defn.get("name", "X-Api-Key"))
        if in_ == "header":
            return {
                "type": "apikey",
                "apikey": [
                    {"key": "key", "value": key_name, "type": "string"},
                    {"key": "value", "value": "{{apiKey}}", "type": "string"},
                    {"key": "in", "value": "header", "type": "string"},
                ],
            }
    return None


# ---------------------------------------------------------------------------
# Body example synthesis
# ---------------------------------------------------------------------------

def _primitive_example(schema: dict[str, Any]) -> Any:
    """Return a safe placeholder for a primitive schema type."""
    t = str(schema.get("type", "string")).lower()
    fmt = str(schema.get("format", "")).lower()
    if t == "integer" or t == "number":
        return 0
    if t == "boolean":
        return False
    if t == "array":
        return []
    # string
    if fmt == "date-time":
        return "2024-01-01T00:00:00Z"
    if fmt == "date":
        return "2024-01-01"
    if fmt == "uuid":
        return "00000000-0000-0000-0000-000000000000"
    if fmt == "email":
        return "user@example.com"
    if schema.get("enum"):
        return schema["enum"][0]
    return "string"


def _synthesise_example(schema: dict[str, Any], depth: int = 0) -> Any:
    """Recursively build a minimal example from a schema object."""
    if depth > 5:
        return {}
    if not isinstance(schema, dict):
        return {}
    if "example" in schema:
        return schema["example"]
    t = str(schema.get("type", "")).lower()
    if t == "object" or "properties" in schema:
        props = schema.get("properties") or {}
        required = set(schema.get("required") or [])
        result: dict[str, Any] = {}
        for name, prop_schema in props.items():
            if name in required or not required:
                if isinstance(prop_schema, dict):
                    if _SENSITIVE_FIELD_RE.search(name):
                        result[name] = f"{{{{{name}}}}}"
                    else:
                        result[name] = _synthesise_example(prop_schema, depth + 1)
        return result
    if t == "array" or "items" in schema:
        items = schema.get("items") or {}
        return [_synthesise_example(items, depth + 1)] if isinstance(items, dict) else []
    if t:
        return _primitive_example(schema)
    return {}


def _body_example(document: dict[str, Any], request_body: dict[str, Any]) -> Any:
    """Extract or synthesise a body example from a requestBody object."""
    content = request_body.get("content") or {}
    for mime in ("application/json", "application/x-www-form-urlencoded", "*/*"):
        media = content.get(mime) or content.get("*/*") or {}
        if not isinstance(media, dict):
            continue
        if "example" in media:
            return media["example"]
        if "examples" in media:
            examples = media["examples"]
            if isinstance(examples, dict):
                first = next(iter(examples.values()), {})
                if isinstance(first, dict) and "value" in first:
                    return first["value"]
        schema = media.get("schema") or {}
        if schema:
            schema = resolve_node(document, schema)
            return _synthesise_example(schema)
    return {}


# ---------------------------------------------------------------------------
# URL building
# ---------------------------------------------------------------------------

def _url_object(base_url: str, path: str, parameters: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a Postman URL object for the given operation."""
    # Strip trailing slash from base; path always starts with /
    base = base_url.rstrip("/")
    raw = f"{{{{baseUrl}}}}{path}"

    # Query parameters
    query = [
        {
            "key": p["name"],
            "value": f"{{{{{p['name']}}}}}",
            "description": p.get("description", ""),
        }
        for p in parameters
        if p.get("in") == "query"
    ]

    # Path split
    host_part = "{{baseUrl}}"
    path_parts = [part for part in path.split("/") if part]

    obj: dict[str, Any] = {
        "raw": raw,
        "host": [host_part],
        "path": path_parts,
    }
    if query:
        obj["query"] = query
    return obj


# ---------------------------------------------------------------------------
# Test script
# ---------------------------------------------------------------------------

_DEFAULT_SUCCESS_STATUS = {
    "get": 200,
    "post": 201,
    "put": 200,
    "patch": 200,
    "delete": 204,
    "options": 200,
    "head": 200,
    "trace": 200,
}

_TEST_SCRIPT_TEMPLATE = """\
pm.test('response status is expected', function () {{
    pm.expect(pm.response.code).to.be.oneOf([{status_codes}]);
}});

pm.test('response time is acceptable', function () {{
    pm.expect(pm.response.responseTime).to.be.below(5000);
}});
"""

_JSON_SCHEMA_ASSERTION = """\
pm.test('response body is JSON', function () {{
    pm.response.to.have.header('Content-Type');
    pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json');
}});
"""


def _test_script(method: str, responses: dict[str, Any]) -> list[str]:
    """Return exec lines for a Postman test script."""
    success_codes = sorted(
        int(code)
        for code in responses
        if str(code).startswith("2") and str(code).isdigit()
    )
    if not success_codes:
        success_codes = [_DEFAULT_SUCCESS_STATUS.get(method.lower(), 200)]

    status_codes = ", ".join(str(c) for c in success_codes)
    lines = _TEST_SCRIPT_TEMPLATE.format(status_codes=status_codes).splitlines()

    # Add JSON body assertion for operations that document a JSON response
    has_json_2xx = any(
        "application/json" in str(responses.get(code, {}).get("content", {}))
        for code in responses
        if str(code).startswith("2")
    )
    if has_json_2xx:
        lines += [""] + _JSON_SCHEMA_ASSERTION.splitlines()

    return [line + "\n" for line in lines]


# ---------------------------------------------------------------------------
# Item builder
# ---------------------------------------------------------------------------

def _build_item(
    document: dict[str, Any],
    method: str,
    path: str,
    operation: dict[str, Any],
    global_security: list[dict[str, Any]] | None,
    base_url: str,
) -> dict[str, Any]:
    operation_id = operation.get("operationId") or f"{method.upper()} {path}"
    summary = operation.get("summary") or operation_id

    # Parameters
    parameters: list[dict[str, Any]] = []
    for raw in operation.get("parameters") or []:
        resolved = resolve_node(document, raw)
        if isinstance(resolved, dict):
            parameters.append(resolved)

    # Headers
    headers: list[dict[str, Any]] = [
        {
            "key": p["name"],
            "value": f"{{{{{p['name']}}}}}",
            "description": p.get("description", ""),
        }
        for p in parameters
        if p.get("in") == "header"
    ]

    # Auth — operation-level overrides global
    op_security = operation.get("security")
    effective_security = op_security if op_security is not None else global_security
    auth_block = _postman_auth(document, effective_security)

    # Body
    body: dict[str, Any] | None = None
    request_body_raw = operation.get("requestBody")
    if isinstance(request_body_raw, dict):
        request_body = resolve_node(document, request_body_raw)
        example = _body_example(document, request_body)
        body = {
            "mode": "raw",
            "raw": json.dumps(example, ensure_ascii=False, indent=2),
            "options": {"raw": {"language": "json"}},
        }
        if not any(h["key"].lower() == "content-type" for h in headers):
            headers.append({"key": "Content-Type", "value": "application/json"})

    # URL
    url_obj = _url_object(base_url, path, parameters)

    # Request
    request: dict[str, Any] = {
        "method": method.upper(),
        "header": headers,
        "url": url_obj,
    }
    if body:
        request["body"] = body
    if auth_block:
        request["auth"] = auth_block

    # Responses (documented)
    responses = operation.get("responses") or {}

    # Test script
    test_exec = _test_script(method, responses)
    event = [
        {
            "listen": "test",
            "script": {
                "type": "text/javascript",
                "exec": test_exec,
            },
        }
    ]

    return {
        "id": _stable_id("request", method.upper(), path, operation_id),
        "name": summary,
        "request": request,
        "response": [],
        "event": event,
        "_original_operation_id": operation_id,
    }


# ---------------------------------------------------------------------------
# Tag-based folder grouping
# ---------------------------------------------------------------------------

def _group_items_by_tag(
    items: list[dict[str, Any]], tag_map: dict[str, str]
) -> list[dict[str, Any]]:
    """Wrap items in named folder groups keyed by their first tag."""
    folders: dict[str, list[dict[str, Any]]] = {}
    untagged: list[dict[str, Any]] = []

    for item in items:
        op_id = item.pop("_original_operation_id", "")
        tag = tag_map.get(op_id)
        if tag:
            folders.setdefault(tag, []).append(item)
        else:
            untagged.append(item)

    result: list[dict[str, Any]] = [
        {
            "id": _stable_id("folder", tag),
            "name": tag,
            "item": folder_items,
        }
        for tag, folder_items in folders.items()
    ]
    result.extend(untagged)
    return result


# ---------------------------------------------------------------------------
# Collection builder
# ---------------------------------------------------------------------------

def build_collection(
    document: dict[str, Any],
    *,
    project: str,
    base_url: str,
    auth_scheme: str | None = None,
) -> dict[str, Any]:
    """Convert an OpenAPI 3.x document to a Postman v2.1 collection dict."""
    info_block = document.get("info") or {}
    title = str(info_block.get("title") or project)

    # Resolve global security
    global_security: list[dict[str, Any]] | None = document.get("security")
    if auth_scheme:
        if auth_scheme not in _security_schemes(document):
            raise ValueError(f"Unknown auth scheme: {auth_scheme}")
        global_security = [{auth_scheme: []}]

    # Build items and track operation→tag
    items: list[dict[str, Any]] = []
    tag_map: dict[str, str] = {}  # operation_id → first tag

    paths = document.get("paths") or {}
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            if not isinstance(operation, dict):
                continue
            if auth_scheme:
                operation = {**operation, "security": [{auth_scheme: []}]}
            item = _build_item(
                document,
                method,
                path,
                operation,
                global_security,
                base_url,
            )
            op_id = item.get("_original_operation_id", "")
            tags = operation.get("tags") or []
            if tags:
                tag_map[op_id] = str(tags[0])
            items.append(item)

    grouped = _group_items_by_tag(items, tag_map)

    # Collection-level auth from global security
    collection_auth = _postman_auth(document, global_security)

    collection: dict[str, Any] = {
        "info": {
            "_postman_id": _stable_id("collection", project, title, base_url),
            "name": f"{project} — {title}",
            "description": str(info_block.get("description") or ""),
            "schema": POSTMAN_SCHEMA,
        },
        "item": grouped,
        "variable": [
            {
                "id": _stable_id("variable", project, "baseUrl"),
                "key": "baseUrl",
                "value": base_url,
                "type": "string",
            }
        ],
    }
    if collection_auth:
        collection["auth"] = collection_auth

    return collection


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _first_server_url(document: dict[str, Any]) -> str:
    servers = document.get("servers") or []
    if servers and isinstance(servers[0], dict):
        url = str(servers[0].get("url") or "")
        if url:
            return url.rstrip("/")
    return "https://api.example.test"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="OpenAPI 3.x JSON or YAML file")
    parser.add_argument("--project", default="API", help="Project name prefix")
    parser.add_argument(
        "--output",
        help="Output path for the Postman collection JSON "
        "(default: <project>.postman_collection.json beside the spec)",
    )
    parser.add_argument(
        "--base-url",
        dest="base_url",
        help="Override the base URL injected as {{baseUrl}} "
        "(default: first servers[].url from the spec)",
    )
    parser.add_argument(
        "--auth-scheme",
        dest="auth_scheme",
        help="Override security scheme name to use for auth headers",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the collection JSON to stdout without writing a file",
    )
    args = parser.parse_args()

    try:
        document = load_document(Path(args.input))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"BLOCKED load_error detail={exc}", file=sys.stderr)
        return 2

    base_url = args.base_url or _first_server_url(document)

    try:
        collection = build_collection(
            document,
            project=args.project,
            base_url=base_url,
            auth_scheme=args.auth_scheme,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"BLOCKED generation_error detail={exc}", file=sys.stderr)
        return 2

    payload = json.dumps(collection, ensure_ascii=False, indent=2) + "\n"
    request_count = sum(
        1
        for folder_or_item in collection["item"]
        for _ in (
            folder_or_item.get("item") or [folder_or_item]
            if "item" in folder_or_item
            else [folder_or_item]
        )
    )

    if args.dry_run:
        print(payload)
        print(
            f"DRY_RUN collection={collection['info']['name']} "
            f"items={len(collection['item'])} base_url={base_url}",
            file=sys.stderr,
        )
        return 0

    output_path: Path
    if args.output:
        output_path = Path(args.output)
    else:
        spec_path = Path(args.input)
        output_path = spec_path.with_name(
            f"{args.project}.postman_collection.json"
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(payload, encoding="utf-8")

    print(
        f"PASS collection={collection['info']['name']} "
        f"output={output_path} "
        f"base_url={base_url} "
        f"items={len(collection['item'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
