# QA Run — Intelligence Boost for Fast/Small-Context Models

> Read this file when: using Gemini Flash, GPT-4o-mini, or any fast model where reasoning depth is limited. Also read when the model produces shallow verdicts, hallucinates PASS, or misses obvious bugs.

## Why fast models fail at QA

Fast models skip implicit reasoning steps that large models do automatically:
- They click → see no red text → conclude PASS (wrong)
- They read 1 AC → test 1 scenario → call it done (incomplete)
- They trust DOM text without checking network (blind trust)
- They report "works fine" without capturing evidence (no proof)
- They mix bug from different root causes into one verdict (wrong scope)

This file provides **explicit micro-protocols** to compensate.

---

## Protocol A — Mandatory observation after EVERY action

After each `browser_click`, `browser_fill_form`, `browser_navigate` — run this checklist BEFORE moving on:

```
□ 1. DOM state changed? (browser_snapshot — look for: success banner, error message, modal open/close, redirect, spinner gone)
□ 2. URL changed? (expected or unexpected redirect?)
□ 3. Network call fired? (browser_network_requests — check: method, URL, status code, response body keyword)
□ 4. Console error? (browser_console_messages — look for: TypeError, 4xx, 5xx, uncaught exception)
□ 5. Data persisted? (if mutation: re-read the record via API or navigate back and verify it still shows)
```

**Rule**: Do NOT record a verdict until all 5 points have an answer. If any point is "unknown" → explicitly state "unverified" and investigate.

---

## Protocol B — Per-feature-type attack vectors

Pick the matching feature type and run ALL attack vectors in that row before concluding:

### Form / Auth
```
□ Happy path with valid data → should succeed
□ Empty required field → should block submit + show inline error message at correct field
□ Invalid format (email missing @, phone with letters) → should show format error
□ Boundary: min length (e.g. password = 7 chars) → should reject; min+1 = 8 chars → should accept
□ Boundary: max length (paste 300 chars into a 255-char field) → truncated or rejected?
□ Special chars: <script>alert(1)</script> in text field → stored as literal or executed?
□ Whitespace only → treated as empty or accepted?
□ Concurrent submit: double-click submit button rapidly → 1 request or 2?
□ Session: submit after token expires → shows auth error, not silent fail
□ Network slow: throttle then submit → loading state shows, no duplicate request on retry
```

### Table / List
```
□ Empty state: no data → shows empty state message (not blank page or "0 results" with broken layout)
□ Single record: layout doesn't break (no phantom columns, no overflow)
□ Large dataset (100+ rows): pagination works, page size selector works, no duplicate rows
□ Sort: click column header → data reorders; click again → reverses order
□ Filter: apply filter → only matching rows show; clear filter → all rows return
□ Search: partial match works; clear search → all rows return; empty search → no crash
□ Action on row: edit/delete → opens correct record (not always first record)
□ Bulk action: select multiple → action applies to all selected (not just last clicked)
□ Scroll: horizontal overflow handled (no cut-off column); sticky header stays on scroll
```

### Modal / Dialog
```
□ Open: trigger → modal appears with correct title and content
□ Close via X button → modal closes, background state preserved
□ Close via Esc key → same as X button
□ Close via backdrop click → closes (or stays, per spec — verify behavior)
□ Submit inside modal → form validates, sends request, modal closes on success
□ Submit error inside modal → modal stays open, error shown inline
□ Cannot scroll background while modal open (body scroll lock)
□ z-index: no button/element behind modal is clickable
□ Nested modal: open second modal → stacks correctly; close second → first still open
```

### CRUD Operations
```
□ Create: fill form → submit → record appears in list with correct data
□ Read: navigate to detail → all fields show correct values (compare with list row)
□ Update: edit one field → save → list and detail both show new value (not cached old value)
□ Delete: confirm dialog appears before deletion; record disappears from list after confirm
□ Delete cancel: cancel in confirm dialog → record still exists
□ Create duplicate: submit same unique key twice → system rejects second (not silent overwrite)
□ Ownership: userA creates record → userB cannot edit/delete it (if role-separated)
```

### Async / Real-time
```
□ Loading state: action triggered → spinner/skeleton shown immediately; not blank
□ Success state: async completes → success indicator appears (toast, badge, status change)
□ Error state: async fails → error message shown; not blank or frozen
□ Retry: after error, can user retry without refreshing page?
□ Concurrent: two users update same record simultaneously → last-write-wins or conflict shown?
□ Stale data: data updated elsewhere → page reflects update (via polling/websocket or on next navigate)
```

### File Upload / Download
```
□ Valid file: upload → progress shown → success message → file appears in list
□ Invalid type: upload .exe when only .pdf accepted → rejected with error message
□ Oversized: upload file > max size → rejected with size limit message
□ Empty file: upload 0-byte file → rejected or handled gracefully
□ Download: click download → file received with correct name and content
□ Concurrent upload: upload 2 files simultaneously → both complete without conflict
```

---

## Protocol C — Anti-hallucination guards (verify before concluding)

Flash models are prone to saying "it works" without actual proof. Before marking any AC as PASS:

**Required evidence for PASS:**
- [ ] Screenshot showing the success state (not just the action step)
- [ ] OR network request with status 2xx and meaningful response body
- [ ] AND no console error after the action

**Required evidence for FAILED:**
- [ ] Screenshot showing the error/wrong behavior
- [ ] Exact observed text (copy-paste from DOM or screenshot OCR)
- [ ] Comparison: what was expected vs what actually appeared

**Anti-patterns that are NOT evidence:**
- ❌ "I clicked the button and it seemed to work" — no screenshot/network
- ❌ "No error appeared" — absence of error ≠ presence of success
- ❌ "The page loaded" — page loading ≠ correct data rendered
- ❌ "The API returned data" — API success ≠ UI displayed it correctly

---

## Protocol D — Micro decision tree after each test step

```
After browser action →

Did DOM show expected change?
├── YES → Check network (did it call the right API with right params?)
│   ├── YES → Check console (any error logged silently?)
│   │   ├── NO error → Mark AC as PASS with screenshot + network evidence
│   │   └── YES error → Investigate: is error cosmetic or functional?
│   └── NO network call → Suspicious: maybe action was handled client-only; verify persistence
└── NO expected change →
    ├── Is there an error message? → Read it exactly → FAILED with evidence
    ├── Is there a loading spinner stuck? → Wait 3s then snapshot again → possible async bug
    └── Nothing changed at all? → Check if event listener fired (browser_evaluate) → possible JS error
```

---

## Protocol E — Scope expansion after happy path

Flash models stop after happy path. This is wrong. After happy path PASSES, always run:

**Tier 1 (always):**
- 1 negative case: wrong input or unauthorized role → system must reject cleanly
- 1 boundary case: empty / max length / zero value
- 1 UI check: overflow, truncation, mobile viewport

**Tier 2 (for any mutation — create/edit/delete):**
- Re-read the affected record after mutation → data matches what was submitted
- Check adjacent list/table → record count changed correctly
- Check related entity → no orphaned data

**Tier 3 (for bug retest specifically):**
- Run exact original repro steps from the bug report
- Then run 1 adjacent flow that was likely affected by the fix

---

## Protocol F — Context loading strategy for small-context models

Flash has smaller context window. Load in this strict priority order — stop when context is sufficient:

```
1. SKILL.md router + hard gates (already loaded — DO NOT reload)
2. knowledge-index.json → identify relevant shard keys
3. Only the shard(s) matching the feature under test (NOT the full app guide)
4. The ticket AC / spec (only the relevant section)
5. Previous FINDINGS.md entries for the same feature (skip if not retest)

NEVER load simultaneously:
- Full app-business-guide.md + feature shard (pick one)
- All screenshots from evidence/ (load only the specific evidence file)
- Multiple reference .md files at once (load only what the router says for current task)
```

---

## Protocol G — Bug severity classification (decide before logging)

Fast models often skip severity or assign wrong severity. Use this decision tree:

```
Does the bug block ALL users from completing ANY core task?
├── YES → Critical (production stopper)
└── NO →
    Does it block the current user from completing the tested flow?
    ├── YES → High
    └── NO →
        Does it degrade UX significantly or cause wrong data?
        ├── YES → Medium
        └── NO → Low (cosmetic, minor display issue)
```

**Examples:**
- Login always fails → Critical
- Specific filter crashes for admin only → High
- Amount truncated in table column → Medium
- Button color slightly off from Figma → Low

---

## Protocol H — When to stop and ask vs continue

Flash models tend to either guess blindly or ask too many questions. Use this rule:

**Stop and ask** when:
- The expected result is not specified in the ticket/spec and cannot be inferred from UI behavior
- The repro step requires data that does not exist in the test environment
- The fix requires understanding business rules not visible in UI or spec

**Continue without asking** when:
- Expected result is clear from the AC
- A reasonable default behavior exists (e.g. empty field → required field error)
- The test environment has sufficient data to proceed

---

## Protocol I — Knowledge memory cycle (READ before, WRITE after)

Flash models often skip the knowledge cycle entirely, causing the AI to re-explore the same feature every session. This wastes tokens and loses accumulated learning.

### Before test — READ in this exact order

```
Step 1: Run the deterministic builder:
  node scripts/helpers/context-builder.mjs --intent <intent> --scope <feature-slug>
  Add --target, --expected, --role and --impact when the ticket/testcase supplies them

Step 2: Read qa-knowledge/context/business-execution-brief.json:
  READY → use its execution_contract exactly
  NEEDS_DISCOVERY → run scoped discovery, write knowledge, rebuild
  BLOCKED → report missing_required and do not open the browser for normal execution

Step 3: Copy Target, Role/Data, Original flow, Expected, Impact area and Stop condition
  from the READY brief. Never replace a missing field with a generic five-step flow.
```

### After every run — WRITE in this exact order

```
Step 1: Collect the facts you confirmed during this run:
  - Which flows you ran and what the result was
  - Which business rules you verified (mark: verified/disproved/unresolved)
  - Any new behavior observed that was not in the old guide
  - New bugs found (log to FINDINGS.md with severity)
  - Reusable assets discovered (test accounts, locators, API shortcuts)

Step 2: Build the guide-update.json — minimum required fields:
```

```json
{
  "knowledge_index": "qa-knowledge/knowledge-index.json",
  "guide_kind": "feature",
  "project": "<project name>",
  "feature": "<feature name>",
  "slug": "<feature-slug>",
  "environment": "<UAT|staging|prod>",
  "base_url": "<base URL of feature>",
  "last_verified": "<YYYY-MM-DD today>",
  "confidence": "verified",
  "previous_guide": "qa-knowledge/<feature-slug>-business-guide.md",
  "merge_confirmed": true,
  "happy_flow": [
    { "step": 1, "action": "<what user does>", "result": "<what system does>", "status": "verified" }
  ],
  "business_rules": [
    { "rule": "<rule text>", "status": "verified", "source": "runtime observation" }
  ],
  "known_issues": [],
  "reusable_assets": [
    { "type": "account", "value": "<email>", "role": "<role>", "env": "<env>" }
  ],
  "latest_run": {
    "scope": "<retest|sanity|exploratory>",
    "verdict": "<PASS|FAILED|PARTIAL>",
    "notes": ["<key finding 1>", "<key finding 2>"]
  }
}
```

```
Step 3: Run write + validate:
  node scripts/writers/write-business-guide.mjs guide-update.json <project-root>
  node scripts/writers/write-business-guide.mjs --check <project-root>/qa-knowledge/<feature-slug>-business-guide.md

Step 4: Confirm: read back the first 20 lines of the written guide.
  If the last_verified date and latest_run verdict are correct → DONE
  If script errors → check that previous_guide path is correct and merge_confirmed is true
```

### Common memory mistakes by Flash models

| Mistake | Consequence | Fix |
|---|---|---|
| Skips reading guide → navigates to wrong URL | Wrong test environment or wrong feature | Always check routes from guide first |
| Skips reading guide → uses wrong account | Permission denied or wrong data scope | Always check role from guide first |
| Skips writing guide → next run re-explores | Double token cost, loses learning | Gate 11 is mandatory, not optional |
| Overwrites guide without `merge_confirmed: true` | Loses old business rules | Script will reject; set merge_confirmed |
| Writes "seems to work" in notes | Useless guide for next session | Write specific: route, observed state, rule |
