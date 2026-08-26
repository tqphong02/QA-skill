# QA Run — Process Guide (Steps 1–5)

> Read this file when: executing any QA run that requires understanding the step-by-step process, MCP Playwright commands, speed optimization patterns, or UI/UX audit workflow.

## Shared composition

`DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX`

`BROWSER_OBSERVABILITY = Same-session Network + Console + Page Error correlation`

- `UI Flow Discovery` starts from the live page and derives the visible flow, controls, states, validation and feedback; optional `Scoped Business Discovery` enriches it with existing knowledge and writes only confirmed deltas after the run
- `RETEST_PLUS` and `SHEET_EXECUTION_PLUS` both reuse `DISCOVERY_CORE`; do not rerun the same discovery separately for each layer
- Full-app Business Discovery is reserved for `APP_BASELINE_DISCOVERY`; ticket and Sheet runs use the affected feature and dependency scope
- Apply `BROWSER_OBSERVABILITY` to every live browser stack without adding it to or changing `DISCOVERY_CORE`

## Step 1 — Understand context first (Principle #1)

"Smart" = **no blind clicking**. AI must observe and understand the live UI flow first, then poke; existing logic documents are optional context. MANDATORY order:

### Step 0 — Read optional business guides
- Read [KNOWLEDGE_HANDOFF.md](KNOWLEDGE_HANDOFF.md)
- Read `qa-knowledge/knowledge-index.json` first if present, then only load the exact shards/guides the index points to
- Reuse still-valid flows, roles/data, routes/APIs, state transitions and reusable assets
- Do not read other features' guides and do not skip verification just because the old guide says PASS
- For `EXPLORATORY_ADHOC`, guides and documents are optional. If they are absent, continue from the live UI and derive the visible flow, states and oracles during the same browser session

### Step 0.5 — Recover optional intelligence before UI enumeration

When saved knowledge, requirements or source is available, run `prepare-test-intelligence.mjs` as defined in [TEST-INTELLIGENCE.md](TEST-INTELLIGENCE.md). When source is available, pass `--repo`; the resolver refreshes stale source-derived knowledge and merges it with the exact feature knowledge. Do not run or require this preparation just to start UI-first `EXPLORATORY_ADHOC` without those inputs.

Execute the ranked `exploratory_charters` from the resulting execution card when one exists. Otherwise create a UI-flow charter from the first browser observation. Use the full brief only for explicit scoped escalation. Use the first UI snapshot to:

- verify known entry points and actions
- add UI-only states or controls missing from knowledge/source
- discover the initial route, visible controls, form constraints, feedback and next-step flow when no knowledge/source exists
- create a scoped checklist for the selected charter

Do not generate a generic “click every element” checklist before checking source and knowledge. DOM order is not business-risk priority.

For `EXPLORATORY_BROWSER_QA` (`EXPLORATORY_ADHOC` alias) and `APP_BASELINE_DISCOVERY`, read [EXPLORATORY-AGENT-LOOP.md](EXPLORATORY-AGENT-LOOP.md), start `scripts/helpers/exploratory-runner.mjs` with the same run ID as the manifest and run the bounded observe → plan → act → verify → recover → re-rank loop. The loop may autonomously handle new tabs, dialogs, frames, shadow DOM, loading transitions, downloads, uploads and stale targets, but every branch must retain a charter intent, safety decision, oracle and same-session evidence

Before the first browser action, create `rule-plan`, then use `rule-probe` and `coverage` as ledger boundaries. Read [BUSINESS-RULE-DISCOVERY.md](BUSINESS-RULE-DISCOVERY.md) to actively test uniqueness, authorization, side effects and ambiguous oracles. A UI-only observation can select a probe but cannot close it as a verified backend rule. Finish `PASS` only when the declared scope is `COMPLETE_FOR_SCOPE` and every required hidden-rule probe is runtime-verified or explicitly not applicable



### Step A — Read requirement / spec / AC (IF present)
- Spec/PRD/ticket/AC (file local, URL, or user paste)
- Extract into a list of requirements with IDs: `{ "id":"AC1", "text":"..." }`
- If no document is provided -> continue based on the existing UI; ask only when the user requests a document-specific or expected-result comparison that the UI cannot establish
- Details for fetching from Plane: see `scripts/fetch-plane-issue.sh`

### Step B — Extract the "logic map" before testing
1. **Happy path**: step 1 -> 2 -> 3 -> … -> result
2. **State / role**: who can do what? (admin/user/guest; pending/active/closed)
3. **Inputs & constraints**: what data is valid, ranges, formats
4. **Side-effects**: where does this operation write? (DB, API, queue, email, webhook)
5. **Suspicious edge cases**: concurrency, boundary, timeout, other roles
6. **3rd party integration**: payment, email, calendar, notification, search, AI

### Step C — Form a charter (purposeful exploratory goal)
Use the ranked charters from `business-execution-card.json` when available. Otherwise create a UI-derived charter that retains the visible target, action intent, UI oracle, safety rule and evidence required. If the card contains deferred or truncated items, retrieve only the referenced full brief/source. Add an ad-hoc branch when a runtime observation changes the visible flow or risk model.

### Step D — Goal-oriented UI driving (via MCP Playwright)
- Happy path -> snapshot every step -> verify state changes correctly
- **Purposeful deviations** at each step: try invalid / boundary / concurrent inputs
- Start same-session browser observation before the first critical action
- After every critical transition, inspect matching requests, failed/contract-relevant response bodies and console/page errors
- For exploratory/ad-hoc work, choose one action at a time with the [agent loop](EXPLORATORY-AGENT-LOOP.md), record it through `exploratory-runner.mjs action`, record the applicable hidden-rule probe after its evidence is collected and re-observe after recovery before re-ranking the next action from the changed risk model
- Read [BROWSER-OBSERVABILITY.md](BROWSER-OBSERVABILITY.md) for tool routing, correlation, redaction and classification

## Step 2 — Drive UI via MCP Playwright (Principle #2)

For the full MCP Playwright tool reference, speed optimization patterns and screenshot evidence rules, read [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md).

Core rule: use MCP for interactive branches not yet understood; use CLI scripts for clear, repetitive flows.

For `EXPLORATORY_BROWSER_QA` (`EXPLORATORY_ADHOC` alias), use the agentic interaction loop rather than a fixed click script: visible-content + accessibility observation first, UI-derived task decomposition, previous-goal evaluation from deterministic state delta, compact memory, one bounded next action, adaptive wait, same-session verification, independent success-signal judge and evidence capture. Read [AGENTIC-TASK-PLANNING.md](AGENTIC-TASK-PLANNING.md) when the action path is not deterministic. When MCP is unavailable, use the first-party native `playwright-runtime` daemon described in [NATIVE-BROWSER-RUNTIME.md](NATIVE-BROWSER-RUNTIME.md). Record the decision/action/task-judge/charter result through the runner so loop, budget, selector and final evidence gates are enforced. Coordinate recovery or XPath is allowed only as a last resort and is never reusable POM evidence by itself

Browser observability rule: use the network and console tools belonging to the active browser session. Playwright MCP UI actions pair with Playwright MCP network tools. Chrome DevTools evidence is valid only for a page driven by or attached to Chrome DevTools. Never cross-associate isolated sessions.

### Sheet testcase visual evidence gate

For every Sheet testcase with verdict `Pass` or `Fail`:

1. Capture at least one screenshot after the final assertion, or retain a video that visibly includes the tested action and final state
2. Use a testcase-specific filename under the assigned `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/`, for example `<testcase-id>-pass.png` or `<testcase-id>-fail.webm`; keep plan/result metadata under `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/`
3. Return the media path or an `image:`/`video:` remote URL in the worker result `evidence` field
4. JSON, trace, console and network files may be additional evidence but cannot replace the required screenshot/video
5. Do not reuse a pre-action screenshot as final-state evidence and do not mark `Pass`/`Fail` if the visual artifact is missing
6. The executor rejects local media outside the testcase's assigned function/date directory

### Structured testcase execution

When a testcase row contains `[S01]`, `[S02]` markers, use the shared contract in `../../support-testcase-authoring/references/execution-contract.md`

1. Confirm the `entry` route, role, starting state and data before `S01`
2. Execute one step at a time in the declared order; do not merge two marked steps into one action
3. After each step, verify the matching `[S##]` assertion in H and the declared `wait_for` signal
4. After the last action, verify every `[OUTCOME]` assertion and then perform `[CLEANUP]` in the same session when present
5. If the semantic target is not uniquely identifiable in the live DOM, pause the testcase as `UNTEST` with the missing target; do not invent an XPath or silently click a nearby element
6. Correlate every critical transition with the same-session network, console and page-error observer required by the run

Rows without markers are legacy text-only cases. They may be executed only after scoped discovery resolves their missing target, wait signal and oracle; otherwise they are not evidence for PASS

## Step 3 — Speed & Intelligence Optimization

See [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md) for the complete speed pattern table and intelligence checklist.

Key rules:
- Scope snapshot — never snapshot full page when only a sub-section is needed
- Cross-verify: DOM + network + console ≥ 2 sources before concluding
- Inspect response bodies selectively for failures, persistence/calculation contracts and GraphQL envelopes; do not retain unrestricted bodies
- Read the matching feature business guide before each run when it exists; update the guide after every full QA run

## Step 4 — UI/UX & Interaction testing

During retest/sanity: always scatter 2-3 UX checks in the fix area (because functional fixes sometimes cause UX issues).

**Correct UI/UX workflow:**
1. **Run `visual-audit.mjs` first** — script automatically measures overflow, clipping, touch targets, loading states, empty states, z-index conflicts on both desktop and mobile
2. **Read JSON findings** — AI knows exactly which element has issues without full page snapshot
3. **Embed 2 screenshots** (desktop + mobile) into context — AI vision analyzes real images instead of guessing from DOM text
4. **Check AI Vision Checklist** in JSON output — 8 specific items for AI to look at in the image
5. **If screenshot is the main evidence** — run OmniParser/`visual-evidence-router.mjs` first to get bounding box + label + interactable state

```bash
cd <project-root>
QA_RUN_SKILL_DIR=/path/to/dynamic-web-exploratory node /path/to/../scripts/visual-audit.mjs --path /dashboard
# Output: evidence/visual-1440-*.png + evidence/visual-375-*.png + evidence/visual-audit-*.json
```

**Top 4 common UI bugs** (see [UI-BUG-CATALOG.md](UI-BUG-CATALOG.md)):
1. Action safety (delete without confirm)
2. Overlap-z-index (modal/tooltip obscures important button)
3. Overflow-truncation (text cuts off amount/name/ID)
4. State-loading (loading state missing, fake "0")

**3 measurable bug types** (see `browser_evaluate`):
- Unresponsive click: 250ms latency / double-fire / pointer-events:none
- Lag/Jitter: long-task > 100ms
- Spam button: request > 1 in a single click

**When image files exist in evidence:**
- Use screenshot as the direct source of truth for UI state, do not force convert to text before analyzing
- If the image is a flow/UI screenshot, prioritize `visual-audit.mjs`, `visual-evidence-router.mjs` or an image viewer tool to ground elements, labels and layout
- Only convert image to text when needing OCR for image content, e.g. text on banner, toast, modal, QR, or when DOM/network is not enough to verify

## Step 5 — Technique Selection (12 techniques)

See [TESTING-TECHNIQUES.md](../TESTING-TECHNIQUES.md) for details + coverage matrix.

12 techniques: Exploratory · Error Guessing · Ad-hoc · Monkey · CRUD · Happy/Negative · Boundary/Validation · Workflow · UI/UX · Compatibility · Session-based · API Inspection (+ Risk-based/Sanity/Regression).

**Hard gate for Exploratory/Ad-hoc (MANDATORY):**
1. Run `prepare-test-intelligence.mjs`, passing `--repo` when optional source is available; skip it for UI-first exploratory runs with no source, requirements or knowledge
2. Read the ranked risks, charters, oracles, provenance and knowledge health
3. Execute all high-priority charters first or mark an exact defer reason; unresolved execution is user-facing `UNTEST`
4. Generate a scoped Markdown checklist only for the active charter when UI enumeration adds coverage; never use checklist completion as the verdict
5. Select attack vectors from [ATTACK-TAXONOMY.md](ATTACK-TAXONOMY.md) only when they match the charter risk and feature type
6. For Form/Auth, use `attack-surface.mjs` only for authorized, risk-relevant mutations
7. For UI/UX, run `visual-audit.mjs`, read JSON and inspect real screenshots
8. Re-rank or branch charters when runtime evidence contradicts source, knowledge or the current oracle
9. Keep first-attempt evidence when a safe action is retried; classify retry-pass as `recovered`/`flaky`, not a clean PASS
10. Stop when high-priority charters are decided, a required oracle/observer/data/authority is missing, the bounded budget is exhausted or an unsafe side effect needs user approval; use final result `UNTEST` for an unexecuted scope
