<!-- Compact Gemini/Antigravity host router. Shared policy is in AGENTS.md. -->

# QA-skill — Gemini/Antigravity router

Read `AGENTS.md` for the shared cross-model contract, then run the canonical router for high-frequency requests:

```text
node scripts/core-skill-router.mjs --text "<request>"
```

## Cross-model deterministic mode

Scan the full user message for URLs, IDs, filenames, extensions and verbs. Read the selected `SKILL.md` completely, load only its mode-specific references, and start the canonical doctor/read-only action immediately

## Plane inline evidence bắt buộc cho mọi model

After `integration/plane/SKILL.md`, read `integration/plane/QUICK_REF.md`. For image Description/Comment work use `browser-inline-evidence.mjs`, exact `{{PLANE_DESCRIPTION_IMAGE_N}}` / `{{PLANE_COMMENT_IMAGE_N}}` placeholders, dry-run before `--apply`, and read back IDs, rendered previews, state, `attachments_count: 0`, empty `issue_attachment_requests` and no placeholders. Never use `Attach`, `/issue-attachments/` or a credential-copy fallback

## URL/artifact-first dispatch

- Chỉ có Plane URL hoặc ticket ID → `integration-plane` doctor/read
- Chỉ có Drive/Docs/Sheets/Slides URL hoặc ID → `integration-google-drive` resolve/read
- Generic browser task → `dynamic-web-exploratory` FAST; không cần business brief
- Deterministic Sheet/testcase chuyển sang `dynamic-web-automation`; literal: deterministic Sheet/testcase chuyển sang `dynamic-web-automation`
- Retest/verify → Plane read → exploratory RETEST_PLUS → Plane read-back/comment/state

A bare link authorizes only exact read-only inspection. A mutation requires an execution contract and target validation. link đứng một mình không cấp quyền write

Use the matched integration contract when applicable: `integration/google-drive/SKILL.md`, `integration/plane/SKILL.md`, `static-testing/requirements-analysis/SKILL.md` and `dynamic-testing/security-pentest/SKILL.md`. Distinguish `mcp_not_configured` from auth/runtime failure; use Chrome DevTools MCP and Postman MCP contracts. Pentest requires `.pentest/engagement.md`

## Host boundary and verdicts

Antigravity/Gemini is the host model, not the browser. Use Playwright runtime/MCP only; never Gemini-in-Chrome or `antigravity-native`. Keep network, console and page errors in the same browser session as the UI action. If Playwright is unavailable, return `UNTEST` and report the exact runtime layer

Use `PASS`, `FAILED`, `N/A` or `UNTEST` only. `PASS` requires the skill's evidence contract; do not infer missing business logic, role, data, authority or oracle

`DISCOVERY_CORE` = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX. `RETEST_PLUS` is the retest stack. Deterministic Sheet execution = unified POM BUILD_AND_RUN. Contract literals: PASS → `Done`; FAILED → `In Progress`; BLOCKED → giữ nguyên trạng thái; new bug → `Todo`. `dynamic-performance` là public skill duy nhất cho performance

`AGENTS.md`, `config/core-routing-contract.json` and the selected skill remain the sources of truth. Validate router changes with `node scripts/core-skill-router.mjs --self-test`
