# GitHub Copilot instructions for QA-skill

Read [`../AGENTS.md`](../AGENTS.md) as the canonical router and cross-model execution contract before acting on a QA request.

Hard requirements:

- Load the exact matched `SKILL.md` before searching project files
- Plane ticket retest order is `plane-qa doctor/read → qa-run RETEST_PLUS → plane-qa comment/state`
- RETEST_PLUS includes Retest, Sanity, Impacted regression, Exploratory, Ad-hoc, and UI/UX
- PASS moves to `Done`, FAILED moves to `In Progress`, BLOCKED keeps its state, and a new bug starts in `Todo`
- Drive private CRUD uses `google-drive-qa` and the configured Drive MCP, followed by read-back verification
- Testcase generation uses `testcase-template` and its generator without inventing columns
- Plane comments, testcase prose, and human-readable Drive CRUD content have no terminal `.` and no emoji/icon
- Never guess a workspace, target ID, expected result, permission, or successful mutation
