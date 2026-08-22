<!-- Compact cross-model router. Detailed contracts live in the selected SKILL.md and references. -->

# QA-skill — Instructions for AI coding agents

This repository publishes QE, security and MCP skills for multiple coding agents

## Language policy

Keep agent-facing contracts in English. Unless the user asks otherwise, write final QA output in Vietnamese. Preserve exact IDs, URLs, filenames, commands, code, formulas, verdicts and UI/source strings

## Cross-model deterministic mode

Scan the user's message verbatim for URLs, IDs, filenames, extensions and business verbs before answering. A skill name is not required

For high-frequency routing, use the canonical oracle and load only the returned skill path(s):

```text
node scripts/core-skill-router.mjs --text "<request>"
```

Then read the matched `SKILL.md` completely and only the references required by its selected mode. Start the canonical read-only doctor/action; do not stop at naming a skill or ask the user to invoke one

### URL/artifact-first dispatch

### Compact route map

| Signal | Route / first action |
|---|---|
| Plane URL/ticket/bug | `integration/plane`; doctor, exact read |
| Plane retest/verify/PASS/FAILED/BLOCKED | Plane read → `dynamic-web-exploratory` RETEST_PLUS → Plane comment/state |
| Release/go-no-go/sign-off | Plane if applicable → `governance-release-quality`; evaluate packet read-only |
| Drive/Docs/Sheets/Slides URL or ID | `integration-google-drive`; resolve and read object |
| Deterministic testcase/Excel/Sheet/Playwright/POM/BUILD/RUN | `dynamic-web-automation`; unified BUILD_AND_RUN |
| Generic browser task | `dynamic-web-exploratory` FAST; no business brief is required |
| Exploratory, ad-hoc, sanity, UI/UX, baseline, browser errors | `dynamic-web-exploratory`; UI-first |
| Source/business discovery or UI ↔ source reconciliation | `dynamic-web-exploratory`; run the matching orchestrator |
| Testcase authoring or API testcase writing | `support-testcase-authoring`; Markdown/manifest before Excel |
| PDF/DOCX/PPTX conversion | `support-document-conversion` |
| Authorized pentest/security assessment | `dynamic-security-pentest`; doctor and engagement contract |
| SAST/SCA/SBOM/secret/license scan | `static-supply-chain-security`; redacted preflight |
| GitHub MCP/repository/PR/Issues/Actions | `integration-github`; distinguish MCP auth from Git SSH |
| Postman collection/MCP/CLI/Newman | `integration-postman`; runtime doctor |
| Database/ETL/reconciliation/schema drift | `dynamic-data-quality`; confirm read-only source/destination |
| API/OpenAPI/Swagger/GraphQL/webhook contract | `hybrid-api-contract` |
| Performance/load/JMeter/k6 | `dynamic-performance`; validate workload, smoke and stop condition |
| Mobile Android/iOS/Appium/device/proxy | `dynamic-mobile` |
| White-box/source/branch/path/runtime coverage | `hybrid-source-coverage` |
| WCAG/axe/keyboard/screen reader | `hybrid-accessibility` |
| Figma/design/visual UX | `hybrid-ui-ux-review` |
| Resilience/chaos/failover/RTO/RPO | `dynamic-resilience` |
| Cross-browser/device/locale/timezone/RTL | `dynamic-compatibility` |
| LLM/chatbot/RAG/model evaluation | `dynamic-ai-evaluation` |
| ego-lite/real login session/browser driver | `adapter-browser-session` |

`config/core-routing-contract.json` is the versioned routing source of truth. Validate router changes with `node scripts/core-skill-router.mjs --self-test`

Integration contracts are explicit: read `integration/google-drive/SKILL.md`, `integration/plane/SKILL.md`, `static-testing/requirements-analysis/SKILL.md` or `dynamic-testing/security-pentest/SKILL.md` only when matched. Diagnose `mcp_not_configured` separately from auth/runtime failures; use the named Chrome DevTools MCP and Postman MCP contracts. Pentest requires `.pentest/engagement.md` before network requests

Contract literals: Chỉ có Plane URL hoặc ticket ID; Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID; link đứng một mình không cấp quyền write; PASS → `Done`; FAILED → `In Progress`; BLOCKED → giữ nguyên trạng thái; Bug mới → `Todo`

### Model-neutral Plane inline evidence

Apply to every model. After `integration/plane/SKILL.md`, read `integration/plane/QUICK_REF.md`. For an image in a Description or Comment, create the canonical inline-evidence request and run:

```text
node integration/plane/scripts/browser-inline-evidence.mjs --input <request.json>
```

Use exact `{{PLANE_DESCRIPTION_IMAGE_N}}` and `{{PLANE_COMMENT_IMAGE_N}}` placeholders. Add `--apply` only after the authorized write is confirmed. Accept success only after read-back proves exact IDs, rendered image nodes/previews, expected state, `attachments_count: 0`, empty `issue_attachment_requests`, and no placeholders. Never click `Attach`, call `/issue-attachments/`, copy credentials across hosts or substitute an attachment when browser staging fails

### Shared gates

1. Before mutation, record `Target`, `Operation`, `Required inputs`, `Write action` and `Verification`
2. Validate exact target, authority, role/data, expected result, domain, cleanup and stop condition; missing required input is `BLOCKED` or `UNTEST`, never a guess
3. Prefer canonical/dry-run scripts. After mutation, read back and compare ID, content, evidence, state and permission
4. A skill document does not prove runtime/MCP availability. Distinguish `mcp_not_configured`, `auth_required`, `runtime_missing`, `mcp_not_loaded` and `permission_denied`
5. Do not read secrets, keychains or registries. Keep reports redacted and credentials in environment/CI only
6. Do not run destructive tests, resilience injection, concurrency or pentest Level 2/3 without the required target, rollback/stop contract and approval
7. Do not claim `PASS` without the required runtime evidence. Preserve `PASS`, `FAILED`, `N/A`, `UNTEST`; exploratory/ad-hoc has no fifth user-facing verdict
8. Business analysis must answer important Q&A or mark assumptions before testcase generation

### Browser and model boundary

`playwright-runtime`/Playwright MCP is the default live browser. Gemini/Antigravity is a host model, not a browser override: never use Gemini-in-Chrome or `antigravity-native`; Antigravity must use Playwright runtime/MCP and returns `UNTEST` when unavailable. Network, console and page-error evidence must be observed in the same page/session as the UI action. `adapter-browser-session` is a separate real-login driver, not a Playwright fallback; run its doctor first and never perform destructive real-session actions without confirmation

Deterministic Sheet/testcase routes exit to `dynamic-web-automation`. The exact contract literal is: deterministic Sheet/testcase routes exit to `dynamic-web-automation`. Full exploratory/app-baseline routes are UI-first; a brief, source or knowledge file is optional enrichment unless the selected retest/source-driven contract requires it. Retest uses `RETEST_PLUS`; it does not silently become a full-app regression

### Invariants

- `DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- Deterministic Sheet execution = unified POM BUILD_AND_RUN with exact IDs, evidence and verdict projection
- Retest includes Retest, Sanity, Impacted Regression, Exploratory, Ad-hoc and UI/UX
- `PASS` → `Done`; `FAILED` → `In Progress`; `BLOCKED` → giữ nguyên trạng thái; new bug → `Todo`
- `dynamic-performance` là public skill duy nhất cho performance; JMeter and k6 remain internal engines
- Static source/Graphify findings are candidates, not runtime truth or measured coverage; keep `EXTRACTED`, `INFERRED`, `AMBIGUOUS`, `unknown` and `uncovered` distinct
- Interactive HTML is derived from validated canonical JSON and never replaces JSON, Markdown, Excel, XMind or evidence
- Pentest findings remain `Candidate` until reproduction and control comparison; Antigravity host findings remain `unverified`
- Plane comments, testcase prose and Drive-created reader-visible text do not end with `.` and contain no emoji/icons

## Progressive disclosure

Read only the matched skill and references named by its mode. Do not search vendor implementations or load `vendor/**/SKILL.md`. Use scripts as the source of truth for schemas, selectors, manifests, plans and reports; keep large artifacts file-backed and pass compact summaries into context

## Publication

Canonical installed names come from `config/skill-registry.json`. Setup must migrate active legacy aliases to a timestamped backup, install one canonical copy and verify source parity
