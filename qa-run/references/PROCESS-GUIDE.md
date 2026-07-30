# QA Run — Process Guide (Steps 1–5)

> Read this file when: executing any QA run that requires understanding the step-by-step process, MCP Playwright commands, speed optimization patterns, or UI/UX audit workflow.

## Shared composition

`DISCOVERY_CORE = Scoped Business Discovery + Exploratory + Ad-hoc + UI/UX`

`BROWSER_OBSERVABILITY = Same-session Network + Console + Page Error correlation`

- `Scoped Business Discovery` reads existing knowledge, verifies the current flow/roles/states/rules, fills only missing or stale facts, and writes the confirmed delta after the run
- `RETEST_PLUS` and `SHEET_EXECUTION_PLUS` both reuse `DISCOVERY_CORE`; do not rerun the same discovery separately for each layer
- Full-app Business Discovery is reserved for `APP_BASELINE_DISCOVERY`; ticket and Sheet runs use the affected feature and dependency scope
- Apply `BROWSER_OBSERVABILITY` to every live browser stack without adding it to or changing `DISCOVERY_CORE`

## Step 1 — Understand context first (Principle #1)

"Smart" = **no blind clicking**. AI must read & understand logic first, then poke. MANDATORY order:

### Step 0 — Read saved business guides
- Read [KNOWLEDGE_HANDOFF.md](KNOWLEDGE_HANDOFF.md)
- Read `qa-knowledge/knowledge-index.json` first if present, then only load the exact shards/guides the index points to
- Reuse still-valid flows, roles/data, routes/APIs, state transitions and reusable assets
- Do not read other features' guides and do not skip verification just because the old guide says PASS

### Step 0.5 — Recover business intelligence before UI enumeration

Run `prepare-test-intelligence.mjs` as defined in [TEST-INTELLIGENCE.md](TEST-INTELLIGENCE.md). When source is available, pass `--repo`; the resolver refreshes stale source-derived knowledge and merges it with the exact feature knowledge.

Execute the ranked `exploratory_charters` from the resulting brief. Use the first UI snapshot only to:

- verify known entry points and actions
- add UI-only states or controls missing from knowledge/source
- create a scoped checklist for the selected charter

Do not generate a generic “click every element” checklist before checking source and knowledge. DOM order is not business-risk priority.



### Step A — Read requirement / spec / AC (IF present)
- Spec/PRD/ticket/AC (file local, URL, or user paste)
- Extract into a list of requirements with IDs: `{ "id":"AC1", "text":"..." }`
- If NO document is provided -> **ask the user** to provide one, or agree to test based on the existing UI
- Details for fetching from Plane: see `scripts/fetch-plane-issue.sh`

### Step B — Extract the "logic map" before testing
1. **Happy path**: step 1 -> 2 -> 3 -> … -> result
2. **State / role**: who can do what? (admin/user/guest; pending/active/closed)
3. **Inputs & constraints**: what data is valid, ranges, formats
4. **Side-effects**: where does this operation write? (DB, API, queue, email, webhook)
5. **Suspicious edge cases**: concurrency, boundary, timeout, other roles
6. **3rd party integration**: payment, email, calendar, notification, search, AI

### Step C — Form a charter (purposeful exploratory goal)
Use the ranked charters from `business-execution-brief.json`. Each charter must retain its risk, oracle, source references, target role/data and safety rule. Add an ad-hoc branch only when a runtime observation changes the risk model.

### Step D — Goal-oriented UI driving (via MCP Playwright)
- Happy path -> snapshot every step -> verify state changes correctly
- **Purposeful deviations** at each step: try invalid / boundary / concurrent inputs
- Start same-session browser observation before the first critical action
- After every critical transition, inspect matching requests, failed/contract-relevant response bodies and console/page errors
- Read [BROWSER-OBSERVABILITY.md](BROWSER-OBSERVABILITY.md) for tool routing, correlation, redaction and classification

## Step 2 — Drive UI via MCP Playwright (Principle #2)

For the full MCP Playwright tool reference, speed optimization patterns and screenshot evidence rules, read [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md).

Core rule: use MCP for interactive branches not yet understood; use CLI scripts for clear, repetitive flows.

Browser observability rule: use the network and console tools belonging to the active browser session. Playwright MCP UI actions pair with Playwright MCP network tools. Chrome DevTools evidence is valid only for a page driven by or attached to Chrome DevTools. Never cross-associate isolated sessions.

### Sheet testcase visual evidence gate

For every Sheet testcase with verdict `Pass` or `Fail`:

1. Capture at least one screenshot after the final assertion, or retain a video that visibly includes the tested action and final state
2. Use a testcase-specific filename under the assigned `evidence/sheet/<functional-group>/<YYYY-MM-DD>/<run-id>/worker-<id>/`, for example `<testcase-id>-pass.png` or `<testcase-id>-fail.webm`; keep plan/result metadata under `evidence/sheet/_runs/<YYYY-MM-DD>/<run-id>/`
3. Return the media path or an `image:`/`video:` remote URL in the worker result `evidence` field
4. JSON, trace, console and network files may be additional evidence but cannot replace the required screenshot/video
5. Do not reuse a pre-action screenshot as final-state evidence and do not mark `Pass`/`Fail` if the visual artifact is missing
6. The executor rejects local media outside the testcase's assigned function/date directory

## Step 3 — Speed & Intelligence Optimization

See [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md) for the complete speed pattern table and intelligence checklist.

Key rules:
- Scope snapshot — never snapshot full page when only a sub-section is needed
- Cross-verify: DOM + network + console ≥ 2 sources before concluding
- Inspect response bodies selectively for failures, persistence/calculation contracts and GraphQL envelopes; do not retain unrestricted bodies
- Read matching feature business guide before each run; update guide after every run

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
QA_RUN_SKILL_DIR=/path/to/qa-run node /path/to/qa-run/scripts/visual-audit.mjs --path /dashboard
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
1. Run `prepare-test-intelligence.mjs`, passing `--repo` when source is available
2. Read the ranked risks, charters, oracles, provenance and knowledge health
3. Execute all high-priority charters first or mark an exact blocker/defer reason
4. Generate a scoped Markdown checklist only for the active charter when UI enumeration adds coverage; never use checklist completion as the verdict
5. Select attack vectors from [ATTACK-TAXONOMY.md](ATTACK-TAXONOMY.md) only when they match the charter risk and feature type
6. For Form/Auth, use `attack-surface.mjs` only for authorized, risk-relevant mutations
7. For UI/UX, run `visual-audit.mjs`, read JSON and inspect real screenshots
8. Re-rank or branch charters when runtime evidence contradicts source, knowledge or the current oracle
