# GitHub Copilot instructions for QA-skill

Read [`../AGENTS.md`](../AGENTS.md) as the canonical router and cross-model execution contract before acting on a QA request.

Hard requirements:

- Route from raw URLs, IDs, filenames, extensions, and task verbs before asking for clarification; the user never has to name a skill
- A bare Plane URL/ticket ID means `plane-qa` doctor + read; a bare Drive/Docs/Sheets/Slides URL/ID means `google-drive-qa` resolve + read; a bare GitHub resource URL means `github-mcp-qa` read-only inspection
- A bare link authorizes read-only inspection only; infer external writes only from explicit mutation language
- After routing, start the safe read/doctor action instead of merely describing the skill or asking the user to invoke `$skill-name`
- Load the exact matched `SKILL.md` before searching project files
- Plane ticket retest order is `plane-qa doctor/read → qa-run RETEST_PLUS → plane-qa comment/state`
- `DISCOVERY_CORE` is Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX
- RETEST_PLUS composes Original Retest + Sanity + Impacted Regression + `DISCOVERY_CORE`
- Sheet execution composes Sheet Testcase Execution + Sanity + Impacted Regression + `DISCOVERY_CORE`; add Original Retest and Plane actions only for a linked ticket or previous failure
- RETEST_PLUS includes Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, and UI/UX
- General app exploration uses `APP_BASELINE_DISCOVERY` and writes `qa-knowledge/app-business-guide.md` with a `coverage_map`; ticket retest reads it but does not repeat the full baseline
- PASS moves to `Done`, FAILED moves to `In Progress`, BLOCKED keeps its state, and a new bug starts in `Todo`
- Drive private CRUD uses `google-drive-qa` and the configured Drive MCP, followed by read-back verification
- Testcase generation uses `testcase-template` and its generator without inventing columns
- Business document analysis uses `doc-to-md` first when needed, then `business-analysis`; review all 18 areas and generate matching XMind, Q&A Markdown, and Q&A Excel from one JSON source
- Authorized pentest work uses `pentest-run`; create `.pentest/engagement.md`, run its doctor and resolve scope, authorization, exclusions and rate limits before any network request
- GitHub repository API or Actions work uses `github-mcp-qa`; keep Git SSH separate from MCP OAuth/PAT and verify account, repository, and branch before mutation
- Chrome DevTools or k6 MCP setup uses `performance-qa`; Postman MCP uses `api-contract-qa`; database read-only MCP uses `data-quality-qa`
- A skill file does not prove an MCP is configured, authenticated, loaded, or permitted; run the canonical doctor and report the exact failing layer
- Treat scanner alerts as `Candidate` until deterministic reproduction and a control comparison confirm them; request approval immediately before Level 2 or Level 3 actions
- Never enable `/yolo` outside an explicitly authorized isolated lab
- API testcase mode is opt-in only when the user explicitly asks to write API testcases or testcases for an endpoint, OpenAPI/Swagger, Postman collection, or curl request; merely mentioning an API artifact does not switch modes
- For API testcase files, run `testcase-template/scripts/import-api-spec.py` first and do not generate Excel while `review_required` is non-empty
- Testcase generation must write the complete same-basename Markdown before Excel; future agents read Markdown first
- Browser QA runs `qa-run/scripts/helpers/context-builder.mjs` for the exact feature scope and requires a `READY` Business Execution Brief before normal browser action; `NEEDS_DISCOVERY` permits scoped discovery only and `BLOCKED` must stop on the named missing fields
- Copy Target, Role/Data, Original flow, Expected and Impact area from the READY brief; never replace missing business logic with a generic flow
- After every run, rewrite and validate matching knowledge with `scripts/writers/write-business-guide.mjs`
- Plane comments, testcase prose, and human-readable Drive CRUD content have no terminal `.` and no emoji/icon
- Never guess a workspace, target ID, expected result, permission, or successful mutation
