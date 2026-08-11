# GitHub Copilot instructions for QA-skill

Read [`../AGENTS.md`](../AGENTS.md) as the canonical router and cross-model execution contract before acting on a QA request.

Hard requirements:

- Route from raw URLs, IDs, filenames, extensions, and task verbs before asking for clarification; the user never has to name a skill
- A bare Plane URL/ticket ID means `integration-plane` doctor + read; a bare Drive/Docs/Sheets/Slides URL/ID means `integration-google-drive` resolve + read; a bare GitHub resource URL means `integration-github` read-only inspection
- A bare link authorizes read-only inspection only; infer external writes only from explicit mutation language
- After routing, start the safe read/doctor action instead of merely describing the skill or asking the user to invoke `$skill-name`
- Load the exact matched `SKILL.md` before searching project files
- Plane ticket retest order is `integration-plane doctor/read → dynamic-web-exploratory RETEST_PLUS → integration-plane comment/state`
- `DISCOVERY_CORE` is Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- RETEST_PLUS composes Original Retest + Sanity + Impacted Regression + `DISCOVERY_CORE`
- Deterministic Sheet/testcase execution uses the single `dynamic-web-automation` BUILD_AND_RUN workflow: manifest → POM → browser evidence → `PASS|FAILED|N/A|UNTEST`; use RETEST_PLUS only for a linked ticket or previous failure
- RETEST_PLUS includes Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, and UI/UX
- General app exploration uses `APP_BASELINE_DISCOVERY` and writes `qa-knowledge/app-business-guide.md` with a `coverage_map`; ticket retest reads it but does not repeat the full baseline
- PASS moves to `Done`, FAILED moves to `In Progress`, BLOCKED keeps its state, and a new bug starts in `Todo`
- Drive private CRUD uses `integration-google-drive` and the configured Drive MCP, followed by read-back verification
- Testcase generation uses `support-testcase-authoring` and its generator without inventing columns
- Multi-language white-box branch/path, bounded call graph, NestJS DI, Jest/Vitest generation and runtime coverage use `hybrid-source-coverage`; resolve an exact function, keep static paths as `source-derived-candidate`, and hand testcase documents to `support-testcase-authoring`
- Business document analysis uses `support-document-conversion` first when needed, then `static-requirements-analysis`; review all 18 areas and generate matching XMind, Q&A Markdown, and Q&A Excel from one JSON source
- UI/UX design review uses `hybrid-ui-ux-review` for requirement, viewport, state and screenshot/video evidence; live browser execution remains `dynamic-web-exploratory` and accessibility claims remain `hybrid-accessibility`
- Release readiness, go/no-go, exit criteria and risk acceptance use `governance-release-quality`; missing evidence or approval is `BLOCKED`
- SAST, SCA, SBOM, secret, dependency and secure-CI preflight uses `static-supply-chain-security`; redact values and route exploit validation to `dynamic-security-pentest`
- Resilience, chaos, fault injection, recovery, failover, RTO/RPO, retry and timeout planning uses `dynamic-resilience`; active injection requires approval and stop conditions
- Cross-browser, device, locale, timezone, currency, i18n/l10n and RTL planning uses `dynamic-compatibility`; route live web execution to `dynamic-web-exploratory` and native execution to `dynamic-mobile`
- Authorized pentest work uses `dynamic-security-pentest`; create `.pentest/engagement.md`, run its doctor and resolve scope, authorization, exclusions and rate limits before any network request
- GitHub repository API or Actions work uses `integration-github`; keep Git SSH separate from MCP OAuth/PAT and verify account, repository, and branch before mutation
- Chrome DevTools or k6 MCP setup uses `dynamic-performance`; Postman MCP/CLI/Newman setup and execution use `integration-postman`, while Postman contract validation uses `hybrid-api-contract`; database read-only MCP uses `dynamic-data-quality`
- JMeter, `.jmx`, JTL and k6 all use the single public `dynamic-performance`; select the engine internally from one common config, smoke with one user, and require approval before load
- A skill file does not prove an MCP is configured, authenticated, loaded, or permitted; run the canonical doctor and report the exact failing layer
- Treat scanner alerts as `Candidate` until deterministic reproduction and a control comparison confirm them; request approval immediately before Level 2 or Level 3 actions
- Never enable `/yolo` outside an explicitly authorized isolated lab
- API testcase mode is opt-in only when the user explicitly asks to write API testcases or testcases for an endpoint, OpenAPI/Swagger, Postman collection, or curl request; merely mentioning an API artifact does not switch modes
- For API testcase files, run `support/testcase-authoring/scripts/import-api-spec.py` first and do not generate Excel while `review_required` is non-empty
- Testcase generation must write the complete same-basename Markdown before Excel; future agents read Markdown first
- Browser QA runs `dynamic-testing/web-exploratory/scripts/helpers/context-builder.mjs` for the exact feature scope and requires a `READY` Business Execution Brief before normal browser action; `NEEDS_DISCOVERY` permits scoped discovery only and `BLOCKED` must stop on the named missing fields
- Copy Target, Role/Data, Original flow, Expected and Impact area from the READY brief; never replace missing business logic with a generic flow
- After every run, rewrite and validate matching knowledge with `scripts/writers/write-business-guide.mjs`
- Plane comments, testcase prose, and human-readable Drive CRUD content have no terminal `.` and no emoji/icon
- Never guess a workspace, target ID, expected result, permission, or successful mutation
