#!/usr/bin/env python3
"""Validate cross-model hard gates shared by QA-skill entrypoints."""

from pathlib import Path
import ast
import json
import sys


ROOT = Path(__file__).resolve().parents[1]

REQUIRED = {
    "AGENTS.md": [
        "Cross-model deterministic mode",
        "PASS → `Done`",
        "FAILED → `In Progress`",
        "BLOCKED → giữ nguyên trạng thái",
        "Bug mới → `Todo`",
        "RETEST_PLUS",
        "google-drive-qa/SKILL.md",
        "plane-qa/SKILL.md",
        "import-api-spec.py",
        "review_required",
        "write-business-guide.mjs",
        "Markdown trước Excel",
        "app-business-guide.md",
        "business-analysis/SKILL.md",
    ],
    "GEMINI.md": [
        "Cross-model deterministic mode",
        "PASS → `Done`",
        "RETEST_PLUS",
        "google-drive-qa/SKILL.md",
        "plane-qa/SKILL.md",
        "import-api-spec.py",
        "review_required",
        "write-business-guide.mjs",
        "Markdown trước Excel",
        "APP_BASELINE_DISCOVERY",
        "business-analysis/SKILL.md",
    ],
    ".github/copilot-instructions.md": [
        "RETEST_PLUS",
        "PASS moves to `Done`",
        "Drive MCP",
        "no terminal `.` and no emoji/icon",
        "import-api-spec.py",
        "same-basename Markdown before Excel",
        "write-business-guide.mjs",
        "app-business-guide.md",
        "18 areas",
    ],
    "MODEL-COMPATIBILITY.md": [
        "Retest <Plane URL>",
        "Test feature này không có doc/testcase",
        "Update Google Sheet <URL>",
        "Static check",
        "Viết testcase API từ swagger.json",
        "Tạo Markdown testcase đầy đủ trước Excel",
        "business flow XMind",
    ],
    "qa-run/SKILL.md": [
        "Cross-model hard gates",
        "Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX",
        "PASS → Done",
        "FAILED → In Progress",
        "references/KNOWLEDGE_HANDOFF.md",
        "scripts/write-business-guide.mjs",
        "qa-knowledge/",
        "APP_BASELINE_DISCOVERY",
        "coverage_map",
    ],
    "testcase-template/SKILL.md": [
        "Cross-model hard gates",
        "Không đặt dấu `.`",
        "Không chèn emoji/icon",
        "chỉ dùng API mode khi user yêu cầu rõ viết testcase API",
        "references/api-testcases.md",
        "scripts/import-api-spec.py",
        "references/markdown-testcases.md",
        "tạo `<output>.md` trước `<output>.xlsx`",
    ],
    "plane-qa/SKILL.md": [
        "Cross-model hard gates",
        "PASS → Done",
        "FAILED → In Progress",
        "new bug → Todo",
    ],
    "plane-qa/comments/post-result.py": [
        '"PASS": "Done"',
        '"FAILED": "In Progress"',
        "clean_sentence",
    ],
    "google-drive-qa/SKILL.md": [
        "Cross-model hard gates",
        "google-drive` MCP",
        "Read the affected object back",
    ],
    "testcase-template/scripts/gen-testcases.py": [
        "def human_text",
        "def render_api_case",
        "ICON_RE",
        "SENSITIVE_HEADER_NAMES",
        "SENSITIVE_PAYLOAD_KEYS",
        "expected_status",
        "rstrip('.')",
        "def ensure_group_capacity",
        "def write_testcase_markdown",
        "Generated Markdown first",
    ],
    "testcase-template/scripts/import-api-spec.py": [
        "def extract_openapi",
        "def extract_postman",
        "def extract_generic",
        "def extract_text",
        "review_required",
        "default-success-status",
    ],
    "testcase-template/references/api-testcases.md": [
        "Đọc file này chỉ khi user yêu cầu rõ viết testcase API",
        "Không tạo phần thứ ba",
        "Không đưa token, password, cookie hoặc API key thật",
    ],
    "testcase-template/references/markdown-testcases.md": [
        "Mỗi lần generate Excel, tạo Markdown",
        "Testcase ID giống Excel",
        "Không mở Excel chỉ để hiểu testcase design",
    ],
    "qa-run/references/KNOWLEDGE_HANDOFF.md": [
        "qa-knowledge/<feature-slug>-business-guide.md",
        "Trước khi test",
        "Sau khi test",
        "verified",
        "inferred",
        "unresolved",
        "app-business-guide.md",
        "coverage_map",
    ],
    "qa-run/scripts/write-business-guide.mjs": [
        "BUSINESS GUIDE WRITTEN",
        "BUSINESS GUIDE PASS",
        "Latest QA run",
        "qa-knowledge",
        "merge_confirmed",
        "app guide requires a non-empty coverage_map",
    ],
    "business-analysis/SKILL.md": [
        "doc-to-md/scripts/convert.sh",
        "18 areas",
        "Business_Flow.xmind",
        "_Q&A.md",
        "_Q&A.xlsx",
        "_Analysis_Source.json",
        ".business-analysis",
        "flow_links",
        "sanity_journeys",
        "scripts/generate.sh",
    ],
    "business-analysis/references/SENIOR_REVIEW_CHECKLIST.md": [
        "Scope and actors",
        "Security and privacy",
        "Concurrency and idempotency",
        "Testability and acceptance criteria",
    ],
    "business-analysis/scripts/render-qa.py": [
        "REVIEW_AREAS",
        "QUESTION_HEADERS",
        "Question ID mismatch",
        "must not contain a real credential",
    ],
    "business-analysis/scripts/render-xmind.mjs": [
        "parseXMindMarkToXMindFile",
        "Kịch bản sanity end-to-end",
        "Chi tiết và liên kết chức năng",
        "relationshipMarkers",
        "XMIND PASS",
    ],
    "business-analysis/examples/sample-analysis.json": [
        "\"review_coverage\"",
        "\"QA-001\"",
        "\"questions\"",
        "\"flow_links\"",
        "\"sanity_journeys\"",
    ],
    "testcase-template/examples/sample-api-input.json": [
        '"kind": "api"',
        '"expected_status": 200',
        '"password": "<valid_password>"',
    ],
    "scripts/setup_lib.sh": [
        '"plane-qa"',
        '"google-drive-qa"',
        "PyYAML",
    ],
}


def main():
    failures = []
    for relative, needles in REQUIRED.items():
        path = ROOT / relative
        if not path.is_file():
            failures.append(f"missing file: {relative}")
            continue
        text = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                failures.append(f"{relative}: missing contract token {needle!r}")

    for relative in (
        "plane-qa/comments/post-result.py",
        "plane-qa/comments/post-inline.py",
        "plane-qa/utils/inline_image.py",
        "google-drive-qa/scripts/drive_auth_doctor.py",
        "google-drive-qa/scripts/drive_upload.py",
        "testcase-template/scripts/gen-testcases.py",
        "testcase-template/scripts/import-api-spec.py",
        "business-analysis/scripts/render-qa.py",
    ):
        path = ROOT / relative
        if path.is_file():
            try:
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError as exc:
                failures.append(f"{relative}: syntax error: {exc}")

    for relative in (
        "testcase-template/examples/sample-input.json",
        "testcase-template/examples/sample-api-input.json",
        "business-analysis/examples/sample-analysis.json",
        "business-analysis/package.json",
    ):
        path = ROOT / relative
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"{relative}: invalid JSON: {exc}")

    if failures:
        print("CROSS-MODEL CONTRACT FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"CROSS-MODEL CONTRACT PASS: {len(REQUIRED)} entrypoints checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
