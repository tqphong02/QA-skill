#!/usr/bin/env python3
"""Validate cross-model hard gates shared by QA-skill entrypoints."""

from pathlib import Path
import ast
import json
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

SKILLS = (
    "hybrid-accessibility",
    "dynamic-ai-evaluation",
    "hybrid-api-contract",
    "static-supply-chain-security",
    "static-requirements-analysis",
    "dynamic-compatibility",
    "dynamic-data-quality",
    "support-document-conversion",
    "adapter-browser-session",
    "integration-github",
    "integration-google-drive",
    "dynamic-mobile",
    "dynamic-security-pentest",
    "dynamic-performance",
    "integration-plane",
    "dynamic-web-automation",
    "integration-postman",
    "dynamic-web-exploratory",
    "governance-release-quality",
    "dynamic-resilience",
    "support-testcase-authoring",
    "hybrid-ui-ux-review",
    "hybrid-source-coverage",
)

REGISTRY = json.loads((ROOT / "config/skill-registry.json").read_text(encoding="utf-8"))
SKILL_PATHS = {entry["id"]: entry["path"] for entry in REGISTRY["skills"]}

REQUIRED = {
    "AGENTS.md": [
        "Cross-model deterministic mode",
        "Model-neutral Plane inline evidence",
        "integration/plane/QUICK_REF.md",
        "browser-inline-evidence.mjs",
        "attachments_count: 0",
        "URL/artifact-first dispatch",
        "Chỉ có Plane URL hoặc ticket ID",
        "Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID",
        "link đứng một mình không cấp quyền write",
        "PASS → `Done`",
        "FAILED → `In Progress`",
        "BLOCKED → giữ nguyên trạng thái",
        "Bug mới → `Todo`",
        "RETEST_PLUS",
        "integration/google-drive/SKILL.md",
        "integration/plane/SKILL.md",
        "import-api-spec.py",
        "review_required",
        "write-business-guide.mjs",
        "Markdown trước Excel",
        "app-business-guide.md",
        "static-testing/requirements-analysis/SKILL.md",
        "dynamic-testing/security-pentest/SKILL.md",
        ".pentest/engagement.md",
        "Chrome DevTools MCP",
        "Postman MCP",
        "mcp_not_configured",
        "`DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Deterministic Sheet execution = unified POM BUILD_AND_RUN",
        "prepare-test-intelligence.mjs",
        "Business Execution Brief là `READY`",
        "Không được tự thay business flow thiếu bằng flow generic",
        "`dynamic-performance` là public skill duy nhất cho performance",
    ],
    "GEMINI.md": [
        "Cross-model deterministic mode",
        "Plane inline evidence bắt buộc cho mọi model",
        "integration/plane/QUICK_REF.md",
        "browser-inline-evidence.mjs",
        "attachments_count: 0",
        "URL/artifact-first dispatch",
        "Chỉ có Plane URL hoặc ticket ID",
        "Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID",
        "link đứng một mình không cấp quyền write",
        "PASS → `Done`",
        "RETEST_PLUS",
        "integration/google-drive/SKILL.md",
        "integration/plane/SKILL.md",
        "import-api-spec.py",
        "review_required",
        "write-business-guide.mjs",
        "Markdown trước Excel",
        "APP_BASELINE_DISCOVERY",
        "static-testing/requirements-analysis/SKILL.md",
        "dynamic-testing/security-pentest/SKILL.md",
        ".pentest/engagement.md",
        "Chrome DevTools MCP",
        "Postman MCP",
        "mcp_not_configured",
        "`DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Deterministic Sheet execution = unified POM BUILD_AND_RUN",
        "context-builder.mjs",
        "Business Execution Brief là `READY`",
        "Không được tự thay business flow thiếu bằng flow generic",
        "`dynamic-performance` là public skill duy nhất cho performance",
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
        "dynamic-security-pentest",
        "control comparison",
        "Chrome DevTools or k6 MCP",
        "exact failing layer",
        "`DISCOVERY_CORE` is Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "Deterministic Sheet/testcase execution uses the single `dynamic-web-automation` BUILD_AND_RUN workflow",
        "context-builder.mjs",
        "READY` Business Execution Brief",
        "never replace missing business logic with a generic flow",
        "JMeter, `.jmx`, JTL and k6 all use the single public `dynamic-performance`",
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
        "Phân tích white-box function processPayment",
        "Tạo JMeter JMX cho API",
        "Review UI login theo Figma",
        "Đánh giá release này có go/no-go không",
        "Quét secret, dependency và SBOM readiness",
        "Thiết kế resilience test khi payment timeout",
        "Kiểm tra browser, locale vi-VN, timezone và RTL",
        "GitHub MCP đã có skill nhưng không dùng được",
        "Cài riêng dynamic-web-exploratory cho intern",
    ],
    "PENTEST-RUN-GUIDE.md": [
        "Engagement contract bắt buộc",
        "dynamic-testing/security-pentest/scripts/doctor.sh",
        "Level 2",
        "control comparison",
        "PentesterFlow",
        "SECURITY_TOOLS_DIR",
        "source_available",
        "RECON_SKILLS_DIR",
        "DockerScan `v2.1.0`",
        ".pentest/evidence/",
    ],
    "dynamic-testing/security-pentest/references/PENTEST_SECURITY.md": [
        "antigravity-host",
        "--allow-hosted-model-review",
        "HOST-INSTRUCTIONS.md",
        "validation_status: unverified",
        "Do not describe `antigravity-host` as the OpenAI CLI running on Gemini",
    ],
    "dynamic-testing/security-pentest/skills/pentest-security/scripts/antigravity-host-scan.mjs": [
        "external_model_api: false",
        "source drift detected",
        "validation_status: 'unverified'",
        "--allow-hosted-model-review",
    ],
    "dynamic-testing/web-exploratory/SKILL.md": [
        "Cross-model hard gates",
        "Workflow composition router",
        "DISCOVERY_CORE =",
        "RETEST_PLUS =",
        "SHEET_EXECUTION_PLUS =",
        "Create a ledger row for every expanded layer",
        "Never load or expose `vendor/**/SKILL.md`",
        "Plane ticket plus retest",
        "Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, UI/UX",
        "PASS → Done",
        "FAILED → In Progress",
        "scripts/writers/write-business-guide.mjs",
        "qa-knowledge/",
        "APP_BASELINE_DISCOVERY",
        "coverage_map",
        "Business Execution Brief",
        "context-builder.mjs",
        "stop normal execution",
        "run-manifest.mjs` must reject",
    ],
    "dynamic-testing/web-exploratory/references/RETEST-PLUS.md": [
        "RETEST_PLUS composes `Original Retest + Sanity + Impacted Regression + DISCOVERY_CORE`",
        "Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "do not auto-run full-app baselines",
        "scripts/writers/write-business-guide.mjs",
    ],
    "dynamic-testing/web-exploratory/references/PROCESS-GUIDE.md": [
        "DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX",
        "RETEST_PLUS",
        "SHEET_EXECUTION_PLUS",
        "Full-app Business Discovery is reserved for `APP_BASELINE_DISCOVERY`",
    ],
    "dynamic-testing/web-exploratory/references/TESTCASE_SHEET_SCHEMA.json": [
        '"name": "SHEET_EXECUTION_PLUS"',
        '"Scoped Business Discovery"',
        '"Original Retest only for rows linked to a Plane ticket or previous failure"',
        '"Do not comment or change Plane state without an exact ticket"',
    ],
    "support/testcase-authoring/SKILL.md": [
        "Cross-model hard gates",
        "No trailing `.`",
        "No emoji/icons",
        "only use API mode when user explicitly requests writing API testcases",
        "references/api-testcases.md",
        "scripts/import-api-spec.py",
        "references/markdown-testcases.md",
        "RBAC Matrix",
        "references/rbac-matrix.schema.json",
        "allow_case_ref",
        "create `<output>.md` before `<output>.xlsx`",
    ],
    "integration/plane/SKILL.md": [
        "Cross-model hard gates",
        "QUICK_REF.md",
        "browser-inline-evidence.mjs",
        "{{PLANE_DESCRIPTION_IMAGE_N}}",
        "Attachments 0",
        "A Plane URL or ticket ID by itself is a complete read request",
        "integration-plane read → dynamic-web-exploratory RETEST_PLUS → integration-plane comment/state",
        "PASS → Done",
        "FAILED → In Progress",
        "new bug → Todo",
    ],
    "integration/plane/QUICK_REF.md": [
        "browser-inline-evidence.mjs",
        "{{PLANE_DESCRIPTION_IMAGE_1}}",
        "{{PLANE_COMMENT_IMAGE_1}}",
        "Attachments 0",
        "/issue-attachments/",
    ],
    "integration/plane/scripts/browser-inline-evidence.mjs": [
        "DESCRIPTION_TOKEN",
        "COMMENT_TOKEN",
        "PLANE_LOCAL_CONFIG_DIR",
        "issue_attachment_requests",
        "attachments_count",
        "missing_rendered_asset_ids",
        "placeholders_absent",
    ],
    "integration/plane/comments/post-result.py": [
        '"PASS": "Done"',
        '"FAILED": "In Progress"',
        "clean_sentence",
    ],
    "integration/google-drive/SKILL.md": [
        "Cross-model hard gates",
        "A Drive URL or ID by itself is a complete safe-read request",
        "bare URL authorizes read-only inspection, not mutation",
        "google-drive` MCP",
        "references/GOOGLE_CLOUD_OAUTH_SETUP.md",
        "Read the affected object back",
    ],
    "integration/google-drive/references/GOOGLE_CLOUD_OAUTH_SETUP.md": [
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
    "support/testcase-authoring/scripts/gen-testcases.py": [
        "def human_text",
        "def render_api_case",
        "ICON_RE",
        "SENSITIVE_HEADER_NAMES",
        "SENSITIVE_PAYLOAD_KEYS",
        "expected_status",
        "rstrip('.')",
        "def ensure_group_capacity",
        "def write_testcase_markdown",
        "def write_automation_manifest",
        "def validate_rbac_contract",
        "def write_rbac_sheet",
        "Generated Markdown first",
    ],
    "support/testcase-authoring/scripts/import-api-spec.py": [
        "def extract_openapi",
        "def extract_postman",
        "def extract_generic",
        "def extract_text",
        "review_required",
        "default-success-status",
    ],
    "support/testcase-authoring/references/api-testcases.md": [
        "Đọc file này chỉ khi user yêu cầu rõ viết testcase API",
        "Không tạo phần thứ ba",
        "Không đưa token, password, cookie hoặc API key thật",
    ],
    "support/testcase-authoring/references/markdown-testcases.md": [
        "Mỗi lần generate Excel, tạo Markdown",
        "Testcase ID giống Excel",
        "RBAC Matrix",
        "Không mở Excel chỉ để hiểu testcase design",
    ],
    "support/testcase-authoring/references/rbac-matrix.schema.json": [
        '"ALLOW"',
        '"DENY"',
        '"UNRESOLVED"',
        '"RUNTIME_CONFIRMED"',
        '"allow_case_refs"',
        '"deny_case_refs"',
    ],
    "support/testcase-authoring/references/automation-manifest.schema.json": [
        '"markdown_sha256"',
        '"testcase_id"',
        '"execution"',
    ],
    "dynamic-testing/web-automation/SKILL.md": [
        "automation manifest",
        "pom-plan",
        "AUTOMATION_SOURCE",
        "RBAC",
        "BUILD_AND_RUN",
        "PASS`, `FAILED`, `N/A` or `UNTEST",
        "scripts/run-testcase-pom.mjs",
    ],
    "dynamic-testing/web-automation/assets/templates/scripts/run-testcase-pom.mjs": [
        "TESTCASE_POM_EXECUTION",
        "QA_UNIFIED_EVIDENCE",
        "Traceability BLOCKED trước browser execution",
        "sheet_result",
    ],
    "dynamic-testing/web-automation/assets/templates/scripts/verify-testcase-traceability.mjs": [
        "AUTOMATION_MANIFEST_MISSING",
        "EMPTY_TEST_IMPLEMENTATION",
        "IMPLEMENTATION_MARKER_MISSING",
        "RAW_SELECTOR_IN_SPEC",
    ],
    "dynamic-testing/web-automation/assets/templates/scripts/generate-pom-plan.mjs": [
        "source_manifest_sha256",
        "required_markers",
        "selector_target_keys",
    ],
    "hybrid-testing/ui-ux-review/SKILL.md": [
        "Workflow",
        "dynamic-web-exploratory",
        "hybrid-accessibility",
        "check_uiux_artifact.py",
        "Hard gates",
        "Output contract",
        "screenshot or video",
    ],
    "governance/release-quality/SKILL.md": [
        "Workflow",
        "release quality gate",
        "evaluate_release.py",
        "Hard gates",
        "Output contract",
        "P0/P1",
        "BLOCKED",
    ],
    "static-testing/supply-chain-security/SKILL.md": [
        "Workflow",
        "dynamic-security-pentest",
        "check_supply_chain.py",
        "Hard gates",
        "Output contract",
        "Candidate",
        "Redact values in reports",
    ],
    "dynamic-testing/resilience/SKILL.md": [
        "Workflow",
        "fault-injection",
        "validate_resilience_plan.py",
        "Hard gates",
        "Output contract",
        "RTO/RPO",
        "BLOCKED",
    ],
    "dynamic-testing/compatibility/SKILL.md": [
        "Workflow",
        "dynamic-web-exploratory",
        "dynamic-mobile",
        "check_compatibility_matrix.py",
        "Hard gates",
        "Output contract",
        "RTL",
    ],
    "dynamic-testing/web-exploratory/references/KNOWLEDGE_HANDOFF.md": [
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
    "dynamic-testing/web-exploratory/references/INTELLIGENCE-BOOST.md": [
        "prepare-test-intelligence.mjs",
        "business-execution-brief.json",
        "NEEDS_DISCOVERY",
        "Never replace a missing field with a generic five-step flow",
        "scripts/writers/write-business-guide.mjs",
    ],
    "dynamic-testing/web-exploratory/references/PIPELINE.md": [
        "Business Context Gate (context-builder.mjs)",
        "Manifest Initializer (run-manifest.mjs)",
    ],
    "dynamic-testing/web-exploratory/scripts/helpers/context-builder.mjs": [
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
    "dynamic-testing/web-exploratory/scripts/helpers/run-manifest.mjs": [
        "business execution brief is missing",
        "businessContext.status !== 'READY'",
        "SCOPED_BUSINESS_DISCOVERY",
        "business_context",
    ],
    "dynamic-testing/web-exploratory/scripts/writers/write-business-guide.mjs": [
        "BUSINESS GUIDE WRITTEN",
        "BUSINESS GUIDE PASS",
        "Latest QA run",
        "qa-knowledge",
        "merge_confirmed",
        "app guide requires a non-empty coverage_map",
    ],
    "static-testing/requirements-analysis/SKILL.md": [
        "support/document-conversion/scripts/convert.sh",
        "18 areas",
        "Business_Flow.xmind",
        "_Q&A.md",
        "_Q&A.xlsx",
        "_Analysis_Source.json",
        ".static-testing/requirements-analysis",
        "flow_links",
        "sanity_journeys",
        "scripts/generate.sh",
    ],
    "static-testing/requirements-analysis/references/SENIOR_REVIEW_CHECKLIST.md": [
        "Scope and actors",
        "Security and privacy",
        "Concurrency and idempotency",
        "Testability and acceptance criteria",
    ],
    "static-testing/requirements-analysis/scripts/render-qa.py": [
        "REVIEW_AREAS",
        "QUESTION_HEADERS",
        "Question ID mismatch",
        "must not contain a real credential",
    ],
    "static-testing/requirements-analysis/scripts/render-xmind.mjs": [
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
    "static-testing/requirements-analysis/examples/sample-analysis.json": [
        "\"review_coverage\"",
        "\"QA-001\"",
        "\"questions\"",
        "\"flow_links\"",
        "\"sanity_journeys\"",
    ],
    "dynamic-testing/security-pentest/SKILL.md": [
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
    "dynamic-testing/security-pentest/references/TOOL_ROUTING.md": [
        "PentesterFlow",
        "recon-skills",
        "Raccoon",
        "DockerScan",
        "GhidraGPT",
        "https://github.com/PentesterFlow/agent",
        "SECURITY_TOOLS_DIR",
        "source_available",
    ],
    "dynamic-testing/security-pentest/references/ENGAGEMENT_CONTRACT.md": [
        "Exact targets",
        "Explicit exclusions",
        "Maximum request rate",
        "Approval record",
    ],
    "dynamic-testing/security-pentest/references/FINDING_FORMAT.md": [
        "Expected secure behavior",
        "Control comparison",
        "Rollback result",
        "Candidate",
    ],
    "dynamic-testing/security-pentest/scripts/doctor.sh": [
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
    "support/testcase-authoring/examples/sample-api-input.json": [
        '"kind": "api"',
        '"expected_status": 200',
        '"password": "<valid_password>"',
    ],
    "scripts/setup_lib.sh": [
        '"integration-plane"',
        '"integration-google-drive"',
        '"dynamic-security-pentest"',
        "PyYAML",
        "resolve_target_agent",
        "resolve_skills_dir",
        "$HOME/.agents/skills",
        "$HOME/.gemini/config/skills",
        "--exclude='qa-knowledge'",
        "--exclude='vendor'",
        "--exclude='tests'",
        "-mindepth 2 -type f -name 'SKILL.md' -delete",
        'RETIRED_SKILLS=("jmeter-qa")',
        "retire_legacy_skills",
        '"integration-postman"',
        "setup_selected_integrations",
        "runner.py",
    ],
    "dynamic-testing/performance/SKILL.md": [
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
    "dynamic-testing/performance/scripts/performance_orchestrator.py": [
        "BLOCKED_SMOKE_FAILED",
        "APPROVAL_REQUIRED",
        "runtime_missing",
        "smokeCommand",
        "mainCommand",
        "compare_results",
    ],
    "dynamic-testing/performance/scripts/adapters/jmeter_adapter.py": [
        "generated-test-plan.jmx",
        "JTHREADS=1",
        "Existing JMX was copied",
    ],
    "dynamic-testing/performance/scripts/adapters/k6_adapter.py": [
        "constant-arrival-rate",
        "shared-iterations",
        "ramping-vus",
        "K6_WEB_DASHBOARD_EXPORT",
    ],
    "dynamic-testing/performance/scripts/parsers/jtl_parser.py": [
        "parse_jtl",
        "endpoints[:10]",
    ],
    "dynamic-testing/performance/scripts/parsers/k6_parser.py": [
        "parse_k6",
        "http_req_duration",
    ],
    "dynamic-testing/performance/references/COMMON_CONFIG.md": [
        "The common YAML is the only user-facing configuration",
        "authorizationReference",
        "abortConditions",
    ],
    "dynamic-testing/performance/schemas/run-config.schema.json": [
        '"concurrent-users"',
        '"request-rate"',
        '"total-iterations"',
    ],
    "dynamic-testing/performance/schemas/result.schema.json": [
        '"PASS"',
        '"FAIL"',
        '"BLOCKED"',
    ],
    "dynamic-testing/performance/references/MCP_SETUP.md": [
        "chrome-devtools-mcp@latest",
        "k6 x mcp",
        "doctor-stack.sh",
    ],
    "hybrid-testing/api-contract/SKILL.md": [
        "references/POSTMAN_MCP.md",
        "doctor-stack.sh postman",
    ],
    "hybrid-testing/api-contract/references/POSTMAN_MCP.md": [
        "https://mcp.postman.com/minimal",
        "codex mcp login postman",
        "mcp_not_loaded",
    ],
    "integration/postman/SKILL.md": [
        "scripts/bootstrap.py",
        "scripts/runner.py",
        "OAuth consent",
        "read-only workspace listing",
        "mcp_not_configured",
        "Newman",
    ],
    "integration/postman/scripts/bootstrap.py": [
        "https://mcp.postman.com/minimal",
        "mcpServers",
        "read_back",
        "backup",
    ],
    "integration/postman/scripts/runner.py": [
        "postman-cli",
        "newman",
        "collection=v3",
        "report.json",
        "junit.xml",
        "safe_command",
    ],
    "integration/postman/package.json": [
        '"newman": "6.2.2"',
        '"postman-cli": "1.44.0"',
    ],
    "integration/postman/package-lock.json": [
        '"newman": "6.2.2"',
        '"postman-cli": "1.44.0"',
        '"lockfileVersion": 3',
    ],
    "hybrid-testing/source-coverage/SKILL.md": [
        "source-derived-candidate",
        "support/testcase-authoring/scripts/gen-testcases.py",
        "No runtime coverage evidence supplied",
        "TypeScript",
        "Python",
        "run-coverage",
        "NestJS",
    ],
    "hybrid-testing/source-coverage/package.json": [
        '"ts-morph"',
        '"@ast-grep/napi"',
        '"postinstall"',
        '"test:coverage"',
    ],
    "hybrid-testing/source-coverage/src/analyzer.ts": [
        "PATH_EXPLOSION",
        "MAX_BRANCHES_EXCEEDED",
        "No runtime coverage evidence supplied",
    ],
    "hybrid-testing/source-coverage/src/handoff.ts": [
        "UNKNOWN_REQUIREMENT",
        "OUT_OF_SPEC_TYPE_REQUIRED",
        "1.2. FUNCTION",
    ],
    "hybrid-testing/source-coverage/src/graph.ts": [
        "buildAnyCallGraph",
        "buildNestJsGraph",
        "external-or-dynamic",
    ],
    "hybrid-testing/source-coverage/src/coverage-runner.ts": [
        "COVERAGE_RUNNER_MISSING",
        "COVERAGE_TEST_FAILED",
        "coverage-final.json",
    ],
    "hybrid-testing/source-coverage/src/unit-test-generator.ts": [
        "UNKNOWN_CANDIDATE",
        "DUPLICATE_CANDIDATE_MAPPING",
        "Whitebox trace",
    ],
    "dynamic-testing/data-quality/SKILL.md": [
        "references/DATABASE_MCP.md",
        "proof of read-only access",
    ],
    "dynamic-testing/data-quality/references/DATABASE_MCP.md": [
        "DBHub",
        "readonly = true",
        "mongodb-mcp-server@latest --readOnly",
        "read-only account",
    ],
    "integration/github/scripts/doctor-stack.sh": [
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
        "--only=dynamic-web-exploratory --skip-deps --yes",
        "không làm xuất hiện thêm các skill `understand-*`",
    ],
    "README.md": [
        "Cấp đúng 1 skill cho intern",
        "--only=dynamic-web-exploratory --skip-deps --yes",
    ],
    "scripts/doctor-codex.sh": [
        "$HOME/.agents/skills",
        "codex mcp list",
        "MANUAL",
    ],
    "scripts/doctor-antigravity.sh": [
        "$HOME/.gemini/config/skills",
        ".agents/mcp_config.json",
        "/skills rồi /mcp",
    ],
    "integration/github/scripts/doctor-codex.sh": [
        "https://api.githubcopilot.com/mcp/",
        "mcp_not_configured",
    ],
    "integration/github/scripts/doctor-antigravity.sh": [
        ".agents/mcp_config.json",
        'server.get("disabled", False)',
        "MANUAL run /mcp",
    ],
    "integration/github/references/antigravity-github-mcp-vi.md": [
        "~/.gemini/config/mcp_config.json",
        ".agents/mcp_config.json",
        '"disabled": false',
        "/mcp",
    ],
    "WINDOWS-SETUP.md": [
        "setup.ps1 -Agent codex",
        "setup.ps1 -Agent antigravity",
        "%USERPROFILE%\\.agents\\skills",
        "%USERPROFILE%\\.gemini\\config\\skills",
    ],
    "support/document-conversion/scripts/convert.sh": [
        '"${1:-}"',
        "sys.argv[1]",
        "sys.argv[2]",
    ],
    "dynamic-testing/web-automation/assets/templates/tests/performance/k6-load-test.js": [
        "PERFORMANCE_CONTRACT",
        "K6_LOAD_APPROVED",
        "target: 1",
        "authorization_reference",
        "abort_conditions",
    ],
    "dynamic-testing/web-automation/assets/templates/package.json": [
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
        skill_root = Path(SKILL_PATHS[skill])
        for relative in (
            skill_root / "SKILL.md",
            skill_root / "agents" / "openai.yaml",
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
        ROOT / "integration/github/references/qa-mcp-stack-vi.md",
        ROOT / "dynamic-testing/performance/references/MCP_SETUP.md",
        ROOT / "hybrid-testing/api-contract/references/POSTMAN_MCP.md",
        ROOT / "dynamic-testing/data-quality/references/DATABASE_MCP.md",
        ROOT / "dynamic-testing/web-automation/assets/templates/tests/README.md",
    ]
    for path in link_files:
        if path.is_file():
            validate_local_links(path, failures)

    for relative in (
        "integration/plane/comments/post-result.py",
        "integration/plane/comments/post-inline.py",
        "integration/plane/utils/inline_image.py",
        "integration/google-drive/scripts/drive_auth_doctor.py",
        "integration/google-drive/scripts/drive_upload.py",
        "support/testcase-authoring/scripts/gen-testcases.py",
        "support/testcase-authoring/scripts/import-api-spec.py",
        "static-testing/requirements-analysis/scripts/render-qa.py",
        "integration/postman/scripts/bootstrap.py",
        "integration/postman/scripts/runner.py",
    ):
        path = ROOT / relative
        if path.is_file():
            try:
                ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            except SyntaxError as exc:
                failures.append(f"{relative}: syntax error: {exc}")

    for relative in (
        "support/testcase-authoring/examples/sample-input.json",
        "support/testcase-authoring/examples/structured-input.json",
        "support/testcase-authoring/examples/sample-api-input.json",
        "support/testcase-authoring/references/execution-contract.schema.json",
        "support/testcase-authoring/references/rbac-matrix.schema.json",
        "support/testcase-authoring/references/automation-manifest.schema.json",
        "static-testing/requirements-analysis/examples/sample-analysis.json",
        "static-testing/requirements-analysis/package.json",
        "integration/postman/package.json",
        "integration/postman/package-lock.json",
        ".agents/mcp_config.json",
        "dynamic-testing/web-exploratory/references/TESTCASE_SHEET_SCHEMA.json",
    ):
        path = ROOT / relative
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            failures.append(f"{relative}: invalid JSON: {exc}")

    mcp_template = json.loads((ROOT / ".agents/mcp_config.json").read_text(encoding="utf-8"))
    for name, server in mcp_template.get("mcpServers", {}).items():
        expected_disabled = name != "postman"
        if server.get("disabled") is not expected_disabled:
            expected = "disabled" if expected_disabled else "enabled"
            failures.append(
                f".agents/mcp_config.json: {name} must default to {expected}"
            )
        serialized = json.dumps(server).lower()
        if any(token in serialized for token in ("bearer ", "github_pat_", "plane_pat_", "password")):
            failures.append(f".agents/mcp_config.json: possible credential in {name}")

    forbidden_paths = ("/Users/" + "user", "/Users/" + "<user>")
    for path in ROOT.rglob("*"):
        if (
            not path.is_file()
            or ".git" in path.parts
            or "node_modules" in path.parts
            or "qa-knowledge" in path.parts
            or "evidence" in path.parts
            or ".pentest" in path.parts
            or "coverage" in path.parts
            or "dist" in path.parts
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
        text = (ROOT / SKILL_PATHS[skill] / "SKILL.md").read_text(encoding="utf-8")
        if "Use when Codex" in text or "Codex needs" in text or "Codex receives" in text:
            failures.append(f"{SKILL_PATHS[skill]}/SKILL.md: description is not agent-neutral")
        frontmatter = text.split("---", 2)[1] if text.startswith("---") else ""
        if "do not require the skill name" not in frontmatter:
            failures.append(
                f"{SKILL_PATHS[skill]}/SKILL.md: description must say the user need not name the skill"
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
