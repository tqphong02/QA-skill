# QA Run — Process Guide (Steps 1–5)

> Read this file when: executing any QA run that requires understanding the step-by-step process, MCP Playwright commands, speed optimization patterns, or UI/UX audit workflow.

## Step 1 — Understand context first (Principle #1)

"Smart" = **no blind clicking**. AI must read & understand logic first, then poke. MANDATORY order:

### Step 0 — Read saved business guides
- Read [KNOWLEDGE_HANDOFF.md](KNOWLEDGE_HANDOFF.md)
- Read `qa-knowledge/knowledge-index.json` first if present, then only load the exact shards/guides the index points to
- Reuse still-valid flows, roles/data, routes/APIs, state transitions and reusable assets
- Do not read other features' guides and do not skip verification just because the old guide says PASS

### Step 0.5 — No-doc fallback: generate static checklist from UI (MANDATORY when no spec)

**Trigger**: no spec/AC/doc exists AND this is Exploratory or Ad-hoc mode.

**DO NOT start clicking before completing this step.**

```
1. browser_navigate(<page>)
2. browser_snapshot()  ← read all elements: labels, buttons, inputs, links, modals, dropdowns
3. Classify every element into 2 layers:
   - UI Layer: label text, placeholder, icon, layout hints, empty/error/loading states
   - Functional Layer: buttons (action?), inputs (validate?), links (navigate?), forms (submit flow?)
4. Generate static checklist in this format and save to qa-knowledge/checklists/<slug>-static-checklist.md:
```

```markdown
## Static Checklist — <feature name> — <YYYY-MM-DD>
_Generated from UI observation — no spec available — verify each line during test_

### 1.1. UI Checklist
- [ ] [UI-01] Page title/heading displays correctly: "<observed text>"
- [ ] [UI-02] All input field labels visible and clear
- [ ] [UI-03] Placeholder text is contextually correct
- [ ] [UI-04] CTA buttons are visually prominent
- [ ] [UI-05] No text cut off or overflowing containers
- [ ] [UI-06] Icons/images load without broken state
- [ ] [UI-07] Spacing consistent across sections
- [ ] [UI-08] Responsive: layout intact at narrow viewport
- [ ] [UI-09] Empty state and error state show appropriate messages
- [ ] [UI-10] Loading state handled (spinner/skeleton, not blank screen)
<add UI-specific items observed from snapshot>

### 1.2. Functional Checklist
- [ ] [FN-01] <first button/action> → inferred behavior: <from label>
- [ ] [FN-02] <input field> → validate: required? format? maxlength?
- [ ] [FN-03] <dropdown/select> → options correct, selection changes what?
- [ ] [FN-04] Form submit → success → shows what? failure → error shown where?
- [ ] [FN-05] Modal/popup trigger → opens correct content, closeable?
- [ ] [FN-06] Navigation links → redirect to correct page?
- [ ] [FN-07] Filter/search → results change correctly?
- [ ] [FN-08] Delete/remove → confirmation dialog? removes correct record?
- [ ] [FN-09] Permission: is this action restricted by role?
- [ ] [FN-10] Data persistence: data survives page reload after action?
<add Functional items inferred from observed UI elements>
```

```
5. Run Exploratory/Ad-hoc FOLLOWING this checklist — test each line, mark [x] PASS or [ ] FAIL + evidence path
6. After test session: merge checklist findings into guide-update.json (gate 11 in SKILL.md)
```

> **Why mandatory**: Generating checklist from UI BEFORE clicking gives the AI a structured test map instead of random clicks. This is Static Testing applied to no-doc workflows — technique §13 in TESTING-TECHNIQUES.md.



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
One line: *"Khám phá <feature> tìm lỗi về <rủi ro>; account <role>; ~<thời gian>."*
- A good charter clearly states the **risk** (not just "testing for fun")

### Step D — Goal-oriented UI driving (via MCP Playwright)
- Happy path -> snapshot every step -> verify state changes correctly
- **Purposeful deviations** at each step: try invalid / boundary / concurrent inputs
- Note exposed console/HTTP errors (`browser_console_messages`, `browser_network_requests`)

## Step 2 — Drive UI via MCP Playwright (Principle #2)

For the full MCP Playwright tool reference, speed optimization patterns and screenshot evidence rules, read [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md).

Core rule: use MCP for interactive branches not yet understood; use CLI scripts for clear, repetitive flows.

## Step 3 — Speed & Intelligence Optimization

See [MCP-CHEATSHEET.md](MCP-CHEATSHEET.md) for the complete speed pattern table and intelligence checklist.

Key rules:
- Scope snapshot — never snapshot full page when only a sub-section is needed
- Cross-verify: DOM + network + console ≥ 2 sources before concluding
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
1. Read `qa-knowledge/knowledge-index.json` first; only if absent, use `app-flow-map.json` or `app-business-guide.md` as fallback.
2. **Auto-generate Markdown Checklist for page/feature**:
   - Run `node scripts/generate-checklist.mjs --path /feature-path --feature "feature-name"`
   - Output: `qa-knowledge/checklists/<feature-slug>-checklist.md`
   - Script automatically scans 100% of items, buttons, input fields, tables, modals on screen and generates a ready-to-test checklist.
3. Determine feature type to test (Form? Table? Modal? Auth? CRUD? Async? File?) from [ATTACK-TAXONOMY.md](ATTACK-TAXONOMY.md) — select 3-5 priority attack vectors.
4. For Form/Auth: run `attack-surface.mjs` to auto-inject mutations before manual clicking.
5. For UI/UX: run `visual-audit.mjs` first — read JSON + view real image.
6. AI goes through each line in the generated `<feature-slug>-checklist.md` file, tests and marks `[x]` PASS or `[ ]` FAIL with a brief reason.
