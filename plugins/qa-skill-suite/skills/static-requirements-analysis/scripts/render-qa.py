#!/usr/bin/env python3
import json
import re
import sys
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

ICON_RE = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]")
SENSITIVE_KEYS = {
    "password", "token", "access_token", "refresh_token", "api_key", "apikey",
    "client_secret", "cookie", "authorization", "secret",
}
REVIEW_AREAS = [
    "Scope and actors", "Entry and preconditions", "Happy flow",
    "Alternate and exception flow", "Business rules", "States and transitions",
    "Roles and permissions", "Input and validation", "Data lifecycle and persistence",
    "API and integration", "Error handling and recovery", "Concurrency and idempotency",
    "Security and privacy", "Performance and capacity", "UI UX and accessibility",
    "Audit logging and observability", "Compatibility and migration",
    "Testability and acceptance criteria",
]
AREA_VI = {
    "Scope and actors": "Phạm vi và vai trò",
    "Entry and preconditions": "Điểm vào và điều kiện tiên quyết",
    "Happy flow": "Luồng chính",
    "Alternate and exception flow": "Luồng thay thế và ngoại lệ",
    "Business rules": "Quy tắc nghiệp vụ",
    "States and transitions": "Trạng thái và chuyển trạng thái",
    "Roles and permissions": "Vai trò và phân quyền",
    "Input and validation": "Dữ liệu đầu vào và kiểm tra hợp lệ",
    "Data lifecycle and persistence": "Vòng đời và lưu trữ dữ liệu",
    "API and integration": "API và tích hợp",
    "Error handling and recovery": "Xử lý lỗi và khôi phục",
    "Concurrency and idempotency": "Đồng thời và chống xử lý lặp",
    "Security and privacy": "Bảo mật và quyền riêng tư",
    "Performance and capacity": "Hiệu năng và tải",
    "UI UX and accessibility": "UI UX và khả năng tiếp cận",
    "Audit logging and observability": "Nhật ký kiểm toán và khả năng theo dõi",
    "Compatibility and migration": "Tương thích và chuyển đổi dữ liệu",
    "Testability and acceptance criteria": "Khả năng kiểm thử và tiêu chí chấp nhận",
}
STATUS_VI = {
    "Open": "Mở", "Answered": "Đã trả lời", "Blocked": "Bị chặn", "Cancelled": "Đã huỷ",
    "checked": "Đã review", "blocked": "Bị chặn", "not_applicable": "Không áp dụng",
    "verified": "Đã xác nhận", "inferred": "Suy luận", "unresolved": "Chưa làm rõ",
}
QUESTION_HEADERS = [
    "Mã câu hỏi", "Decision key", "Loại gap", "Nhóm vấn đề", "Module / Luồng", "Nguồn",
    "ID bị ảnh hưởng", "Điểm chưa rõ / Thiếu", "Rủi ro nếu chưa trả lời", "Câu hỏi",
    "Giả định đề xuất", "Người trả lời", "Mức ưu tiên", "Trạng thái", "Câu trả lời", "Nguồn câu trả lời",
]
MATRIX_HEADERS = [
    "Requirement ID", "Business Goal / Mục tiêu", "Functional Requirement / Yêu cầu chức năng",
    "Business Rule / Quy tắc nghiệp vụ", "Validation Rule / Quy tắc kiểm tra",
    "Dependency / Phụ thuộc", "Risk / Rủi ro", "Missing Requirement / Yêu cầu còn thiếu",
    "Questions for BA/Dev / Câu hỏi BA/Dev", "Nguồn", "Trạng thái fact",
]
API_HEADERS = [
    "API ID", "Operation ID", "Protocol", "Method", "Path", "Vai trò",
    "Request contract", "Response contract", "Business side effects", "Cleanup",
    "Requirement IDs", "Coverage", "Nguồn",
]
FACT_STATUSES = {"verified", "inferred", "unresolved"}
SEMANTIC_COLLECTIONS = {
    "business_goals": ("statement",),
    "requirements": ("text", "requirement_type", "expected_behavior"),
    "business_rules": ("statement",),
    "validation_rules": ("field", "condition", "expected_error"),
    "dependencies": ("dependency_type", "target", "condition"),
    "risks": ("risk_type", "statement", "likelihood", "impact"),
    "api_operations": ("operation_id", "protocol", "method", "path", "cleanup", "coverage_status"),
}
NAVY = "17365D"
TEAL = "0F6B78"
LIGHT_TEAL = "DDEBF7"
PALE_BLUE = "EAF3F8"
WHITE = "FFFFFF"
GRID = Side(style="thin", color="D9E2F3")


def fail(message):
    raise SystemExit(message)


def clean(value, field="content"):
    text = str(value or "").strip()
    if ICON_RE.search(text):
        fail(f"{field} must not contain emoji or icons")
    return "\n".join(line.rstrip().rstrip(".") for line in text.splitlines())


def vi_status(value):
    return STATUS_VI.get(str(value or ""), clean(value))


def vi_area(value):
    return AREA_VI.get(str(value or ""), clean(value))


def is_placeholder(value):
    text = str(value or "").strip()
    return not text or bool(re.fullmatch(r"<[^<>]+>|\[?redacted\]?", text, re.I))


def reject_secrets(value, label="root"):
    if isinstance(value, list):
        for index, item in enumerate(value):
            reject_secrets(item, f"{label}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            current = f"{label}.{key}"
            if key.lower() in SENSITIVE_KEYS and not is_placeholder(item):
                fail(f"{current} must not contain a real credential")
            reject_secrets(item, current)


def slugify(value):
    text = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return text or "business"


def normalize_evidence_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def markdown_anchor(value):
    text = re.sub(r"[^\w\s-]", "", str(value or "").strip().casefold(), flags=re.UNICODE)
    return re.sub(r"[\s-]+", "-", text).strip("-")


def markdown_sections(content):
    sections = {}
    current = None
    for line in content.splitlines():
        heading = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if heading:
            current = markdown_anchor(heading.group(1))
            sections.setdefault(current, [])
        elif current is not None:
            sections[current].append(line)
    return {key: normalize_evidence_text("\n".join(lines)) for key, lines in sections.items()}


def load_source_documents(data, input_path):
    documents = {}
    for index, raw in enumerate(data.get("source_markdown") or []):
        value = str(raw or "").strip()
        if not value:
            fail(f"source_markdown[{index}] must not be empty")
        candidates = [Path(value)]
        if not Path(value).is_absolute():
            candidates.append(input_path.parent / value)
        source_path = next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)
        if source_path is None:
            fail(f"Source Markdown not found: {value}")
        if source_path.suffix.lower() not in {".md", ".markdown"}:
            fail(f"Source must be Markdown after conversion: {value}")
        key = source_path.name.casefold()
        if key in documents:
            fail(f"Duplicate source Markdown basename: {source_path.name}")
        raw_content = source_path.read_text(encoding="utf-8")
        documents[key] = {
            "path": source_path,
            "content": normalize_evidence_text(raw_content),
            "sections": markdown_sections(raw_content),
        }
    return documents


def validate_evidence(item, label, documents):
    source_ref = str(item.get("source_ref") or "").strip()
    excerpt = str(item.get("source_excerpt") or "").strip()
    if not source_ref:
        fail(f"{label}.source_ref is required")
    ref_parts = source_ref.split("#", 1)
    ref_file = ref_parts[0].replace("\\", "/")
    if Path(ref_file).is_absolute():
        fail(f"{label}.source_ref must be logical, not an absolute path")
    source = documents.get(Path(ref_file).name.casefold())
    if source is None:
        fail(f"{label}.source_ref does not match source_markdown: {source_ref}")
    if len(ref_parts) != 2 or not ref_parts[1].strip():
        fail(f"{label}.source_ref must include a Markdown heading anchor")
    anchor = markdown_anchor(ref_parts[1])
    if anchor not in source["sections"]:
        fail(f"{label}.source_ref heading was not found: {source_ref}")
    if not excerpt:
        fail(f"{label}.source_excerpt is required")
    normalized_excerpt = normalize_evidence_text(excerpt)
    if normalized_excerpt not in source["sections"][anchor]:
        fail(f"{label}.source_excerpt was not found under {source_ref}")


def validate_key(value, label):
    key = str(value or "").strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", key):
        fail(f"{label} must use lowercase letters, digits, dot, underscore or hyphen")
    return key


def validate_semantic_collection(data, field, required_fields, documents):
    items = data.get(field)
    if not isinstance(items, list):
        fail(f"{field} must be a list")
    ids = set()
    keys = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            fail(f"{field}[{index}] must be an object")
        label = f"{field}[{index}]"
        item_id = clean(item.get("id"), f"{label}.id")
        if not item_id:
            fail(f"{label}.id is required")
        if item_id in ids:
            fail(f"Duplicate {field} ID: {item_id}")
        ids.add(item_id)
        key = validate_key(item.get("semantic_key"), f"{label}.semantic_key")
        if key in keys:
            fail(f"Duplicate {field} semantic_key: {key}")
        keys.add(key)
        for required in required_fields:
            if not clean(item.get(required), f"{label}.{required}"):
                fail(f"{label}.{required} is required")
        status = str(item.get("fact_status") or "")
        if status not in FACT_STATUSES:
            fail(f"{label}.fact_status is invalid")
        validate_evidence(item, label, documents)
    return items, ids


def require_id_list(item, field, label, known_ids, allow_empty=True):
    values = item.get(field)
    if not isinstance(values, list) or (not allow_empty and not values):
        suffix = " and must not be empty" if not allow_empty else ""
        fail(f"{label}.{field} must be a list{suffix}")
    unknown = sorted(set(str(value) for value in values) - set(known_ids))
    if unknown:
        fail(f"{label}.{field} contains unknown IDs: {unknown}")
    return values


def normalize_questions(items, documents, known_impact_ids):
    questions = []
    seen = set()
    decision_keys = set()
    normalized_texts = set()
    for index, raw in enumerate(items or [], 1):
        item = dict(raw)
        qid = clean(item.get("id") or f"QA-{index:03d}", f"questions[{index}].id")
        if qid in seen:
            fail(f"Duplicate question ID: {qid}")
        seen.add(qid)
        item["id"] = qid
        item["priority"] = clean(item.get("priority") or "P2", f"{qid}.priority").upper()
        item["status"] = clean(item.get("status") or "Open", f"{qid}.status").title()
        if item["priority"] not in {"P0", "P1", "P2", "P3"}:
            fail(f"{qid}.priority must be P0, P1, P2 or P3")
        if item["status"] not in {"Open", "Answered", "Blocked", "Cancelled"}:
            fail(f"{qid}.status must be Open, Answered, Blocked or Cancelled")
        for required in ("category", "module_flow", "ambiguity_gap", "risk", "question", "proposed_assumption", "owner"):
            if not clean(item.get(required), f"{qid}.{required}"):
                fail(f"{qid}.{required} is required")
        answer = clean(item.get("answer"), f"{qid}.answer")
        if item["status"] in {"Open", "Blocked"}:
            if answer or clean(item.get("answer_source_ref")) or clean(item.get("answer_source_excerpt")):
                fail(f"{qid} must keep answer evidence empty while status is {item['status']}")
        if item["status"] == "Answered":
            if not answer:
                fail(f"{qid}.answer is required when status is Answered")
            answer_evidence = {
                "source_ref": item.get("answer_source_ref"),
                "source_excerpt": item.get("answer_source_excerpt"),
            }
            validate_evidence(answer_evidence, f"{qid}.answer", documents)
        decision_key = validate_key(item.get("decision_key"), f"{qid}.decision_key")
        if decision_key in decision_keys:
            fail(f"Duplicate question decision_key: {decision_key}")
        decision_keys.add(decision_key)
        item["decision_key"] = decision_key
        basis = str(item.get("basis") or "").strip()
        if basis not in {"ambiguous_text", "contradiction", "missing_required_rule", "untestable_acceptance", "unclear_ownership"}:
            fail(f"{qid}.basis is invalid")
        impact_ids = item.get("impact_ids")
        if not isinstance(impact_ids, list) or not impact_ids:
            fail(f"{qid}.impact_ids must contain at least one flow or requirement ID")
        unknown_impacts = sorted({str(value) for value in impact_ids} - known_impact_ids)
        if unknown_impacts:
            fail(f"{qid}.impact_ids contains unknown IDs: {unknown_impacts}")
        item["impact_ids"] = [clean(value, f"{qid}.impact_ids") for value in impact_ids]
        validate_evidence(item, qid, documents)
        normalized_question = normalize_evidence_text(item.get("question"))
        if normalized_question in normalized_texts:
            fail(f"Duplicate question text: {qid}")
        normalized_texts.add(normalized_question)
        questions.append(item)
    return questions


def validate(data, input_path):
    required_top = [
        "schema_version", "project", "scope", "analysis_date", "source_markdown", "executive_summary",
        "actors", "business_goals", "modules", "flow_links", "sanity_journeys", "requirements",
        "business_rules", "validation_rules", "dependencies", "risks", "api_operations",
        "cross_cutting", "review_coverage", "questions",
    ]
    for field in required_top:
        if field not in data or data[field] in (None, ""):
            fail(f"Missing required field: {field}")
    if str(data["schema_version"]) != "3.0":
        fail("schema_version must be 3.0")
    if not isinstance(data["source_markdown"], list) or not data["source_markdown"]:
        fail("source_markdown must be a non-empty list")
    documents = load_source_documents(data, input_path)
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(data["analysis_date"])):
        fail("analysis_date must use YYYY-MM-DD")
    for field in ("actors", "cross_cutting"):
        if not isinstance(data[field], list):
            fail(f"{field} must be a list")

    registries = {}
    registry_ids = {}
    for field, required_fields in SEMANTIC_COLLECTIONS.items():
        registries[field], registry_ids[field] = validate_semantic_collection(
            data, field, required_fields, documents
        )

    for index, goal in enumerate(registries["business_goals"]):
        if not isinstance(goal.get("success_metrics"), list):
            fail(f"business_goals[{index}].success_metrics must be a list")
    for index, requirement in enumerate(registries["requirements"]):
        label = f"requirements[{index}]"
        if requirement.get("requirement_type") not in {"functional", "non_functional"}:
            fail(f"{label}.requirement_type is invalid")
        if not isinstance(requirement.get("acceptance_criteria"), list):
            fail(f"{label}.acceptance_criteria must be a list")
        if not isinstance(requirement.get("human_confirmed"), bool):
            fail(f"{label}.human_confirmed must be boolean")
        require_id_list(requirement, "goal_ids", label, registry_ids["business_goals"])
        for field in ("flow_ids", "api_operation_ids"):
            if not isinstance(requirement.get(field), list):
                fail(f"{label}.{field} must be a list")
    for field in ("business_rules", "validation_rules"):
        for index, item in enumerate(registries[field]):
            require_id_list(item, "requirement_ids", f"{field}[{index}]", registry_ids["requirements"], allow_empty=False)
    for index, item in enumerate(registries["dependencies"]):
        if item.get("dependency_type") not in {"internal", "api", "data", "external", "configuration"}:
            fail(f"dependencies[{index}].dependency_type is invalid")
        if not isinstance(item.get("impacted_ids"), list) or not item["impacted_ids"]:
            fail(f"dependencies[{index}].impacted_ids must be a non-empty list")
    for index, item in enumerate(registries["risks"]):
        if item.get("risk_type") not in {"source_stated", "analysis_gap"}:
            fail(f"risks[{index}].risk_type is invalid")
        for field in ("likelihood", "impact"):
            if item.get(field) not in {"unknown", "low", "medium", "high"}:
                fail(f"risks[{index}].{field} is invalid")
        if not isinstance(item.get("impacted_ids"), list) or not item["impacted_ids"]:
            fail(f"risks[{index}].impacted_ids must be a non-empty list")
    for index, item in enumerate(registries["api_operations"]):
        label = f"api_operations[{index}]"
        if item.get("protocol") not in {"REST", "GraphQL", "gRPC", "webhook", "other"}:
            fail(f"{label}.protocol is invalid")
        if item.get("coverage_status") != "not_covered":
            fail(f"{label}.coverage_status must be not_covered for static analysis")
        for field in ("roles", "request_contract", "response_contract", "business_side_effects", "requirement_ids", "business_rule_ids", "validation_rule_ids", "dependency_ids"):
            if not isinstance(item.get(field), list):
                fail(f"{label}.{field} must be a list")

    coverage = data["review_coverage"]
    if not isinstance(coverage, list):
        fail("review_coverage must be a list")
    area_map = {item.get("area"): item for item in coverage if isinstance(item, dict)}
    if len(area_map) != len(coverage):
        fail("Review coverage contains duplicate or invalid area records")
    missing = [area for area in REVIEW_AREAS if area not in area_map]
    extra = [area for area in area_map if area not in REVIEW_AREAS]
    if missing or extra:
        fail(f"Review coverage mismatch; missing={missing}; extra={extra}")
    for area, item in area_map.items():
        status = str(item.get("status") or "").lower()
        if status not in {"checked", "blocked", "not_applicable"}:
            fail(f"{area}.status must be checked, blocked or not_applicable")
        if status in {"blocked", "not_applicable"} and not clean(item.get("notes"), f"{area}.notes"):
            fail(f"{area}.notes is required for {status}")
    if not isinstance(data["modules"], list):
        fail("modules must be a list")
    flow_ids = set()
    semantic_keys = set()
    for module_index, module in enumerate(data["modules"]):
        if not isinstance(module, dict):
            fail(f"modules[{module_index}] must be an object")
        for required in ("name", "purpose", "status", "source_ref"):
            if not clean(module.get(required), f"modules[{module_index}].{required}"):
                fail(f"modules[{module_index}].{required} is required")
        flows = module.get("flows")
        if not isinstance(flows, list):
            fail(f"modules[{module_index}].flows must be a list")
        for flow_index, flow in enumerate(flows):
            label = f"modules[{module_index}].flows[{flow_index}]"
            for field in ["id", "semantic_key", "name", "actor", "status", "source_ref", "source_excerpt", "entry_state", "exit_state", "trigger"]:
                if not str(flow.get(field) or "").strip():
                    fail(f"{label}.{field} is required")
            flow_id = clean(flow["id"], f"{label}.id")
            if flow_id in flow_ids:
                fail(f"Duplicate flow ID: {flow_id}")
            flow_ids.add(flow_id)
            semantic_key = validate_key(flow.get("semantic_key"), f"{label}.semantic_key")
            if semantic_key in semantic_keys:
                fail(f"Duplicate flow semantic_key: {semantic_key}")
            semantic_keys.add(semantic_key)
            validate_evidence(flow, label, documents)
            if str(flow.get("status")) not in {"verified", "inferred", "unresolved"}:
                fail(f"{label}.status is invalid")
            for field in ["preconditions", "steps", "outcomes", "alternate_flows", "exceptions", "requirement_ids", "business_rule_ids", "validation_rule_ids", "dependency_ids", "api_operation_ids", "sanity_checks", "unresolved"]:
                if not isinstance(flow.get(field), list):
                    fail(f"{label}.{field} must be a list")
            if not flow["steps"] or not flow["outcomes"] or not flow["sanity_checks"]:
                fail(f"{label} must contain sourced steps, outcomes and sanity_checks")
            for step_index, step in enumerate(flow["steps"]):
                step_label = f"{label}.steps[{step_index}]"
                for required in ("id", "action", "system_response", "state_change", "fact_status", "source_ref", "source_excerpt"):
                    if not clean(step.get(required), f"{step_label}.{required}"):
                        fail(f"{step_label}.{required} is required")
                if step["fact_status"] not in FACT_STATUSES:
                    fail(f"{step_label}.fact_status is invalid")
                validate_evidence(step, step_label, documents)

    known_ids = set(flow_ids)
    for ids in registry_ids.values():
        known_ids.update(ids)
    for index, requirement in enumerate(registries["requirements"]):
        require_id_list(requirement, "flow_ids", f"requirements[{index}]", flow_ids)
        require_id_list(requirement, "api_operation_ids", f"requirements[{index}]", registry_ids["api_operations"])
    for index, item in enumerate(registries["dependencies"]):
        require_id_list(item, "impacted_ids", f"dependencies[{index}]", known_ids, allow_empty=False)
    for index, item in enumerate(registries["risks"]):
        require_id_list(item, "impacted_ids", f"risks[{index}]", known_ids, allow_empty=False)
    for index, item in enumerate(registries["api_operations"]):
        label = f"api_operations[{index}]"
        require_id_list(item, "requirement_ids", label, registry_ids["requirements"])
        require_id_list(item, "business_rule_ids", label, registry_ids["business_rules"])
        require_id_list(item, "validation_rule_ids", label, registry_ids["validation_rules"])
        require_id_list(item, "dependency_ids", label, registry_ids["dependencies"])
    for module_index, module in enumerate(data["modules"]):
        for flow_index, flow in enumerate(module["flows"]):
            label = f"modules[{module_index}].flows[{flow_index}]"
            require_id_list(flow, "requirement_ids", label, registry_ids["requirements"])
            require_id_list(flow, "business_rule_ids", label, registry_ids["business_rules"])
            require_id_list(flow, "validation_rule_ids", label, registry_ids["validation_rules"])
            require_id_list(flow, "dependency_ids", label, registry_ids["dependencies"])
            require_id_list(flow, "api_operation_ids", label, registry_ids["api_operations"])
    if not isinstance(data["flow_links"], list):
        fail("flow_links must be a list")
    for index, link in enumerate(data["flow_links"]):
        if link.get("from_flow") not in flow_ids or link.get("to_flow") not in flow_ids:
            fail(f"flow_links[{index}] references an unknown flow")
        if link.get("status") not in FACT_STATUSES:
            fail(f"flow_links[{index}].status is invalid")
        validate_evidence(link, f"flow_links[{index}]", documents)
    if not isinstance(data["sanity_journeys"], list):
        fail("sanity_journeys must be a list")
    if flow_ids and not data["sanity_journeys"]:
        fail("sanity_journeys must contain at least one path when flows exist")
    if not flow_ids and data["sanity_journeys"]:
        fail("sanity_journeys must be empty when no flows exist")
    for journey_index, journey in enumerate(data["sanity_journeys"]):
        sequence = journey.get("flow_sequence")
        if not isinstance(sequence, list) or not sequence:
            fail(f"sanity_journeys[{journey_index}].flow_sequence must be non-empty")
        for step_index, step in enumerate(sequence):
            if step.get("flow_id") not in flow_ids:
                fail(f"sanity_journeys[{journey_index}].flow_sequence[{step_index}] references an unknown flow")
            if not clean(step.get("transition_condition")) or not clean(step.get("checkpoint")):
                fail(f"sanity_journeys[{journey_index}].flow_sequence[{step_index}] requires transition_condition and checkpoint")
    questions = normalize_questions(data["questions"], documents, known_ids)
    question_ids = {item["id"] for item in questions}
    active_question_ids = {item["id"] for item in questions if item["status"] in {"Open", "Blocked"}}
    for area, item in area_map.items():
        ids = item.get("question_ids") or []
        if not isinstance(ids, list):
            fail(f"{area}.question_ids must be a list")
        unknown = sorted(set(ids) - question_ids)
        if unknown:
            fail(f"{area}.question_ids contains unknown IDs: {unknown}")
        status = str(item.get("status") or "").lower()
        if status == "blocked" and not ids:
            fail(f"{area}.question_ids is required when status is blocked")
        if status == "blocked" and not set(ids).issubset(active_question_ids):
            fail(f"{area}.question_ids must reference active Open or Blocked questions")
        if status == "not_applicable" and ids:
            fail(f"{area}.question_ids must be empty when status is not_applicable")
    reject_secrets(data)
    completion = "DONE_WITH_OPEN_QA" if any(item["status"] in {"Open", "Blocked"} for item in questions) else "DONE"
    return questions, completion


def md_cell(value):
    return clean(value).replace("|", "\\|").replace("\n", "<br>") or ""


def question_row(item):
    return [
        item["id"], clean(item.get("decision_key")), clean(item.get("basis")),
        clean(item.get("category")), clean(item.get("module_flow")), clean(item.get("source_ref")),
        ", ".join(item.get("impact_ids") or []),
        clean(item.get("ambiguity_gap")), clean(item.get("risk")),
        clean(item.get("question")), clean(item.get("proposed_assumption")), clean(item.get("owner")),
        item["priority"], vi_status(item["status"]), clean(item.get("answer")), clean(item.get("answer_source_ref")),
    ]


def linked_text(items, predicate, value_field):
    values = []
    for item in items:
        if predicate(item):
            values.append(f"{item['id']}: {clean(item.get(value_field))}")
    return "\n".join(values)


def requirement_matrix_rows(data, questions):
    goals = {item["id"]: item for item in data["business_goals"]}
    rows = []
    for requirement in data["requirements"]:
        requirement_id = requirement["id"]
        goal_text = "\n".join(
            f"{goal_id}: {clean(goals[goal_id].get('statement'))}"
            for goal_id in requirement.get("goal_ids") or []
        )
        rules = linked_text(data["business_rules"], lambda item: requirement_id in item.get("requirement_ids", []), "statement")
        validations = linked_text(data["validation_rules"], lambda item: requirement_id in item.get("requirement_ids", []), "condition")
        dependencies = linked_text(data["dependencies"], lambda item: requirement_id in item.get("impacted_ids", []), "target")
        risks = linked_text(data["risks"], lambda item: requirement_id in item.get("impacted_ids", []), "statement")
        impacted_questions = [item for item in questions if requirement_id in item.get("impact_ids", [])]
        missing = "\n".join(
            f"{item['id']}: {clean(item.get('ambiguity_gap'))}"
            for item in impacted_questions
            if item.get("basis") in {"missing_required_rule", "untestable_acceptance", "unclear_ownership"}
        )
        question_text = "\n".join(
            f"{item['id']} [{clean(item.get('owner'))}]: {clean(item.get('question'))}"
            for item in impacted_questions
        )
        req_text = f"[{requirement['requirement_type']}] {clean(requirement.get('text'))}"
        rows.append([
            requirement_id, goal_text, req_text, rules, validations, dependencies, risks,
            missing, question_text, clean(requirement.get("source_ref")), vi_status(requirement.get("fact_status")),
        ])
    return rows


def api_row(item):
    return [
        item["id"], clean(item.get("operation_id")), clean(item.get("protocol")), clean(item.get("method")),
        clean(item.get("path")), "\n".join(item.get("roles") or []),
        "\n".join(item.get("request_contract") or []), "\n".join(item.get("response_contract") or []),
        "\n".join(item.get("business_side_effects") or []), clean(item.get("cleanup")),
        ", ".join(item.get("requirement_ids") or []), clean(item.get("coverage_status")), clean(item.get("source_ref")),
    ]


def write_markdown(data, questions, completion, output_path):
    priority_counts = Counter(item["priority"] for item in questions)
    status_counts = Counter(vi_status(item["status"]) for item in questions)
    lines = [
        f"# Bộ câu hỏi nghiệp vụ — {clean(data['project'], 'project')}", "",
        "## Thông tin phân tích", "",
        f"- Dự án: {clean(data['project'])}",
        f"- Phạm vi: {clean(data['scope'])}",
        f"- Ngày phân tích: {clean(data['analysis_date'])}",
        f"- Kết quả: {completion}", "",
        "## Tóm tắt", "", clean(data.get("executive_summary") or "Chưa có nội dung tóm tắt được xác nhận"), "",
        "## Tổng quan câu hỏi", "",
        "| Tổng số | P0 | P1 | P2 | P3 | Mở | Đã trả lời | Bị chặn | Đã huỷ |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        f"| {len(questions)} | {priority_counts['P0']} | {priority_counts['P1']} | {priority_counts['P2']} | {priority_counts['P3']} | {status_counts['Mở']} | {status_counts['Đã trả lời']} | {status_counts['Bị chặn']} | {status_counts['Đã huỷ']} |",
        "", "## Phạm vi review", "",
        "| Hạng mục | Trạng thái | Ghi chú | Mã câu hỏi |",
        "|---|---|---|---|",
    ]
    for item in data["review_coverage"]:
        ids = ", ".join(item.get("question_ids") or [])
        lines.append(
            f"| {md_cell(vi_area(item.get('area')))} | {md_cell(vi_status(item.get('status')))} | "
            f"{md_cell(item.get('notes'))} | {md_cell(ids)} |"
        )
    matrix_rows = requirement_matrix_rows(data, questions)
    lines.extend([
        "", f"## Ma trận yêu cầu ({len(matrix_rows)})", "",
        "| " + " | ".join(MATRIX_HEADERS) + " |",
        "|" + "|".join(["---"] * len(MATRIX_HEADERS)) + "|",
    ])
    for row in matrix_rows:
        lines.append("| " + " | ".join(md_cell(value) for value in row) + " |")
    lines.extend([
        "", f"## API operations ({len(data['api_operations'])})", "",
        "| " + " | ".join(API_HEADERS) + " |",
        "|" + "|".join(["---"] * len(API_HEADERS)) + "|",
    ])
    for item in data["api_operations"]:
        lines.append("| " + " | ".join(md_cell(value) for value in api_row(item)) + " |")
    lines.extend(["", f"## Danh sách câu hỏi ({len(questions)})", ""])
    if not questions:
        lines.extend(["Chưa xác định câu hỏi cần làm rõ", ""])
    for item in questions:
        lines.extend([
            f"### {item['id']} — {clean(item.get('category') or 'Chung')}", "",
            f"- Decision key: {clean(item.get('decision_key'))}",
            f"- Loại gap: {clean(item.get('basis'))}",
            f"- Module / Luồng: {clean(item.get('module_flow'))}",
            f"- Nguồn: {clean(item.get('source_ref'))}",
            f"- ID bị ảnh hưởng: {', '.join(item.get('impact_ids') or [])}",
            f"- Điểm chưa rõ / Thiếu: {clean(item.get('ambiguity_gap'))}",
            f"- Rủi ro nếu chưa trả lời: {clean(item.get('risk'))}",
            f"- Câu hỏi: {clean(item.get('question'))}",
            f"- Giả định đề xuất: {clean(item.get('proposed_assumption'))}",
            f"- Người trả lời: {clean(item.get('owner'))}",
            f"- Mức ưu tiên: {item['priority']}",
            f"- Trạng thái: {vi_status(item['status'])}",
            f"- Câu trả lời: {clean(item.get('answer'))}",
            f"- Nguồn câu trả lời: {clean(item.get('answer_source_ref'))}", "",
        ])
    output_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def style_header(ws, row=1, fill_color=NAVY):
    ws.row_dimensions[row].height = 32
    for cell in ws[row]:
        cell.fill = PatternFill("solid", fgColor=fill_color)
        cell.font = Font(color=WHITE, bold=True, size=11)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = Border(bottom=Side(style="medium", color=TEAL))


def style_body(ws, start_row=2):
    for row_index, row in enumerate(ws.iter_rows(min_row=start_row), start_row):
        ws.row_dimensions[row_index].height = 54
        fill = PatternFill("solid", fgColor=WHITE if row_index % 2 == 0 else PALE_BLUE)
        for cell in row:
            cell.fill = fill
            cell.border = Border(left=GRID, right=GRID, top=GRID, bottom=GRID)
            cell.alignment = Alignment(vertical="top", wrap_text=True)


def add_table(ws, display_name, ref):
    table = Table(displayName=display_name, ref=ref)
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False,
        showRowStripes=True, showColumnStripes=False,
    )
    ws.add_table(table)


def write_excel(data, questions, completion, output_path):
    wb = Workbook()
    overview = wb.active
    overview.title = "Tổng quan"
    overview.sheet_view.showGridLines = False
    overview.sheet_view.zoomScale = 90
    overview.sheet_properties.tabColor = NAVY
    overview.merge_cells("A1:D1")
    overview["A1"] = f"PHÂN TÍCH NGHIỆP VỤ — {clean(data['project']).upper()}"
    overview["A1"].fill = PatternFill("solid", fgColor=NAVY)
    overview["A1"].font = Font(color=WHITE, bold=True, size=16)
    overview["A1"].alignment = Alignment(horizontal="center", vertical="center")
    overview.row_dimensions[1].height = 34
    meta = [
        ("Dự án", clean(data["project"])), ("Phạm vi", clean(data["scope"])),
        ("Ngày phân tích", clean(data["analysis_date"])), ("Kết quả", completion),
    ]
    for row_index, (label, value) in enumerate(meta, 3):
        overview.cell(row_index, 1, label)
        overview.cell(row_index, 2, value)
        overview.merge_cells(start_row=row_index, start_column=2, end_row=row_index, end_column=4)
        overview.cell(row_index, 1).fill = PatternFill("solid", fgColor=LIGHT_TEAL)
        overview.cell(row_index, 1).font = Font(bold=True, color=NAVY)
        overview.cell(row_index, 2).alignment = Alignment(vertical="top", wrap_text=True)
        overview.row_dimensions[row_index].height = 38 if label == "Phạm vi" else 24
        for col in range(1, 5):
            overview.cell(row_index, col).border = Border(left=GRID, right=GRID, top=GRID, bottom=GRID)
    overview.merge_cells("A7:D7")
    overview["A7"] = "THỐNG KÊ CÂU HỎI"
    overview["A7"].font = Font(bold=True, size=12, color=NAVY)
    overview["A7"].fill = PatternFill("solid", fgColor=LIGHT_TEAL)
    overview["A7"].alignment = Alignment(horizontal="center", vertical="center")
    overview.row_dimensions[7].height = 26
    stats = [
        ("Tổng số", len(questions), TEAL),
        ("P0", sum(q["priority"] == "P0" for q in questions), "C00000"),
        ("P1", sum(q["priority"] == "P1" for q in questions), "F4B183"),
        ("P2", sum(q["priority"] == "P2" for q in questions), "FFD966"),
        ("P3", sum(q["priority"] == "P3" for q in questions), "A9D18E"),
        ("Mở", sum(q["status"] == "Open" for q in questions), "FFF2CC"),
        ("Đã trả lời", sum(q["status"] == "Answered" for q in questions), "C6E0B4"),
        ("Bị chặn", sum(q["status"] == "Blocked" for q in questions), "F8CBAD"),
    ]
    for idx, (label, value, color) in enumerate(stats):
        row = 8 + idx // 4 * 3
        col = 1 + idx % 4
        overview.cell(row, col, label)
        overview.cell(row + 1, col, value)
        overview.cell(row, col).fill = PatternFill("solid", fgColor=color)
        overview.cell(row, col).font = Font(bold=True, color=NAVY)
        overview.cell(row + 1, col).font = Font(bold=True, size=16, color=NAVY)
        overview.cell(row, col).alignment = overview.cell(row + 1, col).alignment = Alignment(horizontal="center")
        overview.cell(row, col).border = Border(left=GRID, right=GRID, top=GRID, bottom=GRID)
        overview.cell(row + 1, col).border = Border(left=GRID, right=GRID, top=GRID, bottom=GRID)
    for row in (1, 7):
        for col in range(1, 5):
            overview.cell(row, col).border = Border(left=GRID, right=GRID, top=GRID, bottom=GRID)
    overview.column_dimensions["A"].width = 24
    for col in "BCD":
        overview.column_dimensions[col].width = 30
    overview.freeze_panes = "A3"

    ws = wb.create_sheet("Q&A")
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 80
    ws.sheet_properties.tabColor = TEAL
    ws.append(QUESTION_HEADERS)
    for item in questions:
        ws.append(question_row(item))
    style_header(ws)
    style_body(ws)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:P{max(ws.max_row, 1)}"
    widths = [14, 28, 24, 26, 28, 30, 28, 38, 38, 48, 38, 18, 12, 16, 42, 30]
    for index, width in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + index)].width = width
    if ws.max_row >= 2:
        add_table(ws, "BangCauHoiNghiepVu", f"A1:P{ws.max_row}")
    priority_dv = DataValidation(type="list", formula1='"P0,P1,P2,P3"', allow_blank=False)
    status_dv = DataValidation(type="list", formula1='"Mở,Đã trả lời,Bị chặn,Đã huỷ"', allow_blank=False)
    ws.add_data_validation(priority_dv)
    ws.add_data_validation(status_dv)
    priority_dv.add(f"M2:M{max(ws.max_row, 1000)}")
    status_dv.add(f"N2:N{max(ws.max_row, 1000)}")
    color_rules = [
        ('$M2="P0"', "F4CCCC"), ('$M2="P1"', "FCE4D6"),
        ('$M2="P2"', "FFF2CC"), ('$M2="P3"', "E2F0D9"),
        ('$N2="Đã trả lời"', "C6E0B4"), ('$N2="Bị chặn"', "F8CBAD"),
    ]
    for formula, color in color_rules:
        ws.conditional_formatting.add(
            f"A2:P{max(ws.max_row, 2)}",
            FormulaRule(formula=[formula], fill=PatternFill("solid", fgColor=color)),
        )

    matrix = wb.create_sheet("Ma trận yêu cầu")
    matrix.sheet_view.showGridLines = False
    matrix.sheet_view.zoomScale = 75
    matrix.sheet_properties.tabColor = "70AD47"
    matrix.append(MATRIX_HEADERS)
    for row in requirement_matrix_rows(data, questions):
        matrix.append(row)
    style_header(matrix, fill_color=TEAL)
    style_body(matrix)
    matrix.freeze_panes = "A2"
    matrix.auto_filter.ref = f"A1:K{max(matrix.max_row, 1)}"
    for index, width in enumerate([18, 34, 42, 38, 38, 32, 36, 38, 46, 30, 18], 1):
        matrix.column_dimensions[chr(64 + index)].width = width
    if matrix.max_row >= 2:
        add_table(matrix, "BangMaTranYeuCau", f"A1:K{matrix.max_row}")

    api = wb.create_sheet("API operations")
    api.sheet_view.showGridLines = False
    api.sheet_view.zoomScale = 75
    api.sheet_properties.tabColor = "ED7D31"
    api.append(API_HEADERS)
    for item in data["api_operations"]:
        api.append(api_row(item))
    style_header(api, fill_color=TEAL)
    style_body(api)
    api.freeze_panes = "A2"
    api.auto_filter.ref = f"A1:M{max(api.max_row, 1)}"
    for index, width in enumerate([16, 24, 14, 12, 30, 24, 42, 42, 42, 24, 28, 18, 30], 1):
        api.column_dimensions[chr(64 + index)].width = width
    if api.max_row >= 2:
        add_table(api, "BangAPIRequirements", f"A1:M{api.max_row}")

    coverage = wb.create_sheet("Phạm vi review")
    coverage.sheet_view.showGridLines = False
    coverage.sheet_view.zoomScale = 85
    coverage.sheet_properties.tabColor = "5B9BD5"
    coverage.append(["Hạng mục", "Trạng thái", "Ghi chú", "Mã câu hỏi"])
    for item in data["review_coverage"]:
        coverage.append([
            vi_area(item.get("area")), vi_status(item.get("status")), clean(item.get("notes")),
            ", ".join(item.get("question_ids") or []),
        ])
    style_header(coverage, fill_color=TEAL)
    style_body(coverage)
    coverage.freeze_panes = "A2"
    coverage.auto_filter.ref = f"A1:D{coverage.max_row}"
    for letter, width in zip("ABCD", [38, 18, 68, 24]):
        coverage.column_dimensions[letter].width = width
    if coverage.max_row >= 2:
        add_table(coverage, "BangPhamViReview", f"A1:D{coverage.max_row}")
    wb.save(output_path)


def normalized_excel_row(row):
    return ["" if value is None else value for value in row]


def check_outputs(md_path, xlsx_path, data, questions, completion):
    markdown = md_path.read_text(encoding="utf-8")
    md_ids = re.findall(r"^### (QA-[A-Za-z0-9_-]+)\s+—", markdown, flags=re.M)
    md_details = {}
    current_id = None
    for line in markdown.splitlines():
        heading = re.match(r"^### (QA-[A-Za-z0-9_-]+)\s+—", line)
        if heading:
            current_id = heading.group(1)
            md_details[current_id] = {}
        elif current_id and line.startswith("- Nguồn: "):
            md_details[current_id]["source_ref"] = line.removeprefix("- Nguồn: ")
        elif current_id and line.startswith("- ID bị ảnh hưởng: "):
            md_details[current_id]["impact_ids"] = line.removeprefix("- ID bị ảnh hưởng: ")
    completion_match = re.search(r"^- Kết quả: (DONE|DONE_WITH_OPEN_QA)$", markdown, flags=re.M)
    if not completion_match:
        fail("Q&A Markdown is missing a terminal analysis result")
    wb = load_workbook(xlsx_path, read_only=True, data_only=False)
    required = {"Tổng quan", "Q&A", "Ma trận yêu cầu", "API operations", "Phạm vi review"}
    if not required.issubset(set(wb.sheetnames)):
        fail("Q&A workbook is missing required Vietnamese sheets")
    ws = wb["Q&A"]
    headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    if headers != QUESTION_HEADERS:
        fail("Q&A workbook headers do not match the Vietnamese contract")
    xlsx_ids = [row[0] for row in ws.iter_rows(min_row=2, values_only=True) if row[0]]
    if md_ids != xlsx_ids:
        fail(f"Question ID mismatch: markdown={md_ids}, excel={xlsx_ids}")
    xlsx_details = {
        row[0]: {"source_ref": str(row[5] or ""), "impact_ids": str(row[6] or "")}
        for row in ws.iter_rows(min_row=2, values_only=True) if row[0]
    }
    if md_details != xlsx_details:
        fail(f"Question provenance mismatch: markdown={md_details}, excel={xlsx_details}")
    expected_question_rows = [question_row(item) for item in questions]
    actual_question_rows = [normalized_excel_row(row) for row in ws.iter_rows(min_row=2, values_only=True) if row[0]]
    if actual_question_rows != expected_question_rows:
        fail("Q&A workbook content does not match canonical analysis JSON")
    for item in questions:
        expected_lines = [
            f"- Điểm chưa rõ / Thiếu: {clean(item.get('ambiguity_gap'))}",
            f"- Rủi ro nếu chưa trả lời: {clean(item.get('risk'))}",
            f"- Câu hỏi: {clean(item.get('question'))}",
            f"- Giả định đề xuất: {clean(item.get('proposed_assumption'))}",
            f"- Người trả lời: {clean(item.get('owner'))}",
            f"- Câu trả lời: {clean(item.get('answer'))}",
        ]
        if any(line not in markdown for line in expected_lines):
            fail(f"Q&A Markdown content mismatch for {item['id']}")

    matrix = wb["Ma trận yêu cầu"]
    matrix_headers = [cell.value for cell in next(matrix.iter_rows(min_row=1, max_row=1))]
    if matrix_headers != MATRIX_HEADERS:
        fail("Requirement matrix headers do not match the contract")
    expected_matrix = requirement_matrix_rows(data, questions)
    actual_matrix = [normalized_excel_row(row) for row in matrix.iter_rows(min_row=2, values_only=True) if row[0]]
    if actual_matrix != expected_matrix:
        fail("Requirement matrix content does not match canonical analysis JSON")
    for row in expected_matrix:
        if "| " + " | ".join(md_cell(value) for value in row) + " |" not in markdown:
            fail(f"Requirement matrix Markdown mismatch for {row[0]}")

    api = wb["API operations"]
    api_headers = [cell.value for cell in next(api.iter_rows(min_row=1, max_row=1))]
    if api_headers != API_HEADERS:
        fail("API operation headers do not match the contract")
    expected_api = [api_row(item) for item in data["api_operations"]]
    actual_api = [normalized_excel_row(row) for row in api.iter_rows(min_row=2, values_only=True) if row[0]]
    if actual_api != expected_api:
        fail("API operation content does not match canonical analysis JSON")
    for row in expected_api:
        if "| " + " | ".join(md_cell(value) for value in row) + " |" not in markdown:
            fail(f"API operation Markdown mismatch for {row[0]}")

    coverage = wb["Phạm vi review"]
    expected_coverage = [[
        vi_area(item.get("area")), vi_status(item.get("status")), clean(item.get("notes")),
        ", ".join(item.get("question_ids") or []),
    ] for item in data["review_coverage"]]
    actual_coverage = [normalized_excel_row(row) for row in coverage.iter_rows(min_row=2, values_only=True) if row[0]]
    if actual_coverage != expected_coverage:
        fail("Review coverage content does not match canonical analysis JSON")
    overview = wb["Tổng quan"]
    if overview["B6"].value != completion_match.group(1) or completion_match.group(1) != completion:
        fail("Terminal analysis result mismatch between Markdown and Excel")
    print(f"Q&A PASS: {md_path} and {xlsx_path} with questions={len(md_ids)}; requirements={len(expected_matrix)}; api_operations={len(expected_api)}")


def main():
    args = sys.argv[1:]
    if args and args[0] == "--check":
        if len(args) != 4:
            fail("Usage: render-qa.py --check <qa.md> <qa.xlsx> <analysis.json>")
        analysis_path = Path(args[3]).resolve()
        data = json.loads(analysis_path.read_text(encoding="utf-8"))
        questions, completion = validate(data, analysis_path)
        check_outputs(Path(args[1]).resolve(), Path(args[2]).resolve(), data, questions, completion)
        return
    if len(args) < 2:
        fail("Usage: render-qa.py <analysis.json> <output-dir> [base-name]")
    input_path = Path(args[0]).resolve()
    output_dir = Path(args[1]).resolve()
    data = json.loads(input_path.read_text(encoding="utf-8"))
    questions, completion = validate(data, input_path)
    base = args[2] if len(args) > 2 else slugify(data["project"])
    output_dir.mkdir(parents=True, exist_ok=True)
    md_path = output_dir / f"{base}_Q&A.md"
    xlsx_path = output_dir / f"{base}_Q&A.xlsx"
    write_markdown(data, questions, completion, md_path)
    write_excel(data, questions, completion, xlsx_path)
    check_outputs(md_path, xlsx_path, data, questions, completion)
    print(f"Q&A MARKDOWN WRITTEN: {md_path}")
    print(f"Q&A EXCEL WRITTEN: {xlsx_path}")
    print(f"ANALYSIS COMPLETION: {completion}")


if __name__ == "__main__":
    main()
