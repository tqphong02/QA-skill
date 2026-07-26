#!/usr/bin/env python3
"""Validate cross-model hard gates shared by QA-skill entrypoints."""

from pathlib import Path
import ast
import json
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

SKILLS = (
    "accessibility-qa",
    "ai-quality-qa",
    "api-contract-qa",
    "business-analysis",
    "data-quality-qa",
    "doc-to-md",
    "github-mcp-qa",
    "google-drive-qa",
    "mobile-qa",
    "pentest-run",
    "performance-qa",
    "plane-qa",
    "playwright-pom-automation",
    "qa-run",
    "testcase-template",
)

REQUIRED = {
    "AGENTS.md": [
        "Cross-model deterministic mode",
        "URL/artifact-first dispatch",
        "Chỉ có Plane URL hoặc ticket ID",
        "Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID",
        "link đứng một mình không cấp quyền write",
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
        "pentest-run/SKILL.md",
        ".pentest/engagement.md",
        "Chrome DevTools MCP",
        "Postman MCP",
        "mcp_not_configured",
        "`DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Sheet execution = Sheet Testcase Execution + Sanity + Impacted Regression + `DISCOVERY_CORE`",
        "context-builder.mjs",
        "Business Execution Brief là `READY`",
        "Không được tự thay business flow thiếu bằng flow generic",
        "`performance-qa` là public skill duy nhất cho performance",
    ],
    "GEMINI.md": [
        "Cross-model deterministic mode",
        "URL/artifact-first dispatch",
        "Chỉ có Plane URL hoặc ticket ID",
        "Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID",
        "link đứng một mình không cấp quyền write",
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
        "pentest-run/SKILL.md",
        ".pentest/engagement.md",
        "Chrome DevTools MCP",
        "Postman MCP",
        "mcp_not_configured",
        "`DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Sheet execution = Sheet Testcase Execution + Sanity + Impacted Regression + `DISCOVERY_CORE`",
        "context-builder.mjs",
        "Business Execution Brief là `READY`",
        "Không được tự thay business flow thiếu bằng flow generic",
        "`performance-qa` là public skill duy nhất cho performance",
    ],
    ".github/copilot-instructions.md": [
        "bare Plane URL/ticket ID",
        "bare Drive/Docs/Sheets/Slides URL/ID",
        "bare link authorizes read-only inspection only",
        "RETEST_PLUS",
        "PASS moves to `Done`",
        "Drive MCP",
        "no terminal `.` and no emoji/icon",
        "import-api-spec.py",
        "same-basename Markdown before Excel",
        "write-business-guide.mjs",
        "app-business-guide.md",
        "18 areas",
        "pentest-run",
        "control comparison",
        "Chrome DevTools or k6 MCP",
        "exact failing layer",
        "`DISCOVERY_CORE` is Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Sheet execution composes Sheet Testcase Execution + Sanity + Impacted Regression",
        "context-builder.mjs",
        "READY` Business Execution Brief",
        "never replace missing business logic with a generic flow",
        "JMeter, `.jmx`, JTL and k6 all use the single public `performance-qa`",
    ],
    "MODEL-COMPATIBILITY.md": [
        "| `<Plane URL>`",
        "| `<Plane ticket ID>`",
        "| `<Drive/Docs/Sheets/Slides URL>`",
        "Retest <Plane URL>",
        "Test feature này không có doc/testcase",
        "Update Google Sheet <URL>",
        "Static check",
        "Viết testcase API từ swagger.json",
        "Tạo Markdown testcase đầy đủ trước Excel",
        "business flow XMind",
        "Pentest target này",
        "Kết nối Chrome DevTools MCP",
        "Kết nối Postman MCP",
        "Kết nối database MCP",
        "Audit accessibility trang login",
        "Đánh giá chatbot RAG",
        "Test mobile app trên Android và iOS",
        "Tạo JMeter JMX cho API",
        "GitHub MCP đã có skill nhưng không dùng được",
        "Cài riêng qa-run cho intern",
    ],
    "PENTEST-RUN-GUIDE.md": [
        "Engagement contract bắt buộc",
        "pentest-run/scripts/doctor.sh",
        "Level 2",
        "control comparison",
        "PentesterFlow",
        "SECURITY_TOOLS_DIR",
        "source_available",
        "RECON_SKILLS_DIR",
        "DockerScan `v2.1.0`",
        ".pentest/evidence/",
    ],
    "qa-run/SKILL.md": [
        "Cross-model hard gates",
        "Workflow composition router",
        "DISCOVERY_CORE =",
        "RETEST_PLUS =",
        "SHEET_EXECUTION_PLUS =",
        "Create a ledger row for every expanded layer",
        "Never load or expose `vendor/**/SKILL.md`",
        "a Plane ticket URL with validation language",
        "Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX",
        "PASS → Done",
        "FAILED → In Progress",
        "scripts/writers/write-business-guide.mjs",
        "qa-knowledge/",
        "APP_BASELINE_DISCOVERY",
        "coverage_map",
        "Business Execution Brief",
        "context-builder.mjs",
        "No normal browser action is allowed",
        "run-manifest.mjs` must reject",
    ],
    "qa-run/references/RETEST-PLUS.md": [
        "RETEST_PLUS composes `Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE`",
        "Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "do not auto-run full-app baselines",
        "scripts/writers/write-business-guide.mjs",
    ],
    "qa-run/references/PROCESS-GUIDE.md": [
        "DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "RETEST_PLUS",
        "SHEET_EXECUTION_PLUS",
        "Full-app Business Discovery is reserved for `APP_BASELINE_DISCOVERY`",
    ],
    "qa-run/references/TESTCASE_SHEET_SCHEMA.json": [
        '"name": "SHEET_EXECUTION_PLUS"',
        '"Scoped Business Discovery"',
        '"Original Retest only for rows linked to a Plane ticket or previous failure"',
        '"Do not comment or change Plane state without an exact ticket"',
    ],
    "testcase-template/SKILL.md": [
        "Cross-model hard gates",
        "No trailing `.`",
        "No emoji/icons",
        "only use API mode when user explicitly requests writing API testcases",
        "references/api-testcases.md",
        "scripts/import-api-spec.py",
        "references/markdown-testcases.md",
        "create `<output>.md` before `<output>.xlsx`",
    ],
    "plane-qa/SKILL.md": [
        "Cross-model hard gates",
        "A Plane URL or ticket ID by itself is a complete read request",
        "plane-qa read → qa-run RETEST_PLUS → plane-qa comment/state",
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
        "A Drive URL or ID by itself is a complete safe-read request",
        "bare URL authorizes read-only inspection, not mutation",
        "google-drive` MCP",
        "references/GOOGLE_CLOUD_OAUTH_SETUP.md",
        "Read the affected object back",
    ],
    "google-drive-qa/references/GOOGLE_CLOUD_OAUTH_SETUP.md": [
        "Google Auth Platform",
        "`Internal`",
        "`External`",
        "`Desktop app`",
        "https://www.googleapis.com/auth/drive",
        "drive,documents,spreadsheets,presentations",
        "~/.config/google-drive-mcp/gcp-oauth.keys.json",
        "Antigravity IDE",
        "Kiểm tra read-only",
        "Testing tạo refresh token có thể hết hạn sau 7 ngày",
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
        "business-execution-brief.json",
        "NEEDS_DISCOVERY",
        "missing_required",
    ],
    "qa-run/references/INTELLIGENCE-BOOST.md": [
        "context-builder.mjs",
        "business-execution-brief.json",
        "NEEDS_DISCOVERY",
        "Never replace a missing field with a generic five-step flow",
        "scripts/writers/write-business-guide.mjs",
    ],
    "qa-run/references/PIPELINE.md": [
        "Business Context Gate (context-builder.mjs)",
        "Manifest Initializer (run-manifest.mjs)",
    ],
    "qa-run/scripts/helpers/context-builder.mjs": [
        "never invents fallback flows",
        "knowledge-index.json",
        "Business Execution Brief",
        "READY",
        "NEEDS_DISCOVERY",
        "BLOCKED",
        "missing_required",
        "source_files",
        "execution_contract",
    ],
    "qa-run/scripts/helpers/run-manifest.mjs": [
        "business execution brief is missing",
        "businessContext.status !== 'READY'",
        "SCOPED_BUSINESS_DISCOVERY",
        "business_context",
    ],
    "qa-run/scripts/writers/write-business-guide.mjs": [
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
        "TIMELINE_HORIZONTAL",
        "Luồng hệ thống",
        "buildUnifiedMark",
        "flowOccurrences",
        "branch = 'folded'",
        "sheetFromMark",
        "Unified XMind relationship mismatch",
        "XMIND PASS",
    ],
    "business-analysis/examples/sample-analysis.json": [
        "\"review_coverage\"",
        "\"QA-001\"",
        "\"questions\"",
        "\"flow_links\"",
        "\"sanity_journeys\"",
    ],
    "pentest-run/SKILL.md": [
        "references/ENGAGEMENT_CONTRACT.md",
        "references/TOOL_ROUTING.md",
        "references/FINDING_FORMAT.md",
        "scripts/doctor.sh",
        ".pentest/engagement.md",
        "Level 2",
        "Candidate",
        "/yolo",
        "control comparison",
        "source_available",
        "available",
    ],
    "pentest-run/references/TOOL_ROUTING.md": [
        "PentesterFlow",
        "recon-skills",
        "Raccoon",
        "DockerScan",
        "GhidraGPT",
        "https://github.com/PentesterFlow/agent",
        "SECURITY_TOOLS_DIR",
        "source_available",
    ],
    "pentest-run/references/ENGAGEMENT_CONTRACT.md": [
        "Exact targets",
        "Explicit exclusions",
        "Maximum request rate",
        "Approval record",
    ],
    "pentest-run/references/FINDING_FORMAT.md": [
        "Expected secure behavior",
        "Control comparison",
        "Rollback result",
        "Candidate",
    ],
    "pentest-run/scripts/doctor.sh": [
        "PentesterFlow",
        "Raccoon",
        "Nmap",
        "GNU timeout",
        "DockerScan",
        "Ghidra headless",
        "RECON_SKILLS_DIR",
        "BURP_JAR",
        "SECURITY_TOOLS_DIR",
        "resolve_security_tools_dir",
        "probe_source",
        "source_available",
        "local_tool_paths",
        "path=",
    ],
    "testcase-template/examples/sample-api-input.json": [
        '"kind": "api"',
        '"expected_status": 200',
        '"password": "<valid_password>"',
    ],
    "scripts/setup_lib.sh": [
        '"plane-qa"',
        '"google-drive-qa"',
        '"pentest-run"',
        "PyYAML",
        "resolve_target_agent",
        "resolve_skills_dir",
        "${CODEX_HOME:-$HOME/.codex}/skills",
        "$HOME/.gemini/config/skills",
        "--exclude='qa-knowledge'",
        "--exclude='vendor'",
        "--exclude='tests'",
        "-mindepth 2 -type f -name 'SKILL.md' -delete",
        'RETIRED_SKILLS=("jmeter-qa")',
        "retire_legacy_skills",
    ],
    "performance-qa/SKILL.md": [
        "references/MCP_SETUP.md",
        "Use one public skill and two internal engines",
        "performance_orchestrator.py doctor",
        "concurrent-users",
        "request-rate",
        "total-iterations",
        "--approve-load",
        "--approve-high-load",
        "--approve-production",
        "summary.html",
        "result.json",
    ],
    "performance-qa/scripts/performance_orchestrator.py": [
        "BLOCKED_SMOKE_FAILED",
        "APPROVAL_REQUIRED",
        "runtime_missing",
        "smokeCommand",
        "mainCommand",
        "compare_results",
    ],
    "performance-qa/scripts/adapters/jmeter_adapter.py": [
        "generated-test-plan.jmx",
        "JTHREADS=1",
        "Existing JMX was copied",
    ],
    "performance-qa/scripts/adapters/k6_adapter.py": [
        "constant-arrival-rate",
        "shared-iterations",
        "ramping-vus",
        "K6_WEB_DASHBOARD_EXPORT",
    ],
    "performance-qa/scripts/parsers/jtl_parser.py": [
        "parse_jtl",
        "endpoints[:10]",
    ],
    "performance-qa/scripts/parsers/k6_parser.py": [
        "parse_k6",
        "http_req_duration",
    ],
    "performance-qa/references/COMMON_CONFIG.md": [
        "The common YAML is the only user-facing configuration",
        "authorizationReference",
        "abortConditions",
    ],
    "performance-qa/schemas/run-config.schema.json": [
        '"concurrent-users"',
        '"request-rate"',
        '"total-iterations"',
    ],
    "performance-qa/schemas/result.schema.json": [
        '"PASS"',
        '"FAIL"',
        '"BLOCKED"',
    ],
    "performance-qa/references/MCP_SETUP.md": [
        "chrome-devtools-mcp@latest",
        "k6 x mcp",
        "doctor-stack.sh",
    ],
    "api-contract-qa/SKILL.md": [
        "references/POSTMAN_MCP.md",
        "doctor-stack.sh postman",
    ],
    "api-contract-qa/references/POSTMAN_MCP.md": [
        "https://mcp.postman.com/minimal",
        "codex mcp login postman",
        "mcp_not_loaded",
    ],
    "data-quality-qa/SKILL.md": [
        "references/DATABASE_MCP.md",
        "proof of read-only access",
    ],
    "data-quality-qa/references/DATABASE_MCP.md": [
        "DBHub",
        "readonly = true",
        "mongodb-mcp-server@latest --readOnly",
        "read-only account",
    ],
    "github-mcp-qa/scripts/doctor-stack.sh": [
        "mcp_not_configured",
        "runtime_missing",
        "--agent",
        "MANUAL",
    ],
    "scripts/setup.sh": [
        "--agent",
        "--profile",
        "sync_profile_visibility",
        "resolve_target_agent",
        "resolve_skills_dir",
        "resolve_profile",
    ],
    "scripts/setup.ps1": [
        'ValidateSet("codex", "antigravity", "claude")',
        'ValidateSet("core", "full")',
        "Git\\bin\\bash.exe",
        '"--agent=$Agent"',
        '"--profile=$Profile"',
    ],
    "SETUP-GUIDE.md": [
        "--only=qa-run --skip-deps --yes",
        "không làm xuất hiện thêm các skill `understand-*`",
    ],
    "README.md": [
        "Cấp đúng 1 skill cho intern",
        "--only=qa-run --skip-deps --yes",
    ],
    "scripts/doctor-codex.sh": [
        "${CODEX_HOME:-$HOME/.codex}/skills",
        "codex mcp list",
        "MANUAL",
    ],
    "scripts/doctor-antigravity.sh": [
        "$HOME/.gemini/config/skills",
        ".agents/mcp_config.json",
        "/skills rồi /mcp",
    ],
    "github-mcp-qa/scripts/doctor-codex.sh": [
        "https://api.githubcopilot.com/mcp/",
        "mcp_not_configured",
    ],
    "github-mcp-qa/scripts/doctor-antigravity.sh": [
        ".agents/mcp_config.json",
        'server.get("disabled", False)',
        "MANUAL run /mcp",
    ],
    "github-mcp-qa/references/antigravity-github-mcp-vi.md": [
        "~/.gemini/config/mcp_config.json",
        ".agents/mcp_config.json",
        '"disabled": false',
        "/mcp",
    ],
    "WINDOWS-SETUP.md": [
        "setup.ps1 -Agent codex",
        "setup.ps1 -Agent antigravity",
        "%USERPROFILE%\\.codex\\skills",
        "%USERPROFILE%\\.gemini\\config\\skills",
    ],
    "doc-to-md/scripts/convert.sh": [
        '"${1:-}"',
        "sys.argv[1]",
        "sys.argv[2]",
    ],
    "playwright-pom-automation/assets/templates/tests/performance/k6-load-test.js": [
        "PERFORMANCE_CONTRACT",
        "K6_LOAD_APPROVED",
        "target: 1",
        "authorization_reference",
        "abort_conditions",
    ],
    "playwright-pom-automation/assets/templates/package.json": [
        '"@axe-core/playwright"',
    ],
}

LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def validate_local_links(path, failures):
    text = path.read_text(encoding="utf-8")
    for raw_target in LINK_PATTERN.findall(text):
        target = raw_target.strip().strip("<>").split("#", 1)[0]
        if not target or target.startswith(("http://", "https://", "mailto:")):
            continue
        if "<" in target or "${" in target:
            continue
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            failures.append(f"{path.relative_to(ROOT)}: broken local link {raw_target!r}")


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

    for skill in SKILLS:
        for relative in (
            Path(skill) / "SKILL.md",
            Path(skill) / "agents" / "openai.yaml",
            Path(".cursor/rules") / f"{skill}.mdc",
            Path(".windsurf/rules") / f"{skill}.md",
        ):
            if not (ROOT / relative).is_file():
                failures.append(f"missing cross-model packaging: {relative}")

    link_files = [
        *sorted((ROOT / ".cursor/rules").glob("*.mdc")),
        *sorted((ROOT / ".windsurf/rules").glob("*.md")),
        ROOT / "README.md",
        ROOT / "SETUP-GUIDE.md",
        ROOT / "github-mcp-qa/references/qa-mcp-stack-vi.md",
        ROOT / "performance-qa/references/MCP_SETUP.md",
        ROOT / "api-contract-qa/references/POSTMAN_MCP.md",
        ROOT / "data-quality-qa/references/DATABASE_MCP.md",
        ROOT / "playwright-pom-automation/assets/templates/tests/README.md",
    ]
    for path in link_files:
        if path.is_file():
            validate_local_links(path, failures)

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
        ".agents/mcp_config.json",
        "qa-run/references/TESTCASE_SHEET_SCHEMA.json",
    ):
        path = ROOT / relative
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"{relative}: invalid JSON: {exc}")

    mcp_template = json.loads((ROOT / ".agents/mcp_config.json").read_text(encoding="utf-8"))
    for name, server in mcp_template.get("mcpServers", {}).items():
        if server.get("disabled") is not True:
            failures.append(f".agents/mcp_config.json: {name} must default to disabled")
        serialized = json.dumps(server).lower()
        if any(token in serialized for token in ("bearer ", "github_pat_", "plane_pat_", "password")):
            failures.append(f".agents/mcp_config.json: possible credential in {name}")

    forbidden_paths = ("/Users/" + "user", "/Users/" + "<user>")
    for path in ROOT.rglob("*"):
        if (
            not path.is_file()
            or ".git" in path.parts
            or "node_modules" in path.parts
            or ("qa-run" in path.parts and "qa-knowledge" in path.parts)
        ):
            continue
        if path == Path(__file__).resolve():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for forbidden in forbidden_paths:
            if forbidden in text:
                failures.append(f"{path.relative_to(ROOT)}: non-portable path {forbidden!r}")

    for skill in SKILLS:
        text = (ROOT / skill / "SKILL.md").read_text(encoding="utf-8")
        if "Use when Codex" in text or "Codex needs" in text or "Codex receives" in text:
            failures.append(f"{skill}/SKILL.md: description is not agent-neutral")
        frontmatter = text.split("---", 2)[1] if text.startswith("---") else ""
        if "do not require the skill name" not in frontmatter:
            failures.append(
                f"{skill}/SKILL.md: description must say the user need not name the skill"
            )

    if failures:
        print("CROSS-MODEL CONTRACT FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"CROSS-MODEL CONTRACT PASS: {len(REQUIRED)} entrypoints checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
