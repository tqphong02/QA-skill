#!/usr/bin/env python3
"""Perform a deterministic structural preflight for an OpenAPI 3 document."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
PATH_PARAM = re.compile(r"\{([^{}]+)\}")


def load_document(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        value = json.loads(text)
    else:
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise ValueError("YAML input requires PyYAML; provide JSON or install PyYAML") from exc
        value = yaml.safe_load(text)
    if not isinstance(value, dict):
        raise ValueError("OpenAPI root must be an object")
    return value


def iter_refs(value: Any, location: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_location = f"{location}.{key}"
            if key == "$ref" and isinstance(child, str):
                yield child_location, child
            else:
                yield from iter_refs(child, child_location)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_refs(child, f"{location}[{index}]")


def resolve_local(document: dict[str, Any], ref: str) -> bool:
    if not ref.startswith("#/"):
        return True
    node: Any = document
    for encoded_part in ref[2:].split("/"):
        part = encoded_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return True


def merged_parameters(path_item: dict[str, Any], operation: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for raw in list(path_item.get("parameters", [])) + list(operation.get("parameters", [])):
        if isinstance(raw, dict) and "$ref" not in raw:
            result.append(raw)
    return result


def check_document(document: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    operations: list[dict[str, str]] = []
    operation_ids: dict[str, str] = {}

    def error(location: str, message: str) -> None:
        errors.append({"location": location, "message": message})

    def warn(location: str, message: str) -> None:
        warnings.append({"location": location, "message": message})

    version = document.get("openapi")
    if not isinstance(version, str) or not version.startswith("3."):
        error("$.openapi", "Expected an OpenAPI 3.x version string")

    info = document.get("info")
    if not isinstance(info, dict):
        error("$.info", "Missing info object")
    else:
        if not info.get("title"):
            error("$.info.title", "Missing API title")
        if not info.get("version"):
            error("$.info.version", "Missing API version")

    paths = document.get("paths")
    if not isinstance(paths, dict) or not paths:
        error("$.paths", "Missing or empty paths object")
        paths = {}

    for path, raw_path_item in paths.items():
        location = f"$.paths.{path}"
        if not isinstance(path, str) or not path.startswith("/"):
            error(location, "Path must start with /")
        if not isinstance(raw_path_item, dict):
            error(location, "Path item must be an object")
            continue
        for method, raw_operation in raw_path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            op_location = f"{location}.{method}"
            if not isinstance(raw_operation, dict):
                error(op_location, "Operation must be an object")
                continue
            operation_id = raw_operation.get("operationId")
            if not operation_id:
                warn(op_location, "Missing operationId")
                operation_id = f"{method.upper()} {path}"
            elif operation_id in operation_ids:
                error(f"{op_location}.operationId", f"Duplicate operationId also used at {operation_ids[operation_id]}")
            else:
                operation_ids[str(operation_id)] = op_location

            responses = raw_operation.get("responses")
            if not isinstance(responses, dict) or not responses:
                error(f"{op_location}.responses", "Missing responses")
            else:
                success = any(str(code).startswith("2") for code in responses)
                if not success:
                    warn(f"{op_location}.responses", "No documented 2xx response")

            parameters = merged_parameters(raw_path_item, raw_operation)
            seen_parameters: set[tuple[str, str]] = set()
            for index, parameter in enumerate(parameters):
                name = str(parameter.get("name", ""))
                where = str(parameter.get("in", ""))
                pair = (name, where)
                if pair in seen_parameters:
                    error(f"{op_location}.parameters[{index}]", f"Duplicate parameter {where}:{name}")
                seen_parameters.add(pair)

            for name in PATH_PARAM.findall(path):
                matches = [p for p in parameters if p.get("name") == name and p.get("in") == "path"]
                if not matches:
                    error(op_location, f"Path parameter {{{name}}} is not defined")
                elif not all(p.get("required") is True for p in matches):
                    error(op_location, f"Path parameter {{{name}}} must be required")

            operations.append({"operation_id": str(operation_id), "method": method.upper(), "path": path})

    for location, ref in iter_refs(document):
        if ref.startswith("#/") and not resolve_local(document, ref):
            error(location, f"Unresolved local reference: {ref}")

    return {
        "passed": not errors,
        "openapi": version,
        "operation_count": len(operations),
        "operations": operations,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--output")
    args = parser.parse_args()
    try:
        document = load_document(Path(args.input))
        report = check_document(document)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
