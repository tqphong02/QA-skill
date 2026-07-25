# QA Run — RETEST_PLUS Workflow

> Read this file when: user provides a ticket URL or requests a retest. This is the most common case: "Dev says fix is done, please retest this ticket."

RETEST_PLUS uses app/feature guides to reduce redundant exploration and does not auto-run full-app baselines. Only expand discovery when the ticket hits an area lacking knowledge or with a stale guide.

## Step 0 — Confirm scope
- If user explicitly states "retest #X" / "verify fix #X" → straight to Step 1
- If only saying "test #X" → ask 1 question: *"Retest fix #X or explore feature #X to find new bugs?"*

## Step 1 — Fetch ticket (DO NOT ask again)
- Parse Plane URL -> call API -> extract AC, steps, expected, dev notes
- Error 401/404/403 -> tell user to check API key + URL

## Step 1.5 — Load business context before browser action
- Read [KNOWLEDGE_HANDOFF.md](KNOWLEDGE_HANDOFF.md) first to know the knowledge merge protocol
- Read `qa-knowledge/knowledge-index.json` then only read the exact shard/guide for the ticket scope
- If guide is missing or stale, only open discovery enough to create/refresh feature guide for the ticket scope, do not rescan full app
- Extract test contract including role, state transition, validation, side effect, API/network and impacted dependency before the first click
- If the business flow cannot be described in 1-2 clear sentences, stop and add context before verifying

## Step 2 — Extract AC
- Main AC (happy path): "When user does X, system must do Y" -> case MUST PASS
- Secondary AC (edge case): empty input, concurrent, different role -> must also test
- Repro steps of original bug (if bug ticket) -> run exact steps again
- Adjacent area (AI infer): what flow is the fix in? -> poke to see if it breaks
- Interpret AC into testable business rules, do not stick to ambiguous wording in ticket if context is missing

## Step 3 — Verify each AC
For each AC:
1. Setup conditions (login correct role, clear localStorage, **prepare test data**)
2. Execute exact repro steps (DO NOT arbitrarily add weird steps)
3. Snapshot after each step -> compare with "Expected" in AC
4. Verify network response too (if AC involves persist/calculation)
5. Mark PASS/FAILED for each AC — DO NOT lump into "overall OK"

## Step 4 — RETEST_PLUS coverage (MANDATORY)
- Retest exact original flow
- Sanity main happy path of module
- Impacted regression by fix area and dependency
- Exploratory includes boundary, negative, alternate sequence, refresh/retry
- Ad-hoc includes adjacent controls, cancel/reopen, double action, appropriate navigation/session
- UI/UX includes overlap, clipping, overflow, modal/dropdown/popup, viewport, loading/error/focus

Adjacent area check in the above layers:
- Click related buttons/tabs/lists -> snapshot -> any new bugs?
- Create 1 record via different flow (e.g. import file instead of form) -> share validation?
- Refresh/back mid-flow -> is state dirty?
- Change user role (e.g. guest views admin page) -> permission leak?
- `browser_console_messages` + `browser_network_requests` at end of session -> any weird warning/error?

## Step 5 — Verdict + report

```
## <✅/❌> #<id> — <tên ngắn> — <PASS/FAILED>
**Requirement source:** <URL ticket fetched>
**Business flow:** <1-2 sentence summary of confirmed flow>
**AC1 (<mô tả>):** PASS  — <1 line evidence>
**AC2 (<mô tả>):** FAILED  — <observed deviation>
**Adjacent:** PASS — <short note>
**Verdict:** PASS (if all main ACs PASS) / FAILED (if >=1 main AC FAILED)
```

- Write `FINDINGS.md` in standard format (`report/REPORT-TEMPLATE.md`)
- Merge confirmed knowledge according to [KNOWLEDGE_HANDOFF.md](KNOWLEDGE_HANDOFF.md); prioritize updating `knowledge-index.json` and shards
- Run `node scripts/write-business-guide.mjs --check <guide.md>` and read guide again before handoff
- If FAILED -> comment evidence and drag original ticket to **In Progress**
- If PASS -> comment evidence and drag original ticket to **Done**
- If BLOCKED -> keep state unchanged
- Bug with different root cause -> open new bug in **Todo**

## State map (invariant)

| Result | Plane State |
|---|---|
| PASS | Done |
| FAILED | In Progress |
| BLOCKED | unchanged |
| New bug | Todo |
