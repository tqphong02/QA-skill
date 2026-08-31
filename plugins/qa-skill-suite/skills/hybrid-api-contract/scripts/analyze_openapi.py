#!/usr/bin/env python3
"""Static semantic analysis for OpenAPI 3.x documents — FULL COVERAGE.

CONTRACT_MATRIX (8 areas) + Schema Quality + Security + Cross-operation:

  Request       – path/query/header/cookie params, body, content-type, required,
                  nullable, default, enum, format, maxLength, pattern, example
  Response      – status, headers (Location, ETag, Cache-Control, Retry-After,
                  Link), content-type, schema, required, nullable, error shape,
                  204 correctness, array wrapping, async 202
  Auth          – missing scheme, scope, wrong-role/403, API key in URL,
                  HTTP vs HTTPS, JWT undocumented, WWW-Authenticate missing
  Lifecycle     – create, read, update (PATCH/PUT), delete (soft/hard),
                  cleanup, persistence, id/created_at/updated_at in response,
                  bulk/cascade not documented
  Collection    – pagination (page/cursor), total count, next/prev links,
                  filter, sort, searchable fields
  Reliability   – idempotency key, timeout/retry contract, ETag/concurrency,
                  503/504, async long-running (202+polling/webhook)
  Compatibility – deprecated+sunset+migration, x-internal leak, versioning,
                  breaking-change risk (required fields added), changelog
  Observability – correlation ID, sensitive data, tags, description quality,
                  operationId, examples, x-code-samples

  Schema Quality – string without maxLength, date without format: date-time,
                   UUID without format: uuid, number without min/max,
                   additionalProperties policy, oneOf/allOf without discriminator,
                   writeOnly for input-only fields

  Cross-operation – naming consistency (camelCase vs snake_case),
                    ID field naming, global error shape, servers[], CORS/OPTIONS,
                    duplicate operationIds, HEAD method for large GETs

Usage:
    python3 analyze_openapi.py openapi.json --project MyProject --output out/
    python3 analyze_openapi.py openapi.yaml --project MyProject --output out/
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HTTP_METHODS     = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
MUTATING_METHODS = {"post", "put", "patch", "delete"}
WRITE_METHODS    = {"post", "put", "patch"}
PATH_PARAM_RE    = re.compile(r"\{([^{}]+)\}")

AUTH_CODES       = {"401", "403"}
VALIDATION_CODES = {"400", "422"}
CONFLICT_CODES   = {"409"}
SERVER_ERR_CODES = {"500"}
RATE_LIMIT_CODES = {"429"}
UNAVAIL_CODES    = {"503", "504"}

SENSITIVE_FIELDS = {
    "password", "passwd", "secret", "token", "access_token", "refresh_token",
    "api_key", "apikey", "client_secret", "private_key", "credit_card",
    "card_number", "cvv", "ssn", "authorization", "pin", "otp", "private",
}

CORRELATION_HEADERS = {
    "x-request-id", "x-correlation-id", "x-trace-id", "traceparent", "x-b3-traceid",
}

# Field names that almost always need to be in a response
LIFECYCLE_FIELDS = {"id", "created_at", "updated_at", "created_at", "createdat", "updatedat"}

# Typical ID field names
ID_FIELD_VARIANTS = {"id", "uuid", "guid", "key", "pk"}

REVIEW_AREAS = [
    "Scope and actors", "Entry and preconditions", "Happy flow",
    "Alternate and exception flow", "Business rules", "States and transitions",
    "Roles and permissions", "Input and validation", "Data lifecycle and persistence",
    "API and integration", "Error handling and recovery", "Concurrency and idempotency",
    "Security and privacy", "Performance and capacity", "UI UX and accessibility",
    "Audit logging and observability", "Compatibility and migration",
    "Testability and acceptance criteria",
]

# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

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


def _lookup_local_ref(document: dict[str, Any], ref: str) -> Any:
    """Resolve one RFC 6901 local reference or raise a typed value error."""
    if not ref.startswith("#/"):
        raise ValueError(f"External reference is not supported by static analysis: {ref}")
    node: Any = document
    for encoded_part in ref[2:].split("/"):
        part = encoded_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            raise ValueError(f"Unresolved local reference: {ref}")
        node = node[part]
    return node


def resolve_local_refs(document: dict[str, Any]) -> dict[str, Any]:
    """Expand local refs into a detached document while bounding cycles."""

    def walk(value: Any, stack: tuple[str, ...] = ()) -> Any:
        if isinstance(value, list):
            return [walk(item, stack) for item in value]
        if not isinstance(value, dict):
            return value

        ref = value.get("$ref")
        if isinstance(ref, str) and not ref.startswith("#/"):
            raise ValueError(f"External reference requires a bundled specification: {ref}")
        if isinstance(ref, str) and ref.startswith("#/"):
            siblings = {
                key: walk(child, stack)
                for key, child in value.items()
                if key != "$ref"
            }
            if ref in stack:
                return {"$ref": ref, **siblings}
            resolved = walk(_lookup_local_ref(document, ref), (*stack, ref))
            if isinstance(resolved, dict):
                return {**resolved, **siblings}
            return siblings or resolved

        return {key: walk(child, stack) for key, child in value.items()}

    resolved = walk(document)
    if not isinstance(resolved, dict):
        raise ValueError("Resolved OpenAPI root must be an object")
    return resolved


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def _responses(op: dict) -> dict:
    return op.get("responses") or {}

def _codes(op: dict) -> set[str]:
    return {str(k) for k in _responses(op)}

def _merged_params(path_item: dict, op: dict) -> list[dict]:
    return [p for p in
            list(path_item.get("parameters") or []) + list(op.get("parameters") or [])
            if isinstance(p, dict) and "$ref" not in p]

def _has_security(op: dict, doc_sec: list) -> bool:
    s = op.get("security")
    return bool(s) if s is not None else bool(doc_sec)

def _security_scheme_names(op: dict, doc_sec: list) -> list[str]:
    sec = op.get("security") if op.get("security") is not None else doc_sec
    names = []
    for item in (sec or []):
        if isinstance(item, dict):
            names.extend(item.keys())
    return names

def _rb_schema(op: dict) -> dict | None:
    rb = op.get("requestBody") or {}
    for m in (rb.get("content") or {}).values():
        if isinstance(m, dict) and m.get("schema"):
            return m["schema"]
    return None

def _rb_content_types(op: dict) -> list[str]:
    rb = op.get("requestBody") or {}
    return list((rb.get("content") or {}).keys())

def _resp_schema(resps: dict, code: str) -> dict | None:
    r = resps.get(code) or {}
    for m in (r.get("content") or {}).values():
        if isinstance(m, dict) and m.get("schema"):
            return m["schema"]
    return None

def _resp_content_types(resps: dict, code: str) -> list[str]:
    r = resps.get(code) or {}
    return list((r.get("content") or {}).keys())

def _resp_headers(resps: dict, code: str) -> dict:
    return (resps.get(code) or {}).get("headers") or {}

def _schema_props(schema: dict | None) -> dict:
    if not schema:
        return {}
    props = dict(schema.get("properties") or {})
    for comb in ("allOf", "oneOf", "anyOf"):
        for sub in (schema.get(comb) or []):
            if isinstance(sub, dict):
                props.update(sub.get("properties") or {})
    return props

def _schema_field_names(schema: dict | None) -> set[str]:
    return set(_schema_props(schema).keys())

def _walk_sensitive(schema: dict | None, depth: int = 0) -> list[str]:
    if not schema or depth > 3:
        return []
    found = [f for f in (_schema_props(schema)) if f.lower() in SENSITIVE_FIELDS]
    for comb in ("allOf", "oneOf", "anyOf"):
        for sub in (schema.get(comb) or []):
            found.extend(_walk_sensitive(sub, depth + 1))
    return found

def _has_param(params: list[dict], name: str, location: str | None = None) -> bool:
    for p in params:
        match = str(p.get("name", "")).lower() == name.lower()
        loc_ok = location is None or p.get("in") == location
        if match and loc_ok:
            return True
    return False

def _has_header_param(params: list[dict], names: set[str]) -> bool:
    return any(str(p.get("name", "")).lower() in names and p.get("in") == "header"
               for p in params)

def _is_list_endpoint(path: str, op: dict) -> bool:
    summary = (op.get("summary") or op.get("description") or "").lower()
    if re.search(r"(list|search|find|filter|paginate|get.+all|all\s)", summary):
        return True
    return not path.rstrip("/").endswith("}")

def _src_ref(source_name: str, path: str, method: str) -> str:
    pointer = path.replace("~", "~0").replace("/", "~1")
    return f"{source_name}#/paths/{pointer}/{method}"

def _label(method: str, path: str) -> str:
    return f"{method.upper()} {path}"

def _summary(op: dict) -> str:
    return op.get("summary") or op.get("description") or ""

def _deprecated_without_note(op: dict) -> bool:
    if not op.get("deprecated"):
        return False
    desc = (op.get("description") or "").lower()
    return not any(k in desc for k in ("migrat", "replac", "use instead", "thay thế", "chuyển", "sunset"))

def _error_field_sets(resps: dict) -> list[set[str]]:
    out = []
    for code in resps:
        if str(code).startswith(("4", "5")):
            s = _resp_schema(resps, str(code))
            if s:
                out.append(_schema_field_names(s))
    return out

def _is_camel(name: str) -> bool:
    return bool(re.match(r"^[a-z][a-zA-Z0-9]*$", name))

def _is_snake(name: str) -> bool:
    return bool(re.match(r"^[a-z][a-z0-9_]*$", name))


# ---------------------------------------------------------------------------
# Q&A factory
# ---------------------------------------------------------------------------

def _qa(
    counter: list[int],
    api_id: str,
    basis: str,
    category: str,
    gap: str,
    risk: str,
    question: str,
    assumption: str,
    src: str,
    excerpt: str,
    module: str,
    owner: str = "Dev",
    priority: str = "P1",
) -> dict:
    counter.append(1)
    idx = len(counter)
    slug = re.sub(r"[^\w]", "-", gap[:28].lower())
    return {
        "id": f"QA-API-{idx:03d}",
        "decision_key": f"api.{api_id.lower()}.{slug}-{idx}",
        "basis": basis,
        "impact_ids": [api_id],
        "category": category,
        "module_flow": module,
        "source_ref": src,
        "source_excerpt": excerpt,
        "ambiguity_gap": gap,
        "risk": risk,
        "question": question,
        "proposed_assumption": assumption,
        "owner": owner,
        "priority": priority,
        "status": "Open",
        "answer": "",
        "answer_source_ref": "",
        "answer_source_excerpt": "",
    }


# ---------------------------------------------------------------------------
# Per-operation gap analysis
# ---------------------------------------------------------------------------

def _analyse_op(
    path: str,
    method: str,
    op: dict,
    path_item: dict,
    doc_sec: list,
    components: dict,
    qa_counter: list[int],
    op_idx: int,
    source_name: str,
) -> tuple[dict, list[dict]]:

    m       = method.lower()
    label   = _label(method, path)
    api_id  = f"API-{op_idx:03d}"
    src     = _src_ref(source_name, path, method)
    params  = _merged_params(path_item, op)
    resps   = _responses(op)
    codes   = _codes(op)
    pparams = PATH_PARAM_RE.findall(path)
    summ    = _summary(op)
    sl      = summ.lower()
    qa: list[dict] = []

    def Q(basis, cat, gap, risk, question, assumption, owner="Dev", priority="P1"):
        excerpt = f"{method.upper()} {path}"
        if codes:
            excerpt += f" | responses: {', '.join(sorted(codes))}"
        qa.append(_qa(qa_counter, api_id, basis, cat, gap, risk, question,
                      assumption, src, excerpt, label, owner, priority))

    schemes_def = components.get("securitySchemes") or {}

    # =========================================================================
    # 1. REQUEST
    # =========================================================================

    # 1a. Mutating method — missing requestBody
    if m in WRITE_METHODS:
        if not op.get("requestBody"):
            Q("missing_required_rule", "Request",
              f"{label} không có requestBody",
              "Client không biết payload cần gửi",
              f"{label} nhận body gì? Các field bắt buộc là gì?",
              "Khai báo requestBody với JSON Schema đầy đủ", priority="P0")
        else:
            rb_schema = _rb_schema(op)
            cts = _rb_content_types(op)

            # 1b. requestBody no Content-Type
            if not cts:
                Q("missing_required_rule", "Request",
                  f"{label} có requestBody nhưng không khai báo Content-Type",
                  "Client không biết format nào được chấp nhận",
                  f"{label} chấp nhận Content-Type nào?",
                  "Khai báo application/json trong requestBody.content")

            # 1c. requestBody no schema
            if cts and not rb_schema:
                Q("ambiguous_text", "Request",
                  f"requestBody của {label} không có schema",
                  "Không validate được request; test thiếu boundary case",
                  f"Schema của requestBody {label} là gì?",
                  "Bổ sung JSON Schema vào requestBody.content")
            elif rb_schema:
                props = _schema_props(rb_schema)
                required = rb_schema.get("required") or []

                # 1d. No required[] declared
                if props and not required:
                    Q("ambiguous_text", "Request",
                      f"requestBody của {label} không khai báo required[]",
                      "Client không biết field nào bắt buộc",
                      f"Trường nào là bắt buộc trong requestBody của {label}?",
                      "Khai báo required[] trong schema")

                # 1e. Fields without type/format
                untyped = [k for k, v in props.items()
                           if isinstance(v, dict) and not v.get("type") and not v.get("$ref") and not v.get("allOf")]
                if untyped:
                    Q("ambiguous_text", "Request",
                      f"{label} có field không có type: {', '.join(untyped[:4])}",
                      "Validation không xác định; client có thể gửi sai kiểu",
                      f"Type và format của {', '.join(untyped[:4])} là gì?",
                      "Bổ sung type/format cho từng field")

                # 1f. Enum-looking fields without enum values
                for fname, fschema in list(props.items())[:10]:
                    if isinstance(fschema, dict) and fschema.get("type") == "string" \
                       and not fschema.get("enum") \
                       and any(k in fname.lower() for k in ("status", "type", "kind", "mode", "state", "role", "level", "category")):
                        Q("ambiguous_text", "Request",
                          f"Field '{fname}' của {label} trông như enum nhưng không có enum[]",
                          "Client không biết giá trị hợp lệ; dễ gửi sai",
                          f"Các giá trị hợp lệ của '{fname}' trong {label} là gì?",
                          f"Bổ sung enum[] cho '{fname}'")
                        break

                # 1g. String fields without maxLength
                long_str = [k for k, v in props.items()
                            if isinstance(v, dict) and v.get("type") == "string"
                            and not v.get("maxLength") and not v.get("$ref")
                            and not v.get("format") in ("date", "date-time", "uuid", "email", "uri")]
                if long_str:
                    Q("ambiguous_text", "Request",
                      f"{label} có string field(s) không có maxLength: {', '.join(long_str[:4])}",
                      "Server có thể nhận payload quá lớn; SQL injection hoặc buffer risk",
                      f"Giới hạn độ dài tối đa của {', '.join(long_str[:4])} là bao nhiêu?",
                      "Bổ sung maxLength cho tất cả string fields không phải free-text")

                # 1h. Date/time fields without proper format
                for fname, fschema in props.items():
                    if isinstance(fschema, dict) and fschema.get("type") == "string":
                        if any(k in fname.lower() for k in ("date", "time", "at", "_on")):
                            if fschema.get("format") not in ("date", "date-time", "time"):
                                Q("ambiguous_text", "Request",
                                  f"Field '{fname}' của {label} có vẻ là date/time nhưng thiếu format",
                                  "Client không biết format date gửi lên (ISO8601, Unix, custom?)",
                                  f"'{fname}' trong {label} dùng format date nào?",
                                  "Dùng format: date-time (ISO 8601) cho datetime fields")
                                break

                # 1i. Number fields without min/max
                num_fields = [k for k, v in props.items()
                              if isinstance(v, dict) and v.get("type") in ("integer", "number")
                              and not v.get("minimum") and not v.get("maximum")
                              and not v.get("$ref")]
                if num_fields:
                    Q("ambiguous_text", "Request",
                      f"{label} có numeric field(s) không có minimum/maximum: {', '.join(num_fields[:3])}",
                      "Server không giới hạn giá trị; dễ nhận số âm hoặc số quá lớn",
                      f"Giới hạn min/max của {', '.join(num_fields[:3])} là bao nhiêu?",
                      "Bổ sung minimum/maximum/exclusiveMinimum cho numeric fields")

                # 1j. writeOnly not declared for sensitive input fields
                sens_in_req = [k for k in props if k.lower() in SENSITIVE_FIELDS]
                for fname in sens_in_req:
                    fschema = props[fname]
                    if isinstance(fschema, dict) and not fschema.get("writeOnly"):
                        Q("missing_required_rule", "Request",
                          f"Field '{fname}' của {label} request là sensitive nhưng không có writeOnly: true",
                          "Tools có thể include field này vào response documentation/example",
                          f"Field '{fname}' có nên đánh dấu writeOnly: true không?",
                          "Đánh dấu writeOnly: true cho tất cả input-only sensitive fields",
                          priority="P0")
                        break

    # 1k. Query parameters without description
    query_params = [p for p in params if p.get("in") == "query"]
    undesc_qp = [p["name"] for p in query_params
                 if not p.get("description") and not p.get("$ref")]
    if undesc_qp:
        Q("ambiguous_text", "Request",
          f"{label} có query param chưa có description: {', '.join(undesc_qp[:4])}",
          "Client không biết mục đích/giá trị hợp lệ của param",
          f"Mô tả và giá trị hợp lệ của query param {', '.join(undesc_qp[:4])} là gì?",
          "Thêm description cho tất cả query parameters",
          priority="P2")

    # 1l. Query parameters without example
    no_example_qp = [p["name"] for p in query_params
                     if not p.get("example") and not p.get("examples") and not p.get("$ref")]
    if no_example_qp:
        Q("untestable_acceptance", "Request",
          f"{label} có query param không có example: {', '.join(no_example_qp[:4])}",
          "Khó generate test case; tools không có example để dùng",
          f"Example value cho {', '.join(no_example_qp[:4])} là gì?",
          "Thêm example vào từng query parameter",
          priority="P2")

    # 1m. Path parameters not declared
    for pname in pparams:
        if not _has_param(params, pname, "path"):
            Q("missing_required_rule", "Request",
              f"Path param {{{pname}}} của {label} không được khai báo trong parameters[]",
              "Spec không đầy đủ; tools không validate path param",
              f"Kiểu dữ liệu và mô tả của {{{pname}}} là gì?",
              f"Khai báo {{{pname}}} với required: true và schema trong parameters[]",
              priority="P0")

    # 1n. File upload endpoint missing documentation
    if m in WRITE_METHODS and op.get("requestBody"):
        cts = _rb_content_types(op)
        if "multipart/form-data" in cts or "application/octet-stream" in cts:
            rb = op.get("requestBody") or {}
            mp_schema = (rb.get("content") or {}).get("multipart/form-data", {}).get("schema") or {}
            mp_props = _schema_props(mp_schema)
            # Check for file field without maxLength/format
            file_fields = [k for k, v in mp_props.items()
                           if isinstance(v, dict) and v.get("format") == "binary"]
            if file_fields and not any(v.get("maxLength") or (op.get("description") and
                ("mb" in (op.get("description") or "").lower() or "kb" in (op.get("description") or "").lower()))
                for v in [mp_props[f] for f in file_fields if isinstance(mp_props.get(f), dict)]):
                Q("missing_required_rule", "Request",
                  f"{label} là file upload nhưng không khai báo giới hạn file size và allowed types",
                  "Server có thể nhận file quá lớn hoặc file type nguy hiểm",
                  f"{label} cho phép file type nào? Kích thước tối đa là bao nhiêu?",
                  "Khai báo allowed MIME types và maxLength (byte) trong description hoặc x-file-constraints",
                  priority="P0")

    # =========================================================================
    # 2. RESPONSE
    # =========================================================================

    # 2a. Missing auth error codes
    if not AUTH_CODES.intersection(codes):
        Q("missing_required_rule", "Response",
          f"{label} không có 401/403 response",
          "Client không biết xử lý khi thiếu token hoặc sai role",
          f"{label} trả 401 khi thiếu token và 403 khi sai role không?",
          "401 khi token thiếu/hết hạn; 403 khi token hợp lệ nhưng không đủ quyền",
          priority="P0")
    else:
        # 2a2. 401 without WWW-Authenticate header
        if "401" in codes:
            hdrs_401 = _resp_headers(resps, "401")
            has_www_auth = any(k.lower() == "www-authenticate" for k in hdrs_401)
            if not has_www_auth:
                Q("missing_required_rule", "Response",
                  f"{label} có 401 nhưng không khai báo WWW-Authenticate header",
                  "Client không biết scheme xác thực cần dùng",
                  f"Response 401 của {label} có nên trả WWW-Authenticate header không?",
                  "Khai báo WWW-Authenticate: Bearer realm='api' trong 401 response headers",
                  priority="P2")

    # 2b. Missing validation error for write methods
    if m in WRITE_METHODS and not VALIDATION_CODES.intersection(codes):
        Q("missing_required_rule", "Response",
          f"{label} không có 400/422 response",
          "Client không biết xử lý khi request body không hợp lệ",
          f"{label} trả 400 hay 422 khi input không hợp lệ?",
          "422 với error body chi tiết từng field lỗi")

    # 2c. POST missing 409 Conflict
    if m == "post" and not CONFLICT_CODES.intersection(codes):
        Q("missing_required_rule", "Response",
          f"POST {path} không có 409 Conflict",
          "Client không biết xử lý duplicate submission",
          f"POST {path} có trả 409 khi resource đã tồn tại không?",
          "Trả 409 với error code mô tả conflict")

    # 2d. Missing 404 for resource-specific endpoints
    if pparams and "404" not in codes:
        Q("missing_required_rule", "Response",
          f"{label} không có 404 response",
          "Client không biết xử lý khi resource không tồn tại",
          f"{label} trả 404 khi resource không tìm thấy không?",
          "Trả 404 với error message rõ ràng")

    # 2e. Missing 500
    if "500" not in codes:
        Q("missing_required_rule", "Response",
          f"{label} không khai báo 500 response",
          "Client không biết xử lý lỗi server; không có error shape để parse",
          f"{label} trả 500 khi có lỗi server không? Error body có cùng shape với 4xx không?",
          "Khai báo 500 với error shape nhất quán với 4xx")

    # 2f. Missing 429 for write/public endpoints
    if m in WRITE_METHODS and "429" not in codes:
        Q("missing_required_rule", "Response",
          f"{label} không khai báo 429 Too Many Requests",
          "Client không biết endpoint bị rate-limit; không retry đúng cách",
          f"{label} có rate-limit không? Trả 429 với Retry-After header không?",
          "Khai báo 429 với Retry-After header khi vượt quá rate limit")

    # 2g. Missing 503/504 for critical endpoints
    if m in WRITE_METHODS and not UNAVAIL_CODES.intersection(codes):
        Q("ambiguous_text", "Response",
          f"{label} không khai báo 503/504 response",
          "Client không biết phân biệt lỗi service (503) vs timeout (504); retry policy sai",
          f"{label} có thể trả 503 (service unavailable) hay 504 (gateway timeout) không?",
          "Khai báo 503 và 504 với Retry-After header cho các endpoint quan trọng",
          priority="P2")

    # 2h. 2xx response missing schema
    success_codes = [c for c in codes if c.startswith("2")]
    for sc in success_codes:
        if sc != "204":
            if not _resp_schema(resps, sc):
                Q("ambiguous_text", "Response",
                  f"Response {sc} của {label} không có schema",
                  "Consumer không biết cấu trúc data trả về",
                  f"Response {sc} của {label} trả về cấu trúc gì?",
                  "Bổ sung JSON Schema cho response body")
                break

    # 2i. 2xx response missing Content-Type
    for sc in success_codes:
        if sc != "204":
            if not _resp_content_types(resps, sc):
                Q("ambiguous_text", "Response",
                  f"Response {sc} của {label} không khai báo Content-Type",
                  "Client không biết parse body theo format nào",
                  f"Response {sc} của {label} trả Content-Type gì?",
                  "Khai báo application/json trong response content")
            break

    # 2j. 204 No Content with content-type (incorrect)
    if "204" in codes:
        if _resp_content_types(resps, "204"):
            Q("contradiction", "Response",
              f"{label} response 204 khai báo Content-Type nhưng 204 không được có body",
              "Spec sai; clients sẽ cố parse body không tồn tại",
              f"Response 204 của {label} có thực sự trả body không?",
              "Xoá content khỏi 204 response hoặc đổi sang 200 nếu có body")

    # 2k. Error shape inconsistency within operation
    err_sets = _error_field_sets(resps)
    if len(err_sets) >= 2 and not all(s == err_sets[0] for s in err_sets[1:]):
        Q("contradiction", "Response",
          f"{label} có nhiều 4xx/5xx với error schema khác nhau",
          "Client phải parse nhiều format lỗi; dễ handle sai",
          f"Error body của các 4xx/5xx trong {label} có cùng schema không?",
          "Dùng error shape thống nhất: { code, message, details } cho tất cả lỗi")

    # 2l. POST 201 missing Location header
    if m == "post" and "201" in codes:
        hdrs_201 = _resp_headers(resps, "201")
        has_location = any(k.lower() == "location" for k in hdrs_201)
        if not has_location:
            Q("missing_required_rule", "Response",
              f"POST {path} trả 201 nhưng không có Location header",
              "Client không biết URL của resource vừa tạo",
              f"Response 201 của POST {path} có nên trả Location header (URL của resource mới) không?",
              "Trả Location: /resource/{id} trong 201 response headers",
              priority="P1")

    # 2m. GET missing Cache-Control/ETag header
    if m == "get" and success_codes:
        sc = success_codes[0]
        resp_hdrs = _resp_headers(resps, sc)
        has_cache = any(k.lower() in ("cache-control", "etag", "last-modified") for k in resp_hdrs)
        if not has_cache:
            Q("ambiguous_text", "Response",
              f"GET {path} response không có Cache-Control/ETag header",
              "Client không biết có cache response không; server bị overhit",
              f"GET {path} có cacheable không? Dùng ETag hay Cache-Control: max-age?",
              "Thêm Cache-Control hoặc ETag header vào GET response",
              priority="P2")

    # 2n. Array response not wrapped (bare array is bad practice)
    for sc in success_codes:
        schema = _resp_schema(resps, sc)
        if schema and schema.get("type") == "array":
            Q("ambiguous_text", "Response",
              f"Response {sc} của {label} trả bare array thay vì wrapped object",
              "Không thể thêm metadata (total, pagination) vào sau; breaking change",
              f"Response {sc} của {label} có nên wrap array trong object không?",
              "Dùng { data: [...], total: N, page: N } thay vì bare array")
            break

    # 2o. Response schema missing id field for resource responses
    for sc in success_codes:
        schema = _resp_schema(resps, sc)
        if schema and sc not in ("204",):
            fields = _schema_field_names(schema)
            fields_lower = {f.lower() for f in fields}
            if fields and not any(f in fields_lower for f in ("id", "uuid", "guid", "key", "_id")):
                Q("ambiguous_text", "Response",
                  f"Response {sc} của {label} không có id field",
                  "Client không biết định danh resource sau khi nhận response",
                  f"Response {sc} của {label} có trả id (hoặc uuid, guid) của resource không?",
                  "Bổ sung id field vào response schema")
                break

    # 2p. Response schema missing created_at/updated_at for resource types
    if m in ("get", "post", "put", "patch"):
        for sc in success_codes:
            schema = _resp_schema(resps, sc)
            if schema:
                fields_lower = {f.lower() for f in _schema_field_names(schema)}
                if fields_lower and not any(k in fields_lower for k in ("created_at", "createdat", "createtime", "created")):
                    Q("ambiguous_text", "Response",
                      f"Response {sc} của {label} không có created_at/updated_at",
                      "Client không biết resource được tạo/sửa khi nào; audit trail thiếu",
                      f"Response {sc} của {label} có trả created_at và updated_at không?",
                      "Bổ sung created_at và updated_at (ISO 8601) vào response schema")
                break

    # 2q. Long-running operation without 202 Accepted pattern
    if m == "post" and any(k in sl for k in ("import", "export", "generate", "process", "batch", "bulk", "upload", "async", "job")):
        if "202" not in codes:
            Q("missing_required_rule", "Response",
              f"POST {path} có vẻ là async/long-running nhưng không có 202 Accepted",
              "Client không biết có cần polling status hay không; sẽ timeout",
              f"POST {path} là async operation không? Nếu có, dùng 202 + polling hay webhook?",
              "Trả 202 Accepted với Location header trỏ đến job status endpoint",
              priority="P1")

    # =========================================================================
    # 3. AUTH
    # =========================================================================

    # 3a. No security scheme
    if not _has_security(op, doc_sec):
        Q("missing_required_rule", "Auth",
          f"{label} không có security scheme",
          "Không rõ endpoint có yêu cầu xác thực không",
          f"{label} có yêu cầu xác thực không? Scheme nào (Bearer, API key, OAuth2)?",
          "Áp dụng security scheme phù hợp",
          priority="P0")
    else:
        scheme_names = _security_scheme_names(op, doc_sec)
        for sname in scheme_names:
            sdef = schemes_def.get(sname) or {}
            stype = sdef.get("type", "")
            sin   = sdef.get("in", "")
            sscheme = sdef.get("scheme", "")

            # 3b. API key in query (security risk)
            if stype == "apiKey" and sin == "query":
                Q("missing_required_rule", "Auth",
                  f"Security scheme '{sname}' dùng API key trong query string",
                  "API key bị lộ trong URL, server logs, browser history; OWASP API7 risk",
                  f"API key của '{sname}' có thể chuyển sang header thay vì query param không?",
                  "Dùng header (X-API-Key) thay vì query param cho API key",
                  priority="P0")

            # 3c. OAuth2 without scopes
            if stype == "oauth2":
                flows = sdef.get("flows") or {}
                if not any((f.get("scopes") or {}) for f in flows.values() if isinstance(f, dict)):
                    Q("missing_required_rule", "Auth",
                      f"OAuth2 scheme '{sname}' không khai báo scope nào",
                      "Không rõ quyền tối thiểu cần thiết để gọi endpoint",
                      f"Scope nào cần để gọi {label}?",
                      f"Khai báo scopes trong flows của '{sname}'")

            # 3d. HTTP Basic Auth (security risk)
            if stype == "http" and sscheme == "basic":
                Q("missing_required_rule", "Auth",
                  f"{label} dùng HTTP Basic Auth",
                  "Basic Auth gửi credentials dạng base64; không an toàn nếu không có TLS",
                  f"{label} có cần dùng HTTP Basic Auth không? Có thể chuyển sang Bearer token không?",
                  "Dùng Bearer token (JWT) thay vì Basic Auth",
                  priority="P0")

    # 3e. No 403 Forbidden
    if _has_security(op, doc_sec) and "403" not in codes:
        Q("missing_required_rule", "Auth",
          f"{label} không có 403 Forbidden",
          "Không rõ endpoint phân quyền theo role không",
          f"{label} có trả 403 khi user đã xác thực nhưng không đủ quyền không?",
          "Khai báo 403 khi token hợp lệ nhưng thiếu role/permission")

    # =========================================================================
    # 4. LIFECYCLE
    # =========================================================================

    # 4a. DELETE — missing 200/204
    if m == "delete":
        if "200" not in codes and "204" not in codes:
            Q("missing_required_rule", "Lifecycle",
              f"DELETE {path} không có 200/204 response",
              "Client không biết xoá thành công trả code nào",
              f"DELETE {path} trả 200 hay 204 khi xoá thành công?",
              "Hard delete trả 204; soft delete trả 200 với trạng thái mới",
              priority="P0")

        # 4b. DELETE — soft vs hard
        if not any(k in sl for k in ("soft", "deactivat", "archive", "disable", "vô hiệu", "ẩn")):
            Q("ambiguous_text", "Lifecycle",
              f"DELETE {path} không nói rõ soft delete hay hard delete",
              "Client không biết resource còn truy cập được sau khi xoá hay không",
              f"DELETE {path} là xoá vĩnh viễn hay chỉ đánh dấu vô hiệu (soft delete)?",
              "Ghi rõ soft/hard delete và hành vi sau khi xoá trong description")

        # 4c. DELETE — cascade not documented
        if pparams and not any(k in sl for k in ("cascade", "related", "child", "dependent", "liên quan")):
            Q("ambiguous_text", "Lifecycle",
              f"DELETE {path} không mô tả cascade behavior",
              "Xoá resource cha có thể xoá hoặc orphan resource con; client không biết",
              f"DELETE {path} có xoá cascade các resource liên quan không?",
              "Ghi rõ cascade/restrict policy trong description",
              priority="P2")

    # 4d. PATCH — partial update not documented
    if m == "patch" and not any(k in sl for k in ("partial", "một phần", "cập nhật một", "fields")):
        Q("ambiguous_text", "Lifecycle",
          f"PATCH {path} không mô tả rõ partial update semantics",
          "Client không biết có cần gửi toàn bộ field hay chỉ field muốn sửa",
          f"PATCH {path} chỉ update field được gửi hay replace toàn bộ object?",
          "PATCH chỉ update field được gửi lên (RFC 7396 JSON Merge Patch)")

    # 4e. PUT — full replace not documented
    if m == "put" and not any(k in sl for k in ("replace", "full", "toàn bộ", "overwrite")):
        Q("ambiguous_text", "Lifecycle",
          f"PUT {path} không mô tả full replace semantics",
          "Client không biết PUT có xoá field không gửi lên không",
          f"PUT {path} là full replace (thiếu field → null/xoá) hay partial update?",
          "PUT là full replace; thiếu field optional sẽ bị set null")

    # 4f. POST — no side effect documented
    if m == "post" and not summ:
        Q("untestable_acceptance", "Lifecycle",
          f"POST {path} không mô tả side effect hay resource được tạo",
          "Không biết resource được tạo ở đâu; không verify được",
          f"POST {path} tạo resource gì? Có side effect gì (email, event, payment)?",
          "Bổ sung description mô tả resource được tạo và các side effect")

    # =========================================================================
    # 5. COLLECTION
    # =========================================================================

    if m == "get" and _is_list_endpoint(path, op):
        page_names = {"page", "limit", "offset", "cursor", "per_page", "pagesize", "page_size"}
        has_pag = any(str(p.get("name", "")).lower() in page_names for p in params)
        filter_names = {"filter", "search", "q", "query", "keyword"}
        has_filter = any(
            str(p.get("name", "")).lower() in filter_names
            or str(p.get("name", "")).lower().startswith("filter")
            or str(p.get("name", "")).lower().startswith("search")
            for p in params
        )
        sort_names = {"sort", "sort_by", "sortby", "order", "order_by", "orderby"}
        has_sort = any(str(p.get("name", "")).lower() in sort_names for p in params)

        # 5a. No pagination
        if not has_pag:
            Q("missing_required_rule", "Collection",
              f"GET {path} (list) không có pagination parameter",
              "Sẽ trả toàn bộ records; performance và timeout risk khi data lớn",
              f"GET {path} có hỗ trợ pagination không? Dùng page/limit hay cursor?",
              "Thêm page + limit; mặc định limit=20, max=100")

        # 5b. Pagination but no total count in response
        if has_pag:
            for sc in [c for c in codes if c.startswith("2")]:
                schema = _resp_schema(resps, sc)
                if schema:
                    fields_lower = {f.lower() for f in _schema_field_names(schema)}
                    if not any(k in fields_lower for k in ("total", "count", "total_count", "totalcount", "total_items")):
                        Q("missing_required_rule", "Collection",
                          f"GET {path} có pagination nhưng response không có total count",
                          "Client không biết có bao nhiêu trang; không render pagination UI được",
                          f"Response của GET {path} có trả total count (tổng số bản ghi) không?",
                          "Thêm total field vào response: { data: [...], total: N, page: N, limit: N }")
                    if not any(k in fields_lower for k in ("next", "prev", "previous", "links", "next_page", "prev_page", "next_cursor")):
                        Q("ambiguous_text", "Collection",
                          f"GET {path} có pagination nhưng response không có next/prev links",
                          "Client phải tự tính next page; không biết đã tới trang cuối chưa",
                          f"Response của GET {path} có trả next/prev links hoặc next_cursor không?",
                          "Thêm links.next và links.prev hoặc next_cursor vào response",
                          priority="P2")
                    break

        # 5c. No filter
        if not has_filter:
            Q("ambiguous_text", "Collection",
              f"GET {path} (list) không có filter parameter",
              "Client phải lấy toàn bộ rồi tự lọc; không scale được",
              f"GET {path} có hỗ trợ filter theo field không?",
              "Thêm filter params hoặc q= search param",
              priority="P2")

        # 5d. No sort
        if not has_sort:
            Q("ambiguous_text", "Collection",
              f"GET {path} (list) không có sort/order parameter",
              "Client không biết thứ tự kết quả mặc định",
              f"GET {path} có hỗ trợ sắp xếp không? Thứ tự mặc định là gì?",
              "Khai báo sort_by + order param; mặc định sort theo created_at DESC",
              priority="P2")

        # 5e. No Link header for pagination (RFC 5988)
        if has_pag:
            for sc in [c for c in codes if c.startswith("2")]:
                hdrs = _resp_headers(resps, sc)
                if not any(k.lower() == "link" for k in hdrs):
                    Q("ambiguous_text", "Collection",
                      f"GET {path} (paginated) response không có Link header (RFC 5988)",
                      "Hypermedia clients không navigate được qua pages",
                      f"GET {path} có trả Link header với rel=next/prev/last không?",
                      "Thêm Link header: <url?page=2>; rel=next, <url?page=1>; rel=prev",
                      priority="P2")
                break

    # =========================================================================
    # 6. RELIABILITY
    # =========================================================================

    # 6a. POST missing idempotency header
    if m == "post":
        idem_names = {"idempotency-key", "idempotency_key", "x-idempotency-key", "x-request-id"}
        if not _has_header_param(params, idem_names):
            Q("missing_required_rule", "Reliability",
              f"POST {path} không có idempotency key",
              "Double submission có thể tạo duplicate resource",
              f"POST {path} có cần Idempotency-Key header để tránh duplicate không?",
              "Thêm optional Idempotency-Key header; server bỏ qua duplicate trong TTL",
              priority="P2")

    # 6b. No timeout/retry contract
    if m in WRITE_METHODS and not any(k in sl for k in ("timeout", "retry", "thử lại")):
        ext = op.get("x-timeout") or op.get("x-retry-policy") or op.get("x-sla")
        if not ext:
            Q("ambiguous_text", "Reliability",
              f"{label} không có timeout/retry contract",
              "Client không biết timeout mong đợi; có thể retry không an toàn với mutating ops",
              f"{label} có timeout mặc định không? Khi timeout client có nên retry không?",
              "Khai báo timeout dự kiến trong description hoặc x-timeout extension",
              priority="P2")

    # 6c. PUT/PATCH missing concurrency token
    if m in ("put", "patch"):
        etag_names = {"if-match", "if-none-match", "etag", "version", "x-version", "if-unmodified-since"}
        has_etag = _has_header_param(params, etag_names) or \
                   any(str(p.get("name", "")).lower() in etag_names for p in params)
        if not has_etag:
            Q("missing_required_rule", "Reliability",
              f"{label} không có concurrency token (ETag/If-Match/version)",
              "Hai client cùng sửa một record gây lost-update",
              f"{label} có kiểm tra concurrency không? Có dùng ETag/If-Match/version không?",
              "Thêm If-Match header với ETag; trả 412 Precondition Failed khi conflict",
              priority="P2")
        # 6c2. 412 Precondition Failed not documented
        if not has_etag and "412" not in codes and m in ("put", "patch"):
            pass  # already covered above
        elif has_etag and "412" not in codes:
            Q("missing_required_rule", "Reliability",
              f"{label} có concurrency token nhưng không khai báo 412 Precondition Failed",
              "Client không biết xử lý khi ETag/version conflict",
              f"{label} có trả 412 khi If-Match không khớp không?",
              "Khai báo 412 response khi concurrency conflict xảy ra",
              priority="P1")

    # 6d. 429 missing Retry-After header
    if "429" in codes:
        hdrs_429 = _resp_headers(resps, "429")
        has_retry_after = any(k.lower() == "retry-after" for k in hdrs_429)
        if not has_retry_after:
            Q("missing_required_rule", "Reliability",
              f"{label} có 429 nhưng không có Retry-After header",
              "Client không biết chờ bao lâu trước khi retry",
              f"Response 429 của {label} có nên trả Retry-After header không?",
              "Thêm Retry-After: <seconds> vào 429 response headers",
              priority="P1")

    # =========================================================================
    # 7. COMPATIBILITY
    # =========================================================================

    # 7a. Deprecated without migration note
    if _deprecated_without_note(op):
        Q("missing_required_rule", "Compatibility",
          f"{label} deprecated nhưng không có migration guide",
          "Consumer không biết chuyển sang endpoint nào hoặc khi nào bị xoá",
          f"{label} deprecated — endpoint thay thế là gì? Timeline xoá bỏ khi nào?",
          "Thêm migration guide và link endpoint thay thế vào description; dùng x-sunset",
          priority="P0")

    # 7b. Deprecated without sunset date
    if op.get("deprecated") and not op.get("x-sunset") and not op.get("x-deprecation-date"):
        Q("missing_required_rule", "Compatibility",
          f"{label} deprecated nhưng không có sunset date (x-sunset)",
          "Consumer không biết deadline migration",
          f"{label} sẽ bị xoá khi nào? Có thể thêm x-sunset extension không?",
          "Thêm x-sunset: '2025-12-31' extension vào operation",
          priority="P1")

    # 7c. x-internal leak
    if op.get("x-internal") is True:
        Q("ambiguous_text", "Compatibility",
          f"{label} đánh dấu x-internal=true nhưng còn trong public spec",
          "Endpoint internal bị expose ra client ngoài",
          f"{label} có phải public endpoint không? Nếu internal thì loại khỏi public spec không?",
          "Lọc x-internal endpoints khỏi public spec khi generate",
          priority="P0")

    # 7d. No versioning indicator in path or header
    # (checked at cross-operation level)

    # =========================================================================
    # 8. OBSERVABILITY
    # =========================================================================

    # 8a. No summary/description
    if not summ:
        Q("untestable_acceptance", "Observability",
          f"{label} không có summary hoặc description",
          "Không rõ business intent; khó viết test case",
          f"Mục đích nghiệp vụ của {label} là gì?",
          "Thêm summary ngắn gọn mô tả operation",
          priority="P2")

    # 8b. No operationId
    if not op.get("operationId"):
        Q("ambiguous_text", "Observability",
          f"{label} không có operationId",
          "Client code generation sẽ dùng tên xấu; khó trace trong logs",
          f"operationId của {label} nên là gì?",
          "Thêm operationId theo convention: camelCase verb+Resource (listOrders, createOrder)",
          priority="P2")

    # 8c. No correlation ID in response headers
    for sc in [c for c in codes if c.startswith("2")]:
        resp_hdrs = _resp_headers(resps, sc)
        has_corr = any(k.lower() in CORRELATION_HEADERS for k in resp_hdrs)
        if not has_corr:
            Q("ambiguous_text", "Observability",
              f"{label} response {sc} không có correlation/trace header",
              "Không trace được request end-to-end; debug production khó",
              f"{label} có trả X-Request-ID hay X-Correlation-ID trong response header không?",
              "Thêm X-Request-ID vào tất cả response headers",
              priority="P2")
        break

    # 8d. Sensitive field in response
    for sc in [c for c in codes if c.startswith("2")]:
        schema = _resp_schema(resps, sc)
        sensitive = _walk_sensitive(schema)
        if sensitive:
            Q("missing_required_rule", "Observability",
              f"{label} response {sc} chứa field nhạy cảm: {', '.join(sensitive[:3])}",
              "Data nhạy cảm bị trả nguyên trong response; OWASP API3 risk",
              f"{label} có cần trả field {', '.join(sensitive[:3])} không? Có mask/redact không?",
              "Xoá hoặc mask field nhạy cảm; dùng writeOnly cho input-only fields",
              priority="P0")
        break

    # 8e. No tags
    if not op.get("tags"):
        Q("ambiguous_text", "Observability",
          f"{label} không có tags",
          "Khó nhóm và tìm endpoint trong UI/docs/client SDK",
          f"{label} thuộc nhóm chức năng nào?",
          "Thêm tags để nhóm endpoint theo domain/module",
          priority="P2")

    # 8f. No example in request body
    if m in WRITE_METHODS and op.get("requestBody"):
        rb = op.get("requestBody") or {}
        content = rb.get("content") or {}
        has_example = any(
            (v.get("example") or v.get("examples"))
            for v in content.values() if isinstance(v, dict)
        )
        if not has_example:
            Q("untestable_acceptance", "Observability",
              f"{label} requestBody không có example",
              "Developers không có example để gọi thử; test case phải tự đoán payload",
              f"Example payload cho {label} là gì?",
              "Thêm example hoặc examples vào requestBody.content",
              priority="P2")

    # =========================================================================
    # 9. SCHEMA QUALITY
    # =========================================================================

    # 9a. oneOf/anyOf without discriminator
    for location in ["requestBody", "responses"]:
        if location == "requestBody":
            schema = _rb_schema(op) if op.get("requestBody") else None
            if schema and ("oneOf" in schema or "anyOf" in schema):
                if not schema.get("discriminator"):
                    Q("ambiguous_text", "Schema Quality",
                      f"requestBody của {label} dùng oneOf/anyOf nhưng không có discriminator",
                      "Client không biết variant nào để gửi; code gen sẽ tạo Union type không dùng được",
                      f"requestBody của {label} có discriminator field nào để phân biệt variants không?",
                      "Thêm discriminator.propertyName để phân biệt oneOf/anyOf variants",
                      priority="P2")
        else:
            for sc in success_codes:
                schema = _resp_schema(resps, sc)
                if schema and ("oneOf" in schema or "anyOf" in schema):
                    if not schema.get("discriminator"):
                        Q("ambiguous_text", "Schema Quality",
                          f"Response {sc} của {label} dùng oneOf/anyOf nhưng không có discriminator",
                          "Client không biết variant nào nhận được; deserialize sẽ fail",
                          f"Response của {label} có discriminator field để phân biệt variants không?",
                          "Thêm discriminator.propertyName",
                          priority="P2")
                    break

    # 9b. additionalProperties not declared (open schema)
    schema = _rb_schema(op) if op.get("requestBody") else None
    if schema and schema.get("type") == "object" and "additionalProperties" not in schema:
        Q("ambiguous_text", "Schema Quality",
          f"requestBody schema của {label} không khai báo additionalProperties",
          "Server không rõ có reject unknown fields không; client có thể gửi thừa",
          f"requestBody của {label} có cho phép additional properties không?",
          "Khai báo additionalProperties: false nếu muốn strict; true nếu flexible",
          priority="P2")

    # =========================================================================
    # Build api_operation record
    # =========================================================================

    roles = []
    sec = op.get("security") if op.get("security") is not None else doc_sec
    for item in (sec or []):
        if isinstance(item, dict):
            roles.extend(item.keys())

    req_parts = []
    if op.get("requestBody"):
        rb = op.get("requestBody") or {}
        if rb.get("required"):
            req_parts.append("requestBody bắt buộc")
        cts = list((rb.get("content") or {}).keys())
        if cts:
            req_parts.append(f"Content-Type: {', '.join(cts)}")
    if not req_parts:
        req_parts = ["Không có requestBody"] if m not in WRITE_METHODS else ["requestBody: chưa khai báo"]

    resp_parts = [
        f"{c}: {((resps.get(c) or {}).get('description') or '')}" if (resps.get(c) or {}).get("description") else c
        for c in sorted(codes)
    ]

    return {
        "id": api_id,
        "semantic_key": f"api.{re.sub(r'[^\\w]', '_', (op.get('operationId') or f'{m}_{path}').lower())}",
        "operation_id": op.get("operationId") or f"{method.upper()}_{path}",
        "protocol": "REST",
        "method": method.upper(),
        "path": path,
        "roles": roles or ["Chưa xác định"],
        "request_contract": req_parts,
        "response_contract": resp_parts,
        "business_side_effects": [summ or "Chưa mô tả"],
        "cleanup": "Chưa tài liệu hoá" if m in MUTATING_METHODS else "Không áp dụng",
        "requirement_ids": [],
        "business_rule_ids": [],
        "validation_rule_ids": [],
        "dependency_ids": [],
        "fact_status": "verified" if not qa else "unresolved",
        "coverage_status": "not_covered",
        "source_ref": src,
        "source_excerpt": f"{method.upper()} {path} — {summ or 'no summary'}",
    }, qa


def summary_lower_contains(text: str, keywords: list[str]) -> bool:
    t = text.lower()
    return any(k in t for k in keywords)


# ---------------------------------------------------------------------------
# Review coverage
# ---------------------------------------------------------------------------

def _review_coverage(qa_items: list[dict]) -> list[dict]:
    cats  = {q["category"] for q in qa_items}
    bases = {q["basis"] for q in qa_items}
    first = {}
    for q in qa_items:
        if q["category"] not in first:
            first[q["category"]] = q["id"]

    area_cat = {
        "Scope and actors": None,
        "Entry and preconditions": "Auth",
        "Happy flow": None,
        "Alternate and exception flow": "Response",
        "Business rules": "Lifecycle",
        "States and transitions": "Lifecycle",
        "Roles and permissions": "Auth",
        "Input and validation": "Request",
        "Data lifecycle and persistence": "Lifecycle",
        "API and integration": None,
        "Error handling and recovery": "Response",
        "Concurrency and idempotency": "Reliability",
        "Security and privacy": "Auth",
        "Performance and capacity": "Collection",
        "UI UX and accessibility": None,
        "Audit logging and observability": "Observability",
        "Compatibility and migration": "Compatibility",
        "Testability and acceptance criteria": None,
    }
    na = {"Scope and actors", "UI UX and accessibility"}
    result = []
    for area in REVIEW_AREAS:
        if area in na:
            result.append({"area": area, "status": "not_applicable"})
            continue
        cat = area_cat.get(area)
        if cat and cat in cats:
            entry: dict = {"area": area, "status": "blocked"}
            if first.get(cat):
                entry["blocked_by"] = first[cat]
            result.append(entry)
        elif area == "Testability and acceptance criteria" and "untestable_acceptance" in bases:
            qa_ref = next((q["id"] for q in qa_items if q["basis"] == "untestable_acceptance"), None)
            result.append({"area": area, "status": "blocked", "blocked_by": qa_ref})
        else:
            result.append({"area": area, "status": "checked"})
    return result


# ---------------------------------------------------------------------------
# Cross-operation checks
# ---------------------------------------------------------------------------

def _cross_checks(
    all_ops: list[dict],
    qa_counter: list[int],
    paths: dict,
    doc: dict,
    source_name: str,
) -> list[dict]:
    extra: list[dict] = []

    def XQ(basis, cat, gap, risk, question, assumption, priority="P1"):
        qa_counter.append(1)
        idx = len(qa_counter)
        slug = re.sub(r"[^\w]", "-", gap[:28].lower())
        extra.append({
            "id": f"QA-API-{idx:03d}",
            "decision_key": f"api.global.{slug}-{idx}",
            "basis": basis,
            "impact_ids": ["GLOBAL"],
            "category": cat,
            "module_flow": "Toàn bộ API",
            "source_ref": source_name,
            "source_excerpt": "Document-level check",
            "ambiguity_gap": gap,
            "risk": risk,
            "question": question,
            "proposed_assumption": assumption,
            "owner": "Dev",
            "priority": priority,
            "status": "Open",
            "answer": "", "answer_source_ref": "", "answer_source_excerpt": "",
        })

    # X1. Missing servers[]
    if not doc.get("servers"):
        XQ("missing_required_rule", "Auth",
           "Spec không khai báo servers[] (base URL)",
           "Client không biết base URL; tools không generate client đúng",
           "Base URL của API là gì? Có môi trường staging và production khác nhau không?",
           "Khai báo servers[] với url và description cho từng môi trường",
           priority="P0")

    # X2. HTTP (non-HTTPS) server URL
    for server in (doc.get("servers") or []):
        url = server.get("url") or ""
        if url.startswith("http://") and "localhost" not in url and "127.0.0.1" not in url:
            XQ("missing_required_rule", "Auth",
               f"Server URL '{url}' dùng HTTP thay vì HTTPS",
               "Traffic không được mã hóa; credentials và data bị lộ; OWASP API risk",
               "API production có dùng HTTPS không? URL cần được cập nhật sang https://",
               "Chỉ dùng HTTPS cho production URLs; HTTP chỉ cho localhost",
               priority="P0")
            break

    # X3. Global error shape inconsistency
    err_field_sets: list[set[str]] = []
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        for meth, op in path_item.items():
            if meth.lower() not in HTTP_METHODS or not isinstance(op, dict):
                continue
            for code in _codes(op):
                if code.startswith(("4", "5")):
                    s = _resp_schema(_responses(op), code)
                    if s:
                        err_field_sets.append(_schema_field_names(s))
    unique_shapes = len({frozenset(s) for s in err_field_sets})
    if unique_shapes >= 3:
        XQ("contradiction", "Response",
           f"Có {unique_shapes} error schema khác nhau trên toàn spec",
           "Client phải parse nhiều format lỗi; dễ handle sai case",
           "Có chuẩn hóa một error schema chung cho toàn bộ 4xx/5xx không?",
           "Áp dụng: { code: string, message: string, details: object } cho tất cả lỗi")

    # X4. No API versioning
    all_paths = list(paths.keys())
    has_version_in_path = any(re.search(r"(?:^|/)v\d+(?:/|$)", p) for p in all_paths)
    has_version_in_server = any(
        re.search(r"(?:^|/)v(?:\d+|\{[^{}]+\})(?:/|$)", str(server.get("url", "")))
        for server in (doc.get("servers") or [])
        if isinstance(server, dict)
    )
    accept_version_params = False
    for path_item in paths.values():
        if isinstance(path_item, dict):
            for op in path_item.values():
                if isinstance(op, dict):
                    for p in _merged_params(path_item, op):
                        if str(p.get("name", "")).lower() in ("api-version", "x-api-version", "version"):
                            accept_version_params = True
    if not has_version_in_path and not has_version_in_server and not accept_version_params:
        XQ("missing_required_rule", "Compatibility",
           "API không có versioning strategy (không có /v1/ trong path hoặc version header)",
           "Khi API thay đổi breaking, tất cả client bị ảnh hưởng đồng thời",
           "API có chiến lược versioning không? URL versioning (/v1/) hay header versioning?",
           "Dùng URL versioning: /api/v1/resource (đơn giản và rõ ràng)",
           priority="P1")

    # X5. Naming convention inconsistency
    all_field_names: list[str] = []
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        for op in path_item.values():
            if isinstance(op, dict):
                rb_s = _rb_schema(op) if op.get("requestBody") else None
                if rb_s:
                    all_field_names.extend(_schema_field_names(rb_s))
    if all_field_names:
        camel_count = sum(1 for f in all_field_names if _is_camel(f) and "_" not in f)
        snake_count = sum(1 for f in all_field_names if "_" in f)
        total = len(all_field_names)
        if total >= 5 and camel_count > 0 and snake_count > 0:
            camel_pct = camel_count / total
            snake_pct = snake_count / total
            if 0.2 < camel_pct < 0.8 and 0.2 < snake_pct < 0.8:
                XQ("contradiction", "Compatibility",
                   "API dùng lẫn camelCase và snake_case trong field names",
                   "Client code gen không nhất quán; devs dễ nhầm",
                   "API có quy ước đặt tên field là camelCase hay snake_case?",
                   "Thống nhất một convention: camelCase (JSON REST standard) hoặc snake_case",
                   priority="P1")

    # X6. Missing global contact info
    info = doc.get("info") or {}
    if doc.get("x-require-contact") is True and not info.get("contact") and not info.get("x-contact"):
        XQ("ambiguous_text", "Observability",
           "Spec không có contact info (ai sở hữu API này?)",
           "Developer không biết liên hệ ai khi có vấn đề",
           "Ai là owner của API? Email/Slack/URL liên hệ là gì?",
           "Thêm info.contact với name, email, url vào spec",
           priority="P2")

    # X7. Missing license info
    if doc.get("x-public-api") is True and not info.get("license"):
        XQ("ambiguous_text", "Compatibility",
           "Spec không khai báo license",
           "Consumer không biết có được dùng API này không",
           "API có license gì? Có public/private restriction không?",
           "Thêm info.license với name và url",
           priority="P2")

    # X8. Missing global tags definition
    if doc.get("x-require-root-tags") is True and not doc.get("tags"):
        XQ("ambiguous_text", "Observability",
           "Spec không định nghĩa tags[] ở root level",
           "Tags trên operations không có description; docs không có grouping rõ ràng",
           "Các nhóm endpoint (tags) của API là gì? Mỗi tag có description gì?",
           "Khai báo tags[] ở root với name và description cho từng group",
           priority="P2")

    # X9. Missing CORS/OPTIONS documentation
    cors_documented = any("options" in (path_item or {}) for path_item in paths.values())
    cors_required = doc.get("x-cors-required") is True or doc.get("x-browser-consumers") is True
    if cors_required and not cors_documented:
        XQ("ambiguous_text", "Auth",
           "Spec không document CORS policy (không có OPTIONS operation)",
           "Frontend devs không biết CORS được phép origin nào; sẽ fail browser requests",
           "API có CORS policy không? Allowed origins là gì?",
           "Document CORS trong description hoặc thêm OPTIONS operation với Access-Control headers",
           priority="P2")

    # X10. Duplicate operationIds
    op_ids = []
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        for op in path_item.values():
            if isinstance(op, dict) and op.get("operationId"):
                op_ids.append(op["operationId"])
    dupes = [oid for oid, cnt in Counter(op_ids).items() if cnt > 1]
    if dupes:
        XQ("contradiction", "Observability",
           f"Có operationId bị trùng: {', '.join(dupes[:3])}",
           "Code gen sẽ fail; tools không phân biệt được operations",
           f"OperationId {', '.join(dupes[:3])} bị dùng nhiều lần — tên đúng là gì?",
           "Mỗi operationId phải unique trong toàn spec",
           priority="P0")

    return extra


# ---------------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------------

def analyse(document: dict, project: str, spec_path: str) -> dict:
    source_name = Path(str(spec_path).replace("\\", "/")).name or "openapi"
    paths      = document.get("paths") or {}
    doc_sec    = document.get("security") or []
    components = document.get("components") or {}
    info       = document.get("info") or {}

    all_ops: list[dict] = []
    all_qa:  list[dict] = []
    counter: list[int]  = []

    op_idx = 0
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(op, dict):
                continue
            op_idx += 1
            api_op, qa = _analyse_op(
                path, method.lower(), op, path_item,
                doc_sec, components, counter, op_idx, source_name,
            )
            all_ops.append(api_op)
            all_qa.extend(qa)

    all_qa.extend(_cross_checks(all_ops, counter, paths, document, source_name))

    by_p: dict[str, int] = {}
    by_c: dict[str, int] = {}
    for q in all_qa:
        by_p[q["priority"]] = by_p.get(q["priority"], 0) + 1
        by_c[q["category"]] = by_c.get(q["category"], 0) + 1

    open_qa = [q for q in all_qa if q["status"] == "Open"]
    terminal = "DONE" if not open_qa else "DONE_WITH_OPEN_QA"

    return {
        "schema_version": "3.0",
        "project": project,
        "spec_source": source_name,
        "openapi_version": document.get("openapi", "unknown"),
        "api_title": info.get("title", project),
        "api_version": info.get("version", "unknown"),
        "analysis_date": date.today().isoformat(),
        "executive_summary": (
            f"Phân tích tĩnh {len(all_ops)} operation từ '{info.get('title', project)}'. "
            f"Phát hiện {len(all_qa)} gap "
            f"({by_p.get('P0',0)} P0, {by_p.get('P1',0)} P1, {by_p.get('P2',0)} P2)."
        ),
        "api_operations": all_ops,
        "review_coverage": _review_coverage(all_qa),
        "questions": all_qa,
        "terminal_result": terminal,
        "summary": {
            "total_operations": len(all_ops),
            "total_qa_items": len(all_qa),
            "open_qa": len(open_qa),
            "by_priority": by_p,
            "by_category": by_c,
        },
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--project", default="")
    parser.add_argument("--output", default=".")
    args = parser.parse_args()

    try:
        spec_path = Path(args.input)
        document  = load_document(spec_path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

    project = args.project or (document.get("info") or {}).get("title") or spec_path.stem
    try:
        resolved_document = resolve_local_refs(document)
    except ValueError as exc:
        print(json.dumps({"error": str(exc), "terminal_result": "BLOCKED"}, ensure_ascii=False), file=sys.stderr)
        return 2
    result  = analyse(resolved_document, project, str(spec_path))

    out_dir  = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe     = re.sub(r"[^\w\-]", "_", project)
    out_file = out_dir / f"{safe}_API_Analysis_Source.json"
    out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(result["summary"], ensure_ascii=False, indent=2))
    print(f"\nTerminal result : {result['terminal_result']}")
    print(f"Output          : {out_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
